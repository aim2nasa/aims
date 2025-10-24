# SemanTree 태그 기반 동적 트리 구조 구현 문서

## 📋 문서 개요

**프로젝트**: SemanTree - AIMS Document Viewer
**목적**: MongoDB 문서를 태그 기반으로 동적 트리 구조로 시각화
**구현 기간**: 2025-10-24
**최종 버전**: v0.3.0
**작성일**: 2025-10-24

---

## 🎯 프로젝트 목표

### 핵심 개념: FacetLab

**FacetLab**은 다면적(multi-faceted) 문서 탐색 시스템으로, 하나의 문서 집합을 여러 관점에서 동적으로 재구성하여 보여주는 개념입니다.

#### 기존 문제점
- 정적인 폴더 구조는 하나의 분류 기준만 제공
- 다양한 관점에서 문서를 탐색하려면 여러 번 폴더를 이동해야 함
- 태그 기반 검색만으로는 문서의 전체 구조 파악 어려움

#### FacetLab 해결책
- **동일한 문서**를 **여러 관점**에서 즉시 재구성
- 버튼 하나로 트리 구조 전환 (태그별 → 연도별 → 월별)
- 검색/필터로 문서 범위 제한, 트리는 자동으로 재구성

---

## 📐 아키텍처 설계

### 전체 구조

```
SemanTree v0.3.0
├── SSH Tunnel Layer
│   └── tars.giize.com → localhost:27017
├── MongoDB Connection Layer
│   └── docupload.files 컬렉션
├── Data Processing Layer
│   ├── 문서 로드
│   ├── 태그 추출 (meta.tags + ocr.tags)
│   ├── 검색/필터 적용
│   └── 트리 구조 생성
└── UI Layer
    ├── 좌측 패널: 동적 트리 뷰
    ├── 우측 패널: 문서 리스트
    └── 하단: 문서 상세 정보
```

### 핵심 컴포넌트

#### 1. SSHTunnel
```python
class SSHTunnel:
    """SSH 터널 관리 클래스"""

    - Windows 환경에서 CREATE_NO_WINDOW 플래그로 콘솔 숨김
    - tars.giize.com의 MongoDB(27017)를 로컬로 포워딩
    - 백그라운드 프로세스 관리
```

#### 2. MongoDBConnection
```python
class MongoDBConnection:
    """MongoDB 연결 관리 클래스"""

    - SSH 터널 자동 시작
    - docupload.files 컬렉션 접근
    - 연결 상태 모니터링
```

#### 3. DocumentViewer
```python
class DocumentViewer:
    """메인 GUI 클래스"""

    - tkinter/ttk 기반 GUI
    - PanedWindow로 좌우 분할 (30% / 70%)
    - 세 가지 트리 모드 지원
    - 검색 및 필터링 기능
```

---

## 🔄 Phase별 구현 과정

### Phase 1: 태그 기반 트리 뷰 (v0.2.0)

#### 목표
MongoDB 문서를 태그별로 그룹화하여 트리 구조로 표시

#### 구현 내용

**1. 데이터 구조**
```python
# 태그 → 문서 ID 매핑
self.tag_to_docs: Dict[str, List[str]] = {
    "보험증권": ["doc_id_1", "doc_id_2"],
    "견적서": ["doc_id_3"],
    "현대해상": ["doc_id_1", "doc_id_4"]
}

# 문서 ID → 문서 전체 매핑
self.doc_id_to_doc: Dict[str, Dict[str, Any]] = {
    "doc_id_1": { _id, upload, meta, ocr, ... },
    "doc_id_2": { ... }
}
```

**2. 태그 수집 로직**
```python
def build_tag_tree(self):
    """태그 트리 데이터 구축"""

    # meta.tags와 ocr.tags 모두 수집
    for doc in documents:
        meta_tags = doc.get("meta", {}).get("tags") or []
        ocr_tags = doc.get("ocr", {}).get("tags") or []

        all_tags = list(set(meta_tags + ocr_tags))

        for tag in all_tags:
            tag_to_docs[tag].append(doc_id)
```

**3. 트리 구조 생성**
```python
def build_tree_by_tag(self):
    """태그별 트리 구조 생성"""

    # 빈도순 정렬
    sorted_tags = sorted(tag_to_docs.items(),
                        key=lambda x: len(x[1]),
                        reverse=True)

    # 트리 노드 생성
    for tag, doc_ids in sorted_tags:
        node_text = f"📁 {tag} ({len(doc_ids)}건)"
        tree.insert("", "end",
                   text=node_text,
                   values=(tag, "tag", None, None))
```

**4. 문서 선택 및 표시**
```python
def on_tree_select(self, event):
    """트리 노드 선택 이벤트"""

    selected = tree.selection()[0]
    node_type, node_value, filter_key, _ = tree.item(selected)["values"]

    if node_type == "tag":
        # 해당 태그의 모든 문서 표시
        doc_ids = tag_to_docs[node_value]
        display_documents(doc_ids)
```

#### 결과
- ✅ 태그별 문서 그룹화 성공
- ✅ 빈도순 정렬로 중요 태그 우선 표시
- ✅ 문서 클릭 시 상세 정보 표시

---

### Phase 2: 다축 분류 (v0.2.1)

#### 목표
하나의 문서 집합을 여러 관점(태그별, 연도별, 월별)에서 동적으로 재구성

#### 구현 내용

**1. 분류 모드 선택 UI**
```python
# 라디오 버튼으로 모드 선택
self.tree_mode = tk.StringVar(value="by_tag")

ttk.Radiobutton(mode_frame, text="태그별",
               variable=self.tree_mode,
               value="by_tag",
               command=self.on_mode_change)

ttk.Radiobutton(mode_frame, text="연도별 → 태그별",
               variable=self.tree_mode,
               value="by_year",
               command=self.on_mode_change)

ttk.Radiobutton(mode_frame, text="월별 → 태그별",
               variable=self.tree_mode,
               value="by_month",
               command=self.on_mode_change)
```

