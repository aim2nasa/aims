# test_hybrid_search.py
"""
하이브리드 검색 시스템 단위 테스트

테스트 케이스:
1. 개체명 쿼리 (entity): "곽승철에 대해서"
2. 개념 쿼리 (concept): "USB Firmware 개발"
3. 혼합 쿼리 (mixed): "곽승철의 USB 개발 경험"
"""

import pytest
import sys
from unittest.mock import Mock, patch, MagicMock

# OpenAI를 모킹한 후에 query_analyzer를 import해야 함
sys.modules['openai'] = MagicMock()

from query_analyzer import QueryAnalyzer


class TestQueryAnalyzer:
    """쿼리 분석기 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_entity_query(self, mock_openai):
        """개체명 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "entity", "entities": ["곽승철"], "concepts": [], "metadata_keywords": ["곽승철"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        query = "곽승철에 대해서"
        result = analyzer.analyze(query)

        assert result["query_type"] == "entity"
        assert "곽승철" in result["entities"]
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 개체명 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_concept_query(self, mock_openai):
        """개념 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "concept", "entities": [], "concepts": ["USB", "Firmware", "드라이버", "소프트웨어", "개발"], "metadata_keywords": ["USB", "Firmware", "드라이버", "소프트웨어", "개발"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        query = "USB Firmware 드라이버 소프트웨어 개발"
        result = analyzer.analyze(query)

        assert result["query_type"] == "concept"
        assert len(result["concepts"]) > 0
        assert "USB" in result["metadata_keywords"] or "USB" in result["concepts"]
        print(f"✅ 개념 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_mixed_query(self, mock_openai):
        """혼합 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "mixed", "entities": ["김보성"], "concepts": ["보험", "계약", "정보"], "metadata_keywords": ["김보성", "보험", "계약", "정보"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        query = "김보성님의 보험 계약 정보"
        result = analyzer.analyze(query)

        assert result["query_type"] in ["mixed", "entity"]  # mixed 또는 entity 모두 허용
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 혼합 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_error_handling(self, mock_openai):
        """오류 처리 테스트"""
        # Mock OpenAI response - 빈 쿼리도 처리
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "concept", "entities": [], "concepts": [], "metadata_keywords": []}'))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        query = ""
        result = analyzer.analyze(query)

        # 빈 쿼리도 기본 concept으로 처리되어야 함
        assert result["query_type"] is not None
        print(f"✅ 오류 처리 테스트 통과: {result}")


# 실제 검색 테스트는 MongoDB, Qdrant 연결이 필요하므로
# 통합 테스트로 별도 진행 (서버 배포 후 테스트)

if __name__ == '__main__':
    # pytest 실행
    pytest.main([__file__, "-v", "-s"])
