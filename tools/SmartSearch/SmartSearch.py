# SmartSearch Viewer - GUI 기반 검색 결과 시각화 도구
import requests
import json
import tkinter as tk
from tkinter import ttk, messagebox

API_URL = "https://n8nd.giize.com/webhook/smartsearch"

class SmartSearchApp:
    def __init__(self, root):
        self.root = root
        self.version = "0.1.1"
        self.root.title(f"SmartSearch Viewer v{self.version}")  # 프로그램 제목
        self.root.geometry("1000x600")
        self.root.minsize(800, 400)
        self.root.resizable(True, True)

        # 상단 검색바 영역
        self.query_frame = tk.Frame(root)
        self.query_frame.pack(fill=tk.X, pady=5, padx=5)

        tk.Label(self.query_frame, text="검색어:").pack(side=tk.LEFT)
        self.query_entry = tk.Entry(self.query_frame, width=50)
        self.query_entry.pack(side=tk.LEFT, padx=5)
        tk.Button(self.query_frame, text="검색", command=self.search).pack(side=tk.LEFT)
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
        # Text 위젯과 스크롤바를 프레임에 배치
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

        try:
            response = requests.post(API_URL, json={"query": query})
            response.raise_for_status()
        except Exception as e:
            messagebox.showerror("오류", f"검색 요청 중 오류 발생: {e}")
            return

        # 서버 응답 처리
        raw = response.text
        if not raw:
            messagebox.showerror("오류", "검색 결과가 없습니다. 서버에서 응답을 받지 못했습니다.")
            return
        try:
            self.data = response.json()
        except json.JSONDecodeError:
            messagebox.showerror("파싱 오류", f"응답 JSON 파싱 실패:
{raw}")
            return

        self.populate_table()

    def populate_table(self):
        self.result_count_label.config(text=f"검색 결과: {len(self.data)}건")
        for row in self.result_tree.get_children():
            self.result_tree.delete(row)

        for item in self.data:
            filename = item.get("originalName", "(이름 없음)")
            summary = item.get("ocr", {}).get("summary", "(요약 없음)")
            self.result_tree.insert("", "end", values=(filename, summary))

    def show_details(self, event):
        selected = self.result_tree.selection()
        if not selected:
            return
        index = self.result_tree.index(selected[0])
        full_text = self.data[index].get("ocr", {}).get("full_text", "(내용 없음)")
        self.detail_text.delete("1.0", tk.END)
        self.detail_text.insert(tk.END, full_text)

if __name__ == "__main__":
    root = tk.Tk()
    app = SmartSearchApp(root)
    root.mainloop()
