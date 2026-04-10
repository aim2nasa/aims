"""
Phase 4 Regression 테스트: AR 파서 자동 라우팅 + 캐시 + SSoT (#57)

Phase 4 변경점:
    A. services/pdf_type_detector.py — 이미지 PDF 판정 모듈
    B. services/parser_factory.py — 이미지 PDF → Upstage 강제 라우팅
    C. services/parser_upstage.py — API 응답 디스크 캐시
    D. routes/background.py, routes/parse.py, auto_parse_annual_reports.py —
       이미지 PDF는 텍스트 전처리 스킵
    E. config.py / deploy_annual_report_api.sh — UPSTAGE_API_KEY를
       .env.shared에서 SSoT로 로드

본 테스트는 순수 유닛/정적 검증으로만 구성한다.
실제 Upstage API / OpenAI 호출은 절대 수행하지 않는다.
"""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# annual_report_api/ 루트를 import path에 추가 (conftest.py와 동일 규약)
sys.path.insert(0, str(Path(__file__).parent.parent))


# ─────────────────────────────────────────────────────────────
# A. pdf_type_detector 유닛
# ─────────────────────────────────────────────────────────────
class TestPdfTypeDetector:
    """services/pdf_type_detector.py 동작 검증"""

    def test_module_exports(self):
        """공개 함수 is_image_pdf, measure_total_text_length 존재"""
        from services import pdf_type_detector

        assert hasattr(pdf_type_detector, "is_image_pdf")
        assert hasattr(pdf_type_detector, "measure_total_text_length")

    def test_missing_file_raises(self, tmp_path):
        """존재하지 않는 파일은 FileNotFoundError (silent 0 금지)"""
        from services.pdf_type_detector import measure_total_text_length

        missing = tmp_path / "does_not_exist.pdf"
        with pytest.raises(FileNotFoundError):
            measure_total_text_length(str(missing))

    def test_text_pdf_is_not_image(self, tmp_path):
        """텍스트 레이어 많은 PDF → is_image_pdf False"""
        from services import pdf_type_detector

        fake = tmp_path / "text.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            pdf_type_detector, "measure_total_text_length", return_value=10_000
        ):
            assert pdf_type_detector.is_image_pdf(str(fake)) is False

    def test_image_pdf_detected(self, tmp_path):
        """텍스트 합계가 threshold 미만 → is_image_pdf True"""
        from services import pdf_type_detector

        fake = tmp_path / "image.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            pdf_type_detector, "measure_total_text_length", return_value=3
        ):
            assert pdf_type_detector.is_image_pdf(str(fake)) is True

    def test_boundary_threshold(self, tmp_path):
        """threshold 경계값 동작 (< threshold 이면 image)"""
        from services import pdf_type_detector

        fake = tmp_path / "boundary.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            pdf_type_detector, "measure_total_text_length", return_value=50
        ):
            # 50 < 50 == False → 텍스트 PDF
            assert pdf_type_detector.is_image_pdf(str(fake), threshold=50) is False

        with patch.object(
            pdf_type_detector, "measure_total_text_length", return_value=49
        ):
            assert pdf_type_detector.is_image_pdf(str(fake), threshold=50) is True

    def test_corrupted_pdf_returns_zero(self, tmp_path):
        """손상된 PDF → WARN 로그 + 0 반환 (이미지 PDF로 간주)"""
        from services import pdf_type_detector

        broken = tmp_path / "broken.pdf"
        broken.write_bytes(b"not a pdf at all")

        # pdfplumber가 예외를 내지만 모듈은 0을 반환해야 함
        assert pdf_type_detector.measure_total_text_length(str(broken)) == 0


