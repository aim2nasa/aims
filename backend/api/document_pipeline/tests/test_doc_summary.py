"""
DocSummary endpoint tests
"""
import pytest


@pytest.mark.asyncio
async def test_summary_success(client, sample_text):
    """Test successful text summarization"""
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


@pytest.mark.asyncio
async def test_summary_empty_text(client):
    """Test summarization with empty text"""
    response = await client.post(
        "/webhook/docsummary",
        json={"full_text": ""}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == ""
    assert data["length"] == 0


@pytest.mark.asyncio
async def test_summary_with_document_id(client, sample_text):
    """Test summarization with document_id"""
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
