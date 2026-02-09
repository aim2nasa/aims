# -*- coding: utf-8 -*-
"""PDF 결과 패널: 1줄 초컴팩트 - 타이틀 없음

변액: 저장2 중복1 실패0 | AR: 저장3 미존재0
"""
import customtkinter as ctk

_FONT = "맑은 고딕"


class PdfResultPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, height=26, **kwargs)
        self.pack_propagate(False)

        self._label = ctk.CTkLabel(
            self, text="변액: 저장0 중복0 실패0 | AR: 저장0 미존재0",
            font=ctk.CTkFont(family=_FONT, size=11),
            text_color="gray60", anchor="w"
        )
        self._label.pack(fill="x", padx=8, pady=3)

    def update_state(self, state) -> None:
        ps = state.pdf_saved
        pd = state.pdf_duplicates
        pe = state.pdf_errors
        ar_s = state.ar_saved
        ar_n = state.ar_not_found

        parts = []
        # 변액
        var_parts = [f"저장{ps}"]
        if pd > 0:
            var_parts.append(f"중복{pd}")
        if pe > 0:
            var_parts.append(f"실패{pe}")
        parts.append("변액: " + " ".join(var_parts))

        # AR
        ar_parts = [f"저장{ar_s}"]
        if ar_n > 0:
            ar_parts.append(f"미존재{ar_n}")
        parts.append("AR: " + " ".join(ar_parts))

        # 색상: 데이터 있으면 밝게
        has_data = (ps + pd + pe + ar_s + ar_n) > 0
        color = "gray80" if has_data else "gray60"

        self._label.configure(text=" | ".join(parts), text_color=color)
