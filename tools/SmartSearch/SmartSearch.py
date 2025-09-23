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
        self.version = "0.2.0"
        self.root.title(f"SmartSearch Viewer v{self.version}")
        self.root.geometry("1000x600")
        self.root.minsize(800, 400)
        self.root.resizable(True, True)

        # 상단 검색바 영역
        self.query_frame = tk.Frame(root)
        self.query_frame.pack(fill=tk.X, pady=5, padx=5)

        # 검색 방식 선택 (검색어/ID)
        self.search_type_var = tk.StringVar(value="query")
        self.search_type_frame = tk.Frame(self.query_frame)
        self.search_type_frame.pack(side=tk.LEFT)

        tk.Radiobutton(self.search_type_frame, text="검색어", variable=self.search_type_var, value="query", command=self.update_ui).pack(side=tk.LEFT)
        tk.Radiobutton(self.search_type_frame, text="ID", variable=self.search_type_var, value="id", command=self.update_ui).pack(side=tk.LEFT, padx=(10, 0))

        self.query_label = tk.Label(self.query_frame, text="검색어:")
        self.query_label.pack(side=tk.LEFT, padx=(10, 0))

        self.query_entry = tk.Entry(self.query_frame, width=40)
        self.query_entry.pack(side=tk.LEFT, padx=5)
        self.query_entry.bind("<Return>", lambda event: self.search())
        self.query_entry.focus_set()

        # 검색 모드 선택 (OR/AND)
        self.mode_frame = tk.Frame(self.query_frame)
        self.mode_frame.pack(side=tk.LEFT)
        tk.Label(self.mode_frame, text="모드:").pack(side=tk.LEFT, padx=(10,0))
        self.mode_var = tk.StringVar(value="OR")
        tk.Radiobutton(self.mode_frame, text="OR", variable=self.mode_var, value="OR").pack(side=tk.LEFT)
        tk.Radiobutton(self.mode_frame, text="AND", variable=self.mode_var, value="AND").pack(side=tk.LEFT)

        tk.Button(self.query_frame, text="검색", command=self.search).pack(side=tk.LEFT, padx=(10,0))
        self.result_count_label = tk.Label(self.query_frame, text="")
        self.result_count_label.pack(side=tk.LEFT, padx=10)

        # 자동 미리보기 및 열기 (PDF/이미지/기타)
        self.auto_open_enabled = tk.BooleanVar(value=True)
        self.auto_open_checkbox = tk.Checkbutton(
            self.query_frame,
            text="자동 미리보기 및 열기 (PDF/이미지/기타)",
            variable=self.auto_open_enabled
        )
        self.auto_open_checkbox.pack(side=tk.LEFT, padx=(10, 0))

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

    def update_ui(self):
        """라디오 버튼 선택에 따라 UI를 업데이트합니다."""
        search_type = self.search_type_var.get()
        if search_type == "query":
            self.query_label.config(text="검색어:")
            self.mode_frame.pack(side=tk.LEFT, padx=5)
        else: # search_type == "id"
            self.query_label.config(text="ID:")
            self.mode_frame.pack_forget()

    def search(self):
        query_input = self.query_entry.get().strip()
        if not query_input:
            messagebox.showwarning("입력 오류", "검색어를 입력해주세요.")
            return

        search_type = self.search_type_var.get()
        payload = {}

        if search_type == "query":
            mode = self.mode_var.get().upper()
            payload = {"query": query_input, "mode": mode}
        else: # search_type == "id"
            # ID 검증
            if len(query_input) != 24:
                messagebox.showerror("ID 오류", "문서 ID는 24자리여야 합니다.")
                return
            try:
                int(query_input, 16)  # 16진수 검증
            except ValueError:
                messagebox.showerror("ID 오류", "문서 ID는 유효한 16진수여야 합니다.")
                return
            payload = {"id": query_input}

        try:
            response = requests.post(API_URL, json=payload, timeout=10)
            response.raise_for_status()

            # 응답 처리 개선
            response_text = response.text.strip()
            if not response_text:
                self.data = []
            else:
                try:
                    self.data = response.json()
                    if not self.data:
                        self.data = []
                except json.JSONDecodeError:
                    self.data = []

            # ID 검색에서 결과 없음 처리
            if search_type == "id" and not self.data:
                messagebox.showinfo("검색 결과", "해당 ID의 문서를 찾을 수 없습니다.")

            self.populate_table()
        except requests.exceptions.Timeout:
            messagebox.showerror("오류", "요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.")
        except requests.exceptions.ConnectionError:
            messagebox.showerror("오류", "서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.")
        except Exception as e:
            messagebox.showerror("오류", f"검색 중 오류 발생: {e}")

    def populate_table(self):
        # 기존 결과 지우기
        for row in self.result_tree.get_children():
            self.result_tree.delete(row)
        self.detail_text.delete("1.0", tk.END)

        # 결과 수 표시
        count = len(self.data)
        self.result_count_label.config(text=f"검색 결과: {count}건")

        # 결과 없음 처리
        if count == 0:
            self.result_tree.insert("", "end", values=("데이터 없음", "검색 결과가 없습니다."))
            return

        # 결과 테이블에 데이터 추가
        for item in self.data:
            # 업데이트된 데이터 구조에 맞게 수정
            filename = (
                item.get("upload", {}).get("originalName", "") or
                item.get("meta", {}).get("filename", "") or
                item.get("originalName", "") or
                "알 수 없는 파일"
            )
            summary = (
                item.get("meta", {}).get("summary", "") or
                item.get("ocr", {}).get("summary", "") or
                ""
            )
            self.result_tree.insert("", "end", values=(filename, summary))

    def show_details(self, event):
        selected = self.result_tree.selection()
        if not selected:
            return
        index = self.result_tree.index(selected[0])
        if index >= len(self.data):
            return

        item = self.data[index]

        # 업데이트된 데이터 구조에 맞게 텍스트 추출
        full_text = (
            item.get("meta", {}).get("full_text", "") or
            item.get("ocr", {}).get("full_text", "") or
            item.get("full_text", "") or
            ""
        )

        self.detail_text.delete("1.0", tk.END)
        if full_text:
            self.detail_text.insert(tk.END, full_text)
        else:
            filename = (
                item.get("upload", {}).get("originalName", "") or
                item.get("meta", {}).get("filename", "") or
                "알 수 없는 파일"
            )
            self.detail_text.insert(tk.END, f"파일: {filename}\n\n이 문서에는 추출된 텍스트가 없습니다.")

        # 자동 미리보기
        if not self.auto_open_enabled.get():
            return

        mime = item.get("meta", {}).get("mime", "")
        dest_path = (
            item.get("upload", {}).get("destPath", "") or
            item.get("destPath", "")
        )

        if mime.startswith("image/"):
            if dest_path.startswith("/data/files/"):
                relative_path = dest_path.replace("/data/files/", "")
                image_url = f"https://tars.giize.com/files/{relative_path}"
                self.show_image_window(image_url)

        elif mime == "application/pdf":
            self.open_external_pdf(dest_path)

        else:
            self.open_download_link(dest_path)

    def show_image_window(self, url):
        win = tk.Toplevel()
        win.title("이미지 미리보기")

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            img_data = response.content
            image = Image.open(BytesIO(img_data))
            photo = ImageTk.PhotoImage(image)

            canvas = tk.Canvas(win, width=min(photo.width(), 1000), height=min(photo.height(), 800))
            h_scroll = tk.Scrollbar(win, orient=tk.HORIZONTAL, command=canvas.xview)
            v_scroll = tk.Scrollbar(win, orient=tk.VERTICAL, command=canvas.yview)
            canvas.configure(xscrollcommand=h_scroll.set, yscrollcommand=v_scroll.set)

            h_scroll.pack(side=tk.BOTTOM, fill=tk.X)
            v_scroll.pack(side=tk.RIGHT, fill=tk.Y)
            canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

            canvas.image = photo
            canvas.create_image(0, 0, image=photo, anchor="nw")
            canvas.config(scrollregion=(0, 0, photo.width(), photo.height()))

            def _on_mousewheel(event):
                canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
            def _on_shift_mousewheel(event):
                canvas.xview_scroll(int(-1 * (event.delta / 120)), "units")

            canvas.bind_all("<MouseWheel>", _on_mousewheel)
            canvas.bind_all("<Shift-MouseWheel>", _on_shift_mousewheel)

        except Exception as e:
            messagebox.showerror("이미지 로드 실패", str(e))
            win.destroy()

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

    def open_download_link(self, path):
        try:
            if path.startswith("/data/files/"):
                relative_path = path.replace("/data/files/", "")
                file_url = f"https://tars.giize.com/files/{relative_path}"
                webbrowser.open(file_url)
            else:
                raise ValueError("유효하지 않은 파일 경로입니다.")
        except Exception as e:
            messagebox.showerror("파일 다운로드 실패", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = SmartSearchApp(root)
    root.mainloop()