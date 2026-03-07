"""
OpenAI Service for Text Summarization and Document Classification
"""
import os
import json
import uuid
import httpx
import openai
import logging
from typing import List, Dict, Any, Optional

from config import get_settings

logger = logging.getLogger(__name__)

# aims_api 토큰 로깅 설정
AIMS_API_BASE_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "aims-internal-token-logging-key-2024")

# 🔴 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_BASE_URL}/api/internal/check-credit"


async def check_credit_for_summary(user_id: str, estimated_tokens: int = 1000) -> dict:
    """
    Summary 생성 전 크레딧 체크 (aims_api 내부 API 호출)

    Args:
        user_id: 사용자 ID
        estimated_tokens: 예상 토큰 수 (기본 1000)

    Returns:
        dict: {
            allowed: bool,
            reason: str,
            credits_remaining: int,
            ...
        }

    @see docs/EMBEDDING_CREDIT_POLICY.md
    """
    if not user_id or user_id == "system":
        # system 사용자는 크레딧 체크 스킵
        return {"allowed": True, "reason": "system_user"}

    try:
        # AI 토큰을 페이지 수로 환산 (1K 토큰 ≈ 0.5 크레딧)
        # Summary는 보통 1페이지 미만 분량
        estimated_pages = max(1, estimated_tokens // 5000)

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                CREDIT_CHECK_URL,
                json={
                    "user_id": user_id,
                    "estimated_pages": estimated_pages
                },
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": INTERNAL_API_KEY
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"[CreditCheck] API 호출 실패 (fail-closed): {response.status_code}")
                # fail-closed: API 실패 시 처리 보류 (안전 우선)
                return {"allowed": False, "reason": "api_error_fallback"}

    except Exception as e:
        logger.warning(f"[CreditCheck] 오류 (fail-closed): {e}")
        # fail-closed: 오류 시 처리 보류 (aims_api 복구 후 재시도)
        return {"allowed": False, "reason": "error_fallback", "error": str(e)}


# --- Document Classification Constants ---
# @see docs/DOCUMENT_TAXONOMY.md

VALID_DOCUMENT_TYPES = {
    "application", "policy", "terms", "plan_design", "proposal",
    "coverage_analysis", "change_request", "surrender",
    "claim_form", "diagnosis", "medical_receipt", "accident_cert", "hospital_cert",
    "id_card", "family_cert", "seal_signature", "bank_account",
    "power_of_attorney", "consent_form", "business_card",
    "income_proof", "employment_cert", "financial_statement", "tax_document", "transaction_proof",
    "health_checkup", "medical_record",
    "property_registry", "vehicle_registry", "business_registry",
    "corp_registry", "shareholder", "meeting_minutes", "hr_document",
    "pension", "business_plan", "inheritance_gift",
    "contract", "legal_document",
    "memo", "general", "unclassifiable",
}

# AI 분류에서 이 값이 나오면 general로 교체 (시스템 전용 유형)
SYSTEM_ONLY_TYPES = {"annual_report", "customer_review", "unspecified"}

CLASSIFICATION_SYSTEM_PROMPT = (
    "보험설계사 문서분류기. JSON만 응답. "
    "annual_report/customer_review/unspecified 선택 금지. "
    "general은 42개 유형 어디에도 해당하지 않을 때만 선택. "
    "텍스트가 없거나 판독 불가하면 반드시 unclassifiable 선택."
)

