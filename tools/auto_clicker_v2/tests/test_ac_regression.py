# -*- coding: utf-8 -*-
"""
AutoClicker Regression Tests

AC 코드(Jython/SikuliX 전용)를 CPython에서 테스트하기 위해
소스 코드 파싱 + 순수 로직 추출 방식 사용.

실행: python -m pytest tests/test_ac_regression.py -v
"""
import os
import re
import ast
import struct
import textwrap

import pytest

# ── 경로 설정 ──────────────────────────────────────────────
AC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERIFY_PY = os.path.join(AC_DIR, "verify_customer_integrated_view.py")
MCL_PY = os.path.join(AC_DIR, "MetlifeCustomerList.py")


def _read_source(filepath):
    """소스 파일 전체를 문자열로 읽기"""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def _extract_function_source(source, func_name):
    """소스 코드에서 특정 함수의 전체 본문(def ~ 다음 def/class 전까지)을 추출"""
    pattern = re.compile(
        r'^(def\s+' + re.escape(func_name) + r'\s*\(.*?\):\s*\n(?:(?:[ \t]+.*|[ \t]*)\n)*)',
        re.MULTILINE
    )
    match = pattern.search(source)
    if match:
        return match.group(1)
    return None


def _extract_constant(source, const_name):
    """소스 코드에서 상수 값 추출 (예: ROW_HEIGHT = 37 → 37)"""
    pattern = re.compile(r'^' + re.escape(const_name) + r'\s*=\s*(.+?)(?:\s*#.*)?$', re.MULTILINE)
    match = pattern.search(source)
    if match:
        try:
            return eval(match.group(1).strip())
        except Exception:
            return match.group(1).strip()
    return None


# ══════════════════════════════════════════════════════════════
# 1. 스크롤 회귀 방지 테스트 (소스 코드 검증)
# ══════════════════════════════════════════════════════════════

class TestScrollRegression:
    """
    고객통합뷰 스크롤은 반드시 _robot.mouseWheel()을 사용해야 함.
    Page Up, SikuliX wheel() 사용 시 테스트 FAIL.

    배경: ac-v0.1.113 커밋 참조
    - 고객통합뷰(Nexacro)는 마우스 휠로만 스크롤 가능
    - Page Up/Ctrl+Home 비동작 (w, k 모두 수동 확인)
    - SikuliX wheel() 래퍼는 TeamViewer 원격 환경에서 비동작
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.source = _read_source(VERIFY_PY)
        self.func_source = _extract_function_source(self.source, "scroll_to_top")
        assert self.func_source is not None, "scroll_to_top 함수를 찾을 수 없음"

    def test_uses_mouse_wheel(self):
        """scroll_to_top()이 _robot.mouseWheel()을 사용하는지 확인"""
        assert "_robot.mouseWheel(" in self.func_source, (
            "scroll_to_top()에 _robot.mouseWheel() 호출이 없음. "
            "고객통합뷰(Nexacro)는 마우스 휠로만 스크롤 가능."
        )

    def test_no_page_up(self):
        """scroll_to_top()이 Page Up을 사용하지 않는지 확인"""
        assert "VK_PAGE_UP" not in self.func_source, (
            "scroll_to_top()에 VK_PAGE_UP 사용 감지. "
            "고객통합뷰(Nexacro)는 Page Up에 반응하지 않음 (w, k 모두 확인)."
        )

    def test_no_sikulix_wheel(self):
        """scroll_to_top()이 SikuliX wheel()을 사용하지 않는지 확인"""
        # docstring/주석이 아닌 실제 코드 라인에서만 검사
        code_lines = []
        in_docstring = False
        for line in self.func_source.split('\n'):
            stripped = line.strip()
            if stripped.startswith('"""') or stripped.startswith("'''"):
                in_docstring = not in_docstring
                if stripped.count('"""') >= 2 or stripped.count("'''") >= 2:
                    in_docstring = False
                continue
            if in_docstring or stripped.startswith('#'):
                continue
            code_lines.append(line)
        code_only = '\n'.join(code_lines)
        wheel_calls = re.findall(r'(?<!mouse)\bwheel\s*\(', code_only)
        assert len(wheel_calls) == 0, (
            "scroll_to_top()에 SikuliX wheel() 사용 감지. "
            "SikuliX wheel()은 TeamViewer 원격 환경에서 비동작."
        )

    def test_mouse_wheel_negative(self):
        """mouseWheel 인자가 음수(스크롤 업)인지 확인"""
        match = re.search(r'_robot\.mouseWheel\(\s*(-?\d+)\s*\)', self.func_source)
        assert match is not None, "mouseWheel 호출에서 인자를 찾을 수 없음"
        value = int(match.group(1))
        assert value < 0, (
            f"mouseWheel 인자가 {value}인데, 스크롤 UP은 음수여야 함 "
            "(Java Robot: negative = away from user = up)"
        )


# ══════════════════════════════════════════════════════════════
# 2. 좌표 중복 판정 테스트 (is_y_already_clicked)
# ══════════════════════════════════════════════════════════════

# 함수 본문을 CPython에서 실행 가능하도록 추출
def _get_is_y_already_clicked():
    """verify_customer_integrated_view.py에서 is_y_already_clicked 추출"""
    source = _read_source(VERIFY_PY)
    func_src = _extract_function_source(source, "is_y_already_clicked")
    assert func_src is not None, "is_y_already_clicked 함수를 찾을 수 없음"
    # SikuliX 의존 없는 순수 로직이므로 직접 exec 가능
    ns = {}
    exec(textwrap.dedent(func_src), ns)
    return ns["is_y_already_clicked"]