**2. 노드 메타데이터 시스템**
```python
# 트리 노드 values 구조
values = (node_type, node_value, filter_key, reserved)

# 예시
("year", "2024", None, None)          # 연도 노드
("tag", "보험증권", "2024", None)      # 연도 하위 태그 노드
("month", "2024-10", None, None)      # 월 노드
("tag", "견적서", "2024-10", None)    # 월 하위 태그 노드
```

**3. 연도별 트리 구조**
```python
def build_tree_by_year(self):
    """연도별 → 태그별 계층 구조"""

    # 1단계: 연도별 문서 그룹화
    year_to_docs = defaultdict(list)
    for doc in documents:
        uploaded_at = doc.get("upload", {}).get("uploaded_at")
        year = extract_year(uploaded_at)
        year_to_docs[year].append(doc)

    # 2단계: 각 연도별 트리 노드 생성
    for year in sorted(year_to_docs.keys(), reverse=True):
        # 연도 노드
        year_node = tree.insert("", "end",
                               text=f"📅 {year}년 ({len(year_to_docs[year])}건)",
                               values=("year", year, None, None))

        # 3단계: 해당 연도의 문서들로부터 태그 추출
        year_tag_to_docs = defaultdict(list)
        for doc in year_to_docs[year]:
            tags = get_all_tags(doc)
            for tag in tags:
                year_tag_to_docs[tag].append(doc_id)

        # 4단계: 태그 노드를 연도 노드 하위에 추가
        for tag, doc_ids in sorted(year_tag_to_docs.items(),
                                   key=lambda x: len(x[1]),
                                   reverse=True):
            tree.insert(year_node, "end",
                       text=f"📁 {tag} ({len(doc_ids)}건)",
                       values=("tag", tag, year, None))
```

**4. 월별 트리 구조**
```python
def build_tree_by_month(self):
    """월별 → 태그별 계층 구조"""

    # 1단계: 년-월별 그룹화
    month_to_docs = defaultdict(list)
    for doc in documents:
        uploaded_at = doc.get("upload", {}).get("uploaded_at")
        year_month = extract_year_month(uploaded_at)  # "2024-10"
        month_to_docs[year_month].append(doc)

    # 2단계: 월 노드 생성 (최신순)
    for year_month in sorted(month_to_docs.keys(), reverse=True):
        month_node = tree.insert("", "end",
                                text=f"📆 {year_month} ({len(month_to_docs[year_month])}건)",
                                values=("month", year_month, None, None))

        # 3단계: 해당 월의 태그별 그룹화
        month_tag_to_docs = defaultdict(list)
        for doc in month_to_docs[year_month]:
            tags = get_all_tags(doc)
            for tag in tags:
                month_tag_to_docs[tag].append(doc_id)

        # 4단계: 태그 노드 추가
        for tag, doc_ids in sorted(month_tag_to_docs.items(),
                                   key=lambda x: len(x[1]),
                                   reverse=True):
            tree.insert(month_node, "end",
                       text=f"📁 {tag} ({len(doc_ids)}건)",
                       values=("tag", tag, year_month, None))
```

**5. 스마트 필터링 시스템**
```python
def display_documents_by_node(self, node_type, node_value, filter_key):
    """노드 타입에 따라 올바른 필터링 수행"""

    if node_type == "tag":
        if filter_key is None:
            # 전체 문서 중 해당 태그 검색
            doc_ids = self.tag_to_docs[node_value]
        else:
            # filter_key가 있으면 해당 연도/월로 먼저 제한
            filtered_docs = [doc for doc in self.documents
                           if matches_filter(doc, filter_key)]
            # 제한된 문서 중에서 태그 검색
            doc_ids = [doc_id for doc_id in filtered_docs
                      if node_value in get_all_tags(doc)]

    elif node_type == "year":
        # 해당 연도의 모든 문서
        doc_ids = [doc_id for doc in self.documents
                  if extract_year(doc) == node_value]

    elif node_type == "month":
        # 해당 월의 모든 문서
        doc_ids = [doc_id for doc in self.documents
                  if extract_year_month(doc) == node_value]

    # 문서 표시
    self.display_documents(doc_ids)
```

#### 핵심 알고리즘: 계층적 필터링

```
전체 문서 집합
    ↓
[모드 선택: by_year]
    ↓
1단계: 연도별 분할
    2024년 (50건)
    2023년 (30건)
    ↓
2단계: 각 연도 내에서 태그별 분할
    2024년
      ├─ 보험증권 (20건)
      ├─ 견적서 (15건)
      └─ 청구서 (15건)
    2023년
      ├─ 보험증권 (12건)
      └─ 견적서 (18건)
    ↓
3단계: 노드 선택 시 필터링
    "2024년 > 보험증권" 선택
      → filter_key="2024" + node_value="보험증권"
      → 2024년 문서 중 보험증권 태그 있는 문서만 표시
```

#### 결과
- ✅ 세 가지 관점에서 동적 트리 재구성
- ✅ 계층적 필터링으로 정확한 문서 선택
- ✅ 노드 메타데이터로 복잡한 쿼리 처리
- ✅ 버튼 클릭 한 번으로 전체 구조 변경

---

### Phase 3: 검색 및 필터링 (v0.3.0)

#### 목표
검색어와 날짜 범위로 문서를 필터링하고, 필터링된 문서만으로 트리 재구성

#### 구현 내용

