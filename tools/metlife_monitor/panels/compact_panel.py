# -*- coding: utf-8 -*-
"""극소형 컴팩트 모드 패널: SikuliX 완전 분리용 단일 행 (32px)

안전 영역 분석 (1920x1080):
- SikuliX 작업 영역: Y 113~952 (테이블 리전 + 페이지네이션)
- 브라우저 영역: Y 0~1040
- Windows 작업 표시줄: Y 1040~1080
- GUI 배치: Y 1044 (작업 표시줄 위에 겹침, SikuliX 무간섭)
"""
import customtkinter as ctk


class CompactPanel(ctk.CTkFrame):
    """극소형 단일 행 모니터 (높이 28px, 타이틀바 없음)"""

    def __init__(self, master, on_toggle=None, **kwargs):
        super().__init__(master, height=28, **kwargs)
        self.pack_propagate(False)

        self._on_toggle = on_toggle

        # 드래그 이동 지원
        self._drag_x = 0
        self._drag_y = 0
        self.bind("<Button-1>", self._start_drag)
        self.bind("<B1-Motion>", self._do_drag)

        # === 단일 행 레이아웃 ===

        # [일반] 토글 버튼 (좌측)
        self._toggle_btn = ctk.CTkButton(
            self, text="일반", width=40, height=22,
            font=ctk.CTkFont(size=10),
            fg_color="#1f538d", hover_color="#2a6cb8",
            command=self._on_toggle_click
        )
        self._toggle_btn.pack(side="left", padx=(4, 6), pady=3)

        # 프로그레스바 (작은 크기)
        self._progress_bar = ctk.CTkProgressBar(self, width=80, height=10)
        self._progress_bar.pack(side="left", padx=(0, 4), pady=3)
        self._progress_bar.set(0)

        # 상태 텍스트 (메인 정보 - 한 줄에 모두 표시)
        self._status_label = ctk.CTkLabel(
            self, text="대기 중",
            font=ctk.CTkFont(family="Consolas", size=11),
            anchor="w"
        )
        self._status_label.pack(side="left", fill="x", expand=True, padx=(0, 4), pady=3)
        # 상태 텍스트에도 드래그 바인딩
        self._status_label.bind("<Button-1>", self._start_drag)
        self._status_label.bind("<B1-Motion>", self._do_drag)

        # 소요시간 (우측)
        self._time_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family="Consolas", size=10),
            text_color="gray60"
        )
        self._time_label.pack(side="right", padx=(0, 6), pady=3)

    def _on_toggle_click(self):
        if self._on_toggle:
            self._on_toggle()

    def _start_drag(self, event):
        self._drag_x = event.x_root - self.winfo_toplevel().winfo_x()
        self._drag_y = event.y_root - self.winfo_toplevel().winfo_y()

    def _do_drag(self, event):
        x = event.x_root - self._drag_x
        y = event.y_root - self._drag_y
        self.winfo_toplevel().geometry(f"+{x}+{y}")

    def update_state(self, state) -> None:
        """AppState로부터 단일 행 상태 업데이트"""
        parts = []

        # 초성
        chosung = state.current_chosung or state.chosung or "-"
        parts.append(f"[{chosung}]")

        # 진행률
        total = state.total_customers or state.ocr_count
        done = state.processed_count
        skipped = state.skipped_count
        handled = done + skipped
        if total > 0:
            progress = min(handled / total, 1.0)
            self._progress_bar.set(progress)
            pct = int(progress * 100)
            if skipped > 0:
                parts.append(f"{done}+{skipped}s/{total} {pct}%")
            else:
                parts.append(f"{done}/{total} {pct}%")
        elif state.is_complete:
            self._progress_bar.set(1.0)
            parts.append("완료")

        # 현재 고객
        current = ""
        for c in state.customers:
            if c.status == "processing":
                current = c.name
                break
        if not current and state.customers:
            for c in reversed(state.customers):
                if c.status in ("done", "skipped"):
                    current = c.name
                    break
        if current:
            parts.append(current)

        # PDF/AR
        parts.append(
            f"P:{state.pdf_saved}/{state.pdf_duplicates}/{state.pdf_errors}"
            f" A:{state.ar_saved}/{state.ar_not_found}"
        )

        # 네비/스크롤
        navi = state.current_navi or "-"
        scroll = state.current_scroll or "-"
        total_s = state.total_scroll or "-"
        parts.append(f"N{navi} S{scroll}/{total_s}")

        # OCR
        if state.ocr_elapsed > 0:
            parts.append(f"OCR:{state.ocr_elapsed:.1f}s")

        self._status_label.configure(text=" | ".join(parts))

        # 소요시간
        if state.elapsed_time:
            self._time_label.configure(text=state.elapsed_time)

    def clear(self) -> None:
        self._progress_bar.set(0)
        self._status_label.configure(text="대기 중")
        self._time_label.configure(text="")
