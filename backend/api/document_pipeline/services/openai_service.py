"""
OpenAI Service for Text Summarization and Document Classification
"""
import os
import re
import json
import uuid
import httpx
import openai
import logging
from typing import List, Dict, Any, Optional

from config import get_settings
from xpipe.adapter import ClassificationConfig

logger = logging.getLogger(__name__)

# aims_api 토큰 로깅 설정 — settings에서 로드 (pydantic_settings 통합)
_settings = get_settings()
AIMS_API_BASE_URL = _settings.AIMS_API_URL
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"
INTERNAL_API_KEY = _settings.INTERNAL_API_KEY

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
    # 1. 보험계약 (insurance)
    "policy", "coverage_analysis", "application", "plan_design", "insurance_etc",
    # 2. 보험금 청구 (claim)
    "diagnosis", "medical_receipt", "claim_form", "consent_delegation",
    # 3. 신분/증명 (identity)
    "id_card", "family_cert", "personal_docs",
    # 4. 건강/의료 (medical)
    "health_checkup",
    # 5. 자산 (asset)
    "asset_document", "inheritance_gift",
    # 6. 법인 (corporate)
    "corp_basic", "hr_document", "corp_tax", "corp_asset", "legal_document",
    # 7. 기타 (etc)
    "general", "unclassifiable",
}

# AI 분류에서 이 값이 나오면 general로 교체 (시스템 전용 유형)
SYSTEM_ONLY_TYPES = {"annual_report", "customer_review", "unspecified"}

CLASSIFICATION_SYSTEM_PROMPT = (
    "보험설계사 문서분류기. JSON만 응답. "
    "annual_report/customer_review/unspecified 선택 금지. "
    "general은 22개 유형 어디에도 해당하지 않을 때만 선택. "
    "텍스트가 부실해도 파일명이나 별칭에서 유형을 추론 가능하면 반드시 해당 유형으로 분류! "
    "예: 별칭 '체류기간 정보'→id_card, '카드 정보'→personal_docs. "
    "unclassifiable은 텍스트·파일명·별칭 모두에서 전혀 추론 불가할 때만."
)