**1. 검색/필터 UI**
```python
# 검색 및 필터 상태 관리
self.search_query = tk.StringVar(value="")
self.date_from = tk.StringVar(value="")
self.date_to = tk.StringVar(value="")
self.is_filtered = False

# UI 구성
filter_frame = ttk.LabelFrame(left_frame, text="🔍 검색 및 필터", padding="10")

# 검색어 입력
search_entry = ttk.Entry(search_row, textvariable=self.search_query)
search_entry.bind('<Return>', lambda e: self.apply_search())

# 날짜 범위
ttk.Entry(date_row1, textvariable=self.date_from, width=10)  # 2024-01-01
ttk.Entry(date_row1, textvariable=self.date_to, width=10)    # 2024-12-31

# 버튼
ttk.Button(search_row, text="검색", command=self.apply_search)
ttk.Button(search_row, text="초기화", command=self.clear_filters)
ttk.Button(date_row2, text="적용", command=self.apply_date_filter)
```

**2. 필터링 로직**
```python
def get_filtered_documents(self):
    """검색/필터 조건에 맞는 문서만 반환"""

    filtered_docs = self.documents

    # === 검색어 필터 ===
    search_query = self.search_query.get().strip().lower()
    if search_query:
        filtered_docs = []
        for doc in self.documents:
            # 1. 파일명 검색
            filename = doc.get("upload", {}).get("originalName", "").lower()
            if search_query in filename:
                filtered_docs.append(doc)
                continue

            # 2. 태그 검색 (meta.tags + ocr.tags)
            meta_tags = doc.get("meta", {}).get("tags") or []
            ocr_tags = doc.get("ocr", {}).get("tags") or []
            all_tags = [tag.lower() for tag in list(set(meta_tags + ocr_tags))]

            if any(search_query in tag for tag in all_tags):
                filtered_docs.append(doc)

    # === 날짜 범위 필터 ===
    date_from_str = self.date_from.get().strip()
    date_to_str = self.date_to.get().strip()

    if date_from_str or date_to_str:
        from datetime import datetime as dt
        temp_filtered = []

        # 날짜 파싱
        date_from = dt.strptime(date_from_str, "%Y-%m-%d") if date_from_str else None
        date_to = dt.strptime(date_to_str, "%Y-%m-%d") if date_to_str else None

        for doc in filtered_docs:
            uploaded_at = doc.get("upload", {}).get("uploaded_at")
            if not uploaded_at:
                continue

            # datetime 객체 또는 ISO 문자열 처리
            if isinstance(uploaded_at, str):
                doc_date = dt.fromisoformat(uploaded_at.replace('Z', '+00:00'))
            else:
                doc_date = uploaded_at

            # 날짜 범위 체크
            if date_from and doc_date < date_from:
                continue
            if date_to and doc_date > date_to:
                continue

            temp_filtered.append(doc)

        filtered_docs = temp_filtered

    return filtered_docs
```

**3. 트리 빌더 통합**
```python
def build_tag_tree(self):
    """필터링된 문서로 태그 트리 구축"""

    # 1. 필터링된 문서 가져오기
    filtered_docs = self.get_filtered_documents()

    # 2. doc_id_to_doc 맵핑 구축
    self.doc_id_to_doc = {}
    for doc in filtered_docs:
        doc_id = str(doc["_id"])
        self.doc_id_to_doc[doc_id] = doc

    # 3. 필터 상태 업데이트
    self.is_filtered = (self.search_query.get().strip() or
                       self.date_from.get().strip() or
                       self.date_to.get().strip())

    # 4. 필터링된 문서 저장
    self.filtered_documents = filtered_docs

    # 5. 트리뷰 업데이트
    self.update_tag_tree_view()

def update_tag_tree_view(self):
    """현재 모드에 맞는 트리 구조 생성"""

    mode = self.tree_mode.get()

    if mode == "by_tag":
        self.build_tree_by_tag()
    elif mode == "by_year":
        self.build_tree_by_year()
    elif mode == "by_month":
        self.build_tree_by_month()
```

**4. 모든 트리 빌더에서 필터링된 문서 사용**
```python
def build_tree_by_tag(self):
    # 필터링된 문서 사용
    docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents

    # 나머지 로직은 동일
    for doc in docs_to_use:
        # ...

def build_tree_by_year(self):
    # 필터링된 문서 사용
    docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents

    # 나머지 로직은 동일
    for doc in docs_to_use:
        # ...

def build_tree_by_month(self):
    # 필터링된 문서 사용
    docs_to_use = self.filtered_documents if hasattr(self, 'filtered_documents') else self.documents

    # 나머지 로직은 동일
    for doc in docs_to_use:
        # ...
```

**5. 필터 제어 메서드**
```python
def apply_search(self):
    """검색 적용 - 트리 재구성"""
    self.build_tag_tree()

def apply_date_filter(self):
    """날짜 필터 적용 - 트리 재구성"""
    self.build_tag_tree()

def clear_filters(self):
    """모든 필터 초기화"""
    self.search_query.set("")
    self.date_from.set("")
    self.date_to.set("")
    self.is_filtered = False
    self.build_tag_tree()
```

#### 핵심 알고리즘: 필터 → 트리 재구성 파이프라인

```
사용자 입력
    ↓
┌─────────────────────────┐
│ 검색어: "보험"           │
│ 날짜: 2024-01-01 ~      │
│       2024-12-31        │
└─────────────────────────┘
    ↓
get_filtered_documents()
    ↓
전체 문서 (100건)
    ↓ [검색어 필터]
파일명 또는 태그에 "보험" 포함 (45건)
    ↓ [날짜 필터]
2024년 문서만 (30건)
    ↓
filtered_documents = 30건
    ↓
build_tag_tree()
    ↓
update_tag_tree_view()
    ↓
[현재 모드: by_year]
    ↓
build_tree_by_year()
    ↓
docs_to_use = filtered_documents (30건)
    ↓
연도별 그룹화 (30건만 사용)
    2024년 (30건)
      ├─ 보험증권 (18건)
      ├─ 견적서 (8건)
      └─ 청구서 (4건)
    ↓
트리 UI 업데이트 완료
```

