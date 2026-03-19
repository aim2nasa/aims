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
from xpipe.quality import (
    QualityGate,
    QualityConfig,
    QualityScore,
    QualityReport,
)
from xpipe.quality_runner import (
    GroundTruthRunner,
    AccuracyReport,
)
from xpipe.providers import (
    LLMProvider,
    OCRProvider,
    EmbeddingProvider,
)
from xpipe.provider_registry import ProviderRegistry
from xpipe.cost_tracker import CostTracker, UsageRecord
from xpipe.events import EventBus, PipelineEvent, WebhookConfig
from xpipe.audit import AuditLog, AuditEntry
from xpipe.stage import Stage
from xpipe.pipeline import Pipeline, PipelineDefinition, StageConfig
from xpipe.pipeline_presets import PRESETS, get_preset, list_presets

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
    # Quality
    "QualityGate",
    "QualityConfig",
    "QualityScore",
    "QualityReport",
    "GroundTruthRunner",
    "AccuracyReport",
    # Providers
    "LLMProvider",
    "OCRProvider",
    "EmbeddingProvider",
    "ProviderRegistry",
    "CostTracker",
    "UsageRecord",
    # Events
    "EventBus",
    "PipelineEvent",
    "WebhookConfig",
    # Audit
    "AuditLog",
    "AuditEntry",
    # Pipeline
    "Stage",
    "Pipeline",
    "PipelineDefinition",
    "StageConfig",
    "PRESETS",
    "get_preset",
    "list_presets",
]
