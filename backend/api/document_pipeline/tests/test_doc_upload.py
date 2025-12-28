"""
DocUpload endpoint tests
"""
import pytest
from io import BytesIO


@pytest.mark.asyncio
async def test_upload_success(client, sample_pdf):
    """Test successful file upload"""
    response = await client.post(
        "/webhook/docupload",
        files={"file": ("test.pdf", sample_pdf, "application/pdf")},
        data={"userId": "test_user_123"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "success"
    assert data["original"] == "test.pdf"
    assert "saved_name" in data
    assert "path" in data


@pytest.mark.asyncio
async def test_upload_no_file(client):
    """Test upload without file"""
    response = await client.post(
        "/webhook/docupload",
        data={"userId": "test_user_123"}
    )

    # FastAPI returns 422 for missing required field
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_no_user_id(client, sample_pdf):
    """Test upload without userId"""
    response = await client.post(
        "/webhook/docupload",
        files={"file": ("test.pdf", sample_pdf, "application/pdf")}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_with_customer_id(client, sample_pdf):
    """Test upload with customerId"""
    response = await client.post(
        "/webhook/docupload",
        files={"file": ("test.pdf", sample_pdf, "application/pdf")},
        data={
            "userId": "test_user_123",
            "customerId": "customer_456"
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "success"


@pytest.mark.asyncio
async def test_upload_with_source_path(client, sample_pdf):
    """Test upload with source_path"""
    response = await client.post(
        "/webhook/docupload",
        files={"file": ("test.pdf", sample_pdf, "application/pdf")},
        data={
            "userId": "test_user_123",
            "source_path": "/original/path/to/file.pdf"
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "success"
    assert data["sourcePath"] == "/original/path/to/file.pdf"
