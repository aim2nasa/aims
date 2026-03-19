"""
InsuranceDomainAdapter — AIMS 보험 도메인 어댑터 스텁

DomainAdapter ABC를 상속하여 모든 abstract 메서드를 스텁으로 구현한다.
Phase 2에서 기존 코드(doc_prep_main.py 등)의 실제 로직을 이 클래스로 이동.

현재 로직 위치 참조:
- 분류: openai_service.py (M6 프롬프트, 분류+요약 통합 AI 호출)
- AR/CRS 감지: doc_prep_main.py _step_detect_ar_crs() (L1467-1498)
- 엔티티 연결: doc_prep_main.py _detect_and_process_annual_report() 내부
- 메타데이터 추출: doc_meta.py, meta_service.py
- 표시명 생성: doc_display_name.py, doc_prep_main.py _generate_display_name() (L1501-1550)
- 단계 후크: doc_prep_main.py _notify_progress() + SSE 알림
"""
from __future__ import annotations

from typing import Any, Optional

from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
)


class InsuranceDomainAdapter(DomainAdapter):
    """AIMS 보험 도메인 어댑터

    Phase 1: 모든 메서드가 스텁 (기본값 반환).
    Phase 2: doc_prep_main.py, openai_service.py 등에서 실제 로직 이동.
    """

    async def get_classification_config(self) -> ClassificationConfig:
        """분류 체계 + 프롬프트 반환

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치: openai_service.py — M6 프롬프트 + 7대분류/25소분류 체계
        # 분류+요약 통합 AI 호출 구조를 보존하면서, 프롬프트/카테고리만 어댑터로 분리
        """
        return ClassificationConfig(
            categories=[],
            prompt_template="",
            valid_types=[],
            extra={},
        )

    async def detect_special_documents(
        self,
        text: str,
        mime_type: str,
        filename: str = "",
    ) -> list[Detection]:
        """AR/CRS 특수 문서 감지

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치: doc_prep_main.py _step_detect_ar_crs() (L1467-1498)
        #   - _detect_and_process_annual_report(): AR 감지 (PDF + 텍스트 기반)
        #   - _detect_and_process_customer_review(): CRS 감지
        # 감지 조건: mime == "application/pdf" and full_text 존재
        # AR/CRS 감지 실패 시 문서 처리 전체를 중단시키지 않도록 개별 격리
        """
        return []

    async def resolve_entity(
        self,
        detection: Detection,
        owner_id: str,
    ) -> dict[str, Any]:
        """고객명 → 고객 ID 연결

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치: doc_prep_main.py _detect_and_process_annual_report() 내부
        #   - extract_customer_info_from_first_page()로 고객명 추출
        #   - MongoDB customers 컬렉션에서 고객명 매칭 (소유자 격리)
        #   - 매칭 성공 시 customerId 연결
        """
        return {"matched": False, "reason": "stub_not_implemented"}

    async def extract_domain_metadata(
        self,
        text: str,
        filename: str,
    ) -> dict[str, Any]:
        """보험 도메인 메타데이터 추출

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치: doc_meta.py + meta_service.py
        #   - MetaService.extract_metadata(): 범용 메타 (MIME, 크기, 해시, 페이지 수 등)
        #   - doc_prep_main.py _step_extract_metadata() (L1309-1379): DB 업데이트 포함
        # 보험 특화 필드: policyholder, insured, policy_number, insurance_company 등
        # 주의: 범용 메타(MIME, 크기 등)는 xPipe 코어가 추출. 여기서는 도메인 특화 필드만.
        """
        return {}

    async def generate_display_name(
        self,
        doc: dict[str, Any],
        detection: Optional[Detection] = None,
    ) -> str:
        """보험 문서 표시명 생성 규칙

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치:
        #   - doc_display_name.py: 표시명 생성 라우터 + sanitize_display_name()
        #   - doc_prep_main.py _generate_display_name() (L1501-1550)
        #     1순위: summary_result에서 이미 생성된 title (추가 API 비용 없음)
        #     2순위: OpenAIService.generate_title_only() 경량 호출
        # 보험 표시명 규칙: 계약자명 맨 앞 표시, 문서에 없는 이름 생성 금지
        """
        return ""

    async def on_stage_complete(
        self,
        stage: str,
        doc: dict[str, Any],
        context: dict[str, Any],
    ) -> list[HookResult]:
        """단계 완료 시 보험 도메인 후속 액션

        # TODO: Phase 2에서 실제 로직 이동
        # 현재 위치: doc_prep_main.py 전반
        #   - _notify_progress(): SSE를 통한 프론트엔드 진행률 알림
        #   - AR 감지 시: annual_report_api로 파싱 요청 트리거
        #   - 크레딧 체크: check_credit_for_upload() (L126-176)
        #     credit_pending → 충전 시 reprocessed_from_credit_pending 플래그 → 크레딧 체크 스킵
        #   - 바이러스 스캔: yuri 바이러스 스캔 (별도 서비스)
        """
        return []