# ─────────────────────────────────────────────────────────────
# B. parser_factory — 이미지 PDF → Upstage 강제 라우팅
# ─────────────────────────────────────────────────────────────
class TestParserFactoryImageRouting:
    """services/parser_factory.py의 자동 라우팅 규칙"""

    def test_get_parser_accepts_pdf_path(self):
        """get_parser 함수 시그니처에 pdf_path 인자 존재"""
        import inspect

        from services.parser_factory import get_parser

        sig = inspect.signature(get_parser)
        assert "pdf_path" in sig.parameters
        # 선택 인자여야 함 (기존 호출부 호환)
        assert sig.parameters["pdf_path"].default is None

    def test_image_pdf_forces_upstage(self, tmp_path):
        """설정이 pdfplumber여도 이미지 PDF면 upstage로 라우팅"""
        from services import parser_factory

        fake = tmp_path / "image.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            parser_factory, "get_annual_report_parser", return_value="pdfplumber"
        ), patch.object(
            parser_factory, "is_image_pdf", return_value=True
        ), patch.object(
            parser_factory, "_resolve_parser_fn"
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock(name="upstage_parser")
            parser_factory.get_parser(str(fake))
            # Upstage로 resolve 되었는지 확인
            mock_resolve.assert_called_with(parser_factory.PARSER_UPSTAGE)

    def test_text_pdf_uses_configured_parser(self, tmp_path):
        """텍스트 PDF는 설정된 파서(pdfplumber_table) 그대로 사용"""
        from services import parser_factory

        fake = tmp_path / "text.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            parser_factory,
            "get_annual_report_parser",
            return_value="pdfplumber_table",
        ), patch.object(
            parser_factory, "is_image_pdf", return_value=False
        ), patch.object(
            parser_factory, "_resolve_parser_fn"
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock()
            parser_factory.get_parser(str(fake))
            mock_resolve.assert_called_with(parser_factory.PARSER_PDFPLUMBER_TABLE)

    def test_upstage_configured_never_downgraded(self, tmp_path):
        """설정이 이미 upstage면 판정 스킵 (불필요한 pdfplumber 호출 방지)"""
        from services import parser_factory

        fake = tmp_path / "text.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            parser_factory, "get_annual_report_parser", return_value="upstage"
        ), patch.object(
            parser_factory, "is_image_pdf"
        ) as mock_detect, patch.object(
            parser_factory, "_resolve_parser_fn"
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock()
            parser_factory.get_parser(str(fake))
            # upstage는 _TEXT_BASED_PARSERS에 없으므로 is_image_pdf가 호출되지 않아야 함
            mock_detect.assert_not_called()
            mock_resolve.assert_called_with(parser_factory.PARSER_UPSTAGE)

    def test_detection_failure_fallbacks_to_configured(self, tmp_path):
        """이미지 PDF 판정 중 예외 → 설정 파서로 안전 fallback"""
        from services import parser_factory

        fake = tmp_path / "text.pdf"
        fake.write_bytes(b"%PDF-1.4")

        with patch.object(
            parser_factory, "get_annual_report_parser", return_value="pdfplumber"
        ), patch.object(
            parser_factory, "is_image_pdf", side_effect=RuntimeError("boom")
        ), patch.object(
            parser_factory, "_resolve_parser_fn"
        ) as mock_resolve:
            mock_resolve.return_value = MagicMock()
            parser_factory.get_parser(str(fake))
            mock_resolve.assert_called_with(parser_factory.PARSER_PDFPLUMBER)


# ─────────────────────────────────────────────────────────────
# C. parser_upstage — 디스크 캐시
# ─────────────────────────────────────────────────────────────
# parser_upstage는 bs4(BeautifulSoup)에 런타임 의존한다. 서버 venv(3.10)
# 에는 설치되어 있으나 로컬 Python 3.13 환경에는 없을 수 있으므로,
# bs4를 import 할 수 없을 때 이 클래스만 skip 처리한다.
# 본 파일의 A/B 섹션(detector, factory)은 bs4 없이도 동작해야 하므로
# 파일 레벨 skip이 아닌 클래스 데코레이터 skip을 사용한다.
try:
    import bs4  # noqa: F401
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False


@pytest.mark.skipif(not _HAS_BS4, reason="bs4 미설치 - parser_upstage 캐시 테스트 skip")
class TestParserUpstageDiskCache:
    """Upstage API 응답 디스크 캐시 동작 검증"""

    def test_cache_path_deterministic(self, tmp_path):
        """캐시 경로는 PDF 경로에서 결정적으로 파생"""
        from services.parser_upstage import _cache_path

        pdf = tmp_path / "a.pdf"
        assert _cache_path(str(pdf)) == str(pdf) + ".upstage.json"

    def test_save_then_load_roundtrip(self, tmp_path):
        """저장 → 로드 시 원본 응답 복원"""
        from services.parser_upstage import (
            _load_cached_response,
            _save_cached_response,
        )

        pdf = tmp_path / "sample.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake")

        fake_response = {
            "content": {"html": "<table></table>", "text": "계약 1건"},
            "other": 123,
        }
        _save_cached_response(str(pdf), fake_response)

        loaded = _load_cached_response(str(pdf))
        assert loaded == fake_response

    def test_cache_invalidated_on_mtime_change(self, tmp_path):
        """PDF 수정 시각이 바뀌면 캐시 무효"""
        import time as _time

        from services.parser_upstage import (
            _load_cached_response,
            _save_cached_response,
        )

        pdf = tmp_path / "sample.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake")
        _save_cached_response(str(pdf), {"x": 1})
        assert _load_cached_response(str(pdf)) is not None

        # 파일 내용 + mtime 변경
        _time.sleep(0.01)
        pdf.write_bytes(b"%PDF-1.4 DIFFERENT CONTENT")
        # 안전: 명시적으로 mtime을 미래로 이동
        future = os.path.getmtime(str(pdf)) + 10
        os.utime(str(pdf), (future, future))

        assert _load_cached_response(str(pdf)) is None

    def test_cache_missing_returns_none(self, tmp_path):
        """캐시 파일이 없으면 None (새로 API 호출해야 함)"""
        from services.parser_upstage import _load_cached_response

        pdf = tmp_path / "sample.pdf"
        pdf.write_bytes(b"%PDF-1.4")
        assert _load_cached_response(str(pdf)) is None

    def test_parse_annual_report_uses_cache_without_api(self, tmp_path):
        """캐시 히트 시 requests.post가 호출되지 않음"""
        from services import parser_upstage

        pdf = tmp_path / "cached.pdf"
        pdf.write_bytes(b"%PDF-1.4 fake")

        # 미리 캐시를 심어둠 — 최소 구조
        parser_upstage._save_cached_response(
            str(pdf),
            {
                "content": {
                    "html": (
                        "<table>"
                        "<tr><th>순번</th><th>증권번호</th></tr>"
                        "<tr><td>1</td><td>ABC</td></tr>"
                        "</table>"
                    ),
                    "text": "월 보험료는 총 50,000원",
                }
            },
        )

        with patch.object(
            parser_upstage.requests, "post"
        ) as mock_post:
            result = parser_upstage.parse_annual_report(str(pdf))
            mock_post.assert_not_called()
            assert isinstance(result, dict)
            # 캐시가 성공 응답이라면 에러가 아니어야 함
            assert "error" not in result


