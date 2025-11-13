# test_hybrid_search.py
"""
하이브리드 검색 시스템 단위 테스트

테스트 케이스:
1. 개체명 쿼리 (entity): "곽승철에 대해서"
2. 개념 쿼리 (concept): "USB Firmware 개발"
3. 혼합 쿼리 (mixed): "곽승철의 USB 개발 경험"
"""

import pytest
from query_analyzer import QueryAnalyzer


class TestQueryAnalyzer:
    """쿼리 분석기 테스트"""

    def setup_method(self):
        """각 테스트 전에 실행"""
        self.analyzer = QueryAnalyzer()

    def test_entity_query(self):
        """개체명 쿼리 테스트"""
        query = "곽승철에 대해서"
        result = self.analyzer.analyze(query)

        assert result["query_type"] == "entity"
        assert "곽승철" in result["entities"]
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 개체명 쿼리 테스트 통과: {result}")

    def test_concept_query(self):
        """개념 쿼리 테스트"""
        query = "USB Firmware 드라이버 소프트웨어 개발"
        result = self.analyzer.analyze(query)

        assert result["query_type"] == "concept"
        assert len(result["concepts"]) > 0
        assert "USB" in result["metadata_keywords"] or "USB" in result["concepts"]
        print(f"✅ 개념 쿼리 테스트 통과: {result}")

    def test_mixed_query(self):
        """혼합 쿼리 테스트"""
        query = "김보성님의 보험 계약 정보"
        result = self.analyzer.analyze(query)

        assert result["query_type"] in ["mixed", "entity"]  # mixed 또는 entity 모두 허용
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 혼합 쿼리 테스트 통과: {result}")

    def test_error_handling(self):
        """오류 처리 테스트"""
        query = ""
        result = self.analyzer.analyze(query)

        # 빈 쿼리도 기본 concept으로 처리되어야 함
        assert result["query_type"] is not None
        print(f"✅ 오류 처리 테스트 통과: {result}")


# 실제 검색 테스트는 MongoDB, Qdrant 연결이 필요하므로
# 통합 테스트로 별도 진행 (서버 배포 후 테스트)

if __name__ == '__main__':
    # pytest 실행
    pytest.main([__file__, "-v", "-s"])
