"""
OpenAI API를 사용한 Annual Report 파싱
기존 tools/annual_report/parse_pdf_with_ai.py 코드 기반
"""
import os
import json
import re
import logging
from typing import Dict, Optional
import tempfile

from openai import OpenAI
from PyPDF2 import PdfReader, PdfWriter

from config import settings

logger = logging.getLogger(__name__)

# OpenAI 클라이언트 초기화
client: Optional[OpenAI] = None

def get_openai_client() -> OpenAI:
    """OpenAI 클라이언트 싱글톤"""
    global client

    if client is None:
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다")

        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI 클라이언트 초기화 완료")

    return client


def clean_json_output(output_text: str) -> str:
    """
    AI 출력에서 마크다운 코드블록 제거

    Args:
        output_text: AI 응답 텍스트

    Returns:
        str: 정리된 JSON 문자열
    """
    # ```json ... ``` 또는 ``` ... ``` 제거
    cleaned = re.sub(r"^```json\s*", "", output_text.strip())
    cleaned = re.sub(r"^```", "", cleaned)
    cleaned = re.sub(r"```$", "", cleaned)

    return cleaned.strip()


def extract_pdf_pages(pdf_path: str, start_page: int, end_page: int) -> str:
    """
    PDF의 start_page~end_page만 추출하여 임시 파일로 저장

    명세: 1페이지는 AI 없이 처리하므로 2~N페이지만 추출 (토큰 절약)

    Args:
        pdf_path: 원본 PDF 파일 경로
        start_page: 시작 페이지 번호 (1-based, inclusive) - 보통 2
        end_page: 마지막 페이지 번호 (1-based, inclusive)

    Returns:
        str: 추출된 PDF의 임시 파일 경로
    """
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    # start_page~end_page 추출 (0-based index 변환)
    start_idx = start_page - 1  # 1-based → 0-based
    end_idx = min(end_page, len(reader.pages))  # 1-based 그대로 사용 (range는 exclusive)

    for page_num in range(start_idx, end_idx):
        writer.add_page(reader.pages[page_num])

    # 임시 파일 생성
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    temp_path = temp_file.name

    with open(temp_path, 'wb') as output_file:
        writer.write(output_file)

    logger.info(f"📄 PDF 추출 완료: {start_page}~{end_page}페이지 → {temp_path}")
    return temp_path


def parse_annual_report(pdf_path: str, customer_name: Optional[str] = None, end_page: Optional[int] = None) -> Dict:
    """
    Annual Report PDF를 OpenAI API로 파싱

    기존 tools/annual_report/parse_pdf_with_ai.py의 검증된 로직 사용
    프롬프트 확장: 고객명, 발행기준일 추가 추출

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (선택, 검증용)

    Returns:
        dict: {
            "고객명": str,
            "발행기준일": "YYYY-MM-DD",
            "보유계약 현황": [
                {
                    "순번": int,
                    "증권번호": str,
                    "보험상품": str,
                    "계약자": str,
                    "피보험자": str,
                    "계약일": "YYYY-MM-DD",
                    "계약상태": str,
                    "가입금액(만원)": float,
                    "보험기간": str,
                    "납입기간": str,
                    "보험료(원)": int
                }
            ],
            "부활가능 실효계약": [...]  # 선택사항
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
    logger.info(f"🤖 OpenAI API 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    extracted_pdf_path = None
    try:
        # OpenAI 클라이언트 가져오기
        ai_client = get_openai_client()

        # 0. PDF 페이지 추출 (2~N페이지만, 1페이지 제외로 토큰 절약)
        actual_pdf_path = pdf_path
        if end_page and end_page > 1:
            logger.info(f"📄 PDF 페이지 추출: 2~{end_page}페이지만 사용 (1페이지 제외, 토큰 절약)")
            extracted_pdf_path = extract_pdf_pages(pdf_path, start_page=2, end_page=end_page)
            actual_pdf_path = extracted_pdf_path
        else:
            logger.warning("end_page가 없거나 1 이하입니다. 전체 PDF 사용 (비권장)")

        # 1. PDF 파일 업로드
        logger.info("📤 PDF 파일 업로드 중...")
        with open(actual_pdf_path, 'rb') as file:
            uploaded_file = ai_client.files.create(
                file=file,
                purpose="assistants"
            )

        logger.info(f"✅ 파일 업로드 완료: {uploaded_file.id}")

        # 2. Responses API 호출 (검증된 방식)
        logger.info("🔍 OpenAI API 호출 중 (약 25초 소요)...")

        response = ai_client.responses.create(
            model=settings.OPENAI_MODEL,
            input=[
                {
                    "role": "system",
                    "content": """You are a strict document parsing assistant.