class TestIsYAlreadyClicked:
    """좌표 중복 판정 로직 테스트"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.func = _get_is_y_already_clicked()

    def test_empty_set(self):
        """빈 set이면 항상 False"""
        assert self.func(100, set()) is False

    def test_exact_match(self):
        """정확히 같은 좌표는 True"""
        assert self.func(100, {100}) is True

    def test_within_tolerance(self):
        """tolerance 범위 내 (14px 차이, tolerance=15)"""
        assert self.func(114, {100}, tolerance=15) is True

    def test_at_tolerance_boundary(self):
        """tolerance 경계값 (정확히 15px 차이, tolerance=15) — < 이므로 False"""
        assert self.func(115, {100}, tolerance=15) is False

    def test_beyond_tolerance(self):
        """tolerance 초과 (16px 차이)"""
        assert self.func(116, {100}, tolerance=15) is False

    def test_negative_direction(self):
        """음의 방향 차이"""
        assert self.func(86, {100}, tolerance=15) is True

    def test_multiple_values(self):
        """여러 클릭 좌표 중 하나와 매칭"""
        assert self.func(200, {100, 200, 300}) is True

    def test_multiple_values_near(self):
        """여러 좌표 중 하나에 근접"""
        assert self.func(195, {100, 200, 300}, tolerance=10) is True

    def test_multiple_values_none_match(self):
        """여러 좌표 모두 불일치"""
        assert self.func(150, {100, 200, 300}, tolerance=10) is False


# ══════════════════════════════════════════════════════════════
# 3. 행 Y좌표 계산 테스트 (get_row_y)
# ══════════════════════════════════════════════════════════════

def _get_row_y_func_and_constants():
    """MetlifeCustomerList.py에서 get_row_y 함수와 관련 상수 추출"""
    source = _read_source(MCL_PY)

    first_row_offset = _extract_constant(source, "FIRST_ROW_OFFSET")
    first_row_offset_scrolled = _extract_constant(source, "FIRST_ROW_OFFSET_SCROLLED")
    row_height = _extract_constant(source, "ROW_HEIGHT")

    assert first_row_offset is not None, "FIRST_ROW_OFFSET 상수를 찾을 수 없음"
    assert row_height is not None, "ROW_HEIGHT 상수를 찾을 수 없음"

    # 상수를 주입하여 함수 실행
    ns = {
        "FIRST_ROW_OFFSET": first_row_offset,
        "FIRST_ROW_OFFSET_SCROLLED": first_row_offset_scrolled,
        "ROW_HEIGHT": row_height,
    }
    func_src = _extract_function_source(source, "get_row_y")
    assert func_src is not None, "get_row_y 함수를 찾을 수 없음"
    exec(textwrap.dedent(func_src), ns)
    return ns["get_row_y"], first_row_offset, first_row_offset_scrolled, row_height


class TestGetRowY:
    """행 Y좌표 계산 로직 테스트"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.func, self.offset, self.offset_scrolled, self.row_height = _get_row_y_func_and_constants()

    def test_first_row(self):
        """첫 행 (row_index=0, is_scrolled=False)"""
        header_y = 400
        expected = header_y + self.offset  # 400 + 32 = 432
        assert self.func(header_y, 0) == expected

    def test_second_row(self):
        """두 번째 행"""
        header_y = 400
        expected = header_y + self.offset + self.row_height  # 400 + 32 + 37 = 469
        assert self.func(header_y, 1) == expected

    def test_last_visible_row(self):
        """마지막 표시 행 (row_index=11, 12행 중 마지막)"""
        header_y = 400
        expected = header_y + self.offset + (self.row_height * 11)
        assert self.func(header_y, 11) == expected

    def test_scrolled_first_row(self):
        """스크롤 후 첫 행"""
        header_y = 400
        expected = header_y + self.offset_scrolled
        assert self.func(header_y, 0, is_scrolled=True) == expected

    def test_row_spacing_consistency(self):
        """연속 행 간 간격이 정확히 ROW_HEIGHT인지"""
        header_y = 400
        for i in range(11):
            y1 = self.func(header_y, i)
            y2 = self.func(header_y, i + 1)
            assert y2 - y1 == self.row_height, f"행 {i}→{i+1} 간격이 {y2-y1}px (기대: {self.row_height}px)"


# ══════════════════════════════════════════════════════════════
# 4. 고객명 추출 테스트 (get_customer_name)
# ══════════════════════════════════════════════════════════════

def _get_customer_name_func():
    """MetlifeCustomerList.py에서 get_customer_name 추출"""
    source = _read_source(MCL_PY)
    func_src = _extract_function_source(source, "get_customer_name")
    assert func_src is not None
    ns = {}
    exec(textwrap.dedent(func_src), ns)
    return ns["get_customer_name"]


