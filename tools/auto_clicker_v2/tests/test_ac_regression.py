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
