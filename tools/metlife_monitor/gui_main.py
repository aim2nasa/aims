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
# SikuliX 작업 영역:
#   - 클릭 좌표: X=115~1893, Y=113~809 (스크린샷 분석, 866건)
#   - 테이블 리전: Y=362~952 (OCR 캡처 + 스크롤 비교)
#   - "다음" 버튼: Y≈955~985 (Nexacro 페이지네이션, exists()로 전체 화면 스캔)
#   - 상태 표시줄: Y≈990~1020 (Nexacro + 브라우저)
#
# 안전 영역: Y > 1040 (Windows 작업 표시줄)
#   - SikuliX는 작업 표시줄에 절대 접근하지 않음
#   - 브라우저 영역과도 완전히 분리
#
# "다음" 버튼 간섭 방지:
#   - exists(IMG_NEXT_BTN, 5)가 전체 화면 스캔
#   - 녹색 배경 + 흰색 "다음" 텍스트 (우리 GUI의 어두운 배경과 완전히 다름)
#   - Y > 1040 배치로 물리적으로도 분리
# ================================================

COMPACT_Y = 1044       # 작업 표시줄 바로 위 (브라우저 아래)
COMPACT_HEIGHT = 32    # 극소형: 단일 행
COMPACT_WIDTH = 700    # 필요한 만큼만


class MetlifeMonitorApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MetLife 고객목록 자동화 모니터")
        self.geometry("1100x700")
        self.minsize(900, 550)

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self._state = AppState()
        self._source: FileReplaySource | None = None
        self._update_interval = 100  # ms
        self._is_compact = False

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
            self._toolbar, text="▶ 시작", width=80, command=self._toggle_play,
            state="disabled"
        )
        self._play_btn.pack(side="left", padx=5, pady=5)

        # 속도 조절
        ctk.CTkLabel(self._toolbar, text="속도:").pack(side="left", padx=(15, 5), pady=5)
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

        # 파일명 표시
        self._file_label = ctk.CTkLabel(
            self._toolbar, text="", text_color="gray60", font=ctk.CTkFont(size=11)
        )
        self._file_label.pack(side="left", padx=10, pady=5)

        # 상태 표시
        self._status_label = ctk.CTkLabel(
            self._toolbar, text="", text_color="gray60", font=ctk.CTkFont(size=11)
        )
        self._status_label.pack(side="right", padx=10, pady=5)

        # 일반 모드 컨텐츠
        self._build_normal_content()

        # 컴팩트 모드 패널 (숨겨진 상태, 토글 콜백 연결)
        self._compact_panel = CompactPanel(self, on_toggle=self._toggle_compact)

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
        self._customer_panel.pack(fill="both", expand=True, padx=(0, 0), pady=(0, 5))

        self._log_panel = LogViewPanel(right)
        self._log_panel.pack(fill="both", expand=True)

    def _toggle_compact(self):
        if self._is_compact:
            self._exit_compact()
        else:
            self._enter_compact()

    def _enter_compact(self):
        """컴팩트 모드: 극소형 단일 행 (Y=1044, 작업 표시줄 영역)"""
        self._is_compact = True
        self._compact_btn.configure(text="일반", fg_color="#1f538d")

        # 현재 일반 모드 위치/크기 저장
        self._normal_geometry = self.geometry()

        # 일반 모드 UI 숨기기
        self._toolbar.pack_forget()
        self._normal_frame.pack_forget()

        # 컴팩트 패널만 표시
        self._compact_panel.pack(fill="both", expand=True)

        # 윈도우: 극소형, 타이틀바 제거, 항상 위
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.geometry(f"{COMPACT_WIDTH}x{COMPACT_HEIGHT}+0+{COMPACT_Y}")

    def _exit_compact(self):
        """일반 모드: 4패널 레이아웃 복원"""
        self._is_compact = False
        self._compact_btn.configure(text="컴팩트", fg_color="gray30")

        # 컴팩트 패널 숨기기
        self._compact_panel.pack_forget()

        # 타이틀바 복원
        self.overrideredirect(False)
        self.attributes("-topmost", False)

        # 일반 모드 UI 복원
        self._toolbar.pack(fill="x", padx=5, pady=(5, 0))
        self._normal_frame.pack(fill="both", expand=True, padx=5, pady=5)

        # 윈도우 크기/위치 복원
        self.geometry(self._normal_geometry)
        self.minsize(900, 550)
        self.resizable(True, True)

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
        self._file_label.configure(text=filepath.split("/")[-1].split("\\")[-1])
        self._play_btn.configure(state="normal", text="▶ 시작")
        self._status_label.configure(text="준비됨")

    def _toggle_play(self):
        if not self._source:
            return

        if self._source.is_running():
            # 일시정지/재개
            if self._source._paused:
                self._source.resume()
                self._play_btn.configure(text="⏸ 일시정지")
                self._status_label.configure(text="재생 중...")
            else:
                self._source.pause()
                self._play_btn.configure(text="▶ 재개")
                self._status_label.configure(text="일시정지")
        else:
            # 시작
            self._state = AppState()
            self._log_panel.clear()
            self._compact_panel.clear()
            self._source.set_speed(self._get_speed())
            self._source.start(on_event=self._on_event)
            self._play_btn.configure(text="⏸ 일시정지")
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
            self._play_btn.configure(text="▶ 다시 시작")
        elif self._source and self._source.is_running():
            self.after(self._update_interval, self._poll_update)

    def _on_speed_change(self, value: str):
        speed = self._get_speed()
        if self._source:
            self._source.set_speed(speed)

    def _get_speed(self) -> float:
        mapping = {"1x": 1.0, "2x": 2.0, "5x": 5.0, "10x": 10.0, "즉시": 1000.0}
        return mapping.get(self._speed_var.get(), 5.0)
