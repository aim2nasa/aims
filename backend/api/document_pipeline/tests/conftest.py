"""
Pytest fixtures for Document Pipeline tests
"""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from io import BytesIO

from main import app


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """Async HTTP client for testing"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_pdf():
    """Create a minimal PDF for testing"""
    # Minimal valid PDF
    pdf_content = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer << /Size 4 /Root 1 0 R >>
startxref
196
%%EOF"""
    return BytesIO(pdf_content)


@pytest.fixture
def sample_text():
    """Sample text for summarization testing"""
    return """
    인공지능(AI)은 인간의 학습 능력, 추론 능력, 지각 능력을 인공적으로 구현한
    컴퓨터 프로그램 또는 이를 포함한 컴퓨터 시스템입니다.
    머신러닝은 AI의 한 분야로, 명시적인 프로그래밍 없이 컴퓨터가 데이터로부터 학습하고
    예측하는 능력을 갖추도록 하는 기술입니다.
    딥러닝은 머신러닝의 한 종류로, 인공 신경망을 기반으로 하며
    대량의 데이터에서 복잡한 패턴을 학습할 수 있습니다.
    """