class TestGetCustomerName:
    """고객명 추출 로직 테스트"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.func = _get_customer_name_func()
        self.customers = [
            {"고객명": "장경진", "구분": "계약"},
            {"고객명": "장기수", "구분": "계약"},
            {"고객명": "장동엽", "구분": "계약"},
        ]

    def test_valid_index(self):
        assert self.func(self.customers, 0) == "장경진"
        assert self.func(self.customers, 2) == "장동엽"

    def test_out_of_range(self):
        """범위 초과 시 '?' 반환"""
        assert self.func(self.customers, 3) == "?"
        assert self.func(self.customers, 100) == "?"

    def test_empty_list(self):
        """빈 리스트"""
        assert self.func([], 0) == "?"

    def test_missing_key(self):
        """고객명 키 누락 시 '?' 반환"""
        assert self.func([{"구분": "계약"}], 0) == "?"


# ══════════════════════════════════════════════════════════════
# 5. 블라인드 고객 생성 테스트 (generate_blind_customers)
# ══════════════════════════════════════════════════════════════

def _get_generate_blind_customers():
    source = _read_source(MCL_PY)
    func_src = _extract_function_source(source, "generate_blind_customers")
    assert func_src is not None
    ns = {}
    exec(textwrap.dedent(func_src), ns)
    return ns["generate_blind_customers"]


class TestGenerateBlindCustomers:

    @pytest.fixture(autouse=True)
    def setup(self):
        self.func = _get_generate_blind_customers()

    def test_count(self):
        assert len(self.func(5)) == 5
        assert len(self.func(12)) == 12

    def test_naming_format(self):
        """ROW_XX 형식 이름"""
        rows = self.func(3)
        assert rows[0]["고객명"] == "ROW_01"
        assert rows[2]["고객명"] == "ROW_03"

    def test_required_keys(self):
        """필수 키 존재"""
        rows = self.func(1)
        required_keys = {"고객명", "구분", "생년월일", "보험나이", "성별", "휴대폰"}
        assert required_keys.issubset(set(rows[0].keys()))

    def test_empty(self):
        assert len(self.func(0)) == 0


# ══════════════════════════════════════════════════════════════
# 6. 상수 정합성 테스트
# ══════════════════════════════════════════════════════════════

class TestConstants:
    """두 파일 간 공유 상수가 일치하는지 검증"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.verify_src = _read_source(VERIFY_PY)
        self.mcl_src = _read_source(MCL_PY)

    def test_row_height_consistency(self):
        """ROW_HEIGHT가 양쪽 파일에서 동일"""
        verify_rh = _extract_constant(self.verify_src, "ROW_HEIGHT")
        mcl_rh = _extract_constant(self.mcl_src, "ROW_HEIGHT")
        assert verify_rh is not None, "verify 파일에 ROW_HEIGHT 없음"
        assert mcl_rh is not None, "MCL 파일에 ROW_HEIGHT 없음"
        assert verify_rh == mcl_rh, (
            f"ROW_HEIGHT 불일치: verify={verify_rh}, MCL={mcl_rh}"
        )

    def test_row_height_value(self):
        """ROW_HEIGHT가 37인지 (실측 기준값)"""
        mcl_rh = _extract_constant(self.mcl_src, "ROW_HEIGHT")
        assert mcl_rh == 37, f"ROW_HEIGHT={mcl_rh} (기대: 37)"

    def test_rows_per_page(self):
        """ROWS_PER_PAGE가 12인지"""
        val = _extract_constant(self.mcl_src, "ROWS_PER_PAGE")
        assert val == 12, f"ROWS_PER_PAGE={val} (기대: 12)"

    def test_first_row_offset(self):
        """FIRST_ROW_OFFSET가 32인지"""
        val = _extract_constant(self.mcl_src, "FIRST_ROW_OFFSET")
        assert val == 32, f"FIRST_ROW_OFFSET={val} (기대: 32)"


# ══════════════════════════════════════════════════════════════
# 7. --timestamp 인자 보존 테스트 (gui_main.py)
# ══════════════════════════════════════════════════════════════

