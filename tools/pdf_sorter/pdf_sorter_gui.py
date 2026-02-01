#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 분류 및 정리 도구 (PDF Sorter)

폴더 내 AR(Annual Report)과 CRS(변액리포트) PDF를 자동 분류하고,
고객명별 폴더로 정리하는 Tkinter GUI 도구.

사용법:
  python pdf_sorter_gui.py

의존성:
  pip install pdfminer.six
"""

import shutil
import threading
import queue
from pathlib import Path

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import tkinter.font as tkfont

from pdf_classifier import classify_and_extract, unique_path, PDFMetadata

# ──────────────────────────────────────────────
# 한글 폰트 설정 (crs_gui.py:116-144)
# ──────────────────────────────────────────────

FONT_CANDIDATES = [
    "Malgun Gothic",        # Windows
    "맑은 고딕",
    "NanumGothic",          # Ubuntu
    "Noto Sans CJK KR",
    "Noto Sans KR",
    "Apple SD Gothic Neo",  # macOS
    "DejaVu Sans",
]


def setup_korean_fonts(root: tk.Tk) -> str:
    """시스템에서 사용 가능한 한글 폰트를 찾아 적용한다."""
    installed = set(tkfont.families(root))
    chosen = next((f for f in FONT_CANDIDATES if f in installed), "DejaVu Sans")

    for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont", "TkFixedFont"):
        try:
            tkfont.nametofont(name).configure(family=chosen)
        except Exception:
            pass

    return chosen


# ──────────────────────────────────────────────
# 로그 색상 태그
# ──────────────────────────────────────────────

LOG_COLORS = {
    "ar":      "#0066CC",   # 파랑 (AR)
    "crs":     "#CC6600",   # 오렌지 (CRS)
    "unknown": "#999999",   # 회색 (미분류)
    "error":   "#CC0000",   # 빨강 (에러)
    "success": "#008800",   # 녹색 (성공)
    "info":    "#333333",   # 기본
}


# ──────────────────────────────────────────────
# 메인 앱
# ──────────────────────────────────────────────

class PDFSorterApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PDF 분류 및 정리 도구")
        self.geometry("960x700")
        self.minsize(800, 600)

        self.font_name = setup_korean_fonts(self)
        self.input_folder: Path | None = None
        self.scan_results: list[PDFMetadata] = []
        self._worker_running = False

        # 워커 스레드 → 메인 스레드 통신용 큐
        self._ui_queue: queue.Queue = queue.Queue()

        self._build_ui()
        self._setup_log_tags()
        self._poll_ui_queue()

    # ──────────────────────────────────────────
    # UI 구성
    # ──────────────────────────────────────────

    def _build_ui(self):
        main = ttk.Frame(self, padding=12)
        main.pack(fill="both", expand=True)

        # ── 상단: 폴더 선택 ──
        top = ttk.Frame(main)
        top.pack(fill="x", pady=(0, 8))

        ttk.Label(top, text="입력 폴더:").pack(side="left")
        self.folder_var = tk.StringVar()
        self.folder_entry = ttk.Entry(top, textvariable=self.folder_var, state="readonly", width=60)
        self.folder_entry.pack(side="left", padx=(6, 6), fill="x", expand=True)
        ttk.Button(top, text="폴더 선택", command=self._select_folder).pack(side="left", padx=(0, 4))
        self.scan_btn = ttk.Button(top, text="스캔", command=self._scan_pdfs, state="disabled")
        self.scan_btn.pack(side="left")

        # ── 중간: Treeview 테이블 ──
        self.result_label = ttk.Label(main, text="스캔 결과 (0개)")
        self.result_label.pack(anchor="w", pady=(4, 2))

        tree_frame = ttk.Frame(main)
        tree_frame.pack(fill="both", expand=True, pady=(0, 4))

        columns = ("filename", "type", "customer", "title")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=12)
        self.tree.heading("filename", text="파일명")
        self.tree.heading("type", text="유형")
        self.tree.heading("customer", text="고객명")
        self.tree.heading("title", text="읽기쉬운 제목 (displayName)")

        self.tree.column("filename", width=260, minwidth=150)
        self.tree.column("type", width=60, minwidth=50, anchor="center")
        self.tree.column("customer", width=100, minwidth=70, anchor="center")
        self.tree.column("title", width=400, minwidth=200)

        # 스크롤바
        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        # Treeview 행 색상 태그
        self.tree.tag_configure("ar", foreground="#0066CC")
        self.tree.tag_configure("crs", foreground="#CC6600")
        self.tree.tag_configure("unknown", foreground="#999999")

        # ── 진행률 바 ──
        prog_frame = ttk.Frame(main)
        prog_frame.pack(fill="x", pady=(0, 4))
        self.progress = ttk.Progressbar(prog_frame, mode="determinate")
        self.progress.pack(side="left", fill="x", expand=True)
        self.progress_label = ttk.Label(prog_frame, text="0 / 0", width=12, anchor="e")
        self.progress_label.pack(side="right", padx=(8, 0))

        # ── 로그 ──
        ttk.Label(main, text="로그:").pack(anchor="w")
        log_frame = ttk.Frame(main)
        log_frame.pack(fill="both", expand=True, pady=(2, 4))

        self.log_text = tk.Text(log_frame, height=8, wrap="word", state="disabled")
        log_vsb = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_vsb.set)
        self.log_text.pack(side="left", fill="both", expand=True)
        log_vsb.pack(side="right", fill="y")

        # ── 하단: 정리 실행 버튼 ──
        bottom = ttk.Frame(main)
        bottom.pack(fill="x", pady=(4, 0))
        self.organize_btn = ttk.Button(bottom, text="정리 실행", command=self._organize_files, state="disabled")
        self.organize_btn.pack(side="right")

    def _setup_log_tags(self):
        """로그 텍스트 위젯의 색상 태그 설정"""
        for tag, color in LOG_COLORS.items():
            self.log_text.tag_configure(tag, foreground=color)

    # ──────────────────────────────────────────
    # 워커 스레드 → 메인 스레드 UI 업데이트
    # ──────────────────────────────────────────

    def _poll_ui_queue(self):
        """50ms 간격으로 큐를 확인하여 UI 업데이트를 메인 스레드에서 실행"""
        try:
            while True:
                action = self._ui_queue.get_nowait()
                action()
        except queue.Empty:
            pass
        self.after(50, self._poll_ui_queue)

    def _enqueue(self, fn):
        """워커 스레드에서 호출: UI 업데이트 함수를 큐에 넣는다."""
        self._ui_queue.put(fn)

    # ──────────────────────────────────────────
    # 로그
    # ──────────────────────────────────────────

    def _log(self, message: str, tag: str = "info"):
        """메인 스레드에서만 호출. 로그 위젯에 메시지 추가."""
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n", tag)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    # ──────────────────────────────────────────
    # 버튼 상태 관리
    # ──────────────────────────────────────────

    def _set_buttons_busy(self, busy: bool):
        """작업 중 버튼 비활성화"""
        state = "disabled" if busy else "normal"
        self.scan_btn.configure(state=state)
        if busy:
            self.organize_btn.configure(state="disabled")
        self._worker_running = busy

    # ──────────────────────────────────────────
    # 폴더 선택
    # ──────────────────────────────────────────

    def _select_folder(self):
        if self._worker_running:
            return
        folder = filedialog.askdirectory(title="PDF가 있는 폴더 선택")
        if not folder:
            return
        self.input_folder = Path(folder)
        self.folder_var.set(str(self.input_folder))
        self.scan_btn.configure(state="normal")
        self.organize_btn.configure(state="disabled")
        self._log(f"폴더 선택: {self.input_folder}", "info")

    # ──────────────────────────────────────────
    # 1단계: 스캔 (미리보기) - 백그라운드 스레드
    # ──────────────────────────────────────────

    def _scan_pdfs(self):
        if self._worker_running:
            return
        if not self.input_folder or not self.input_folder.is_dir():
            messagebox.showwarning("경고", "유효한 폴더를 선택하세요.")
            return

        # 초기화
        self.scan_results.clear()
        self.tree.delete(*self.tree.get_children())
        self.organize_btn.configure(state="disabled")

        # PDF 파일 목록
        pdf_files = sorted(self.input_folder.glob("*.pdf"))
        if not pdf_files:
            messagebox.showinfo("안내", "선택한 폴더에 PDF 파일이 없습니다.")
            return

        total = len(pdf_files)
        self.progress.configure(maximum=total, value=0)
        self._log(f"스캔 시작... 총 {total}개 PDF", "info")
        self._set_buttons_busy(True)

        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=self._scan_worker, args=(pdf_files,), daemon=True)
        thread.start()

    def _scan_worker(self, pdf_files: list[Path]):
        """백그라운드 스레드: PDF 분류 작업"""
        total = len(pdf_files)
        ar_count = 0
        crs_count = 0
        unknown_count = 0

        for idx, pdf_path in enumerate(pdf_files, 1):
            try:
                meta = classify_and_extract(pdf_path)
                self.scan_results.append(meta)

                if meta.doc_type == "AR":
                    tag = "ar"
                    ar_count += 1
                    display_title = meta.readable_title or pdf_path.name
                    log_msg = f"  [AR]  {pdf_path.name} -> {meta.customer_name} (신뢰도: {meta.confidence:.2f})"
                    log_tag = "ar"
                elif meta.doc_type == "CRS":
                    tag = "crs"
                    crs_count += 1
                    display_title = meta.readable_title or pdf_path.name
                    log_msg = f"  [CRS] {pdf_path.name} -> {meta.customer_name} / {meta.product_name} (신뢰도: {meta.confidence:.2f})"
                    log_tag = "crs"
                else:
                    tag = "unknown"
                    unknown_count += 1
                    display_title = "(분류 불가)"
                    err = meta.error_message or "키워드 미감지"
                    log_msg = f"  [??]  {pdf_path.name} -> {err}"
                    log_tag = "unknown"

                row_values = (pdf_path.name, meta.doc_type, meta.customer_name or "-", display_title)
                row_tag = tag

            except Exception as e:
                unknown_count += 1
                err_meta = PDFMetadata(file_path=pdf_path, error_message=str(e))
                self.scan_results.append(err_meta)
                row_values = (pdf_path.name, "UNKNOWN", "-", f"(에러: {e})")
                row_tag = "unknown"
                log_msg = f"  [ERR] {pdf_path.name} -> {e}"
                log_tag = "error"

            # UI 업데이트를 메인 스레드 큐에 전달
            _idx, _total = idx, total
            _row_values, _row_tag = row_values, row_tag
            _log_msg, _log_tag = log_msg, log_tag
            self._enqueue(lambda rv=_row_values, rt=_row_tag, lm=_log_msg, lt=_log_tag, i=_idx, t=_total: self._scan_update_ui(rv, rt, lm, lt, i, t))

        # 스캔 완료
        _ar, _crs, _unk, _total = ar_count, crs_count, unknown_count, total
        self._enqueue(lambda: self._scan_done(_ar, _crs, _unk, _total))

    def _scan_update_ui(self, row_values, row_tag, log_msg, log_tag, idx, total):
        """메인 스레드: 스캔 중 한 파일 처리 후 UI 업데이트"""
        self.tree.insert("", "end", values=row_values, tags=(row_tag,))
        self._log(log_msg, log_tag)
        self.progress.configure(value=idx)
        self.progress_label.configure(text=f"{idx} / {total}")

    def _scan_done(self, ar_count, crs_count, unknown_count, total):
        """메인 스레드: 스캔 완료 후 처리"""
        self.result_label.configure(text=f"스캔 결과 ({total}개) - AR: {ar_count}, CRS: {crs_count}, 미분류: {unknown_count}")
        self._log(f"스캔 완료 - AR: {ar_count}, CRS: {crs_count}, 미분류: {unknown_count}", "info")
        self._set_buttons_busy(False)
        if ar_count + crs_count > 0:
            self.organize_btn.configure(state="normal")

    # ──────────────────────────────────────────
    # 2단계: 정리 실행 - 백그라운드 스레드
    # ──────────────────────────────────────────

    def _organize_files(self):
        if self._worker_running:
            return
        if not self.scan_results:
            messagebox.showwarning("경고", "먼저 스캔을 실행하세요.")
            return

        ar_count = sum(1 for m in self.scan_results if m.doc_type == "AR")
        crs_count = sum(1 for m in self.scan_results if m.doc_type == "CRS")
        unknown_count = sum(1 for m in self.scan_results if m.doc_type == "UNKNOWN")

        msg = (
            f"다음과 같이 파일을 정리합니다:\n\n"
            f"  AR (Annual Report): {ar_count}개\n"
            f"  CRS (변액리포트): {crs_count}개\n"
            f"  미분류 → UNKNOWN: {unknown_count}개\n\n"
            f"파일이 이동됩니다. 계속하시겠습니까?"
        )
        if not messagebox.askyesno("정리 실행 확인", msg):
            return

        self._set_buttons_busy(True)
        self._log("─" * 50, "info")
        self._log("정리 실행 시작...", "info")

        total = len(self.scan_results)
        self.progress.configure(maximum=total, value=0)

        thread = threading.Thread(target=self._organize_worker, args=(total,), daemon=True)
        thread.start()

    def _organize_worker(self, total: int):
        """백그라운드 스레드: 파일 이동 작업"""
        base = self.input_folder
        success = 0
        fail = 0

        for idx, meta in enumerate(self.scan_results, 1):
            log_msg = ""
            log_tag = "info"
            try:
                src = meta.file_path
                if not src.exists():
                    log_msg = f"  [SKIP] {src.name} - 파일이 존재하지 않음"
                    log_tag = "error"
                    fail += 1
                else:
                    if meta.doc_type == "AR":
                        customer = meta.customer_name or "미확인"
                        target_dir = base / "AR" / customer
                        new_name = meta.new_filename or src.name
                    elif meta.doc_type == "CRS":
                        customer = meta.customer_name or "미확인"
                        target_dir = base / "CRS" / customer
                        new_name = meta.new_filename or src.name
                    else:
                        target_dir = base / "UNKNOWN"
                        new_name = src.name

                    target_dir.mkdir(parents=True, exist_ok=True)
                    target_path = unique_path(target_dir / new_name)
                    shutil.move(str(src), str(target_path))

                    success += 1
                    rel_path = target_path.relative_to(base)
                    log_msg = f"  [OK] {src.name} -> {rel_path}"
                    log_tag = "success"

            except Exception as e:
                fail += 1
                log_msg = f"  [FAIL] {meta.file_path.name} -> {e}"
                log_tag = "error"

            _idx, _total = idx, total
            _log_msg, _log_tag = log_msg, log_tag
            self._enqueue(lambda lm=_log_msg, lt=_log_tag, i=_idx, t=_total: self._organize_update_ui(lm, lt, i, t))

        _success, _fail = success, fail
        self._enqueue(lambda: self._organize_done(_success, _fail))

    def _organize_update_ui(self, log_msg, log_tag, idx, total):
        """메인 스레드: 정리 중 UI 업데이트"""
        if log_msg:
            self._log(log_msg, log_tag)
        self.progress.configure(value=idx)
        self.progress_label.configure(text=f"{idx} / {total}")

    def _organize_done(self, success, fail):
        """메인 스레드: 정리 완료 후 처리"""
        self._log(f"정리 완료 - 성공: {success}, 실패: {fail}", "info")
        self._log("─" * 50, "info")
        self._set_buttons_busy(False)
        self.organize_btn.configure(state="disabled")
        self.scan_btn.configure(state="disabled")
        messagebox.showinfo("정리 완료", f"성공: {success}개\n실패: {fail}개")


# ──────────────────────────────────────────────
# 실행
# ──────────────────────────────────────────────

if __name__ == "__main__":
    app = PDFSorterApp()
    app.mainloop()
