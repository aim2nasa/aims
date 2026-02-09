# -*- coding: utf-8 -*-
"""로그 뷰 패널: 자동 스크롤 로그 텍스트박스 (타이틀 없음)"""
import customtkinter as ctk

_FONT = "맑은 고딕"


class LogViewPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)

        self._textbox = ctk.CTkTextbox(
            self,
            font=ctk.CTkFont(family=_FONT, size=10),
            wrap="none",
            state="disabled",
        )
        self._textbox.pack(padx=4, pady=2, fill="both", expand=True)

        self._last_line_count = 0

    def update_state(self, state) -> None:
        """AppState의 로그 라인을 텍스트박스에 추가"""
        lines = state.log_lines
        new_count = len(lines)

        if new_count > self._last_line_count:
            self._textbox.configure(state="normal")
            for line in lines[self._last_line_count:]:
                self._textbox.insert("end", line + "\n")
            self._textbox.configure(state="disabled")
            self._textbox.see("end")
            self._last_line_count = new_count

    def clear(self) -> None:
        self._textbox.configure(state="normal")
        self._textbox.delete("1.0", "end")
        self._textbox.configure(state="disabled")
        self._last_line_count = 0
