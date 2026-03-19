"""
xPipe — 도메인 무관 문서 처리 엔진 (Layer 1)

도메인별 로직은 DomainAdapter를 구현하여 주입한다.
"""
from xpipe.adapter import (
    DomainAdapter,
    Category,
    Detection,
    ClassificationConfig,
    HookResult,
    StageHookAction,
)
from xpipe.store import DocumentStore
from xpipe.queue import JobQueue

__all__ = [
    # Adapter
    "DomainAdapter",
    "Category",
    "Detection",
    "ClassificationConfig",
    "HookResult",
    "StageHookAction",
    # Storage
    "DocumentStore",
    "JobQueue",
]
