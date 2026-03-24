"""
DocumentStore ABC — 의도 기반 문서 저장소 인터페이스

설계 원칙 (Q2 Option B: 얇은 추상화):
- MongoDB 직접 호출을 캡슐화하되, 과도한 추상화는 피한다.
- 메서드명은 "의도"를 나타낸다 (예: find_pending_documents, update_document_status).
- 기본 구현체(MongoDB)를 제공하되, 다른 저장소로 교체 가능한 구조.
- Phase 2에서 MongoService의 실제 호출을 이 인터페이스 뒤로 이동.

Phase 1: 인터페이스 정의만. 기본 구현체(MongoDB)는 Phase 2.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class DocumentStore(ABC):
    """문서 CRUD + 상태 관리를 위한 저장소 인터페이스

    xPipe 코어는 이 인터페이스를 통해서만 문서 데이터에 접근한다.
    구현체는 MongoDB, PostgreSQL 등 어떤 저장소든 가능하다.
    """

    # --- 기본 CRUD ---

    @abstractmethod
    async def get_document(self, doc_id: str) -> Optional[dict[str, Any]]:
        """문서 단건 조회

        Args:
            doc_id: 문서 ID (MongoDB ObjectId 문자열 등)

        Returns:
            문서 데이터 dict. 없으면 None.
            반환 시 _id는 문자열로 변환되어야 한다.
        """
        ...

    @abstractmethod
    async def create_document(self, data: dict[str, Any]) -> str:
        """문서 생성

        Args:
            data: 초기 문서 데이터
                필수 필드: ownerId (소유자 ID)
                선택 필드: customerId, status, progress 등

        Returns:
            생성된 문서의 ID (문자열)
        """
        ...

    @abstractmethod
    async def update_document(
        self,
        doc_id: str,
        updates: dict[str, Any],
    ) -> bool:
        """문서 필드 업데이트 (범용)

        MongoDB의 $set에 해당하는 범용 업데이트.
        상태 변경에는 update_document_status()를 사용할 것.

        Args:
            doc_id: 문서 ID
            updates: 업데이트할 필드와 값 (flat 또는 dot notation)

        Returns:
            업데이트 성공 여부
        """
        ...

    @abstractmethod
    async def update_document_status(
        self,
        doc_id: str,
        status: str,
        overall_status: str,
        **extra: Any,
    ) -> bool:
        """문서 상태 업데이트 (의도 명확화)

        문서의 처리 상태를 변경한다. 범용 update_document()와 달리
        status/overallStatus 변경에 특화된 시맨틱 메서드.

        Args:
            doc_id: 문서 ID
            status: 처리 상태 (예: "processing", "completed", "failed", "credit_pending")
            overall_status: 전체 상태 (예: "processing", "completed", "error")
            **extra: 추가로 함께 업데이트할 필드
                예: progress=100, progressMessage="완료"

        Returns:
            업데이트 성공 여부
        """
        ...

    @abstractmethod
    async def delete_document(self, doc_id: str) -> bool:
        """문서 삭제 (Hard Delete)

        Args:
            doc_id: 문서 ID

        Returns:
            삭제 성공 여부
        """
        ...

    # --- 조회 (의도 기반) ---

    @abstractmethod
    async def find_pending_documents(
        self,
        filter_type: str,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """대기 중인 문서 목록 조회

        Args:
            filter_type: 대기 유형
                - "credit_pending": 크레딧 부족으로 대기 중인 문서
                - "processing": 처리 중인 문서
                - "failed": 실패한 문서
            **kwargs: 추가 필터 조건 (예: owner_id="abc")

        Returns:
            문서 목록
        """
        ...

    @abstractmethod
    async def find_embedding_targets(self) -> list[dict[str, Any]]:
        """임베딩 대상 문서 조회

        처리 완료 후 아직 임베딩되지 않은 문서를 조회한다.
        현재 AIMS에서는 embedding/full_pipeline.py (크론 1분)에서 호출.

        Returns:
            임베딩 대상 문서 목록
        """
        ...

    # --- 에러 로깅 ---

    async def insert_error(self, error_data: dict[str, Any]) -> str:
        """에러 로그 저장 (선택적 오버라이드)

        기본 구현: 빈 문자열 반환 (로깅 안 함).

        Args:
            error_data: 에러 정보 dict

        Returns:
            에러 레코드 ID (문자열)
        """
        return ""
