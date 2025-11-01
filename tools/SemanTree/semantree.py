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

# Qdrant 클라이언트 import (선택적)
try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    print("Warning: qdrant-client not installed. Qdrant features will be disabled.")


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


class QdrantConnection:
    """Qdrant 연결 관리 클래스"""

    def __init__(self, host: str = "localhost", port: int = 6333):
        self.host = host
        self.port = port
        self.client: Optional[QdrantClient] = None
        self.ssh_tunnel: Optional[SSHTunnel] = None

    def connect(self, use_ssh_tunnel: bool = True) -> bool:
        """Qdrant 연결"""
        if not QDRANT_AVAILABLE:
            print("Qdrant client is not available")
            return False

        try:
            # SSH 터널 시작
            if use_ssh_tunnel:
                self.ssh_tunnel = SSHTunnel(remote_port=6333, local_port=6333)
                if not self.ssh_tunnel.start():
                    print("SSH tunnel failed, trying direct connection...")

            # Qdrant 연결
            self.client = QdrantClient(host=self.host, port=self.port, timeout=5.0)
            # 연결 테스트
            self.client.get_collections()
            return True
        except Exception as e:
            print(f"Qdrant connection failed: {e}")
            return False

    def disconnect(self):
        """Qdrant 연결 종료"""
        if self.client:
            self.client.close()

        # SSH 터널 종료
        if self.ssh_tunnel:
            self.ssh_tunnel.stop()

    def get_collection_list(self) -> List[str]:
        """Qdrant 컬렉션 목록 반환"""
        if self.client is not None:
            try:
                collections = self.client.get_collections()
                return sorted([c.name for c in collections.collections])
            except Exception as e:
                print(f"Failed to get collection list: {e}")
                return []
        return []

    def get_collection_info(self, collection_name: str) -> Optional[Dict[str, Any]]:
        """컬렉션 정보 반환"""
        if self.client is not None:
            try:
                info = self.client.get_collection(collection_name)
                return {
                    "name": info.config.params.vectors,
                    "count": info.points_count,
                    "status": info.status
                }
            except Exception as e:
                print(f"Failed to get collection info: {e}")
                return None
        return None

    def scroll_points(self, collection_name: str, limit: int = 100, offset: Optional[str] = None):
        """컬렉션의 포인트들을 스크롤 조회"""
        if self.client is not None:
            try:
                points, next_offset = self.client.scroll(
                    collection_name=collection_name,
                    limit=limit,
                    offset=offset,
                    with_payload=True,
                    with_vectors=True
                )
                return points, next_offset
            except Exception as e:
                print(f"Failed to scroll points: {e}")
                return None, None
        return None, None


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

    def get_database_list(self) -> List[str]:
        """MongoDB 데이터베이스 목록 반환"""
        if self.client is not None:
            try:
                return sorted(self.client.list_database_names())
            except Exception as e:
                print(f"Failed to get database list: {e}")
                return []
        return []

    def get_collection_list(self, db_name: str = None) -> List[str]:
        """특정 데이터베이스의 컬렉션 목록 반환"""
        if self.client is not None:
            try:
                target_db = self.client[db_name] if db_name else self.db
                if target_db is not None:
                    return sorted(target_db.list_collection_names())
            except Exception as e:
                print(f"Failed to get collection list: {e}")
                return []
        return []

    def switch_database(self, db_name: str):
        """데이터베이스 전환"""
        if self.client is not None:
            self.db_name = db_name
            self.db = self.client[db_name]

    def get_collection(self, collection_name: str):
        """특정 컬렉션 반환"""
        if self.db is not None:
            return self.db[collection_name]
        return None

    def get_files_collection(self):
        """files 컬렉션 반환 (하위 호환성)"""
        if self.db is not None:
            return self.db.files
        return None


