# -*- coding: utf-8 -*-
"""진행률 패널: 현재 활동, 초성, 네비/스크롤, OCR 응답시간, 처리 현황"""
import customtkinter as ctk

_FONT = "맑은 고딕"


class ProgressPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)

        self._title = ctk.CTkLabel(
            self, text="진행 상황", font=ctk.CTkFont(family=_FONT, size=14, weight="bold")
        )
        self._title.pack(padx=10, pady=(10, 5), anchor="w")

        # 초성
        self._chosung_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._chosung_frame.pack(padx=10, fill="x")
        ctk.CTkLabel(self._chosung_frame, text="초성:", width=60, anchor="w",
                     font=ctk.CTkFont(family=_FONT, size=12)).pack(
            side="left"
        )
        self._chosung_val = ctk.CTkLabel(
            self._chosung_frame, text="-", font=ctk.CTkFont(family=_FONT, size=16, weight="bold")
        )
        self._chosung_val.pack(side="left")

        # 현재 활동 (프로그레스바 대체 - 총 페이지 수 미리 알 수 없음)
        self._activity_label = ctk.CTkLabel(
            self, text="대기 중",
            font=ctk.CTkFont(family=_FONT, size=13, weight="bold"),
            text_color="#5dade2"
        )
        self._activity_label.pack(padx=10, pady=(8, 2), anchor="w")

        # 처리 현황
        self._count_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=12),
            text_color="gray60"
        )
        self._count_label.pack(padx=10, anchor="w")

        # 단계 정보
        self._phase_label = ctk.CTkLabel(
            self, text="단계: -", text_color="gray60",
            font=ctk.CTkFont(family=_FONT, size=12)
        )
        self._phase_label.pack(padx=10, pady=(8, 0), anchor="w")

        # 네비/스크롤
        self._navi_label = ctk.CTkLabel(
            self, text="네비: - | 스크롤: -", text_color="gray60",
            font=ctk.CTkFont(family=_FONT, size=12)
        )
        self._navi_label.pack(padx=10, anchor="w")

        # OCR 응답시간
        self._ocr_label = ctk.CTkLabel(
            self, text="OCR: -", text_color="gray60",
            font=ctk.CTkFont(family=_FONT, size=12)
        )
        self._ocr_label.pack(padx=10, anchor="w")

        # 소요시간
        self._time_label = ctk.CTkLabel(
            self, text="", font=ctk.CTkFont(family=_FONT, size=12), text_color="gray60"
        )
        self._time_label.pack(padx=10, pady=(8, 5), anchor="w")

    def update_state(self, state) -> None:
        """AppState로부터 UI 업데이트"""
        # 초성
        chosung = state.current_chosung or state.chosung or "-"
        self._chosung_val.configure(text=f"[{chosung}]")

        # 현재 활동
        if state.is_complete:
            self._activity_label.configure(text="처리 완료", text_color="#4CAF50")
        elif state.current_activity:
            self._activity_label.configure(text=state.current_activity, text_color="#5dade2")

        # 처리 현황
        done = state.processed_count
        skipped = state.skipped_count
        total = state.total_customers or state.ocr_count
        parts = []
        if total > 0:
            parts.append(f"전체 {total}명")
        if done > 0:
            parts.append(f"완료 {done}명")
        if skipped > 0:
            parts.append(f"스킵 {skipped}명")
        if state.total_customers_done > 0:
            parts.append(f"통합뷰 {state.total_customers_done}명")
        self._count_label.configure(text=" | ".join(parts) if parts else "")

        # 단계
        if state.current_phase > 0:
            self._phase_label.configure(
                text=f"단계: {state.current_phase} - {state.current_phase_desc}"
            )

        # 네비/스크롤
        navi = state.current_navi or "-"
        scroll = state.current_scroll or "-"
        total_s = state.total_scroll or "-"
        self._navi_label.configure(text=f"네비: {navi} | 스크롤: {scroll}/{total_s}")

        # OCR
        if state.ocr_elapsed > 0:
            self._ocr_label.configure(text=f"OCR: {state.ocr_elapsed:.1f}초")

        # 소요시간
        if state.elapsed_time:
            self._time_label.configure(text=f"소요: {state.elapsed_time}")