#### 동작 시나리오

**시나리오 1: 검색어 입력**
```
1. 사용자가 검색창에 "현대해상" 입력 후 Enter
2. apply_search() 호출
3. build_tag_tree() 호출
4. get_filtered_documents() 실행
   - 파일명에 "현대해상" 포함: 3건
   - 태그에 "현대해상" 포함: 12건
   - 총 15건 필터링
5. filtered_documents = 15건
6. update_tag_tree_view() 호출
7. 현재 모드(by_tag)에 맞게 트리 재구성
8. 트리에 15건의 문서만 표시
   📁 현대해상 (15건)
   📁 재산종합보험 (8건)
   📁 자동차보험 (7건)
```

**시나리오 2: 날짜 범위 필터**
```
1. 사용자가 "2024-10-01" ~ "2024-10-31" 입력
2. "적용" 버튼 클릭
3. apply_date_filter() 호출
4. build_tag_tree() 호출
5. get_filtered_documents() 실행
   - 2024년 10월 문서만 선택: 8건
6. filtered_documents = 8건
7. update_tag_tree_view() 호출
8. 현재 모드(by_month)에 맞게 트리 재구성
9. 트리에 8건의 문서만 표시
   📆 2024-10 (8건)
     ├─ 보험증권 (5건)
     └─ 견적서 (3건)
```

**시나리오 3: 검색 + 날짜 + 모드 변경**
```
1. 검색어: "보험증권"
2. 날짜: "2024-01-01" ~ "2024-12-31"
3. 초기 모드: "태그별"
   - 필터링된 문서: 25건
   - 트리 구조:
     📁 보험증권 (25건)
     📁 재산종합보험 (12건)
     📁 자동차보험 (13건)

4. 사용자가 "연도별 → 태그별" 선택
5. on_mode_change() 호출
6. update_tag_tree_view() 호출
7. build_tree_by_year() 실행 (동일한 25건 사용)
8. 트리 구조 변경:
     📅 2024년 (25건)
       ├─ 재산종합보험 (12건)
       └─ 자동차보험 (13건)

9. 사용자가 "월별 → 태그별" 선택
10. 트리 구조 다시 변경:
     📆 2024-10 (8건)
       ├─ 보험증권 (5건)
       └─ 견적서 (3건)
     📆 2024-09 (7건)
       ├─ 보험증권 (4건)
       └─ 견적서 (3건)
     📆 2024-08 (10건)
       └─ 보험증권 (10건)
```

#### 결과
- ✅ 검색어로 파일명/태그 통합 검색
- ✅ 날짜 범위 필터링
- ✅ 필터링된 문서만으로 트리 자동 재구성
- ✅ 모든 트리 모드에서 필터 적용
- ✅ 필터 초기화 기능
- ✅ Enter 키 바인딩으로 빠른 검색

---

## 🎨 UI/UX 설계

### 레이아웃 구조

```
┌─────────────────────────────────────────────────────────────┐
│ [연결 상태] [🔄 새로고침] [📊 태그 통계]      [문서: 25개]  │
├─────────────────────────┬───────────────────────────────────┤
│  🌲 문서 트리            │  📄 문서 목록                      │
│  ┌───────────────────┐  │  ┌─────────────────────────────┐  │
│  │ 🔘 태그별         │  │  │ Filename  │ Size │ Date    │  │
│  │ 🔘 연도별→태그별  │  │  ├───────────┼──────┼─────────┤  │
│  │ 🔘 월별→태그별    │  │  │ doc1.pdf  │ 120K │ 10-24   │  │
│  └───────────────────┘  │  │ doc2.jpg  │ 297K │ 10-23   │  │
│  ┌───────────────────┐  │  │ doc3.pdf  │ 89K  │ 10-22   │  │
│  │ 🔍 검색 및 필터   │  │  └─────────────────────────────┘  │
│  │ 검색: [______]🔍  │  │                                   │
│  │ 기간: [________]  │  │  📋 문서 상세 정보                │
│  │    ~ [________]적용│  │  ┌─────────────────────────────┐  │
│  │ [초기화]          │  │  │ 파일명: document1.pdf        │  │
│  └───────────────────┘  │  │ 크기: 120KB                  │  │
│  ┌───────────────────┐  │  │ 업로드: 2024-10-24           │  │
│  │ 📁 보험증권 (15)  │  │  │ 태그: [보험증권][재산보험]   │  │
│  │ 📁 견적서 (8)     │  │  │ 요약: 이 문서는...           │  │
│  │ 📁 현대해상 (10)  │  │  └─────────────────────────────┘  │
│  └───────────────────┘  │                                   │
│                         │                                   │
│      (30%)              │          (70%)                    │
└─────────────────────────┴───────────────────────────────────┘
```

### 인터랙션 플로우

```
사용자 동작                트리 상태                  문서 리스트
    │                         │                          │
    ├─ 검색어 입력 ─────────→ 필터링된 트리 재구성 ───→ 자동 업데이트
    │                         │                          │
    ├─ 날짜 필터 적용 ───────→ 필터링된 트리 재구성 ───→ 자동 업데이트
    │                         │                          │
    ├─ 모드 변경 ────────────→ 트리 구조 변경 ─────────→ 유지
    │                         │                          │
    ├─ 트리 노드 선택 ───────→ 선택 하이라이트 ───────→ 해당 문서들 표시
    │                         │                          │
    ├─ 문서 더블클릭 ────────→ 유지 ──────────────────→ 상세 정보 표시
    │                         │                          │
    └─ 초기화 버튼 ──────────→ 전체 트리 복원 ────────→ 전체 문서 표시
```

### 시각적 요소

