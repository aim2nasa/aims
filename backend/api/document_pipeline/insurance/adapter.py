"""
InsuranceDomainAdapter — AIMS 보험 도메인 어댑터

DomainAdapter ABC를 상속하여 보험 도메인에 특화된 로직을 구현한다.

Phase 2-1 완료: 분류 체계 + 프롬프트가 어댑터로 이동됨.
- get_classification_config(): openai_service.py에서 M6 프롬프트 + 23개 분류 체계 이동

Phase 2-2 완료: AR/CRS 감지 + 엔티티 연결 + 표시명 생성이 어댑터로 이동됨.
- detect_special_documents(): AR/CRS 패턴 매칭 (순수 텍스트 분석)
- resolve_entity(): 고객명 → aims_api 검색 → 고객 ID 연결
- generate_display_name(): AR/CRS 표시명 생성

Phase 2-5 완료: on_stage_complete() 단계별 후크 구현.
- upload_complete: 고객 연결 + SSE 진행률 알림
- meta_extracted: SSE 진행률 알림
- ar_detected: AR 상태 업데이트 + SSE + 파싱 트리거
- crs_detected: CRS 상태 업데이트 + SSE
- embedding_complete: displayName 생성 + 바이러스 스캔
- pre_embedding: 크레딧 체크 (부족 시 SKIP_REMAINING)

아직 스텁인 메서드:
- 메타데이터 추출: doc_meta.py, meta_service.py
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
    StageHookAction,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 분류 체계 상수 — openai_service.py에서 이동 (M6 프롬프트, 91.8% 정확도)
# @see docs/DOCUMENT_TAXONOMY.md
# ---------------------------------------------------------------------------

# 유효 문서 유형 (INSURANCE_CATEGORIES와 1:1 대응해야 함)
VALID_DOCUMENT_TYPES = {
    # 1. 보험계약 (insurance)
    "policy", "coverage_analysis", "application", "plan_design", "insurance_etc",
    # 2. 보험금 청구 (claim)
    "diagnosis", "medical_receipt", "claim_form", "consent_delegation",
    # 3. 신분/증명 (identity)
    "id_card", "family_cert", "personal_docs",
    # 4. 건강/의료 (medical)
    "health_checkup",
    # 5. 자산/금융 (asset)
    "asset_document", "inheritance_gift", "bank_account",
    # 6. 법인 (corporate)
    "corp_basic", "hr_document", "corp_tax", "corp_asset", "legal_document",
    # 7. 기타 (etc)
    "general", "unclassifiable",
}

# AI 분류에서 이 값이 나오면 general로 교체 (시스템 전용 유형)
SYSTEM_ONLY_TYPES = {"annual_report", "customer_review", "unspecified"}

# DB 레거시 값 → 현재 유효 타입으로 매핑 (alias)
LEGACY_TYPE_ALIASES = {
    "proposal": "plan_design",  # 가입설계서/제안서 → plan_design으로 통합
}

# 분류 체계를 Category 객체로 정의 (대분류 → 소분류 구조)
INSURANCE_CATEGORIES = [
    # 1. 보험계약
    Category(code="policy", name="보험증권", parent="insurance"),
    Category(code="coverage_analysis", name="보장분석", parent="insurance"),
    Category(code="application", name="청약서/가입신청서", parent="insurance"),
    Category(code="plan_design", name="설계서/제안서", parent="insurance"),
    Category(code="insurance_etc", name="기타보험", parent="insurance"),
    # 2. 보험금 청구
    Category(code="diagnosis", name="진단서/소견서", parent="claim"),
    Category(code="medical_receipt", name="진료비영수증", parent="claim"),
    Category(code="claim_form", name="보험금청구서", parent="claim"),
    Category(code="consent_delegation", name="동의서/위임장", parent="claim"),
    # 3. 신분/증명
    Category(code="id_card", name="신분증", parent="identity"),
    Category(code="family_cert", name="가족관계증명서", parent="identity"),
    Category(code="personal_docs", name="개인서류", parent="identity"),
    # 4. 건강/의료
    Category(code="health_checkup", name="건강검진결과", parent="medical"),
    # 5. 자산/금융
    Category(code="asset_document", name="자산서류", parent="asset"),
    Category(code="inheritance_gift", name="상속/증여", parent="asset"),
    Category(code="bank_account", name="통장사본", parent="asset"),
    # 6. 법인
    Category(code="corp_basic", name="법인기본서류", parent="corporate"),
    Category(code="hr_document", name="인사서류", parent="corporate"),
    Category(code="corp_tax", name="법인세무", parent="corporate"),
    Category(code="corp_asset", name="법인자산", parent="corporate"),
    Category(code="legal_document", name="법률문서", parent="corporate"),
    # 7. 기타
    Category(code="general", name="일반", parent="etc"),
    Category(code="unclassifiable", name="분류불가", parent="etc"),
]

CLASSIFICATION_SYSTEM_PROMPT = (
    "보험설계사 문서분류기. JSON만 응답. "
    "annual_report/customer_review/unspecified 선택 금지. "
    "general은 23개 유형 어디에도 해당하지 않을 때만 선택. "
    "텍스트가 부실해도 파일명이나 별칭에서 유형을 추론 가능하면 반드시 해당 유형으로 분류! "
    "예: 별칭 '체류기간 정보'→id_card, '카드 정보'→personal_docs. "
    "unclassifiable은 텍스트·파일명·별칭 모두에서 전혀 추론 불가할 때만."
)

CLASSIFICATION_USER_PROMPT = """보험설계사가 관리하는 고객 문서를 아래 23개 유형 중 하나로 분류하세요.