# ─────────────────────────────────────────────────────────────
# D. routes — 이미지 PDF 텍스트 전처리 스킵
# ─────────────────────────────────────────────────────────────
class TestRoutesSkipTextPreprocessing:
    """background.py, parse.py, auto_parse_annual_reports.py가
    이미지 PDF 판정 시 find_contract_table_end_page/extract_customer_info
    를 호출하지 않는지 정적 검증"""

    def _read(self, rel: str) -> str:
        root = Path(__file__).parents[1]
        return (root / rel).read_text(encoding="utf-8")

    def test_background_imports_pdf_type_detector(self):
        src = self._read("routes/background.py")
        assert "from services.pdf_type_detector import is_image_pdf" in src

    def test_background_skips_preprocess_on_image(self):
        src = self._read("routes/background.py")
        # 두 개의 경로(parse_single_ar_document, process_ar_documents_background)
        # 모두 이미지 PDF 체크 후 else 분기에서만 find_contract_table_end_page 호출
        assert src.count("is_image_pdf(file_path)") >= 2
        assert src.count("if image_pdf:") >= 2
        # Phase 4-D: 이미지 PDF 분기에서 find_contract_table_end_page 전처리를 수행하지 않는다.
        # Phase 5.5: 이미지 PDF 분기는 `files.meta.full_text`(OCR) 기반 폴백 경로를 사용한다.
        assert "OCR full_text" in src or "ocr_text=" in src, (
            "이미지 PDF 분기에 OCR full_text 폴백 경로가 명시되어야 합니다 (Phase 5.5)."
        )

    def test_parse_route_imports_and_uses_detector(self):
        src = self._read("routes/parse.py")
        # parse.py도 is_image_pdf 경로가 있거나 최소한 get_parser(file_path)를
        # 전달하여 팩토리 레벨 라우팅이 보장되어야 함
        assert (
            "is_image_pdf" in src
            or "get_parser(file_path)" in src
            or "get_parser(pdf_path)" in src
        )

    def test_auto_parse_uses_pdf_path_routing(self):
        src = self._read("auto_parse_annual_reports.py")
        # auto_parse는 최소한 get_parser에 pdf 경로를 전달해 팩토리 라우팅 활성화
        assert "get_parser(" in src