Extract contract tables from the Annual Report PDF (pages 2~N only, page 1 excluded).

Rules:
1. 반드시 JSON만 반환. (마크다운, 주석, 설명 절대 금지)
2. JSON Schema:
   {
     "보유계약 현황": [
       {
         "순번": number,
         "증권번호": string,
         "보험상품": string,
         "계약자": string,
         "피보험자": string,
         "계약일": "YYYY-MM-DD",
         "계약상태": string,
         "가입금액(만원)": number,
         "보험기간": string,
         "납입기간": string,
         "보험료(원)": number
       }
     ],
     "부활가능 실효계약": [ ... ]  // 있는 경우만
   }
3. 보험상품:
   - 반드시 PDF 표 셀 내부의 텍스트만 기록
   - 표 외부 텍스트(머리말, 각주, 회사명, 마케팅 문구 등)는 절대 포함하지 말 것
   - 상품명은 "보험", "종신", "연금", "플랜", "Plus" 등 보험 관련 키워드로 끝나야 함
   - 줄바꿈으로 나뉜 경우 합쳐서 하나의 문자열로 작성
   - 의미 없는 단어, 문구, 회사명은 절대 포함하지 않는다
4. 계약자/피보험자:
   - 반드시 사람 이름만 기록
   - 불필요한 텍스트는 제거
5. 계약일:
   - "YYYY-MM-DD" 형식으로 변환
6. 보험료(원):
   - 숫자만 추출 (쉼표 제거)
   - 정수형으로 변환

NOTE: This PDF contains only pages 2~N (page 1 was excluded for token optimization).
Customer name and issue date are already extracted from page 1."""
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": f"Parse the attached Annual Report PDF into JSON. {'Customer name should be: ' + customer_name if customer_name else ''}"},
                        {"type": "input_file", "file_id": uploaded_file.id}
                    ]
                }
            ]
        )

        logger.info("✅ OpenAI API 응답 수신 완료")

        # 3. 응답 텍스트 추출
        try:
            logger.info(f"DEBUG: response type = {type(response)}")
            logger.info(f"DEBUG: response dir = {[attr for attr in dir(response) if not attr.startswith('_')][:20]}")
            logger.info(f"DEBUG: has output? {hasattr(response, 'output')}")
            logger.info(f"DEBUG: has choices? {hasattr(response, 'choices')}")

            output_text = response.output[0].content[0].text.strip()
            logger.info(f"📝 응답 텍스트 길이: {len(output_text)} 문자")
        except Exception as e:
            logger.error(f"DEBUG: 응답 텍스트 추출 실패: {type(e).__name__}: {e}")
            logger.error(f"DEBUG: response = {response}")
            raise

        # 4. 마크다운 코드블록 제거
        cleaned_output = clean_json_output(output_text)

        # 5. JSON 파싱
        try:
            parsed_json = json.loads(cleaned_output)

            # 결과 로깅
            contract_count = len(parsed_json.get("보유계약 현황", []))
            logger.info(
                f"✅ 파싱 성공: 고객명={parsed_json.get('고객명')}, "
                f"계약={contract_count}건, 발행일={parsed_json.get('발행기준일')}"
            )

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
        logger.error(f"❌ OpenAI API 파싱 중 오류: {e}")
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
