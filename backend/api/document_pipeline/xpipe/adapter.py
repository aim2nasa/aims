"""
DomainAdapter ABC — 도메인별 문서 처리 로직의 통합 플러그인 인터페이스

설계 원칙:
- xPipe 코어는 도메인 로직을 모른다. 어댑터가 config/규칙을 제공하면 코어가 실행한다.
- 분류+요약 통합 AI 호출은 xPipe 코어가 관리한다. 어댑터는 config(프롬프트, 분류 체계)만 제공.
- 모든 메서드는 async이며, 기본 구현(no-op)을 제공하여 필요한 메서드만 오버라이드 가능.
- Detection, Category 등 데이터 클래스는 도메인 무관하게 설계.

"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# 데이터 클래스
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Category:
    """분류 체계의 단일 카테고리

    Attributes:
        code: 시스템 내부 식별 코드 (예: "type_a", "type_b")
        name: 사용자 표시용 이름 (예: "유형A", "유형B")
        parent: 부모 카테고리 코드. 최상위이면 None (예: "domain_x")
    """
    code: str
    name: str
    parent: Optional[str] = None


@dataclass
class Detection:
    """특수 문서 감지 결과

    파이프라인 중간 단계에서 도메인 특화 문서를 감지했을 때 반환.
    예: 특정 도메인의 특수문서 패턴 감지.

    Attributes:
        doc_type: 감지된 문서 유형 식별자 (예: "special_type_a", "special_type_b")
        confidence: 감지 신뢰도 (0.0 ~ 1.0)
        metadata: 감지 시 추출된 부가 정보 (도메인별 자유 구조)
    """
    doc_type: str
    confidence: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ClassificationConfig:
    """AI 분류를 위한 설정 (xPipe 코어에 전달)

    xPipe 코어는 이 config를 기반으로 분류+요약 통합 AI 호출을 수행한다.
    어댑터가 AI를 직접 호출하지 않음으로써, 호출 횟수 최적화를 보존한다.

    Attributes:
        categories: 분류 체계를 구성하는 카테고리 목록
        prompt_template: AI에 전달할 분류 프롬프트 템플릿.
            `{text}`, `{filename}` 등의 플레이스홀더를 포함할 수 있다.
        valid_types: 유효한 document_type 문자열 목록 (AI 응답 검증용)
        extra: 도메인별 추가 설정 (예: 분류 규칙, 후처리 매핑 등)
    """
    categories: list[Category]
    prompt_template: str
    valid_types: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


class StageHookAction(Enum):
    """on_stage_complete에서 반환할 수 있는 후속 액션 유형"""
    NOTIFY = "notify"           # 알림 전송 (SSE, 웹훅 등)
    UPDATE_STATUS = "update_status"  # 문서 상태 변경
    TRIGGER_PROCESS = "trigger_process"  # 추가 처리 트리거 (예: 특수문서 전용 파이프라인)
    SKIP_REMAINING = "skip_remaining"  # 이후 단계 스킵
    NOOP = "noop"               # 아무것도 하지 않음


@dataclass
class HookResult:
    """on_stage_complete 후크의 단일 액션 결과

    Attributes:
        action: 수행할 액션 유형
        payload: 액션별 데이터 (도메인별 자유 구조)
    """
    action: StageHookAction
    payload: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# DomainAdapter ABC
# ---------------------------------------------------------------------------

class DomainAdapter(ABC):
    """도메인별 통합 어댑터 — AI 호출 최적화를 위해 단일 인터페이스로 통합

    xPipe 코어가 파이프라인 각 단계에서 이 어댑터의 메서드를 호출한다.
    모든 메서드는 async이며, 기본 구현(no-op)을 제공한다.
    어댑터 구현체는 도메인에 필요한 메서드만 오버라이드하면 된다.

    하위 호환성 원칙:
    - 신규 메서드 추가 시 반드시 기본 구현(no-op)을 함께 제공한다.
    - 기존 메서드 시그니처 변경 금지. 확장이 필요하면 새 메서드를 추가한다.
    """

    # --- 분류 ---

    @abstractmethod
    async def get_classification_config(self) -> ClassificationConfig:
        """분류 체계 + 프롬프트 반환

        xPipe 코어가 이 config로 AI 호출을 수행한다 (분류+요약 통합 유지).
        어댑터는 AI를 직접 호출하지 않는다.

        Returns:
            ClassificationConfig: 분류 카테고리, 프롬프트 템플릿, 유효 타입 등
        """
        ...

    # --- 특수 문서 감지 (파이프라인 중간 분기) ---

    @abstractmethod
    async def detect_special_documents(
        self,
        text: str,
        mime_type: str,
        filename: str = "",
    ) -> list[Detection]:
        """도메인 특화 문서 감지

        파이프라인 중간에서 호출되며, 감지 결과에 따라 후속 처리가 분기된다.
        예: 특수문서 감지 → 전용 처리 파이프라인 트리거.

        Args:
            text: 추출된 전체 텍스트
            mime_type: 감지된 MIME 타입
            filename: 원본 파일명 (보조 판단용, 의존 금지)

        Returns:
            감지된 특수 문서 목록. 없으면 빈 리스트.
        """
        ...

    # --- 엔티티 연결 ---

    @abstractmethod
    async def resolve_entity(
        self,
        detection: Detection,
        owner_id: str,
    ) -> dict[str, Any]:
        """감지된 특수 문서에서 엔티티 연결 수행

        예: 엔티티명 → 엔티티 ID 연결.

        Args:
            detection: detect_special_documents()의 결과 중 하나
            owner_id: 문서 소유자 ID

        Returns:
            연결 결과. 도메인별 자유 구조.
            예: {"entity_id": "abc123", "entity_name": "홍길동", "matched": True}
            연결 실패 시: {"matched": False, "reason": "entity_not_found"}
        """
        ...

    # --- 도메인 메타데이터 추출 ---

    @abstractmethod
    async def extract_domain_metadata(
        self,
        text: str,
        filename: str,
    ) -> dict[str, Any]:
        """도메인 특화 메타데이터 추출

        xPipe 코어가 추출하는 범용 메타데이터(MIME, 크기, 해시 등)와 별도로,
        도메인 특화 필드를 추출한다.

        Args:
            text: 추출된 전체 텍스트
            filename: 원본 파일명

        Returns:
            도메인 특화 메타데이터. 도메인별 자유 구조.
            예: {"author": "홍길동", "doc_number": "D12345", ...}
        """
        ...

    # --- 표시명 생성 ---

    @abstractmethod
    async def generate_display_name(
        self,
        doc: dict[str, Any],
        detection: Optional[Detection] = None,
    ) -> str:
        """문서 표시명(displayName) 생성

        도메인별 명명 규칙에 따라 사용자에게 표시할 문서명을 생성한다.

        Args:
            doc: 현재 문서 데이터 (MongoDB 문서 구조)
            detection: 특수 문서 감지 결과 (있는 경우)

        Returns:
            생성된 표시명. 빈 문자열이면 xPipe 코어가 기본 규칙 적용.
        """
        ...

    # --- 단계별 후크 ---

    @abstractmethod
    async def on_stage_complete(
        self,
        stage: str,
        doc: dict[str, Any],
        context: dict[str, Any],
    ) -> list[HookResult]:
        """파이프라인 단계 완료 후 후속 액션 결정

        각 처리 단계(upload, meta, classify, ocr 등) 완료 시 호출된다.
        어댑터는 도메인별 후속 액션(알림, 상태 변경, 추가 처리 등)을 반환한다.

        Args:
            stage: 완료된 단계 이름 (예: "upload", "meta", "classify", "ocr", "complete")
            doc: 현재 문서 데이터
            context: 단계별 추가 컨텍스트 (예: 분류 결과, OCR 결과 등)

        Returns:
            수행할 후속 액션 목록. 없으면 빈 리스트.
        """
        ...

    # --- 기본 구현 (no-op) 제공 메서드 ---
    # 하위 호환성을 위해 새로 추가되는 메서드는 여기에 기본 구현과 함께 정의

    async def validate_document(
        self,
        filename: str,
        mime_type: str,
        file_size: int,
    ) -> tuple[bool, str]:
        """문서 업로드 전 도메인별 유효성 검증 (선택적 오버라이드)

        기본 구현: 항상 유효.

        Args:
            filename: 원본 파일명
            mime_type: MIME 타입
            file_size: 파일 크기 (bytes)

        Returns:
            (is_valid, reason) 튜플. 유효하면 (True, ""), 무효하면 (False, "사유")
        """
        return (True, "")

    async def on_before_ai_call(
        self,
        call_type: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """AI 호출 직전 후크 (선택적 오버라이드)

        크레딧 체크, 파라미터 조정 등에 사용.
        기본 구현: params를 그대로 반환.

        Args:
            call_type: AI 호출 유형 (예: "classify", "summarize", "embed")
            params: AI 호출 파라미터

        Returns:
            (수정된) AI 호출 파라미터. 호출을 차단하려면 {"skip": True} 반환.
        """
        return params
