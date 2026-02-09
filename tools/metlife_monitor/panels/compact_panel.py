# -*- coding: utf-8 -*-
"""극소형 컴팩트 모드 패널: SikuliX 완전 분리용 단일 행

안전 영역 (1920x1080 기준):
- SikuliX TABLE_REGION: X=20~1910, Y=362~952
- "다음" 버튼 클릭: Y≈955~985
- 컴팩트 GUI 안전 배치: Y > 990 (테이블+페이지네이션 완전 아래)
- -toolwindow: 얇은 타이틀바, 드래그 내장, 싱글/듀얼 모니터 호환
"""
import customtkinter as ctk


class CompactPanel(ctk.CTkFrame):
    """극소형 단일 행: 고객명 + 변액/AR 카운트 + 진행률"""

    def __init__(self, master, on_toggle=None, on_open=None, on_play=None,
                 **kwargs):
        super().__init__(master, height=28, **kwargs)
        self.pack_propagate(False)

        self._on_toggle = on_toggle
        self._on_open = on_open
        self._on_play = on_play

        # === 단일 행 레이아웃 ===

        # [일반] 토글 버튼
        self._toggle_btn = ctk.CTkButton(
            self, text="일반", width=36, height=22,
            font=ctk.CTkFont(size=10),
            fg_color="#1f538d", hover_color="#2a6cb8",
            command=self._fire_toggle
        )
        self._toggle_btn.pack(side="left", padx=(3, 2), pady=3)

        # [📂] 파일 열기
        self._open_btn = ctk.CTkButton(
            self, text="\u2630", width=24, height=22,
            font=ctk.CTkFont(size=11),
            fg_color="gray30", hover_color="gray40",
            command=self._fire_open
        )
        self._open_btn.pack(side="left", padx=(0, 2), pady=3)

        # [▶] 재생/일시정지
        self._play_btn = ctk.CTkButton(
            self, text="\u25B6", width=24, height=22,
            font=ctk.CTkFont(size=10),
            fg_color="gray30", hover_color="gray40",
            command=self._fire_play,
            state="disabled"
        )
        self._play_btn.pack(side="left", padx=(0, 4), pady=3)

        # 프로그레스바
        self._progress_bar = ctk.CTkProgressBar(self, width=60, height=8)
        self._progress_bar.pack(side="left", padx=(0, 4), pady=3)
        self._progress_bar.set(0)

        # 메인 상태 텍스트: 고객명 + 변액/AR 카운트 + 진행률
        self._status_label = ctk.CTkLabel(
            self, text="파일을 열어주세요",
            font=ctk.CTkFont(family="Consolas", size=11),
            anchor="w"
        )
        self._status_label.pack(side="left", fill="x", expand=True,
                                padx=(0, 4), pady=3)

        # 소요시간 (우측)
        self._time_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family="Consolas", size=10),
            text_color="gray60"
        )
        self._time_label.pack(side="right", padx=(0, 4), pady=3)

    # --- Callbacks ---

    def _fire_toggle(self):
        if self._on_toggle:
            self._on_toggle()

    def _fire_open(self):
        if self._on_open:
            self._on_open()

    def _fire_play(self):
        if self._on_play:
            self._on_play()

    # --- 외부에서 호출하는 상태 동기화 ---

    def set_file_loaded(self, filename: str):
        """파일 로드 완료 시: 재생 버튼 활성화"""
        self._play_btn.configure(state="normal")
        self._status_label.configure(text=f"{filename} | 준비됨")

    def set_play_state(self, state: str):
        """재생 상태: playing / paused / stopped / complete"""
        if state == "playing":
            self._play_btn.configure(text="\u23F8")  # ⏸
        else:
            self._play_btn.configure(text="\u25B6")  # ▶

    # --- 주기적 상태 업데이트 ---

    def update_state(self, state) -> None:
        """AppState → 단일 행 상태 텍스트 생성

        표시 형식:
        [ㅋ] 3/8 37% | ▶코우머스 | 변액:2저장 1중복 | AR:3미존재 | N1 S1/2
        """
        parts = []

        # 1) 초성 + 진행률
        chosung = state.current_chosung or state.chosung or "-"
        total = state.total_customers or state.ocr_count
        done = state.processed_count
        skipped = state.skipped_count
        handled = done + skipped

        if total > 0:
            progress = min(handled / total, 1.0)
            self._progress_bar.set(progress)
            pct = int(progress * 100)
            if skipped > 0:
                parts.append(f"[{chosung}] {done}+{skipped}s/{total} {pct}%")
            else:
                parts.append(f"[{chosung}] {done}/{total} {pct}%")
        elif state.is_complete:
            self._progress_bar.set(1.0)
            parts.append(f"[{chosung}] 완료")
        else:
            parts.append(f"[{chosung}]")

        # 2) 현재 고객명 (가장 중요)
        current = ""
        current_status = ""
        for c in state.customers:
            if c.status == "processing":
                current = c.name
                current_status = "processing"
                break
        if not current and state.customers:
            for c in reversed(state.customers):
                if c.status in ("done", "skipped"):
                    current = c.name
                    current_status = c.status
                    break

        if current:
            if current_status == "processing":
                parts.append(f">{current}")
            elif current_status == "done":
                parts.append(f"v{current}")
            elif current_status == "skipped":
                parts.append(f"-{current}")
            else:
                parts.append(current)

        # 3) 변액 리포트 카운트 (핵심 정보)
        pdf_items = []
        if state.pdf_saved > 0:
            pdf_items.append(f"{state.pdf_saved}저장")
        if state.pdf_duplicates > 0:
            pdf_items.append(f"{state.pdf_duplicates}중복")
        if state.pdf_errors > 0:
            pdf_items.append(f"{state.pdf_errors}오류")
        pdf_text = " ".join(pdf_items) if pdf_items else "0"
        parts.append(f"변액:{pdf_text}")

        # 4) AR 카운트
        ar_items = []
        if state.ar_saved > 0:
            ar_items.append(f"{state.ar_saved}저장")
        if state.ar_not_found > 0:
            ar_items.append(f"{state.ar_not_found}미존재")
        ar_text = " ".join(ar_items) if ar_items else "0"
        parts.append(f"AR:{ar_text}")

        # 5) 네비/스크롤
        navi = state.current_navi or "-"
        scroll = state.current_scroll or "-"
        total_s = state.total_scroll or "-"
        parts.append(f"N{navi} S{scroll}/{total_s}")

        # 6) OCR 시간 (있을 때만)
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