class DocumentViewer:
    """문서 뷰어 GUI 클래스"""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("SemanTree v0.6.0 - AIMS Document & Vector Viewer")
        self.root.geometry("1400x900")

        # MongoDB 연결
        self.mongo = MongoDBConnection()
        self.documents: List[Dict[str, Any]] = []

        # Qdrant 연결
        self.qdrant = QdrantConnection() if QDRANT_AVAILABLE else None
        self.qdrant_collections: List[str] = []
        self.qdrant_points: List[Dict[str, Any]] = []
        self.current_qdrant_collection: tk.StringVar = tk.StringVar(value="")
        self.current_qdrant_index: int = 0

        # 태그 트리 데이터
        self.tag_to_docs: Dict[str, List[str]] = {}  # {tag: [doc_id1, doc_id2, ...]}
        self.doc_id_to_doc: Dict[str, Dict[str, Any]] = {}  # {doc_id: document}

        # 트리 분류 기준
        self.tree_mode = tk.StringVar(value="by_tag")  # "by_tag", "by_year", "by_month"

        # 검색 및 필터 상태
        self.search_query = tk.StringVar(value="")
        self.date_from = tk.StringVar(value="")
        self.date_to = tk.StringVar(value="")
        self.is_filtered = False  # 필터 활성화 여부

        # Raw 데이터 뷰어 상태
        self.current_raw_index: int = 0
        self.raw_full_text_mode: bool = False  # False: 요약 보기, True: 전체 보기
        self.current_db: tk.StringVar = tk.StringVar(value="docupload")  # 현재 선택된 DB
        self.current_collection: tk.StringVar = tk.StringVar(value="files")  # 현재 선택된 Collection
        self.raw_documents: List[Dict[str, Any]] = []  # Raw 탭 전용 문서 목록

        # Raw 데이터 자동 새로고침 상태
        self.raw_auto_refresh_enabled: bool = True  # 기본값: 자동 새로고침 활성화
        self.raw_auto_refresh_interval: int = 3000  # 3초 (밀리초)
        self.raw_refresh_timer_id: Optional[str] = None  # 타이머 ID

        # 패턴 삭제 마지막 설정값 (컬렉션별)
        self.last_delete_patterns: Dict[str, Dict[str, str]] = {
            "customers": {"field": "personal_info.name", "pattern": "테스트고객*"},
            "files": {"field": "upload.destPath", "pattern": "/tmp/test-*"}
        }

        # 기타 분류 최소 기준
        self.min_tag_count: int = 2  # 기본값: 2개 미만은 기타로 분류

        # 다중 선택 모드
        self.multi_select_mode: tk.StringVar = tk.StringVar(value="AND")  # AND 또는 OR

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

        ttk.Label(left_top_frame, text="🌲 문서 트리", font=("Arial", 11, "bold")).pack(side=tk.LEFT, padx=5)
        ttk.Button(left_top_frame, text="새로고침", command=self.reload_tag_tree).pack(side=tk.RIGHT, padx=5)

        # 좌측: 분류 기준 선택
        mode_frame = ttk.LabelFrame(left_frame, text="분류 기준", padding="10")
        mode_frame.pack(fill=tk.X, padx=5, pady=5)

        ttk.Radiobutton(mode_frame, text="태그별", variable=self.tree_mode,
                       value="by_tag", command=self.on_mode_change).pack(anchor=tk.W)
        ttk.Radiobutton(mode_frame, text="연도별 → 태그별", variable=self.tree_mode,
                       value="by_year", command=self.on_mode_change).pack(anchor=tk.W)
        ttk.Radiobutton(mode_frame, text="월별 → 태그별", variable=self.tree_mode,
                       value="by_month", command=self.on_mode_change).pack(anchor=tk.W)

        # 기타 분류 기준 설정
        min_count_frame = ttk.Frame(mode_frame)
        min_count_frame.pack(fill=tk.X, pady=(10, 0))

        ttk.Label(min_count_frame, text="기타 분류 기준:", font=("Arial", 9, "bold")).pack(anchor=tk.W, pady=(0, 5))

        min_count_control = ttk.Frame(min_count_frame)
        min_count_control.pack(fill=tk.X)

        ttk.Label(min_count_control, text="최소:", width=5).pack(side=tk.LEFT)
        self.min_count_spinbox = ttk.Spinbox(min_count_control, from_=1, to=20, width=5, command=self.apply_min_count)
        self.min_count_spinbox.set("2")
        self.min_count_spinbox.pack(side=tk.LEFT, padx=5)

        ttk.Label(min_count_control, text="건 미만은 기타").pack(side=tk.LEFT, padx=(0, 5))

        # 좌측: 검색 및 필터
        filter_frame = ttk.LabelFrame(left_frame, text="🔍 검색 및 필터", padding="10")
        filter_frame.pack(fill=tk.X, padx=5, pady=5)

        # 검색어 입력
        search_row = ttk.Frame(filter_frame)
        search_row.pack(fill=tk.X, pady=(0, 5))

        ttk.Label(search_row, text="검색:", width=6).pack(side=tk.LEFT)
        search_entry = ttk.Entry(search_row, textvariable=self.search_query, width=15)
        search_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        search_entry.bind('<Return>', lambda e: self.apply_search())

        ttk.Button(search_row, text="검색", width=6, command=self.apply_search).pack(side=tk.LEFT, padx=2)
        ttk.Button(search_row, text="초기화", width=6, command=self.clear_filters).pack(side=tk.LEFT)

        # 날짜 범위 필터
        date_row1 = ttk.Frame(filter_frame)
        date_row1.pack(fill=tk.X, pady=(0, 2))

        ttk.Label(date_row1, text="기간:", width=6).pack(side=tk.LEFT)
        ttk.Entry(date_row1, textvariable=self.date_from, width=10).pack(side=tk.LEFT, padx=2)
        ttk.Label(date_row1, text="~").pack(side=tk.LEFT)
        ttk.Entry(date_row1, textvariable=self.date_to, width=10).pack(side=tk.LEFT, padx=2)

        date_row2 = ttk.Frame(filter_frame)
        date_row2.pack(fill=tk.X)

        ttk.Label(date_row2, text="", width=6).pack(side=tk.LEFT)  # 정렬용 빈 공간
        ttk.Label(date_row2, text="(예: 2024-01-01)", font=("Arial", 8)).pack(side=tk.LEFT, padx=5)
        ttk.Button(date_row2, text="적용", width=6, command=self.apply_date_filter).pack(side=tk.RIGHT)

        # 좌측: 다중 선택 모드
        multi_select_frame = ttk.LabelFrame(left_frame, text="다중 선택 모드", padding="10")
        multi_select_frame.pack(fill=tk.X, padx=5, pady=5)

        ttk.Radiobutton(multi_select_frame, text="AND (모든 태그 포함)", variable=self.multi_select_mode,
                       value="AND", command=self.on_multi_select_mode_change).pack(anchor=tk.W)
        ttk.Radiobutton(multi_select_frame, text="OR (하나라도 포함)", variable=self.multi_select_mode,
                       value="OR", command=self.on_multi_select_mode_change).pack(anchor=tk.W)

        # 좌측 중앙: 트리뷰
        tree_frame = ttk.Frame(left_frame)
        tree_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # 스크롤바
        tree_scrollbar = ttk.Scrollbar(tree_frame)
        tree_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 트리뷰 (태그별 그룹) - 다중 선택 가능
        self.tag_tree = ttk.Treeview(tree_frame, show="tree", yscrollcommand=tree_scrollbar.set, selectmode='extended')
        tree_scrollbar.config(command=self.tag_tree.yview)
        self.tag_tree.pack(fill=tk.BOTH, expand=True)

        # 트리 선택 이벤트
        self.tag_tree.bind("<<TreeviewSelect>>", self.on_tree_select)

        # ========== 우측 패널: 탭 (문서 리스트 + Raw 데이터) ==========
        right_frame = ttk.Frame(paned_window)
        paned_window.add(right_frame, width=900)

        # Notebook (탭) 생성
        self.notebook = ttk.Notebook(right_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # ===== 탭 1: 문서 리스트 =====
        doc_list_tab = ttk.Frame(self.notebook)
        self.notebook.add(doc_list_tab, text="📄 문서 목록")

        # 문서 리스트 프레임
        doc_list_frame = ttk.Frame(doc_list_tab)
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

        # ===== 탭 2: Raw 데이터 =====
        raw_data_tab = ttk.Frame(self.notebook)
        self.notebook.add(raw_data_tab, text="📋 Raw 데이터")

        # DB/Collection 선택 프레임
        raw_select_frame = ttk.LabelFrame(raw_data_tab, text="🗄️ DB & Collection 선택", padding="10")
        raw_select_frame.pack(fill=tk.X, padx=10, pady=(10, 5))

        # DB 선택
        db_row = ttk.Frame(raw_select_frame)
        db_row.pack(fill=tk.X, pady=(0, 5))

        ttk.Label(db_row, text="Database:", width=12).pack(side=tk.LEFT)
        self.db_combo = ttk.Combobox(db_row, textvariable=self.current_db, width=20, state="readonly")
        self.db_combo.pack(side=tk.LEFT, padx=5)
        self.db_combo.bind("<<ComboboxSelected>>", self.on_db_changed)

        # Collection 선택
        collection_row = ttk.Frame(raw_select_frame)
        collection_row.pack(fill=tk.X, pady=(0, 5))

        ttk.Label(collection_row, text="Collection:", width=12).pack(side=tk.LEFT)
        self.collection_combo = ttk.Combobox(collection_row, textvariable=self.current_collection, width=20, state="readonly")
        self.collection_combo.pack(side=tk.LEFT, padx=5)
        self.collection_combo.bind("<<ComboboxSelected>>", self.on_collection_changed)

        # 로드 버튼
        ttk.Button(collection_row, text="🔄 로드", command=self.load_raw_collection_data).pack(side=tk.LEFT, padx=10)

        # 문서 개수 표시
        self.raw_count_label = ttk.Label(collection_row, text="문서: 0개", font=("Arial", 10))
        self.raw_count_label.pack(side=tk.LEFT, padx=10)

        # 패턴 기반 문서 삭제 버튼 (모든 컬렉션에서 사용 가능)
        ttk.Button(collection_row, text="🗑️ 패턴 삭제", command=self.delete_by_pattern).pack(side=tk.LEFT, padx=10)

        # Raw 데이터 네비게이션 프레임
        raw_nav_frame = ttk.Frame(raw_data_tab, padding="10")
        raw_nav_frame.pack(fill=tk.X)

        # 이전 버튼
        self.raw_prev_button = ttk.Button(raw_nav_frame, text="◀ 이전", command=self.prev_raw_document)
        self.raw_prev_button.pack(side=tk.LEFT, padx=5)

        # 현재 문서 번호
        self.raw_doc_label = ttk.Label(raw_nav_frame, text="0 / 0", font=("Arial", 12, "bold"))
        self.raw_doc_label.pack(side=tk.LEFT, padx=10)

        # 다음 버튼
        self.raw_next_button = ttk.Button(raw_nav_frame, text="다음 ▶", command=self.next_raw_document)
        self.raw_next_button.pack(side=tk.LEFT, padx=5)

        # 문서 이동
        ttk.Label(raw_nav_frame, text="문서 이동:").pack(side=tk.LEFT, padx=(20, 5))
        self.raw_doc_number_var = tk.StringVar(value="1")
        raw_doc_entry = ttk.Entry(raw_nav_frame, textvariable=self.raw_doc_number_var, width=10)
        raw_doc_entry.pack(side=tk.LEFT, padx=5)
        raw_doc_entry.bind('<Return>', lambda e: self.goto_raw_document())
        ttk.Button(raw_nav_frame, text="이동", command=self.goto_raw_document).pack(side=tk.LEFT, padx=5)

        # 우측: 요약/전체 토글 및 복사 버튼
        # 전체 복사 버튼
        ttk.Button(raw_nav_frame, text="📋 전체 복사", command=self.copy_raw_to_clipboard).pack(side=tk.RIGHT, padx=5)

        # 문서 삭제 버튼
        ttk.Button(raw_nav_frame, text="🗑️ 삭제", command=self.delete_current_document).pack(side=tk.RIGHT, padx=5)

        # 자동 새로고침 토글 버튼
        self.raw_auto_refresh_button = ttk.Button(raw_nav_frame, text="🔄 자동 (3초)", command=self.toggle_raw_auto_refresh)
        self.raw_auto_refresh_button.pack(side=tk.RIGHT, padx=5)

        # 수동 새로고침 버튼
        ttk.Button(raw_nav_frame, text="🔃 새로고침", command=self.refresh_current_raw_document).pack(side=tk.RIGHT, padx=5)

        # 요약/전체 토글 버튼
        self.raw_text_mode_button = ttk.Button(raw_nav_frame, text="표시: 요약", command=self.toggle_raw_text_mode)
        self.raw_text_mode_button.pack(side=tk.RIGHT, padx=5)

        # Raw 데이터 텍스트 영역
        raw_text_frame = ttk.Frame(raw_data_tab)
        raw_text_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        self.raw_text_area = scrolledtext.ScrolledText(
            raw_text_frame,
            wrap=tk.WORD,
            font=("Consolas", 10),
            bg="#1e1e1e",
            fg="#d4d4d4",
            insertbackground="white"
        )
        self.raw_text_area.pack(fill=tk.BOTH, expand=True)

        # ===== 탭 3: Qdrant 벡터 데이터 =====
        if QDRANT_AVAILABLE:
            qdrant_tab = ttk.Frame(self.notebook)
            self.notebook.add(qdrant_tab, text="🔍 Qdrant 벡터")

            # Collection 선택 프레임
            qdrant_select_frame = ttk.LabelFrame(qdrant_tab, text="🗄️ Qdrant Collection 선택", padding="10")
            qdrant_select_frame.pack(fill=tk.X, padx=10, pady=(10, 5))

            # Collection 선택
            qdrant_coll_row = ttk.Frame(qdrant_select_frame)
            qdrant_coll_row.pack(fill=tk.X, pady=(0, 5))

            ttk.Label(qdrant_coll_row, text="Collection:", width=12).pack(side=tk.LEFT)
            self.qdrant_collection_combo = ttk.Combobox(qdrant_coll_row, textvariable=self.current_qdrant_collection, width=20, state="readonly")
            self.qdrant_collection_combo.pack(side=tk.LEFT, padx=5)

            # 로드 버튼
            ttk.Button(qdrant_coll_row, text="🔄 로드", command=self.load_qdrant_collection_data).pack(side=tk.LEFT, padx=10)

            # 포인트 개수 표시
            self.qdrant_count_label = ttk.Label(qdrant_coll_row, text="포인트: 0개", font=("Arial", 10))
            self.qdrant_count_label.pack(side=tk.LEFT, padx=10)

            # Qdrant 데이터 네비게이션 프레임
            qdrant_nav_frame = ttk.Frame(qdrant_tab, padding="10")
            qdrant_nav_frame.pack(fill=tk.X)

            # 이전 버튼
            self.qdrant_prev_button = ttk.Button(qdrant_nav_frame, text="◀ 이전", command=self.prev_qdrant_point)
            self.qdrant_prev_button.pack(side=tk.LEFT, padx=5)

            # 현재 포인트 번호
            self.qdrant_point_label = ttk.Label(qdrant_nav_frame, text="0 / 0", font=("Arial", 12, "bold"))
            self.qdrant_point_label.pack(side=tk.LEFT, padx=10)

            # 다음 버튼
            self.qdrant_next_button = ttk.Button(qdrant_nav_frame, text="다음 ▶", command=self.next_qdrant_point)
            self.qdrant_next_button.pack(side=tk.LEFT, padx=5)

            # 포인트 이동
            ttk.Label(qdrant_nav_frame, text="포인트 이동:").pack(side=tk.LEFT, padx=(20, 5))
            self.qdrant_point_number_var = tk.StringVar(value="1")
            qdrant_point_entry = ttk.Entry(qdrant_nav_frame, textvariable=self.qdrant_point_number_var, width=10)
            qdrant_point_entry.pack(side=tk.LEFT, padx=5)
            qdrant_point_entry.bind('<Return>', lambda e: self.goto_qdrant_point())
            ttk.Button(qdrant_nav_frame, text="이동", command=self.goto_qdrant_point).pack(side=tk.LEFT, padx=5)

            # 우측: 복사 버튼
            ttk.Button(qdrant_nav_frame, text="📋 전체 복사", command=self.copy_qdrant_to_clipboard).pack(side=tk.RIGHT, padx=5)

            # Qdrant 데이터 텍스트 영역
            qdrant_text_frame = ttk.Frame(qdrant_tab)
            qdrant_text_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

            self.qdrant_text_area = scrolledtext.ScrolledText(
                qdrant_text_frame,
                wrap=tk.WORD,
                font=("Consolas", 10),
                bg="#1e1e1e",
                fg="#d4d4d4",
                insertbackground="white"
            )
            self.qdrant_text_area.pack(fill=tk.BOTH, expand=True)

    def connect_and_load(self):
        """MongoDB 연결 및 문서 로드"""
        self.status_label.config(text="SSH tunnel connecting...", foreground="orange")
        self.root.update()

        if self.mongo.connect(use_ssh_tunnel=True):
            self.status_label.config(text=f"✓ Connected: MongoDB localhost:{self.mongo.port} (via SSH)", foreground="green")
            self.reload_documents()
            # Raw 탭의 DB/Collection 선택기 초기화
            self.initialize_raw_selectors()
        else:
            self.status_label.config(text="✗ MongoDB Connection Failed", foreground="red")
            messagebox.showerror("Connection Error", "Failed to connect to MongoDB.\n\nMake sure you can SSH to tars.giize.com")

        # Qdrant 연결 시도 (선택적)
        if QDRANT_AVAILABLE and self.qdrant:
            if self.qdrant.connect(use_ssh_tunnel=True):
                self.status_label.config(text=f"✓ Connected: MongoDB + Qdrant (via SSH)", foreground="green")
                self.initialize_qdrant_selectors()
            else:
                # Qdrant 연결 실패해도 MongoDB는 사용 가능
                print("Qdrant connection failed, but MongoDB is available")

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

            # Raw 데이터 뷰어 초기화
            self.current_raw_index = 0
            self.update_raw_viewer()

        except Exception as e:
            messagebox.showerror("오류", f"문서 로드 실패: {e}")

    def get_filtered_documents(self):
        """필터링된 문서 목록 반환"""
        filtered_docs = self.documents

        # 검색어 필터
        search_query = self.search_query.get().strip().lower()
        if search_query:
            filtered_docs = []
            for doc in self.documents:
                # 파일명 검색
                filename = doc.get("upload", {}).get("originalName", "").lower()
                if search_query in filename:
                    filtered_docs.append(doc)
                    continue

                # 태그 검색
                meta_tags = doc.get("meta", {}).get("tags") or []
                ocr_tags = doc.get("ocr", {}).get("tags") or []
                all_tags = [tag.lower() for tag in list(set(meta_tags + ocr_tags))]

                if any(search_query in tag for tag in all_tags):
                    filtered_docs.append(doc)

        # 날짜 범위 필터
        date_from_str = self.date_from.get().strip()
        date_to_str = self.date_to.get().strip()

        if date_from_str or date_to_str:
            from datetime import datetime as dt
            temp_filtered = []

            for doc in filtered_docs:
                uploaded_at = doc.get("upload", {}).get("uploaded_at")
                if not uploaded_at:
                    continue

                # 날짜 추출
                if isinstance(uploaded_at, datetime):
                    doc_date = uploaded_at
                else:
                    try:
                        doc_date = dt.fromisoformat(str(uploaded_at)[:10])
                    except:
                        continue

                # 날짜 범위 체크
                if date_from_str:
                    try:
                        date_from = dt.fromisoformat(date_from_str)
                        if doc_date < date_from:
                            continue
                    except:
                        pass

                if date_to_str:
                    try:
                        date_to = dt.fromisoformat(date_to_str)
                        # 종료일 포함 (23:59:59까지)
                        from datetime import timedelta
                        date_to_end = date_to + timedelta(days=1)
                        if doc_date >= date_to_end:
                            continue
                    except:
                        pass

                temp_filtered.append(doc)

            filtered_docs = temp_filtered

        return filtered_docs

    def build_tag_tree(self):
        """태그 트리 데이터 구축"""
        # 필터링된 문서 사용
        filtered_docs = self.get_filtered_documents()

        # doc_id_to_doc 맵핑 구축
        self.doc_id_to_doc = {}
        for doc in filtered_docs:
            doc_id = str(doc["_id"])
            self.doc_id_to_doc[doc_id] = doc

        # 필터 상태 업데이트
        self.is_filtered = (self.search_query.get().strip() or
                           self.date_from.get().strip() or
                           self.date_to.get().strip())

        # 트리뷰 업데이트 (필터링된 문서 기준)
        self.filtered_documents = filtered_docs
        self.update_tag_tree_view()

    def update_tag_tree_view(self):
        """태그 트리뷰 갱신 (모드에 따라)"""
        # 기존 트리 클리어
        for item in self.tag_tree.get_children():
            self.tag_tree.delete(item)

        mode = self.tree_mode.get()

        if mode == "by_tag":
            self.build_tree_by_tag()
        elif mode == "by_year":
            self.build_tree_by_year()
        elif mode == "by_month":
            self.build_tree_by_month()

    def apply_search(self):
        """검색 적용"""
        self.build_tag_tree()

    def apply_date_filter(self):
        """날짜 필터 적용"""
        self.build_tag_tree()

    def clear_filters(self):
        """모든 필터 초기화"""
        self.search_query.set("")
        self.date_from.set("")
        self.date_to.set("")
        self.is_filtered = False
        self.build_tag_tree()

    def build_tree_by_tag(self):
        """태그별 트리 구축 (Phase 1)"""
        tag_to_docs = {}

        # 필터링된 문서의 태그 수집
        docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents
        for doc in docs_to_use:
            doc_id = str(doc["_id"])

            # meta.tags + ocr.tags
            meta_tags = doc.get("meta", {}).get("tags") or []
            ocr_tags = doc.get("ocr", {}).get("tags") or []
            all_tags = list(set(meta_tags + ocr_tags))

            for tag in all_tags:
                if tag not in tag_to_docs:
                    tag_to_docs[tag] = []
                tag_to_docs[tag].append(doc_id)

        # 빈도수 높은 순으로 정렬
        sorted_tags = sorted(tag_to_docs.items(), key=lambda x: len(x[1]), reverse=True)

        # 기타 폴더에 들어갈 태그와 일반 태그 분리
        main_tags = []
        other_tags = []

        for tag, doc_ids in sorted_tags:
            count = len(doc_ids)
            if count >= self.min_tag_count:
                main_tags.append((tag, doc_ids))
            else:
                other_tags.append((tag, doc_ids))

        # 일반 태그 노드 삽입
        for tag, doc_ids in main_tags:
            count = len(doc_ids)
            self.tag_tree.insert("", "end", text=f"📁 {tag} ({count}건)",
                                values=("tag", tag, "", ""))

        # 기타 폴더 생성 (기타 태그가 있는 경우)
        if other_tags:
            # 기타 폴더 노드 (건수 표시 안 함)
            other_node = self.tag_tree.insert("", "end", text="📂 기타",
                                             values=("other", "기타", "", ""))

            # 기타 폴더 하위에 태그 추가
            for tag, doc_ids in other_tags:
                count = len(doc_ids)
                self.tag_tree.insert(other_node, "end", text=f"📁 {tag} ({count}건)",
                                   values=("tag", tag, "", ""))

    def build_tree_by_year(self):
        """연도별 → 태그별 트리 구축"""
        from collections import defaultdict

        # 연도별로 문서 그룹화
        year_to_docs = defaultdict(list)

        docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents
        for doc in docs_to_use:
            doc_id = str(doc["_id"])
            uploaded_at = doc.get("upload", {}).get("uploaded_at")

            if uploaded_at:
                if isinstance(uploaded_at, datetime):
                    year = uploaded_at.year
                else:
                    # 문자열인 경우 파싱
                    try:
                        year = int(str(uploaded_at)[:4])
                    except:
                        year = "알 수 없음"
            else:
                year = "알 수 없음"

            year_to_docs[year].append(doc_id)

        # 연도 정렬 (최신순)
        sorted_years = sorted(year_to_docs.keys(), reverse=True, key=lambda x: x if isinstance(x, int) else 0)

        # 연도별 노드 생성
        for year in sorted_years:
            doc_ids = year_to_docs[year]
            year_count = len(doc_ids)
            year_node = self.tag_tree.insert("", "end", text=f"📅 {year}년 ({year_count}건)",
                                            values=("year", str(year), "", ""))

            # 해당 연도의 문서들에서 태그 수집
            tag_to_docs_in_year = defaultdict(list)
            for doc_id in doc_ids:
                doc = self.doc_id_to_doc.get(doc_id)
                if not doc:
                    continue

                meta_tags = doc.get("meta", {}).get("tags") or []
                ocr_tags = doc.get("ocr", {}).get("tags") or []
                all_tags = list(set(meta_tags + ocr_tags))

                for tag in all_tags:
                    tag_to_docs_in_year[tag].append(doc_id)

            # 태그별 하위 노드 생성 (빈도수 높은 순)
            sorted_tags = sorted(tag_to_docs_in_year.items(), key=lambda x: len(x[1]), reverse=True)
            for tag, tag_doc_ids in sorted_tags:
                tag_count = len(tag_doc_ids)
                self.tag_tree.insert(year_node, "end", text=f"📁 {tag} ({tag_count}건)",
                                    values=("tag", tag, str(year), ""))

    def build_tree_by_month(self):
        """월별 → 태그별 트리 구축"""
        from collections import defaultdict

        # 연월별로 문서 그룹화
        month_to_docs = defaultdict(list)

        docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents
        for doc in docs_to_use:
            doc_id = str(doc["_id"])
            uploaded_at = doc.get("upload", {}).get("uploaded_at")

            if uploaded_at:
                if isinstance(uploaded_at, datetime):
                    month_key = f"{uploaded_at.year}-{uploaded_at.month:02d}"
                else:
                    # 문자열인 경우 파싱
                    try:
                        month_key = str(uploaded_at)[:7]  # "2024-01"
                    except:
                        month_key = "알 수 없음"
            else:
                month_key = "알 수 없음"

            month_to_docs[month_key].append(doc_id)

        # 연월 정렬 (최신순)
        sorted_months = sorted([m for m in month_to_docs.keys() if m != "알 수 없음"], reverse=True)
        if "알 수 없음" in month_to_docs:
            sorted_months.append("알 수 없음")

        # 연월별 노드 생성
        for month in sorted_months:
            doc_ids = month_to_docs[month]
            month_count = len(doc_ids)
            month_node = self.tag_tree.insert("", "end", text=f"📅 {month} ({month_count}건)",
                                             values=("month", month, "", ""))

            # 해당 월의 문서들에서 태그 수집
            tag_to_docs_in_month = defaultdict(list)
            for doc_id in doc_ids:
                doc = self.doc_id_to_doc.get(doc_id)
                if not doc:
                    continue

                meta_tags = doc.get("meta", {}).get("tags") or []
                ocr_tags = doc.get("ocr", {}).get("tags") or []
                all_tags = list(set(meta_tags + ocr_tags))

                for tag in all_tags:
                    tag_to_docs_in_month[tag].append(doc_id)

            # 태그별 하위 노드 생성 (빈도수 높은 순)
            sorted_tags = sorted(tag_to_docs_in_month.items(), key=lambda x: len(x[1]), reverse=True)
            for tag, tag_doc_ids in sorted_tags:
                tag_count = len(tag_doc_ids)
                self.tag_tree.insert(month_node, "end", text=f"📁 {tag} ({tag_count}건)",
                                    values=("tag", tag, month, ""))

    def reload_tag_tree(self):
        """태그 트리 새로고침"""
        self.reload_documents()

    def on_mode_change(self):
        """분류 기준 변경 시"""
        self.update_tag_tree_view()

    def apply_min_count(self):
        """기타 분류 최소 기준 적용"""
        try:
            new_value = int(self.min_count_spinbox.get())
            if new_value < 1:
                messagebox.showwarning("입력 오류", "최소 기준은 1 이상이어야 합니다.")
                return

            self.min_tag_count = new_value
            self.update_tag_tree_view()
        except ValueError:
            messagebox.showwarning("입력 오류", "숫자를 입력해주세요.")

    def on_multi_select_mode_change(self):
        """다중 선택 모드 변경 시 (AND/OR)"""
        selected = self.tag_tree.selection()
        if len(selected) > 1:
            # 현재 다중 선택 상태라면 즉시 문서 목록 업데이트
            self.display_documents_by_multiple_tags(selected)

    def on_tree_select(self, event):
        """트리 노드 선택 시 이벤트 핸들러"""
        selected = self.tag_tree.selection()
        if not selected:
            return

        # 다중 선택 처리
        if len(selected) > 1:
            self.display_documents_by_multiple_tags(selected)
            return

        # 단일 선택 처리
        # 선택된 노드 정보 가져오기
        item = self.tag_tree.item(selected[0])
        values = item["values"]

        if not values or len(values) < 2:
            return

        node_type = values[0]  # "tag", "year", "month"
        node_value = values[1]  # 태그명, 연도, 월

        # 노드 타입에 따라 처리
        if node_type == "tag":
            # 태그 노드 선택: 해당 태그의 문서 표시
            self.display_documents_by_tag(node_value, values[2] if len(values) > 2 else "")
        elif node_type == "year":
            # 연도 노드 선택: 해당 연도의 모든 문서 표시
            self.display_documents_by_year(node_value)
        elif node_type == "month":
            # 월 노드 선택: 해당 월의 모든 문서 표시
            self.display_documents_by_month(node_value)
        elif node_type == "other":
            # 기타 폴더 선택: 문서 목록 표시 안 함 (단순 묶음 폴더)
            pass

    def display_documents_by_multiple_tags(self, selected_items):
        """다중 태그 선택 시 문서 표시 (AND/OR 모드)"""
        # 선택된 태그들 추출 (tag 노드만)
        selected_tags = []
        for item_id in selected_items:
            item = self.tag_tree.item(item_id)
            values = item["values"]
            if values and len(values) >= 2 and values[0] == "tag":
                selected_tags.append(values[1])

        if not selected_tags:
            return

        # AND/OR 모드에 따라 문서 필터링
        mode = self.multi_select_mode.get()
        matching_docs = []

        for doc in self.documents:
            # 문서의 모든 태그 수집
            meta_tags = doc.get("meta", {}).get("tags") or []
            ocr_tags = doc.get("ocr", {}).get("tags") or []
            doc_tags = set(meta_tags + ocr_tags)

            if mode == "AND":
                # AND: 선택된 모든 태그를 포함해야 함
                if all(tag in doc_tags for tag in selected_tags):
                    matching_docs.append(doc)
            else:  # OR
                # OR: 선택된 태그 중 하나라도 포함하면 됨
                if any(tag in doc_tags for tag in selected_tags):
                    matching_docs.append(doc)

        # 문서 리스트 표시
        self.display_document_list_from_docs(matching_docs)

    def display_documents_by_tag(self, tag, filter_key=""):
        """태그별 문서 표시 (필터 적용 가능)"""
        # 해당 태그를 가진 문서 수집
        matching_docs = []
        for doc in self.documents:
            doc_id = str(doc["_id"])

            # 필터 적용 (연도 또는 월)
            if filter_key:
                filter_key_str = str(filter_key)
                uploaded_at = doc.get("upload", {}).get("uploaded_at")
                if uploaded_at:
                    if isinstance(uploaded_at, datetime):
                        if filter_key_str.count("-") == 1:  # 월별
                            doc_key = f"{uploaded_at.year}-{uploaded_at.month:02d}"
                        else:  # 연도별
                            doc_key = str(uploaded_at.year)
                    else:
                        doc_key = str(uploaded_at)[:7] if filter_key_str.count("-") == 1 else str(uploaded_at)[:4]

                    if doc_key != filter_key_str:
                        continue

            # 태그 확인
            meta_tags = doc.get("meta", {}).get("tags") or []
            ocr_tags = doc.get("ocr", {}).get("tags") or []
            all_tags = list(set(meta_tags + ocr_tags))

            if tag in all_tags:
                matching_docs.append(doc)

        # 문서 리스트 표시
        self.display_document_list_from_docs(matching_docs)

    def display_documents_by_year(self, year):
        """연도별 문서 표시"""
        matching_docs = []
        for doc in self.documents:
            uploaded_at = doc.get("upload", {}).get("uploaded_at")
            if uploaded_at:
                if isinstance(uploaded_at, datetime):
                    doc_year = uploaded_at.year
                else:
                    try:
                        doc_year = int(str(uploaded_at)[:4])
                    except:
                        doc_year = None

                if str(doc_year) == str(year):
                    matching_docs.append(doc)

        self.display_document_list_from_docs(matching_docs)

    def display_documents_by_month(self, month):
        """월별 문서 표시"""
        matching_docs = []
        for doc in self.documents:
            uploaded_at = doc.get("upload", {}).get("uploaded_at")
            if uploaded_at:
                if isinstance(uploaded_at, datetime):
                    doc_month = f"{uploaded_at.year}-{uploaded_at.month:02d}"
                else:
                    try:
                        doc_month = str(uploaded_at)[:7]
                    except:
                        doc_month = None

                if doc_month == month:
                    matching_docs.append(doc)

        self.display_document_list_from_docs(matching_docs)

    def display_document_list_from_docs(self, docs):
        """문서 리스트로부터 테이블 표시"""
        # 기존 리스트 클리어
        for item in self.doc_list.get_children():
            self.doc_list.delete(item)

        # 문서 정보 표시
        for doc in docs:
            doc_id = str(doc["_id"])

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

    # ========== Raw 데이터 뷰어 메서드 ==========

    def update_raw_viewer(self):
        """Raw 데이터 뷰어 업데이트"""
        # Raw 탭 전용 문서 목록 사용
        docs_to_use = self.raw_documents if self.raw_documents else self.documents

        if not docs_to_use or self.current_raw_index < 0 or self.current_raw_index >= len(docs_to_use):
            self.raw_text_area.delete(1.0, tk.END)
            self.raw_text_area.insert(1.0, "문서가 없습니다.")
            self.raw_doc_label.config(text="0 / 0")
            self.raw_prev_button.config(state=tk.DISABLED)
            self.raw_next_button.config(state=tk.DISABLED)
            # 자동 새로고침 중지
            self.stop_raw_auto_refresh()
            return

        # 현재 문서
        doc = docs_to_use[self.current_raw_index]

        # 문서 번호 업데이트
        self.raw_doc_number_var.set(str(self.current_raw_index + 1))
        self.raw_doc_label.config(text=f"{self.current_raw_index + 1} / {len(docs_to_use)}")

        # Raw JSON 데이터 포맷팅
        raw_json = self.format_raw_json(doc)

        # 텍스트 영역 업데이트
        self.raw_text_area.delete(1.0, tk.END)
        self.raw_text_area.insert(1.0, raw_json)

        # 버튼 상태 업데이트
        self.raw_prev_button.config(state=tk.NORMAL if len(docs_to_use) > 1 else tk.DISABLED)
        self.raw_next_button.config(state=tk.NORMAL if len(docs_to_use) > 1 else tk.DISABLED)

        # 자동 새로고침 스케줄링
        self.schedule_raw_auto_refresh()

    def format_raw_json(self, doc: Dict[str, Any]) -> str:
        """MongoDB 문서를 Raw JSON으로 변환"""
        def convert_to_serializable(obj):
            """BSON 타입을 JSON 직렬화 가능한 형태로 변환"""
            if isinstance(obj, ObjectId):
                return f"ObjectId('{str(obj)}')"
            elif isinstance(obj, datetime):
                return obj.isoformat()
            elif isinstance(obj, dict):
                return {k: convert_to_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_serializable(item) for item in obj]
            elif isinstance(obj, str):
                # 요약 모드일 때는 긴 문자열 축약
                if not self.raw_full_text_mode and len(obj) > 200:
                    return obj[:200] + "..."
                return obj
            else:
                return obj

        # BSON 타입 변환
        serializable_doc = convert_to_serializable(doc)

        # JSON 포맷팅 (들여쓰기 2칸)
        return json.dumps(serializable_doc, indent=2, ensure_ascii=False)

    def prev_raw_document(self):
        """이전 문서로 이동 (wrap around)"""
        docs_to_use = self.raw_documents if self.raw_documents else self.documents
        if not docs_to_use:
            return

        # 자동 새로고침 타이머 중지 (새 문서로 이동하므로)
        self.stop_raw_auto_refresh()

        if self.current_raw_index > 0:
            self.current_raw_index -= 1
        else:
            # 처음에서 이전 누르면 마지막으로
            self.current_raw_index = len(docs_to_use) - 1

        self.update_raw_viewer()

    def next_raw_document(self):
        """다음 문서로 이동 (wrap around)"""
        docs_to_use = self.raw_documents if self.raw_documents else self.documents
        if not docs_to_use:
            return

        # 자동 새로고침 타이머 중지 (새 문서로 이동하므로)
        self.stop_raw_auto_refresh()

        if self.current_raw_index < len(docs_to_use) - 1:
            self.current_raw_index += 1
        else:
            # 마지막에서 다음 누르면 처음으로
            self.current_raw_index = 0

        self.update_raw_viewer()

    def goto_raw_document(self):
        """특정 문서 번호로 이동"""
        docs_to_use = self.raw_documents if self.raw_documents else self.documents
        try:
            doc_num = int(self.raw_doc_number_var.get())
            if 1 <= doc_num <= len(docs_to_use):
                # 자동 새로고침 타이머 중지 (새 문서로 이동하므로)
                self.stop_raw_auto_refresh()
                self.current_raw_index = doc_num - 1
                self.update_raw_viewer()
            else:
                messagebox.showwarning("범위 오류", f"1부터 {len(docs_to_use)} 사이의 숫자를 입력하세요.")
        except ValueError:
            messagebox.showwarning("입력 오류", "숫자를 입력하세요.")

    def toggle_raw_text_mode(self):
        """Raw 데이터 텍스트 표시 모드 토글 (요약 ↔ 전체)"""
        self.raw_full_text_mode = not self.raw_full_text_mode
        mode_text = "전체" if self.raw_full_text_mode else "요약"
        self.raw_text_mode_button.config(text=f"표시: {mode_text}")
        self.update_raw_viewer()

    def copy_raw_to_clipboard(self):
        """Raw 데이터를 클립보드에 복사"""
        try:
            content = self.raw_text_area.get(1.0, tk.END)
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.root.update()
            messagebox.showinfo("복사 완료", "Raw 데이터가 클립보드에 복사되었습니다.")
        except Exception as e:
            messagebox.showerror("복사 실패", f"클립보드 복사 실패: {e}")

    def on_db_changed(self, event=None):
        """DB 선택 변경 시 이벤트 핸들러"""
        selected_db = self.current_db.get()
        if selected_db:
            # 선택된 DB의 컬렉션 목록 로드
            collection_list = self.mongo.get_collection_list(selected_db)
            self.collection_combo['values'] = collection_list
            if collection_list:
                self.current_collection.set(collection_list[0])

    def on_collection_changed(self, event=None):
        """Collection 선택 변경 시 이벤트 핸들러"""
        # 선택만 변경되고 자동 로드하지 않음
        pass

    def load_raw_collection_data(self):
        """선택된 DB/Collection의 데이터 로드"""
        selected_db = self.current_db.get()
        selected_collection = self.current_collection.get()

        if not selected_db or not selected_collection:
            messagebox.showwarning("선택 오류", "DB와 Collection을 선택해주세요.")
            return

        try:
            # DB 전환
            self.mongo.switch_database(selected_db)

            # Collection 가져오기
            collection = self.mongo.get_collection(selected_collection)
            if collection is None:
                messagebox.showerror("오류", "Collection을 가져올 수 없습니다.")
                return

            # 문서 로드
            self.raw_documents = list(collection.find().sort("_id", -1).limit(1000))
            self.raw_count_label.config(text=f"문서: {len(self.raw_documents)}개")

            # 첫 문서로 이동
            self.current_raw_index = 0
            self.update_raw_viewer()

            messagebox.showinfo("로드 완료", f"{len(self.raw_documents)}개의 문서를 로드했습니다.\n(최대 1000개 제한)")

        except Exception as e:
            messagebox.showerror("로드 실패", f"데이터 로드 실패: {e}")

    def initialize_raw_selectors(self):
        """Raw 탭의 DB/Collection 선택기 초기화"""
        try:
            # DB 목록 로드
            db_list = self.mongo.get_database_list()
            self.db_combo['values'] = db_list

            # 기본 DB 설정
            if "docupload" in db_list:
                self.current_db.set("docupload")
            elif db_list:
                self.current_db.set(db_list[0])

            # Collection 목록 로드
            if self.current_db.get():
                collection_list = self.mongo.get_collection_list(self.current_db.get())
                self.collection_combo['values'] = collection_list

                if "files" in collection_list:
                    self.current_collection.set("files")
                elif collection_list:
                    self.current_collection.set(collection_list[0])

        except Exception as e:
            print(f"Failed to initialize raw selectors: {e}")

    def refresh_current_raw_document(self):
        """현재 표시 중인 Raw 문서를 DB에서 다시 조회"""
        docs_to_use = self.raw_documents if self.raw_documents else self.documents
        if not docs_to_use or self.current_raw_index < 0 or self.current_raw_index >= len(docs_to_use):
            return

        try:
            # 현재 문서의 _id 가져오기
            current_doc = docs_to_use[self.current_raw_index]
            doc_id = current_doc.get("_id")

            if not doc_id:
                return

            # DB에서 해당 문서 다시 조회
            selected_db = self.current_db.get()
            selected_collection = self.current_collection.get()

            if not selected_db or not selected_collection:
                return

            # DB/Collection 가져오기
            self.mongo.switch_database(selected_db)
            collection = self.mongo.get_collection(selected_collection)

            if collection is None:
                return

            # 문서 조회
            refreshed_doc = collection.find_one({"_id": doc_id})

            if refreshed_doc:
                # 로컬 목록 업데이트
                docs_to_use[self.current_raw_index] = refreshed_doc
                # 화면 업데이트 (자동 새로고침 스케줄링 제외)
                self.update_raw_viewer_without_scheduling()

        except Exception as e:
            print(f"현재 문서 새로고침 실패: {e}")

    def update_raw_viewer_without_scheduling(self):
        """Raw 데이터 뷰어 업데이트 (자동 새로고침 스케줄링 제외)"""
        # Raw 탭 전용 문서 목록 사용
        docs_to_use = self.raw_documents if self.raw_documents else self.documents

        if not docs_to_use or self.current_raw_index < 0 or self.current_raw_index >= len(docs_to_use):
            return

        # 현재 스크롤 위치 저장
        scroll_position = self.raw_text_area.yview()

        # 현재 문서
        doc = docs_to_use[self.current_raw_index]

        # Raw JSON 데이터 포맷팅
        raw_json = self.format_raw_json(doc)

        # 텍스트 영역 업데이트
        self.raw_text_area.delete(1.0, tk.END)
        self.raw_text_area.insert(1.0, raw_json)

        # 스크롤 위치 복원
        self.raw_text_area.yview_moveto(scroll_position[0])

    def toggle_raw_auto_refresh(self):
        """Raw 데이터 자동 새로고침 토글"""
        self.raw_auto_refresh_enabled = not self.raw_auto_refresh_enabled

        if self.raw_auto_refresh_enabled:
            self.raw_auto_refresh_button.config(text="🔄 자동 (3초)")
            # 즉시 새로고침 시작
            self.schedule_raw_auto_refresh()
        else:
            self.raw_auto_refresh_button.config(text="⏸ 중지됨")
            # 타이머 중지
            self.stop_raw_auto_refresh()

    def schedule_raw_auto_refresh(self):
        """자동 새로고침 스케줄링"""
        # 기존 타이머 취소
        self.stop_raw_auto_refresh()

        # 자동 새로고침이 활성화된 경우에만 스케줄링
        if self.raw_auto_refresh_enabled:
            self.raw_refresh_timer_id = self.root.after(
                self.raw_auto_refresh_interval,
                self.auto_refresh_callback
            )

    def stop_raw_auto_refresh(self):
        """자동 새로고침 타이머 중지"""
        if self.raw_refresh_timer_id:
            self.root.after_cancel(self.raw_refresh_timer_id)
            self.raw_refresh_timer_id = None

    def auto_refresh_callback(self):
        """자동 새로고침 콜백"""
        # 현재 문서 새로고침
        self.refresh_current_raw_document()
        # 다음 새로고침 스케줄링
        self.schedule_raw_auto_refresh()

    def delete_by_pattern(self):
        """패턴 기반 문서 일괄 삭제"""
        try:
            # 현재 DB/Collection 확인
            selected_db = self.current_db.get()
            selected_collection = self.current_collection.get()

            if not selected_db or not selected_collection:
                messagebox.showwarning("경고", "DB와 Collection을 먼저 선택해주세요.")
                return

            # 패턴 입력 다이얼로그
            pattern_window = tk.Toplevel(self.root)
            pattern_window.title("패턴 기반 삭제")
            pattern_window.geometry("500x300")
            pattern_window.transient(self.root)
            pattern_window.grab_set()

            # 상단 설명
            info_frame = ttk.Frame(pattern_window, padding="10")
            info_frame.pack(fill=tk.X)

            ttk.Label(info_frame, text="삭제할 문서의 패턴을 입력하세요", font=("Arial", 11, "bold")).pack(anchor=tk.W)
            ttk.Label(info_frame, text=f"대상: {selected_db}.{selected_collection}", font=("Arial", 9)).pack(anchor=tk.W, pady=(5, 0))

            # 패턴 입력 영역
            pattern_frame = ttk.LabelFrame(pattern_window, text="패턴 설정", padding="10")
            pattern_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

            # 마지막 설정값 불러오기
            last_settings = self.last_delete_patterns.get(selected_collection, {"field": "", "pattern": ""})

            # 필드명 입력
            field_row = ttk.Frame(pattern_frame)
            field_row.pack(fill=tk.X, pady=(0, 5))

            ttk.Label(field_row, text="필드명:", width=12).pack(side=tk.LEFT)
            field_var = tk.StringVar(value=last_settings.get("field", ""))
            field_entry = ttk.Entry(field_row, textvariable=field_var, width=40)
            field_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

            ttk.Label(pattern_frame, text="예: personal_info.name, upload.destPath, upload.originalName",
                     font=("Arial", 8), foreground="gray").pack(anchor=tk.W, padx=(85, 0))

            # 패턴 입력
            pattern_row = ttk.Frame(pattern_frame)
            pattern_row.pack(fill=tk.X, pady=(10, 5))

            ttk.Label(pattern_row, text="패턴:", width=12).pack(side=tk.LEFT)
            pattern_var = tk.StringVar(value=last_settings.get("pattern", ""))
            pattern_entry = ttk.Entry(pattern_row, textvariable=pattern_var, width=40)
            pattern_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)

            ttk.Label(pattern_frame, text="* = 임의 문자열, ? = 한 글자 (예: 테스트고객*, test*, *임시*)",
                     font=("Arial", 8), foreground="gray").pack(anchor=tk.W, padx=(85, 0))

            # 대소문자 구분 옵션
            case_var = tk.BooleanVar(value=False)
            ttk.Checkbutton(pattern_frame, text="대소문자 구분", variable=case_var).pack(anchor=tk.W, pady=(10, 0), padx=85)

            # 결과 저장용
            result_container = {"confirmed": False, "field": None, "pattern": None, "case_sensitive": False}

            def on_confirm():
                field = field_var.get().strip()
                pattern = pattern_var.get().strip()

                if not field:
                    messagebox.showwarning("입력 오류", "필드명을 입력해주세요.", parent=pattern_window)
                    return

                if not pattern:
                    messagebox.showwarning("입력 오류", "패턴을 입력해주세요.", parent=pattern_window)
                    return

                # 마지막 설정값 저장
                self.last_delete_patterns[selected_collection] = {
                    "field": field,
                    "pattern": pattern
                }

                result_container["confirmed"] = True
                result_container["field"] = field
                result_container["pattern"] = pattern
                result_container["case_sensitive"] = case_var.get()
                pattern_window.destroy()

            def on_cancel():
                pattern_window.destroy()

            # 버튼
            button_frame = ttk.Frame(pattern_window, padding="10")
            button_frame.pack(fill=tk.X)

            ttk.Button(button_frame, text="취소", command=on_cancel).pack(side=tk.RIGHT, padx=5)
            ttk.Button(button_frame, text="확인", command=on_confirm).pack(side=tk.RIGHT)

            # 다이얼로그 대기
            self.root.wait_window(pattern_window)

            # 사용자가 취소한 경우
            if not result_container["confirmed"]:
                return

            # 패턴 변환 (* → .*, ? → .)
            field = result_container["field"]
            pattern = result_container["pattern"]
            case_sensitive = result_container["case_sensitive"]

            # 와일드카드를 정규표현식으로 변환
            import re
            regex_pattern = pattern.replace("*", ".*").replace("?", ".")
            regex_pattern = f"^{regex_pattern}$"

            # DB/Collection 가져오기
            self.mongo.switch_database(selected_db)
            collection = self.mongo.get_collection(selected_collection)

            if collection is None:
                messagebox.showerror("오류", "컬렉션을 가져올 수 없습니다.")
                return

            # 쿼리 생성
            if case_sensitive:
                query = {field: {"$regex": regex_pattern}}
            else:
                query = {field: {"$regex": regex_pattern, "$options": "i"}}

            # 매칭 문서 수 확인
            count = collection.count_documents(query)

            if count == 0:
                messagebox.showinfo("정보", f"패턴 '{pattern}'에 맞는 문서가 없습니다.")
                return

            # 삭제 확인 다이얼로그
            response = messagebox.askyesno(
                "삭제 확인",
                f"'{selected_db}.{selected_collection}' 컬렉션에서\n"
                f"총 {count}개의 문서를 삭제하시겠습니까?\n\n"
                f"필드: {field}\n"
                f"패턴: {pattern}\n"
                f"대소문자 구분: {'예' if case_sensitive else '아니오'}\n\n"
                f"⚠️ 이 작업은 되돌릴 수 없습니다!",
                icon='warning'
            )

            if not response:
                return

            # 삭제 실행
            result = collection.delete_many(query)
            deleted_count = result.deleted_count

            # 결과 메시지
            messagebox.showinfo(
                "삭제 완료",
                f"{deleted_count}개의 문서가 삭제되었습니다."
            )

            # Raw 데이터 목록 새로고침 (삭제 후 자동 로드)
            self.load_raw_collection_data()

        except Exception as e:
            messagebox.showerror("삭제 실패", f"문서 삭제 실패:\n{e}")

    def delete_current_document(self):
        """현재 보고 있는 문서 삭제"""
        try:
            # 현재 문서 목록 가져오기
            docs_to_use = self.raw_documents if self.raw_documents else self.documents

            if not docs_to_use or self.current_raw_index < 0 or self.current_raw_index >= len(docs_to_use):
                messagebox.showwarning("경고", "삭제할 문서가 없습니다.")
                return

            # 현재 문서 가져오기
            current_doc = docs_to_use[self.current_raw_index]
            doc_id = current_doc.get("_id")

            if not doc_id:
                messagebox.showerror("오류", "문서 ID를 찾을 수 없습니다.")
                return

            # 현재 DB/Collection 확인
            selected_db = self.current_db.get()
            selected_collection = self.current_collection.get()

            if not selected_db or not selected_collection:
                messagebox.showwarning("경고", "DB와 Collection을 먼저 선택해주세요.")
                return

            # DB/Collection 가져오기
            self.mongo.switch_database(selected_db)
            collection = self.mongo.get_collection(selected_collection)

            if collection is None:
                messagebox.showerror("오류", "컬렉션을 가져올 수 없습니다.")
                return

            # 문서 삭제
            result = collection.delete_one({"_id": doc_id})

            if result.deleted_count == 0:
                messagebox.showerror("오류", "문서를 삭제하지 못했습니다.")
                return

            # 로컬 목록에서도 제거
            docs_to_use.pop(self.current_raw_index)

            # 문서 개수 업데이트
            if self.raw_documents:
                self.raw_count_label.config(text=f"문서: {len(self.raw_documents)}개")
            else:
                self.count_label.config(text=f"문서: {len(self.documents)}개")

            # 다음 문서로 이동 (또는 이전 문서)
            if not docs_to_use:
                # 모든 문서가 삭제된 경우
                self.current_raw_index = 0
                self.update_raw_viewer()
            else:
                # 현재 인덱스가 범위를 벗어나면 조정
                if self.current_raw_index >= len(docs_to_use):
                    self.current_raw_index = len(docs_to_use) - 1

                self.update_raw_viewer()

        except Exception as e:
            messagebox.showerror("삭제 실패", f"문서 삭제 실패:\n{e}")

    # ========== Qdrant 데이터 뷰어 메서드 ==========

    def initialize_qdrant_selectors(self):
        """Qdrant 탭의 Collection 선택기 초기화"""
        if not QDRANT_AVAILABLE or not self.qdrant:
            return

        try:
            # Collection 목록 로드
            collection_list = self.qdrant.get_collection_list()
            self.qdrant_collection_combo['values'] = collection_list

            # 기본 Collection 설정
            if collection_list:
                self.current_qdrant_collection.set(collection_list[0])

        except Exception as e:
            print(f"Failed to initialize qdrant selectors: {e}")

    def load_qdrant_collection_data(self):
        """선택된 Qdrant Collection의 데이터 로드"""
        if not QDRANT_AVAILABLE or not self.qdrant:
            messagebox.showerror("오류", "Qdrant가 사용 불가능합니다.")
            return

        selected_collection = self.current_qdrant_collection.get()

        if not selected_collection:
            messagebox.showwarning("선택 오류", "Collection을 선택해주세요.")
            return

        try:
            # 포인트 조회 (최대 100개)
            points, next_offset = self.qdrant.scroll_points(selected_collection, limit=100)

            if points is None:
                messagebox.showerror("오류", "포인트를 조회할 수 없습니다.")
                return

            # 포인트를 딕셔너리 형태로 변환
            self.qdrant_points = []
            for point in points:
                point_dict = {
                    "id": point.id,
                    "vector": point.vector if hasattr(point, 'vector') else None,
                    "payload": point.payload if hasattr(point, 'payload') else {}
                }
                self.qdrant_points.append(point_dict)

            self.qdrant_count_label.config(text=f"포인트: {len(self.qdrant_points)}개")

            # 첫 포인트로 이동
            self.current_qdrant_index = 0
            self.update_qdrant_viewer()

            messagebox.showinfo("로드 완료", f"{len(self.qdrant_points)}개의 포인트를 로드했습니다.\n(최대 100개 제한)")

        except Exception as e:
            messagebox.showerror("로드 실패", f"데이터 로드 실패: {e}")

    def update_qdrant_viewer(self):
        """Qdrant 데이터 뷰어 업데이트"""
        if not self.qdrant_points or self.current_qdrant_index < 0 or self.current_qdrant_index >= len(self.qdrant_points):
            self.qdrant_text_area.delete(1.0, tk.END)
            self.qdrant_text_area.insert(1.0, "포인트가 없습니다.")
            self.qdrant_point_label.config(text="0 / 0")
            self.qdrant_prev_button.config(state=tk.DISABLED)
            self.qdrant_next_button.config(state=tk.DISABLED)
            return

        # 현재 포인트
        point = self.qdrant_points[self.current_qdrant_index]

        # 포인트 번호 업데이트
        self.qdrant_point_number_var.set(str(self.current_qdrant_index + 1))
        self.qdrant_point_label.config(text=f"{self.current_qdrant_index + 1} / {len(self.qdrant_points)}")

        # 포인트 데이터 포맷팅 (벡터는 요약)
        formatted_point = {
            "id": point["id"],
            "payload": point["payload"]
        }

        # 벡터 정보 추가 (요약)
        if point.get("vector"):
            vector = point["vector"]
            if isinstance(vector, list):
                vector_summary = f"[벡터 차원: {len(vector)}, 첫 5개: {vector[:5]}...]"
            else:
                vector_summary = str(vector)
            formatted_point["vector_info"] = vector_summary

        # JSON 포맷팅
        json_text = json.dumps(formatted_point, indent=2, ensure_ascii=False)

        # 텍스트 영역 업데이트
        self.qdrant_text_area.delete(1.0, tk.END)
        self.qdrant_text_area.insert(1.0, json_text)

        # 버튼 상태 업데이트
        self.qdrant_prev_button.config(state=tk.NORMAL if len(self.qdrant_points) > 1 else tk.DISABLED)
        self.qdrant_next_button.config(state=tk.NORMAL if len(self.qdrant_points) > 1 else tk.DISABLED)

    def prev_qdrant_point(self):
        """이전 포인트로 이동 (wrap around)"""
        if not self.qdrant_points:
            return

        if self.current_qdrant_index > 0:
            self.current_qdrant_index -= 1
        else:
            # 처음에서 이전 누르면 마지막으로
            self.current_qdrant_index = len(self.qdrant_points) - 1

        self.update_qdrant_viewer()

    def next_qdrant_point(self):
        """다음 포인트로 이동 (wrap around)"""
        if not self.qdrant_points:
            return

        if self.current_qdrant_index < len(self.qdrant_points) - 1:
            self.current_qdrant_index += 1
        else:
            # 마지막에서 다음 누르면 처음으로
            self.current_qdrant_index = 0

        self.update_qdrant_viewer()

    def goto_qdrant_point(self):
        """특정 포인트 번호로 이동"""
        try:
            point_num = int(self.qdrant_point_number_var.get())
            if 1 <= point_num <= len(self.qdrant_points):
                self.current_qdrant_index = point_num - 1
                self.update_qdrant_viewer()
            else:
                messagebox.showwarning("범위 오류", f"1부터 {len(self.qdrant_points)} 사이의 숫자를 입력하세요.")
        except ValueError:
            messagebox.showwarning("입력 오류", "숫자를 입력하세요.")

    def copy_qdrant_to_clipboard(self):
        """Qdrant 데이터를 클립보드에 복사"""
        try:
            content = self.qdrant_text_area.get(1.0, tk.END)
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.root.update()
            messagebox.showinfo("복사 완료", "Qdrant 데이터가 클립보드에 복사되었습니다.")
        except Exception as e:
            messagebox.showerror("복사 실패", f"클립보드 복사 실패: {e}")

    def on_closing(self):
        """애플리케이션 종료"""
        # 자동 새로고침 타이머 중지
        self.stop_raw_auto_refresh()
        self.mongo.disconnect()
        if QDRANT_AVAILABLE and self.qdrant:
            self.qdrant.disconnect()
        self.root.destroy()


def main():
    """메인 함수"""
    root = tk.Tk()
    app = DocumentViewer(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()
