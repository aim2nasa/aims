# -*- coding: utf-8 -*-
"""진행률 패널: 2줄 초컴팩트 - 타이틀 없음"""
import customtkinter as ctk

_FONT = "맑은 고딕"


class ProgressPanel(ctk.CTkFrame):
    """2줄 컴팩트 진행 상황 표시

    Line1: [ㄱ] 강보경 클릭 | 전체13 완료5 스킵2 통합뷰5
    Line2: 2단계-초성처리 | N1 S1/3 | OCR:8.7초 | 소요:5분12초
    """

    def __init__(self, master, **kwargs):
        super().__init__(master, height=44, **kwargs)
        self.pack_propagate(False)

        # Line 1: 초성 + 현재활동 + 처리현황
        self._line1 = ctk.CTkLabel(
            self, text="대기 중",
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            text_color="#5dade2", anchor="w"
        )
        self._line1.pack(fill="x", padx=8, pady=(2, 0))

        # Line 2: 단계 + 네비 + OCR + 소요시간
        self._line2 = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=10),
            text_color="gray60", anchor="w"
        )
        self._line2.pack(fill="x", padx=8, pady=(0, 2))

    def update_state(self, state) -> None:
        # === Line 1: [ㄱ] 활동 | 전체N 완료M ===
        chosung = state.current_chosung or state.chosung
        parts1 = []
        if chosung:
            parts1.append(f"[{chosung}]")

        if state.is_crashed:
            parts1.append("FATAL 오류 발생")
        elif state.is_complete:
            parts1.append("처리 완료")
        elif state.current_activity:
            parts1.append(state.current_activity)
        else:
            parts1.append("대기 중")

        # 처리 현황
        counts = []
        total = state.total_customers or state.ocr_count
        if total > 0:
            counts.append(f"전체{total}")
        if state.processed_count > 0:
            counts.append(f"완료{state.processed_count}")
        if state.skipped_count > 0:
            counts.append(f"스킵{state.skipped_count}")
        if state.total_customers_done > 0:
            counts.append(f"통합뷰{state.total_customers_done}")
        if counts:
            parts1.append(" ".join(counts))

        color1 = "#e74c3c" if state.is_crashed else ("#4CAF50" if state.is_complete else "#5dade2")
        self._line1.configure(text=" | ".join(parts1), text_color=color1)

        # === Line 2: 단계 | N1 S1/3 | OCR:8.7초 | 소요:5분 ===
        parts2 = []
        if state.current_phase > 0:
            parts2.append(f"{state.current_phase}단계-{state.current_phase_desc}")

        navi = state.current_navi
        scroll = state.current_scroll
        total_s = state.total_scroll
        if navi:
            s_text = f"N{navi}"
            if scroll:
                s_text += f" S{scroll}/{total_s or '?'}"
            parts2.append(s_text)

        if state.ocr_elapsed > 0:
            parts2.append(f"OCR:{state.ocr_elapsed:.1f}초")

        if state.elapsed_time:
            parts2.append(f"소요:{state.elapsed_time}")

        self._line2.configure(text=" | ".join(parts2))
