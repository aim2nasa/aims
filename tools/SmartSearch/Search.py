# Search Viewer - GUI 기반 검색 결과 시각화 도구
import requests
import json
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
from io import BytesIO
import os
import subprocess
import platform
from datetime import datetime
import webbrowser

API_URL = "https://tars.giize.com/search_api"

class SearchApp:
    def __init__(self, root):
        self.root = root
        self.version = "0.3.0"
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
        self.data = []  # 검색 결과를 저장할 리스트

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
            self.data = result_data.get("search_results", [])

            # semantic 검색 시 상세 정보 보강
            if self.search_mode.get() == "semantic" and self.data:
                for item in self.data:
                    doc_id = item.get("payload", {}).get("doc_id")
                    if doc_id:
                        detail_data = self.get_mongo_details(doc_id)
                        if detail_data:
                            # MongoDB 상세 정보를 기존 결과에 병합
                            item.update(detail_data)

            self.display_results(result_data)

        except requests.exceptions.RequestException as e:
            messagebox.showerror("오류", f"API 호출 중 오류가 발생했습니다: {e}")
            self.results_text.delete(1.0, tk.END)
            self.results_text.insert(tk.END, "API 호출 실패.")
            self.detail_text.delete(1.0, tk.END)

    def display_ocr_confidence(self,doc):
        confidence = doc.get("ocr", {}).get("confidence", "")
        if confidence:
            self.results_text.insert(tk.END, f"(문자 인식률:{confidence}) ")
    
    def get_full_text(self,doc):
        # 1. meta.full_text 우선 확인 (새로운 스키마)
        full_text = doc.get("meta", {}).get("full_text", "")
        if full_text:
            return full_text

        # 2. ocr.full_text 대안 확인 (기존 스키마)
        full_text = doc.get("ocr", {}).get("full_text", "")
        if full_text:
            return full_text

        # 3. text.full_text 최후 대안 (구 스키마)
        return doc.get("text", {}).get("full_text", "")

    def find_file_path(self, item):
        """다양한 스키마 구조에서 파일 경로를 찾는 함수"""
        # 1. meta.destPath (새로운 스키마)
        if "meta" in item and "destPath" in item["meta"]:
            return item["meta"]["destPath"]

        # 2. destPath (기존 스키마)
        if "destPath" in item:
            return item["destPath"]

        # 3. filename만 있는 경우 (GridFS 구조)
        if "filename" in item:
            filename = item['filename']
            # 이미 전체 경로인 경우
            if filename.startswith("/data/files/"):
                return filename
            # 파일명만 있는 경우 현재 날짜 폴더에 추가
            now = datetime.now()
            return f"/data/files/{now.year:04d}/{now.month:02d}/{filename}"

        # 4. meta.filename이 있는 경우
        if "meta" in item and "filename" in item["meta"]:
            filename = item["meta"]["filename"]
            if filename.startswith("/data/files/"):
                return filename
            now = datetime.now()
            return f"/data/files/{now.year:04d}/{now.month:02d}/{filename}"

        # 5. MongoDB에서 직접 조회
        doc_id = item.get("_id")
        if doc_id:
            detail_doc = self.get_mongo_details(doc_id)
            if detail_doc:
                # meta.destPath 확인
                if "meta" in detail_doc and "destPath" in detail_doc["meta"]:
                    return detail_doc["meta"]["destPath"]
                # destPath 확인
                if "destPath" in detail_doc:
                    return detail_doc["destPath"]
                # filename 확인
                if "filename" in detail_doc:
                    return f"/data/files/{detail_doc['filename']}"

        return ""

    def find_original_name(self, item):
        """다양한 스키마 구조에서 원본 파일명을 찾는 함수"""
        # 1. meta.originalName (새로운 스키마)
        if "meta" in item and "originalName" in item["meta"]:
            return item["meta"]["originalName"]

        # 2. originalName (기존 스키마)
        if "originalName" in item:
            return item["originalName"]

        # 3. filename (GridFS)
        if "filename" in item:
            return item["filename"]

        # 4. meta.filename
        if "meta" in item and "filename" in item["meta"]:
            return item["meta"]["filename"]

        return "downloaded_file"

    def display_results(self, data):
        self.results_text.delete(1.0, tk.END)

        answer = data.get("answer")
        if answer:
            self.results_text.insert(tk.END, f"AI 답변:\n{answer}\n\n", "answer")

        search_results = data.get("search_results", [])

        if not search_results:
            self.results_text.insert(tk.END, "관련 문서를 찾을 수 없습니다.")
        else:
            if data.get("search_mode") == "keyword":
                self.results_text.insert(tk.END, f"총 {len(search_results)}건의 결과가 발견되었습니다.\n\n", "header")
                self.results_text.insert(tk.END, "--- 검색 결과 ---\n\n", "header")
                for i, doc in enumerate(search_results):
                    original_name = doc.get("originalName", "이름 없음")
                    summary = doc.get("ocr", {}).get("summary", "요악 없음")
                    full_text = self.get_full_text(doc)
                    confidence = doc.get("ocr", {}).get("confidence", "")
                    self.results_text.insert(tk.END, f"[{i+1}] {original_name} ", ("doc_title", f"item_{i}"))
                    self.display_ocr_confidence(doc)
                    self.results_text.insert(tk.END, "[다운로드 및 열기]", ("link", f"item_link_{i}"))
                    self.results_text.insert(tk.END, f"\n{summary}\n\n")

                    # 마우스 커서 변경 기능 추가
                    self.results_text.tag_bind(f"item_{i}", "<Enter>", lambda e, tag=f"item_{i}": self.on_enter_title(e, tag))
                    self.results_text.tag_bind(f"item_{i}", "<Leave>", lambda e, tag=f"item_{i}": self.on_leave_title(e, tag))

                    # [다운로드 및 열기] 링크 부분 마우스 커서 변경
                    self.results_text.tag_bind(f"item_link_{i}", "<Enter>", lambda e, tag=f"item_link_{i}": self.on_enter_title(e, tag))
                    self.results_text.tag_bind(f"item_link_{i}", "<Leave>", lambda e, tag=f"item_link_{i}": self.on_leave_title(e, tag))

                    self.results_text.tag_bind(f"item_link_{i}", "<Button-1>", lambda e, idx=i: self.download_and_open_file(idx))

                    def make_callback(idx=i, name=original_name, summ=summary, full=full_text):
                        return lambda e: self.show_detail(idx, name, summ, full)
                    self.results_text.tag_bind(f"item_{i}", "<Button-1>", make_callback())

            else:
                self.results_text.insert(tk.END, f"주어진 검색어와 유사도가 높은 상위 {len(search_results)}개의 문서를 보여드립니다.\n\n", "header")
                for i, doc in enumerate(search_results):
                    summary = doc.get("ocr", {}).get("summary", "요약 없음")
                    full_text = self.get_full_text(doc)
                    confidence = doc.get("ocr", {}).get("confidence", "")
                    payload = doc.get("payload", {})
                    original_name = payload.get("original_name", "이름 없음")
                    preview = payload.get("preview", "미리보기 없음")
                    score = doc.get("score")
                    self.results_text.insert(tk.END, f"[{i+1}] {original_name} ", ("doc_title", f"item_{i}"))
                    self.results_text.insert(tk.END, f"(유사도: {score:.4f},")
                    self.display_ocr_confidence(doc)
                    self.results_text.insert(tk.END, "[다운로드 및 열기]", ("link", f"item_link_{i}"))
                    self.results_text.insert(tk.END, f"\n{summary}\n\n")

                    # 마우스 커서 변경 기능 추가
                    self.results_text.tag_bind(f"item_{i}", "<Enter>", lambda e, tag=f"item_{i}": self.on_enter_title(e, tag))
                    self.results_text.tag_bind(f"item_{i}", "<Leave>", lambda e, tag=f"item_{i}": self.on_leave_title(e, tag))

                    # [다운로드 및 열기] 링크 부분 마우스 커서 변경
                    self.results_text.tag_bind(f"item_link_{i}", "<Enter>", lambda e, tag=f"item_link_{i}": self.on_enter_title(e, tag))
                    self.results_text.tag_bind(f"item_link_{i}", "<Leave>", lambda e, tag=f"item_link_{i}": self.on_leave_title(e, tag))

                    self.results_text.tag_bind(f"item_link_{i}", "<Button-1>", lambda e, idx=i: self.download_and_open_file(idx))

                    def make_callback(idx=i, name=original_name, summ=summary, full=full_text):
                        return lambda e: self.show_detail(idx, name, summ, full)
                    self.results_text.tag_bind(f"item_{i}", "<Button-1>", make_callback())

        self.results_text.tag_config("answer", foreground="blue", font=("Helvetica", 12, "bold"))
        self.results_text.tag_config("header", font=("Helvetica", 12, "bold"))
        self.results_text.tag_config("doc_title", font=("Helvetica", 11, "bold"))
        self.results_text.tag_config("link", foreground="blue", underline=True)

        self.detail_text.delete(1.0, tk.END)
        self.detail_text.insert(tk.END, "상세 영역: 항목 제목을 클릭하면 상세가 표시됩니다.\n[다운로드 및 열기] 링크를 클릭하면 파일이 로컬에 저장되고 바로 열립니다.")

    def get_mongo_details(self,doc_id):
        """
        T12 유틸리티를 호출하여 MongoDB 상세 정보를 가져오는 함수.
        """
        smartsearch_api_url = "https://n8nd.giize.com/webhook/smartsearch"
        payload = {"id": doc_id}
        try:
            response = requests.post(smartsearch_api_url, json=payload, timeout=10)
            response.raise_for_status()
            
            # 결과가 비어있는지 확인
            detail_data = response.json()
            if detail_data and detail_data[0]:
                return detail_data[0]
            else:
                return {}
                
        except requests.exceptions.RequestException as e:
            print(f"상세 정보 조회 오류 (doc_id: {doc_id}): {e}")
            return {}

    def on_enter_title(self, event, tag):
        # 커서를 손가락 모양으로 변경
        self.results_text.config(cursor="hand2")

    def on_leave_title(self, event, tag):
        # 커서를 기본 모양으로 변경
        self.results_text.config(cursor="")

    def show_detail(self, idx, name, summary_or_preview, full_text=None, score=None):
        self.detail_text.delete(1.0, tk.END)
        lines = [f"[{idx+1}] {name}"]
        lines.append("\n--- 전체 텍스트 ---\n" + str(full_text))
        self.detail_text.insert(tk.END, "\n".join(lines))
    
    def download_and_open_file(self, index):
        if not self.data or index >= len(self.data):
            messagebox.showerror("오류", "유효하지 않은 검색 결과입니다.")
            return

        item = self.data[index]

        # 다양한 경로에서 파일 경로 찾기
        dest_path = self.find_file_path(item)
        original_name = self.find_original_name(item)

        print(f"Debug - item keys: {list(item.keys())}")
        print(f"Debug - dest_path: {dest_path}")
        print(f"Debug - original_name: {original_name}")
        if "meta" in item:
            print(f"Debug - meta keys: {list(item['meta'].keys())}")

        if not dest_path:
            # 더 자세한 디버그 정보 출력
            debug_info = f"파일 경로를 찾을 수 없습니다.\n"
            debug_info += f"Item keys: {list(item.keys())}\n"
            if "meta" in item:
                debug_info += f"Meta keys: {list(item['meta'].keys())}\n"
            debug_info += f"Item content: {str(item)[:500]}..."
            messagebox.showerror("오류", debug_info)
            return

        try:
            if dest_path.startswith("/data/files/"):
                # /data를 제거하여 올바른 URL 생성 (/data/files/2025/09/file.pdf → /files/2025/09/file.pdf)
                corrected_path = dest_path.replace("/data", "")
                file_url = f"https://tars.giize.com{corrected_path}"
                
                # 파일 다운로드 및 로컬에 저장
                response = requests.get(file_url, stream=True)
                response.raise_for_status()
                
                # 임시 파일로 저장
                temp_dir = "temp_downloads"
                if not os.path.exists(temp_dir):
                    os.makedirs(temp_dir)
                
                # 파일명이 유효하지 않은 문자를 포함할 경우를 대비해 정리
                safe_filename = "".join(c for c in original_name if c.isalnum() or c in (' ', '.', '_')).strip()
                local_filepath = os.path.join(temp_dir, safe_filename)

                with open(local_filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                # 다운로드된 파일 열기
                self.open_local_file(local_filepath)
                
            else:
                raise ValueError("유효하지 않은 파일 경로입니다.")
        except Exception as e:
            messagebox.showerror("파일 다운로드 및 열기 실패", str(e))

    def open_local_file(self, filepath):
        try:
            # 플랫폼에 따라 다른 명령어를 사용
            if platform.system() == 'Windows':
                os.startfile(filepath)
            elif platform.system() == 'Darwin':  # macOS
                subprocess.run(['open', filepath], check=True)
            else:  # Linux
                subprocess.run(['xdg-open', filepath], check=True)
        except Exception as e:
            messagebox.showerror("파일 열기 실패", f"파일을 여는 중 오류가 발생했습니다: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = SearchApp(root)
    root.mainloop()