#!/usr/bin/env python3
"""
SemanTree - Semantic Tree Document Viewer
AIMS 문서 뷰어 및 시맨틱 트리 분석 도구

MongoDB에서 문서를 읽어서 GUI로 표시하는 테스트 애플리케이션
"""

import sys
import json
import subprocess
import time
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional
from bson import ObjectId
from pymongo import MongoClient
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox


class SSHTunnel:
    """SSH 터널 관리 클래스"""

    def __init__(self, remote_host: str = "tars.giize.com", local_port: int = 27017, remote_port: int = 27017):
        self.remote_host = remote_host
        self.local_port = local_port
        self.remote_port = remote_port
        self.process: Optional[subprocess.Popen] = None
        self.is_connected = False

    def start(self) -> bool:
        """SSH 터널 시작"""
        if self.process is not None:
            return True

        try:
            print(f"Starting SSH tunnel: {self.remote_host}:{self.remote_port} -> localhost:{self.local_port}")

            # Windows에서 콘솔 창 숨기기 위한 플래그
            import platform
            creation_flags = 0
            if platform.system() == 'Windows':
                creation_flags = subprocess.CREATE_NO_WINDOW

            # SSH 터널 프로세스 시작 (백그라운드)
            self.process = subprocess.Popen(
                ["ssh", "-N", "-L", f"{self.local_port}:localhost:{self.remote_port}", self.remote_host],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=creation_flags
            )

            # 터널이 준비될 때까지 대기
            time.sleep(2)

            # 프로세스가 살아있는지 확인
            if self.process.poll() is None:
                self.is_connected = True
                print("SSH tunnel started successfully")
                return True
            else:
                print("SSH tunnel failed to start")
                return False

        except Exception as e:
            print(f"SSH tunnel error: {e}")
            return False

    def stop(self):
        """SSH 터널 종료"""
        if self.process:
            print("Stopping SSH tunnel...")
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            self.is_connected = False


class MongoDBConnection:
    """MongoDB 연결 관리 클래스"""

    def __init__(self, host: str = "localhost", port: int = 27017, db_name: str = "docupload"):
        self.host = host
        self.port = port
        self.db_name = db_name
        self.client: Optional[MongoClient] = None
        self.db = None
        self.ssh_tunnel: Optional[SSHTunnel] = None

    def connect(self, use_ssh_tunnel: bool = True) -> bool:
        """MongoDB 연결"""
        try:
            # SSH 터널 시작
            if use_ssh_tunnel:
                self.ssh_tunnel = SSHTunnel()
                if not self.ssh_tunnel.start():
                    print("SSH tunnel failed, trying direct connection...")

            # MongoDB 연결
            self.client = MongoClient(
                self.host,
                self.port,
                serverSelectionTimeoutMS=5000,
                directConnection=True
            )
            # 연결 테스트
            self.client.server_info()
            self.db = self.client[self.db_name]
            return True
        except Exception as e:
            print(f"MongoDB connection failed: {e}")
            return False

    def disconnect(self):
        """MongoDB 연결 종료"""
        if self.client:
            self.client.close()

        # SSH 터널 종료
        if self.ssh_tunnel:
            self.ssh_tunnel.stop()

    def get_files_collection(self):
        """files 컬렉션 반환"""
        if self.db is not None:
            return self.db.files
        return None


