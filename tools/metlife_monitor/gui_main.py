# -*- coding: utf-8 -*-
"""메인 GUI 윈도우: 일반 모드(4패널) + 컴팩트 모드(극소형 단일 행)"""
import customtkinter as ctk
from tkinter import filedialog

from app_state import AppState
from data_source import FileReplaySource
from panels.progress_panel import ProgressPanel
from panels.customer_table import CustomerTablePanel
from panels.log_view import LogViewPanel
from panels.pdf_result import PdfResultPanel
from panels.compact_panel import CompactPanel

# ===== SikuliX 안전 영역 분석 (1920x1080) =====
#
# TABLE_REGION: X=20~1910, Y=362~952 (OCR 캡처 + 스크롤 비교)
# "다음" 버튼 클릭: Y≈955~985 (exists()로 전체 화면 스캔)
# 안전 배치: Y > 990 (테이블 + 페이지네이션 아래, 작업 표시줄 위)
#
# 이미지 패턴 매칭(exists) 간섭 없음:
#   - "다음" 버튼: 녹색 배경 + 흰색 텍스트 (우리 GUI: 어두운 배경)
#   - 기타 버튼들: MetLife 고유 UI → 완전 다른 비주얼
# ================================================

COMPACT_HEIGHT = 47    # "다음" 버튼 하단(~Y=985) ~ 작업표시줄(Y=1032)
COMPACT_WIDTH = 850    # Nexacro 탭 우측 ~ 화면 끝