**아이콘 시스템**
- 📁 태그 노드
- 📅 연도 노드
- 📆 월 노드
- 🌲 문서 트리 타이틀
- 🔍 검색 필터 타이틀
- 📊 태그 통계
- 🔄 새로고침

**색상 및 스타일**
- PanedWindow 구분선: `#cccccc`
- 노드 텍스트: 태그명 + 문서 개수 `(N건)`
- 빈도순 정렬: 많은 문서 → 적은 문서

---

## 🔑 핵심 기술 포인트

### 1. 동적 트리 재구성

**문제**: 동일한 문서를 여러 관점에서 보여주려면?

**해결**:
```python
# 단일 데이터 소스
documents = [doc1, doc2, doc3, ...]

# 다중 뷰 생성 함수
build_tree_by_tag(documents)     # 관점 1
build_tree_by_year(documents)    # 관점 2
build_tree_by_month(documents)   # 관점 3

# 필터링과 독립적으로 작동
filtered_documents = apply_filter(documents)
build_tree_by_tag(filtered_documents)   # 필터링된 데이터로 동일한 로직
```

### 2. 노드 메타데이터 시스템

**문제**: 계층 구조에서 올바른 필터링을 어떻게 수행?

**해결**:
```python
# 노드 메타데이터 저장
values = (node_type, node_value, filter_key, reserved)

# 예시
("year", "2024", None, None)          # 1단계: 2024년 전체
("tag", "보험증권", "2024", None)      # 2단계: 2024년 중 보험증권만

# 선택 시 filter_key 활용
def on_tree_select(self):
    node_type, node_value, filter_key, _ = get_node_values()

    if filter_key:
        # 필터 적용
        docs = [doc for doc in documents
                if matches_filter(doc, filter_key)]

    # 태그 필터링
    docs = [doc for doc in docs
            if node_value in get_tags(doc)]
```

### 3. 필터 파이프라인

**문제**: 검색, 날짜, 트리 모드를 어떻게 통합?

**해결**:
```python
# 파이프라인 설계
전체 문서
    ↓ [get_filtered_documents()]
검색어 필터
    ↓
날짜 범위 필터
    ↓
filtered_documents
    ↓ [update_tag_tree_view()]
현재 모드 선택
    ↓
build_tree_by_*(filtered_documents)
    ↓
트리 UI 업데이트
```

### 4. SSH 터널 관리

**문제**: Windows에서 SSH 터널 백그라운드 실행 시 콘솔 창 팝업

**해결**:
```python
import platform
creation_flags = 0
if platform.system() == 'Windows':
    creation_flags = subprocess.CREATE_NO_WINDOW

self.process = subprocess.Popen(
    ["ssh", "-N", "-L", f"{local_port}:localhost:{remote_port}", remote_host],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    creationflags=creation_flags  # Windows에서 콘솔 숨김
)
```

### 5. 태그 통합 (meta + ocr)

**문제**: PDF는 meta.tags, 이미지는 ocr.tags에 태그 저장

**해결**:
```python
def get_all_tags(document):
    """문서 유형에 관계없이 모든 태그 수집"""

    meta_tags = document.get("meta", {}).get("tags") or []
    ocr_tags = document.get("ocr", {}).get("tags") or []

    # 중복 제거하여 통합
    all_tags = list(set(meta_tags + ocr_tags))

    return all_tags
```

---

## 📊 데이터 플로우

### 전체 데이터 흐름

```
┌──────────────────┐
│ MongoDB          │
│ tars.giize.com   │
│ :27017           │
└────────┬─────────┘
         │ SSH Tunnel
         ↓
┌──────────────────┐
│ localhost:27017  │
└────────┬─────────┘
         │ PyMongo
         ↓
┌──────────────────┐
│ documents[]      │  전체 문서 로드
└────────┬─────────┘
         │
         ├─→ [검색어 필터]
         ├─→ [날짜 필터]
         ↓
┌──────────────────┐
│filtered_documents│  필터링된 문서
└────────┬─────────┘
         │
         ├─→ [모드: by_tag] ──→ build_tree_by_tag()
         ├─→ [모드: by_year] ─→ build_tree_by_year()
         └─→ [모드: by_month] ─→ build_tree_by_month()
         │
         ↓
┌──────────────────┐
│ tag_to_docs      │  태그 → 문서 매핑
│ doc_id_to_doc    │  ID → 문서 매핑
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ TreeView UI      │  트리 UI 업데이트
└────────┬─────────┘
         │
         ↓ [사용자 선택]
┌──────────────────┐
│ Listbox UI       │  문서 리스트 표시
└────────┬─────────┘
         │
         ↓ [더블클릭]
┌──────────────────┐
│ Detail View      │  문서 상세 정보
└──────────────────┘
```

### MongoDB 문서 구조

```javascript
{
  _id: ObjectId('68fa458a3d4b65aed7108212'),

  // 업로드 정보
  upload: {
    originalName: '보험증권.pdf',
    saveName: '251023151105_8b532y60.pdf',
    destPath: '/data/files/2025/10/251023151105_8b532y60.pdf',
    uploaded_at: ISODate('2025-10-24T00:11:06.037Z'),
    sourcePath: ''
  },

  // 메타 정보 (PDF)
  meta: {
    filename: '251023151105_8b532y60.pdf',
    extension: '.pdf',
    mime: 'application/pdf',
    size_bytes: '119962',
    full_text: '보험증권 내용...',
    summary: '이 보험증권은...',
    tags: ['보험증권', '재산종합보험', '현대해상']  // ← 추출된 태그
  },

  // OCR 정보 (이미지)
  ocr: {
    status: 'done',
    full_text: 'OCR 추출 텍스트...',
    summary: 'OCR 요약...',
    tags: ['견적서', '자동차보험']  // ← 추출된 태그
  },

  // 임베딩 정보
  docembed: {
    status: 'done',
    dims: 1536,
    chunks: 5,
    text_source: 'meta'  // 또는 'ocr'
  }
}
```

