# -*- coding: utf-8 -*-
"""AutoClicker v2 - GUI 애플리케이션
일반 모드: 초성 선택 → 실행 → 4패널 모니터링
컴팩트 모드: 실행 중 자동 전환, 극소형 상태바
"""
import ctypes
import os
import tkinter.font as tkfont
import customtkinter as ctk
from tkinter import filedialog, messagebox

from app_state import AppState
from data_source import LiveProcessSource

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_SAVE_DIR = os.path.join(_BASE_DIR, "output")

def _read_version() -> str:
    try:
        with open(os.path.join(_BASE_DIR, "VERSION"), "r") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"

_VERSION = _read_version()

# 통일 폰트
_FONT = "맑은 고딕"

from panels.progress_panel import ProgressPanel
from panels.customer_table import CustomerTablePanel
from panels.log_view import LogViewPanel
from panels.pdf_result import PdfResultPanel
from panels.compact_panel import CompactPanel
from settings_store import load_settings, save_settings

COMPACT_HEIGHT = 47
COMPACT_WIDTH = 850

# 일반 모드 고정 크기/위치 (1920x1080 기준)
NORMAL_WIDTH = 480
NORMAL_HEIGHT = 440
NORMAL_X = 1376
NORMAL_Y = 454

_CHOSUNGS = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ","기타"]

_CHOSUNGS_FULL = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]
_DOUBLE_MAP = {"ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ"}