CLASSIFICATION_USER_PROMPT = """보험설계사가 관리하는 고객 문서를 분류하세요.

[유형 목록 — 9개 대분류, 42개 소분류 중 정확히 1개 선택]

1. 보험계약: application=청약서/가입신청서/자필서명청약, policy=보험증권/보험가입확인서/증권번호기재확인서, terms=약관/보통약관, plan_design=가입설계서/보험설계/보험비교표/보장비교표(보험료·보장내용 수치 비교 문서), proposal=제안서/가입제안서/상품설명서(고객에게 보내는 종합 제안), coverage_analysis=보장분석/보장범위분석/보장내역(기존가입 보험의 보장 분석·현황), change_request=계약변경/감액/특약해지, surrender=해지서류/해지환급금
2. 보험금청구: claim_form=보험금청구서/청구절차안내, diagnosis=진단서/소견서(의사발급), medical_receipt=진료비영수증/진료비계산서/약제비계산서, accident_cert=사고증명서/교통사고사실확인원, hospital_cert=입퇴원확인서/통원확인서
3. 고객신원: id_card=신분증/주민등록증/운전면허/여권, family_cert=가족관계증명서/주민등록등본/혼인관계, seal_signature=인감증명서/서명확인/본인서명사실확인서, bank_account=통장사본/계좌개설확인서/금융거래확인서/금융거래내역, power_of_attorney=위임장/대리청구, consent_form=동의서/서약서/개인정보동의/자필서명확인서/자필서류, business_card=명함
4. 재무/소득: income_proof=소득금액증명/급여명세서, employment_cert=재직증명서/경력증명서, financial_statement=재무제표/손익계산서/대차대조표, tax_document=종합소득세/세무신고서/원천징수영수증/부가가치세신고서/과세표준증명원, transaction_proof=거래명세서/입금확인서/비용내역서/사업비내역서/경비정산서/거래내역증명서
5. 건강/의료: health_checkup=건강검진결과/종합검진/암검진, medical_record=의무기록/검사결과지/처방전
6. 재산/등록: property_registry=부동산등기부등본/건축물대장, vehicle_registry=자동차등록/차량등록원부, business_registry=사업자등록증/사업자등록증명원
7. 법인: corp_registry=법인등기부등본/법인등기사항전부증명서/정관/법인인감증명서/중소기업확인서, shareholder=주주명부/지분증명, meeting_minutes=이사회의사록/주총의사록, hr_document=이력서/근로계약서/급여대장/인사발령/노무서류/취업규칙, pension=퇴직연금/DC형/DB형/가입자명부/확정기여형/확정급여형/부담금내역, business_plan=사업계획서/투자제안서, inheritance_gift=상속/증여/유언장
8. 일반계약/법률: contract=임대차계약/용역계약/매매계약(보험외), legal_document=법률서류/내용증명/소장/변호사의견서/출석통지서/공문/징계서류
9. 기타: memo=메모/상담기록/고객노트, general=위 유형에 해당하지 않는 일반 문서/안내문/가이드, unclassifiable=비문서/내용없음/판독불가/보험업무와 전혀 무관(사은품·사무용품·로고·디자인)

[분류 규칙]
1. 문서의 주된 목적 기준으로 1개만 선택
2. 가입 전 설계=plan_design, 가입 후 기존보험 분석=coverage_analysis
3. general은 마지막 수단! 42개 유형 중 하나라도 해당하면 반드시 그것을 선택
4. 텍스트가 짧아도 키워드가 특정 유형과 명확히 매칭되면 해당 유형 선택
5. 텍스트가 없거나 의미 있는 단어가 10자 미만이면 unclassifiable (general 아님)
6. 서식 양식(빈 칸/예시명)이라도 문서 유형이 명확하면 해당 유형으로 분류 (unclassifiable 아님)

[혼동 주의 — 반드시 구분]
- plan_design(설계서: 보험료·보장내용·보험기간이 수치표로 나열된 설계 문서. "가입제안서"라는 제목이 없으면 plan_design) vs proposal(제안서: "가입제안서"라는 제목이 명시된 종합 제안 문서)
- application(청약서: 가입 신청, "청약" 키워드 핵심) vs policy(증권: 계약 체결 확인, 증권번호·보험기간 확정)
- consent_form(동의서/서약서/자필서명확인서) vs application(청약서). "자필서류"는 consent_form
- diagnosis(의사 발급 진단서/소견서) vs medical_record(의무기록사본/검사결과지)
- income_proof(소득 금액 명시 증명) vs employment_cert(재직/경력 사실만 증명)
- hr_document(법인 인사서류: 이력서/근로계약서/급여대장) vs employment_cert(개인 재직증명)
- corp_registry(정관/법인등기부등본/등기사항전부증명서) vs business_registry(사업자등록증만 해당). "등기부등본" "등기사항전부증명서"는 반드시 corp_registry
- property_registry(부동산등기부등본) vs corp_registry(법인등기부등본). 부동산이면 property_registry
- contract(보험 외 일반계약) vs application(보험 청약서)
- pension(퇴직연금/DC/DB/가입자명부/부담금내역) vs hr_document(일반 인사서류)
- financial_statement(재무제표/손익계산서) vs tax_document(세무신고/납부)
- general(안내문/가이드/기타 업무 문서) vs unclassifiable(판독불가/보험업무 무관). 비용안내·준비서류안내=general
- general(분류 가능한 기타 문서) vs hr_document(인사서류). 일반 안내문은 general
- coverage_analysis(기존 보험의 보장내역/보장분석 현황. "보장내역" "보장분석" 키워드가 있거나, 여러 특약의 계약금·보험료·보기/납기가 표로 나열된 현황) vs policy(보험증권: 보험사가 발행한 공식 증권. "보험증권" "증권번호" "피보험자" "보험기간"이 있고 보험사 직인/발행일이 있는 공식 문서)
- bank_account vs transaction_proof: 문서 제목이 "금융거래확인서"이면 내용(대출현황·담보·예금)과 무관하게 반드시 bank_account. transaction_proof는 상거래 매매·용역·입금 내역서에만 해당
- tax_document(부가가치세신고서/종합소득세/원천징수) vs financial_statement(재무제표/손익계산서). 세금 신고·납부 서류면 tax_document

[문서]
{text}

JSON (반드시 이 형식):
{{"type":"diagnosis","confidence":0.85,"title":"홍길동 진단서(30자이내 핵심제목)","summary":"3~5줄 요약"}}"""

