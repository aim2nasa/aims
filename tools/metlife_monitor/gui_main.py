# -*- coding: utf-8 -*-
"""메인 GUI 윈도우: 4패널 레이아웃"""
import customtkinter as ctk
from tkinter import filedialog

from app_state import AppState
from data_source import FileReplaySource
from panels.progress_panel import ProgressPanel
from panels.customer_table import CustomerTablePanel
from panels.log_view import LogViewPanel
from panels.pdf_result import PdfResultPanel


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

        self._build_ui()

    def _build_ui(self):
        # 상단 툴바
        toolbar = ctk.CTkFrame(self, height=45)
        toolbar.pack(fill="x", padx=5, pady=(5, 0))
        toolbar.pack_propagate(False)

        self._open_btn = ctk.CTkButton(
            toolbar, text="로그 열기", width=100, command=self._open_file
        )
        self._open_btn.pack(side="left", padx=5, pady=5)

        self._play_btn = ctk.CTkButton(
            toolbar, text="▶ 시작", width=80, command=self._toggle_play,
            state="disabled"
        )
        self._play_btn.pack(side="left", padx=5, pady=5)

        # 속도 조절
        ctk.CTkLabel(toolbar, text="속도:").pack(side="left", padx=(15, 5), pady=5)
        self._speed_var = ctk.StringVar(value="5x")
        self._speed_menu = ctk.CTkOptionMenu(
            toolbar, values=["1x", "2x", "5x", "10x", "즉시"],
            variable=self._speed_var, width=80, command=self._on_speed_change
        )
        self._speed_menu.pack(side="left", padx=5, pady=5)

        # 파일명 표시
        self._file_label = ctk.CTkLabel(
            toolbar, text="", text_color="gray60", font=ctk.CTkFont(size=11)
        )
        self._file_label.pack(side="left", padx=10, pady=5)

        # 상태 표시
        self._status_label = ctk.CTkLabel(
            toolbar, text="", text_color="gray60", font=ctk.CTkFont(size=11)
        )
        self._status_label.pack(side="right", padx=10, pady=5)

        # 메인 컨텐츠: 좌측(진행+PDF) | 우측(테이블+로그)
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=5, pady=5)

        # 좌측 패널 (진행 + PDF)
        left = ctk.CTkFrame(content, width=260)
        left.pack(side="left", fill="y", padx=(0, 5))
        left.pack_propagate(False)

        self._progress_panel = ProgressPanel(left)
        self._progress_panel.pack(fill="x", padx=5, pady=(0, 5))

        self._pdf_panel = PdfResultPanel(left)
        self._pdf_panel.pack(fill="both", expand=True, padx=5, pady=(0, 0))

        # 우측 패널 (테이블 + 로그)
        right = ctk.CTkFrame(content, fg_color="transparent")
        right.pack(side="left", fill="both", expand=True)

        self._customer_panel = CustomerTablePanel(right)
        self._customer_panel.pack(fill="both", expand=True, padx=(0, 0), pady=(0, 5))

        self._log_panel = LogViewPanel(right)
        self._log_panel.pack(fill="both", expand=True)

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
