"""
QueryAnalyzer 유닛 테스트

테스트 범위:
- analyze() 쿼리 분석 함수
- OpenAI API 호출 모킹
- 에러 핸들링 및 기본값 처리
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json


class TestQueryAnalyzerInit:
    """QueryAnalyzer 초기화 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_init_creates_openai_client(self, mock_openai):
        """초기화 시 OpenAI 클라이언트가 생성되어야 함"""
        from query_analyzer import QueryAnalyzer

        analyzer = QueryAnalyzer()

        mock_openai.assert_called_once()
        assert analyzer.client is not None


class TestQueryAnalyzerAnalyze:
    """analyze() 함수 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_analyze_entity_query(self, mock_openai):
        """개체명 쿼리 분석: 사람 이름 + 이력 → entity 타입"""
        from query_analyzer import QueryAnalyzer

        # Mock 설정
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "entity",
            "entities": ["곽승철"],
            "concepts": ["이력", "경력"],
            "metadata_keywords": ["곽승철", "이력서"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("곽승철 이력에 대해서")

        # 검증
        assert result["query_type"] == "entity"
        assert "곽승철" in result["entities"]
        assert "이력" in result["concepts"] or "경력" in result["concepts"]
        mock_client.chat.completions.create.assert_called_once()

    @patch('query_analyzer.OpenAI')
    def test_analyze_concept_query(self, mock_openai):
        """개념 쿼리 분석: 기술 주제 → concept 타입"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "concept",
            "entities": [],
            "concepts": ["USB", "Firmware", "개발"],
            "metadata_keywords": ["USB", "Firmware", "개발"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("USB Firmware 개발 경험")

        assert result["query_type"] == "concept"
        assert len(result["entities"]) == 0
        assert "USB" in result["concepts"] or "Firmware" in result["concepts"]

    @patch('query_analyzer.OpenAI')
    def test_analyze_mixed_query(self, mock_openai):
        """혼합 쿼리 분석: 개체명 + 개념 → mixed 타입"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "mixed",
            "entities": ["김보성"],
            "concepts": ["보험", "계약"],
            "metadata_keywords": ["김보성", "보험", "계약"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("김보성님의 보험 계약 정보")

        assert result["query_type"] == "mixed"
        assert "김보성" in result["entities"]
        assert len(result["concepts"]) > 0

    @patch('query_analyzer.OpenAI')
    def test_analyze_uses_correct_model(self, mock_openai):
        """analyze()가 gpt-4o-mini 모델을 사용해야 함"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "concept",
            "entities": [],
            "concepts": ["테스트"],
            "metadata_keywords": ["테스트"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        analyzer.analyze("테스트 쿼리")

        # 모델 파라미터 확인
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs['model'] == "gpt-4o-mini"
        assert call_args.kwargs['temperature'] == 0.1
        assert call_args.kwargs['response_format'] == {"type": "json_object"}

    @patch('query_analyzer.OpenAI')
    def test_analyze_sets_default_values(self, mock_openai):
        """응답에 누락된 필드가 있으면 기본값으로 설정해야 함"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        # 일부 필드만 있는 응답
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "entity"
            # entities, concepts, metadata_keywords 누락
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("테스트")

        # 기본값 확인
        assert result["query_type"] == "entity"
        assert result.get("entities") == []
        assert result.get("concepts") == []
        assert result.get("metadata_keywords") == []


class TestQueryAnalyzerErrorHandling:
    """에러 핸들링 테스트"""

    @patch('query_analyzer.send_error_log')
    @patch('query_analyzer.OpenAI')
    def test_analyze_api_error_returns_fallback(self, mock_openai, mock_error_log):
        """OpenAI API 오류 시 기본 concept 쿼리로 처리"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API rate limit exceeded")

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("테스트 쿼리 문자열")

        # 오류 시 기본값 반환
        assert result["query_type"] == "concept"
        assert "테스트" in result["concepts"]
        assert "쿼리" in result["concepts"]
        assert "문자열" in result["concepts"]
        # 에러 로깅 확인
        mock_error_log.assert_called_once()

    @patch('query_analyzer.send_error_log')
    @patch('query_analyzer.OpenAI')
    def test_analyze_json_parse_error(self, mock_openai, mock_error_log):
        """JSON 파싱 오류 시 기본값 반환"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="invalid json {{{"))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("파싱 테스트")

        # JSON 파싱 실패 시 기본값
        assert result["query_type"] == "concept"
        assert "파싱" in result["concepts"]
        assert "테스트" in result["concepts"]

    @patch('query_analyzer.send_error_log')
    @patch('query_analyzer.OpenAI')
    def test_analyze_network_timeout(self, mock_openai, mock_error_log):
        """네트워크 타임아웃 시 기본값 반환"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = TimeoutError("Connection timeout")

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("타임아웃 테스트")

        assert result["query_type"] == "concept"
        assert len(result["metadata_keywords"]) > 0


class TestQueryAnalyzerPromptConstruction:
    """프롬프트 구성 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_analyze_includes_query_in_prompt(self, mock_openai):
        """프롬프트에 사용자 쿼리가 포함되어야 함"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "concept",
            "entities": [],
            "concepts": [],
            "metadata_keywords": []
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        analyzer.analyze("특정 검색 쿼리 텍스트")

        # 프롬프트 확인 (P4-3: system/user 메시지 분리)
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs['messages']
        assert len(messages) == 2
        assert messages[0]['role'] == 'system'
        assert messages[1]['role'] == 'user'
        assert messages[1]['content'] == "특정 검색 쿼리 텍스트"


class TestQueryAnalyzerIntegration:
    """통합 시나리오 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_analyze_customer_document_query(self, mock_openai):
        """실제 사용 시나리오: 고객 문서 검색"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "mixed",
            "entities": ["홍길동"],
            "concepts": ["변액보험", "펀드변경"],
            "metadata_keywords": ["홍길동", "변액보험", "펀드", "변경"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("홍길동 고객의 변액보험 펀드변경 내역")

        assert result["query_type"] == "mixed"
        assert "홍길동" in result["entities"]
        assert len(result["metadata_keywords"]) >= 2

    @patch('query_analyzer.OpenAI')
    def test_analyze_date_based_query(self, mock_openai):
        """날짜 기반 문서 검색"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
            "query_type": "concept",
            "entities": [],
            "concepts": ["퇴직연금", "부담금", "내역"],
            "metadata_keywords": ["2025년", "2월", "퇴직연금", "부담금"]
        })))]
        mock_client.chat.completions.create.return_value = mock_response

        analyzer = QueryAnalyzer()
        result = analyzer.analyze("2025년 2월 퇴직연금 부담금 내역")

        # 날짜가 포함된 쿼리도 정상 처리
        assert result["query_type"] in ["concept", "mixed"]
        assert "퇴직연금" in result["concepts"] or "퇴직연금" in result["metadata_keywords"]

    @patch('query_analyzer.OpenAI')
    def test_analyze_korean_names(self, mock_openai):
        """한국어 인명 처리"""
        from query_analyzer import QueryAnalyzer

        mock_client = MagicMock()
        mock_openai.return_value = mock_client

        test_cases = [
            ("김철수", "entity"),
            ("이영희", "entity"),
            ("박민수", "entity")
        ]

        for name, expected_type in test_cases:
            mock_response = MagicMock()
            mock_response.choices = [MagicMock(message=MagicMock(content=json.dumps({
                "query_type": expected_type,
                "entities": [name],
                "concepts": [],
                "metadata_keywords": [name]
            })))]
            mock_client.chat.completions.create.return_value = mock_response

            analyzer = QueryAnalyzer()
            result = analyzer.analyze(f"{name}에 대해서")

            assert name in result["entities"]
