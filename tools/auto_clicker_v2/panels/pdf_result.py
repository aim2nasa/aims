# -*- coding: utf-8 -*-
"""PDF 결과 패널: 변액리포트/AR 저장 건수 카운터"""
import customtkinter as ctk


class PdfResultPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)

        self._title = ctk.CTkLabel(
            self, text="PDF 결과", font=ctk.CTkFont(family="맑은 고딕", size=14, weight="bold")
        )
        self._title.pack(padx=10, pady=(10, 5), anchor="w")

        # 변액리포트 섹션
        self._var_title = ctk.CTkLabel(
            self, text="변액리포트", font=ctk.CTkFont(family="맑은 고딕", size=12), text_color="gray60"
        )
        self._var_title.pack(padx=10, anchor="w")

        self._saved_label = self._make_counter("저장:", "#4CAF50")
        self._dup_label = self._make_counter("중복:", "#FF9800")
        self._error_label = self._make_counter("실패:", "#F44336")

        # 구분선
        ctk.CTkFrame(self, height=1, fg_color="gray40").pack(
            padx=10, pady=8, fill="x"
        )

        # Annual Report 섹션
        self._ar_title = ctk.CTkLabel(
            self, text="Annual Report", font=ctk.CTkFont(family="맑은 고딕", size=12), text_color="gray60"
        )
        self._ar_title.pack(padx=10, anchor="w")

        self._ar_saved_label = self._make_counter("저장:", "#4CAF50")
        self._ar_none_label = self._make_counter("미존재:", "#9E9E9E")

    def _make_counter(self, label: str, color: str) -> ctk.CTkLabel:
        frame = ctk.CTkFrame(self, fg_color="transparent")
        frame.pack(padx=15, fill="x")
        ctk.CTkLabel(frame, text=label, width=50, anchor="w",
                     font=ctk.CTkFont(family="맑은 고딕", size=12)).pack(side="left")
        val = ctk.CTkLabel(
            frame, text="0", font=ctk.CTkFont(family="맑은 고딕", size=16, weight="bold"), text_color=color
        )
        val.pack(side="left")
        return val

    def update_state(self, state) -> None:
        """AppState로부터 카운터 업데이트"""
        self._saved_label.configure(text=str(state.pdf_saved))
        self._dup_label.configure(text=str(state.pdf_duplicates))
        self._error_label.configure(text=str(state.pdf_errors))
        self._ar_saved_label.configure(text=str(state.ar_saved))
        self._ar_none_label.configure(text=str(state.ar_not_found))