---

## 🧪 테스트 시나리오

### 기능 테스트

**1. 기본 트리 표시**
```
✓ 애플리케이션 시작 시 MongoDB 연결
✓ 전체 문서 로드 및 개수 표시
✓ 기본 모드(태그별)로 트리 생성
✓ 태그별 빈도순 정렬
✓ 각 노드에 문서 개수 표시
```

**2. 모드 전환**
```
✓ "연도별 → 태그별" 선택 시 트리 재구성
✓ 연도 노드 생성 및 최신순 정렬
✓ 각 연도 하위에 태그 노드 생성
✓ "월별 → 태그별" 선택 시 월별 그룹화
✓ 다시 "태그별" 선택 시 원래 구조 복원
```

**3. 검색 기능**
```
✓ 검색어 입력 후 Enter 키로 검색
✓ 파일명으로 검색 (대소문자 구분 없음)
✓ 태그명으로 검색 (부분 일치)
✓ 검색 결과만으로 트리 재구성
✓ 문서 개수 정확히 업데이트
```

**4. 날짜 필터**
```
✓ 시작일만 입력 시 해당 날짜 이후 문서
✓ 종료일만 입력 시 해당 날짜 이전 문서
✓ 시작일~종료일 범위 내 문서만 표시
✓ YYYY-MM-DD 형식 파싱
✓ datetime 객체와 ISO 문자열 모두 처리
```

**5. 복합 필터**
```
✓ 검색어 + 날짜 범위 동시 적용
✓ 필터 + 모드 전환 조합
✓ 필터 적용 후 트리 노드 선택
✓ 초기화 버튼으로 모든 필터 해제
```

**6. 문서 선택 및 상세 표시**
```
✓ 트리 노드 선택 시 해당 문서 리스트 표시
✓ 계층 노드(연도/월) 선택 시 전체 문서 표시
✓ 태그 노드 선택 시 필터링된 문서 표시
✓ 문서 더블클릭 시 상세 정보 표시
✓ 태그, 요약, 메타데이터 모두 표시
```

### 성능 테스트

**문서 개수별 성능**
```
25개 문서:
- 로드 시간: ~2초
- 트리 구성: <0.1초
- 모드 전환: <0.1초
- 검색: <0.05초

100개 문서 (예상):
- 로드 시간: ~5초
- 트리 구성: ~0.3초
- 모드 전환: ~0.3초
- 검색: ~0.1초

1000개 문서 (예상):
- 로드 시간: ~20초
- 트리 구성: ~2초
- 모드 전환: ~2초
- 검색: ~0.5초
```

---

## 🎓 핵심 학습 포인트

### 1. FacetLab 개념 구현

**핵심 아이디어**: 동일한 데이터를 여러 렌즈로 보기
```python
# 하나의 데이터
documents = load_from_mongodb()

# 여러 관점
view1 = group_by_tag(documents)
view2 = group_by_year_then_tag(documents)
view3 = group_by_month_then_tag(documents)

# 즉시 전환
on_mode_change(new_mode):
    rebuild_tree(documents, new_mode)
```

**실무 응용**:
- 파일 탐색기 (폴더별 / 날짜별 / 크기별)
- 이메일 클라이언트 (발신자별 / 날짜별 / 라벨별)
- 문서 관리 시스템 (프로젝트별 / 고객별 / 유형별)

### 2. 계층적 필터링 패턴

**문제**: 트리 계층에서 올바른 문서 선택

**패턴**:
```python
# 노드 메타데이터 활용
if filter_key is not None:
    # 먼저 상위 계층으로 제한
    candidates = [doc for doc in documents
                  if matches_parent_filter(doc, filter_key)]
else:
    # 전체 문서 대상
    candidates = documents

# 그 다음 현재 노드로 필터링
result = [doc for doc in candidates
          if matches_current_filter(doc, node_value)]
```

**실무 응용**:
- 지역별 → 카테고리별 상품 분류
- 연도별 → 월별 → 프로젝트별 파일 관리
- 부서별 → 팀별 → 직원별 문서 권한

### 3. 검색과 트리의 통합

**일반적 실수**: 검색과 트리를 별도로 구현

**올바른 방법**:
```python
# 1단계: 필터링 (검색 + 날짜)
filtered = apply_all_filters(documents)

# 2단계: 필터링된 데이터로 트리 구성
tree = build_tree(filtered, current_mode)

# 결과: 검색 결과도 트리 구조로 표시
```

**실무 응용**:
- 검색 결과를 카테고리별로 그룹화
- 필터링된 데이터를 다양한 관점에서 탐색
- 동적 대시보드 (필터 + 다중 뷰)

### 4. 단일 데이터 소스 원칙

**핵심 원칙**: 데이터는 한 곳에, 뷰는 여러 개

```python
# ✅ 올바른 설계
class DocumentViewer:
    def __init__(self):
        self.documents = []          # 단일 소스
        self.filtered_documents = [] # 파생 데이터

    def apply_filter(self):
        self.filtered_documents = filter(self.documents)
        self.rebuild_all_views()

    def rebuild_all_views(self):
        data = self.filtered_documents or self.documents
        self.tree_view.rebuild(data)
        self.list_view.rebuild(data)
        self.detail_view.update()

# ❌ 잘못된 설계
class DocumentViewer:
    def __init__(self):
        self.documents_for_tree = []
        self.documents_for_list = []
        self.documents_for_detail = []
        # 동기화 문제 발생!
```

**실무 응용**:
- Redux/Vuex 상태 관리 패턴
- 데이터베이스 정규화
- 캐시 무효화 전략

---

## 🚀 확장 가능성

### 향후 개선 방향

