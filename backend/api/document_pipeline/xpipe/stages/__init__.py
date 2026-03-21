"""
xPipe 내장 스테이지 — 기본 제공 파이프라인 스테이지

각 스테이지는 Stage ABC를 구현하며, stub 수준의 기본 로직을 제공한다.
실제 서비스 연동은 도메인 어댑터 구현 시 확장.
"""
from xpipe.stages.ingest import IngestStage
from xpipe.stages.convert import ConvertStage
from xpipe.stages.extract import ExtractStage
from xpipe.stages.classify import ClassifyStage
from xpipe.stages.detect_special import DetectSpecialStage
from xpipe.stages.embed import EmbedStage
from xpipe.stages.complete import CompleteStage

__all__ = [
    "IngestStage",
    "ConvertStage",
    "ExtractStage",
    "ClassifyStage",
    "DetectSpecialStage",
    "EmbedStage",
    "CompleteStage",
]