def _chosung_of(name: str) -> str:
    """고객명 첫 글자에서 초성 추출 (홍길동 → ㅎ)"""
    if not name:
        return ""
    code = ord(name[0])
    if 0xAC00 <= code <= 0xD7A3:
        ch = _CHOSUNGS_FULL[(code - 0xAC00) // 588]
        return _DOUBLE_MAP.get(ch, ch)
    return "기타"


def _enumerate_monitors() -> dict[int, tuple[int, int, int, int]]:
    """Windows 디스플레이 번호 기준 모니터 정보 반환.

    Returns: {1: (left, top, w, h), 2: (left, top, w, h), ...}
    키 = Windows 설정 > 디스플레이에 표시되는 번호 (\\.\DISPLAY1 → 1)
    """
    result: dict[int, tuple[int, int, int, int]] = {}
    try:
        import ctypes as _ct
        import ctypes.wintypes

        user32 = _ct.windll.user32
        handles: list[int] = []

        @_ct.WINFUNCTYPE(_ct.c_int, _ct.c_void_p, _ct.c_void_p,
                         _ct.POINTER(_ct.wintypes.RECT), _ct.c_void_p)
        def _cb(hmon, hdc, lprect, lparam):
            handles.append(hmon)
            return 1

        user32.EnumDisplayMonitors(None, None, _cb, 0)

        for hmon in handles:
            # MONITORINFOEXW: cbSize(4) + rcMonitor(16) + rcWork(16) + dwFlags(4) + szDevice(64)
            info = _ct.create_string_buffer(104)
            _ct.c_uint.from_buffer(info, 0).value = 104
            if not user32.GetMonitorInfoW(hmon, info):
                continue
            # rcMonitor: offset 4, 4 ints (left, top, right, bottom)
            left = _ct.c_long.from_buffer(info, 4).value
            top = _ct.c_long.from_buffer(info, 8).value
            right = _ct.c_long.from_buffer(info, 12).value
            bottom = _ct.c_long.from_buffer(info, 16).value
            # szDevice: offset 40, 32 wchars → e.g. "\\.\DISPLAY1"
            device = _ct.wstring_at(_ct.addressof(info) + 40, 32).rstrip("\x00")
            # 디스플레이 번호 추출
            num = int("".join(c for c in device if c.isdigit()) or "0")
            if num > 0:
                result[num] = (left, top, right - left, bottom - top)
    except Exception:
        pass
    return result


class AutoClickerApp(ctk.CTk):
    # 클래스 변수: mutex 핸들 (GC 방지)
    _mutex_handle = None

    def __init__(self, cli_args=None):
        # ── 싱글 인스턴스 보호 (super() 전에 실행 → 창 안 뜸) ──
        _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        _k32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
        _k32.CreateMutexW.restype = ctypes.c_void_p
        _k32.CloseHandle.argtypes = [ctypes.c_void_p]
        _k32.CloseHandle.restype = ctypes.c_int
        AutoClickerApp._mutex_handle = _k32.CreateMutexW(None, 1, "AutoClickerV2_SingleInstance")
        if AutoClickerApp._mutex_handle is None or ctypes.get_last_error() == 183:
            if AutoClickerApp._mutex_handle:
                _k32.CloseHandle(AutoClickerApp._mutex_handle)
            import tkinter as _tk
            _tmp = _tk.Tk()
            _tmp.withdraw()
            messagebox.showwarning("AutoClicker", "이미 실행 중입니다.\n기존 창을 사용하세요.", parent=_tmp)
            _tmp.destroy()
            raise SystemExit(0)

        super().__init__()

        self.title(f"AutoClicker v{_VERSION}")
        self._target_monitor = 0  # 0=자동, 1=모니터1, 2=모니터2
        self.resizable(False, False)

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # 전역 기본 폰트 → 맑은 고딕 (궁서체/바탕체 제거)
        for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont",
                      "TkHeadingFont", "TkCaptionFont", "TkSmallCaptionFont",
                      "TkIconFont", "TkTooltipFont"):
            try:
                tkfont.nametofont(name).configure(family=_FONT)
            except Exception:
                pass

        self._state = AppState()
        self._source: LiveProcessSource | None = None
        self._update_interval = 100
        self._is_compact = False
        self._cli_args = cli_args
        self._settings = {
            'chosungs': set(_CHOSUNGS),   # 기본: 전체 선택
            'mode': 'normal',              # normal / start_from / only / resume
            'target': '',                  # start_from, only 시 고객명
            'no_ocr': False,               # False=OCR 사용, True=OCR 비활성화
        }

        # 레지스트리 저장값으로 오버라이드 (기본값 < 레지스트리 < CLI)
        _saved = load_settings()
        if _saved:
            if 'chosungs' in _saved and _saved['chosungs']:
                self._settings['chosungs'] = _saved['chosungs']
            if 'mode' in _saved:
                self._settings['mode'] = _saved['mode']
            if 'target' in _saved:
                self._settings['target'] = _saved['target']
            if 'no_ocr' in _saved:
                self._settings['no_ocr'] = _saved['no_ocr']

        # 저장 경로 (레지스트리 복원 또는 기본값) - _build_ui 전에 설정
        self._save_dir = (_saved or {}).get('save_dir') or _DEFAULT_SAVE_DIR

        # 모니터 설정 복원 (레지스트리)
        if _saved and 'monitor' in _saved:
            self._target_monitor = _saved['monitor']

        # CLI 인수로 설정 오버라이드 (최우선)
        if cli_args:
            if cli_args.start_from:
                self._settings['mode'] = 'start_from'
                self._settings['target'] = cli_args.start_from
                # 고객명에서 초성 자동 추출 (GUI 설정 다이얼로그와 동일 로직)
                ch = _chosung_of(cli_args.start_from)
                self._settings['chosungs'] = {ch} if ch else set(_CHOSUNGS)
            elif getattr(cli_args, 'only', ''):
                self._settings['mode'] = 'only'
                self._settings['target'] = cli_args.only
                ch = _chosung_of(cli_args.only)
                self._settings['chosungs'] = {ch} if ch else set(_CHOSUNGS)
            if cli_args.chosung:
                self._settings['chosungs'] = {cli_args.chosung}
            if hasattr(cli_args, 'monitor') and cli_args.monitor:
                self._target_monitor = cli_args.monitor

        # 모니터 설정 적용하여 창 위치 계산
        self._normal_x, self._normal_y = self._calc_default_position(self._target_monitor)
        self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")

        self._build_ui()
        # 앱 닫기(X) = 실행 중인 SikuliX 프로세스 강제 종료 후 종료
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        # 설정 요약 라벨 갱신 (레지스트리/CLI 모두 반영)
        self._update_settings_summary()
        self.after(50, self._apply_titlebar_style)
        if cli_args and cli_args.auto_start:
            self.after(500, self._start)  # 자동 실행
        else:
            self.after(200, self._show_usage_guide)

        # 디버그 로그 파일
        import datetime
        _base = os.path.dirname(os.path.abspath(__file__))
        self._debug_log_path = os.path.join(_base, "debug_trace.log")
        with open(self._debug_log_path, "w", encoding="utf-8") as f:
            f.write(f"=== AutoClicker v2 Debug Log ===\n")
            f.write(f"Started: {datetime.datetime.now()}\n\n")

    def _debug_log(self, action: str, detail: str):
        """디버그 로그 기록"""
        import datetime
        ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        line = f"[{ts}] {action}: {detail}\n"
        try:
            with open(self._debug_log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass

    # ===== 해상도 감지 =====

    def _calc_default_position(self, target_monitor: int = 0) -> tuple[int, int]:
        """기본 창 위치 계산.

        Args:
            target_monitor: 0=자동(커서 위치), Windows 디스플레이 번호
        """
        try:
            monitors = _enumerate_monitors()  # {1: (l,t,w,h), 2: ...}

            if target_monitor > 0 and target_monitor in monitors:
                ml, mt, mw, mh = monitors[target_monitor]
                x = ml + min(NORMAL_X, mw - NORMAL_WIDTH)
                y = mt + min(NORMAL_Y, mh - NORMAL_HEIGHT)
                return x, y

            # 자동: 커서가 위치한 모니터에 배치
            cx = self.winfo_pointerx()
            cy = self.winfo_pointery()

            for ml, mt, mw, mh in monitors.values():
                if ml <= cx < ml + mw and mt <= cy < mt + mh:
                    x = ml + min(NORMAL_X, mw - NORMAL_WIDTH)
                    y = mt + min(NORMAL_Y, mh - NORMAL_HEIGHT)
                    return x, y
        except Exception:
            pass
        return NORMAL_X, NORMAL_Y

    def _get_window_monitor_resolution(self) -> tuple[int, int]:
        """이 창이 위치한 모니터의 실제 물리 해상도 반환

        1. MonitorFromWindow  → 창이 놓인 모니터 핸들
        2. GetMonitorInfoW    → 해당 모니터의 디바이스 이름
        3. EnumDisplaySettingsW(device) → DPI 무관 물리 해상도
        """
        try:
            user32 = ctypes.windll.user32

            # 1) 창이 위치한 모니터 핸들 (MONITOR_DEFAULTTONEAREST = 2)
            hwnd = self.winfo_id()
            hmon = user32.MonitorFromWindow(hwnd, 2)
            if not hmon:
                return 0, 0

            # 2) MONITORINFOEXW (104 바이트) → szDevice 추출
            #    cbSize(4) + rcMonitor(16) + rcWork(16) + dwFlags(4) + szDevice(64)
            info = ctypes.create_string_buffer(104)
            ctypes.c_uint.from_buffer(info, 0).value = 104          # cbSize
            if not user32.GetMonitorInfoW(hmon, info):
                return 0, 0
            device = ctypes.wstring_at(ctypes.addressof(info) + 40, 32).rstrip("\x00")

            # 3) 해당 모니터의 물리 해상도 (ENUM_CURRENT_SETTINGS = -1)
            dm = ctypes.create_string_buffer(220)
            ctypes.c_ushort.from_buffer(dm, 68).value = 220         # dmSize
            if user32.EnumDisplaySettingsW(device, -1, dm):
                w = ctypes.c_uint.from_buffer(dm, 172).value        # dmPelsWidth
                h = ctypes.c_uint.from_buffer(dm, 176).value        # dmPelsHeight
                return w, h
        except Exception:
            pass
        return 0, 0

    # ===== 사용법 안내 =====

    def _show_usage_guide(self):
        """최초 실행 시 해상도 확인 + 사용법 안내 (1회)"""
        w, h = self._get_window_monitor_resolution()
        self._show_guide_dialog(w, h)

    def _show_guide_dialog(self, w: int, h: int):
        """커스텀 사용법 다이얼로그"""
        ok = (w == 1920 and h == 1080)

        dlg = ctk.CTkToplevel(self)
        dlg.title("사용법")
        dlg.resizable(False, False)
        dlg.attributes("-topmost", True)
        dlg.grab_set()

        # 부모 창 중앙에 배치
        dlg_w, dlg_h = 320, (220 if ok else 240)
        px = self.winfo_x() + (self.winfo_width() - dlg_w) // 2
        py = self.winfo_y() + (self.winfo_height() - dlg_h) // 2
        dlg.geometry(f"{dlg_w}x{dlg_h}+{px}+{py}")

        # 해상도 확인 행
        res_frame = ctk.CTkFrame(dlg, fg_color="transparent")
        res_frame.pack(fill="x", padx=20, pady=(18, 0))

        ctk.CTkLabel(
            res_frame, text=f"화면 해상도: {w}x{h}",
            font=ctk.CTkFont(family=_FONT, size=13),
        ).pack(side="left")

        ctk.CTkLabel(
            res_frame,
            text="\u2713" if ok else "\u2717",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#4CAF50" if ok else "#F44336",
        ).pack(side="left", padx=(6, 0))

        # 구분선
        ctk.CTkFrame(dlg, height=1, fg_color="gray40").pack(
            fill="x", padx=20, pady=(12, 0),
        )

        if ok:
            # 사용법 단계
            steps = [
                "1.  MetDO 화면을 전체화면(최대화)으로 설정",
                "2.  [설정]에서 초성 및 실행 옵션 변경 (선택)",
                "3.  [실행] 버튼 클릭",
            ]
            for i, step in enumerate(steps):
                ctk.CTkLabel(
                    dlg, text=step, anchor="w",
                    font=ctk.CTkFont(family=_FONT, size=12),
                ).pack(fill="x", padx=20, pady=(10 if i == 0 else 2, 0))

            ctk.CTkButton(
                dlg, text="확인", width=80, height=30,
                font=ctk.CTkFont(family=_FONT, size=12, weight="bold"),
                command=dlg.destroy,
            ).pack(pady=(14, 0))
        else:
            # 해상도 불일치 오류
            ctk.CTkLabel(
                dlg,
                text="AutoClicker v2는 1920x1080 해상도에서만\n"
                     "동작합니다.\n\n"
                     "화면 해상도를 변경 후 다시 실행해주세요.",
                font=ctk.CTkFont(family=_FONT, size=12),
                text_color="#F44336",
                justify="center",
            ).pack(padx=20, pady=(12, 0))

            def _close_app():
                dlg.destroy()
                self.destroy()

            dlg.protocol("WM_DELETE_WINDOW", _close_app)

            ctk.CTkButton(
                dlg, text="종료", width=80, height=30,
                font=ctk.CTkFont(family=_FONT, size=12, weight="bold"),
                fg_color="#F44336", hover_color="#D32F2F",
                command=_close_app,
            ).pack(pady=(14, 0))

    # ===== UI 구성 =====

    def _build_ui(self):
        # 상단 툴바
        self._toolbar = ctk.CTkFrame(self, height=30)
        self._toolbar.pack(fill="x", padx=4, pady=(2, 0))
        self._toolbar.pack_propagate(False)

        # 설정 버튼
        self._settings_btn = ctk.CTkButton(
            self._toolbar, text="설정", width=46, height=22,
            command=self._open_settings,
            font=ctk.CTkFont(family=_FONT, size=11),
            fg_color="gray30", hover_color="gray40"
        )
        self._settings_btn.pack(side="left", padx=(6, 6), pady=3)

        # 실행 버튼 (실행 중에는 일시정지/계속 토글)
        self._run_btn = ctk.CTkButton(
            self._toolbar, text="실행", width=64, height=22,
            command=self._start,
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            fg_color="#2d7d46", hover_color="#3a9957"
        )
        self._run_btn.pack(side="left", padx=(0, 4), pady=3)

        # 컴팩트 모드 토글
        self._compact_btn = ctk.CTkButton(
            self._toolbar, text="\u2199 축소", width=56, height=22,
            command=self._toggle_compact,
            font=ctk.CTkFont(family=_FONT, size=10),
            fg_color="gray30", hover_color="gray40"
        )
        # self._compact_btn.pack(side="left", pady=3)  # 임시 숨김

        # 닫기 버튼 (우측 끝, 타이틀바 없을 때 앱 종료용)
        self._close_btn = ctk.CTkButton(
            self._toolbar, text="\u2715", width=24, height=22,
            command=self._on_close,
            font=ctk.CTkFont(family=_FONT, size=12),
            fg_color="transparent", hover_color="#c0392b",
            text_color="gray60",
        )
        # 초기에는 숨김 (실행 시 표시, 타이틀바 없을 때만 필요)

        # 자동 축소 체크박스
        self._auto_compact_var = ctk.BooleanVar(value=False)
        self._auto_compact_cb = ctk.CTkCheckBox(
            self._toolbar, text="자동축소",
            variable=self._auto_compact_var,
            font=ctk.CTkFont(family=_FONT, size=10),
            width=30, height=20, checkbox_width=16, checkbox_height=16,
        )
        # self._auto_compact_cb.pack(side="left", padx=(6, 0), pady=5)  # 임시 숨김

        # 상태 표시 (우측)
        self._status_label = ctk.CTkLabel(
            self._toolbar, text="대기 중",
            font=ctk.CTkFont(family=_FONT, size=11), text_color="gray60"
        )
        self._status_label.pack(side="right", padx=8, pady=5)

        # 모니터 전환 버튼 (2개 이상일 때만 표시)
        self._mon_btns: dict[int, ctk.CTkButton] = {}
        self._build_monitor_buttons()

        # 저장 경로 표시 + 변경 버튼
        self._savedir_frame = ctk.CTkFrame(self, height=20, fg_color="gray17")
        self._savedir_frame.pack(fill="x", padx=4, pady=(1, 0))
        self._savedir_frame.pack_propagate(False)

        ctk.CTkLabel(
            self._savedir_frame, text="저장:",
            font=ctk.CTkFont(family=_FONT, size=10), text_color="gray60"
        ).pack(side="left", padx=(6, 3))

        self._savedir_label = ctk.CTkLabel(
            self._savedir_frame, text=self._save_dir,
            font=ctk.CTkFont(family=_FONT, size=10), text_color="gray80",
            anchor="w"
        )
        self._savedir_label.pack(side="left", fill="x", expand=True, padx=(0, 4))

        ctk.CTkButton(
            self._savedir_frame, text="변경", width=40, height=18,
            font=ctk.CTkFont(family=_FONT, size=10),
            fg_color="gray30", hover_color="gray40",
            command=self._choose_save_dir,
        ).pack(side="right", padx=(0, 6), pady=3)

        # 설정 요약 표시
        self._settings_summary = ctk.CTkLabel(
            self, text="초성: 전체",
            font=ctk.CTkFont(family=_FONT, size=9), text_color="gray70",
            height=14, anchor="w",
        )
        self._settings_summary.pack(fill="x", padx=10, pady=(0, 0))

        # 일반 모드 컨텐츠
        self._build_normal_content()

        # 컴팩트 모드 패널
        self._compact_panel = CompactPanel(
            self,
            on_toggle=self._toggle_compact,
        )

    def _build_normal_content(self):
        self._normal_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._normal_frame.pack(fill="both", expand=True, padx=4, pady=4)

        # 단일 컬럼: 진행 → PDF → 고객테이블 → 로그
        self._progress_panel = ProgressPanel(self._normal_frame)
        self._progress_panel.pack(fill="x", pady=(0, 2))

        self._pdf_panel = PdfResultPanel(self._normal_frame)
        self._pdf_panel.pack(fill="x", pady=(0, 2))

        self._customer_panel = CustomerTablePanel(self._normal_frame, height=189)
        self._customer_panel.pack(fill="x", pady=(0, 2))
        self._customer_panel.pack_propagate(False)

        self._log_panel = LogViewPanel(self._normal_frame)
        self._log_panel.pack(fill="both", expand=True)

    # ===== 실행 / 중지 =====

    def _start(self):
        """SikuliX 실행 / 실행 중이면 일시정지·계속 토글"""
        self._debug_log("_start", f"source={self._source is not None}, "
                        f"is_running={self._source.is_running() if self._source else 'N/A'}, "
                        f"paused={self._source._paused if self._source else 'N/A'}")
        if self._source and self._source.is_running():
            self._toggle_pause()
            return

        self._state = AppState()
        self._log_panel.clear()
        self._compact_panel.clear()

        # 설정 유효성 검증
        if not self._settings['chosungs']:
            messagebox.showwarning(
                "설정 오류",
                "초성을 1개 이상 선택해주세요.\n[설정] 버튼에서 초성을 선택해주세요.",
            )
            return

        mode = self._settings['mode']
        target = self._settings['target']
        if mode in ('start_from', 'only') and not target:
            messagebox.showwarning(
                "설정 오류",
                "고객명을 입력해주세요.\n[설정] 버튼에서 고객명을 입력해주세요.",
            )
            return

        chosung = self._get_chosung_arg()
        self._source = LiveProcessSource(
            chosung=chosung, save_dir=self._save_dir,
            start_from=target if mode == 'start_from' else '',
            only_customer=target if mode == 'only' else '',
            resume_mode=(mode == 'resume'),
            no_ocr=self._settings['no_ocr'],
        )

        label = chosung or "전체"
        self._compact_panel.set_chosung(chosung)
        self._compact_panel.set_file_loaded(f"실행 중")
        self._run_btn.configure(
            text="일시정지", fg_color="#e67e22", hover_color="#f39c12"
        )
        self._status_label.configure(text=f"[{label}] 실행 중...", text_color="#4CAF50")
        self._close_btn.pack(side="right", padx=(0, 4), pady=3)

        self._debug_log("_start", "source.start() 호출")
        self._source.start(on_event=self._on_event)
        self._debug_log("_start", f"source started, is_running={self._source.is_running()}")
        self._compact_panel.set_play_state("playing")

        # 실행 중: 최상위 + 위치 고정 + 타이틀바 제거 (드래그 완전 차단)
        self.attributes("-topmost", True)
        if not self._is_compact:
            self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")
            self.overrideredirect(True)

        if self._auto_compact_var.get() and not self._is_compact:
            self._enter_compact()

        self._poll_update()

    def _stop(self):
        """SikuliX 중지 (프로세스 종료, UI 초기화)"""
        self._debug_log("_stop", f"paused={self._source._paused if self._source else 'N/A'}")
        if self._source:
            self._source.stop()
        self._run_btn.configure(
            text="실행", fg_color="#2d7d46", hover_color="#3a9957",
            state="normal",
        )
        self._status_label.configure(text="중지됨", text_color="gray60")
        self._close_btn.pack_forget()
        self._compact_panel.set_play_state("stopped")
        # 일반 모드: topmost 해제 + 타이틀바 복원
        if not self._is_compact:
            self.overrideredirect(False)
            self.title(f"AutoClicker v{_VERSION}")
            self.attributes("-topmost", False)
            self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")
            self._apply_titlebar_style()

    def _on_close(self):
        """앱 종료: 창 위치/모니터 저장 → SikuliX 프로세스 정리 → 앱 닫기"""
        try:
            self._settings["window_x"] = self.winfo_x()
            self._settings["window_y"] = self.winfo_y()
            self._settings["monitor"] = self._target_monitor
            save_settings(self._settings, self._save_dir)
        except Exception:
            pass
        if self._source and self._source.is_running():
            self._source.stop()
        self.destroy()

    def _toggle_pause(self):
        """일시정지 / 재개 즉시 토글."""
        self._debug_log("_toggle_pause ENTER",
                        f"source={self._source is not None}, "
                        f"is_running={self._source.is_running() if self._source else 'N/A'}, "
                        f"paused={self._source._paused if self._source else 'N/A'}")
        if not self._source or not self._source.is_running():
            self._debug_log("_toggle_pause EARLY RETURN", "source missing or not running!")
            return

        if self._source._paused:
            # 즉시 재개
            self._debug_log("_toggle_pause", "RESUMING")
            try:
                self._source.resume()
            except Exception as e:
                self._debug_log("_toggle_pause", f"resume() EXCEPTION: {e}")
                self._source._paused = False
            label = self._get_chosung_arg() or "전체"
            self._run_btn.configure(
                text="일시정지", fg_color="#e67e22", hover_color="#f39c12",
                state="normal",
            )
            self._status_label.configure(
                text=f"[{label}] 실행 중...", text_color="#4CAF50"
            )
            self._compact_panel.set_play_state("playing")
        else:
            # 즉시 일시정지
            self._debug_log("_toggle_pause", "PAUSING → button='계속'")
            self._source.pause()
            self._show_paused_ui()

    def _show_paused_ui(self):
        """일시정지 UI 표시"""
        self._debug_log("_show_paused_ui", "button → '계속'")
        self._run_btn.configure(
            text="계속", fg_color="#2980b9", hover_color="#3498db",
            state="normal",
        )
        self._status_label.configure(text="일시정지", text_color="#e67e22")
        self._compact_panel.set_play_state("paused")


    # ===== 이벤트 처리 =====

    def _on_event(self, event):
        self._state.process_event(event)

    def _poll_update(self):
        # 실행 중 위치 강제 고정 (드래그 방지)
        if not self._is_compact:
            self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")

        # 항상 모든 패널 업데이트 (컴팩트/일반 모두)
        # → 모드 전환 시 항상 최신 상태 보장
        self._compact_panel.update_state(self._state)
        self._progress_panel.update_state(self._state)
        self._customer_panel.update_state(self._state)
        self._log_panel.update_state(self._state)
        self._pdf_panel.update_state(self._state)

        source_done = self._state.is_complete or (
            self._source and not self._source.is_running()
        )

        if source_done:
            self._debug_log("_poll_update SOURCE_DONE",
                            f"is_complete={self._state.is_complete}, "
                            f"is_running={self._source.is_running() if self._source else 'N/A'}, "
                            f"paused={self._source._paused if self._source else 'N/A'}, "
                            f"btn_text={self._run_btn.cget('text')}")

            # 크래시 감지: FATAL 로그 파싱 또는 비정상 exit code
            crashed = self._state.is_crashed
            if not crashed and self._source and hasattr(self._source, 'exit_code'):
                ec = self._source.exit_code
                if ec is not None and ec != 0:
                    crashed = True

            if crashed:
                # 크래시 사유 조합
                reason_parts = []
                if self._state.crash_customer:
                    reason_parts.append(f"고객: {self._state.crash_customer}")
                if self._state.crash_position:
                    reason_parts.append(f"위치: {self._state.crash_position}")
                if self._state.crash_reason:
                    reason_parts.append(f"원인: {self._state.crash_reason}")
                reason_text = " | ".join(reason_parts) if reason_parts else "알 수 없는 오류"

                self._status_label.configure(
                    text=f"FATAL: {reason_text}",
                    text_color="#e74c3c",
                )
                self._compact_panel.set_play_state("crashed")
            else:
                self._status_label.configure(text="완료", text_color="#4CAF50")
                self._compact_panel.set_play_state("complete")
            self._run_btn.configure(
                text="실행", fg_color="#2d7d46", hover_color="#3a9957",
                state="normal",
            )
            self._close_btn.pack_forget()
            # 완료 → 일반 모드: topmost 해제 + 타이틀바 복원
            if not self._is_compact:
                self.overrideredirect(False)
                self.title(f"AutoClicker v{_VERSION}")
                self.attributes("-topmost", False)
                self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")
                self._apply_titlebar_style()
        else:
            # 카운트다운 진행 중이거나 소스 실행 중 → 폴링 계속
            self.after(self._update_interval, self._poll_update)

    # ===== 컴팩트 / 일반 모드 =====

    def _toggle_compact(self):
        if self._is_compact:
            self._exit_compact()
        else:
            self._enter_compact()

    def _enter_compact(self):
        self._is_compact = True
        self._compact_btn.configure(text="\u2197 확대", fg_color="#1f538d")

        self._toolbar.pack_forget()
        self._savedir_frame.pack_forget()
        self._settings_summary.pack_forget()
        self._normal_frame.pack_forget()
        self._compact_panel.pack(fill="both", expand=True)

        self._sync_compact_state()

        work_right, taskbar_y = self._get_work_area()
        compact_x = work_right - COMPACT_WIDTH
        compact_y = taskbar_y - COMPACT_HEIGHT

        self.withdraw()
        self.geometry(f"{COMPACT_WIDTH}x{COMPACT_HEIGHT}+{compact_x}+{compact_y}")
        self.update_idletasks()
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.deiconify()

    def _exit_compact(self):
        self._is_compact = False
        self._compact_btn.configure(text="\u2199 축소", fg_color="gray30")

        self._compact_panel.pack_forget()
        self.overrideredirect(False)
        self.title(f"AutoClicker v{_VERSION}")
        self._apply_titlebar_style()

        # 실행 중이면 topmost 유지, 아니면 해제
        is_running = self._source and self._source.is_running()
        if not is_running:
            self.attributes("-topmost", False)

        self._toolbar.pack(fill="x", padx=4, pady=(4, 0))
        self._savedir_frame.pack(fill="x", padx=4, pady=(2, 0))
        self._settings_summary.pack(fill="x", padx=10, pady=(1, 0))
        self._normal_frame.pack(fill="both", expand=True, padx=4, pady=4)

        self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")

        # 모드 전환 후 일반 패널 즉시 갱신 (폴링 중단 시에도 최신 상태 보장)
        self._progress_panel.update_state(self._state)
        self._customer_panel.update_state(self._state)
        self._log_panel.update_state(self._state)
        self._pdf_panel.update_state(self._state)

    def _sync_compact_state(self):
        if self._source:
            if self._source.is_running():
                self._compact_panel.set_play_state(
                    "paused" if self._source._paused else "playing"
                )
            elif self._state.is_crashed:
                self._compact_panel.set_play_state("crashed")
            elif self._state.is_complete:
                self._compact_panel.set_play_state("complete")
            self._compact_panel.update_state(self._state)

    # ===== 설정 모달 =====

    def _open_settings(self):
        """설정 모달 열기"""
        dlg = ctk.CTkToplevel(self)
        dlg.title("설정")
        dlg.resizable(False, False)
        dlg.attributes("-topmost", True)
        dlg.grab_set()

        dlg_w = 620
        _CLR_ON = "#2563eb"
        _CLR_OFF = "#404040"
        _CLR_HOVER_ON = "#3b82f6"
        _CLR_HOVER_OFF = "#555555"

        def _style(on):
            return {"fg_color": _CLR_ON if on else _CLR_OFF,
                    "hover_color": _CLR_HOVER_ON if on else _CLR_HOVER_OFF}

        # ────────────────── 실행 모드 (항상 표시) ──────────────────
        ctk.CTkLabel(
            dlg, text="실행 모드", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=14, weight="bold"),
        ).pack(fill="x", padx=24, pady=(18, 8))

        _cur_mode = [self._settings['mode']]
        target_var = ctk.StringVar(value=self._settings['target'])
        _sel = set(self._settings['chosungs'])

        mode_btns = {}
        mode_descs = {
            'normal':     "선택된 초성의 고객을 순서대로 처리",
            'start_from': "지정 고객부터 이후 순서대로 처리",
            'only':       "해당 고객만 처리 (동명이인 포함)",
            'resume':     "마지막 중단 지점부터 자동 재개",
        }

        mode_desc_label = ctk.CTkLabel(
            dlg, text="", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=11), text_color="#aaaaaa",
        )

        mode_row = ctk.CTkFrame(dlg, fg_color="transparent")
        mode_row.pack(fill="x", padx=24, pady=(0, 4))

        mode_labels = [
            ('normal', '초성'),
            ('start_from', '고객부터'),
            ('only', '고객만'),
            ('resume', '이어서'),
        ]
        for key, label in mode_labels:
            btn = ctk.CTkButton(
                mode_row, text=label, width=110, height=32, corner_radius=6,
                font=ctk.CTkFont(family=_FONT, size=12),
                **_style(key == _cur_mode[0]),
                command=lambda k=key: _set_mode(k),
            )
            btn.pack(side="left", padx=3)
            mode_btns[key] = btn

        mode_desc_label.configure(text=mode_descs[_cur_mode[0]])
        mode_desc_label.pack(fill="x", padx=28, pady=(2, 0))

        sep_top = ctk.CTkFrame(dlg, height=1, fg_color="gray50")

        # ────────────────── 초성 선택 (동적) ──────────────────
        ch_section = ctk.CTkFrame(dlg, fg_color="transparent")

        ctk.CTkLabel(
            ch_section, text="초성 선택", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=14, weight="bold"),
        ).pack(fill="x", padx=24, pady=(0, 8))

        ch_btns = {}

        def _sync_all():
            ch_btns['ALL'].configure(**_style(len(_sel) == len(_CHOSUNGS)))

        def _toggle(ch):
            on = ch not in _sel
            _sel.add(ch) if on else _sel.discard(ch)
            ch_btns[ch].configure(**_style(on))
            _sync_all()

        def _toggle_all():
            if len(_sel) == len(_CHOSUNGS):
                _sel.clear()
                for k in ch_btns: ch_btns[k].configure(**_style(False))
            else:
                _sel.update(_CHOSUNGS)
                for k in ch_btns: ch_btns[k].configure(**_style(True))

        ch_row = ctk.CTkFrame(ch_section, fg_color="transparent")
        ch_row.pack(fill="x", padx=24, pady=(0, 0))

        all_btn = ctk.CTkButton(
            ch_row, text="ALL", width=42, height=32, corner_radius=6,
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            **_style(len(_sel) == len(_CHOSUNGS)), command=_toggle_all,
        )
        all_btn.pack(side="left", padx=(0, 6))
        ch_btns['ALL'] = all_btn

        for ch in _CHOSUNGS:
            w = 38 if ch == "기타" else 30
            btn = ctk.CTkButton(
                ch_row, text=ch, width=w, height=32, corner_radius=6,
                font=ctk.CTkFont(family=_FONT, size=13),
                **_style(ch in _sel),
                command=lambda c=ch: _toggle(c),
            )
            btn.pack(side="left", padx=1)
            ch_btns[ch] = btn

        # ────────────────── 고객명 입력 (동적) ──────────────────
        target_section = ctk.CTkFrame(dlg, fg_color="transparent")

        ctk.CTkLabel(
            target_section, text="고객명", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=14, weight="bold"),
        ).pack(fill="x", padx=24, pady=(0, 8))

        target_inner = ctk.CTkFrame(target_section, fg_color="transparent")
        target_inner.pack(fill="x", padx=24)

        target_entry = ctk.CTkEntry(
            target_inner, textvariable=target_var,
            width=340, height=34,
            font=ctk.CTkFont(family=_FONT, size=13),
            placeholder_text="고객명 입력",
        )
        target_entry.pack(side="left")

        # ────────────────── OCR 토글 (항상 표시) ──────────────────
        ocr_section = ctk.CTkFrame(dlg, fg_color="transparent")
        _ocr_on = [not self._settings['no_ocr']]  # True=OCR 사용

        ocr_inner = ctk.CTkFrame(ocr_section, fg_color="transparent")
        ocr_inner.pack(fill="x", padx=24)

        ctk.CTkLabel(
            ocr_inner, text="OCR", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=13, weight="bold"),
        ).pack(side="left")

        ctk.CTkLabel(
            ocr_inner, text="화면 캡처 후 고객명 인식", anchor="w",
            font=ctk.CTkFont(family=_FONT, size=11), text_color="#aaaaaa",
        ).pack(side="left", padx=(8, 0))

        ocr_btn = ctk.CTkButton(
            ocr_inner, text="ON" if _ocr_on[0] else "OFF",
            width=50, height=28, corner_radius=6,
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            **_style(_ocr_on[0]),
        )

        def _toggle_ocr():
            _ocr_on[0] = not _ocr_on[0]
            ocr_btn.configure(text="ON" if _ocr_on[0] else "OFF", **_style(_ocr_on[0]))

        ocr_btn.configure(command=_toggle_ocr)
        ocr_btn.pack(side="right")

        # ────────────────── 하단 (항상 표시) ──────────────────
        sep_bottom = ctk.CTkFrame(dlg, height=1, fg_color="gray50")
        btn_frame = ctk.CTkFrame(dlg, fg_color="transparent")

        def _confirm():
            self._settings['mode'] = _cur_mode[0]
            self._settings['target'] = target_var.get().strip()
            self._settings['no_ocr'] = not _ocr_on[0]
            m = _cur_mode[0]
            if m in ('start_from', 'only'):
                # 고객명에서 초성 자동 추출
                ch = _chosung_of(self._settings['target'])
                self._settings['chosungs'] = {ch} if ch else set(_CHOSUNGS)
            elif m == 'resume':
                # 이어서: 초성 불필요 (스크립트가 저장 상태에서 판단)
                self._settings['chosungs'] = set(_CHOSUNGS)
            else:
                self._settings['chosungs'] = set(_sel)
            self._update_settings_summary()
            save_settings(self._settings, self._save_dir)
            dlg.destroy()

        ctk.CTkButton(
            btn_frame, text="확인", width=100, height=36,
            font=ctk.CTkFont(family=_FONT, size=14, weight="bold"),
            command=_confirm,
        ).pack(side="right", padx=(10, 0))

        ctk.CTkButton(
            btn_frame, text="취소", width=100, height=36,
            font=ctk.CTkFont(family=_FONT, size=14),
            fg_color="gray30", hover_color="gray40",
            command=dlg.destroy,
        ).pack(side="right")

        # ────────────────── 동적 레이아웃 ──────────────────
        _heights = {'normal': 340, 'start_from': 340, 'only': 340, 'resume': 270}
        _dynamic = [sep_top, ch_section, target_section, ocr_section, sep_bottom, btn_frame]

        _first_show = [True]

        def _refresh():
            m = _cur_mode[0]
            for w in _dynamic:
                w.pack_forget()

            sep_top.pack(fill="x", padx=24, pady=(10, 14))

            if m == 'normal':
                ch_section.pack(fill="x", pady=(0, 10))
            if m in ('start_from', 'only'):
                target_section.pack(fill="x", pady=(0, 6))

            ocr_section.pack(fill="x", pady=(6, 0))
            sep_bottom.pack(fill="x", padx=24, pady=(10, 14))
            btn_frame.pack(fill="x", padx=24, pady=(0, 18))

            h = _heights.get(m, 300)
            if _first_show[0]:
                # 최초: 부모 중앙 배치
                px = self.winfo_x() + (self.winfo_width() - dlg_w) // 2
                py = self.winfo_y() + (self.winfo_height() - h) // 2
                dlg.geometry(f"{dlg_w}x{h}+{px}+{py}")
                _first_show[0] = False
            else:
                # 모드 전환: 현재 위치 유지, 높이만 변경
                dlg.geometry(f"{dlg_w}x{h}")

        def _set_mode(m):
            _cur_mode[0] = m
            for k, b in mode_btns.items():
                b.configure(**_style(k == m))
            mode_desc_label.configure(text=mode_descs[m])
            if m in ('start_from', 'only'):
                target_entry.focus_set()
            _refresh()

        _refresh()

    def _get_chosung_arg(self) -> str:
        """선택된 초성을 CLI 인자 문자열로 변환"""
        if len(self._settings['chosungs']) == len(_CHOSUNGS):
            return ""
        if not self._settings['chosungs']:
            return ""
        return ",".join(c for c in _CHOSUNGS if c in self._settings['chosungs'])

    def _update_settings_summary(self):
        """메인 GUI 설정 요약 라벨 갱신"""
        parts = []
        chosungs = self._settings['chosungs']
        if len(chosungs) == len(_CHOSUNGS):
            parts.append("초성: 전체")
        elif len(chosungs) == 0:
            parts.append("초성: 없음")
        else:
            selected = [c for c in _CHOSUNGS if c in chosungs]
            parts.append("초성: " + ",".join(selected))

        mode = self._settings['mode']
        target = self._settings['target']
        if mode == 'start_from' and target:
            parts.append(f"시작: {target}")
        elif mode == 'only' and target:
            parts.append(f"고객: {target}")
        elif mode == 'resume':
            parts.append("이어서")

        if self._settings['no_ocr']:
            parts.append("OCR: OFF")

        self._settings_summary.configure(text=" | ".join(parts))

    # ===== 모니터 전환 =====

    def _build_monitor_buttons(self):
        """모니터 2개 이상이면 툴바에 전환 버튼 표시.
        번호는 Windows 설정 > 디스플레이 번호와 일치."""
        monitors = _enumerate_monitors()  # {1: (l,t,w,h), 2: ...}
        if len(monitors) < 2:
            return

        # 자동(0)이면 현재 커서 위치한 모니터를 기본 선택
        if self._target_monitor == 0:
            cx, cy = self.winfo_pointerx(), self.winfo_pointery()
            for num, (ml, mt, mw, mh) in monitors.items():
                if ml <= cx < ml + mw and mt <= cy < mt + mh:
                    self._target_monitor = num
                    break
            else:
                self._target_monitor = min(monitors.keys())

        # 물리적 배치 순서 (left 좌표 내림차순) → side="right"로 pack하면 왼쪽→오른쪽 일치
        for num, (ml, *_rest) in sorted(monitors.items(), key=lambda x: x[1][0], reverse=True):
            current = (self._target_monitor == num)
            btn = ctk.CTkButton(
                self._toolbar, text=f"M{num}", width=30, height=22,
                corner_radius=4,
                font=ctk.CTkFont(family=_FONT, size=9, weight="bold"),
                fg_color="gray30" if current else "#2563eb",
                hover_color="gray40" if current else "#3b82f6",
                border_width=2 if current else 0,
                border_color="#7eb8ff",
                command=lambda n=num: self._switch_monitor(n),
            )
            btn.pack(side="right", padx=1, pady=4)
            self._mon_btns[num] = btn

    def _switch_monitor(self, monitor_num: int):
        """모니터 버튼 클릭 → 즉시 해당 모니터로 이동."""
        if self._target_monitor == monitor_num:
            return
        self._target_monitor = monitor_num

        for idx, btn in self._mon_btns.items():
            current = (idx == self._target_monitor)
            btn.configure(
                fg_color="gray30" if current else "#2563eb",
                hover_color="gray40" if current else "#3b82f6",
                border_width=2 if current else 0,
            )

        # 즉시 창 위치 재계산 + 이동
        self._normal_x, self._normal_y = self._calc_default_position(self._target_monitor)
        self.geometry(f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{self._normal_x}+{self._normal_y}")

        # 레지스트리 저장
        self._settings['monitor'] = self._target_monitor
        save_settings(self._settings, self._save_dir)

    # ===== 저장 경로 =====

    def _choose_save_dir(self):
        path = filedialog.askdirectory(
            title="저장 경로 선택",
            initialdir=self._save_dir,
        )
        if path:
            self._save_dir = path
            self._savedir_label.configure(text=path)
            save_settings(self._settings, self._save_dir)

    # ===== 유틸 =====

    def _apply_titlebar_style(self):
        """타이틀바 스타일: 다크 모드 + 최소화 버튼 제거"""
        try:
            self.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            # 다크 타이틀바
            DWMWA_USE_IMMERSIVE_DARK_MODE = 20
            val = ctypes.c_int(1)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE,
                ctypes.byref(val), ctypes.sizeof(val),
            )
            # 최소화 버튼 제거
            GWL_STYLE = -16
            WS_MINIMIZEBOX = 0x00020000
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
            ctypes.windll.user32.SetWindowLongW(
                hwnd, GWL_STYLE, style & ~WS_MINIMIZEBOX
            )
        except Exception:
            pass

    @staticmethod
    def _get_work_area() -> tuple[int, int]:
        try:
            import ctypes
            import ctypes.wintypes
            rect = ctypes.wintypes.RECT()
            ctypes.windll.user32.SystemParametersInfoW(
                0x0030, 0, ctypes.byref(rect), 0
            )
            return rect.right, rect.bottom
        except Exception:
            return 1920, 1032


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AutoClicker v2")
    parser.add_argument("--chosung", type=str, default="", help="초성 (예: ㄱ)")
    parser.add_argument("--start-from", type=str, default="", dest="start_from", help="시작 고객명")
    parser.add_argument("--only", type=str, default="", help="특정 고객만")
    parser.add_argument("--auto-start", action="store_true", dest="auto_start", help="자동 실행")
    parser.add_argument("--monitor", type=int, default=0, help="모니터 번호 (0=자동, 1=모니터1, 2=모니터2)")
    cli_args = parser.parse_args()

    app = AutoClickerApp(cli_args=cli_args)
    app.mainloop()
