"""
텍스트 부족 시 AI 분류 스킵 테스트

이슈 #33: 텍스트 없는 이미지가 진단서/소견서로 잘못 분류되는 버그
텍스트 < 10자이면 AI 분류를 호출하지 않고 unclassifiable로 처리해야 함
"""
import pytest
from xpipe.stages.classify import ClassifyStage


DUMMY_CLASSIFY_CONFIG = {
    "system_prompt": "문서를 분류하세요",
    "categories": ["policy", "diagnosis", "general", "unclassifiable"],
}


class TestClassifyNoText:
    """텍스트 부족 시 분류 스킵 검증"""

    @pytest.mark.asyncio
    async def test_empty_text_returns_unclassifiable(self):
        """텍스트 없음 -> unclassifiable"""
        stage = ClassifyStage()
        context = {
            "extracted_text": "",
            "filename": "photo.jpg",
            "mode": "real",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        assert result["document_type"] == "unclassifiable"
        assert result["classification_confidence"] == 0.0
        assert result["stage_data"]["classify"]["status"] == "skipped"
        assert "텍스트 부족" in result["stage_data"]["classify"]["reason"]

    @pytest.mark.asyncio
    async def test_short_text_returns_unclassifiable(self):
        """텍스트 9자 -> unclassifiable (10자 미만)"""
        stage = ClassifyStage()
        context = {
            "extracted_text": "123456789",
            "filename": "doc.pdf",
            "mode": "real",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        assert result["document_type"] == "unclassifiable"
        assert result["stage_data"]["classify"]["status"] == "skipped"

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_unclassifiable(self):
        """공백만 있는 텍스트 -> unclassifiable"""
        stage = ClassifyStage()
        context = {
            "extracted_text": "   \n\t   ",
            "filename": "blank.pdf",
            "mode": "real",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        assert result["document_type"] == "unclassifiable"

    @pytest.mark.asyncio
    async def test_none_text_returns_unclassifiable(self):
        """텍스트 None -> unclassifiable"""
        stage = ClassifyStage()
        context = {
            "filename": "image.webp",
            "mode": "real",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        assert result["document_type"] == "unclassifiable"

    @pytest.mark.asyncio
    async def test_10_chars_proceeds_to_classify(self):
        """텍스트 10자 -> AI 분류 진행 (stub 모드)"""
        stage = ClassifyStage()
        context = {
            "extracted_text": "1234567890",
            "filename": "doc.pdf",
            "mode": "stub",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        # stub 모드에서는 doc_type=None이지만, 분류 시도는 함
        assert result["classified"] is True
        assert result["stage_data"]["classify"]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_filename_not_used_for_classification(self):
        """파일명이 진단서 관련이어도 텍스트 없으면 unclassifiable"""
        stage = ClassifyStage()
        context = {
            "extracted_text": "",
            "filename": "진단서_2024.pdf",
            "mode": "real",
            "_classify_config": DUMMY_CLASSIFY_CONFIG,
        }

        result = await stage.execute(context)

        assert result["document_type"] == "unclassifiable"
        assert result["document_type"] != "diagnosis"
