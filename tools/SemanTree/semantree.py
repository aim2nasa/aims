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
        self.root.title("SemanTree v0.2.0 - AIMS Document Viewer")
        self.root.geometry("1400x900")

        # MongoDB 연결
        self.mongo = MongoDBConnection()
        self.documents: List[Dict[str, Any]] = []

        # 태그 트리 데이터
        self.tag_to_docs: Dict[str, List[str]] = {}  # {tag: [doc_id1, doc_id2, ...]}
        self.doc_id_to_doc: Dict[str, Dict[str, Any]] = {}  # {doc_id: document}

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
        ttk.Button(top_frame, text="🔄 새로고침", command=self.reload_documents).pack(side=tk.LEFT, padx=5)

        # 태그 통계 버튼
        ttk.Button(top_frame, text="📊 태그 통계", command=self.show_tag_statistics).pack(side=tk.LEFT, padx=5)

        # 문서 개수 레이블
        self.count_label = ttk.Label(top_frame, text="문서: 0개", font=("Arial", 10))
        self.count_label.pack(side=tk.RIGHT, padx=5)

        # PanedWindow로 좌우 분할
        paned_window = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=5, bg="#cccccc")
        paned_window.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # ========== 좌측 패널: 태그 트리 뷰 ==========
        left_frame = ttk.Frame(paned_window)
        paned_window.add(left_frame, width=400)

        # 좌측 상단: 제목
        left_top_frame = ttk.Frame(left_frame, padding="5")
        left_top_frame.pack(fill=tk.X)

        ttk.Label(left_top_frame, text="🌲 태그 트리", font=("Arial", 11, "bold")).pack(side=tk.LEFT, padx=5)
        ttk.Button(left_top_frame, text="트리 새로고침", command=self.reload_tag_tree).pack(side=tk.RIGHT, padx=5)

        # 좌측 중앙: 트리뷰
        tree_frame = ttk.Frame(left_frame)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 스크롤바
        tree_scrollbar = ttk.Scrollbar(tree_frame)
        tree_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 트리뷰 (태그별 그룹)
        self.tag_tree = ttk.Treeview(tree_frame, show="tree", yscrollcommand=tree_scrollbar.set)
        tree_scrollbar.config(command=self.tag_tree.yview)
        self.tag_tree.pack(fill=tk.BOTH, expand=True)

        # 트리 선택 이벤트
        self.tag_tree.bind("<<TreeviewSelect>>", self.on_tree_select)

        # ========== 우측 패널: 문서 리스트 ==========
        right_frame = ttk.Frame(paned_window)
        paned_window.add(right_frame, width=900)

        # 우측 상단: 제목
        right_top_frame = ttk.Frame(right_frame, padding="5")
        right_top_frame.pack(fill=tk.X)

        self.doc_list_title = ttk.Label(right_top_frame, text="📄 문서 목록", font=("Arial", 11, "bold"))
        self.doc_list_title.pack(side=tk.LEFT, padx=5)

        # 우측 중앙: 문서 리스트
        doc_list_frame = ttk.Frame(right_frame)
        doc_list_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 스크롤바
        doc_scrollbar = ttk.Scrollbar(doc_list_frame)
        doc_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 문서 리스트 (Treeview)
        columns = ("파일명", "업로드날짜", "태그")
        self.doc_list = ttk.Treeview(doc_list_frame, columns=columns, show="headings", yscrollcommand=doc_scrollbar.set)
        doc_scrollbar.config(command=self.doc_list.yview)

        # 컬럼 설정
        self.doc_list.heading("파일명", text="파일명")
        self.doc_list.heading("업로드날짜", text="업로드 날짜")
        self.doc_list.heading("태그", text="태그")

        self.doc_list.column("파일명", width=300, anchor=tk.W)
        self.doc_list.column("업로드날짜", width=150, anchor=tk.CENTER)
        self.doc_list.column("태그", width=400, anchor=tk.W)

        self.doc_list.pack(fill=tk.BOTH, expand=True)

        # 문서 더블클릭 이벤트
        self.doc_list.bind("<Double-1>", self.on_document_double_click)

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
            self.documents = list(collection.find().sort("upload.uploaded_at", -1))
            self.count_label.config(text=f"문서: {len(self.documents)}개")

            # 태그 트리 구축
            self.build_tag_tree()

        except Exception as e:
            messagebox.showerror("오류", f"문서 로드 실패: {e}")

    def build_tag_tree(self):
        """태그 트리 데이터 구축"""
        from collections import Counter

        # 초기화
        self.tag_to_docs = {}
        self.doc_id_to_doc = {}

        # 모든 문서의 태그 수집
        for doc in self.documents:
            doc_id = str(doc["_id"])
            self.doc_id_to_doc[doc_id] = doc

            # meta.tags 수집
            meta_tags = doc.get("meta", {}).get("tags") or []
            # ocr.tags 수집
            ocr_tags = doc.get("ocr", {}).get("tags") or []

            # 모든 태그 합치기 (중복 제거)
            all_tags = list(set(meta_tags + ocr_tags))

            for tag in all_tags:
                if tag not in self.tag_to_docs:
                    self.tag_to_docs[tag] = []
                self.tag_to_docs[tag].append(doc_id)

        # 트리뷰 업데이트
        self.update_tag_tree_view()

    def update_tag_tree_view(self):
        """태그 트리뷰 갱신"""
        # 기존 트리 클리어
        for item in self.tag_tree.get_children():
            self.tag_tree.delete(item)

        # 빈도수 높은 순으로 정렬
        sorted_tags = sorted(self.tag_to_docs.items(), key=lambda x: len(x[1]), reverse=True)

        # 트리에 노드 삽입
        for tag, doc_ids in sorted_tags:
            count = len(doc_ids)
            self.tag_tree.insert("", "end", text=f"📁 {tag} ({count}건)", values=(tag,))

    def reload_tag_tree(self):
        """태그 트리 새로고침"""
        self.reload_documents()

    def on_tree_select(self, event):
        """트리 노드 선택 시 이벤트 핸들러"""
        selected = self.tag_tree.selection()
        if not selected:
            return

        # 선택된 태그 가져오기
        item = self.tag_tree.item(selected[0])
        tag = item["values"][0] if item["values"] else None

        if tag and tag in self.tag_to_docs:
            # 우측 제목 업데이트
            doc_count = len(self.tag_to_docs[tag])
            self.doc_list_title.config(text=f"📄 문서 목록: {tag} ({doc_count}건)")

            # 문서 리스트 표시
            self.display_document_list(tag)

    def display_document_list(self, tag):
        """선택된 태그의 문서 리스트 표시"""
        # 기존 리스트 클리어
        for item in self.doc_list.get_children():
            self.doc_list.delete(item)

        # 해당 태그의 문서 ID 리스트
        doc_ids = self.tag_to_docs.get(tag, [])

        # 문서 정보 표시
        for doc_id in doc_ids:
            doc = self.doc_id_to_doc.get(doc_id)
            if not doc:
                continue

            # 파일명
            filename = doc.get("upload", {}).get("originalName", "알 수 없음")

            # 업로드 날짜
            uploaded_at = doc.get("upload", {}).get("uploaded_at")
            if uploaded_at:
                if isinstance(uploaded_at, datetime):
                    date_str = uploaded_at.strftime("%Y-%m-%d %H:%M")
                else:
                    date_str = str(uploaded_at)[:16]
            else:
                date_str = "-"

            # 태그 (최대 3개까지만 표시)
            meta_tags = doc.get("meta", {}).get("tags") or []
            ocr_tags = doc.get("ocr", {}).get("tags") or []
            all_tags = list(set(meta_tags + ocr_tags))
            tags_preview = ", ".join(all_tags[:3])
            if len(all_tags) > 3:
                tags_preview += f" 외 {len(all_tags) - 3}개"

            # 리스트에 추가 (doc_id를 values에 저장)
            self.doc_list.insert("", "end", values=(filename, date_str, tags_preview, doc_id))

    def on_document_double_click(self, event):
        """문서 더블클릭 시 상세 보기"""
        selected = self.doc_list.selection()
        if not selected:
            return

        # 선택된 문서의 doc_id 가져오기
        item = self.doc_list.item(selected[0])
        values = item["values"]
        if len(values) >= 4:
            doc_id = values[3]
            doc = self.doc_id_to_doc.get(doc_id)
            if doc:
                self.show_document_detail(doc)

    def show_document_detail(self, doc):
        """문서 상세 보기 창"""
        detail_window = tk.Toplevel(self.root)
        detail_window.title("문서 상세 보기")
        detail_window.geometry("1000x700")

        # 상단: 파일명
        top_frame = ttk.Frame(detail_window, padding="10")
        top_frame.pack(fill=tk.X)

        filename = doc.get("upload", {}).get("originalName", "알 수 없음")
        ttk.Label(top_frame, text=filename, font=("Arial", 12, "bold")).pack(side=tk.LEFT)

        # 문서 내용 표시
        text_frame = ttk.Frame(detail_window, padding="10")
        text_frame.pack(fill=tk.BOTH, expand=True)

        text_area = scrolledtext.ScrolledText(
            text_frame,
            wrap=tk.WORD,
            font=("Consolas", 10),
            bg="#1e1e1e",
            fg="#d4d4d4"
        )
        text_area.pack(fill=tk.BOTH, expand=True)

        # 문서 내용 포맷팅
        formatted_doc = self.format_document(doc)
        text_area.insert(1.0, formatted_doc)
        text_area.config(state=tk.DISABLED)

        # 닫기 버튼
        button_frame = ttk.Frame(detail_window, padding="10")
        button_frame.pack(fill=tk.X)
        ttk.Button(button_frame, text="닫기", command=detail_window.destroy).pack(side=tk.RIGHT)


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
                # 문서 상세 보기에서는 전체 텍스트 표시
                return f"'{value}'"
            else:
                return str(value)

        return format_value(doc)


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
