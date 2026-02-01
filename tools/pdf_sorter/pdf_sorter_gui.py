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

import json
import shutil
import threading
import queue
from pathlib import Path
from datetime import datetime

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

        self._sort_col: str = ""       # 현재 정렬 컬럼
        self._sort_reverse: bool = False  # 내림차순 여부

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

        columns = ("filename", "type", "customer", "title", "status")
        self.tree = ttk.Treeview(tree_frame, columns=columns, show="headings", height=12)

        # 컬럼 헤딩 텍스트 (정렬 화살표 표시용)
        self._heading_text = {
            "filename": "파일명",
            "type": "유형",
            "customer": "고객명",
            "title": "읽기쉬운 제목 (displayName)",
            "status": "상태",
        }
        for col, text in self._heading_text.items():
            self.tree.heading(col, text=text, command=lambda c=col: self._sort_column(c))

        self.tree.column("filename", width=250, minwidth=150)
        self.tree.column("type", width=50, minwidth=40, anchor="center")
        self.tree.column("customer", width=90, minwidth=60, anchor="center")
        self.tree.column("title", width=350, minwidth=200)
        self.tree.column("status", width=80, minwidth=60, anchor="center")

        # 스크롤바
        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        # Treeview 행 색상 태그
        self.tree.tag_configure("ar", foreground="#0066CC")
        self.tree.tag_configure("crs", foreground="#CC6600")
        self.tree.tag_configure("unknown", foreground="#999999")
        self.tree.tag_configure("name_error", foreground="#CC0000")

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
    # Treeview 컬럼 정렬
    # ──────────────────────────────────────────

    def _sort_column(self, col: str):
        """Treeview 컬럼 클릭 시 정렬 (오름차순/내림차순 토글)"""
        if self._worker_running:
            return

        # 같은 컬럼 재클릭 → 정렬 방향 토글, 다른 컬럼 → 오름차순
        if self._sort_col == col:
            self._sort_reverse = not self._sort_reverse
        else:
            self._sort_col = col
            self._sort_reverse = False

        # 현재 행 데이터 수집
        items = [(self.tree.set(iid, col), iid) for iid in self.tree.get_children("")]

        # 정렬 (대소문자 무시)
        items.sort(key=lambda t: t[0].lower(), reverse=self._sort_reverse)

        # 정렬된 순서로 재배치
        for idx, (_val, iid) in enumerate(items):
            self.tree.move(iid, "", idx)

        # 헤딩 텍스트에 정렬 방향 화살표 표시
        arrow = " \u25bc" if self._sort_reverse else " \u25b2"
        for c, text in self._heading_text.items():
            if c == col:
                self.tree.heading(c, text=text + arrow)
            else:
                self.tree.heading(c, text=text)

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
        error_count = 0

        for idx, pdf_path in enumerate(pdf_files, 1):
            try:
                meta = classify_and_extract(pdf_path)
                self.scan_results.append(meta)

                # error_message가 있으면 무조건 ERROR (추출 실패, fallback 없음)
                if meta.error_message:
                    tag = "name_error"
                    error_count += 1
                    status = "오류"
                    display_title = f"({meta.error_message})"
                    log_msg = f"  [ERR] {pdf_path.name} -> {meta.error_message} ({meta.doc_type})"
                    log_tag = "error"
                elif meta.doc_type == "AR":
                    tag = "ar"
                    ar_count += 1
                    status = "OK"
                    display_title = meta.readable_title
                    log_msg = f"  [AR]  {pdf_path.name} -> {meta.customer_name} (신뢰도: {meta.confidence:.2f})"
                    log_tag = "ar"
                elif meta.doc_type == "CRS":
                    tag = "crs"
                    crs_count += 1
                    status = "OK"
                    display_title = meta.readable_title
                    log_msg = f"  [CRS] {pdf_path.name} -> {meta.customer_name} / {meta.product_name} (신뢰도: {meta.confidence:.2f})"
                    log_tag = "crs"
                else:
                    tag = "unknown"
                    unknown_count += 1
                    status = "오류"
                    display_title = "(분류 불가)"
                    log_msg = f"  [??]  {pdf_path.name} -> AR/CRS 키워드 미감지"
                    log_tag = "unknown"

                row_values = (pdf_path.name, meta.doc_type, meta.customer_name or "-", display_title, status)
                row_tag = tag

            except Exception as e:
                error_count += 1
                err_meta = PDFMetadata(file_path=pdf_path, error_message=str(e))
                self.scan_results.append(err_meta)
                row_values = (pdf_path.name, "UNKNOWN", "-", f"(에러: {e})", "오류")
                row_tag = "name_error"
                log_msg = f"  [ERR] {pdf_path.name} -> {e}"
                log_tag = "error"

            # UI 업데이트를 메인 스레드 큐에 전달
            _idx, _total = idx, total
            _row_values, _row_tag = row_values, row_tag
            _log_msg, _log_tag = log_msg, log_tag
            self._enqueue(lambda rv=_row_values, rt=_row_tag, lm=_log_msg, lt=_log_tag, i=_idx, t=_total: self._scan_update_ui(rv, rt, lm, lt, i, t))

        # 스캔 완료
        _ar, _crs, _unk, _err, _total = ar_count, crs_count, unknown_count, error_count, total
        self._enqueue(lambda: self._scan_done(_ar, _crs, _unk, _err, _total))

    def _scan_update_ui(self, row_values, row_tag, log_msg, log_tag, idx, total):
        """메인 스레드: 스캔 중 한 파일 처리 후 UI 업데이트"""
        item = self.tree.insert("", "end", values=row_values, tags=(row_tag,))
        self.tree.see(item)
        self._log(log_msg, log_tag)
        self.progress.configure(value=idx)
        self.progress_label.configure(text=f"{idx} / {total}")

    def _scan_done(self, ar_count, crs_count, unknown_count, error_count, total):
        """메인 스레드: 스캔 완료 후 처리"""
        parts = [f"AR: {ar_count}", f"CRS: {crs_count}"]
        if error_count:
            parts.append(f"오류: {error_count}")
        if unknown_count:
            parts.append(f"미분류: {unknown_count}")
        summary = ", ".join(parts)
        self.result_label.configure(text=f"스캔 결과 ({total}개) - {summary}")
        self._log(f"스캔 완료 - {summary}", "info")
        self._set_buttons_busy(False)
        if ar_count + crs_count > 0:
            self.organize_btn.configure(state="normal")

        # 오류 파일이 있으면 별도 창으로 표시
        if error_count > 0:
            self._show_error_files()

    # ──────────────────────────────────────────
    # 오류 파일 목록 창
    # ──────────────────────────────────────────

    def _show_error_files(self):
        """오류 파일 목록을 별도 창으로 표시 (파일명 복사 가능)"""
        error_items = [m for m in self.scan_results if m.error_message]
        if not error_items:
            return

        win = tk.Toplevel(self)
        win.title(f"오류 파일 목록 ({len(error_items)}개)")
        win.geometry("700x400")
        win.transient(self)

        frame = ttk.Frame(win, padding=8)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text=f"오류 파일: {len(error_items)}개 (우클릭 → 파일명 복사)").pack(anchor="w", pady=(0, 4))

        # Treeview
        tree_frame = ttk.Frame(frame)
        tree_frame.pack(fill="both", expand=True)

        cols = ("filename", "type", "error")
        tree = ttk.Treeview(tree_frame, columns=cols, show="headings", height=15)
        tree.heading("filename", text="파일명")
        tree.heading("type", text="유형")
        tree.heading("error", text="오류 사유")
        tree.column("filename", width=320, minwidth=200)
        tree.column("type", width=60, minwidth=50, anchor="center")
        tree.column("error", width=250, minwidth=150)

        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        for meta in error_items:
            tree.insert("", "end", values=(meta.file_path.name, meta.doc_type, meta.error_message))

        # 우클릭 → 파일명 복사
        def _copy_filename(event):
            sel = tree.selection()
            if sel:
                fname = tree.set(sel[0], "filename")
                win.clipboard_clear()
                win.clipboard_append(fname)

        ctx_menu = tk.Menu(win, tearoff=0)
        ctx_menu.add_command(label="파일명 복사", command=lambda: _copy_filename(None))

        def _show_context(event):
            row = tree.identify_row(event.y)
            if row:
                tree.selection_set(row)
                ctx_menu.tk_popup(event.x_root, event.y_root)

        tree.bind("<Button-3>", _show_context)

        # 하단 버튼
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill="x", pady=(8, 0))

        def _copy_all():
            names = "\n".join(m.file_path.name for m in error_items)
            win.clipboard_clear()
            win.clipboard_append(names)
            self._log(f"오류 파일명 {len(error_items)}개 클립보드 복사 완료", "info")

        ttk.Button(btn_frame, text="전체 파일명 복사", command=_copy_all).pack(side="left")
        ttk.Button(btn_frame, text="닫기", command=win.destroy).pack(side="right")

    # ──────────────────────────────────────────
    # 2단계: 정리 실행 - 백그라운드 스레드
    # ──────────────────────────────────────────

    def _organize_files(self):
        if self._worker_running:
            return
        if not self.scan_results:
            messagebox.showwarning("경고", "먼저 스캔을 실행하세요.")
            return

        ar_count = sum(1 for m in self.scan_results if m.doc_type == "AR" and not m.error_message)
        crs_count = sum(1 for m in self.scan_results if m.doc_type == "CRS" and not m.error_message)
        error_count = sum(1 for m in self.scan_results if m.error_message)
        unknown_count = sum(1 for m in self.scan_results if m.doc_type == "UNKNOWN" and not m.error_message)

        msg = (
            f"다음과 같이 파일을 정리합니다:\n\n"
            f"  AR (Annual Report): {ar_count}개\n"
            f"  CRS (변액리포트): {crs_count}개\n"
        )
        if error_count:
            msg += f"  오류 (추출 실패) → ERROR: {error_count}개\n"
        if unknown_count:
            msg += f"  미분류 → UNKNOWN: {unknown_count}개\n"
        msg += f"\n파일이 복사됩니다 (원본 유지). 계속하시겠습니까?"
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
        """백그라운드 스레드: 파일 복사 작업 (원본 유지) + 매핑 JSON 생성"""
        base = self.input_folder
        success = 0
        fail = 0
        mapping = []  # 원본 → displayName 매핑 기록

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
                    if meta.error_message:
                        # 추출 실패 → ERROR 폴더, 원본 파일명 유지
                        target_dir = base / "ERROR"
                        new_name = src.name
                    elif meta.doc_type == "AR":
                        target_dir = base / "AR" / meta.customer_name
                        new_name = meta.new_filename
                    elif meta.doc_type == "CRS":
                        target_dir = base / "CRS" / meta.customer_name
                        new_name = meta.new_filename
                    else:
                        target_dir = base / "UNKNOWN"
                        new_name = src.name

                    target_dir.mkdir(parents=True, exist_ok=True)
                    target_path = unique_path(target_dir / new_name)
                    shutil.copy2(str(src), str(target_path))

                    success += 1
                    rel_path = str(target_path.relative_to(base))
                    log_msg = f"  [OK] {src.name} -> {rel_path}"
                    log_tag = "success"

                    # 매핑 기록
                    entry = {
                        "original": src.name,
                        "displayName": target_path.name,
                        "path": rel_path,
                        "type": meta.doc_type,
                        "customer": meta.customer_name,
                        "issueDate": meta.issue_date,
                    }
                    if meta.product_name:
                        entry["product"] = meta.product_name
                    mapping.append(entry)

            except Exception as e:
                fail += 1
                log_msg = f"  [FAIL] {meta.file_path.name} -> {e}"
                log_tag = "error"

            _idx, _total = idx, total
            _log_msg, _log_tag = log_msg, log_tag
            self._enqueue(lambda lm=_log_msg, lt=_log_tag, i=_idx, t=_total: self._organize_update_ui(lm, lt, i, t))

        # 매핑 JSON 저장
        if mapping:
            mapping_data = {
                "created": datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                "sourceFolder": str(base),
                "totalFiles": total,
                "success": success,
                "fail": fail,
                "files": mapping,
            }
            json_path = base / "file_mapping.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(mapping_data, f, ensure_ascii=False, indent=2)
            self._enqueue(lambda: self._log(f"  매핑 파일 생성: {json_path.name}", "info"))

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
