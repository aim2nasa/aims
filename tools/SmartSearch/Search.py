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

API_URL = "https://tars.giize.com/search_api"

class SearchApp:
    def __init__(self, root):
        self.root = root
        self.version = "0.1.1"
        self.root.title(f"Search Viewer v{self.version}")
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
        self.query_entry.focus_set()

        # 검색 모드 선택 (semantic/keyword) 및 keyword 모드 세부 설정 (AND/OR)
        self.search_mode = tk.StringVar(value="semantic")
        self.keyword_mode = tk.StringVar(value="OR")

        tk.Label(self.query_frame, text="검색 모드:").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Radiobutton(self.query_frame, text="시맨틱 검색", variable=self.search_mode, value="semantic").pack(side=tk.LEFT, padx=5)
        ttk.Radiobutton(self.query_frame, text="키워드 검색", variable=self.search_mode, value="keyword").pack(side=tk.LEFT)

        self.keyword_mode_frame = tk.Frame(self.query_frame)
        ttk.Radiobutton(self.keyword_mode_frame, text="AND", variable=self.keyword_mode, value="AND").pack(side=tk.LEFT)
        ttk.Radiobutton(self.keyword_mode_frame, text="OR", variable=self.keyword_mode, value="OR").pack(side=tk.LEFT)

        # 검색 버튼은 항상 가장 우측에 위치
        self.search_button = ttk.Button(self.query_frame, text="검색", command=self.search)
        self.search_button.pack(side=tk.RIGHT, padx=5)

        # 검색 모드 선택에 따라 키워드 모드 버튼을 보이거나 숨김
        self.search_mode.trace_add('write', self.toggle_keyword_mode_buttons)
        self.toggle_keyword_mode_buttons()

        # 결과/상세 영역: 수직 분할(50:50)
        self.results_container = ttk.Panedwindow(root, orient=tk.VERTICAL)
        self.results_container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 상단: 검색 결과 패널
        self.top_frame = ttk.Frame(self.results_container)
        self.results_text = tk.Text(self.top_frame, wrap=tk.WORD)
        self.results_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.results_scrollbar = ttk.Scrollbar(self.top_frame, orient=tk.VERTICAL, command=self.results_text.yview)
        self.results_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.results_text.config(yscrollcommand=self.results_scrollbar.set)

        # 하단: 상세 보기 패널
        self.bottom_frame = ttk.Frame(self.results_container)
        self.detail_text = tk.Text(self.bottom_frame, wrap=tk.WORD, bg="#f7f7f7")
        self.detail_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.detail_scrollbar = ttk.Scrollbar(self.bottom_frame, orient=tk.VERTICAL, command=self.detail_text.yview)
        self.detail_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.detail_text.config(yscrollcommand=self.detail_scrollbar.set)

        # 분할창에 프레임 추가 및 초기 비율 설정
        self.results_container.add(self.top_frame, weight=1)
        self.results_container.add(self.bottom_frame, weight=1)

    def toggle_keyword_mode_buttons(self, *args):
        if self.search_mode.get() == "keyword":
            self.keyword_mode_frame.pack(side=tk.LEFT, padx=5)
        else:
            self.keyword_mode_frame.pack_forget()

    def search(self):
        query = self.query_entry.get()
        if not query:
            messagebox.showinfo("알림", "검색어를 입력해 주세요.")
            return

        self.results_text.delete(1.0, tk.END)
        self.results_text.insert(tk.END, "검색 중입니다. 잠시만 기다려 주세요...\n")
        self.detail_text.delete(1.0, tk.END)
        self.detail_text.insert(tk.END, "상세 영역: 항목을 선택하면 여기 표시됩니다.")
        self.root.update_idletasks()

        try:
            payload = {
                "query": query,
                "search_mode": self.search_mode.get()
            }
            if self.search_mode.get() == "keyword":
                payload["mode"] = self.keyword_mode.get()

            response = requests.post(API_URL, json=payload, timeout=30)
            response.raise_for_status()
            result_data = response.json()

            self.display_results(result_data)

        except requests.exceptions.RequestException as e:
            messagebox.showerror("오류", f"API 호출 중 오류가 발생했습니다: {e}")
            self.results_text.delete(1.0, tk.END)
            self.results_text.insert(tk.END, "API 호출 실패.")
            self.detail_text.delete(1.0, tk.END)

    def display_results(self, data):
        self.results_text.delete(1.0, tk.END)

        answer = data.get("answer")
        if answer:
            self.results_text.insert(tk.END, f"AI 답변:\n{answer}\n\n", "answer")

        search_results = data.get("search_results", [])
        self.results_text.insert(tk.END, f"총 {len(search_results)}건의 결과가 발견되었습니다.\n\n", "header")

        if not search_results:
            self.results_text.insert(tk.END, "관련 문서를 찾을 수 없습니다.")
        else:
            self.results_text.insert(tk.END, "--- 검색 결과 ---\n\n", "header")
            if data.get("search_mode") == "keyword":
                for i, doc in enumerate(search_results):
                    original_name = doc.get("originalName", "이름 없음")
                    summary = doc.get("ocr", {}).get("summary", "내용 없음")
                    full_text = doc.get("ocr", {}).get("full_text", "")
                    self.results_text.insert(tk.END, f"[{i+1}] {original_name}\n", ("doc_title", f"item_{i}"))
                    self.results_text.insert(tk.END, f"{summary}\n\n")

                    # 각 항목에 상세 보기용 바인딩(요약 클릭 시 detail_text로 풀텍스트/요약 표시)
                    start_index = f"{float(self.results_text.index('end')) - 2.0} linestart"
                    # 간단: 제목 라인 클릭 시 상세 표시
                    def make_callback(idx=i, name=original_name, summ=summary, full=full_text):
                        return lambda e: self.show_detail(idx, name, summ, full)
                    self.results_text.tag_bind(f"item_{i}", "<Button-1>", make_callback())
            else:
                for i, doc in enumerate(search_results):
                    payload = doc.get("payload", {})
                    original_name = payload.get("original_name", "이름 없음")
                    preview = payload.get("preview", "미리보기 없음")
                    score = doc.get("score")
                    self.results_text.insert(tk.END, f"[{i+1}] {original_name} (유사도: {score:.4f})\n", ("doc_title", f"item_{i}"))
                    self.results_text.insert(tk.END, f"{preview}\n\n")
                    def make_callback(idx=i, name=original_name, prev=preview, sc=score):
                        return lambda e: self.show_detail(idx, name, prev, None, sc)
                    self.results_text.tag_bind(f"item_{i}", "<Button-1>", make_callback())

        self.results_text.tag_config("answer", foreground="blue", font=("Helvetica", 12, "bold"))
        self.results_text.tag_config("header", font=("Helvetica", 12, "bold"))
        self.results_text.tag_config("doc_title", font=("Helvetica", 11, "bold"))

        # 상세 영역 초기화 메시지
        self.detail_text.delete(1.0, tk.END)
        self.detail_text.insert(tk.END, "상세 영역: 항목 제목을 클릭하면 상세가 표시됩니다.")

    def show_detail(self, idx, name, summary_or_preview, full_text=None, score=None):
        self.detail_text.delete(1.0, tk.END)
        lines = [f"[{idx+1}] {name}"]
        if score is not None:
            lines.append(f"유사도 점수: {score:.4f}")
        if summary_or_preview:
            lines.append("\n--- 요약/미리보기 ---\n" + str(summary_or_preview))
        if full_text:
            lines.append("\n--- 전체 텍스트 ---\n" + str(full_text))
        self.detail_text.insert(tk.END, "\n".join(lines))

if __name__ == "__main__":
    root = tk.Tk()
    app = SearchApp(root)
    root.mainloop()