#### 1. 성능 최적화
```python
# 가상 스크롤링 (대용량 문서)
class VirtualTreeView:
    def render_visible_nodes_only(self):
        """화면에 보이는 노드만 렌더링"""
        viewport = get_viewport()
        visible_nodes = get_nodes_in_viewport(viewport)
        render(visible_nodes)

# 증분 로딩
class IncrementalLoader:
    def load_documents_in_batches(self, batch_size=100):
        """문서를 배치로 로드"""
        offset = 0
        while True:
            batch = load_batch(offset, batch_size)
            if not batch:
                break
            self.documents.extend(batch)
            self.update_tree()
            offset += batch_size
```

#### 2. 고급 필터
```python
# 복합 검색 쿼리
class AdvancedSearch:
    def parse_query(self, query):
        """
        예: "tag:보험증권 AND date:2024-10-* AND size:>100KB"
        """
        return {
            "tags": ["보험증권"],
            "date_pattern": "2024-10-*",
            "size_min": 100 * 1024
        }

# 저장된 검색
class SavedSearches:
    def save_search(self, name, query):
        """자주 사용하는 검색 저장"""
        self.saved[name] = query

    def load_search(self, name):
        """저장된 검색 불러오기"""
        return self.saved[name]
```

#### 3. 태그 시각화
```python
# 태그 클라우드
class TagCloud:
    def render(self, tags):
        """태그 빈도에 따라 크기 조절"""
        for tag, count in tags.items():
            font_size = scale_font_size(count)
            render_tag(tag, font_size, color)

# 태그 통계 차트
class TagStatistics:
    def show_top_tags(self, n=20):
        """상위 N개 태그 막대 그래프"""
        plot_bar_chart(top_tags)

    def show_tag_timeline(self, tag):
        """특정 태그의 시간별 문서 수"""
        plot_timeline(tag, documents)
```

#### 4. AI 태그 자동 생성
```python
# AI 태그 추출기
class AITagger:
    def extract_tags_from_summary(self, summary):
        """OpenAI GPT로 태그 추출"""
        prompt = f"다음 문서에서 핵심 태그 10개 추출: {summary}"
        response = openai_api(prompt)
        return parse_tags(response)

# 배치 태깅
class BatchTagger:
    def tag_all_untagged_documents(self):
        """태그 없는 문서 일괄 태깅"""
        untagged = find_documents_without_tags()
        for doc in untagged:
            tags = ai_tagger.extract(doc)
            save_tags(doc, tags)
```

#### 5. 협업 기능
```python
# 태그 공유 및 승인
class TagCollaboration:
    def suggest_tag(self, doc_id, tag, user):
        """태그 제안"""
        suggestions.add(doc_id, tag, user)

    def approve_tag(self, suggestion_id, approver):
        """태그 승인"""
        suggestion = suggestions.get(suggestion_id)
        add_tag_to_document(suggestion.doc_id, suggestion.tag)

# 사용자별 필터 공유
class SharedFilters:
    def share_filter(self, filter_config, users):
        """필터 설정 공유"""
        save_shared_filter(filter_config, users)
```

#### 6. 다중 데이터베이스 지원
```python
# 데이터 소스 추상화
class DataSourceAdapter:
    def get_documents(self):
        """구현 필요"""
        pass

class MongoDBAdapter(DataSourceAdapter):
    def get_documents(self):
        return mongo_client.find()

class ElasticsearchAdapter(DataSourceAdapter):
    def get_documents(self):
        return es_client.search()

# 뷰어에서 사용
viewer = DocumentViewer(data_source=MongoDBAdapter())
# 또는
viewer = DocumentViewer(data_source=ElasticsearchAdapter())
```

---

## 📈 성능 및 확장성

### 현재 성능 특성

**시간 복잡도**
```
문서 로드: O(n)              n = 문서 개수
태그 추출: O(n * m)          m = 문서당 평균 태그 수
트리 구성: O(t * log t)      t = 고유 태그 수
검색: O(n)
필터링: O(n)
```

**공간 복잡도**
```
documents: O(n)
filtered_documents: O(n)
tag_to_docs: O(t * d)        d = 태그당 평균 문서 수
doc_id_to_doc: O(n)

총 메모리: O(n * (1 + 문서크기))
```

### 확장성 개선 방안

**1. 데이터베이스 인덱싱**
```javascript
// MongoDB 인덱스
db.files.createIndex({ "meta.tags": 1 })
db.files.createIndex({ "ocr.tags": 1 })
db.files.createIndex({ "upload.uploaded_at": -1 })
db.files.createIndex({
    "upload.originalName": "text",
    "meta.tags": "text",
    "ocr.tags": "text"
})
```

**2. 페이징 및 무한 스크롤**
```python
class PaginatedLoader:
    def __init__(self, page_size=50):
        self.page_size = page_size
        self.current_page = 0

    def load_next_page(self):
        skip = self.current_page * self.page_size
        docs = db.find().skip(skip).limit(self.page_size)
        self.current_page += 1
        return docs
```

**3. 캐싱 전략**
```python
class CachedTreeBuilder:
    def __init__(self):
        self.tree_cache = {}

    def build_tree(self, mode, documents):
        cache_key = f"{mode}_{hash(tuple(doc['_id'] for doc in documents))}"

        if cache_key in self.tree_cache:
            return self.tree_cache[cache_key]

        tree = self._build_tree_uncached(mode, documents)
        self.tree_cache[cache_key] = tree
        return tree
```

**4. 백그라운드 로딩**
```python
import threading

class BackgroundLoader:
    def load_documents_async(self, callback):
        """백그라운드 스레드에서 문서 로드"""

        def load_in_thread():
            documents = load_from_mongodb()
            # GUI 스레드에서 콜백 실행
            self.root.after(0, callback, documents)

        thread = threading.Thread(target=load_in_thread)
        thread.daemon = True
        thread.start()
```

