# -*- coding: utf-8 -*-
"""
MetDO Customer Reader - GUI 애플리케이션

MetDO 고객정보 스크린샷을 OCR 파싱하여 고객 정보를 추출하는 GUI 도구.
read_customer.py의 파싱 함수들을 import하여 사용합니다.

Usage:
    python gui.py
"""
import os
import sys
import json
import threading
from pathlib import Path
from tkinter import filedialog

import customtkinter as ctk

from read_customer import (
    call_upstage_enhanced,
    parse_customer_info,
    API_KEY,
)

# ──────────────────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────────────────
_FONT = "맑은 고딕"
_WINDOW_WIDTH = 600
_WINDOW_HEIGHT = 700


class MetDOReaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MetDO Customer Reader")
        self.geometry(f"{_WINDOW_WIDTH}x{_WINDOW_HEIGHT}")
        self.minsize(500, 500)

        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")

        self._current_file = None
        self._is_parsing = False

        self._build_ui()

    def _build_ui(self):
        # ── 상단: 파일 선택 영역 ──
        file_frame = ctk.CTkFrame(self, fg_color="transparent")
        file_frame.pack(fill="x", padx=16, pady=(16, 8))

        self._file_label = ctk.CTkLabel(
            file_frame,
            text="이미지 파일을 선택해주세요",
            font=(_FONT, 13),
            text_color="gray",
            anchor="w",
        )
        self._file_label.pack(side="left", fill="x", expand=True, padx=(0, 8))

        self._browse_btn = ctk.CTkButton(
            file_frame,
            text="파일 선택",
            font=(_FONT, 13),
            width=100,
            command=self._on_browse,
        )
        self._browse_btn.pack(side="right")

        # ── 파싱 버튼 ──
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(fill="x", padx=16, pady=(4, 8))

        self._parse_btn = ctk.CTkButton(
            btn_frame,
            text="파싱 시작",
            font=(_FONT, 14, "bold"),
            height=40,
            state="disabled",
            command=self._on_parse,
        )
        self._parse_btn.pack(fill="x")

        # ── 상태 표시 ──
        self._status_label = ctk.CTkLabel(
            self,
            text="",
            font=(_FONT, 12),
            text_color="gray",
        )
        self._status_label.pack(fill="x", padx=16)

        # ── 결과 영역 ──
        result_frame = ctk.CTkFrame(self)
        result_frame.pack(fill="both", expand=True, padx=16, pady=(8, 8))

        self._result_text = ctk.CTkTextbox(
            result_frame,
            font=(_FONT, 13),
            wrap="word",
            state="disabled",
        )
        self._result_text.pack(fill="both", expand=True, padx=4, pady=4)

        # ── 하단: JSON 복사 버튼 ──
        bottom_frame = ctk.CTkFrame(self, fg_color="transparent")
        bottom_frame.pack(fill="x", padx=16, pady=(0, 16))

        self._copy_json_btn = ctk.CTkButton(
            bottom_frame,
            text="JSON 복사",
            font=(_FONT, 12),
            width=100,
            fg_color="gray",
            state="disabled",
            command=self._on_copy_json,
        )
        self._copy_json_btn.pack(side="right")

        self._copy_text_btn = ctk.CTkButton(
            bottom_frame,
            text="텍스트 복사",
            font=(_FONT, 12),
            width=100,
            fg_color="gray",
            state="disabled",
            command=self._on_copy_text,
        )
        self._copy_text_btn.pack(side="right", padx=(0, 8))

        # ── 드래그 앤 드롭 시도 ──
        self._setup_dnd()

    def _setup_dnd(self):
        """드래그 앤 드롭 설정 (tkinterdnd2 사용 가능한 경우)"""
        try:
            import tkinterdnd2
            self.drop_target_register(tkinterdnd2.DND_FILES)
            self.dnd_bind("<<Drop>>", self._on_drop)
        except (ImportError, Exception):
            pass

    def _on_drop(self, event):
        """드래그 앤 드롭 파일 처리"""
        file_path = event.data.strip("{}")
        if os.path.isfile(file_path):
            self._set_file(file_path)

    def _on_browse(self):
        """파일 선택 대화상자"""
        file_path = filedialog.askopenfilename(
            title="MetDO 고객정보 스크린샷 선택",
            filetypes=[
                ("이미지 파일", "*.png *.jpg *.jpeg *.bmp *.gif *.tiff"),
                ("모든 파일", "*.*"),
            ],
        )
        if file_path:
            self._set_file(file_path)

    def _set_file(self, file_path: str):
        """파일 설정"""
        self._current_file = file_path
        filename = Path(file_path).name
        self._file_label.configure(text=filename, text_color="black")
        self._parse_btn.configure(state="normal")
        self._set_status(f"파일 선택됨: {filename}")

    def _on_parse(self):
        """파싱 시작 (백그라운드 스레드)"""
        if self._is_parsing or not self._current_file:
            return

        self._is_parsing = True
        self._parse_btn.configure(state="disabled", text="파싱 중...")
        self._browse_btn.configure(state="disabled")
        self._set_status("OCR API 호출 중...")
        self._clear_result()

        thread = threading.Thread(target=self._parse_worker, daemon=True)
        thread.start()

    def _parse_worker(self):
        """OCR + 파싱 워커 (백그라운드 스레드)"""
        try:
            ocr_result = call_upstage_enhanced(self._current_file)

            if ocr_result.get("error"):
                error_msg = ocr_result.get("last_error", ocr_result.get("status_code", "알 수 없는 오류"))
                self.after(0, self._on_parse_error, f"OCR API 호출 실패: {error_msg}")
                return

            self.after(0, lambda: self._set_status("파싱 중..."))

            result = parse_customer_info(ocr_result)

            if result.get("error"):
                self.after(0, self._on_parse_error, result["error"])
                return

            self.after(0, self._on_parse_done, result)

        except Exception as e:
            self.after(0, self._on_parse_error, str(e))

    def _on_parse_done(self, result: dict):
        """파싱 완료"""
        self._is_parsing = False
        self._parse_btn.configure(state="normal", text="파싱 시작")
        self._browse_btn.configure(state="normal")
        self._set_status("파싱 완료")

        self._last_result = result
        self._display_result(result)

        self._copy_json_btn.configure(state="normal")
        self._copy_text_btn.configure(state="normal")

    def _on_parse_error(self, error_msg: str):
        """파싱 에러"""
        self._is_parsing = False
        self._parse_btn.configure(state="normal", text="파싱 시작")
        self._browse_btn.configure(state="normal")
        self._set_status(f"오류: {error_msg}")
        self._last_result = None

    def _display_result(self, result: dict):
        """결과를 텍스트 영역에 표시"""
        ct = result.get("customer_type", "")
        lines = []

        lines.append(f"  유형:       {ct}")
        lines.append(f"  고객명:     {result.get('name') or '-'}")

        if ct == "개인":
            lines.append(f"  생년월일:   {result.get('birth_date') or '-'}")
            lines.append(f"  성별:       {result.get('gender') or '-'}")
        elif ct == "법인":
            lines.append(f"  사업자번호: {result.get('business_number') or '-'}")

        lines.append(f"  휴대전화:   {result.get('mobile_phone') or '-'}")

        if ct == "개인":
            lines.append(f"  자택전화:   {result.get('home_phone') or '-'}")

        lines.append(f"  직장전화:   {result.get('work_phone') or '-'}")
        lines.append(f"  이메일:     {result.get('email') or '-'}")

        if ct == "개인":
            lines.append(f"  자택주소:   {result.get('home_address') or '-'}")
            lines.append(f"  직장주소:   {result.get('work_address') or '-'}")
        elif ct == "법인":
            lines.append(f"  사업장주소: {result.get('business_address') or '-'}")
            lines.append(f"  본점주소:   {result.get('hq_address') or '-'}")

        self._result_text.configure(state="normal")
        self._result_text.delete("1.0", "end")
        self._result_text.insert("1.0", "\n".join(lines))
        self._result_text.configure(state="disabled")

    def _clear_result(self):
        """결과 영역 초기화"""
        self._result_text.configure(state="normal")
        self._result_text.delete("1.0", "end")
        self._result_text.configure(state="disabled")

    def _set_status(self, text: str):
        """상태 메시지 표시"""
        self._status_label.configure(text=text)

    def _on_copy_json(self):
        """결과를 JSON으로 클립보드에 복사"""
        if hasattr(self, '_last_result') and self._last_result:
            json_str = json.dumps(self._last_result, ensure_ascii=False, indent=2)
            self.clipboard_clear()
            self.clipboard_append(json_str)
            self._set_status("JSON이 클립보드에 복사되었습니다")

    def _on_copy_text(self):
        """결과를 텍스트로 클립보드에 복사"""
        self._result_text.configure(state="normal")
        text = self._result_text.get("1.0", "end").strip()
        self._result_text.configure(state="disabled")
        if text:
            self.clipboard_clear()
            self.clipboard_append(text)
            self._set_status("텍스트가 클립보드에 복사되었습니다")


def main():
    if not API_KEY:
        import tkinter.messagebox as mb
        root = ctk.CTk()
        root.withdraw()
        mb.showerror("오류", "UPSTAGE_API_KEY 환경변수를 설정해주세요.")
        sys.exit(1)

    app = MetDOReaderApp()
    app.mainloop()


if __name__ == "__main__":
    main()
