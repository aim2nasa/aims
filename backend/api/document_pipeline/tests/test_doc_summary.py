"""
DocSummary endpoint tests
"""
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_summary_success(client, sample_text):
    """Test successful text summarization"""
    with patch("routers.doc_summary.openai_service") as mock_openai:
        # Mock summarize_text to return dict
        mock_openai.summarize_text = AsyncMock(return_value={
            "summary": "테스트 문서 요약입니다.",
            "tags": ["AI", "머신러닝", "딥러닝"]
        })

        response = await client.post(
            "/webhook/docsummary",
            json={"full_text": sample_text}
        )

        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert "length" in data
        assert "tags" in data
        assert isinstance(data["tags"], list)
        assert data["summary"] == "테스트 문서 요약입니다."


@pytest.mark.asyncio
async def test_summary_empty_text(client):
    """Test summarization with empty text - returns info message"""
    response = await client.post(
        "/webhook/docsummary",
        json={"full_text": ""}
    )

    assert response.status_code == 200
    data = response.json()
    # Empty text returns guidance message, not empty string
    assert "입력된 텍스트가 없습니다" in data["summary"]
    assert data["tags"] == []


@pytest.mark.asyncio
async def test_summary_with_document_id(client, sample_text):
    """Test summarization with document_id"""
    with patch("routers.doc_summary.openai_service") as mock_openai:
        mock_openai.summarize_text = AsyncMock(return_value={
            "summary": "문서 ID 기반 요약",
            "tags": ["태그1"]
        })

        response = await client.post(
            "/webhook/docsummary",
            json={
                "full_text": sample_text,
                "document_id": "507f1f77bcf86cd799439011",
                "user_id": "test_user_123"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
