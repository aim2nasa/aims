"""
Phase 4.5 Regression — AR 파서 픽스처 기반 End-to-End 검증 (#57)

Phase 4.5 목적
--------------
- **단위 테스트 (C, 기본 실행)**: reportlab/PIL로 런타임에 가상 PDF를 만들어
  factory 라우팅·캐시·파이프라인 본질 로직을 결정적으로 검증한다. PII 0.
- **Integration 테스트 (B, `-m integration`)**: tars dev에서 가져온 실제 PDF로
  Upstage Document AI 호출과 결과 파싱의 정합성을 증명한다.
  픽스처는 `.gitignore`로 git에서 제외된다.

실행
----
- 기본:        `pytest -m "not integration"`
- Integration: `pytest -m integration`   (UPSTAGE_API_KEY 필요)

본질 원칙
---------
- 🔴 파일명으로 AR/CRS 판단 금지 — 픽스처도 컨텐츠 기반으로만 판정됨
- OpenAI 호출 절대 금지 — 본 테스트는 OpenAI 파서를 전혀 임포트하지 않음
- 실제 Upstage 호출은 `@pytest.mark.integration` 으로만 수행
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# 합성 PDF 생성 의존성이 없는 환경(Python 3.13 등 venv 분리)에서는
# 본 파일 전체를 skip 한다. reportlab/PIL은 테스트 전용 의존성이며
# 프로덕션 경로에는 사용되지 않으므로 skip 이 곧 회귀가 되지 않는다.
pytest.importorskip("reportlab", reason="reportlab 미설치 - 합성 PDF fixture skip")
pytest.importorskip("PIL", reason="Pillow 미설치 - 합성 PDF fixture skip")

# annual_report_api/ 루트를 import path에 추가 (conftest.py와 동일 규약)
sys.path.insert(0, str(Path(__file__).parent.parent))
# tests/fixtures 를 import path에 추가 (synth_pdf import용)
sys.path.insert(0, str(Path(__file__).parent / "fixtures"))

from synth_pdf import make_image_only_pdf, make_text_ar_pdf  # noqa: E402

FIXTURES_DIR = Path(__file__).parent / "fixtures"
TEXT_AR_FIXTURE = FIXTURES_DIR / "text_ar_sample_with_cover.pdf"
IMAGE_AR_FIXTURE_1 = FIXTURES_DIR / "image_ar_sample_1.pdf"
IMAGE_AR_FIXTURE_2 = FIXTURES_DIR / "image_ar_sample_2.pdf"


# ═════════════════════════════════════════════════════════════
# C-1. factory 라우팅 — 합성 PDF 기반 단위 테스트
# ═════════════════════════════════════════════════════════════
class TestFactoryRoutingWithSyntheticPdf:
    """reportlab으로 만든 가상 PDF로 parser_factory.get_parser() 분기를 검증."""

    def test_factory_routes_image_pdf_to_upstage(self, tmp_path):
        """
        1) 이미지 전용 PDF (텍스트 0자) →
           설정이 pdfplumber여도 반드시 Upstage로 라우팅되어야 한다.
        """
        from services import parser_factory

        pdf_path = tmp_path / "image.pdf"
        make_image_only_pdf(str(pdf_path))

        # 실제 pdf_type_detector가 동작하도록 mock은 설정값만 고정
        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber",
        ), patch.object(parser_factory, "_resolve_parser_fn") as mock_resolve:
            mock_resolve.return_value = MagicMock(name="upstage_fn")
            parser_factory.get_parser(str(pdf_path))

        mock_resolve.assert_called_with(parser_factory.PARSER_UPSTAGE)

    def test_factory_routes_text_pdf_to_configured(self, tmp_path):
        """
        2) 텍스트 레이어가 있는 PDF (> threshold 50자) →
           설정 파서(pdfplumber_table)가 그대로 선택되어야 한다.
        """
        from services import parser_factory

        pdf_path = tmp_path / "text.pdf"
        make_text_ar_pdf(str(pdf_path))

        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber_table",
        ), patch.object(parser_factory, "_resolve_parser_fn") as mock_resolve:
            mock_resolve.return_value = MagicMock(name="pdfplumber_table_fn")
            parser_factory.get_parser(str(pdf_path))

        mock_resolve.assert_called_with(parser_factory.PARSER_PDFPLUMBER_TABLE)


# ═════════════════════════════════════════════════════════════
# C-2. Upstage 디스크 캐시 — mock API로 호출 카운트 검증
# ═════════════════════════════════════════════════════════════
class TestUpstageCacheHitCountsWithSyntheticPdf:
    """가상 이미지 PDF + mock Upstage API 응답으로 캐시 동작을 검증."""

    @staticmethod
    def _fake_upstage_response() -> dict:
        """최소 구조의 가짜 Upstage 응답 (계약 1건 + 총 월보험료)."""
        return {
            "content": {
                "html": (
                    "<table>"
                    "<tr><th>순번</th><th>증권번호</th><th>보험상품</th>"
                    "<th>계약자</th><th>피보험자</th><th>계약일</th>"
                    "<th>계약상태</th><th>가입금액(만원)</th>"
                    "<th>보험기간</th><th>납입기간</th><th>보험료(원)</th></tr>"
                    "<tr><td>1</td><td>FAKE-0001</td><td>테스트종신</td>"
                    "<td>홍길동</td><td>홍길동</td><td>2020-01-15</td>"
                    "<td>유효</td><td>5000</td><td>종신</td>"
                    "<td>20년</td><td>150000</td></tr>"
                    "</table>"
                ),
                "text": "월 보험료는 총 150,000원 입니다",
            }
        }

    def test_first_call_hits_api(self, tmp_path, monkeypatch):
        """첫 호출은 캐시가 없으므로 requests.post가 정확히 1회 호출된다."""
        from services import parser_upstage

        pdf_path = tmp_path / "image.pdf"
        make_image_only_pdf(str(pdf_path))

        monkeypatch.setenv("UPSTAGE_API_KEY", "fake-key-for-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = self._fake_upstage_response()

        with patch.object(
            parser_upstage.requests, "post", return_value=mock_response
        ) as mock_post:
            result = parser_upstage.parse_annual_report(str(pdf_path))

        assert mock_post.call_count == 1, "첫 호출은 반드시 API 1회 호출"
        assert "error" not in result
        assert len(result["보유계약 현황"]) == 1
        assert result["총_월보험료"] == 150_000

    def test_second_call_uses_cache(self, tmp_path, monkeypatch):
        """같은 PDF로 두 번째 호출 시 캐시가 재사용되어 API 0회."""
        from services import parser_upstage

        pdf_path = tmp_path / "image.pdf"
        make_image_only_pdf(str(pdf_path))

        monkeypatch.setenv("UPSTAGE_API_KEY", "fake-key-for-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = self._fake_upstage_response()

        # 1차 호출 — 캐시 기록
        with patch.object(
            parser_upstage.requests, "post", return_value=mock_response
        ) as mock_post_1:
            parser_upstage.parse_annual_report(str(pdf_path))
            assert mock_post_1.call_count == 1

        # 2차 호출 — 캐시 히트, API 호출 0회여야 함
        with patch.object(
            parser_upstage.requests, "post", return_value=mock_response
        ) as mock_post_2:
            result = parser_upstage.parse_annual_report(str(pdf_path))

        assert mock_post_2.call_count == 0, "두 번째 호출은 캐시 히트 → API 0회"
        assert "error" not in result
        assert len(result["보유계약 현황"]) == 1


# ═════════════════════════════════════════════════════════════
# C-3. 파서 파이프라인 End-to-End — 합성 PDF
# ═════════════════════════════════════════════════════════════
class TestParserPipelineEndToEndSynthetic:
    """factory → 파서 실행 → JSON 결과 구조 검증 (본질 로직)."""

    def test_pipeline_text_pdf_via_pdfplumber(self, tmp_path):
        """
        5) 텍스트 합성 PDF → factory가 pdfplumber 계열 파서 선택 →
           결과 JSON이 표준 키("총_월보험료", "보유계약 현황", "부활가능 실효계약") 보유.
        """
        from services import parser_factory

        pdf_path = tmp_path / "text.pdf"
        make_text_ar_pdf(str(pdf_path))

        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber",
        ):
            parse_fn = parser_factory.get_parser(str(pdf_path))
            result = parse_fn(str(pdf_path))

        assert isinstance(result, dict)
        # 본질: 파서 인터페이스가 지키는 표준 키 존재
        assert "총_월보험료" in result
        assert "보유계약 현황" in result
        assert "부활가능 실효계약" in result
        assert isinstance(result["보유계약 현황"], list)
        assert isinstance(result["부활가능 실효계약"], list)

    def test_pipeline_image_pdf_via_upstage_mock(self, tmp_path, monkeypatch):
        """
        6) 이미지 합성 PDF → factory가 Upstage 강제 라우팅 →
           mock Upstage 응답으로 파이프라인 최종 결과 검증.
        """
        from services import parser_factory, parser_upstage

        pdf_path = tmp_path / "image.pdf"
        make_image_only_pdf(str(pdf_path))

        monkeypatch.setenv("UPSTAGE_API_KEY", "fake-key-for-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": {
                "html": (
                    "<table>"
                    "<tr><th>순번</th><th>증권번호</th><th>보험상품</th>"
                    "<th>계약자</th><th>피보험자</th><th>계약일</th>"
                    "<th>계약상태</th><th>가입금액(만원)</th>"
                    "<th>보험기간</th><th>납입기간</th><th>보험료(원)</th></tr>"
                    "<tr><td>1</td><td>IMG-0001</td><td>이미지테스트상품</td>"
                    "<td>홍길동</td><td>홍길동</td><td>2020-01-15</td>"
                    "<td>유효</td><td>5000</td><td>종신</td>"
                    "<td>20년</td><td>99000</td></tr>"
                    "<tr><td>2</td><td>IMG-0002</td><td>이미지건강</td>"
                    "<td>홍길동</td><td>김영희</td><td>2021-03-22</td>"
                    "<td>유효</td><td>3000</td><td>80세</td>"
                    "<td>20년</td><td>81000</td></tr>"
                    "</table>"
                ),
                "text": "현재 납입중인 월 보험료는 총 180,000원 입니다",
            }
        }

        # config 의 설정값은 pdfplumber로 두고, 이미지 PDF 자동 라우팅이 작동함을 확인
        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber",
        ), patch.object(
            parser_upstage.requests, "post", return_value=mock_response
        ) as mock_post:
            parse_fn = parser_factory.get_parser(str(pdf_path))
            result = parse_fn(str(pdf_path))

        assert mock_post.call_count == 1, "이미지 PDF는 Upstage를 통해 파싱되어야 함"
        assert "error" not in result
        assert result["총_월보험료"] == 180_000
        assert len(result["보유계약 현황"]) == 2


# ═════════════════════════════════════════════════════════════
# B. Integration — 실제 PDF + 실제 Upstage API
# ═════════════════════════════════════════════════════════════
def _mask(value: str, keep_head: int = 3, keep_tail: int = 2) -> str:
    """PII 마스킹 유틸 — 증권번호 등 식별자 로그용."""
    if not value:
        return ""
    if len(value) <= keep_head + keep_tail:
        return "*" * len(value)
    return f"{value[:keep_head]}{'*' * (len(value) - keep_head - keep_tail)}{value[-keep_tail:]}"


def _require_fixture(path: Path) -> None:
    if not path.exists():
        pytest.skip(
            f"실제 픽스처 없음 → Integration 스킵: {path.name}. "
            f"tests/fixtures/README.md 의 scp 절차를 참고하세요."
        )


def _require_api_key() -> str:
    key = os.getenv("UPSTAGE_API_KEY")
    if not key:
        pytest.skip("UPSTAGE_API_KEY 미설정 → Integration 스킵")
    return key


@pytest.mark.integration
class TestRealUpstageAndParserFactory:
    """실제 tars PDF + 실제 Upstage API 호출로 본질 로직 최종 검증."""

    def setup_method(self, method):
        """각 테스트 전에 상위 캐시를 삭제해 호출 카운트를 결정적으로 만든다."""
        for fx in (IMAGE_AR_FIXTURE_1, IMAGE_AR_FIXTURE_2, TEXT_AR_FIXTURE):
            cache = Path(str(fx) + ".upstage.json")
            if cache.exists():
                cache.unlink()

    def test_real_upstage_parses_image_ar(self):
        """
        7) 실제 이미지 AR PDF → Upstage 호출 → 파싱 결과 검증.

        검증 항목:
        - error 키 없음
        - 보유계약 현황 리스트 길이 ≥ 1
        - 결과 응답 캐시 파일 생성
        - 로그 출력 (증권번호 마스킹)
        """
        _require_fixture(IMAGE_AR_FIXTURE_1)
        _require_api_key()

        from services.parser_upstage import parse_annual_report

        result = parse_annual_report(str(IMAGE_AR_FIXTURE_1))

        assert "error" not in result, f"Upstage 파싱 실패: {result.get('error')}"
        contracts = result.get("보유계약 현황", [])
        assert isinstance(contracts, list)
        assert len(contracts) >= 1, (
            f"실제 이미지 AR에서 계약이 1건 이상 추출되어야 함 (got={len(contracts)})"
        )

        # 캐시 파일이 저장되었는지 확인
        cache_file = Path(str(IMAGE_AR_FIXTURE_1) + ".upstage.json")
        assert cache_file.exists(), "Upstage 캐시 파일이 저장되어야 함"

        # 증거 로그 — 증권번호는 마스킹
        first = contracts[0]
        policy = _mask(str(first.get("증권번호", "")))
        total = result.get("총_월보험료")
        # ASCII 전용 메시지 (Windows cp949 콘솔 호환 — 한글/em-dash 금지)
        print(
            f"\n[Integration evidence] image_ar_sample_1.pdf: "
            f"contracts={len(contracts)}, total_premium={total}, "
            f"first_policy_masked={policy}"
        )
        sys.stderr.write(
            f"[Integration evidence] contracts={len(contracts)}, "
            f"total_premium={total}\n"
        )

    def test_real_pdfplumber_parses_text_ar_without_upstage(self):
        """
        8) 실제 텍스트 AR PDF → factory가 pdfplumber 계열 선택 →
           Upstage API는 단 1회도 호출되지 않아야 한다.

        검증 방법: requests.post를 mock으로 가로채 호출 카운트 0임을 증명.
        """
        _require_fixture(TEXT_AR_FIXTURE)

        from services import parser_factory, parser_upstage

        # 설정을 명시적으로 pdfplumber로 고정
        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber",
        ), patch.object(
            parser_upstage.requests, "post"
        ) as mock_post:
            parse_fn = parser_factory.get_parser(str(TEXT_AR_FIXTURE))
            result = parse_fn(str(TEXT_AR_FIXTURE))

        assert mock_post.call_count == 0, (
            "텍스트 AR은 pdfplumber로 처리되어야 하며 Upstage를 절대 호출하지 않음"
        )
        assert isinstance(result, dict)
        assert "총_월보험료" in result
        assert "보유계약 현황" in result

    def test_real_upstage_cache_reuse(self):
        """
        9) 같은 이미지 AR을 2회 파싱 → 두 번째 호출은 캐시 재사용 → API 0회.

        setup_method에서 캐시가 지워진 상태로 시작.
        """
        _require_fixture(IMAGE_AR_FIXTURE_2)
        _require_api_key()

        from services import parser_upstage

        # 1차 호출 — 실제 Upstage 호출
        result_1 = parser_upstage.parse_annual_report(str(IMAGE_AR_FIXTURE_2))
        assert "error" not in result_1

        cache_file = Path(str(IMAGE_AR_FIXTURE_2) + ".upstage.json")
        assert cache_file.exists(), "1차 호출 후 캐시 파일이 존재해야 함"

        # 2차 호출 — requests.post를 mock으로 가로채 호출 0회 검증
        with patch.object(parser_upstage.requests, "post") as mock_post:
            result_2 = parser_upstage.parse_annual_report(str(IMAGE_AR_FIXTURE_2))
            assert mock_post.call_count == 0, (
                "2차 호출은 캐시 히트 → Upstage API 호출 0회여야 함"
            )

        assert "error" not in result_2
        assert len(result_2["보유계약 현황"]) == len(result_1["보유계약 현황"])

        # 캐시 내용이 유효 JSON이고 format_version 을 포함하는지 확인
        with open(cache_file, "r", encoding="utf-8") as f:
            payload = json.load(f)
        assert "format_version" in payload
        assert "response" in payload
        assert isinstance(payload["response"], dict)

        print(
            f"\n[Integration evidence] cache_reuse OK: "
            f"contracts={len(result_2['보유계약 현황'])}, "
            f"cache_file={cache_file.name}"
        )
