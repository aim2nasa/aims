"""
pymupdf4llm PDF 파서 GUI
"""

import os
import threading
import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext, messagebox

import pymupdf
import pymupdf4llm


class PdfParserApp:
    def __init__(self, root):
        self.root = root
        self.root.title("pymupdf4llm 테스트용 GUI v0.1.0")
        self.root.geometry("1000x700")
        self.root.minsize(800, 500)
        self.pdf_path = None

        self._build_ui()

    def _build_ui(self):
        # 상단: 파일 선택
        top = ttk.Frame(self.root, padding=10)
        top.pack(fill=tk.X)

        self.path_var = tk.StringVar(value="PDF 파일을 선택하세요")
        ttk.Entry(top, textvariable=self.path_var, state="readonly").pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        ttk.Button(top, text="파일 선택", command=self._select_file).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(top, text="폴더 열기", command=self._select_folder).pack(side=tk.LEFT)

        # 중단: 모드 선택 + 실행
        mid = ttk.Frame(self.root, padding=(10, 0, 10, 5))
        mid.pack(fill=tk.X)

        ttk.Label(mid, text="모드:").pack(side=tk.LEFT)
        self.mode_var = tk.StringVar(value="markdown")
        modes = [("Markdown", "markdown"), ("페이지별", "pages"), ("테이블", "tables"), ("이미지 추출", "images")]
        for label, val in modes:
            ttk.Radiobutton(mid, text=label, variable=self.mode_var, value=val).pack(side=tk.LEFT, padx=5)

        ttk.Button(mid, text="파싱 실행", command=self._run_parse).pack(side=tk.RIGHT, padx=(10, 0))
        ttk.Button(mid, text="결과 저장", command=self._save_result).pack(side=tk.RIGHT)
        ttk.Button(mid, text="복사", command=self._copy_result).pack(side=tk.RIGHT, padx=(0, 5))

        # 상태바
        self.status_var = tk.StringVar(value="대기 중")
        ttk.Label(self.root, textvariable=self.status_var, relief=tk.SUNKEN, padding=3).pack(fill=tk.X, side=tk.BOTTOM)

        # 프로그레스바
        self.progress = ttk.Progressbar(self.root, mode="indeterminate")
        self.progress.pack(fill=tk.X, padx=10, side=tk.BOTTOM, pady=(0, 2))

        # 메인: 좌측 파일목록 + 우측 결과
        paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # 좌측: 파일 리스트
        left = ttk.LabelFrame(paned, text="PDF 파일 목록", padding=5)
        paned.add(left, weight=1)

        self.file_list = tk.Listbox(left, selectmode=tk.SINGLE)
        self.file_list.pack(fill=tk.BOTH, expand=True)
        self.file_list.bind("<<ListboxSelect>>", self._on_file_select)

        # 우측: 결과
        right = ttk.LabelFrame(paned, text="파싱 결과", padding=5)
        paned.add(right, weight=3)

        self.result_text = scrolledtext.ScrolledText(right, wrap=tk.WORD, font=("Consolas", 10))
        self.result_text.pack(fill=tk.BOTH, expand=True)

    def _select_file(self):
        path = filedialog.askopenfilename(
            filetypes=[("PDF 파일", "*.pdf"), ("모든 파일", "*.*")]
        )
        if path:
            self.pdf_path = path
            self.path_var.set(path)
            self.file_list.delete(0, tk.END)
            self.file_list.insert(0, os.path.basename(path))
            self.file_list.selection_set(0)
            self.status_var.set(f"파일 선택됨: {os.path.basename(path)}")

    def _select_folder(self):
        folder = filedialog.askdirectory()
        if folder:
            self.path_var.set(folder)
            self.file_list.delete(0, tk.END)
            pdf_files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".pdf"))
            if not pdf_files:
                self.status_var.set("PDF 파일이 없습니다.")
                return
            for f in pdf_files:
                self.file_list.insert(tk.END, f)
            self.file_list.selection_set(0)
            self.pdf_path = os.path.join(folder, pdf_files[0])
            self.status_var.set(f"{len(pdf_files)}개 PDF 발견")

    def _on_file_select(self, event):
        sel = self.file_list.curselection()
        if not sel:
            return
        filename = self.file_list.get(sel[0])
        base = self.path_var.get()
        if os.path.isdir(base):
            self.pdf_path = os.path.join(base, filename)
        else:
            self.pdf_path = base
        self.status_var.set(f"선택: {filename}")

    def _run_parse(self):
        if not self.pdf_path or not os.path.isfile(self.pdf_path):
            messagebox.showwarning("경고", "PDF 파일을 선택하세요.")
            return

        mode = self.mode_var.get()
        self.result_text.delete("1.0", tk.END)
        self.progress.start()
        self.status_var.set(f"파싱 중... ({mode})")

        thread = threading.Thread(target=self._parse_worker, args=(self.pdf_path, mode), daemon=True)
        thread.start()

    def _parse_worker(self, pdf_path, mode):
        try:
            if mode == "markdown":
                result = pymupdf4llm.to_markdown(pdf_path)
            elif mode == "pages":
                pages = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
                parts = []
                for p in pages:
                    page_num = p.get("metadata", {}).get("page", "?")
                    parts.append(f"{'='*60}\n 페이지 {page_num}\n{'='*60}\n{p.get('text', '')}")
                result = "\n\n".join(parts)
            elif mode == "tables":
                result = self._extract_tables(pdf_path)
            elif mode == "images":
                result = self._extract_images(pdf_path)
            else:
                result = "알 수 없는 모드"

            self.root.after(0, self._show_result, result)
        except Exception as e:
            self.root.after(0, self._show_error, str(e))

    def _extract_tables(self, pdf_path):
        doc = pymupdf.open(pdf_path)
        lines = []
        for page_num, page in enumerate(doc):
            tab = page.find_tables()
            for i, table in enumerate(tab.tables):
                lines.append(f"[페이지 {page_num + 1} - 테이블 {i + 1}]")
                data = table.extract()
                if data:
                    # 헤더
                    header = data[0]
                    lines.append(" | ".join(str(c) if c else "" for c in header))
                    lines.append("-" * 60)
                    for row in data[1:]:
                        lines.append(" | ".join(str(c) if c else "" for c in row))
                lines.append("")
        doc.close()
        return "\n".join(lines) if lines else "테이블이 없습니다."

    def _extract_images(self, pdf_path):
        output_dir = os.path.join(os.path.dirname(pdf_path), "extracted_images")
        os.makedirs(output_dir, exist_ok=True)
        doc = pymupdf.open(pdf_path)
        lines = [f"이미지 저장 경로: {output_dir}\n"]
        count = 0
        for page_num, page in enumerate(doc):
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                base_image = doc.extract_image(xref)
                ext = base_image["ext"]
                filename = f"page{page_num + 1}_img{img_index + 1}.{ext}"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(base_image["image"])
                w = base_image.get("width", "?")
                h = base_image.get("height", "?")
                size = len(base_image["image"])
                lines.append(f"  {filename}  ({w}x{h}, {size:,} bytes)")
                count += 1
        doc.close()
        if count == 0:
            return "이미지가 없습니다."
        lines.insert(1, f"총 {count}개 이미지 추출\n")
        return "\n".join(lines)

    def _show_result(self, text):
        self.progress.stop()
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", text)
        self.status_var.set(f"완료 - {len(text):,} 글자")

    def _show_error(self, msg):
        self.progress.stop()
        self.status_var.set("오류 발생")
        messagebox.showerror("오류", msg)

    def _copy_result(self):
        text = self.result_text.get("1.0", tk.END).strip()
        if text:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.status_var.set("클립보드에 복사됨")

    def _save_result(self):
        text = self.result_text.get("1.0", tk.END).strip()
        if not text:
            messagebox.showinfo("알림", "저장할 내용이 없습니다.")
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".md",
            filetypes=[("Markdown", "*.md"), ("텍스트", "*.txt"), ("모든 파일", "*.*")]
        )
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            self.status_var.set(f"저장됨: {path}")


if __name__ == "__main__":
    root = tk.Tk()
    app = PdfParserApp(root)
    root.mainloop()