CLASSIFICATION_USER_PROMPT = """보험설계사가 관리하는 고객 문서를 아래 22개 유형 중 하나로 분류하세요.

[대분류 → 소분류]

보험계약: policy(보험증권-보험사 발행 계약확인 문서, 증권번호·보험기간 확정), coverage_analysis(보장분석/보장범위분석 보고서), application(청약서/가입신청서-법인자동차 청약서 포함), plan_design(설계서/제안서/비교표/컨설팅/가입제안서/견적/보장내용비교/가입안내서/법인컨설팅/종합재무컨설팅/미처분이익잉여금/치매간병설계), insurance_etc(약관/계약변경/해지/보험가입현황/적립금현황/보유계약리스트/지급내역/질권설정/기타보험/상품설명서/보험명단/해약환급금정리/보험정리표/담보삭제/계약내용변경/자필서류/자필확인서)
보험금청구: diagnosis(진단서/소견서/입퇴원확인서/의무기록/진료차트/처방전/검사결과지), medical_receipt(진료비영수증/진료비계산서/약제비계산서/병원비영수증), claim_form(보험금청구서/사고접수/사고증명/사고통지서), consent_delegation(동의서/위임장/FATCA확인서/고객거래확인서)
신분증명: id_card(주민등록증/운전면허증/여권/신분증 사본), family_cert(가족관계증명서/주민등록등본), personal_docs(개인통장/개인인감증명서/명함/금융거래확인서)
건강: health_checkup(건강검진결과/종합검진/암검진)
자산: asset_document(개인소득증명/재직증명/개인부동산등기/건물가액평가), inheritance_gift(상속/증여)
법인: corp_basic(법인등기부등본/정관/주주명부/주식양수도계약서/주식명의신탁약정서/법인통장/법인인감증명서/특허등록완료/연구전담부서인증/법인로고/법인서식/이사회의사록/중소기업확인서/사업자등록증/권리이전등록완료), hr_document(근로계약서/급여대장/인사발령/취업규칙/퇴직연금/퇴직연금부담금납입확인서/퇴직금영수증/결근계/사직서/경고장/경위서/사유서/복직원/병가원/근태계/지각이유서/휴가신청서/조퇴외출신청서/야간근로동의서/야간근로청구서/비밀유지서약서/경업금지서약서/졸업증명서/자격증/포트폴리오/출장신고서/징계처분통지서/징계의결서/징계요구서/노무규정/업무인수인계/성희롱예방교육/선택적보상휴가제합의서/4대보험가입자명부/이력서/근로자명부/재직증명서), corp_tax(원천징수영수증/종합소득세/부가세/세금계산서/법인손익계산서/법인재무제표/재무상태표/주당가치평가/법인설립비용/중소기업기준검토/세무조정계산서/잔고증명서/거래내역증명서/재산현황/사업비내역서), corp_asset(법인자동차보험증권/법인자동차보험가입증/법인자동차등록증/법인부동산/리스/특허수수료/납부고지서/보정요구서/자동차만기/법인건물가액평가/법인담보삭제), legal_document(판결문/소장/내용증명/임대차계약/매매계약/사업계획서/도급계약/컨설팅계약)
기타: general(안내문/메모/사은품/요청자료모음/기타업무문서/액자/보관렉), unclassifiable(텍스트없음/판독불가/빈이미지)

[핵심 규칙]
1. 본문·파일명·별칭·고객정보를 종합 판단. ★본문 텍스트가 충분하면 본문 내용이 최우선! 파일명/별칭은 보조 참고. 텍스트가 부실하거나 없으면 파일명/별칭이 최우선 분류 근거!
2. 법인 고객의 자동차보험 가입증/증권 → corp_asset. 단, 청약서는 법인 자동차라도 application! 파일명에 "자동차"/"포터"/"트럭"/"차량" 포함 시에도 가입증/증권→corp_asset, 청약서→application
3. 법인 고객이라도 화재보험·생명보험·상해보험·운전자보험 등 자동차 외 보험증권 → policy
4. "원천징수" → corp_tax. "진료비/약제비/병원비" → medical_receipt. "보험금청구/사고접수" → claim_form
5. "보장분석/보장범위분석/보험조회/사전조회" → coverage_analysis. ★이 규칙은 규칙6보다 우선! 보장분석 보고서 안에 "보험가입현황"이 포함되더라도 반드시 coverage_analysis!
6. 보험가입현황/적립금/보유계약리스트/상품설명서/보험명단/해약환급금/보험정리표/"가입내용"/"가입내역" → insurance_etc (단, 규칙5 "보장분석" 문서는 제외!)
7. ★별칭(별명) 기반 분류 — 별칭에 다음 키워드가 있으면 반드시 해당 유형으로! "체류기간/국내거소/주민등록/여권/외국인등록/운전면허" → id_card. "카드 정보/통장/은행" → personal_docs. "진단/소견" → diagnosis. "청구서" → claim_form. "증권/보험증" → policy
8. unclassifiable은 본문·파일명·별칭 모두 분류 단서가 전혀 없을 때만! 파일명에 "사직서/통장/카드/등본/영수증/신분증/보험/증권/청약/동의/검진" 등 유형 단서가 조금이라도 있으면 반드시 분류!
9. 특허청/지식재산 관련 납부고지서/수수료/보정요구서/등록증재발급신청 → corp_asset. 단, 특허등록완료/권리이전등록완료 → corp_basic (결과 통지 서류)
10. "설계서"/"제안서"/"가입안내서"/"견적"/"가입제안"/"비교표"/"치매간병" → plan_design. 자동차견적/운전자보험 설계서도 plan_design
11. 자격증/졸업증명서/이력서 → hr_document. 명함 → personal_docs
12. 퇴직연금/퇴직연금부담금납입확인서/퇴직금영수증/야간근로동의서/야간근로청구서 → hr_document
13. 질권설정/질권설정변경 → insurance_etc
14. 계약자변경/계약내용변경 → insurance_etc
15. 법인 자동차보험 "가입증"/"증권" → corp_asset, "청약서" → application. 개인용/"KB개인용" 자동차보험 가입증/증권 → policy. 운전자보험 증권→policy
16. 법인설립비용/설립등기비용 → corp_tax
17. 서약서/합의서/경업금지/비밀유지(법인 인사 관련) → hr_document
18. 주식양수도계약서/주식명의신탁약정서/정관/주주명부/등기부등본/법인인감/사업자등록증 → corp_basic (legal_document 아님!)
19. 메모/사은품/디자인/액자 → general (unclassifiable 아님!). 단, 법인 로고/법인 서식(.ai 등) → corp_basic
20. 잔고증명서/거래내역증명서/재산현황/사업비내역서 → corp_tax. "재산현황"은 보험이 아닌 세무 서류!
21. 세무서제출용/세무자료/세무서제출서류/손금산입/경비처리세무사제출 → corp_tax (insurance_etc 아님!). 파일명에 "경비처리"+"세무사" 또는 "손비처리"+"납입증명" 조합이면 corp_tax
22. 파일명에 "신분증" → id_card, "암검진"/"건강검진" → health_checkup, "취업규칙"/"사직서"/"근로자명부"/"성희롱" → hr_document, "통장"/"카드" → personal_docs, "등본" → family_cert, "손비처리"/"납입증명"/"경비처리" → corp_tax
23. 재직증명서 → hr_document (법인 직원 관련)
24. 자필서류/자필확인서/서명 서류 → insurance_etc (application 아님!)
25. 파일명에 "법원"/"가합"/"소송"/"판결" → legal_document. "컨설팅" → plan_design
26. 신분증이 포함된 복합 파일(통장+신분증 등) → id_card 우선
27. 법인인감(인감 이미지/인감증명) → corp_basic. "인감"이라도 법인 관련이면 corp_basic
28. "법인서류"로 시작하는 파일명 → 내용이 법인 관련이면 corp_basic

[혼동 주의]
- plan_design vs policy: 설계서/제안서/견적/가입안내서/컨설팅/비교표/치매간병보험설계 → plan_design. 운전자보험/운전자상해보험 설계서도 반드시 plan_design (policy 아님!). 보험증권(증권번호 확정+보험사 직인) → policy
- plan_design vs legal_document: CEO컨설팅/법인컨설팅/종합재무컨설팅/미처분이익잉여금/제안서 → plan_design
- insurance_etc vs coverage_analysis: ★보장분석 보고서 내에 "보험가입현황"이 포함되더라도 → coverage_analysis! 순수 현황표/적립금/보유계약리스트만 → insurance_etc
- insurance_etc vs policy: "현황"/"정리"/"명단"/"지급내역"/"가입내역" → insurance_etc
- insurance_etc vs application: 자필서류/자필확인서/자필서명 → insurance_etc. 청약서/가입신청서(새 계약 체결 목적) → application
- corp_basic vs personal_docs: 법인 명의 통장/법인 인감/법인 서류 → corp_basic. 개인 명의 통장 → personal_docs
- asset_document vs corp_basic: 사업자등록증 → corp_basic. 개인소득증명/재직증명 → asset_document
- corp_basic vs legal_document: 주식양수도계약서/주식명의신탁약정서/정관/권리이전등록완료/특허등록완료 → corp_basic. 판결문/소장/내용증명 → legal_document
- corp_basic vs general: 법인 로고/법인 서식(.ai/.pptx 등) → corp_basic
- corp_basic vs corp_asset: 특허등록완료/권리이전등록완료 → corp_basic. 특허수수료/납부고지서/보정요구서 → corp_asset
- corp_tax vs corp_basic: 법인설립비용/중소기업기준검토 → corp_tax. 중소기업확인서 → corp_basic
- corp_tax vs insurance_etc: 재산현황/사업비내역서/세무서제출서류/세무자료 → corp_tax (보험 키워드 포함되어도!). 보험가입현황/적립금현황 → insurance_etc
- corp_asset vs policy: corp_asset은 "자동차보험"만! 운전자보험/운전자상해보험 증권 → policy, 운전자보험 청약서 → application
- corp_asset vs application: 법인 자동차 관련 청약서(파일명에 자동차/포터/트럭/차량번호) → corp_asset. 자동차 외 청약서 → application
- hr_document vs legal_document: 서약서/경업금지/징계/비밀유지/합의서(인사노무) → hr_document
- general vs unclassifiable: 메모/사은품/디자인/안내문 → general. 빈이미지/텍스트없음 → unclassifiable
- id_card vs personal_docs: 신분증/운전면허증/여권 → id_card. 통장사본/명함 → personal_docs. 복합파일(신분증+통장) → id_card 우선

[title 규칙]
- 보험 계약 문서의 경우: 사람 이름은 '계약자'를 기준으로 사용하고 맨 앞에 표시
- 원문에 없는 단어는 절대 사용 금지 (이름, 주제, 분야, 용어 모두 포함)
- 계약자를 찾을 수 없으면 이름 없이 생성

[문서 메타정보 (참고용 — 본문 내용과 충돌 시 본문 우선!)]
{file_info}
[본문]
{text}

JSON:
{{"type":"diagnosis","confidence":0.85,"title":"삼성화재 진단서 2024.03(30자이내 핵심제목)","summary":"3~5줄 요약"}}
"""

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
        document_id: Optional[str] = None,
        filename: Optional[str] = None,
        display_name: Optional[str] = None,
        customer_name: Optional[str] = None,
        classification_config: Optional[ClassificationConfig] = None
    ) -> Dict[str, Any]:
        """
        Summarize text and classify document type.
        Returns {"summary": str, "title": str, "document_type": str, "confidence": float, "truncated": bool}

        Args:
            text: 문서 본문 (meta.full_text 또는 ocr.full_text)
            filename: 원본 파일명 (upload.originalName)
            display_name: AI 생성 별칭 (displayName, 있으면)
            classification_config: 어댑터가 제공하는 분류 설정.
                있으면 어댑터 프롬프트 사용, 없으면(None) 기존 하드코딩 fallback.

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

        # 파일명/별칭 정보를 본문 앞에 합성 (분류 정확도 향상)
        file_info = ""
        if filename or display_name or customer_name:
            parts = []
            if filename:
                parts.append(f"파일명: {filename}")
            if display_name:
                parts.append(f"별칭: {display_name}")
            if customer_name:
                parts.append(f"이 문서의 고객: {customer_name}")
            file_info = " | ".join(parts) + "\n---\n"

        # 어댑터 config가 있으면 어댑터 프롬프트 사용, 없으면 기존 하드코딩 fallback
        if classification_config is not None:
            user_prompt_template = classification_config.prompt_template
            system_prompt = classification_config.extra.get(
                "system_prompt", CLASSIFICATION_SYSTEM_PROMPT
            )
        else:
            user_prompt_template = CLASSIFICATION_USER_PROMPT
            system_prompt = CLASSIFICATION_SYSTEM_PROMPT

        user_prompt = user_prompt_template.format(file_info=file_info, text=text)

        try:
            client = cls._get_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
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
            # 어댑터 config가 있으면 어댑터의 valid_types/system_only_types로 검증
            if classification_config is not None:
                _valid = set(classification_config.valid_types) if classification_config.valid_types else VALID_DOCUMENT_TYPES
                _sys_only = classification_config.extra.get("system_only_types", SYSTEM_ONLY_TYPES)
                raw_type = parsed.get("type")
                if not raw_type or raw_type in _sys_only or raw_type not in _valid:
                    doc_type = "general"
                else:
                    doc_type = raw_type
            else:
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

    # 의미없는 파일명 패턴 (카메라 자동명, UUID, 타임스탬프 등)
    _MEANINGLESS_FILENAME_PATTERNS = [
        re.compile(r'^IMG[-_]?\d', re.IGNORECASE),
        re.compile(r'^DSC[-_]?\d', re.IGNORECASE),
        re.compile(r'^Screenshot', re.IGNORECASE),
        re.compile(r'^KakaoTalk', re.IGNORECASE),
        re.compile(r'^scan[-_]?\d', re.IGNORECASE),
        re.compile(r'^tmp[-_]', re.IGNORECASE),
        re.compile(r'^[a-f0-9-]{20,}', re.IGNORECASE),
        re.compile(r'^\d{8,}'),
        re.compile(r'^image[-_]?\d', re.IGNORECASE),
        re.compile(r'^photo[-_]?\d', re.IGNORECASE),
        re.compile(r'^document[-_]?\d', re.IGNORECASE),
    ]

    @classmethod
    def _is_meaningful_filename(cls, filename: str) -> bool:
        """파일명에 의미있는 정보(보험사명, 사람이름 등)가 있는지 판별"""
        if not filename:
            return False
        name = os.path.splitext(filename)[0]
        if len(name) <= 3:
            return False
        for pattern in cls._MEANINGLESS_FILENAME_PATTERNS:
            if pattern.match(name):
                return False
        return True

    @classmethod
    def _build_title_prompt(
        cls,
        text: str,
        original_filename: Optional[str] = None,
        document_type: Optional[str] = None,
        existing_aliases: Optional[List[str]] = None,
        customer_name: Optional[str] = None
    ) -> str:
        """별칭 생성 프롬프트 구성"""
        parts = [
            "문서에 표시할 짧은 별칭을 생성하세요.",
            "",
            "규칙:",
            "- 최대 35자, 한국어, 제목만 출력",
            "- 보험 계약 문서의 경우: 사람 이름은 '계약자'를 기준으로 사용하고 맨 앞에 표시",
            "- 별칭에 사용하는 모든 단어는 문서 텍스트, 파일명, 고객 정보에 실제로 등장해야 함",
            "- 원문에 없는 단어는 절대 사용 금지 (이름, 주제, 분야, 용어 모두 포함)",
            "- 계약자를 찾을 수 없으면 이름 없이 생성",
            "- 보험사명, 상품명, 날짜, 기관명, 금액 등 구분 정보를 우선 포함",
            "- 문서 유형명만으로 된 제목 금지 (예: '진료비 계산서' -> '삼성화재 진료비 2024.03')",
            "- 같은 유형의 문서가 여러 개일 때 서로 구분 가능하도록 구체적으로",
            "- 파일 확장자(.jpg, .pdf 등) 절대 포함 금지",
            "- 날짜는 YYYY.MM.DD 또는 YYYY.MM 형식으로",
        ]

        if customer_name:
            parts.append(f"\n이 문서의 고객: {customer_name}")

        if original_filename and cls._is_meaningful_filename(original_filename):
            parts.append(f"\n원본 파일명: {original_filename}")
            parts.append("파일명에 유용한 정보가 있다면 반영하세요.")

        if document_type and document_type != "general":
            parts.append(f"\n문서 유형: {document_type}")

        if existing_aliases:
            # 최근 30개만 포함 (프롬프트 길이 제한)
            recent = existing_aliases[-30:]
            parts.append("\n이미 생성된 별칭 (중복 금지):")
            for alias in recent:
                parts.append(f"- {alias}")

        parts.append(f"\n문서:\n{text}")
        return "\n".join(parts)

    @classmethod
    async def generate_title_only(
        cls,
        text: str,
        owner_id: Optional[str] = None,
        document_id: Optional[str] = None,
        original_filename: Optional[str] = None,
        document_type: Optional[str] = None,
        existing_aliases: Optional[List[str]] = None,
        customer_name: Optional[str] = None
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
            original_filename: 원본 파일명 (의미있는 정보 반영용)
            document_type: 문서 유형 (보험증권, 청약서 등)
            existing_aliases: 동일 고객의 기존 별칭 목록 (중복 방지용)

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

        prompt = cls._build_title_prompt(text, original_filename, document_type, existing_aliases, customer_name)

        try:
            client = cls._get_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "문서 별칭 생성 전문가입니다. 별칭만 출력합니다."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=60,
                temperature=0
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

