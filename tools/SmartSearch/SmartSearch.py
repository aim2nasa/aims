# SmartSearch Viewer - GUI 기반 검색 결과 시각화 도구
import requests
import json
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
from io import BytesIO
import os
import subprocess
import platform
import webbrowser

API_URL = "https://n8nd.giize.com/webhook/smartsearch"

class SmartSearchApp:
    def __init__(self, root):
        self.root = root
        self.version = "0.1.4"
        self.root.title(f"SmartSearch Viewer v{self.version}")
        self.root.geometry("1000x600")
        self.root.minsize(800, 400)
        self.root.resizable(True, True)

        # 상단 검색바 영역
        self.query_frame = tk.Frame(root)
        self.query_frame.pack(fill=tk.X, pady=5, padx=5)

        tk.Label(self.query_frame, text="검색어:").pack(side=tk.LEFT)
        self.query_entry = tk.Entry(self.query_frame, width=40)
        self.query_entry.pack(side=tk.LEFT, padx=5)
        self.query_entry.bind("<Return>", lambda event: self.search())
        self.query_entry.focus_set()  # 실행 시 포커스 설정

        # 검색 모드 선택 (OR/AND)
        tk.Label(self.query_frame, text="모드:").pack(side=tk.LEFT, padx=(10,0))
        self.mode_var = tk.StringVar(value="OR")
        tk.Radiobutton(self.query_frame, text="OR", variable=self.mode_var, value="OR").pack(side=tk.LEFT)
        tk.Radiobutton(self.query_frame, text="AND", variable=self.mode_var, value="AND").pack(side=tk.LEFT)

        tk.Button(self.query_frame, text="검색", command=self.search).pack(side=tk.LEFT, padx=(10,0))
        self.result_count_label = tk.Label(self.query_frame, text="")
        self.result_count_label.pack(side=tk.LEFT, padx=10)

        # 전체 분할창 (상단: 결과 테이블, 하단: 상세 텍스트)
        self.paned = tk.PanedWindow(self.root, orient=tk.VERTICAL, sashrelief=tk.RAISED, sashwidth=8)
        self.paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 상단 패널: 결과 테이블
        self.result_tree_frame = tk.Frame(self.paned)
        self.result_tree = ttk.Treeview(
            self.result_tree_frame,
            columns=("filename", "summary"),
            show="headings"
        )
        self.result_tree.heading("filename", text="파일명")
        self.result_tree.heading("summary", text="요약")
        self.result_tree.column("filename", width=300)
        self.result_tree.column("summary", width=660)
        self.result_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.result_tree_scroll = tk.Scrollbar(
            self.result_tree_frame,
            orient=tk.VERTICAL,
            command=self.result_tree.yview
        )
        self.result_tree_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.result_tree.configure(yscrollcommand=self.result_tree_scroll.set)

        self.paned.add(self.result_tree_frame)

        # 하단 패널: 상세 텍스트 + 스크롤바
        self.detail_frame = tk.Frame(self.paned)
        self.detail_text = tk.Text(self.detail_frame, wrap=tk.WORD)
        self.detail_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.detail_scroll = tk.Scrollbar(
            self.detail_frame,
            orient=tk.VERTICAL,
            command=self.detail_text.yview
        )
        self.detail_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.detail_text.configure(yscrollcommand=self.detail_scroll.set)

        self.paned.add(self.detail_frame)

        # 이벤트 바인딩
        self.result_tree.bind("<Double-1>", self.show_details)
        self.data = []

    def search(self):
        query = self.query_entry.get().strip()
        if not query:
            messagebox.showwarning("입력 오류", "검색어를 입력해주세요.")
            return

        mode = self.mode_var.get().upper()
        payload = {"query": query, "mode": mode}

        try:
            response = requests.post(API_URL, json=payload)
            response.raise_for_status()
            self.data = response.json()
            self.populate_table()
        except Exception as e:
            messagebox.showerror("오류", f"검색 중 오류 발생: {e}")

    def populate_table(self):
        # API가 [{}]를 반환하면 '검색 결과 없음'으로 처리
        if len(self.data) == 1 and isinstance(self.data[0], dict) and not self.data[0]:
            self.result_count_label.config(text="검색 결과: 0건")
            # 테이블 초기화
            for row in self.result_tree.get_children():
                self.result_tree.delete(row)
            # 빈 행 하나 추가
            self.result_tree.insert("", "end", values=("", ""))
            # 상세 텍스트 창 비우기
            self.detail_text.delete("1.0", tk.END)
            return

        count = len(self.data)
        self.result_count_label.config(text=f"검색 결과: {count}건")
        # 테이블 초기화
        for row in self.result_tree.get_children():
            self.result_tree.delete(row)

        for item in self.data:
            filename = item.get("originalName", "")
            summary = item.get("ocr", {}).get("summary", "")
            self.result_tree.insert("", "end", values=(filename, summary))

        # 검색 후 상세창 클리어
        self.detail_text.delete("1.0", tk.END)

    def show_details(self, event):
        selected = self.result_tree.selection()
        if not selected:
            return
        index = self.result_tree.index(selected[0])
        full_text = self.data[index].get("ocr", {}).get("full_text", "")
        self.detail_text.delete("1.0", tk.END)
        self.detail_text.insert(tk.END, full_text)
        item = self.data[index]

        # 이미지 파일 검사
        mime = item.get("meta", {}).get("mime", "")
        dest_path = item.get("destPath", "")  # ✅ 항상 정의되도록 이동
        if mime.startswith("image/"):
            if dest_path.startswith("/data/files/"):
                relative_path = dest_path.replace("/data/files/", "")
                image_url = f"https://tars.giize.com/files/{relative_path}"
                self.show_image_window(image_url)

        if mime == "application/pdf":
            self.open_external_pdf(dest_path)

    def show_image_window(self, url):
        win = tk.Toplevel()
        win.title("이미지 미리보기")

        try:
            response = requests.get(url)
            response.raise_for_status()
            img_data = response.content
            image = Image.open(BytesIO(img_data))
            photo = ImageTk.PhotoImage(image)

            # 스크롤 가능한 캔버스 생성
            canvas = tk.Canvas(win, width=min(photo.width(), 1000), height=min(photo.height(), 800))
            h_scroll = tk.Scrollbar(win, orient=tk.HORIZONTAL, command=canvas.xview)
            v_scroll = tk.Scrollbar(win, orient=tk.VERTICAL, command=canvas.yview)
            canvas.configure(xscrollcommand=h_scroll.set, yscrollcommand=v_scroll.set)

            h_scroll.pack(side=tk.BOTTOM, fill=tk.X)
            v_scroll.pack(side=tk.RIGHT, fill=tk.Y)
            canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

            # 이미지 추가
            canvas.image = photo  # 참조 유지
            canvas.create_image(0, 0, image=photo, anchor="nw")
            canvas.config(scrollregion=(0, 0, photo.width(), photo.height()))

            # 마우스 휠로 스크롤
            def _on_mousewheel(event):
                canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
            def _on_shift_mousewheel(event):
                canvas.xview_scroll(int(-1 * (event.delta / 120)), "units")

            canvas.bind_all("<MouseWheel>", _on_mousewheel)
            canvas.bind_all("<Shift-MouseWheel>", _on_shift_mousewheel)

        except Exception as e:
            messagebox.showerror("이미지 로드 실패", str(e))

    def open_external_pdf(self, path):
        try:
            if path.startswith("/data/files/"):
                relative_path = path.replace("/data/files/", "")
                pdf_url = f"https://tars.giize.com/files/{relative_path}"
                webbrowser.open(pdf_url)
            else:
                raise ValueError("유효하지 않은 파일 경로입니다.")
        except Exception as e:
            messagebox.showerror("PDF 열기 실패", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = SmartSearchApp(root)
    root.mainloop()
