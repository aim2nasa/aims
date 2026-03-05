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
    "보험설계사 문서분류기. JSON만 응답. annual_report/customer_review/unspecified 선택 금지."
)

CLASSIFICATION_USER_PROMPT = """문서를 분류하세요.

[유형 목록] 정확히 1개 선택:
application=청약서, policy=보험증권, terms=약관, plan_design=설계서, proposal=제안서, coverage_analysis=보장분석, change_request=계약변경, surrender=해지서류, claim_form=보험금청구서, diagnosis=진단서/소견서, medical_receipt=진료비영수증, accident_cert=사고증명서, hospital_cert=입퇴원확인서, id_card=신분증, family_cert=가족관계서류, seal_signature=인감/서명, bank_account=통장사본, power_of_attorney=위임장, consent_form=동의서/서약서, business_card=명함, income_proof=소득증빙, employment_cert=재직증명, financial_statement=재무제표, tax_document=세무서류, transaction_proof=거래증빙, health_checkup=건강검진결과, medical_record=의무기록, property_registry=부동산등기, vehicle_registry=자동차등록, business_registry=사업자등록, corp_registry=법인등기/정관, shareholder=주주/지분, meeting_minutes=의사록, hr_document=인사/노무, pension=퇴직연금, business_plan=사업계획서, inheritance_gift=상속/증여, contract=계약서(보험외), legal_document=법률서류, memo=메모/상담기록, general=기타, unclassifiable=분류불가(비문서/내용불명)

[규칙]
- 주된 목적 기준 1개만 선택. 보조 정보는 tags에
- 가입 전 설계=plan_design, 가입 후 분석=coverage_analysis
- 확신 없으면 general

[혼동 주의]
- diagnosis=의사 발급 진단/소견, medical_record=의무기록사본/검사결과지
- income_proof=소득 금액 명시, employment_cert=재직/경력 사실만 증명
- hr_document=법인 인사서류(근로계약/급여대장), employment_cert=개인 재직증명
- corp_registry=정관/법인등기, business_registry=사업자등록증
- contract=보험 외 일반계약, application=보험 청약서

[문서]
{text}

JSON:
{{"type":"diagnosis","confidence":0.85,"title":"홍길동 진단서(30자이내)","summary":"3~5줄요약","tags":["키워드1","키워드2"]}}"""

# 태그 정규화 사전 (@see docs/DOCUMENT_TAXONOMY.md)
TAG_NORMALIZATION = {
    "메트라이프생명": "메트라이프", "MetLife": "메트라이프",
    "삼성생명보험": "삼성생명", "삼성화재해상": "삼성화재",
    "한화생명보험": "한화생명", "교보생명보험": "교보생명",
    "DB손해보험": "DB손보", "현대해상화재": "현대해상",
    "KB손해보험": "KB손보", "NH농협생명": "NH생명",
    "흥국생명보험": "흥국생명", "ABL생명": "ABL생명",
    "AIA생명": "AIA생명", "처브라이프": "처브",
    "종신": "종신보험", "실손의료": "실손보험", "실비": "실손보험",
    "운전자": "운전자보험", "자동차": "자동차보험",
}


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
    def _normalize_tags(cls, tags: List[str]) -> List[str]:
        """태그 정규화: 사전 매핑 + 중복 제거"""
        normalized = []
        seen = set()
        for tag in tags:
            tag = tag.strip()
            if not tag:
                continue
            tag = TAG_NORMALIZATION.get(tag, tag)
            if tag.lower() not in seen:
                seen.add(tag.lower())
                normalized.append(tag)
        return normalized

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
        Summarize text, extract tags, and classify document type.
        Returns {"summary": str, "tags": list, "title": str, "document_type": str, "confidence": float, "truncated": bool}

        @see docs/DOCUMENT_TAXONOMY.md - AI 분류 기준 (프롬프트 가이드)
        """
        if owner_id:
            estimated_tokens = min(len(text) * 2, 10000)
            credit_check = await check_credit_for_summary(owner_id, estimated_tokens)

            if not credit_check.get("allowed", False):
                logger.warning(f"[CREDIT_EXCEEDED] Summary 스킵: owner_id={owner_id}, remaining={credit_check.get('credits_remaining', 0)}")
                return {
                    "summary": "크레딧 부족으로 요약이 생략되었습니다.",
                    "tags": [],
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
                    "tags": [],
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
            tags = parsed.get("tags", [])
            if not isinstance(tags, list):
                tags = []
            tags = cls._normalize_tags(tags)

            if not summary:
                summary = content[:500]

            logger.info(f"[Classification] doc_id={document_id}, type={doc_type}, confidence={confidence:.2f}")

            return {
                "summary": summary,
                "tags": tags,
                "title": title,
                "document_type": doc_type,
                "confidence": confidence,
                "truncated": truncated
            }

        except Exception as e:
            return {
                "summary": f"요약 생성 실패: {str(e)}",
                "tags": [],
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

    @classmethod
    async def extract_tags(cls, text: str, owner_id: Optional[str] = None, document_id: Optional[str] = None) -> List[str]:
        """Extract keywords as tags from text"""
        result = await cls.summarize_text(text, owner_id=owner_id, document_id=document_id)
        return result.get("tags", [])
