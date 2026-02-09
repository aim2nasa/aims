# -*- coding: utf-8 -*-
"""진행률 패널: 프로그레스바, 초성, 네비/스크롤, OCR 응답시간"""
import customtkinter as ctk


class ProgressPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)

        self._title = ctk.CTkLabel(
            self, text="진행 상황", font=ctk.CTkFont(family="맑은 고딕", size=14, weight="bold")
        )
        self._title.pack(padx=10, pady=(10, 5), anchor="w")

        # 초성
        self._chosung_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._chosung_frame.pack(padx=10, fill="x")
        ctk.CTkLabel(self._chosung_frame, text="초성:", width=60, anchor="w",
                     font=ctk.CTkFont(family="맑은 고딕", size=12)).pack(
            side="left"
        )
        self._chosung_val = ctk.CTkLabel(
            self._chosung_frame, text="-", font=ctk.CTkFont(family="맑은 고딕", size=16, weight="bold")
        )
        self._chosung_val.pack(side="left")

        # 프로그레스바
        self._progress_bar = ctk.CTkProgressBar(self, width=200)
        self._progress_bar.pack(padx=10, pady=(8, 2), fill="x")
        self._progress_bar.set(0)

        self._progress_label = ctk.CTkLabel(self, text="대기 중",
                                                  font=ctk.CTkFont(family="맑은 고딕", size=12))
        self._progress_label.pack(padx=10, anchor="w")

        # 단계 정보
        self._phase_label = ctk.CTkLabel(
            self, text="단계: -", text_color="gray60",
            font=ctk.CTkFont(family="맑은 고딕", size=12)
        )
        self._phase_label.pack(padx=10, pady=(8, 0), anchor="w")

        # 네비/스크롤
        self._navi_label = ctk.CTkLabel(
            self, text="네비: - | 스크롤: -", text_color="gray60",
            font=ctk.CTkFont(family="맑은 고딕", size=12)
        )
        self._navi_label.pack(padx=10, anchor="w")

        # OCR 응답시간
        self._ocr_label = ctk.CTkLabel(
            self, text="OCR: -", text_color="gray60",
            font=ctk.CTkFont(family="맑은 고딕", size=12)
        )
        self._ocr_label.pack(padx=10, anchor="w")

        # 소요시간
        self._time_label = ctk.CTkLabel(
            self, text="", font=ctk.CTkFont(family="맑은 고딕", size=12), text_color="gray60"
        )
        self._time_label.pack(padx=10, pady=(8, 5), anchor="w")

    def update_state(self, state) -> None:
        """AppState로부터 UI 업데이트"""
        # 초성
        chosung = state.current_chosung or state.chosung or "-"
        self._chosung_val.configure(text=f"[{chosung}]")

        # 프로그레스바: done + skipped = 전체 진행률
        total = state.total_customers or state.ocr_count
        done = state.processed_count
        skipped = state.skipped_count
        handled = done + skipped
        if total > 0:
            progress = min(handled / total, 1.0)
            self._progress_bar.set(progress)
            pct = int(progress * 100)
            if skipped > 0:
                self._progress_label.configure(
                    text=f"{done}명 처리, {skipped}명 스킵 ({handled}/{total}, {pct}%)"
                )
            else:
                self._progress_label.configure(
                    text=f"{done}/{total}명 처리 ({pct}%)"
                )
        elif state.is_complete:
            self._progress_bar.set(1.0)
            self._progress_label.configure(text="완료")

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