class MetlifeMonitorApp(ctk.CTk):
    def __init__(self, save_dir: str = ""):
        super().__init__()

        self.title("AutoClicker")
        self.geometry("1100x700")
        self.minsize(900, 550)

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self._state = AppState()
        self._source: FileReplaySource | None = None
        self._update_interval = 100  # ms
        self._is_compact = False
        self._save_dir = save_dir

        # 일반 모드 저장 상태
        self._normal_geometry = "1100x700"

        self._build_ui()

    def _build_ui(self):
        # 상단 툴바
        self._toolbar = ctk.CTkFrame(self, height=45)
        self._toolbar.pack(fill="x", padx=5, pady=(5, 0))
        self._toolbar.pack_propagate(False)

        self._open_btn = ctk.CTkButton(
            self._toolbar, text="로그 열기", width=100, command=self._open_file
        )
        self._open_btn.pack(side="left", padx=5, pady=5)

        self._play_btn = ctk.CTkButton(
            self._toolbar, text="\u25B6 시작", width=80,
            command=self._toggle_play,
            state="disabled"
        )
        self._play_btn.pack(side="left", padx=5, pady=5)

        # 속도 조절
        ctk.CTkLabel(self._toolbar, text="속도:").pack(
            side="left", padx=(15, 5), pady=5
        )
        self._speed_var = ctk.StringVar(value="5x")
        self._speed_menu = ctk.CTkOptionMenu(
            self._toolbar, values=["1x", "2x", "5x", "10x", "즉시"],
            variable=self._speed_var, width=80, command=self._on_speed_change
        )
        self._speed_menu.pack(side="left", padx=5, pady=5)

        # 컴팩트 모드 토글
        self._compact_btn = ctk.CTkButton(
            self._toolbar, text="컴팩트", width=80,
            command=self._toggle_compact,
            fg_color="gray30", hover_color="gray40"
        )
        self._compact_btn.pack(side="left", padx=(15, 5), pady=5)

        # PDF 저장 경로 (우측)
        save_text = self._truncate_path(self._save_dir) if self._save_dir else "저장 경로"
        self._save_dir_btn = ctk.CTkButton(
            self._toolbar, text=save_text, width=120,
            command=self._choose_save_dir,
            fg_color="gray30", hover_color="gray40",
            font=ctk.CTkFont(size=11)
        )
        self._save_dir_btn.pack(side="right", padx=5, pady=5)
        ctk.CTkLabel(
            self._toolbar, text="PDF:", text_color="gray60",
            font=ctk.CTkFont(size=11)
        ).pack(side="right", pady=5)

        # 상태 표시
        self._status_label = ctk.CTkLabel(
            self._toolbar, text="", text_color="gray60",
            font=ctk.CTkFont(size=11)
        )
        self._status_label.pack(side="right", padx=10, pady=5)

        # 파일명 표시
        self._file_label = ctk.CTkLabel(
            self._toolbar, text="", text_color="gray60",
            font=ctk.CTkFont(size=11)
        )
        self._file_label.pack(side="left", padx=10, pady=5)

        # 일반 모드 컨텐츠
        self._build_normal_content()

        # 컴팩트 모드 패널 (숨겨진 상태, 콜백 연결)
        self._compact_panel = CompactPanel(
            self,
            on_toggle=self._toggle_compact,
            on_open=self._open_file,
            on_play=self._toggle_play,
        )

    def _build_normal_content(self):
        self._normal_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._normal_frame.pack(fill="both", expand=True, padx=5, pady=5)

        # 좌측 패널 (진행 + PDF)
        left = ctk.CTkFrame(self._normal_frame, width=260)
        left.pack(side="left", fill="y", padx=(0, 5))
        left.pack_propagate(False)

        self._progress_panel = ProgressPanel(left)
        self._progress_panel.pack(fill="x", padx=5, pady=(0, 5))

        self._pdf_panel = PdfResultPanel(left)
        self._pdf_panel.pack(fill="both", expand=True, padx=5, pady=(0, 0))

        # 우측 패널 (테이블 + 로그)
        right = ctk.CTkFrame(self._normal_frame, fg_color="transparent")
        right.pack(side="left", fill="both", expand=True)

        self._customer_panel = CustomerTablePanel(right)
        self._customer_panel.pack(fill="both", expand=True,
                                  padx=(0, 0), pady=(0, 5))

        self._log_panel = LogViewPanel(right)
        self._log_panel.pack(fill="both", expand=True)

    # ===== 컴팩트/일반 모드 전환 =====

    def _toggle_compact(self):
        if self._is_compact:
            self._exit_compact()
        else:
            self._enter_compact()

    def _enter_compact(self):
        """컴팩트 모드: 프레임 없는 극소형 창, 빨간 영역에 정확히 맞춤

        overrideredirect(True): 타이틀바/프레임 완전 제거 → 지정 영역 = 창 영역
        """
        self._is_compact = True
        self._compact_btn.configure(text="일반", fg_color="#1f538d")

        # 현재 일반 모드 위치/크기 저장
        self._normal_geometry = self.geometry()

        # 일반 모드 UI 숨기기
        self._toolbar.pack_forget()
        self._normal_frame.pack_forget()

        # 컴팩트 패널만 표시
        self._compact_panel.pack(fill="both", expand=True)

        # 현재 재생 상태를 컴팩트 패널에 동기화
        self._sync_compact_state()

        # 우측 하단 좌표 계산
        work_right, taskbar_y = self._get_work_area()
        compact_x = work_right - COMPACT_WIDTH  # 우측: 주 모니터 끝
        compact_y = taskbar_y - COMPACT_HEIGHT  # 하단: 작업표시줄에 맞닿음

        # geometry를 먼저 설정 → update → overrideredirect
        # (overrideredirect 이후 geometry()가 무시되는 Tkinter 버그 방지)
        self.withdraw()
        self.minsize(1, 1)  # minsize 제한 해제
        self.resizable(False, False)
        self.geometry(f"{COMPACT_WIDTH}x{COMPACT_HEIGHT}+{compact_x}+{compact_y}")
        self.update_idletasks()
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.deiconify()

    def _exit_compact(self):
        """일반 모드: 4패널 레이아웃 복원"""
        self._is_compact = False
        self._compact_btn.configure(text="컴팩트", fg_color="gray30")

        # 컴팩트 패널 숨기기
        self._compact_panel.pack_forget()

        # 프레임 복원
        self.overrideredirect(False)
        self.attributes("-topmost", False)
        self.title("AutoClicker")

        # 일반 모드 UI 복원
        self._toolbar.pack(fill="x", padx=5, pady=(5, 0))
        self._normal_frame.pack(fill="both", expand=True, padx=5, pady=5)

        # 윈도우 크기/위치 복원
        self.minsize(900, 550)
        self.resizable(True, True)
        self.geometry(self._normal_geometry)

    def _sync_compact_state(self):
        """일반→컴팩트 전환 시 재생 상태 동기화"""
        filename = self._file_label.cget("text")
        if filename and self._source:
            self._compact_panel.set_file_loaded(filename)
            if self._source.is_running():
                if self._source._paused:
                    self._compact_panel.set_play_state("paused")
                else:
                    self._compact_panel.set_play_state("playing")
            elif self._state.is_complete:
                self._compact_panel.set_play_state("complete")
            else:
                self._compact_panel.set_play_state("stopped")
            # 현재 상태 즉시 반영
            self._compact_panel.update_state(self._state)

    # ===== 파일 열기 / 재생 제어 =====

    def _open_file(self):
        filepath = filedialog.askopenfilename(
            title="로그 파일 선택",
            filetypes=[("로그 파일", "*.log *.txt"), ("모든 파일", "*.*")],
            initialdir="sample_logs",
        )
        if not filepath:
            return

        # 기존 소스 정리
        if self._source and self._source.is_running():
            self._source.stop()

        self._state = AppState()
        self._log_panel.clear()
        self._compact_panel.clear()

        self._source = FileReplaySource(filepath, speed=self._get_speed())
        filename = filepath.split("/")[-1].split("\\")[-1]
        self._file_label.configure(text=filename)
        self._play_btn.configure(state="normal", text="\u25B6 시작")
        self._status_label.configure(text="준비됨")

        # 컴팩트 패널 동기화
        self._compact_panel.set_file_loaded(filename)
        self._compact_panel.set_play_state("stopped")

    def _toggle_play(self):
        if not self._source:
            return

        if self._source.is_running():
            # 일시정지/재개
            if self._source._paused:
                self._source.resume()
                self._play_btn.configure(text="\u23F8 일시정지")
                self._compact_panel.set_play_state("playing")
                self._status_label.configure(text="재생 중...")
            else:
                self._source.pause()
                self._play_btn.configure(text="\u25B6 재개")
                self._compact_panel.set_play_state("paused")
                self._status_label.configure(text="일시정지")
        else:
            # 시작
            self._state = AppState()
            self._log_panel.clear()
            self._compact_panel.clear()
            # clear 후 파일 로드 상태 복원
            filename = self._file_label.cget("text")
            if filename:
                self._compact_panel.set_file_loaded(filename)
            self._source.set_speed(self._get_speed())
            self._source.start(on_event=self._on_event)
            self._play_btn.configure(text="\u23F8 일시정지")
            self._compact_panel.set_play_state("playing")
            self._status_label.configure(text="재생 중...")
            self._poll_update()

    def _on_event(self, event):
        """백그라운드 스레드에서 호출 (state 업데이트)"""
        self._state.process_event(event)

    def _poll_update(self):
        """주기적 UI 갱신 (메인 스레드)"""
        if self._is_compact:
            self._compact_panel.update_state(self._state)
        else:
            self._progress_panel.update_state(self._state)
            self._customer_panel.update_state(self._state)
            self._log_panel.update_state(self._state)
            self._pdf_panel.update_state(self._state)

        if self._state.is_complete:
            self._status_label.configure(text="완료", text_color="#4CAF50")
            self._play_btn.configure(text="\u25B6 다시 시작")
            self._compact_panel.set_play_state("complete")
        elif self._source and self._source.is_running():
            self.after(self._update_interval, self._poll_update)

    # ===== 설정 =====

    def _on_speed_change(self, value: str):
        speed = self._get_speed()
        if self._source:
            self._source.set_speed(speed)

    def _get_speed(self) -> float:
        mapping = {"1x": 1.0, "2x": 2.0, "5x": 5.0, "10x": 10.0, "즉시": 1000.0}
        return mapping.get(self._speed_var.get(), 5.0)

    def _choose_save_dir(self):
        """PDF 저장 경로 선택 다이얼로그"""
        path = filedialog.askdirectory(
            title="PDF 저장 경로 선택",
            initialdir=self._save_dir or None,
        )
        if path:
            self._save_dir = path
            self._save_dir_btn.configure(text=self._truncate_path(path))

    @staticmethod
    def _get_work_area() -> tuple[int, int]:
        """주 모니터 작업 영역 (right, bottom) 반환

        SPI_GETWORKAREA: 주 모니터의 작업 표시줄 제외 영역
        - rect.right = 주 모니터 너비 (듀얼 모니터에서도 1920)
        - rect.bottom = 작업 표시줄 상단 Y (예: 1032)
        winfo_screenwidth()는 가상 데스크톱 전체 너비(3840)를 반환하므로 사용 금지!
        """
        try:
            import ctypes
            import ctypes.wintypes
            rect = ctypes.wintypes.RECT()
            ctypes.windll.user32.SystemParametersInfoW(
                0x0030, 0, ctypes.byref(rect), 0
            )
            return rect.right, rect.bottom
        except Exception:
            return 1920, 1032  # 1080p 기본값

    @staticmethod
    def _truncate_path(path: str, max_len: int = 20) -> str:
        if len(path) <= max_len:
            return path
        return "..." + path[-(max_len - 3):]
