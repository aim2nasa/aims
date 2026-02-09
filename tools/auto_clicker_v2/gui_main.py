# -*- coding: utf-8 -*-
"""AutoClicker v2 - GUI 애플리케이션
일반 모드: 초성 선택 → 실행 → 4패널 모니터링
컴팩트 모드: 실행 중 자동 전환, 극소형 상태바
"""
import os
import tkinter.font as tkfont
import customtkinter as ctk
from tkinter import filedialog

from app_state import AppState
from data_source import LiveProcessSource

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_SAVE_DIR = os.path.join(_BASE_DIR, "output")

# 통일 폰트
_FONT = "맑은 고딕"

from panels.progress_panel import ProgressPanel
from panels.customer_table import CustomerTablePanel
from panels.log_view import LogViewPanel
from panels.pdf_result import PdfResultPanel
from panels.compact_panel import CompactPanel

COMPACT_HEIGHT = 47
COMPACT_WIDTH = 850

# 일반 모드 고정 크기/위치 (1920x1080 기준)
NORMAL_WIDTH = 480
NORMAL_HEIGHT = 440
NORMAL_X = 1376
NORMAL_Y = 454
_NORMAL_GEOMETRY = f"{NORMAL_WIDTH}x{NORMAL_HEIGHT}+{NORMAL_X}+{NORMAL_Y}"


class AutoClickerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("AutoClicker v2")
        self.geometry(_NORMAL_GEOMETRY)
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

        self._build_ui()

    # ===== UI 구성 =====

    def _build_ui(self):
        # 상단 툴바
        self._toolbar = ctk.CTkFrame(self, height=40)
        self._toolbar.pack(fill="x", padx=4, pady=(4, 0))
        self._toolbar.pack_propagate(False)

        # 초성 선택
        self._chosung_var = ctk.StringVar(value="전체")
        self._chosung_menu = ctk.CTkOptionMenu(
            self._toolbar,
            values=["전체", "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ",
                    "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "기타"],
            variable=self._chosung_var, width=70,
            font=ctk.CTkFont(family=_FONT, size=12),
            dropdown_font=ctk.CTkFont(family=_FONT, size=12)
        )
        self._chosung_menu.pack(side="left", padx=(6, 8), pady=5)

        # 실행 버튼
        self._run_btn = ctk.CTkButton(
            self._toolbar, text="실행", width=70, height=28,
            command=self._start,
            font=ctk.CTkFont(family=_FONT, size=12, weight="bold"),
            fg_color="#2d7d46", hover_color="#3a9957"
        )
        self._run_btn.pack(side="left", padx=(0, 6), pady=5)

        # 컴팩트 모드 토글
        self._compact_btn = ctk.CTkButton(
            self._toolbar, text="\u2199 축소", width=60, height=28,
            command=self._toggle_compact,
            font=ctk.CTkFont(family=_FONT, size=11),
            fg_color="gray30", hover_color="gray40"
        )
        self._compact_btn.pack(side="left", pady=5)

        # 상태 표시 (우측)
        self._status_label = ctk.CTkLabel(
            self._toolbar, text="대기 중",
            font=ctk.CTkFont(family=_FONT, size=11), text_color="gray60"
        )
        self._status_label.pack(side="right", padx=8, pady=5)

        # 저장 경로 표시 + 변경 버튼
        self._save_dir = _DEFAULT_SAVE_DIR

        self._savedir_frame = ctk.CTkFrame(self, height=24, fg_color="gray17")
        self._savedir_frame.pack(fill="x", padx=4, pady=(2, 0))
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

        self._customer_panel = CustomerTablePanel(self._normal_frame, height=140)
        self._customer_panel.pack(fill="x", pady=(0, 2))
        self._customer_panel.pack_propagate(False)

        self._log_panel = LogViewPanel(self._normal_frame)
        self._log_panel.pack(fill="both", expand=True)

    # ===== 실행 / 중지 =====

    def _start(self):
        """SikuliX 실행 → 자동 컴팩트 모드"""
        if self._source and self._source.is_running():
            self._stop()
            return

        self._state = AppState()
        self._log_panel.clear()
        self._compact_panel.clear()

        chosung = self._chosung_var.get()
        if chosung == "전체":
            chosung = ""

        self._source = LiveProcessSource(chosung=chosung, save_dir=self._save_dir)

        label = chosung or "전체"
        self._compact_panel.set_chosung(chosung)
        self._compact_panel.set_file_loaded(f"실행 중")
        self._run_btn.configure(
            text="중지", fg_color="#c0392b", hover_color="#e74c3c"
        )
        self._status_label.configure(text=f"[{label}] 실행 중...", text_color="#4CAF50")

        self._source.start(on_event=self._on_event)
        self._compact_panel.set_play_state("playing")

        if not self._is_compact:
            self._enter_compact()

        self._poll_update()

    def _stop(self):
        """SikuliX 중지"""
        if self._source and self._source.is_running():
            self._source.stop()
        self._run_btn.configure(
            text="실행", fg_color="#2d7d46", hover_color="#3a9957"
        )
        self._status_label.configure(text="중지됨", text_color="gray60")
        self._compact_panel.set_play_state("stopped")

    def _toggle_pause(self):
        """일시정지 / 재개"""
        if not self._source or not self._source.is_running():
            return
        if self._source._paused:
            self._source.resume()
            self._compact_panel.set_play_state("playing")
        else:
            self._source.pause()
            self._compact_panel.set_play_state("paused")

    # ===== 이벤트 처리 =====

    def _on_event(self, event):
        self._state.process_event(event)

    def _poll_update(self):
        # 항상 모든 패널 업데이트 (컴팩트/일반 모두)
        # → 모드 전환 시 항상 최신 상태 보장
        self._compact_panel.update_state(self._state)
        self._progress_panel.update_state(self._state)
        self._customer_panel.update_state(self._state)
        self._log_panel.update_state(self._state)
        self._pdf_panel.update_state(self._state)

        if self._state.is_complete or (self._source and not self._source.is_running()):
            self._status_label.configure(text="완료", text_color="#4CAF50")
            self._compact_panel.set_play_state("complete")
            self._run_btn.configure(
                text="실행", fg_color="#2d7d46", hover_color="#3a9957"
            )
        elif self._source and self._source.is_running():
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
        self.attributes("-topmost", False)
        self.title("AutoClicker v2")

        self._toolbar.pack(fill="x", padx=4, pady=(4, 0))
        self._savedir_frame.pack(fill="x", padx=4, pady=(2, 0))
        self._normal_frame.pack(fill="both", expand=True, padx=4, pady=4)

        self.geometry(_NORMAL_GEOMETRY)

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
            elif self._state.is_complete:
                self._compact_panel.set_play_state("complete")
            self._compact_panel.update_state(self._state)

    # ===== 저장 경로 =====

    def _choose_save_dir(self):
        path = filedialog.askdirectory(
            title="저장 경로 선택",
            initialdir=self._save_dir,
        )
        if path:
            self._save_dir = path
            self._savedir_label.configure(text=path)

    # ===== 유틸 =====

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
    app = AutoClickerApp()
    app.mainloop()