class DocumentViewer:
    """문서 뷰어 GUI 클래스"""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("SemanTree v0.1.2 - AIMS Document Viewer")
        self.root.geometry("1200x800")

        # MongoDB 연결
        self.mongo = MongoDBConnection()
        self.documents: List[Dict[str, Any]] = []
        self.current_index: int = 0
        self.sort_order: int = -1  # -1: 최신순, 1: 오래된순
        self.full_text_mode: bool = False  # False: 요약 보기, True: 전체 보기

        # UI 구성
        self.setup_ui()

        # 초기 연결 및 데이터 로드
        self.connect_and_load()

    def setup_ui(self):
        """UI 구성"""
        # 상단 프레임: 연결 상태 및 컨트롤
        top_frame = ttk.Frame(self.root, padding="10")
        top_frame.pack(fill=tk.X)

        # 연결 상태 레이블
        self.status_label = ttk.Label(top_frame, text="연결 중...", font=("Arial", 10))
        self.status_label.pack(side=tk.LEFT, padx=5)

        # 새로고침 버튼
        ttk.Button(top_frame, text="새로고침", command=self.reload_documents).pack(side=tk.LEFT, padx=5)

        # 정렬 순서 버튼
        self.sort_button = ttk.Button(top_frame, text="정렬: 최신순", command=self.toggle_sort_order)
        self.sort_button.pack(side=tk.LEFT, padx=5)

        # 텍스트 표시 모드 버튼
        self.text_mode_button = ttk.Button(top_frame, text="표시: 요약", command=self.toggle_text_mode)
        self.text_mode_button.pack(side=tk.LEFT, padx=5)

        # 태그 통계 버튼
        ttk.Button(top_frame, text="📊 태그 통계", command=self.show_tag_statistics).pack(side=tk.LEFT, padx=5)

        # 문서 개수 레이블
        self.count_label = ttk.Label(top_frame, text="문서: 0개", font=("Arial", 10))
        self.count_label.pack(side=tk.RIGHT, padx=5)

        # 중앙 프레임: 네비게이션
        nav_frame = ttk.Frame(self.root, padding="10")
        nav_frame.pack(fill=tk.X)

        # 왼쪽: 네비게이션 버튼
        nav_left_frame = ttk.Frame(nav_frame)
        nav_left_frame.pack(side=tk.LEFT)

        # 이전 버튼
        self.prev_button = ttk.Button(nav_left_frame, text="◀ 이전", command=self.prev_document)
        self.prev_button.pack(side=tk.LEFT, padx=5)

        # 현재 문서 번호 텍스트
        self.current_doc_label = ttk.Label(nav_left_frame, text="", font=("Arial", 12, "bold"))
        self.current_doc_label.pack(side=tk.LEFT, padx=10)

        # 다음 버튼
        self.next_button = ttk.Button(nav_left_frame, text="다음 ▶", command=self.next_document)
        self.next_button.pack(side=tk.LEFT, padx=5)

        # 중앙: 문서 이동
        nav_center_frame = ttk.Frame(nav_frame)
        nav_center_frame.pack(side=tk.LEFT, padx=20)

        ttk.Label(nav_center_frame, text="문서 이동:").pack(side=tk.LEFT, padx=5)
        self.doc_number_var = tk.StringVar(value="1")
        self.doc_number_entry = ttk.Entry(nav_center_frame, textvariable=self.doc_number_var, width=10)
        self.doc_number_entry.pack(side=tk.LEFT, padx=5)
        self.doc_number_entry.bind('<Return>', lambda e: self.goto_document())
        ttk.Button(nav_center_frame, text="이동", command=self.goto_document).pack(side=tk.LEFT, padx=5)

        # 오른쪽: 복사 버튼
        nav_right_frame = ttk.Frame(nav_frame)
        nav_right_frame.pack(side=tk.RIGHT)

        ttk.Button(nav_right_frame, text="📋 전체 복사", command=self.copy_to_clipboard).pack(side=tk.LEFT, padx=5)

        # 문서 내용 표시 영역
        content_frame = ttk.Frame(self.root, padding="10")
        content_frame.pack(fill=tk.BOTH, expand=True)

        # 스크롤 가능한 텍스트 영역
        self.text_area = scrolledtext.ScrolledText(
            content_frame,
            wrap=tk.WORD,
            font=("Consolas", 10),
            bg="#1e1e1e",
            fg="#d4d4d4",
            insertbackground="white"
        )
        self.text_area.pack(fill=tk.BOTH, expand=True)

    def connect_and_load(self):
        """MongoDB 연결 및 문서 로드"""
        self.status_label.config(text="SSH tunnel connecting...", foreground="orange")
        self.root.update()

        if self.mongo.connect(use_ssh_tunnel=True):
            self.status_label.config(text=f"✓ Connected: localhost:{self.mongo.port} (via SSH)", foreground="green")
            self.reload_documents()
        else:
            self.status_label.config(text="✗ Connection Failed", foreground="red")
            messagebox.showerror("Connection Error", "Failed to connect to MongoDB.\n\nMake sure you can SSH to tars.giize.com")

    def reload_documents(self):
        """문서 목록 새로고침"""
        collection = self.mongo.get_files_collection()
        if collection is None:
            return

        try:
            # 모든 문서 로드 (정렬 순서에 따라)
            self.documents = list(collection.find().sort("upload.uploaded_at", self.sort_order))
            self.count_label.config(text=f"문서: {len(self.documents)}개")

            if self.documents:
                self.current_index = 0
                self.display_current_document()
            else:
                self.text_area.delete(1.0, tk.END)
                self.text_area.insert(1.0, "문서가 없습니다.")
        except Exception as e:
            messagebox.showerror("오류", f"문서 로드 실패: {e}")

    def toggle_sort_order(self):
        """정렬 순서 토글 (최신순 ↔ 오래된순)"""
        self.sort_order = 1 if self.sort_order == -1 else -1
        sort_text = "오래된순" if self.sort_order == 1 else "최신순"
        self.sort_button.config(text=f"정렬: {sort_text}")
        self.reload_documents()

    def toggle_text_mode(self):
        """텍스트 표시 모드 토글 (요약 ↔ 전체)"""
        self.full_text_mode = not self.full_text_mode
        mode_text = "전체" if self.full_text_mode else "요약"
        self.text_mode_button.config(text=f"표시: {mode_text}")
        self.display_current_document()

    def copy_to_clipboard(self):
        """텍스트 영역의 내용을 클립보드에 복사"""
        try:
            content = self.text_area.get(1.0, tk.END)
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.root.update()  # 클립보드 업데이트
            messagebox.showinfo("복사 완료", "문서 내용이 클립보드에 복사되었습니다.")
        except Exception as e:
            messagebox.showerror("복사 실패", f"클립보드 복사 실패: {e}")

    def show_tag_statistics(self):
        """태그 통계 창 표시"""
        if not self.documents:
            messagebox.showinfo("태그 통계", "문서가 없습니다.")
            return

        # 태그 빈도수 수집
        from collections import Counter
        tag_counter = Counter()

        for doc in self.documents:
            # meta.tags 수집
            meta_tags = doc.get("meta", {}).get("tags", [])
            if isinstance(meta_tags, list):
                tag_counter.update(meta_tags)

            # ocr.tags 수집
            ocr_tags = doc.get("ocr", {}).get("tags", [])
            if isinstance(ocr_tags, list):
                tag_counter.update(ocr_tags)

        if not tag_counter:
            messagebox.showinfo("태그 통계", "태그가 없습니다.")
            return

        # 새 창 생성
        stats_window = tk.Toplevel(self.root)
        stats_window.title("태그 통계")
        stats_window.geometry("800x600")

        # 상단 정보
        info_frame = ttk.Frame(stats_window, padding="10")
        info_frame.pack(fill=tk.X)

        total_tags = sum(tag_counter.values())
        unique_tags = len(tag_counter)
        ttk.Label(info_frame, text=f"총 태그 수: {total_tags}개 | 고유 태그: {unique_tags}개",
                  font=("Arial", 11, "bold")).pack()

        # Treeview를 사용한 테이블 컨트롤
        table_frame = ttk.Frame(stats_window, padding="10")
        table_frame.pack(fill=tk.BOTH, expand=True)

        # 스크롤바 추가
        scrollbar = ttk.Scrollbar(table_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Treeview 생성
        columns = ("순위", "태그", "빈도수", "비율")
        tree = ttk.Treeview(table_frame, columns=columns, show="headings", yscrollcommand=scrollbar.set)
        scrollbar.config(command=tree.yview)

        # 컬럼 헤더 설정
        tree.heading("순위", text="순위")
        tree.heading("태그", text="태그")
        tree.heading("빈도수", text="빈도수")
        tree.heading("비율", text="비율")

        # 컬럼 너비 및 정렬 설정
        tree.column("순위", width=80, anchor=tk.CENTER)
        tree.column("태그", width=400, anchor=tk.W)
        tree.column("빈도수", width=120, anchor=tk.E)
        tree.column("비율", width=120, anchor=tk.E)

        # 데이터 삽입
        for rank, (tag, count) in enumerate(tag_counter.most_common(), 1):
            percentage = (count / total_tags) * 100
            tree.insert("", tk.END, values=(rank, tag, f"{count}회", f"{percentage:.1f}%"))

        tree.pack(fill=tk.BOTH, expand=True)

        # 닫기 버튼
        button_frame = ttk.Frame(stats_window, padding="10")
        button_frame.pack(fill=tk.X)
        ttk.Button(button_frame, text="닫기", command=stats_window.destroy).pack(side=tk.RIGHT)

    def display_current_document(self):
        """현재 문서 표시"""
        if not self.documents or self.current_index < 0 or self.current_index >= len(self.documents):
            return

        doc = self.documents[self.current_index]

        # 문서 번호 업데이트
        self.doc_number_var.set(str(self.current_index + 1))

        # 현재 문서 번호 텍스트 업데이트
        self.current_doc_label.config(text=f"{self.current_index + 1} / {len(self.documents)}")

        # 문서 내용을 보기 좋게 포맷팅
        formatted_doc = self.format_document(doc)

        # 텍스트 영역 업데이트
        self.text_area.delete(1.0, tk.END)
        self.text_area.insert(1.0, formatted_doc)

        # 버튼 상태 업데이트 (wrap around이므로 항상 활성화)
        self.prev_button.config(state=tk.NORMAL if len(self.documents) > 1 else tk.DISABLED)
        self.next_button.config(state=tk.NORMAL if len(self.documents) > 1 else tk.DISABLED)

    def format_document(self, doc: Dict[str, Any]) -> str:
        """문서를 읽기 쉬운 형태로 포맷팅"""

        def format_value(value, indent=0):
            """값을 재귀적으로 포맷팅"""
            prefix = "  " * indent

            if isinstance(value, ObjectId):
                return f"ObjectId('{value}')"
            elif isinstance(value, datetime):
                return value.isoformat()
            elif isinstance(value, dict):
                lines = ["{"]
                for k, v in value.items():
                    formatted_v = format_value(v, indent + 1)
                    lines.append(f"{prefix}  {k}: {formatted_v},")
                lines.append(f"{prefix}}}")
                return "\n".join(lines)
            elif isinstance(value, list):
                if not value:
                    return "[]"
                lines = ["["]
                for item in value:
                    formatted_item = format_value(item, indent + 1)
                    lines.append(f"{prefix}  {formatted_item},")
                lines.append(f"{prefix}]")
                return "\n".join(lines)
            elif isinstance(value, str):
                # 전체 모드일 때는 모든 텍스트 표시
                if self.full_text_mode:
                    return f"'{value}'"

                # 요약 모드일 때는 긴 문자열 축약
                if len(value) > 100:
                    preview = value[:200] + "..." if len(value) > 200 else value
                    return f"'{preview}'"
                return f"'{value}'"
            else:
                return str(value)

        return format_value(doc)

    def prev_document(self):
        """이전 문서로 이동 (wrap around)"""
        if not self.documents:
            return

        if self.current_index > 0:
            self.current_index -= 1
        else:
            # 처음에서 이전 누르면 마지막으로
            self.current_index = len(self.documents) - 1

        self.display_current_document()

    def next_document(self):
        """다음 문서로 이동 (wrap around)"""
        if not self.documents:
            return

        if self.current_index < len(self.documents) - 1:
            self.current_index += 1
        else:
            # 마지막에서 다음 누르면 처음으로
            self.current_index = 0

        self.display_current_document()

    def goto_document(self):
        """특정 문서 번호로 이동"""
        try:
            doc_num = int(self.doc_number_var.get())
            if 1 <= doc_num <= len(self.documents):
                self.current_index = doc_num - 1
                self.display_current_document()
            else:
                messagebox.showwarning("범위 오류", f"1부터 {len(self.documents)} 사이의 숫자를 입력하세요.")
        except ValueError:
            messagebox.showwarning("입력 오류", "숫자를 입력하세요.")

    def on_closing(self):
        """애플리케이션 종료"""
        self.mongo.disconnect()
        self.root.destroy()


def main():
    """메인 함수"""
    root = tk.Tk()
    app = DocumentViewer(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()
