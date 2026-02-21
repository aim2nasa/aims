# -*- coding: utf-8 -*-
"""극소형 컴팩트 모드 패널: SikuliX 완전 분리용 단일 행

안전 영역 (1920x1080 기준):
- SikuliX TABLE_REGION: X=20~1910, Y=362~952
- "다음" 버튼 클릭: Y≈955~985
- 컴팩트 GUI 안전 배치: Y > 990 (테이블+페이지네이션 완전 아래)
- -toolwindow: 얇은 타이틀바, 드래그 내장, 싱글/듀얼 모니터 호환

표시 형식:
[⊞] 1명 | 팽재남: 변액:없음 AR:저장 | AR 다운로드 완료 | 3:25
"""
import customtkinter as ctk

# 통일 폰트
_FONT = "맑은 고딕"


class CompactPanel(ctk.CTkFrame):
    """극소형 단일 행: 고객수 + 고객상태(변액/AR) + 활동로그 + 시간"""

    def __init__(self, master, on_toggle=None, **kwargs):
        # 불필요한 키워드 무시 (하위 호환)
        kwargs.pop("on_open", None)
        kwargs.pop("on_play", None)
        super().__init__(master, height=28, **kwargs)
        self.pack_propagate(False)

        self._on_toggle = on_toggle

        # 드래그 이동
        self._drag_x = 0
        self._drag_y = 0
        self.bind("<Button-1>", self._start_drag)
        self.bind("<B1-Motion>", self._do_drag)

        # === 단일 행 레이아웃 ===

        # 토글 버튼: 컴팩트→일반(확대) 전환  ↗ = 크게 보기
        self._toggle_btn = ctk.CTkButton(
            self, text="\u2197", width=28, height=22,
            font=ctk.CTkFont(family=_FONT, size=15),
            fg_color="#1f538d", hover_color="#2a6cb8",
            command=self._fire_toggle
        )
        self._toggle_btn.pack(side="left", padx=(3, 4), pady=3)

        # 사용자 정보 ([DEV] 사용자명 — 타이틀바 없을 때 대체 표시)
        self._user_info_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=10),
            text_color="#5dade2",
        )
        # 텍스트가 비어있으면 공간 차지 안 함 (pack 후 빈 텍스트면 자동 축소)
        self._user_info_label.pack(side="left", padx=(0, 4), pady=3)

        # 선택한 초성
        self._chosung_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            text_color="#5dade2"
        )
        self._chosung_label.pack(side="left", padx=(0, 6), pady=3)

        # 처리 완료 고객 수
        self._count_label = ctk.CTkLabel(
            self, text="0명",
            font=ctk.CTkFont(family=_FONT, size=11, weight="bold"),
            text_color="#4CAF50"
        )
        self._count_label.pack(side="left", padx=(0, 6), pady=3)

        # 고객 상태 (이름 + 변액/AR)
        self._customer_label = ctk.CTkLabel(
            self, text="대기 중",
            font=ctk.CTkFont(family=_FONT, size=11),
            anchor="w"
        )
        self._customer_label.pack(side="left", padx=(0, 6), pady=3)
        self._customer_label.bind("<Button-1>", self._start_drag)
        self._customer_label.bind("<B1-Motion>", self._do_drag)

        # 현재 활동 (간략 로그)
        self._activity_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=10),
            text_color="gray60",
            anchor="w"
        )
        self._activity_label.pack(side="left", fill="x", expand=True,
                                  padx=(0, 4), pady=3)
        self._activity_label.bind("<Button-1>", self._start_drag)
        self._activity_label.bind("<B1-Motion>", self._do_drag)

        # 버전 (최우측 고정)
        self._version_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=9),
            text_color="gray45"
        )
        self._version_label.pack(side="right", padx=(0, 4), pady=3)

        # 소요시간 (버전 왼쪽)
        self._time_label = ctk.CTkLabel(
            self, text="",
            font=ctk.CTkFont(family=_FONT, size=10),
            text_color="gray60"
        )
        self._time_label.pack(side="right", padx=(0, 2), pady=3)

    # --- 드래그 이동 ---

    def _start_drag(self, event):
        self._drag_x = event.x_root - self.winfo_toplevel().winfo_x()
        self._drag_y = event.y_root - self.winfo_toplevel().winfo_y()

    def _do_drag(self, event):
        x = event.x_root - self._drag_x
        y = event.y_root - self._drag_y
        self.winfo_toplevel().geometry(f"+{x}+{y}")

    # --- Callbacks ---

    def _fire_toggle(self):
        if self._on_toggle:
            self._on_toggle()

    # --- 외부에서 호출하는 상태 동기화 ---

    def set_user_info(self, text: str):
        """사용자 정보 표시 ([DEV] 사용자명)"""
        self._user_info_label.configure(text=text)

    def set_version(self, version: str):
        """버전 표시"""
        self._version_label.configure(text=f"v{version}")

    def set_chosung(self, chosung: str):
        """선택한 초성 표시"""
        label = chosung or "전체"
        self._chosung_label.configure(text=f"[{label}]")

    def set_file_loaded(self, filename: str):
        """실행 시작 시"""
        self._activity_label.configure(text=filename)

    def set_play_state(self, state: str):
        """재생 상태 - 컴팩트에서는 최소 표시"""
        if state == "complete":
            self._activity_label.configure(text="완료", text_color="#4CAF50")
        elif state == "crashed":
            self._activity_label.configure(text="FATAL 오류 발생", text_color="#e74c3c")
        elif state == "stopped":
            self._activity_label.configure(text="중지됨", text_color="#e74c3c")

    # --- 주기적 상태 업데이트 ---

    def update_state(self, state) -> None:
        """AppState → 컴팩트 상태 표시

        표시 형식:
        [⊞] 1명 | 팽재남: 변액:없음 AR:저장 | AR 다운로드 완료 | 3:25
        """
        # 1) 처리 완료 고객 수
        count = state.total_customers_done or state.processed_count
        self._count_label.configure(text=f"{count}명")

        # 2) 고객 상태 (이름 + 변액/AR)
        name = state.current_customer_name
        if name:
            # 변액 상태
            vs = state._cur_variable_status
            if vs == "없음":
                var_text = "변액:없음"
            elif vs:
                var_text = f"변액:{vs}"
            else:
                var_text = "변액:..."

            # AR 상태
            ars = state._cur_ar_status
            if ars:
                ar_text = f"AR:{ars}"
            else:
                ar_text = "AR:..."

            self._customer_label.configure(
                text=f"{name}: {var_text} {ar_text}"
            )
        elif state.is_crashed:
            crash_msg = state.crash_customer or "오류"
            self._customer_label.configure(text=f"FATAL: {crash_msg}")
        elif state.is_complete:
            self._customer_label.configure(text="처리 완료")
        else:
            self._customer_label.configure(text="대기 중")

        # 3) 현재 활동
        if state.current_activity:
            self._activity_label.configure(
                text=state.current_activity, text_color="gray60"
            )

        # 4) 소요시간
        if state.elapsed_time:
            self._time_label.configure(text=state.elapsed_time)

    def clear(self) -> None:
        self._chosung_label.configure(text="")
        self._count_label.configure(text="0명")
        self._customer_label.configure(text="대기 중")
        self._activity_label.configure(text="", text_color="gray60")
        self._time_label.configure(text="")