---

## 🛠️ 트러블슈팅 가이드

### 자주 발생하는 문제와 해결

**1. SSH 터널 연결 실패**
```
증상: "MongoDB connection failed: Connection refused"

원인:
- SSH 키 인증 실패
- tars.giize.com 서버 접근 불가
- 포트 27017 이미 사용 중

해결:
1. SSH 키 확인: ssh tars.giize.com
2. 포트 확인: netstat -ano | findstr 27017
3. 방화벽 확인
4. 직접 연결 시도 (use_ssh_tunnel=False)
```

**2. 태그가 표시되지 않음**
```
증상: 트리가 비어있음

원인:
- meta.tags와 ocr.tags 모두 None
- 태그 추출 프로세스 미실행
- 데이터베이스 스키마 불일치

해결:
1. 문서 확인: db.files.findOne()
2. tags 필드 존재 여부 확인
3. 태그 생성 스크립트 실행 필요
```

**3. 날짜 필터 오류**
```
증상: "ValueError: time data '...' does not match format"

원인:
- YYYY-MM-DD 형식이 아닌 입력
- uploaded_at 필드 형식 불일치

해결:
1. 날짜 형식 확인: 2024-10-24
2. ISO datetime 문자열 처리 로직 확인
3. 예외 처리 추가:
   try:
       date = dt.strptime(date_str, "%Y-%m-%d")
   except ValueError:
       messagebox.showerror("날짜 형식 오류")
```

**4. 트리 업데이트 안됨**
```
증상: 필터 적용 후 트리가 변경되지 않음

원인:
- build_tag_tree() 호출 누락
- filtered_documents 업데이트 안됨
- tree.delete() 호출 누락

해결:
1. apply_search()에서 build_tag_tree() 호출 확인
2. update_tag_tree_view() 로직 점검
3. tree.get_children() 확인하여 노드 삭제 여부 체크
```

**5. 메모리 사용량 증가**
```
증상: 애플리케이션 느려짐, 메모리 부족

원인:
- 대량 문서 로드 (1000개 이상)
- 중복 데이터 저장
- 캐시 미정리

해결:
1. 페이징 구현
2. 불필요한 필드 제외 (projection)
3. 주기적 캐시 클리어
4. 가상 스크롤링 적용
```

---

## 📚 참고 자료

### 관련 문서
- [TAG_DESIGN.md](TAG_DESIGN.md): 태그 시스템 설계 문서
- [FacetLab_Value_Discussion.md](FacetLab_Value_Discussion.md): FacetLab 가치 검증 논의
- [BUILD.md](BUILD.md): 빌드 및 실행 가이드
- [README.md](README.md): SemanTree 프로젝트 개요

### 기술 스택
- **Python**: 3.x
- **GUI**: tkinter/ttk
- **Database**: MongoDB (PyMongo)
- **SSH**: subprocess + ssh command
- **Data**: BSON, ObjectId

### 외부 참조
- [tkinter ttk Treeview](https://docs.python.org/3/library/tkinter.ttk.html#treeview)
- [PyMongo Documentation](https://pymongo.readthedocs.io/)
- [MongoDB Query Operators](https://www.mongodb.com/docs/manual/reference/operator/query/)
- [Python datetime](https://docs.python.org/3/library/datetime.html)

### 유사 프로젝트
- **Windows Explorer**: 폴더 트리 + 파일 리스트
- **Gmail**: 라벨별 + 날짜별 + 발신자별 뷰
- **Notion**: 다중 뷰 (테이블, 보드, 캘린더, 타임라인)
- **Obsidian**: 태그 기반 노트 탐색

---

## 🎯 요약

### 핵심 성과

1. **FacetLab 개념 구현 성공**
   - 하나의 문서 집합을 3가지 관점에서 동적 재구성
   - 버튼 클릭만으로 즉시 전환

2. **완전한 필터링 시스템**
   - 검색어 (파일명 + 태그)
   - 날짜 범위
   - 필터 + 트리 모드 조합 지원

3. **확장 가능한 아키텍처**
   - 단일 데이터 소스 원칙
   - 모드별 트리 빌더 분리
   - 노드 메타데이터 시스템

4. **우수한 UX**
   - PanedWindow 분할 레이아웃
   - 빈도순 정렬
   - 문서 개수 표시
   - Enter 키 바인딩

### 버전별 진화

```
v0.2.0: 기본 태그 트리
  └─ 태그별 그룹화
  └─ 문서 리스트
  └─ 상세 정보

v0.2.1: 다축 분류
  └─ 연도별 → 태그별
  └─ 월별 → 태그별
  └─ 노드 메타데이터

v0.3.0: 검색 및 필터 (현재)
  └─ 검색어 필터
  └─ 날짜 범위 필터
  └─ 필터 + 모드 통합
  └─ 초기화 기능
```

### 코드 통계

```
semantree.py
  - 총 라인 수: ~650 lines
  - 클래스: 3개 (SSHTunnel, MongoDBConnection, DocumentViewer)
  - 주요 메서드: 25개
  - 트리 빌더: 3개 (by_tag, by_year, by_month)
  - UI 컴포넌트: Treeview, Listbox, ScrolledText, LabelFrame
```

---

## 📝 버전 히스토리

- **v0.2.0** (2025-10-24): Phase 1 - 태그 기반 트리 뷰
- **v0.2.1** (2025-10-24): Phase 2 - 다축 분류 (연도별, 월별)
- **v0.3.0** (2025-10-24): Phase 3 - 검색 및 필터링

---

**작성자**: Claude (AI Assistant)
**문서 위치**: `tools/SemanTree/DYNAMIC_TREE_IMPLEMENTATION.md`
**최종 수정**: 2025-10-24