class OpenAIService:
    """OpenAI service using class methods"""

    _client: Optional[openai.AsyncOpenAI] = None

    @classmethod
    def _get_client(cls) -> openai.AsyncOpenAI:
        """Get or create OpenAI client"""
        if cls._client is None:
            settings = get_settings()
            cls._client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return cls._client

    @classmethod
    async def _log_token_usage(
        cls,
        user_id: str,
        document_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int
    ) -> bool:
        """
        aims_api에 토큰 사용량 로깅

        Args:
            user_id: 문서 소유자 ID
            document_id: 문서 ID
            model: 사용된 모델명
            prompt_tokens: 입력 토큰 수
            completion_tokens: 출력 토큰 수
            total_tokens: 총 토큰 수

        Returns:
            bool: 로깅 성공 여부
        """
        try:
            payload = {
                "user_id": user_id or "system",
                "source": "doc_summary",
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "request_id": str(uuid.uuid4()),
                "metadata": {
                    "document_id": document_id,
                    "workflow": "document_pipeline"
                }
            }

            headers = {
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            }

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    TOKEN_LOGGING_URL,
                    json=payload,
                    headers=headers
                )

                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        logger.info(f"[TokenLog] 요약 토큰 로깅 완료: {total_tokens} tokens")
                        return True

            logger.warning(f"[TokenLog] 토큰 로깅 실패: {response.status_code}")
            return False

        except Exception as e:
            logger.warning(f"[TokenLog] 토큰 로깅 오류: {e}")
            return False

    @classmethod
    def _validate_document_type(cls, doc_type: Optional[str]) -> str:
        """AI 분류 결과 검증: 유효하지 않거나 시스템 전용이면 general 반환"""
        if not doc_type or doc_type in SYSTEM_ONLY_TYPES or doc_type not in VALID_DOCUMENT_TYPES:
            return "general"
        return doc_type

    @classmethod
    async def summarize_text(
        cls,
        text: str,
        max_length: int = 600,
        owner_id: Optional[str] = None,
        document_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Summarize text and classify document type.
        Returns {"summary": str, "title": str, "document_type": str, "confidence": float, "truncated": bool}

        @see docs/DOCUMENT_TAXONOMY.md - AI 분류 기준 (프롬프트 가이드)
        """
        if owner_id:
            estimated_tokens = min(len(text) * 2, 10000)
            credit_check = await check_credit_for_summary(owner_id, estimated_tokens)

            if not credit_check.get("allowed", False):
                logger.warning(f"[CREDIT_EXCEEDED] Summary 스킵: owner_id={owner_id}, remaining={credit_check.get('credits_remaining', 0)}")
                return {
                    "summary": "크레딧 부족으로 요약이 생략되었습니다.",
                    "title": "",
                    "document_type": "general",
                    "confidence": 0.0,
                    "truncated": False,
                    "credit_skipped": True,
                    "credits_remaining": credit_check.get("credits_remaining", 0),
                    "days_until_reset": credit_check.get("days_until_reset", 0)
                }

        truncated = len(text) > 10000
        if truncated:
            text = text[:10000]

        user_prompt = CLASSIFICATION_USER_PROMPT.format(text=text)

        try:
            client = cls._get_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": CLASSIFICATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=max_length,
                temperature=0,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content

            if response.usage and (owner_id or document_id):
                await cls._log_token_usage(
                    user_id=owner_id,
                    document_id=document_id,
                    model="gpt-4o-mini",
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    total_tokens=response.usage.total_tokens
                )

            # JSON 파싱
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                logger.warning(f"[Classification] JSON 파싱 실패, fallback: {content[:200]}")
                return {
                    "summary": content[:500],
                    "title": "",
                    "document_type": "general",
                    "confidence": 0.0,
                    "truncated": truncated
                }

            # 필드 추출 + 후처리
            doc_type = cls._validate_document_type(parsed.get("type"))
            confidence = parsed.get("confidence", 0.0)
            if not isinstance(confidence, (int, float)):
                confidence = 0.0
            confidence = max(0.0, min(1.0, float(confidence)))

            title = parsed.get("title", "")
            summary = parsed.get("summary", "")

            if not summary:
                if doc_type == "unclassifiable":
                    summary = "문서 유형을 식별할 수 없습니다."
                else:
                    summary = text[:200].strip() + ("..." if len(text) > 200 else "")

            logger.info(f"[Classification] doc_id={document_id}, type={doc_type}, confidence={confidence:.2f}")

            return {
                "summary": summary,
                "title": title,
                "document_type": doc_type,
                "confidence": confidence,
                "truncated": truncated
            }

        except Exception as e:
            return {
                "summary": f"요약 생성 실패: {str(e)}",
                "title": "",
                "document_type": "general",
                "confidence": 0.0,
                "truncated": truncated
            }

    @classmethod
    async def generate_title_only(
        cls,
        text: str,
        owner_id: Optional[str] = None,
        document_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        경량 제목 추출 (displayName 생성용)

        summarize_text()와 달리 제목만 생성하므로 토큰 사용량이 적다.
        - 입력: 최대 3000자
        - 출력: max_tokens=60
        - 모델: gpt-4o-mini

        Args:
            text: 문서 텍스트
            owner_id: 문서 소유자 ID (크레딧 체크용)
            document_id: 문서 ID (토큰 로깅용)

        Returns:
            {"title": str|None, "error": str|None}
        """
        # 크레딧 체크
        if owner_id:
            estimated_tokens = min(len(text) * 2, 3000)
            credit_check = await check_credit_for_summary(owner_id, estimated_tokens)

            if not credit_check.get("allowed", False):
                logger.warning(
                    f"[CREDIT_EXCEEDED] Title 생성 스킵: owner_id={owner_id}, "
                    f"remaining={credit_check.get('credits_remaining', 0)}"
                )
                return {"title": None, "error": "credit_exceeded"}

        # 입력 텍스트 3000자 제한
        if len(text) > 3000:
            text = text[:3000]

        prompt = f"""다음 문서의 내용을 대표하는 짧은 제목을 한국어로 생성해주세요.
- 최대 40자
- 핵심 내용을 담은 명확한 제목
- 제목만 출력 (다른 설명 없이)

문서:
{text}"""

        try:
            client = cls._get_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "문서 제목 생성 전문가입니다. 제목만 출력합니다."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=60,
                temperature=0.3
            )

            title = response.choices[0].message.content.strip()

            # 토큰 사용량 로깅
            if response.usage and (owner_id or document_id):
                await cls._log_token_usage(
                    user_id=owner_id,
                    document_id=document_id,
                    model="gpt-4o-mini",
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    total_tokens=response.usage.total_tokens
                )
                logger.info(
                    f"[TitleGen] 토큰 사용: prompt={response.usage.prompt_tokens}, "
                    f"completion={response.usage.completion_tokens}, "
                    f"total={response.usage.total_tokens}"
                )

            if not title:
                return {"title": None, "error": "empty_response"}

            return {"title": title, "error": None}

        except Exception as e:
            logger.error(f"[TitleGen] 제목 생성 실패: doc_id={document_id}, error={e}", exc_info=True)
            return {"title": None, "error": "title_generation_failed"}

