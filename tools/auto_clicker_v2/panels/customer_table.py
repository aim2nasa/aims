# -*- coding: utf-8 -*-
"""고객 테이블 패널: OCR 인식된 고객 목록 + 처리 상태 (컴팩트)"""
import customtkinter as ctk
from tkinter import ttk

_FONT = "맑은 고딕"

STATUS_ICONS = {
    "done": "[완료]",
    "processing": "[처리중]",
    "skipped": "[스킵]",
    "error": "[에러]",
    "pending": "",
}

STATUS_COLORS = {
    "done": "#4CAF50",
    "processing": "#FF9800",
    "skipped": "#9E9E9E",
    "error": "#F44336",
    "pending": "",
}


class CustomerTablePanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)

        # Treeview (타이틀 제거 - 바로 테이블)
        columns = ("no", "name", "type", "phone", "status")
        self._tree_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._tree_frame.pack(padx=4, pady=2, fill="both", expand=True)

        style = ttk.Style()
        style.theme_use("clam")
        style.configure(
            "Custom.Treeview",
            background="#2b2b2b",
            foreground="white",
            fieldbackground="#2b2b2b",
            rowheight=19,
            font=(_FONT, 9),
        )
        style.configure(
            "Custom.Treeview.Heading",
            background="#3b3b3b",
            foreground="white",
            font=(_FONT, 9, "bold"),
        )
        style.map("Custom.Treeview", background=[("selected", "#1f538d")])

        self._tree = ttk.Treeview(
            self._tree_frame,
            columns=columns,
            show="headings",
            style="Custom.Treeview",
            height=5,
        )

        self._tree.heading("no", text="No")
        self._tree.heading("name", text="고객명")
        self._tree.heading("type", text="구분")
        self._tree.heading("phone", text="휴대폰")
        self._tree.heading("status", text="상태")

        self._tree.column("no", width=30, anchor="center")
        self._tree.column("name", width=80)
        self._tree.column("type", width=40, anchor="center")
        self._tree.column("phone", width=110)
        self._tree.column("status", width=55, anchor="center")

        scrollbar = ttk.Scrollbar(
            self._tree_frame, orient="vertical", command=self._tree.yview
        )
        self._tree.configure(yscrollcommand=scrollbar.set)

        self._tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # 태그 색상 설정
        for status, color in STATUS_COLORS.items():
            if color:
                self._tree.tag_configure(status, foreground=color)

    def update_state(self, state) -> None:
        """AppState의 고객 목록으로 테이블 갱신 + 처리 중 고객으로 자동 스크롤"""
        for item in self._tree.get_children():
            self._tree.delete(item)

        scroll_target = None
        for c in state.customers:
            status_text = STATUS_ICONS.get(c.status, "")
            tags = (c.status,) if c.status in STATUS_COLORS else ()
            iid = self._tree.insert(
                "",
                "end",
                values=(c.no, c.name, c.type, c.phone, status_text),
                tags=tags,
            )
            if c.status in ("processing", "done", "skipped"):
                scroll_target = iid

        if scroll_target:
            self._tree.see(scroll_target)