# ─────────────────────────────────────────────────────────────
# E. config SSoT — .env.shared 로드
# ─────────────────────────────────────────────────────────────
class TestConfigSSoT:
    """config.py가 .env.shared를 우선 로드하는 구조인지"""

    def _read_config(self) -> str:
        return (Path(__file__).parents[1] / "config.py").read_text(encoding="utf-8")

    def test_config_loads_env_shared(self):
        src = self._read_config()
        assert ".env.shared" in src, "config.py가 .env.shared를 참조하지 않습니다"
        assert "load_dotenv" in src

    def test_config_uses_override_false(self):
        """override=False여야 PM2 주입 env가 유지됨"""
        src = self._read_config()
        assert "override=False" in src, (
            "config.py의 load_dotenv 호출이 override=False로 호출되지 않습니다. "
            "PM2 주입 env를 덮어쓸 위험이 있습니다."
        )

    def test_config_wraps_load_in_try(self):
        """로드 실패 시 프로세스 기동이 중단되지 않도록 try/except 필요"""
        src = self._read_config()
        # .env.shared 블록 주변에 try/except가 있어야 함
        assert "try:" in src and "except Exception" in src

    def test_deploy_script_injects_upstage_key(self):
        deploy = (
            Path(__file__).parents[1] / "deploy_annual_report_api.sh"
        ).read_text(encoding="utf-8")
        assert "UPSTAGE_API_KEY" in deploy, (
            "deploy_annual_report_api.sh가 UPSTAGE_API_KEY를 주입하지 않습니다"
        )
        assert "UPSTAGE_KEY=" in deploy
        # .env.shared에서 읽어와야 함
        assert 'grep "^UPSTAGE_API_KEY=" "$AIMS_DIR/.env.shared"' in deploy

    def test_deploy_script_warns_on_missing_upstage(self):
        deploy = (
            Path(__file__).parents[1] / "deploy_annual_report_api.sh"
        ).read_text(encoding="utf-8")
        assert 'if [ -z "$UPSTAGE_KEY" ]' in deploy, (
            "UPSTAGE_API_KEY 누락 경고 블록이 없습니다"
        )

    def test_local_env_no_upstage_key(self):
        """로컬 .env.example이 있다면 UPSTAGE_API_KEY 예시도 .env.shared 참조 안내가 필요.
        로컬 .env는 tars에서 관리되므로 이 테스트는 .env.example 유무만 체크."""
        example = Path(__file__).parents[1] / ".env.example"
        if example.exists():
            content = example.read_text(encoding="utf-8")
            # 명시적으로 .env.shared 참조 주석이 있거나, UPSTAGE_API_KEY 항목이 없어야 함
            if "UPSTAGE_API_KEY" in content:
                assert ".env.shared" in content, (
                    ".env.example에 UPSTAGE_API_KEY가 있으면 .env.shared 참조 안내가 필요합니다"
                )
