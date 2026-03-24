"""Characterization tests: Import 경로 동작 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_imports.py -v

xpipe 패키지의 public API 심볼이 올바르게 export되는지 캡처한다.
리팩토링으로 import 경로가 깨지면 이 테스트가 실패한다.
"""
from __future__ import annotations

import pytest


class TestProviderImport:
    """xpipe.providers 심볼 import 경로 캡처"""

    def test_upstage_ocr_provider_importable(self):
        """from xpipe.providers_builtin import UpstageOCRProvider 경로 동작"""
        from xpipe.providers_builtin import UpstageOCRProvider
        assert UpstageOCRProvider is not None
        assert hasattr(UpstageOCRProvider, "process")
        assert hasattr(UpstageOCRProvider, "get_name")


class TestStagesImport:
    """xpipe.stages의 7개 스테이지 import 캡처"""

    def test_all_seven_stages_importable(self):
        """from xpipe.stages import * → 7개 스테이지 클래스"""
        from xpipe.stages import (
            IngestStage,
            ConvertStage,
            ExtractStage,
            ClassifyStage,
            DetectSpecialStage,
            EmbedStage,
            CompleteStage,
        )
        stages = [IngestStage, ConvertStage, ExtractStage, ClassifyStage,
                  DetectSpecialStage, EmbedStage, CompleteStage]
        assert len(stages) == 7
        for s in stages:
            assert hasattr(s, "execute")
            assert hasattr(s, "get_name")
            assert hasattr(s, "should_skip")

    def test_stages_all_list(self):
        """xpipe.stages.__all__에 7개 스테이지가 정확히 포함"""
        import xpipe.stages as stages_mod
        expected = {
            "IngestStage", "ConvertStage", "ExtractStage", "ClassifyStage",
            "DetectSpecialStage", "EmbedStage", "CompleteStage",
        }
        assert set(stages_mod.__all__) == expected


class TestXpipeTopLevelImport:
    """xpipe.__init__의 __all__ 심볼 캡처"""

    def test_all_symbols_importable(self):
        """xpipe.__all__에 정의된 모든 심볼이 실제로 import 가능"""
        import xpipe
        for symbol_name in xpipe.__all__:
            obj = getattr(xpipe, symbol_name, None)
            assert obj is not None, f"xpipe.{symbol_name}이 None — import 실패"

    def test_all_contains_core_symbols(self):
        """__all__에 핵심 심볼(DomainAdapter, Stage, Pipeline 등)이 포함"""
        import xpipe
        core_symbols = [
            "DomainAdapter", "Stage", "Pipeline", "PipelineDefinition",
            "EventBus", "AuditLog", "QualityGate", "CostTracker",
            "LLMProvider", "OCRProvider", "EmbeddingProvider",
            "ProviderRegistry", "InMemoryQueue", "Job", "JobStatus",
            # 내장 스테이지 (#9)
            "IngestStage", "ConvertStage", "ExtractStage", "ClassifyStage",
            "DetectSpecialStage", "EmbedStage", "CompleteStage",
        ]
        all_set = set(xpipe.__all__)
        for sym in core_symbols:
            assert sym in all_set, f"xpipe.__all__에 '{sym}'이 누락"
