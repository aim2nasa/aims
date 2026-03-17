"""
summarize_text() customer_name 전달 regression 테스트
@since 2026-03-17

검증 항목:
1. _build_title_prompt()에 customer_name이 포함되는지
2. 프롬프트에 이름 환각 금지 규칙이 있는지
3. customer_name=None일 때 "이 문서의 고객:" 행이 없어야 함
4. CLASSIFICATION_USER_PROMPT에 "안영미" 등 특정 인명 하드코딩이 없는지
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.openai_service import OpenAIService, CLASSIFICATION_USER_PROMPT


class TestBuildTitlePromptCustomerName:
    """_build_title_prompt()의 customer_name 처리 검증"""

    def test_customer_name_included_in_prompt(self):
        """customer_name이 전달되면 프롬프트에 포함되어야 함"""
        prompt = OpenAIService._build_title_prompt(
            text="삼성화재 진단서 내용입니다.",
            customer_name="김철수"
        )
        assert "이 문서의 고객: 김철수" in prompt

    def test_customer_name_none_no_customer_line(self):
        """customer_name=None이면 '이 문서의 고객:' 행이 없어야 함"""
        prompt = OpenAIService._build_title_prompt(
            text="삼성화재 진단서 내용입니다.",
            customer_name=None
        )
        assert "이 문서의 고객:" not in prompt

    def test_customer_name_empty_string_no_customer_line(self):
        """customer_name이 빈 문자열이면 '이 문서의 고객:' 행이 없어야 함"""
        prompt = OpenAIService._build_title_prompt(
            text="삼성화재 진단서 내용입니다.",
            customer_name=""
        )
        assert "이 문서의 고객:" not in prompt

    def test_hallucination_prevention_rule_in_prompt(self):
        """프롬프트에 이름 환각 금지 규칙이 있어야 함"""
        prompt = OpenAIService._build_title_prompt(
            text="테스트 문서"
        )
        assert "이름을 지어내지 말 것" in prompt or "절대 사용 금지" in prompt


class TestClassificationUserPromptSanity:
    """CLASSIFICATION_USER_PROMPT의 인명 하드코딩 검증"""

    def test_no_specific_person_name_in_prompt(self):
        """CLASSIFICATION_USER_PROMPT에 '안영미' 문자열이 없어야 함"""
        assert "안영미" not in CLASSIFICATION_USER_PROMPT

    def test_no_hongildong_in_title_example(self):
        """CLASSIFICATION_USER_PROMPT title 예시에 '홍길동'이 없어야 함"""
        assert "홍길동" not in CLASSIFICATION_USER_PROMPT


class TestSummarizeTextCustomerNameSignature:
    """summarize_text() 시그니처에 customer_name 파라미터 존재 검증"""

    def test_summarize_text_accepts_customer_name(self):
        """summarize_text()가 customer_name 키워드 인자를 받을 수 있어야 함"""
        import inspect
        sig = inspect.signature(OpenAIService.summarize_text)
        params = list(sig.parameters.keys())
        assert "customer_name" in params

    def test_customer_name_default_is_none(self):
        """customer_name의 기본값은 None이어야 함 (하위 호환)"""
        import inspect
        sig = inspect.signature(OpenAIService.summarize_text)
        param = sig.parameters["customer_name"]
        assert param.default is None