[대분류 → 소분류]

보험계약: policy(보험증권-보험사 발행 계약확인 문서, 증권번호·보험기간 확정), coverage_analysis(보장분석/보장범위분석 보고서), application(청약서/가입신청서-법인자동차 청약서 포함), plan_design(설계서/제안서/비교표/컨설팅/가입제안서/견적/보장내용비교/가입안내서/법인컨설팅/종합재무컨설팅/미처분이익잉여금/치매간병설계), insurance_etc(약관/계약변경/해지/보험가입현황/적립금현황/보유계약리스트/지급내역/질권설정/기타보험/상품설명서/보험명단/해약환급금정리/보험정리표/담보삭제/계약내용변경/자필서류/자필확인서)
보험금청구: diagnosis(진단서/소견서/입퇴원확인서/의무기록/진료차트/처방전/검사결과지), medical_receipt(진료비영수증/진료비계산서/약제비계산서/병원비영수증), claim_form(보험금청구서/사고접수/사고증명/사고통지서), consent_delegation(동의서/위임장/FATCA확인서/고객거래확인서)
신분증명: id_card(주민등록증/운전면허증/여권/신분증 사본), family_cert(가족관계증명서/주민등록등본), personal_docs(개인통장/개인인감증명서/명함/금융거래확인서)
건강: health_checkup(건강검진결과/종합검진/암검진)
자산: asset_document(개인소득증명/재직증명/개인부동산등기/건물가액평가), inheritance_gift(상속/증여), bank_account(통장사본/예금통장/은행통장/계좌사본)
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
- 사람 이름은 문서의 '계약자'를 기준으로 사용 (피보험자가 아닌 계약자)
- 계약자명은 반드시 title의 맨 앞에 표시 (예: '[계약자] 현대해상 자동차보험 2023.04')
- 문서에 없는 이름은 절대 사용 금지 (이름을 지어내지 말 것)
- 계약자를 찾을 수 없으면 이름 없이 생성

[문서 메타정보 (참고용 — 본문 내용과 충돌 시 본문 우선!)]
{file_info}
[본문]
{text}

