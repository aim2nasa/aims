"""
OpenAI API를 사용한 Customer Review Service PDF 파싱
기존 parser.py 코드 기반
"""
import os
import json
import re
import logging
from typing import Dict, Optional
import tempfile

from openai import OpenAI
from PyPDF2 import PdfReader, PdfWriter

from config import settings, get_annual_report_model
from system_logger import send_error_log

logger = logging.getLogger(__name__)

# OpenAI 클라이언트 초기화 (parser.py의 싱글톤 재사용)
from services.parser import get_openai_client, clean_json_output


def extract_cr_pdf_pages(pdf_path: str, start_page: int = 2, end_page: int = 4) -> str:
    """
    Customer Review PDF의 특정 페이지만 추출하여 임시 파일로 저장

    Customer Review는 보통 4페이지 구성:
    - 1페이지: 표지 (감지/메타데이터 추출용, AI 불필요)
    - 2~4페이지: 계약 정보, 납입 원금, 펀드 구성 현황

    Args:
        pdf_path: 원본 PDF 파일 경로
        start_page: 시작 페이지 번호 (1-based, inclusive) - 보통 2
        end_page: 마지막 페이지 번호 (1-based, inclusive) - 보통 4

    Returns:
        str: 추출된 PDF의 임시 파일 경로
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    # start_page~end_page 추출 (0-based index 변환)
    start_idx = start_page - 1  # 1-based → 0-based
    end_idx = min(end_page, len(reader.pages))  # 페이지 수 초과 방지

    for page_num in range(start_idx, end_idx):
        writer.add_page(reader.pages[page_num])

    # 임시 파일 생성
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    temp_path = temp_file.name

    with open(temp_path, 'wb') as output_file:
        writer.write(output_file)

    logger.info(f"📄 Customer Review PDF 추출 완료: {start_page}~{end_page}페이지 → {temp_path}")
    return temp_path


def parse_customer_review(pdf_path: str, end_page: int = 4) -> Dict:
    """
    Customer Review Service PDF를 OpenAI API로 파싱

    Args:
        pdf_path: PDF 파일 경로
        end_page: 마지막 페이지 번호 (보통 4)

    Returns:
        dict: {
            "contract_info": {
                "policy_number": str,           # 증권번호
                "contract_date": "YYYY-MM-DD",  # 계약일자
                "insured_amount": int,          # 보험가입금액 (원)
                "accumulated_amount": int,      # 적립금 (원)
                "investment_return_rate": float,# 투자수익률 (%)
                "surrender_value": int,         # 해지환급금 (원)
                "surrender_rate": float         # 해지환급율 (%)
            },
            "premium_info": {
                "basic_premium": int,           # 기본보험료(A) (원)
                "additional_premium": int,      # 수시추가납(B) (원)
                "regular_additional": int,      # 정기추가납(C) (원)
                "withdrawal": int,              # 중도출금(D) (원)
                "net_premium": int,             # 계(A+B+C-D) (원)
                "policy_loan": int              # 약관대출 (원)
            },
            "fund_allocations": [
                {
                    "fund_name": str,               # 펀드명
                    "basic_accumulated": int,       # 기본적립금 (원)
                    "additional_accumulated": int,  # 추가적립금 (원, optional)
                    "allocation_ratio": float,      # 구성비율 (%)
                    "return_rate": float,           # 수익률/기본수익률 (%)
                    "additional_return_rate": float,# 추가수익률 (%, optional)
                    "invested_principal": int       # 투입원금 (원)
                }
            ],
            "total_accumulated_amount": int,    # 총 적립금 (원)
            "fund_count": int                   # 펀드 수
        }

        파싱 실패 시:
        {
            "error": str,
            "raw_output": str
        }

    Raises:
        FileNotFoundError: PDF 파일이 존재하지 않을 때
        ValueError: OpenAI API 키가 없을 때
    """
    logger.info(f"🤖 Customer Review OpenAI API 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    extracted_pdf_path = None
    try:
        # OpenAI 클라이언트 가져오기
        ai_client = get_openai_client()

        # 0. PDF 페이지 추출 (2~4페이지만, 1페이지 제외로 토큰 절약)
        actual_pdf_path = pdf_path
        if end_page > 1:
            logger.info(f"📄 PDF 페이지 추출: 2~{end_page}페이지만 사용 (1페이지 제외, 토큰 절약)")
            extracted_pdf_path = extract_cr_pdf_pages(pdf_path, start_page=2, end_page=end_page)
            actual_pdf_path = extracted_pdf_path

        # 1. PDF 파일 업로드
        logger.info("📤 Customer Review PDF 파일 업로드 중...")
        with open(actual_pdf_path, 'rb') as file:
            uploaded_file = ai_client.files.create(
                file=file,
                purpose="assistants"
            )

        logger.info(f"✅ 파일 업로드 완료: {uploaded_file.id}")

        # 2. Chat Completions API 호출
        logger.info("🔍 OpenAI API 호출 중 (약 20초 소요)...")

        system_prompt = """You are a strict document parsing assistant for MetLife Customer Review Service PDFs.
Extract contract information, premium details, and fund allocation data from the PDF.