class TestTimestampArgPreservation:
    """gui_main.py의 --run-reports 핸들러가 --timestamp 인자를 보존하는지"""

    @pytest.fixture(autouse=True)
    def setup(self):
        gui_main_path = os.path.join(AC_DIR, "gui_main.py")
        with open(gui_main_path, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_timestamp_handling_exists(self):
        """--timestamp 처리 코드가 --run-reports 블록 내에 존재"""
        # --run-reports 블록 찾기
        run_reports_match = re.search(
            r'if\s+"--run-reports"\s+in\s+sys\.argv.*?(?=\n    # |\nif |\Z)',
            self.source,
            re.DOTALL
        )
        assert run_reports_match is not None, "--run-reports 핸들러를 찾을 수 없음"
        block = run_reports_match.group(0)
        assert '"--timestamp"' in block, (
            "--run-reports 블록에 --timestamp 처리 코드가 없음. "
            "증분 리포트 갱신 시 타임스탬프 유실됩니다."
        )

    def test_timestamp_added_to_new_argv(self):
        """_new_argv에 --timestamp가 extend되는지"""
        assert '_new_argv.extend(["--timestamp"' in self.source, (
            "_new_argv에 --timestamp extend 코드가 없음"
        )


# ══════════════════════════════════════════════════════════════
# 8. PDF 포커스 방향 회귀 방지 테스트
# ══════════════════════════════════════════════════════════════

class TestPdfFocusDirection:
    """
    PDF 뷰어 포커스 확보 시 X+80(우측) 사용 금지.
    AC 콘솔(x=1376~, topmost)과 겹쳐 포커스 탈취 발생.

    수정: Y+150(아래쪽, PDF 본문 영역) 클릭으로 변경.
    배경: 2026-02-28 전효선 "AR PDF 뷰어 닫기 실패" 장애
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.source = _read_source(VERIFY_PY)

    def test_no_x_plus_80_pattern(self):
        """getX() + 80 패턴이 소스에 없어야 함 (AC 콘솔 겹침 방지)"""
        matches = re.findall(r'getX\(\)\s*\)\s*\+\s*80', self.source)
        assert len(matches) == 0, (
            f"getX() + 80 패턴 {len(matches)}건 발견. "
            "AC 콘솔(x=1376~)과 겹쳐 포커스 탈취. Y+150(아래쪽) 사용 필수."
        )

    def test_focus_and_close_pdf_exists(self):
        """_focus_and_close_pdf 헬퍼 함수가 존재하는지"""
        assert "def _focus_and_close_pdf()" in self.source, (
            "_focus_and_close_pdf() 함수가 정의되어 있지 않음"
        )

    def test_focus_uses_y_offset(self):
        """_focus_and_close_pdf()가 Y방향 오프셋을 사용하는지"""
        func_src = _extract_function_source(self.source, "_focus_and_close_pdf")
        assert func_src is not None, "_focus_and_close_pdf 함수를 찾을 수 없음"
        assert "getY()" in func_src, (
            "_focus_and_close_pdf()에 getY() 호출 없음. Y방향 오프셋 필수."
        )

    def test_taskkill_fallback_exists(self):
        """_taskkill_pdf 최후 수단 함수가 존재하는지"""
        assert "def _taskkill_pdf()" in self.source, (
            "_taskkill_pdf() 함수가 정의되어 있지 않음. "
            "3회 닫기 실패 시 taskkill fallback 필수."
        )

    def test_all_pdf_close_use_helper(self):
        """모든 PDF 닫기 위치에서 _focus_and_close_pdf()를 호출하는지"""
        calls = re.findall(r'_focus_and_close_pdf\(\)', self.source)
        # 최소 5곳 (AR, CRS, Recovery, Crash recovery, Cleanup)
        assert len(calls) >= 5, (
            f"_focus_and_close_pdf() 호출 {len(calls)}건 (기대: 5건 이상). "
            "모든 PDF 닫기 위치에서 헬퍼 함수를 사용해야 함."
        )


# ══════════════════════════════════════════════════════════════
# 9. PROD 암호화 진단 시스템 회귀 테스트
# ══════════════════════════════════════════════════════════════

SECURE_DIAG_PY = os.path.join(AC_DIR, "secure_diag.py")
ACDUMP_READER_PY = os.path.join(AC_DIR, "acdump_reader.py")
DATA_SOURCE_PY = os.path.join(AC_DIR, "data_source.py")
GUI_MAIN_PY = os.path.join(AC_DIR, "gui_main.py")


class TestProdEncryptionFiles:
    """PROD 암호화 진단 시스템 필수 파일 존재 여부"""

    def test_secure_diag_exists(self):
        """secure_diag.py (Jython 암호화 writer) 존재"""
        assert os.path.exists(SECURE_DIAG_PY), "secure_diag.py 파일 없음"

    def test_acdump_reader_exists(self):
        """acdump_reader.py (CPython 복호화 도구) 존재"""
        assert os.path.exists(ACDUMP_READER_PY), "acdump_reader.py 파일 없음"


class TestAcdumpReaderFormat:
    """acdump_reader.py가 올바른 바이너리 포맷을 읽는지 검증"""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        self.tmp_path = tmp_path
        # acdump_reader.py에서 read_entries, _MAGIC 가져오기
        import importlib.util
        spec = importlib.util.spec_from_file_location("acdump_reader", ACDUMP_READER_PY)
        self.reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.reader)

    def _make_acdump(self, entries):
        """테스트용 .acdump 파일 생성 (AES-256-CBC 암호화)"""
        filepath = str(self.tmp_path / "test.acdump")
        key_hex = self.reader._DEFAULT_KEY

        # cryptography 패키지 사용 (CPython 테스트 환경)
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives import padding as crypto_padding

        key_bytes = bytes.fromhex(key_hex[:64])

        with open(filepath, "wb") as f:
            f.write(b"ACDUMP01")
            for entry_type, name, data in entries:
                # payload = [name_len:2][name:UTF-8][data]
                name_bytes = name.encode("utf-8")
                payload = struct.pack(">H", len(name_bytes)) + name_bytes + data

                # PKCS7 패딩 + AES-256-CBC 암호화
                iv = os.urandom(16)
                padder = crypto_padding.PKCS7(128).padder()
                padded = padder.update(payload) + padder.finalize()
                cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv))
                encryptor = cipher.encryptor()
                encrypted = encryptor.update(padded) + encryptor.finalize()

                f.write(bytes([entry_type]))
                f.write(iv)
                f.write(struct.pack(">I", len(encrypted)))
                f.write(encrypted)
        return filepath

    def test_magic_header_validation(self):
        """잘못된 매직 헤더 → ValueError"""
        bad_file = str(self.tmp_path / "bad.acdump")
        with open(bad_file, "wb") as f:
            f.write(b"BADMAGIC")
        with pytest.raises(ValueError, match="매직 헤더 불일치"):
            list(self.reader.read_entries(bad_file, self.reader._DEFAULT_KEY))

    def test_single_log_entry(self):
        """LOG 엔트리 1개 암호화 → 복호화 왕복"""
        filepath = self._make_acdump([
            (0x02, "log", "테스트 로그 메시지".encode("utf-8")),
        ])
        entries = list(self.reader.read_entries(filepath, self.reader._DEFAULT_KEY))
        assert len(entries) == 1
        entry_type, name, data = entries[0]
        assert entry_type == 0x02
        assert name == "log"
        assert data.decode("utf-8") == "테스트 로그 메시지"

    def test_multiple_entry_types(self):
        """여러 엔트리 타입 (SYSTEM_INFO, LOG, IMAGE, JSON) 복호화"""
        filepath = self._make_acdump([
            (0x01, "system_info", "OS=Windows".encode("utf-8")),
            (0x02, "log", "line 1".encode("utf-8")),
            (0x02, "log", "line 2".encode("utf-8")),
            (0x03, "error_001.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 100),
            (0x04, "checkpoint.json", '{"step":5}'.encode("utf-8")),
        ])
        entries = list(self.reader.read_entries(filepath, self.reader._DEFAULT_KEY))
        assert len(entries) == 5
        assert entries[0][0] == 0x01  # SYSTEM_INFO
        assert entries[1][0] == 0x02  # LOG
        assert entries[2][0] == 0x02  # LOG
        assert entries[3][0] == 0x03  # IMAGE
        assert entries[4][0] == 0x04  # JSON
        assert entries[3][1] == "error_001.png"
        assert entries[4][2].decode("utf-8") == '{"step":5}'

    def test_extract_output(self):
        """extract() 함수가 파일을 올바르게 추출하는지"""
        filepath = self._make_acdump([
            (0x01, "system_info", "OS=Test".encode("utf-8")),
            (0x02, "log", "log line A".encode("utf-8")),
            (0x02, "log", "log line B".encode("utf-8")),
            (0x04, "data.json", '{"key":"val"}'.encode("utf-8")),
        ])
        output_dir = str(self.tmp_path / "extracted")
        counts = self.reader.extract(filepath, self.reader._DEFAULT_KEY, output_dir)
        assert counts[0x01] == 1
        assert counts[0x02] == 2
        assert counts[0x04] == 1

        # system_info.txt 검증
        with open(os.path.join(output_dir, "system_info.txt"), encoding="utf-8") as f:
            assert "OS=Test" in f.read()

        # merged_log.txt 검증
        with open(os.path.join(output_dir, "merged_log.txt"), encoding="utf-8") as f:
            content = f.read()
            assert "log line A" in content
            assert "log line B" in content

    def test_empty_file_no_entries(self):
        """매직 헤더만 있고 엔트리 없는 파일"""
        filepath = str(self.tmp_path / "empty.acdump")
        with open(filepath, "wb") as f:
            f.write(b"ACDUMP01")
        entries = list(self.reader.read_entries(filepath, self.reader._DEFAULT_KEY))
        assert len(entries) == 0

    def test_type_names_coverage(self):
        """TYPE_NAMES 상수가 4개 타입을 모두 포함"""
        assert 0x01 in self.reader.TYPE_NAMES
        assert 0x02 in self.reader.TYPE_NAMES
        assert 0x03 in self.reader.TYPE_NAMES
        assert 0x04 in self.reader.TYPE_NAMES


class TestProdModeGuards:
    """PROD 모드에서 평문 파일이 생성되지 않도록 가드가 존재하는지 소스 코드 검증"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.mcl_src = _read_source(MCL_PY)
        self.verify_src = _read_source(VERIFY_PY)
        self.ds_src = _read_source(DATA_SOURCE_PY)
        self.gui_src = _read_source(GUI_MAIN_PY)

    def test_mcl_dev_dir_conditional(self):
        """MetlifeCustomerList.py에서 DEV_DIR이 PROD에서 None이 되는지"""
        assert "DEV_DIR = None" in self.mcl_src, (
            "DEV_DIR = None 할당이 없음. PROD에서 dev/ 폴더가 생성될 수 있음."
        )

    def test_mcl_imports_secure_diag(self):
        """MetlifeCustomerList.py에서 secure_diag를 import하는지"""
        assert "from secure_diag import DiagWriter" in self.mcl_src, (
            "secure_diag import 없음. PROD 암호화 writer가 사용되지 않을 수 있음."
        )

    def test_mcl_diag_write_log(self):
        """MetlifeCustomerList.py log()에 _diag.write_log 분기 존재"""
        assert "_diag.write_log(" in self.mcl_src, (
            "log()에 _diag.write_log() 호출 없음. PROD 로그가 암호화되지 않을 수 있음."
        )

    def test_mcl_diag_write_image(self):
        """MetlifeCustomerList.py에 _diag.write_image 호출 존재"""
        assert "_diag.write_image(" in self.mcl_src, (
            "_diag.write_image() 호출 없음. PROD 스크린샷이 암호화되지 않을 수 있음."
        )

    def test_mcl_diag_write_json(self):
        """MetlifeCustomerList.py에 _diag.write_json 호출 존재"""
        assert "_diag.write_json(" in self.mcl_src, (
            "_diag.write_json() 호출 없음. PROD JSON이 암호화되지 않을 수 있음."
        )

    def test_mcl_diag_delete_on_exit(self):
        """MetlifeCustomerList.py에 _diag.delete() 호출 존재 (정상 종료 시 삭제)"""
        assert "_diag.delete()" in self.mcl_src, (
            "_diag.delete() 호출 없음. 정상 종료 시 .acdump 파일이 남을 수 있음."
        )

    def test_verify_prod_guard(self):
        """verify_customer_integrated_view.py에 PROD 모드 가드 존재"""
        assert "_VCIV_DEV_MODE" in self.verify_src, (
            "_VCIV_DEV_MODE 변수 없음. PROD 모드 감지가 안 될 수 있음."
        )
        assert "_VCIV_DIAG" in self.verify_src, (
            "_VCIV_DIAG 변수 없음. PROD 암호화 writer가 사용되지 않을 수 있음."
        )

    def test_verify_step_screenshot_guard(self):
        """capture_step_screenshot()에 PROD no-op 가드 존재"""
        func_src = _extract_function_source(self.verify_src, "capture_step_screenshot")
        assert func_src is not None, "capture_step_screenshot 함수를 찾을 수 없음"
        assert "_VCIV_DEV_MODE" in func_src, (
            "capture_step_screenshot()에 PROD 가드 없음. "
            "PROD에서 불필요한 단계별 스크린샷이 저장될 수 있음."
        )

    def test_ds_prod_guard(self):
        """data_source.py에 PROD 모드 가드 존재"""
        assert "_DS_DEV_MODE" in self.ds_src, (
            "_DS_DEV_MODE 변수 없음. PROD에서 debug_trace.log가 디스크에 쓰일 수 있음."
        )

    def test_ds_live_raw_conditional(self):
        """data_source.py _read_stdout()에 PROD 디스크 쓰기 안 함 분기 존재"""
        assert "raw_log = None" in self.ds_src, (
            "raw_log = None 없음. PROD에서 live_raw 로그가 디스크에 쓰일 수 있음."
        )

    def test_gui_acdump_cleanup(self):
        """gui_main.py에 .acdump 정리 코드 존재"""
        assert ".ac_*.acdump" in self.gui_src, (
            "gui_main.py에 .acdump glob 패턴 없음. 정상 종료 시 파일 정리가 안 될 수 있음."
        )

    def test_gui_diag_status_label(self):
        """gui_main.py 크래시 시 진단파일 저장됨 라벨 존재"""
        assert "진단파일 저장됨" in self.gui_src, (
            "gui_main.py에 '진단파일 저장됨' 텍스트 없음. "
            "크래시 시 사용자에게 진단파일 존재 알림이 안 될 수 있음."
        )

    def test_capture_and_exit_prod_guard(self):
        """capture_and_exit()에 PROD 가드 존재 (SCREENSHOT_DIR=None 크래시 방지)"""
        func_src = _extract_function_source(self.verify_src, "capture_and_exit")
        assert func_src is not None, "capture_and_exit 함수를 찾을 수 없음"
        assert "_VCIV_DEV_MODE" in func_src or "_VCIV_DIAG" in func_src, (
            "capture_and_exit()에 PROD 가드 없음. "
            "PROD에서 SCREENSHOT_DIR=None → TypeError 크래시 발생."
        )

    def test_is_row_checked_prod_guard(self):
        """is_row_checked()에 PROD 가드 존재"""
        func_src = _extract_function_source(self.verify_src, "is_row_checked")
        assert func_src is not None, "is_row_checked 함수를 찾을 수 없음"
        assert "_VCIV_DEV_MODE" in func_src, (
            "is_row_checked()에 PROD 가드 없음. "
            "PROD에서 SCREENSHOT_DIR=None → TypeError 크래시 발생."
        )

    def test_copy_report_screenshots_prod_guard(self):
        """copy_report_screenshots_to_error_folder()에 PROD 가드 존재"""
        func_src = _extract_function_source(self.verify_src, "copy_report_screenshots_to_error_folder")
        assert func_src is not None, "copy_report_screenshots_to_error_folder 함수를 찾을 수 없음"
        assert "_VCIV_DEV_MODE" in func_src, (
            "copy_report_screenshots_to_error_folder()에 PROD 가드 없음. "
            "PROD에서 SCREENSHOT_DIR=None → TypeError 크래시 발생."
        )

    def test_no_bare_screenshot_dir_join(self):
        """SCREENSHOT_DIR을 _VCIV_DEV_MODE 가드 없이 직접 os.path.join하지 않는지 검증"""
        # SCREENSHOT_DIR 사용 라인에서 가드 없이 직접 접근하는 패턴 탐색
        # 함수 상단의 early return 가드도 포함하여 검사
        lines = self.verify_src.split('\n')
        unguarded = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if 'os.path.join(SCREENSHOT_DIR' in stripped and not stripped.startswith('#'):
                # 이 라인 이전 30줄 내에 _VCIV_DEV_MODE 가드가 있는지 확인
                # (함수 상단의 early return 또는 직전의 if 블록 포함)
                context = '\n'.join(lines[max(0, i-31):i])
                if '_VCIV_DEV_MODE' not in context and 'if SCREENSHOT_DIR' not in context:
                    unguarded.append(f"  L{i}: {stripped}")
        assert len(unguarded) == 0, (
            f"PROD 가드 없이 SCREENSHOT_DIR을 직접 사용하는 {len(unguarded)}곳 발견:\n" +
            "\n".join(unguarded)
        )


class TestEncryptionKeyConsistency:
    """암호화 키가 모든 관련 파일에서 일치하는지 검증"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.mcl_src = _read_source(MCL_PY)
        self.reader_src = _read_source(ACDUMP_READER_PY)
        self.gui_src = _read_source(GUI_MAIN_PY)
        self.secure_src = _read_source(SECURE_DIAG_PY)

    def _extract_key(self, source, label=""):
        """소스에서 64자 hex 키 문자열 추출"""
        match = re.search(r'"(7e66b5dd[0-9a-f]{56})"', source)
        assert match is not None, f"키를 찾을 수 없음 ({label})"
        return match.group(1)

    def test_mcl_and_reader_key_match(self):
        """MetlifeCustomerList.py와 acdump_reader.py의 키 일치"""
        mcl_key = self._extract_key(self.mcl_src, "MCL")
        reader_key = self._extract_key(self.reader_src, "reader")
        assert mcl_key == reader_key, (
            f"키 불일치: MCL={mcl_key[:16]}... vs reader={reader_key[:16]}..."
        )

    def test_gui_and_reader_key_match(self):
        """gui_main.py(_DEV_PIN_HASH)와 acdump_reader.py의 키 일치"""
        gui_key = self._extract_key(self.gui_src, "gui_main")
        reader_key = self._extract_key(self.reader_src, "reader")
        assert gui_key == reader_key, (
            f"키 불일치: gui={gui_key[:16]}... vs reader={reader_key[:16]}..."
        )


# ══════════════════════════════════════════════════════════════
# 포커스 자동 복구 회귀 테스트 (v0.1.122, 커밋 700b86b4)
# ══════════════════════════════════════════════════════════════

class TestEnsureBrowserFocus:
    """
    ensure_browser_focus() 함수가 모든 주요 클릭 지점에 배치되어 있는지 검증.

    배경: TeamViewer 원격 접속 시 MetLife 브라우저가 비활성화되면
    SikuliX 클릭이 JavaScript 이벤트를 발동시키지 못함 → FATAL.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.verify_src = _read_source(VERIFY_PY)

    def test_ensure_browser_focus_function_exists(self):
        """ensure_browser_focus() 함수 정의 존재"""
        assert "def ensure_browser_focus():" in self.verify_src, (
            "ensure_browser_focus() 함수가 verify_customer_integrated_view.py에 없음"
        )

    def test_ensure_browser_focus_uses_app_focus(self):
        """ensure_browser_focus()가 App.focus('Chrome')을 호출"""
        func_src = _extract_function_source(self.verify_src, "ensure_browser_focus")
        assert func_src is not None, "ensure_browser_focus 함수를 찾을 수 없음"
        assert 'App.focus("Chrome")' in func_src or "App.focus('Chrome')" in func_src, (
            "ensure_browser_focus()가 App.focus('Chrome')을 호출하지 않음"
        )

    def test_ensure_browser_focus_has_alt_tab_fallback(self):
        """ensure_browser_focus()에 Alt+Tab 폴백 존재"""
        func_src = _extract_function_source(self.verify_src, "ensure_browser_focus")
        assert func_src is not None
        assert "Key.TAB" in func_src and "Key.ALT" in func_src, (
            "ensure_browser_focus()에 Alt+Tab 폴백이 없음"
        )

    def test_ensure_browser_focus_minimum_call_count(self):
        """ensure_browser_focus() 호출이 최소 10곳 이상 (14곳 적용됨)"""
        # 함수 정의 자체는 제외하고 호출만 카운트
        call_count = self.verify_src.count("ensure_browser_focus()")
        definition_count = self.verify_src.count("def ensure_browser_focus()")
        actual_calls = call_count - definition_count
        assert actual_calls >= 10, (
            f"ensure_browser_focus() 호출이 {actual_calls}곳뿐. "
            f"최소 10곳 이상 필요 (현재 14곳 적용)."
        )

    def test_scroll_to_top_has_focus(self):
        """scroll_to_top()에 ensure_browser_focus() 호출 존재"""
        func_src = _extract_function_source(self.verify_src, "scroll_to_top")
        assert func_src is not None, "scroll_to_top 함수를 찾을 수 없음"
        assert "ensure_browser_focus()" in func_src, (
            "scroll_to_top()에 ensure_browser_focus()가 없음. "
            "스크롤 전 브라우저 포커스 복구 필수."
        )

    def test_click_all_rows_has_focus(self):
        """click_all_rows_with_scroll()에 ensure_browser_focus() 호출 존재"""
        func_src = _extract_function_source(self.verify_src, "click_all_rows_with_scroll")
        assert func_src is not None, "click_all_rows_with_scroll 함수를 찾을 수 없음"
        assert "ensure_browser_focus()" in func_src, (
            "click_all_rows_with_scroll()에 ensure_browser_focus()가 없음. "
            "행 클릭 전 브라우저 포커스 복구 필수."
        )

    def test_save_report_pdf_has_focus(self):
        """save_report_pdf()에 ensure_browser_focus() 호출 존재"""
        func_src = _extract_function_source(self.verify_src, "save_report_pdf")
        assert func_src is not None, "save_report_pdf 함수를 찾을 수 없음"
        assert "ensure_browser_focus()" in func_src, (
            "save_report_pdf()에 ensure_browser_focus()가 없음. "
            "PDF 저장 과정에서 포커스 유실 시 저장 실패."
        )

    def test_recover_to_report_list_has_focus(self):
        """recover_to_report_list()에 ensure_browser_focus() 호출 존재"""
        func_src = _extract_function_source(self.verify_src, "recover_to_report_list")
        assert func_src is not None, "recover_to_report_list 함수를 찾을 수 없음"
        assert "ensure_browser_focus()" in func_src, (
            "recover_to_report_list()에 ensure_browser_focus()가 없음. "
            "에러 복구 시 포커스 유실 가능성 높음."
        )


# ══════════════════════════════════════════════════════════════
# PDF 미리보기 중복 팝업 방지 회귀 테스트 (v0.1.119, 커밋 af6ae8d4)
# ══════════════════════════════════════════════════════════════

class TestPdfPreviewReclickLimit:
    """
    미리보기 버튼 재클릭 횟수/간격 제한 검증.

    배경: PREVIEW_POLL 루프에서 미리보기 버튼을 무제한 재클릭하면
    서버에 중복 요청 → 복수 PDF 팝업 생성 → 꼬임.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.verify_src = _read_source(VERIFY_PY)

    def _extract_local_constant(self, const_name):
        """함수 내부 로컬 상수도 추출 (들여쓰기 포함)"""
        pattern = re.compile(
            r'^\s+' + re.escape(const_name) + r'\s*=\s*(.+?)(?:\s*#.*)?$',
            re.MULTILINE
        )
        match = pattern.search(self.verify_src)
        if match:
            try:
                return eval(match.group(1).strip())
            except Exception:
                return match.group(1).strip()
        return None

    def test_max_preview_clicks_constant(self):
        """MAX_PREVIEW_CLICKS 상수 존재 (재클릭 최대 횟수)"""
        assert "MAX_PREVIEW_CLICKS" in self.verify_src, (
            "MAX_PREVIEW_CLICKS 상수가 없음. 재클릭 무제한 → 중복 팝업 위험."
        )
        val = self._extract_local_constant("MAX_PREVIEW_CLICKS")
        assert val is not None, "MAX_PREVIEW_CLICKS 값을 추출할 수 없음"
        assert val == 3, f"MAX_PREVIEW_CLICKS는 3이어야 함 (현재: {val})"

    def test_min_reclick_interval_constant(self):
        """MIN_RECLICK_INTERVAL 상수 존재 (재클릭 최소 간격)"""
        assert "MIN_RECLICK_INTERVAL" in self.verify_src, (
            "MIN_RECLICK_INTERVAL 상수가 없음. 서버 응답 충분 대기 필수."
        )
        val = self._extract_local_constant("MIN_RECLICK_INTERVAL")
        assert val is not None, "MIN_RECLICK_INTERVAL 값을 추출할 수 없음"
        assert val == 30, f"MIN_RECLICK_INTERVAL는 30초여야 함 (현재: {val})"

    def test_preview_max_timeout(self):
        """PREVIEW_MAX 상수 존재 (최대 총 대기 시간)"""
        val = self._extract_local_constant("PREVIEW_MAX")
        assert val is not None, "PREVIEW_MAX 값을 추출할 수 없음"
        assert val == 90, f"PREVIEW_MAX는 90초여야 함 (현재: {val})"

    def test_preview_poll_interval(self):
        """PREVIEW_POLL 상수 존재 (PDF 로딩 확인 주기)"""
        val = self._extract_local_constant("PREVIEW_POLL")
        assert val is not None, "PREVIEW_POLL 값을 추출할 수 없음"
        assert val == 10, f"PREVIEW_POLL는 10초여야 함 (현재: {val})"

    def test_click_count_guard_in_source(self):
        """재클릭 횟수 제한 가드 코드 존재"""
        assert "click_count < MAX_PREVIEW_CLICKS" in self.verify_src, (
            "재클릭 횟수 제한 가드(click_count < MAX_PREVIEW_CLICKS)가 소스에 없음"
        )

    def test_reclick_interval_guard_in_source(self):
        """재클릭 간격 제한 가드 코드 존재"""
        assert "time_since_last" in self.verify_src and "MIN_RECLICK_INTERVAL" in self.verify_src, (
            "재클릭 간격 제한 가드(time_since_last >= MIN_RECLICK_INTERVAL)가 소스에 없음"
        )


# ══════════════════════════════════════════════════════════════
# 타이틀바 다크모드 회귀 테스트 (v0.1.121, 커밋 d4161b21)
# ══════════════════════════════════════════════════════════════

class TestTitlebarDarkMode:
    """
    타이틀바 다크모드 적용 타이밍 검증.

    배경: overrideredirect(False) 복원 후 DWM 속성을 즉시 적용하면
    프레임이 아직 갱신되지 않아 타이틀바가 하얀색으로 표시됨.
    해결: _apply_titlebar_style() 80ms 지연 호출 + SWP_FRAMECHANGED.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.gui_src = _read_source(GUI_MAIN_PY)

    def test_apply_titlebar_style_function_exists(self):
        """_apply_titlebar_style() 함수 정의 존재"""
        assert "def _apply_titlebar_style(self):" in self.gui_src, (
            "_apply_titlebar_style() 함수가 gui_main.py에 없음"
        )

    def _extract_method_source(self, method_name):
        """클래스 메서드(들여쓰기된 def) 소스 추출"""
        pattern = re.compile(
            r'^(\s+def\s+' + re.escape(method_name) + r'\s*\(.*?\):\s*\n(?:(?:\s+.*|[ \t]*)\n)*)',
            re.MULTILINE
        )
        match = pattern.search(self.gui_src)
        if match:
            return match.group(1)
        return None

    def test_dwm_dark_mode_attribute(self):
        """DWMWA_USE_IMMERSIVE_DARK_MODE(20) 사용"""
        func_src = self._extract_method_source("_apply_titlebar_style")
        assert func_src is not None, "_apply_titlebar_style 메서드를 찾을 수 없음"
        assert "DWMWA_USE_IMMERSIVE_DARK_MODE" in func_src, (
            "DWM 다크모드 속성(DWMWA_USE_IMMERSIVE_DARK_MODE)이 없음"
        )
        assert "= 20" in func_src, (
            "DWMWA_USE_IMMERSIVE_DARK_MODE 값이 20이 아님"
        )

    def test_frame_changed_flag(self):
        """SWP_FRAMECHANGED 프레임 강제 갱신 플래그 존재"""
        func_src = self._extract_method_source("_apply_titlebar_style")
        assert func_src is not None, "_apply_titlebar_style 메서드를 찾을 수 없음"
        assert "SWP_FRAMECHANGED" in func_src, (
            "SWP_FRAMECHANGED 플래그가 없음. "
            "overrideredirect 복원 후 DWM 속성 반영을 위해 필수."
        )

    def test_delayed_call_after_overrideredirect(self):
        """overrideredirect(False) 후 _apply_titlebar_style이 지연 호출됨"""
        # self.after(80, self._apply_titlebar_style) 패턴 확인
        pattern = re.compile(r'self\.after\(\s*\d+\s*,\s*self\._apply_titlebar_style\s*\)')
        matches = pattern.findall(self.gui_src)
        assert len(matches) >= 2, (
            f"_apply_titlebar_style 지연 호출이 {len(matches)}곳뿐. "
            "overrideredirect(False) 복원 후 최소 2곳에서 지연 호출 필요."
        )

    def test_delay_is_at_least_50ms(self):
        """지연 시간이 최소 50ms 이상"""
        pattern = re.compile(r'self\.after\(\s*(\d+)\s*,\s*self\._apply_titlebar_style\s*\)')
        for match in pattern.finditer(self.gui_src):
            delay = int(match.group(1))
            assert delay >= 50, (
                f"_apply_titlebar_style 지연 시간이 {delay}ms. "
                "최소 50ms 이상이어야 DWM이 프레임을 반영할 수 있음."
            )


# ══════════════════════════════════════════════════════════════
# CRS 저장 다이얼로그 Alt+N 회귀 테스트 (v0.1.120, 커밋 6b1bf529)
# ══════════════════════════════════════════════════════════════

class TestCrsSaveDialogAltN:
    """
    저장 다이얼로그에서 Alt+N으로 파일 이름(N) 필드 포커스 확보 검증.

    배경: Tab/Shift+Tab으로는 포커스가 확실하지 않아
    이전 폴더(AR)에 저장되는 버그 발생.
    Alt+N = Windows 표준 "파일 이름(N)" 단축키로 확실한 포커스 확보.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.verify_src = _read_source(VERIFY_PY)

    def test_navigate_save_dialog_function_exists(self):
        """navigate_save_dialog_to_dir() 함수 존재"""
        assert "def navigate_save_dialog_to_dir(" in self.verify_src, (
            "navigate_save_dialog_to_dir() 함수가 없음"
        )

    def test_alt_n_shortcut_in_save_dialog(self):
        """저장 다이얼로그에서 Alt+N 단축키 사용"""
        func_src = _extract_function_source(self.verify_src, "navigate_save_dialog_to_dir")
        assert func_src is not None, "navigate_save_dialog_to_dir 함수를 찾을 수 없음"
        # Alt+N = Key.N with Key.ALT modifier
        assert "Key.ALT" in func_src, (
            "navigate_save_dialog_to_dir()에 Alt 키 사용이 없음. "
            "Alt+N으로 파일 이름(N) 필드 포커스 확보 필수."
        )