JSON:
{{"type":"diagnosis","confidence":0.85,"title":"삼성화재 진단서 2024.03(30자이내 핵심제목)","summary":"3~5줄 요약"}}
"""


class InsuranceDomainAdapter(DomainAdapter):
    """AIMS 보험 도메인 어댑터

    Phase 2-1 완료: get_classification_config()에 분류 체계 + M6 프롬프트 구현.
    Phase 2-2 완료: detect_special_documents(), resolve_entity(), generate_display_name() 구현.
    Phase 2-5 완료: on_stage_complete() 단계별 후크 구현.
    """

    async def get_classification_config(self) -> ClassificationConfig:
        """분류 체계 + 프롬프트 반환

        openai_service.py의 M6 프롬프트 (91.8% 정확도)를 그대로 이동.
        xPipe 코어가 이 config로 분류+요약 통합 AI 호출을 수행한다.
        """
        return ClassificationConfig(
            categories=list(INSURANCE_CATEGORIES),
            prompt_template=CLASSIFICATION_USER_PROMPT,
            valid_types=sorted(VALID_DOCUMENT_TYPES),
            extra={
                "system_prompt": CLASSIFICATION_SYSTEM_PROMPT,
                "system_only_types": SYSTEM_ONLY_TYPES,
            },
        )

    # ------------------------------------------------------------------
    # AR/CRS 감지 — doc_prep_main.py에서 이동 (순수 텍스트 분석만)
    # ------------------------------------------------------------------

    async def detect_special_documents(
        self,
        text: str,
        mime_type: str,
        filename: str = "",
    ) -> list[Detection]:
        """AR/CRS 특수 문서 감지 (순수 텍스트 분석 — HTTP 호출 없음)

        doc_prep_main.py의 _detect_and_process_annual_report() /
        _detect_and_process_customer_review()에서 패턴 매칭 + 메타 추출 로직을 이동.
        DB 업데이트, SSE 알림, 고객 검색은 포함하지 않는다.

        감지 조건: mime == "application/pdf" and full_text 존재
        AR/CRS 감지 실패가 전체 파이프라인을 중단시키지 않도록 개별 격리.
        """
        detections: list[Detection] = []

        if mime_type != "application/pdf" or not text or not text.strip():
            return detections

        # AR 감지 시도
        ar = _detect_ar_pattern(text)
        if ar is not None:
            detections.append(ar)
            # AR이면 CRS는 시도하지 않음 (기존 로직과 동일)
            return detections

        # CRS 감지 시도
        crs = _detect_crs_pattern(text)
        if crs is not None:
            detections.append(crs)

        return detections

    # ------------------------------------------------------------------
    # 엔티티 연결 — 고객명으로 aims_api 검색
    # ------------------------------------------------------------------

    async def resolve_entity(
        self,
        detection: Detection,
        owner_id: str,
    ) -> dict[str, Any]:
        """고객명 → aims_api 검색 → 고객 ID 연결

        AR/CRS에서 추출된 고객명으로 aims_api를 검색하여 매칭되는 고객을 찾는다.
        customerId(소유권)는 변경하지 않고, relatedCustomerId로만 연결한다.

        Args:
            detection: detect_special_documents()의 결과
            owner_id: 설계사 ID (소유자 격리)

        Returns:
            {"matched": True, "customer_id": str, "customer_name": str} 또는
            {"matched": False, "reason": str}
        """
        customer_name = detection.metadata.get("customer_name")
        if not customer_name or not owner_id:
            return {"matched": False, "reason": "no_customer_name_or_owner"}

        try:
            from config import get_settings
            settings = get_settings()

            async with httpx.AsyncClient() as client:
                search_response = await client.get(
                    f"{settings.AIMS_API_URL}/api/customers",
                    params={"search": customer_name, "userId": owner_id},
                    headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                    timeout=10.0
                )

                if search_response.status_code == 200:
                    search_result = search_response.json()
                    customers = search_result.get("data", {}).get("customers", [])

                    # 정확히 일치하는 고객 찾기
                    for c in customers:
                        c_name = c.get("personal_info", {}).get("name", "")
                        if c_name == customer_name:
                            customer_id = c.get("_id")
                            logger.info(f"엔티티 연결 성공: {customer_name} (ID: {customer_id})")
                            return {
                                "matched": True,
                                "customer_id": customer_id,
                                "customer_name": customer_name,
                            }

                    return {"matched": False, "reason": "no_exact_match"}
                else:
                    logger.warning(f"고객 검색 실패: {search_response.text}")
                    return {"matched": False, "reason": f"api_error_{search_response.status_code}"}
        except Exception as e:
            logger.warning(f"고객 검색 중 오류: {e}")
            return {"matched": False, "reason": f"exception: {e}"}

    async def extract_domain_metadata(
        self,
        text: str,
        filename: str,
    ) -> dict[str, Any]:
        """보험 도메인 메타데이터 추출

        # TODO: Phase 2-3 이후 이동 예정
        # 현재 위치: doc_meta.py + meta_service.py
        """
        return {}

    # ------------------------------------------------------------------
    # 표시명 생성 — AR/CRS 전용
    # ------------------------------------------------------------------

    async def generate_display_name(
        self,
        doc: dict[str, Any],
        detection: Optional[Detection] = None,
    ) -> str:
        """AR/CRS 문서 표시명 생성

        AR: {고객명}_AR_{발행일}.pdf
        CRS: {고객명}_CRS_{상품명}_{발행일}.pdf (상품명 없으면 생략)

        detection이 None이거나 AR/CRS가 아니면 빈 문자열 반환
        (xPipe 코어가 기본 규칙 적용).
        """
        if detection is None:
            return ""

        customer_name = detection.metadata.get("customer_name")
        issue_date = detection.metadata.get("issue_date")

        if detection.doc_type == "annual_report":
            if customer_name and issue_date:
                return f"{customer_name}_AR_{issue_date}.pdf"
            return ""

        if detection.doc_type == "customer_review":
            product_name = detection.metadata.get("product_name")
            if customer_name and product_name and issue_date:
                # 상품명 정규화 (파일명에 사용 불가 문자 제거)
                safe_product = re.sub(r'[\\/:*?"<>|]', '', product_name)
                safe_product = re.sub(r'\s+', ' ', safe_product).strip()
                return f"{customer_name}_CRS_{safe_product}_{issue_date}.pdf"
            elif customer_name and issue_date:
                return f"{customer_name}_CRS_{issue_date}.pdf"
            return ""

        return ""

    async def on_stage_complete(
        self,
        stage: str,
        doc: dict[str, Any],
        context: dict[str, Any],
    ) -> list[HookResult]:
        """단계 완료 시 보험 도메인 후속 액션 반환

        액션을 반환할 뿐 직접 실행하지 않는다. xPipe 코어가 HookResult를 받아 실행.

        stage 값에 따른 후속 액션:
        - "upload_complete": 고객 연결 요청
        - "meta_extracted": SSE 진행률 알림 요청
        - "ar_detected": AR 상태 변경 SSE + 상태 업데이트 + AR 파싱 트리거
        - "crs_detected": CRS 상태 변경 SSE + 상태 업데이트
        - "embedding_complete": displayName 생성 + 바이러스 스캔 요청
        - "pre_embedding": 크레딧 체크 요청 (부족 시 SKIP_REMAINING)

        Args:
            stage: 완료된 파이프라인 단계 이름
            doc: 현재 문서 데이터 (MongoDB 문서 구조)
            context: 단계별 추가 컨텍스트

        Returns:
            수행할 후속 액션 목록 (빈 리스트이면 후속 액션 없음)
        """
        handlers = {
            "upload_complete": self._hooks_upload_complete,
            "meta_extracted": self._hooks_meta_extracted,
            "ar_detected": self._hooks_ar_detected,
            "crs_detected": self._hooks_crs_detected,
            "embedding_complete": self._hooks_embedding_complete,
            "pre_embedding": self._hooks_pre_embedding,
        }

        handler = handlers.get(stage)
        if handler is None:
            return []

        return handler(doc, context)

    # ------------------------------------------------------------------
    # 단계별 후크 핸들러 (순수 함수 — HTTP 호출/DB 접근 없음)
    # ------------------------------------------------------------------

    def _hooks_upload_complete(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """업로드 완료 후: 고객 연결 요청

        context에 customer_id가 있으면 고객 문서 연결 액션을 반환한다.
        """
        results: list[HookResult] = []

        customer_id = context.get("customer_id") or doc.get("customerId")
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        user_id = context.get("user_id") or doc.get("ownerId", "")

        if customer_id and doc_id and user_id:
            results.append(HookResult(
                action=StageHookAction.TRIGGER_PROCESS,
                payload={
                    "process": "connect_document_to_customer",
                    "customer_id": str(customer_id),
                    "doc_id": doc_id,
                    "user_id": user_id,
                },
            ))

        # SSE 진행률 알림: 업로드 완료 (20%)
        results.append(HookResult(
            action=StageHookAction.NOTIFY,
            payload={
                "channel": "sse",
                "event": "document-progress",
                "doc_id": doc_id,
                "owner_id": user_id,
                "progress": 20,
                "stage": "upload",
                "message": "파일 업로드 완료",
            },
        ))

        return results

    def _hooks_meta_extracted(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """메타데이터 추출 완료 후: SSE 진행률 알림"""
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        owner_id = context.get("user_id") or doc.get("ownerId", "")

        return [HookResult(
            action=StageHookAction.NOTIFY,
            payload={
                "channel": "sse",
                "event": "document-progress",
                "doc_id": doc_id,
                "owner_id": owner_id,
                "progress": 50,
                "stage": "meta",
                "message": "메타데이터 추출 완료",
            },
        )]

    def _hooks_ar_detected(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """AR 감지 후: 상태 업데이트 + SSE 알림 + AR 파싱 트리거

        context 필수 키:
        - related_customer_id: 연결된 고객 ID
        - detection: Detection 객체 (metadata에 customer_name, issue_date 포함)
        """
        results: list[HookResult] = []
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        related_customer_id = context.get("related_customer_id")

        # 1. AR 플래그 + 상태 업데이트
        detection = context.get("detection")
        display_name = context.get("display_name", "")
        update_fields: dict[str, Any] = {
            "is_annual_report": True,
            "document_type": "annual_report",
            "ar_parsing_status": "pending",
        }
        if related_customer_id:
            update_fields["relatedCustomerId"] = str(related_customer_id)
        if display_name:
            update_fields["displayName"] = display_name
        if detection and hasattr(detection, "metadata"):
            issue_date = detection.metadata.get("issue_date")
            if issue_date:
                update_fields["ar_issue_date"] = issue_date

        results.append(HookResult(
            action=StageHookAction.UPDATE_STATUS,
            payload={
                "doc_id": doc_id,
                "fields": update_fields,
                "add_to_set": {"tags": "AR"},
            },
        ))

        # 2. SSE 알림: ar-status-change (고객 ID가 있을 때만)
        if related_customer_id:
            results.append(HookResult(
                action=StageHookAction.NOTIFY,
                payload={
                    "channel": "sse",
                    "event": "ar-status-change",
                    "customer_id": str(related_customer_id),
                    "file_id": doc_id,
                    "status": "pending",
                },
            ))

        # 3. AR 파싱 트리거 (annual_report_api 스캐너가 처리)
        results.append(HookResult(
            action=StageHookAction.TRIGGER_PROCESS,
            payload={
                "process": "ar_parsing",
                "doc_id": doc_id,
                "related_customer_id": str(related_customer_id) if related_customer_id else None,
            },
        ))

        return results

    def _hooks_crs_detected(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """CRS 감지 후: 상태 업데이트 + SSE 알림

        context 필수 키:
        - related_customer_id: 연결된 고객 ID
        - detection: Detection 객체 (metadata에 customer_name, product_name, issue_date 포함)
        """
        results: list[HookResult] = []
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        related_customer_id = context.get("related_customer_id")

        # 1. CRS 플래그 + 상태 업데이트
        display_name = context.get("display_name", "")
        update_fields: dict[str, Any] = {
            "is_customer_review": True,
            "document_type": "customer_review",
            "cr_parsing_status": "pending",
        }
        if related_customer_id:
            update_fields["relatedCustomerId"] = str(related_customer_id)
        if display_name:
            update_fields["displayName"] = display_name

        results.append(HookResult(
            action=StageHookAction.UPDATE_STATUS,
            payload={
                "doc_id": doc_id,
                "fields": update_fields,
                "add_to_set": {"tags": "CRS"},
            },
        ))

        # 2. SSE 알림: cr-status-change (고객 ID가 있을 때만)
        if related_customer_id:
            results.append(HookResult(
                action=StageHookAction.NOTIFY,
                payload={
                    "channel": "sse",
                    "event": "cr-status-change",
                    "customer_id": str(related_customer_id),
                    "file_id": doc_id,
                    "status": "pending",
                },
            ))

        return results

    def _hooks_embedding_complete(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """임베딩 완료 후: displayName 생성 + 바이러스 스캔 트리거

        AR/CRS 문서는 displayName을 이미 가지고 있으므로 생성 스킵.
        """
        results: list[HookResult] = []
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        owner_id = context.get("owner_id") or doc.get("ownerId", "")

        # 1. displayName 자동 생성 (AR/CRS가 아니고 displayName이 없는 문서만)
        has_display_name = bool(doc.get("displayName"))
        is_ar = doc.get("is_annual_report", False)
        is_crs = doc.get("is_customer_review", False)
        tags = doc.get("tags") or []
        is_ar_crs = is_ar or is_crs or ("AR" in tags) or ("CRS" in tags)

        if not has_display_name and not is_ar_crs and owner_id:
            results.append(HookResult(
                action=StageHookAction.TRIGGER_PROCESS,
                payload={
                    "process": "generate_display_name",
                    "doc_id": doc_id,
                    "owner_id": owner_id,
                },
            ))

        # 2. 바이러스 스캔 트리거 (모든 완료 문서)
        results.append(HookResult(
            action=StageHookAction.TRIGGER_PROCESS,
            payload={
                "process": "virus_scan",
                "doc_id": doc_id,
                "owner_id": owner_id,
            },
        ))

        return results

    def _hooks_pre_embedding(
        self, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        """임베딩 전: 크레딧 체크 요청

        context 키:
        - credit_check_result: 크레딧 체크 API 응답 (이미 수행된 경우)
        - reprocessed_from_credit_pending: True면 크레딧 체크 스킵
        - estimated_pages: 예상 페이지 수

        크레딧이 부족하면 SKIP_REMAINING을 반환하여 임베딩을 중단한다.
        """
        results: list[HookResult] = []
        doc_id = context.get("doc_id") or str(doc.get("_id", ""))
        owner_id = context.get("owner_id") or doc.get("ownerId", "")

        # credit_pending에서 재처리된 문서는 크레딧 체크 스킵
        is_reprocessed = context.get("reprocessed_from_credit_pending", False)
        if is_reprocessed:
            return []

        # 크레딧 체크 요청
        estimated_pages = context.get("estimated_pages", 1)
        credit_result = context.get("credit_check_result")

        if credit_result and not credit_result.get("allowed", False):
            # 크레딧 부족: 상태 업데이트 + 이후 단계 스킵
            results.append(HookResult(
                action=StageHookAction.UPDATE_STATUS,
                payload={
                    "doc_id": doc_id,
                    "fields": {
                        "status": "credit_pending",
                        "overallStatus": "credit_pending",
                        "docembed.status": "credit_pending",
                        "docembed.credit_pending_since": True,  # 타임스탬프는 코어에서 설정
                        "docembed.credit_info": {
                            "credits_remaining": credit_result.get("credits_remaining", 0),
                            "credit_quota": credit_result.get("credit_quota", 0),
                            "days_until_reset": credit_result.get("days_until_reset", 0),
                            "estimated_credits": credit_result.get("estimated_credits", 0),
                        },
                    },
                },
            ))
            results.append(HookResult(
                action=StageHookAction.SKIP_REMAINING,
                payload={
                    "reason": "credit_insufficient",
                    "doc_id": doc_id,
                    "owner_id": owner_id,
                    "credits_remaining": credit_result.get("credits_remaining", 0),
                },
            ))
        else:
            # 크레딧 체크가 아직 수행되지 않았으면 체크 요청
            if credit_result is None:
                results.append(HookResult(
                    action=StageHookAction.TRIGGER_PROCESS,
                    payload={
                        "process": "check_credit",
                        "owner_id": owner_id,
                        "doc_id": doc_id,
                        "estimated_pages": estimated_pages,
                    },
                ))

        return results


# ---------------------------------------------------------------------------
# 순수 함수: AR/CRS 패턴 매칭 (HTTP 호출 없음, 테스트 용이)
# doc_prep_main.py의 _detect_and_process_annual_report() /
# _detect_and_process_customer_review()에서 패턴 매칭 로직을 1글자도 변경 없이 이동.
# ---------------------------------------------------------------------------

def _detect_ar_pattern(full_text: str) -> Optional[Detection]:
    """AR (Annual Review Report) 패턴 매칭 + 메타데이터 추출

    Returns:
        Detection 객체 (AR 감지 시) 또는 None
    """
    # 1. AR 패턴 매칭 (공백 정규화)
    normalized_text = re.sub(r'\s+', ' ', full_text)

    # 필수 키워드: "Annual Review Report"
    required_keywords = ['Annual Review Report']
    # 선택 키워드: MetLife 관련
    optional_keywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명', '메트라이프']

    matched_required = [kw for kw in required_keywords if kw in normalized_text]
    matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

    # AR 판단: 필수 키워드 1개 이상 + 선택 키워드 1개 이상
    is_annual_report = len(matched_required) > 0 and len(matched_optional) > 0

    if not is_annual_report:
        return None

    # 2. 고객명 추출: "Annual" 키워드가 포함된 줄의 바로 위 줄에서 추출 (파일명 사용 절대 금지!)
    customer_name = None
    lines = full_text.split('\n')
    for i, line in enumerate(lines):
        if 'Annual' in line:
            if i > 0:
                name_line = lines[i - 1].strip()
                go_idx = name_line.find(' 고')
                if go_idx > 0:
                    name = name_line[:go_idx]
                else:
                    space_idx = name_line.find(' ')
                    name = name_line[:space_idx] if space_idx > 0 else name_line
                if len(name) >= 2:
                    customer_name = name
            break

    # 3. 발행기준일 추출
    issue_date = None
    date_pattern1 = r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년?\s*[\-.]?\s*(\d{1,2})월?\s*[\-.]?\s*(\d{1,2})일?'
    date_match1 = re.search(date_pattern1, normalized_text)
    if date_match1:
        year, month, day = date_match1.groups()
        issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    else:
        date_pattern2 = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
        date_match2 = re.search(date_pattern2, normalized_text)
        if date_match2:
            year, month, day = date_match2.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    return Detection(
        doc_type="annual_report",
        confidence=1.0,
        metadata={
            "customer_name": customer_name,
            "issue_date": issue_date,
            "matched_required": matched_required,
            "matched_optional": matched_optional,
        },
    )


def _detect_crs_pattern(full_text: str) -> Optional[Detection]:
    """CRS (Customer Review Service) 패턴 매칭 + 메타데이터 추출

    Returns:
        Detection 객체 (CRS 감지 시) 또는 None
    """
    # 1. CRS 패턴 매칭
    normalized_text = re.sub(r'\s+', ' ', full_text)

    required_keywords = ['Customer Review Service']
    optional_keywords = ['메트라이프', '변액', '적립금', '투자수익률', '펀드', '해지환급금']

    matched_required = [kw for kw in required_keywords if kw in normalized_text]
    matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

    # CRS 판단: "Customer Review Service" 필수 + 선택 키워드 1개 이상
    has_cr_keyword = "Customer Review Service" in normalized_text
    is_customer_review = has_cr_keyword and len(matched_optional) >= 1

    if not is_customer_review:
        return None

    # 2. 메타데이터 추출 (고객명, 상품명, 발행일)

    # 2-1. 고객명 추출: "Customer" 키워드가 포함된 줄의 바로 위 줄에서 추출 (파일명 사용 절대 금지!)
    customer_name = None
    lines = full_text.split('\n')
    for i, line in enumerate(lines):
        if 'Customer' in line:
            if i > 0:
                name_line = lines[i - 1].strip()
                go_idx = name_line.find(' 고')
                if go_idx > 0:
                    name = name_line[:go_idx]
                else:
                    space_idx = name_line.find(' ')
                    name = name_line[:space_idx] if space_idx > 0 else name_line
                if len(name) >= 2:
                    customer_name = name
            break
    # fallback: "계약자" 필드에서 추출
    if not customer_name:
        contractor_idx = normalized_text.find('계약자')
        if contractor_idx >= 0:
            after = normalized_text[contractor_idx + 3:]
            while after and after[0] in (':', '：', ' '):
                after = after[1:]
            space_idx = after.find(' ')
            name = after[:space_idx].strip() if space_idx > 0 else after.strip()
            if len(name) >= 2:
                customer_name = name

    # 2-2. 상품명 추출: 발행일 바로 윗줄이 상품명
    product_name = None
    발행_idx = full_text.find("발행")
    if 발행_idx > 0:
        before = full_text[:발행_idx].rstrip()
        nl = before.rfind("\n")
        if nl >= 0:
            product_name = before[nl + 1:].strip()
            if not product_name:
                product_name = None

    # 2-3. 발행일 추출
    issue_date = None
    date_pattern = r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
    date_match = re.search(date_pattern, full_text)
    if date_match:
        year, month, day = date_match.groups()
        issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    else:
        # 대체 패턴: 일반 날짜
        alt_date_pattern = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
        alt_date_match = re.search(alt_date_pattern, full_text)
        if alt_date_match:
            year, month, day = alt_date_match.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    return Detection(
        doc_type="customer_review",
        confidence=1.0,
        metadata={
            "customer_name": customer_name,
            "product_name": product_name,
            "issue_date": issue_date,
            "matched_required": matched_required,
            "matched_optional": matched_optional,
        },
    )