Rules:
1. 반드시 JSON만 반환. (마크다운, 주석, 설명 절대 금지)
2. JSON Schema:
   {
     "contract_info": {
       "policy_number": string,           // 증권번호 (예: "0011423761")
       "contract_date": "YYYY-MM-DD",     // 계약일자
       "insured_amount": number,          // 보험가입금액 (원, 정수)
       "accumulated_amount": number,      // 적립금 (원, 정수)
       "investment_return_rate": number,  // 투자수익률 (%, 소수점 2자리)
       "surrender_value": number,         // 해지환급금 (원, 정수)
       "surrender_rate": number           // 해지환급율 (%, 소수점 1자리)
     },
     "premium_info": {
       "basic_premium": number,           // 기본보험료(A) (원)
       "additional_premium": number,      // 수시추가납(B) (원)
       "regular_additional": number,      // 정기추가납(C) (원)
       "withdrawal": number,              // 중도출금(D) (원)
       "net_premium": number,             // 계(A+B+C-D) (원)
       "policy_loan": number              // 약관대출 (원)
     },
     "fund_allocations": [
       {
         "fund_name": string,               // 펀드명 (예: "성장주식형", "채권형")
         "basic_accumulated": number,       // 기본적립금 (원)
         "additional_accumulated": number,  // 추가적립금 (원, 없으면 0)
         "allocation_ratio": number,        // 구성비율 (%)
         "return_rate": number,             // 수익률 또는 기본수익률 (%)
         "additional_return_rate": number,  // 추가수익률 (%, 없으면 null)
         "invested_principal": number       // 투입원금 (원)
       }
     ],
     "total_accumulated_amount": number,  // 총 적립금 = 기본적립금 + 추가적립금 합계
     "fund_count": number                 // 펀드 수
   }

3. 금액 처리:
   - 모든 금액은 정수(원 단위)로 변환
   - 쉼표 제거 후 숫자만 추출
   - "원" 단위 제거

4. 비율/수익률 처리:
   - 소수점 있는 그대로 추출 (예: 64.15, 132.5)
   - "%" 기호 제거

5. 날짜 처리:
   - "YYYY-MM-DD" 형식으로 변환
   - "2013년 11월 12일" → "2013-11-12"

6. 펀드 정보:
   - 기본적립금만 있는 경우: additional_accumulated = 0
   - 추가수익률이 없는 경우: additional_return_rate = null
   - 투입원금이 없는 경우: invested_principal = 0

7. 주의사항:
   - PDF에 있는 값만 추출 (계산 금지)
   - 누락된 필드는 0 또는 null로 처리

NOTE: This PDF contains only pages 2~4 (page 1 was excluded for token optimization).
Page 1 metadata (product name, issue date, contractor, etc.) is extracted separately."""

        user_text = "Parse the attached MetLife Customer Review Service PDF into JSON format. Extract contract info, premium info, and fund allocation details."

        # AI 모델 설정 조회 (캐싱됨)
        cr_model = get_annual_report_model()
        logger.info(f"🤖 사용 모델: {cr_model}")

        response = ai_client.chat.completions.create(
            model=cr_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "file", "file": {"file_id": uploaded_file.id}}
                    ]
                }
            ]
        )

        logger.info("✅ OpenAI API 응답 수신 완료")

        # 3. 응답 텍스트 추출
        try:
            output_text = response.choices[0].message.content.strip()
            logger.info(f"📝 응답 텍스트 길이: {len(output_text)} 문자")
        except Exception as e:
            logger.error(f"❌ 응답 텍스트 추출 실패: {type(e).__name__}: {e}")
            logger.error(f"DEBUG: response = {response}")
            raise

        # 4. 마크다운 코드블록 제거
        cleaned_output = clean_json_output(output_text)

        # 5. JSON 파싱
        try:
            parsed_json = json.loads(cleaned_output)

            # 결과 로깅
            fund_count = len(parsed_json.get("fund_allocations", []))
            total_amount = parsed_json.get("total_accumulated_amount", 0)
            policy_number = parsed_json.get("contract_info", {}).get("policy_number", "N/A")

            logger.info(
                f"✅ Customer Review 파싱 성공: 증권번호={policy_number}, "
                f"펀드={fund_count}개, 총적립금={total_amount:,}원"
            )

            # fund_count 추가 (없으면)
            if "fund_count" not in parsed_json:
                parsed_json["fund_count"] = fund_count

            return parsed_json

        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON 파싱 실패: {e}")
            logger.debug(f"Raw output: {cleaned_output[:500]}...")

            return {
                "error": "JSON 파싱 실패",
                "raw_output": cleaned_output,
                "exception": str(e)
            }

    except Exception as e:
        logger.error(f"❌ Customer Review OpenAI API 파싱 중 오류: {e}")
        send_error_log("annual_report_api", f"Customer Review OpenAI API 파싱 중 오류: {e}", e)
        return {
            "error": f"파싱 실패: {str(e)}",
            "raw_output": ""
        }
    finally:
        # 임시 PDF 파일 정리
        if extracted_pdf_path and os.path.exists(extracted_pdf_path):
            try:
                os.unlink(extracted_pdf_path)
                logger.info(f"🗑️  임시 PDF 파일 삭제: {extracted_pdf_path}")
            except Exception as cleanup_error:
                logger.warning(f"임시 파일 삭제 실패: {cleanup_error}")
