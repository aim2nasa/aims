# AIMS 시스템 종합 분석 보고서

**문서 버전**: 1.0
**작성일**: 2025-12-08
**대상 시스템**: AIMS (Agent Intelligent Management System)
**분석 범위**: 백엔드 + 프론트엔드 전체 아키텍처

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [백엔드 상세 분석](#3-백엔드-상세-분석)
4. [프론트엔드 상세 분석](#4-프론트엔드-상세-분석)
5. [핵심 비즈니스 로직](#5-핵심-비즈니스-로직)
6. [기술 스택 및 의존성](#6-기술-스택-및-의존성)
7. [배포 및 운영](#7-배포-및-운영)
8. [테스트 전략](#8-테스트-전략)
9. [보안 고려사항](#9-보안-고려사항)
10. [성능 최적화](#10-성능-최적화)
11. [개발 워크플로우](#11-개발-워크플로우)
12. [향후 개선 사항](#12-향후-개선-사항)
13. [참조 문서](#13-참조-문서)
14. [부록](#14-부록)

---

## 1. 시스템 개요

### 1.1 AIMS란?

**AIMS (Agent Intelligent Management System)**는 보험 설계사를 위한 지능형 문서 관리 시스템입니다. 고객 정보, 보험 계약, 문서를 통합 관리하고, AI 기반 검색 및 분석 기능을 제공하여 설계사의 업무 효율을 극대화합니다.

### 1.2 주요 사용자

- **보험 설계사 (Agent)**: 시스템의 주 사용자
- **고객 (Customer)**: 설계사가 관리하는 보험 가입자

### 1.3 핵심 기능

| 기능 영역 | 주요 기능 |
|----------|----------|
| **문서 관리** | 업로드, OCR, 메타데이터 추출, 벡터 검색 |
| **고객 관리** | CRUD, 관계도, 지역별 조회, 통계 |
| **계약 관리** | 증권 관리, 일괄 등록, 연차보고서 파싱 |
| **검색** | 하이브리드 검색 (키워드 + 의미적), RAG |
| **개인 파일** | Google Drive 스타일 폴더 관리 |

### 1.4 기술 스택 개요

```
┌─────────────────────────────────────────┐
│ Frontend: React 18 + TypeScript + Vite │
├─────────────────────────────────────────┤
│ Backend: Node.js + Python FastAPI      │
├─────────────────────────────────────────┤
│ Database: MongoDB + Qdrant (Vector DB) │
├─────────────────────────────────────────┤
│ AI/ML: OpenAI GPT-4, Upstage OCR       │
└─────────────────────────────────────────┘
```

---

## 2. 시스템 아키텍처

### 2.1 마이크로서비스 구성

AIMS는 4개의 독립적인 마이크로서비스로 구성됩니다:

| 서비스 | 언어/프레임워크 | 포트 | 역할 |
|--------|----------------|------|------|
| **aims_api** | Node.js (Express) | 3010 | 메인 API (고객, 문서, 계약 관리) |
| **aims_rag_api** | Python (FastAPI) | 8000 | RAG 검색 엔진 (하이브리드 검색) |
| **doc_status_api** | Python (FastAPI) | 8000 | 문서 처리 상태 모니터링 |
| **annual_report_api** | Python (FastAPI) | 8081 | 연간보고서 파싱 (비동기 큐) |

### 2.2 데이터베이스

#### MongoDB (docupload)
```
docupload/
├── users                    # 사용자 (설계사)
├── customers                # 고객
├── contracts                # 계약
├── insurance_products       # 보험상품
├── files                    # 문서 (메타데이터 + OCR)
├── customer_relationships   # 고객 간 관계
└── personal_files           # 개인 파일 (폴더 구조)
```

#### Qdrant (Vector Database)
```
docembed/
└── 문서 벡터 임베딩 (1536차원, text-embedding-3-small)
    └── Payload: owner_id, customer_id, chunk_index, preview
```

### 2.3 외부 서비스 연동

| 서비스 | 용도 | 사용 API |
|--------|------|----------|
| **OpenAI** | 임베딩, 답변 생성, AR 파싱 | text-embedding-3-small, GPT-4.1 |
| **Upstage** | 이미지/PDF OCR | Document OCR API |
| **Naver Cloud** | 주소 검색, 지오코딩 | Maps API |
| **N8N** | 워크플로우 자동화 | Webhook |

### 2.4 전체 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│               Frontend (React + TypeScript)                   │
│                    Port 5177                                  │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP/WebSocket
        ┌────────────┴────────────┬─────────────┬──────────────┐
        │                         │             │              │
┌───────▼────────┐   ┌────────────▼──┐  ┌──────▼────┐  ┌──────▼────────┐
│ aims_api       │   │ doc_status_api│  │ rag_api   │  │ annual_rpt_api│
│ Node.js:3010   │   │ FastAPI:8000  │  │ FastAPI   │  │ FastAPI:8081  │
│                │   │               │  │           │  │               │
│ - Auth (JWT)   │   │ - Change      │  │ - Hybrid  │  │ - Queue Mgr   │
│ - Customer     │   │   Stream      │  │   Search  │  │ - AR Parse    │
│ - Contract     │   │ - WebSocket   │  │ - RAG     │  │ - Contract    │
│ - Document     │   │ - Progress    │  │ - Rerank  │  │   Extract     │
└───────┬────────┘   └───────┬───────┘  └──────┬────┘  └──────┬────────┘
        │                    │                 │              │
        └────────────────────┴─────────────────┴──────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼──────────┐     ┌────────▼────────┐
        │ MongoDB          │     │ Qdrant          │
        │ docupload        │     │ docembed        │
        │ (Port 27017)     │     │ (Port 6333)     │
        └──────────────────┘     └─────────────────┘
                │
        ┌───────┴────────────────────────────────┐
        │ External Services                      │
        │ - OpenAI API                           │
        │ - Upstage OCR                          │
        │ - Naver Maps API                       │
        │ - N8N Webhooks                         │
        └────────────────────────────────────────┘
```

---

## 3. 백엔드 상세 분석

### 3.1 aims_api (Node.js Express)

#### 디렉토리 구조

```
backend/api/aims_api/
├── server.js                        # 메인 서버 (5,815줄)
├── customer-relationships-routes.js # 고객 관계 라우트 (672줄)
├── routes/
│   ├── auth.js                      # 인증/OAuth
│   └── personal-files-routes.js     # 개인 파일 관리
├── middleware/
│   └── auth.js                      # JWT/API Key 인증
├── config/
│   └── passport.js                  # Passport 설정
├── lib/
│   ├── documentStatusHelper.js      # 문서 상태 분석
│   └── timeUtils.js                 # 시간 유틸리티
├── migrations/                      # DB 마이그레이션
├── __tests__/                       # Jest 테스트 (98개)
└── tests/                           # Migration 테스트 (34개)
```

#### API 엔드포인트 (61개)

##### 문서 관리 (11개)
```
GET    /api/documents                    # 문서 목록 조회
GET    /api/documents/status             # 모든 문서 상태
GET    /api/documents/:id/status         # 특정 문서 상태
GET    /api/documents/statistics         # 문서 통계
POST   /api/documents/:id/retry          # 문서 처리 재시도
DELETE /api/documents/:id                # 문서 삭제
DELETE /api/documents                    # 일괄 삭제
PATCH  /api/documents/set-annual-report  # AR 설정
GET    /webhook/get-status/:document_id  # Webhook 상태 조회
```

##### 고객 관리 (9개)
```
GET    /api/customers                    # 고객 목록
POST   /api/customers                    # 고객 생성
POST   /api/customers/bulk               # 일괄 생성
POST   /api/customers/validate-names     # 중복 검증
GET    /api/customers/:id                # 고객 조회
PUT    /api/customers/:id                # 고객 수정
DELETE /api/customers/:id                # 고객 삭제 (soft)
POST   /api/customers/:id/restore        # 고객 복원
```

##### 고객-문서 관계 (4개)
```
POST   /api/customers/:id/documents           # 문서 업로드
GET    /api/customers/:id/documents           # 고객 문서 목록
PATCH  /api/customers/:id/documents/:doc_id  # 문서 메타 수정
DELETE /api/customers/:id/documents/:doc_id  # 고객 문서 삭제
```

##### 계약 관리 (9개)
```
GET    /api/contracts                # 계약 목록
GET    /api/contracts/:id            # 계약 조회
POST   /api/contracts                # 계약 생성
POST   /api/contracts/bulk           # 일괄 생성
PUT    /api/contracts/:id            # 계약 수정
DELETE /api/contracts/:id            # 계약 삭제
DELETE /api/contracts/bulk           # 일괄 삭제
```

##### 연간보고서 (7개)
```
POST   /api/annual-report/check              # AR 검증
POST   /api/annual-report/parse-file         # 파일 파싱
POST   /api/annual-report/parse              # URL 파싱
GET    /api/annual-report/status/:file_id   # 파싱 상태
GET    /api/customers/:customerId/annual-reports         # AR 조회
GET    /api/customers/:customerId/annual-reports/pending # 대기 중
GET    /api/customers/:customerId/annual-reports/latest  # 최신
DELETE /api/customers/:customerId/annual-reports         # AR 삭제
POST   /api/customers/:customerId/annual-reports/cleanup-duplicates
```

##### 기타
- **주소/지오코딩** (3개): 주소 검색, 역지오코딩
- **사용자 관리** (3개): 사용자 CRUD
- **관리자** (4개): 데이터 무결성, 고아 관계 정리
- **배경작업**: AR 파싱 트리거

#### 주요 모듈

##### server.js (5,815줄)
- 메인 애플리케이션 진입점
- 모든 문서/고객/계약 API 엔드포인트
- 61개 라우트 정의

##### middleware/auth.js
```javascript
// JWT 인증 미들웨어
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
    req.user = decoded; // { id, name, role }
    next();
  });
}

// API Key 인증 (N8N용)
function authenticateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey === process.env.N8N_API_KEY) {
    req.user = {
      id: req.body.userId,
      role: 'system',
      authMethod: 'apiKey'
    };
    next();
  } else {
    res.status(403).json({ error: 'Invalid API key' });
  }
}
```

##### lib/documentStatusHelper.js
```javascript
// 문서 처리 단계별 진행률 계산
function calculateProgressPercentage(document) {
  const stages = {
    upload: 20,      // 업로드 완료
    meta: 40,        // 메타데이터 추출
    ocr_prep: 60,    // OCR 준비 (full_text 있으면 스킵)
    ocr: 80,         // OCR 완료
    docembed: 100    // 임베딩 완료
  };

  // 현재 진행 단계 확인
  if (document.docembed?.status === 'done') return 100;
  if (document.ocr?.status === 'done') return 80;
  if (document.meta?.meta_status === 'ok') {
    return document.meta.full_text ? 50 : 40;
  }
  if (document.upload?.uploaded_at) return 20;
  return 0;
}
```

#### 인증 및 권한

##### JWT 토큰 구조
```javascript
{
  "id": "userId",          // MongoDB ObjectId 문자열
  "name": "설계사명",
  "role": "user" | "admin",
  "iat": 1699082241,      // 발행 시간
  "exp": 1706858241       // 만료 (7일)
}
```

##### 데이터 격리 패턴
```javascript
// 고객 조회 시 소유권 검증
const customer = await db.collection('customers').findOne({
  _id: new ObjectId(id),
  'meta.created_by': req.user.id  // ⭐ 설계사별 격리
});

// 문서 조회 시 소유자 필터
const documents = await db.collection('files').find({
  ownerId: req.user.id,  // ⭐ 설계사별 격리
  customerId: customerId
}).toArray();
```

---

### 3.2 aims_rag_api (Python FastAPI)

#### 하이브리드 검색 엔진

```
┌──────────────────────────────────────────────────────────┐
│ User Query: "2024년 김철수님 보험료는?"                  │
└────────────────┬─────────────────────────────────────────┘
                 │
        ┌────────▼───────────┐
        │ QueryAnalyzer      │
        │ - entity 추출      │
        │ - concept 분석     │
        │ - intent 판별      │
        └────────┬───────────┘
                 │
     ┌───────────┴────────────────┐
     │ Query Type: mixed          │
     │ - entities: ["김철수", "2024"] │
     │ - concepts: ["보험료"]       │
     └───────────┬────────────────┘
                 │
        ┌────────┴─────────┬─────────────────────┐
        │                  │                     │
┌───────▼────────┐ ┌───────▼────────┐ ┌─────────▼────────┐
│ Entity Search  │ │ Vector Search  │ │ Metadata Search  │
│ (MongoDB)      │ │ (Qdrant)       │ │ (MongoDB)        │
│ - 파일명 매칭   │ │ - 의미적 유사도 │ │ - 태그, 요약     │
└───────┬────────┘ └───────┬────────┘ └─────────┬────────┘
        │                  │                     │
        └──────────────────┴─────────────────────┘
                           │
                  ┌────────▼──────────┐
                  │ Result Merge      │
                  │ - 중복 제거       │
                  └────────┬──────────┘
                           │
                  ┌────────▼──────────┐
                  │ Cross-Encoder     │
                  │ Reranker          │
                  │ - 재순위화        │
                  └────────┬──────────┘
                           │
                  ┌────────▼──────────┐
                  │ LLM Answer        │
                  │ Generation        │
                  │ (GPT-4)           │
                  └───────────────────┘
```

#### 주요 모듈

| 모듈 | 역할 |
|------|------|
| **rag_search.py** | FastAPI 메인 앱, 쿼리 처리 |
| **hybrid_search.py** | 하이브리드 검색 엔진 (11K줄) |
| **query_analyzer.py** | 쿼리 의도 분석 (entity/concept/mixed) |
| **reranker.py** | Cross-Encoder 기반 재순위화 |
| **search_logger.py** | 검색 로깅 및 분석 |
| **quality_analyzer.py** | 검색 품질 모니터링 |
| **alert_system.py** | 품질 경고 시스템 |

#### 검색 전략

##### 1) Entity Search (개체명 기반)
```python
# 적용: "김철수 고객 정보" → entity
# 검색 필드:
- upload.originalName (파일명) - 완벽 매칭 +10점
- meta.full_text (전문)
- meta.tags (AI 태그)
- ocr.tags (OCR 태그)

# MongoDB Aggregation
db.files.aggregate([
  { "$match": {
      "ownerId": user_id,
      "$or": [
        { "upload.originalName": { "$regex": "김철수", "$options": "i" } },
        { "meta.tags": { "$in": ["김철수"] } }
      ]
    }
  },
  { "$addFields": {
      "score": {
        "$add": [
          { "$cond": [{ "$regexMatch": { "input": "$upload.originalName", "regex": "김철수" }}, 10, 0] },
          { "$cond": [{ "$in": ["김철수", "$meta.tags"] }, 5, 0] }
        ]
      }
    }
  },
  { "$sort": { "score": -1 } },
  { "$limit": 10 }
])
```

##### 2) Vector Search (의미 기반)
```python
# 적용: "작년 보험료는?" → concept
# 프로세스:
1. OpenAI embedding: text-embedding-3-small (1536차원)
2. Qdrant 벡터 검색
3. 고객별 필터링 (owner_id + customer_id)
4. 문서별 중복 제거 (최고 점수 청크만)

# Qdrant Query
qdrant_client.search(
  collection_name="docembed",
  query_vector=embedded_query,
  query_filter={
    "must": [
      {"key": "owner_id", "match": {"value": user_id}},
      {"key": "customer_id", "match": {"value": customer_id}}
    ]
  },
  limit=20
)
```

##### 3) Hybrid Search (혼합)
```python
# 적용: "2024년 김철수 보험료" → mixed
# 프로세스:
1. Entity 검색 + Vector 검색 병렬 실행
2. 결과 병합
3. 중복 제거 (doc_id 기준)
4. Cross-Encoder 재순위화

# Cross-Encoder Reranking
pairs = [(query, doc['text']) for doc in results]
scores = cross_encoder.predict(pairs)
reranked_results = sorted(zip(results, scores), key=lambda x: x[1], reverse=True)
```

#### API 요청/응답

```python
# Request
class SearchRequest(BaseModel):
    query: str
    mode: str = "OR"  # AND | OR
    search_mode: str = "hybrid"  # entity | semantic | hybrid
    user_id: Optional[str] = None
    customer_id: Optional[str] = None
    top_k: int = 10

# Response
class UnifiedSearchResponse(BaseModel):
    search_mode: str
    answer: Optional[str]  # LLM 생성 답변
    search_results: List[DocumentMatch]
    execution_time: float
```

---

### 3.3 doc_status_api (Python FastAPI)

#### 실시간 문서 상태 모니터링

```python
# MongoDB Change Stream 모니터링
async def watch_changes():
    pipeline = [
        { "$match": { "operationType": { "$in": ["insert", "update"] } } },
        { "$match": { "fullDocument.ownerId": { "$exists": True } } }
    ]

    async with db.files.watch(pipeline) as stream:
        async for change in stream:
            doc = change['fullDocument']
            status = analyze_document_status(doc)
            await broadcast_status(status)  # WebSocket 브로드캐스트
```

#### 문서 상태 분석

```python
class DocumentStatus(BaseModel):
    id: str
    overall_status: str  # pending | processing | completed | error
    upload_status: str
    meta_status: str
    ocr_status: str
    embed_status: str
    progress_percentage: int  # 0-100
    stages: Dict[str, Any]
    created_at: Optional[str]
    last_updated: Optional[str]

# 진행률 계산
def calculate_progress(doc):
    if doc.get('docembed', {}).get('status') == 'done':
        return 100
    if doc.get('ocr', {}).get('status') == 'done':
        return 80
    if doc.get('meta', {}).get('meta_status') == 'ok':
        return 50 if doc['meta'].get('full_text') else 40
    if doc.get('upload', {}).get('uploaded_at'):
        return 20
    return 0
```

#### WebSocket 실시간 업데이트

```python
@app.websocket("/ws/document-status/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            # 주기적으로 사용자의 문서 상태 전송
            documents = await get_user_documents(user_id)
            statuses = [analyze_document_status(doc) for doc in documents]
            await websocket.send_json({"type": "status_update", "data": statuses})
            await asyncio.sleep(2)  # 2초마다 업데이트
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
```

---

### 3.4 annual_report_api (Python FastAPI)

#### 연간보고서 파싱 큐 시스템

```python
# 큐 관리자
class ARParseQueueManager:
    def __init__(self):
        self.pending = []    # 대기 중
        self.processing = {} # 처리 중 (worker_id: task)
        self.completed = []  # 완료
        self.failed = []     # 실패

    def enqueue(self, file_id, customer_id):
        task = {
            "id": str(uuid.uuid4()),
            "file_id": file_id,
            "customer_id": customer_id,
            "status": "pending",
            "created_at": datetime.utcnow()
        }
        self.pending.append(task)
        return task

    def get_next_task(self):
        if self.pending:
            task = self.pending.pop(0)
            task["status"] = "processing"
            self.processing[task["id"]] = task
            return task
        return None

# 워커 (1초 폴링)
async def queue_worker():
    while True:
        task = queue_manager.get_next_task()
        if task:
            try:
                result = await parse_annual_report(task['file_id'])
                task['status'] = 'completed'
                task['result'] = result
                queue_manager.completed.append(task)
            except Exception as e:
                task['status'] = 'failed'
                task['error'] = str(e)
                queue_manager.failed.append(task)
        await asyncio.sleep(1)  # 1초 대기
```

#### AR 파싱 로직

```python
async def parse_annual_report(file_path):
    # 1. PDF → 이미지 변환 (필요시)
    # 2. OpenAI GPT-4.1로 텍스트 추출
    prompt = """
    다음 보험 연차보고서 이미지에서 계약 테이블을 추출하세요.
    출력 형식: JSON
    - customer_name: 고객명
    - contracts: [{ policy_number, product_name, premium, ... }]
    """

    response = openai.ChatCompletion.create(
        model="gpt-4.1",
        messages=[
            {"role": "system", "content": "보험 연차보고서 파싱 전문가"},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]}
        ]
    )

    # 3. JSON 파싱 및 검증
    data = json.loads(response.choices[0].message.content)

    # 4. MongoDB 저장
    await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$push": {"annual_reports": {
            "issue_date": data['issue_date'],
            "source_file_id": file_id,
            "parsed_data": data
        }}}
    )

    return data
```

---

### 3.5 데이터베이스 스키마

#### files (문서)

```javascript
{
  _id: ObjectId,

  // 업로드 정보
  upload: {
    originalName: String,      // 원본 파일명
    saveName: String,          // 서버 저장 파일명
    mimeType: String,          // application/pdf
    destPath: String,          // 파일 경로
    uploaded_at: ISODate,      // UTC ISO 8601
    uploadedBy: ObjectId,      // 업로더 ID
    size_bytes: Number
  },

  // 메타데이터 (PDF 직접 텍스트 추출)
  meta: {
    meta_status: String,       // "ok" | "error" | null
    mime: String,
    size_bytes: Number,
    pdf_pages: Number,
    full_text: String,         // ⭐ 있으면 OCR 스킵
    summary: String,           // AI 요약
    tags: [String],            // AI 태그
    created_at: ISODate
  },

  // OCR 처리 (full_text 없을 때만)
  ocr: {
    status: String,            // "pending" | "processing" | "done" | "failed"
    warn: String,              // 경고 메시지 (이진 파일 등)
    full_text: String,         // OCR 추출 텍스트
    summary: String,
    tags: [String],
    confidence: Number,
    queued_at: ISODate,
    started_at: ISODate,
    done_at: ISODate,
    failed_at: ISODate
  },

  // 벡터 임베딩
  docembed: {
    status: String,            // "pending" | "done" | "error"
    embed_ids: [Number],       // Qdrant 포인트 IDs
    updated_at: ISODate
  },

  // 소유권
  ownerId: String,             // ⭐ 설계사 ID (격리 키)
  customerId: ObjectId,        // 고객 ID

  // 연간보고서
  is_annual_report: Boolean,
  annualReportYear: Number,
  ar_metadata: {
    customer_name: String,
    report_title: String,
    issue_date: String
  },

  // 고객 관계 (선택)
  customer_relation: {
    customer_id: ObjectId,
    relationship_type: String
  }
}
```

#### customers (고객)

```javascript
{
  _id: ObjectId,

  // 개인 정보
  personal_info: {
    name: String,              // ⭐ 필수, 고객명
    phone: String,
    email: String,
    birth_date: String,        // YYYY-MM-DD
    gender: String,            // "M" | "F"
    id_number: String          // 주민등록번호 (암호화)
  },

  // 보험 정보
  insurance_info: {
    customer_type: String,     // "개인" | "법인"
    customer_code: String,
    insurance_company: String
  },

  // 주소 정보
  address_info: {
    address: String,
    postal_code: String,
    latitude: Number,
    longitude: Number
  },

  // 메타데이터
  meta: {
    status: String,            // "active" | "inactive"
    created_at: ISODate,
    updated_at: ISODate,
    updated_by: ObjectId,
    created_by: String         // ⭐ 설계사 ID (격리 키)
  },

  // Soft Delete
  deleted_at: ISODate | null,
  deleted_by: ObjectId | null,

  // 연간보고서 데이터
  annual_reports: [{
    issue_date: Date,
    source_file_id: ObjectId,  // files._id
    customer_name: String,
    parsed_data: {
      contracts: [],
      beneficiaries: []
    }
  }]
}
```

**Unique Index:**
```javascript
db.customers.createIndex(
  {
    'personal_info.name': 1,
    'insurance_info.customer_type': 1
  },
  {
    unique: true,
    collation: { locale: 'ko', strength: 2 }  // 한글 case-insensitive
  }
)
```

#### contracts (계약)

```javascript
{
  _id: ObjectId,

  // 계약 기본 정보
  policy_number: String,       // ⭐ 증권번호 (unique)
  customer_id: ObjectId,       // 계약자
  insured_id: ObjectId,        // 피보험자
  beneficiary_id: ObjectId,    // 수익자

  // 상품 정보
  product_id: ObjectId,
  product_name: String,
  insurance_company: String,

  // 계약 상태
  contract_status: String,     // "active" | "lapsed" | "cancelled" | "matured"
  start_date: String,          // YYYY-MM-DD
  maturity_date: String,

  // 보험료
  premium: Number,
  premium_frequency: String,   // "monthly" | "quarterly" | "yearly"

  // 권한
  agent_id: ObjectId,          // ⭐ 설계사 ID (격리 키)

  // 메타
  meta: {
    created_at: ISODate,
    updated_at: ISODate,
    notes: String
  }
}
```

#### customer_relationships (고객 관계)

```javascript
{
  _id: ObjectId,

  relationship_info: {
    from_customer_id: ObjectId,
    to_customer_id: ObjectId,
    relationship_type: String,      // "spouse", "parent", "child" 등
    relationship_category: String,  // "family", "professional", "corporate"
    is_bidirectional: Boolean,
    reverse_relationship: String,   // 역방향 관계 타입
    status: String,                 // "active" | "inactive"
    strength: String                // "strong" | "medium" | "weak"
  },

  relationship_details: {
    shared_residence: Boolean,
    business_collaboration: String,
    insurance_relevance: String
  },

  insurance_relevance: {
    affects_coverage: Boolean,
    notes: String
  },

  meta: {
    created_at: ISODate,
    updated_at: ISODate,
    created_by: ObjectId,
    last_modified_by: ObjectId
  }
}
```

**관계 타입:**
```javascript
RELATIONSHIP_TYPES = {
  family: {
    spouse: { reverse: 'spouse', bidirectional: true },
    parent: { reverse: 'child', bidirectional: false },
    child: { reverse: 'parent', bidirectional: false }
  },
  relative: {
    uncle_aunt: { reverse: 'nephew_niece' },
    cousin: { reverse: 'cousin', bidirectional: true }
  },
  professional: {
    supervisor: { reverse: 'subordinate' },
    colleague: { reverse: 'colleague', bidirectional: true }
  },
  corporate: {
    ceo: { reverse: 'company' },
    employee: { reverse: 'employer' }
  }
}
```

#### users (사용자)

```javascript
{
  _id: ObjectId,

  // 소셜 인증 ID
  kakaoId: String,
  naverId: String,
  googleId: String,

  // 프로필
  name: String,
  email: String,
  avatarUrl: String,

  // 권한
  role: String,                 // "user" | "admin"
  authProvider: String,         // "kakao" | "naver" | "google"

  // 프로필 상태
  profileCompleted: Boolean,

  // 메타
  createdAt: ISODate,
  lastLogin: ISODate
}
```

#### personal_files (개인 파일)

```javascript
{
  _id: ObjectId,

  userId: String,               // 소유자 ID
  type: String,                 // "folder" | "file"
  name: String,
  parentId: ObjectId | null,    // 상위 폴더 (root면 null)

  // 파일 정보 (type="file"일 때)
  mimeType: String,
  size: Number,
  filePath: String,

  isDeleted: Boolean,           // Soft delete
  deletedAt: ISODate | null,

  createdAt: ISODate,
  updatedAt: ISODate
}
```

---

## 4. 프론트엔드 상세 분석

### 4.1 aims-uix3 (React + TypeScript + Vite)

#### 전체 디렉토리 구조

```
frontend/aims-uix3/
├── src/
│   ├── app/                    # 앱 설정
│   │   └── queryClient.ts      # TanStack Query 설정
│   ├── pages/                  # 페이지 컴포넌트
│   │   ├── home/
│   │   ├── LoginPage.tsx
│   │   └── AuthCallbackPage.tsx
│   ├── components/             # 기능 컴포넌트 (레이아웃 관점)
│   │   ├── Header/
│   │   ├── DocumentViews/      # 문서 관리 기능
│   │   ├── CustomerViews/      # 고객 관리 기능
│   │   ├── ContractViews/      # 계약 관리 기능
│   │   ├── PDFViewer/
│   │   ├── ImageViewer/
│   │   └── SFSymbol/
│   ├── features/               # Feature-Sliced Design
│   │   ├── customer/
│   │   ├── batch-upload/
│   │   └── AccountSettings/
│   ├── services/               # API 서비스 레이어
│   │   ├── customerService.ts
│   │   ├── contractService.ts
│   │   ├── DocumentService.ts
│   │   └── searchService.ts
│   ├── entities/               # 도메인 모델
│   │   ├── customer/
│   │   ├── document/
│   │   └── contract/
│   ├── stores/                 # Zustand 전역 상태
│   │   ├── user.ts
│   │   └── CustomerDocument.ts
│   ├── contexts/               # React Context
│   │   ├── CustomerContext.tsx
│   │   └── DocumentStatusContext.tsx
│   ├── providers/              # Context + Query 통합
│   │   └── DocumentStatusProvider.tsx
│   ├── controllers/            # 비즈니스 로직 Hook
│   │   ├── useDocumentsController.tsx
│   │   └── useCustomerRelationshipsController.ts
│   ├── hooks/                  # 커스텀 Hook
│   │   ├── useCustomerDocument.ts
│   │   ├── useNavigation.ts
│   │   └── usePersistedState.ts
│   ├── shared/                 # 공유 모듈
│   │   ├── ui/                 # UI 컴포넌트 라이브러리
│   │   ├── lib/                # 유틸리티
│   │   ├── api/                # API 클라이언트
│   │   ├── design/             # 디자인 토큰
│   │   └── components/         # 공유 컴포넌트
│   ├── utils/                  # 앱 유틸리티
│   ├── types/                  # 전역 타입
│   ├── App.tsx                 # 메인 앱
│   ├── AppRouter.tsx           # 라우팅
│   └── main.tsx                # 진입점
├── docs/                       # 문서
├── public/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

#### 주요 페이지 및 기능

##### 문서 관리 Views

| View | 경로 | 기능 |
|------|------|------|
| **DocumentLibraryView** | components/DocumentViews/ | 고객별 문서 조회 |
| **DocumentRegistrationView** | components/DocumentViews/ | 문서 업로드/등록 |
| **DocumentSearchView** | components/DocumentViews/ | 문서 전체 검색 (RAG) |
| **DocumentManagementView** | components/DocumentViews/ | 문서 일괄 관리 (삭제 등) |
| **DocumentStatusView** | components/DocumentViews/ | 문서 처리 상태 조회 |
| **PersonalFilesView** | components/DocumentViews/ | 개인 파일 (Google Drive 스타일) |

##### 고객 관리 Views

| View | 경로 | 기능 |
|------|------|------|
| **CustomerManagementView** | components/CustomerViews/ | 고객 CRUD |
| **CustomerRegistrationView** | components/CustomerViews/ | 고객 신규 등록 |
| **CustomerAllView** | components/CustomerViews/ | 전체 고객 조회 (테이블) |
| **CustomerRegionalView** | components/CustomerViews/ | 지역별 고객 조회 (지도) |
| **CustomerRelationshipView** | components/CustomerViews/ | 가족/기업 관계도 |
| **CustomerDetailView** | features/customer/views/ | 고객 상세 정보 (탭) |

##### 계약 관리 Views

| View | 경로 | 기능 |
|------|------|------|
| **ContractManagementView** | components/ContractViews/ | 계약 관리 |
| **ContractAllView** | components/ContractViews/ | 전체 계약 조회 |
| **ContractImportView** | components/ContractViews/ | 계약 엑셀 일괄 등록 |

---

### 4.2 상태 관리 아키텍처

#### 전체 데이터 흐름

```
┌────────────────────────────────────────────────────────────┐
│                  DATA FLOW ARCHITECTURE                     │
└────────────────────────────────────────────────────────────┘

서버 상태 (Server State)
  ├─ TanStack Query (React Query)
  │  ├─ queryClient.ts: 캐싱, 재시도, refetch 설정
  │  ├─ staleTime: 5분
  │  ├─ cacheTime: 10분
  │  └─ retry: 3회
  │
  └─ Service Layer (API 추상화)
     ├─ customerService.ts
     ├─ DocumentService.ts
     ├─ contractService.ts
     └─ searchService.ts

═══════════════════════════════════════════════════════════════

클라이언트 상태 (Client State)
  ├─ Zustand Stores (전역 상태)
  │  ├─ useAuthStore (인증 - persist)
  │  ├─ useUserStore (현재 사용자)
  │  ├─ useDevModeStore (개발자 모드)
  │  └─ CustomerDocument (고객-문서 맵핑)
  │
  ├─ React Context (도메인별)
  │  ├─ CustomerContext + CustomerProvider
  │  ├─ DocumentSearchContext
  │  ├─ DocumentStatusContext
  │  └─ AppleConfirmProvider
  │
  └─ Controllers (Service + Context 연결)
     ├─ useDocumentsController
     ├─ useDocumentSearchController
     ├─ useDocumentStatusController
     └─ useCustomerRelationshipsController
```

#### 데이터 흐름 예시: 고객 조회

```
1. CustomerManagementView (View 컴포넌트)
      ↓ 클릭
2. useCustomersController() (Controller Hook)
      ↓ 상태 및 액션 제공
3. CustomerProvider (Context + React Query)
      ↓ useQuery 호출
4. CustomerService.getCustomers() (Service Layer)
      ↓ API 호출
5. api.get('/api/customers') (API Client - shared/lib/api.ts)
      ↓ HTTP GET 요청
6. Backend /api/customers
      ↓ 데이터 응답
7. CustomerUtils.validateSearchResponse() (Entity 검증)
      ↓ Zod 스키마 검증
8. React Query Cache 저장
      ↓
9. Context 상태 업데이트
      ↓
10. View 컴포넌트 리렌더링
```

#### TanStack Query 설정

```typescript
// app/queryClient.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5분 동안 fresh 유지
      cacheTime: 1000 * 60 * 10,     // 10분 동안 캐시 유지
      retry: 3,                       // 실패 시 3회 재시도
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,    // 윈도우 포커스 시 재조회 비활성화
      refetchOnReconnect: true,       // 재연결 시 재조회
      refetchOnMount: true            // 마운트 시 재조회
    },
    mutations: {
      retry: 1                        // 뮤테이션은 1회만 재시도
    }
  }
});
```

---

### 4.3 서비스 레이어

#### API 클라이언트 (shared/lib/api.ts)

```typescript
// HTTP 클라이언트 wrapper
class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3010';
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
      ...options
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(endpoint: string, body: any, options?: RequestOptions): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      ...options
    });
    return this.handleResponse<T>(response);
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    // JWT 토큰 추가
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 개발 모드: x-user-id 추가
    const userId = localStorage.getItem('userId');
    if (userId && import.meta.env.DEV) {
      headers['x-user-id'] = userId;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(response.status, error.message);
    }
    return response.json();
  }
}

export const api = new ApiClient();
```

#### 서비스 예시: customerService.ts

```typescript
// services/customerService.ts
export class CustomerService {
  // 고객 목록 조회
  static async getCustomers(params: {
    status?: 'active' | 'inactive' | 'all';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Customer[]> {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.search) queryParams.append('search', params.search);
    if (params.limit) queryParams.append('limit', String(params.limit));
    if (params.offset) queryParams.append('offset', String(params.offset));

    const response = await api.get<{ data: Customer[] }>(
      `/api/customers?${queryParams.toString()}`
    );

    // Zod 스키마 검증
    return response.data.map(customer => CustomerSchema.parse(customer));
  }

  // 고객 생성
  static async createCustomer(data: CreateCustomerInput): Promise<Customer> {
    // 입력 검증
    const validatedData = CreateCustomerSchema.parse(data);

    const response = await api.post<{ data: Customer }>(
      '/api/customers',
      validatedData
    );

    // 이벤트 발생 (전역 상태 업데이트)
    window.dispatchEvent(new CustomEvent('customerChanged'));

    return CustomerSchema.parse(response.data);
  }

  // 고객 삭제 (Soft Delete)
  static async deleteCustomer(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(`/api/customers/${id}`);
    window.dispatchEvent(new CustomEvent('customerChanged'));
  }

  // 고객 영구 삭제 (Hard Delete with Cascade)
  static async permanentDeleteCustomer(id: string): Promise<void> {
    await api.delete<{ success: boolean }>(
      `/api/customers/${id}?permanent=true`
    );
    // 연결된 문서, 계약, 관계도 모두 삭제됨
    window.dispatchEvent(new CustomEvent('customerChanged'));
    window.dispatchEvent(new CustomEvent('contractChanged'));
    window.dispatchEvent(new CustomEvent('documentChanged'));
  }
}
```

---

### 4.4 디자인 시스템

#### Apple Design Philosophy

AIMS는 Apple의 디자인 원칙을 따릅니다:

1. **Clarity (명확성)**: 정보 계층이 명확하고 직관적
2. **Deference (존중)**: UI가 콘텐츠를 방해하지 않음
3. **Depth (깊이)**: 자연스러운 시각적 계층과 애니메이션

**Progressive Disclosure**: "Invisible until you need it"
- 필요할 때만 표시되는 기능
- 화려한 그라데이션, 강한 색상 강조 금지

#### Design Tokens (shared/design/tokens.css)

```css
/* Colors */
:root {
  /* Primary (파랑) */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-900: #1e3a8a;

  /* Neutral (회색) */
  --color-neutral-0: #ffffff;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-500: #737373;
  --color-neutral-950: #0a0a0a;

  /* Semantic Colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --color-favorite: #fbbf24;

  /* Spacing */
  --gap-xs: 4px;
  --gap-sm: 8px;
  --gap-md: 16px;
  --gap-lg: 24px;
  --gap-xl: 32px;
}
```

#### 타이포그래피 (Dense System)

```css
/* 섹션 제목 */
.section-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

/* 테이블 데이터 */
.table-data {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

/* 테이블 헤더 */
.table-header {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  text-transform: uppercase;
}

/* 배지 */
.badge {
  font-size: 10px;
  font-weight: 400;
  padding: 2px 8px;
  border-radius: 12px;
}

/* 본문 */
.body-text {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
}
```

**중요**: `font-weight: 500` 사용 금지!

#### 테마 (Light/Dark)

```css
/* Light Theme (기본) */
:root {
  --background: var(--color-neutral-0);
  --foreground: var(--color-neutral-950);
  --border: var(--color-neutral-200);
}

/* Dark Theme */
[data-theme="dark"] {
  --background: var(--color-neutral-950);
  --foreground: var(--color-neutral-0);
  --border: var(--color-neutral-800);
}
```

#### 공유 UI 컴포넌트 (shared/ui/)

| 컴포넌트 | Variants | 용도 |
|---------|----------|------|
| **Button** | primary, secondary, ghost, destructive, link | 기본 버튼 |
| **Modal** | - | 기본 모달 |
| **DraggableModal** | - | 드래그/리사이즈 가능 모달 |
| **Input** | - | 입력 필드 |
| **FormField** | - | 레이블 + 입력 + 에러 메시지 |
| **Dropdown** | - | 드롭다운 선택 |
| **Tooltip** | - | iOS 스타일 툴팁 |
| **LoadingSkeleton** | - | 로딩 중 스켈레톤 UI |
| **StatCard** | - | 통계 카드 |
| **CustomerSelectorModal** | - | 고객 선택 모달 |
| **FamilySelectorModal** | - | 가족 선택 모달 |

**사용 예시:**
```tsx
import { Button } from '@/shared/ui';

<Button variant="primary" onClick={handleSave}>
  저장
</Button>

<Button variant="destructive" onClick={handleDelete}>
  삭제
</Button>
```

---

## 5. 핵심 비즈니스 로직

### 5.1 문서 처리 워크플로우

```
┌──────────────────────────────────────────────────────────┐
│ 1. 프론트엔드 파일 업로드                                 │
└──────────────┬───────────────────────────────────────────┘
               │ FormData (multipart/form-data)
     ┌─────────▼────────────┐
     │ Node.js API (3010)  │
     │ - 멀티파트 파일 처리 │
     │ - 파일 저장         │
     │ - MongoDB 메타 저장 │
     └─────────┬────────────┘
               │
     ┌─────────▼────────────┐
     │ 2. 메타데이터 추출   │
     │ (Python)             │
     │ - PDF 텍스트 추출   │
     │ - full_text 생성    │
     │ - AI 요약/태그      │
     └─────────┬────────────┘
               │
    ┌──────────▼───────────┐
    │ full_text 있나?      │
    └──┬───────────────┬───┘
       │ Yes           │ No
       │               │
       │        ┌──────▼──────────┐
       │        │ 3. OCR 처리     │
       │        │ (Upstage API)   │
       │        │ - 이미지 → 텍스트 │
       │        │ - 신뢰도 점수   │
       │        └──────┬──────────┘
       │               │
       └───────┬───────┘
               │
     ┌─────────▼────────────┐
     │ 4. Vector Embedding  │
     │ (OpenAI API)         │
     │ - text-embedding-3-sm│
     │ - 1536차원 벡터      │
     │ - Qdrant 저장        │
     └─────────┬────────────┘
               │
     ┌─────────▼────────────┐
     │ 5. 검색 준비 완료    │
     │ (Keyword + Vector)   │
     └──────────────────────┘
```

#### 처리 단계별 상태

| 단계 | 필드 | 진행률 | 설명 |
|------|------|--------|------|
| **Upload** | `upload.uploaded_at` | 20% | 파일 업로드 완료 |
| **Meta** | `meta.meta_status = "ok"` | 40-50% | 메타데이터 추출 완료 |
| **OCR** | `ocr.status = "done"` | 80% | OCR 텍스트 추출 완료 |
| **Embedding** | `docembed.status = "done"` | 100% | 벡터 임베딩 완료 |

#### OCR 처리 로직

```python
# meta.full_text 확인
if document.meta and document.meta.get('full_text'):
    # PDF에서 직접 텍스트 추출 성공
    # OCR 스킵 (ocr.warn = "Text extracted from PDF")
    skip_ocr = True
else:
    # OCR 필요
    # Upstage API 호출
    ocr_result = await upstage_ocr_api(document.upload.destPath)
    document.ocr = {
        "status": "done",
        "full_text": ocr_result.text,
        "confidence": ocr_result.confidence,
        "done_at": utcnow()
    }
```

#### 연간보고서 특별 처리

```python
# 1. AR 감지 (AI 기반)
is_ar = await check_annual_report(file_path)

if is_ar.confidence > 0.8:
    # 2. 1페이지 메타데이터 추출 (빠름, AI 불사용)
    first_page_data = extract_first_page_info(file_path)

    # 3. MongoDB 업데이트
    db.files.update_one(
        {"_id": file_id},
        {"$set": {
            "is_annual_report": True,
            "ar_metadata": {
                "customer_name": first_page_data['customer_name'],
                "report_title": first_page_data['title'],
                "issue_date": first_page_data['date']
            }
        }}
    )

    # 4. 큐 등록 (백그라운드 파싱)
    queue_manager.enqueue({
        "file_id": file_id,
        "customer_id": customer_id,
        "priority": "high"
    })
```

---

### 5.2 고객/계약 관리

#### 고객 생성 과정

```
1. 입력값 검증
   └─ CreateCustomerSchema (Zod)
   └─ 필수: personal_info.name, insurance_info.customer_type

2. 중복 검사
   └─ MongoDB Unique Index
   └─ Collation: { locale: 'ko', strength: 2 }
   └─ 중복 시 → 409 Conflict

3. 고객 생성
   └─ meta.created_by = JWT의 userId
   └─ meta.status = "active"
   └─ deleted_at = null

4. 설계사별 격리
   └─ 다른 설계사는 조회 불가 (403 Forbidden)
```

#### 고객 관계 관리

```javascript
// 양방향 관계 생성 예시: 부부
createRelationship({
  from_customer_id: customerA_id,
  to_customer_id: customerB_id,
  relationship_type: "spouse",
  is_bidirectional: true
})

// 자동으로 역방향 관계도 생성
// customerB → customerA: "spouse"

// 단방향 관계 예시: 부모-자식
createRelationship({
  from_customer_id: parent_id,
  to_customer_id: child_id,
  relationship_type: "parent",
  is_bidirectional: false,
  reverse_relationship: "child"
})

// 자동으로 역방향 관계 생성
// child → parent: "child"
```

---

### 5.3 검색 시스템 (RAG)

#### 하이브리드 검색 전략

```python
# 1. 쿼리 분석
query = "2024년 김철수님 보험료는?"
analysis = query_analyzer.analyze(query)
# {
#   "query_type": "mixed",
#   "entities": ["김철수", "2024년"],
#   "concepts": ["보험료"],
#   "metadata_keywords": ["김철수", "보험료"]
# }

# 2. 검색 전략 선택
if analysis.query_type == "entity":
    # MongoDB 메타데이터 검색
    results = mongodb_search(entities, user_id, customer_id)

elif analysis.query_type == "concept":
    # Qdrant 벡터 검색
    embedded_query = openai.embed(query)
    results = qdrant_search(embedded_query, user_id, customer_id)

elif analysis.query_type == "mixed":
    # 병렬 실행
    entity_results = mongodb_search(entities, user_id, customer_id)
    vector_results = qdrant_search(embedded_query, user_id, customer_id)

    # 결과 병합 + 중복 제거
    results = merge_results(entity_results, vector_results)

# 3. Cross-Encoder 재순위화
reranked_results = reranker.rerank(query, results)

# 4. LLM 답변 생성
context = "\n".join([r['text'] for r in reranked_results[:5]])
answer = openai.chat_completion(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "보험 문서 전문가"},
        {"role": "user", "content": f"질문: {query}\n\n문서:\n{context}"}
    ]
)

return {
    "search_mode": "hybrid",
    "answer": answer,
    "search_results": reranked_results
}
```

#### 권한 기반 필터링

```python
# Qdrant 벡터 검색 시 필터
qdrant_filter = {
    "must": [
        {"key": "owner_id", "match": {"value": user_id}},  # ⭐ 설계사 필터
        {"key": "customer_id", "match": {"value": customer_id}}  # 고객 필터 (선택)
    ]
}

# MongoDB 검색 시 필터
mongodb_filter = {
    "ownerId": user_id,  # ⭐ 설계사 필터
    "$or": [
        {"upload.originalName": {"$regex": keyword, "$options": "i"}},
        {"meta.tags": {"$in": [keyword]}},
        {"meta.full_text": {"$regex": keyword, "$options": "i"}}
    ]
}
```

---

### 5.4 권한 및 데이터 격리

#### JWT 인증 흐름

```
1. 카카오 로그인
   GET /api/auth/kakao

2. OAuth 콜백
   GET /api/auth/kakao/callback?code=...
   └─ Passport.js 인증
   └─ User 조회/생성

3. JWT 토큰 생성
   Payload: {
     id: user._id.toString(),
     name: user.name,
     role: 'user'
   }
   Secret: process.env.JWT_SECRET
   Expires: 7d

4. 프론트엔드로 redirect
   /auth/callback?token=<JWT>
   └─ localStorage.setItem('authToken', token)

5. API 요청 시
   Authorization: Bearer <JWT>
```

#### 데이터 격리 메커니즘

| 엔티티 | 격리 키 | 필터 방식 |
|--------|---------|----------|
| **customers** | `meta.created_by` | JWT의 userId 일치 확인 |
| **files** | `ownerId` | JWT의 userId 일치 확인 |
| **contracts** | `agent_id` | JWT의 userId 일치 확인 |
| **customer_relationships** | `from_customer_id`, `to_customer_id` | 양쪽 모두 내 고객인지 확인 |

**예시: 고객 조회 시 격리**
```javascript
// GET /api/customers/:id
app.get('/api/customers/:id', authenticateJWT, async (req, res) => {
  const userId = req.user.id;  // JWT에서 추출

  // ⭐ 소유권 검증
  const customer = await db.collection('customers').findOne({
    _id: new ObjectId(id),
    'meta.created_by': userId  // 내가 생성한 고객만
  });

  if (!customer) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  res.json({ data: customer });
});
```

---

### 5.5 삭제 및 생명주기 관리

#### Soft Delete (기본)

```javascript
// 고객 소프트 삭제
app.delete('/api/customers/:id', authenticateJWT, async (req, res) => {
  const { permanent } = req.query;

  if (permanent !== 'true') {
    // Default: Soft Delete
    await db.collection('customers').findOneAndUpdate(
      { _id: customerId, 'meta.created_by': userId },
      {
        $set: {
          'meta.status': 'inactive',
          'meta.updated_at': new Date().toISOString(),
          deleted_at: new Date(),
          deleted_by: userId
        }
      }
    );

    return res.json({ success: true, message: 'Soft deleted' });
  }

  // permanent=true인 경우 Hard Delete로 진행...
});
```

**조회 시 필터:**
```javascript
// 기본: active만
if (status === 'active' || !status) {
  filter['meta.status'] = 'active';
  filter['deleted_at'] = null;
}

// 휴면 고객만
else if (status === 'inactive') {
  filter['meta.status'] = 'inactive';
}

// 전체
else if (status === 'all') {
  // No filter
}
```

#### Hard Delete (Cascade)

```javascript
// 고객 완전 삭제
app.delete('/api/customers/:id?permanent=true', authenticateJWT, async (req, res) => {
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      // 1. 관계 삭제
      await db.collection('customer_relationships').deleteMany({
        $or: [
          { from_customer_id: customerId },
          { to_customer_id: customerId }
        ]
      }, { session });

      // 2. 계약 삭제
      await db.collection('contracts').deleteMany({
        customer_id: customerId
      }, { session });

      // 3. 문서 삭제 (cascade)
      const documents = await db.collection('files').find({
        customerId: customerId
      }).toArray();

      for (const doc of documents) {
        // 3-1. 파일시스템에서 파일 삭제
        if (doc.upload?.destPath) {
          await fs.unlink(doc.upload.destPath);
        }

        // 3-2. MongoDB에서 삭제
        await db.collection('files').deleteOne(
          { _id: doc._id },
          { session }
        );

        // 3-3. Qdrant에서 벡터 삭제
        await qdrantClient.delete('docembed', {
          filter: {
            must: [{
              key: 'doc_id',
              match: { value: doc._id.toString() }
            }]
          }
        });

        // 3-4. AR 데이터 정리 (있으면)
        if (doc.is_annual_report) {
          await db.collection('customers').updateOne(
            { _id: customerId },
            { $pull: { annual_reports: { source_file_id: doc._id } } },
            { session }
          );
        }
      }

      // 4. 고객 삭제
      await db.collection('customers').deleteOne(
        { _id: customerId },
        { session }
      );
    });

    res.json({ success: true, message: 'Permanently deleted' });
  } finally {
    await session.endSession();
  }
});
```

**삭제 순서 (중요):**
```
1. customer_relationships (관계)
   ↓
2. contracts (계약)
   ↓
3. files (문서)
   ├─ 파일시스템 삭제
   ├─ MongoDB 삭제
   ├─ Qdrant 벡터 삭제
   └─ AR 데이터 정리
   ↓
4. customers (고객)
```

#### 고객 복원

```javascript
// 소프트 삭제 고객 복원
app.post('/api/customers/:id/restore', authenticateJWT, async (req, res) => {
  await db.collection('customers').findOneAndUpdate(
    { _id: customerId, 'meta.created_by': userId },
    {
      $set: {
        'meta.status': 'active',
        deleted_at: null,
        deleted_by: null
      }
    }
  );

  res.json({ success: true });
});
```

---

## 6. 기술 스택 및 의존성

### 6.1 백엔드

#### Node.js (aims_api)

```json
{
  "dependencies": {
    "express": "^5.1.0",
    "mongodb": "^6.18.0",
    "@qdrant/js-client-rest": "^1.15.1",
    "passport": "^0.7.0",
    "passport-kakao": "^1.0.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^3.0.3",
    "multer": "^2.0.2",
    "form-data": "^4.0.4",
    "axios": "^1.11.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.1.4"
  }
}
```

#### Python (aims_rag_api, doc_status_api, annual_report_api)

```
fastapi==0.115.5
uvicorn[standard]==0.24.0
pymongo==4.6.0
openai==1.99.5
qdrant-client==1.15.1
sentence-transformers==3.0.1
langchain==0.3.27
pydantic==2.7.4
websockets==12.0
PyPDF2==3.0.1
pdfplumber==0.11.4
numpy==1.26.4
```

---

### 6.2 프론트엔드

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.3",
    "@tanstack/react-query": "^5.64.2",
    "zustand": "^5.0.3",
    "typescript": "^5.6.3"
  },
  "devDependencies": {
    "vite": "^6.0.11",
    "vitest": "^2.1.8",
    "@playwright/test": "^1.49.1",
    "eslint": "^9.17.0"
  }
}
```

---

## 7. 배포 및 운영

### 7.1 배포 환경

| 환경 | 위치/주소 | 설명 |
|------|----------|------|
| **백엔드 서버** | tars.giize.com | Ubuntu 24.04 LTS |
| **프론트엔드** | D:\aims (Windows) | 로컬 개발 |
| **MongoDB** | tars:27017 | docupload DB |
| **Qdrant** | tars:6333 | docembed collection |

### 7.2 Docker 구성

#### aims_api Dockerfile

```dockerfile
FROM node:18-slim
WORKDIR /app

ENV PORT=3010

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN mkdir -p logs

EXPOSE ${PORT}
CMD ["node", "server.js"]
```

#### 배포 스크립트 (deploy_aims_api.sh)

```bash
#!/bin/bash

CONTAINER_NAME="aims-api"
IMAGE_NAME="aims-api:latest"

# 환경변수 로드
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 1. 기존 컨테이너 중지 및 제거
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 2. 새 이미지 빌드 (BuildKit 사용)
DOCKER_BUILDKIT=1 docker build -t $IMAGE_NAME .

# 3. 컨테이너 실행
docker run -d --network host \
  -e PORT="3010" \
  -e MONGO_URI="${MONGO_URI}" \
  -e DB_NAME="${DB_NAME}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  -e N8N_API_KEY="${N8N_API_KEY}" \
  --name $CONTAINER_NAME \
  $IMAGE_NAME

echo "✅ 배포 완료"
echo "🌍 헬스체크: curl http://localhost:3010/api/health"
```

### 7.3 환경 변수

#### .env 파일 구조

```bash
# MongoDB
MONGO_URI=mongodb://tars:27017/
DB_NAME=docupload

# JWT
JWT_SECRET=your_jwt_secret_here_64_chars
JWT_EXPIRES_IN=7d

# 카카오 OAuth
KAKAO_CLIENT_ID=your_kakao_rest_api_key
KAKAO_CLIENT_SECRET=your_secret
KAKAO_CALLBACK_URL=https://aims.giize.com/api/auth/kakao/callback

# 네이버 지도
NAVER_MAP_ACCESS_KEY=your_access_key
NAVER_MAP_SECRET_KEY=your_secret_key

# OpenAI
OPENAI_API_KEY=sk-...

# N8N
N8N_API_KEY=your_n8n_api_key

# Upstage
UPSTAGE_API_KEY=your_upstage_api_key

# 프론트엔드
FRONTEND_URL=https://aims.giize.com
```

---

## 8. 테스트 전략

### 8.1 백엔드 테스트

#### Jest 테스트 (98개)

```bash
cd backend/api/aims_api
npm run test:ci

# 테스트 스위트:
# 1. customer-isolation.test.js (12개) - 고객 데이터 격리
# 2. cascadingDelete.test.js - Cascade delete 검증
# 3. bulkImport.test.js - 고객 일괄등록
# 4. documentDeletion.test.js - 문서 삭제
# 5. prepareDocumentResponse.test.js - 문서 응답 준비
# 6. arDeletion.test.js - AR 삭제
# 7. timeUtils.test.js - 시간 유틸리티
# 8. apiEndpoints.test.js - API 엔드포인트
```

#### Migration 테스트 (34개)

```bash
npm run test:migration

# 테스트 항목:
# - customer_relation 마이그레이션 (14개)
# - Cascade delete 검증 (20개)
#   - Backend 검증 (10개)
#   - Frontend 검증 (7개)
#   - 통합 검증 (3개)
```

### 8.2 프론트엔드 테스트

#### Vitest 단위 테스트 (3,645개)

```bash
cd frontend/aims-uix3
npm test

# Test Files: 164 passed, 2 skipped
# Tests: 3,645 passed, 26 skipped
# Duration: 57.63s

# 주요 테스트 스위트:
# - Document Management (27개)
# - UX Improvements (22개)
# - Modal Backdrop Blur (43개)
# - Naver Map (48개)
# - Customer Views (32개)
# - Excel Refiner (19개 + 8개)
# - Hooks (useCustomerDocument 등)
# - Services (DocumentService, UserService)
# - Utils (Navigation, Transformers)
```

### 8.3 테스트 결과 (2025-12-08)

| 구분 | 테스트 수 | 통과 | 실패 | 스킵 | 성공률 |
|------|-----------|------|------|------|--------|
| 백엔드 | 151 | 151 | 0 | 0 | 100% |
| 프론트엔드 | 3,671 | 3,645 | 0 | 26 | 100% |
| **총계** | **3,822** | **3,796** | **0** | **26** | **100%** |

**참조**: [TEST_RESULTS_2025-12-08.md](./TEST_RESULTS_2025-12-08.md)

---

## 9. 보안 고려사항

### 9.1 인증 및 권한

- **JWT 토큰**: 7일 유효기간, Bearer 인증 헤더
- **API Key**: N8N 통신용 X-API-Key 헤더 검증
- **카카오 OAuth**: Passport.js 기반 소셜 로그인

### 9.2 데이터 보호

- **소프트 삭제**: 데이터 복구 가능성 보장
- **데이터 격리**: ownerId/agent_id 기반 설계사별 완전 격리
- **암호화**: bcryptjs로 민감 정보 해싱

### 9.3 API 보안

- **CORS**: 프론트엔드 도메인만 허용
- **한글 처리**: UTF-8 정규화, 정규식 이스케이프
- **SQL Injection 방지**: MongoDB ObjectId 사용

### 9.4 취약점 관리

**최근 보안 수정** (2025-12-08):
- 6개 npm 보안 취약점 해결 (axios, jws, body-parser, js-yaml)
- 높음 심각도: 0개 (✅ 모두 해결)
- 중간 심각도: 2개 (passport-oauth2, passport-kakao - upstream fix 대기)

**참조**: [SECURITY_FIX_LOG.md](./SECURITY_FIX_LOG.md)

---

## 10. 성능 최적화

### 10.1 데이터베이스

- **MongoDB Aggregation**: 대용량 데이터 정렬/필터링
- **인덱스 전략**:
  - `(personal_info.name, insurance_info.customer_type)` unique
  - `deleted_at` (soft delete 필터)
  - `ownerId` (설계사별 격리)
- **페이징**: limit/offset, 최대 1,000개 제한

### 10.2 벡터 검색

- **Qdrant**: 1536차원 벡터 인덱싱
- **필터링**: owner_id, customer_id 기반 사전 필터
- **중복 제거**: 문서별 최고 점수 청크만 반환

### 10.3 프론트엔드

- **React Query 캐싱**: 5분 stale time, 10분 cache time
- **Lazy Loading**: React.lazy + Suspense로 코드 스플리팅
- **Virtual Scrolling**: 대용량 목록 최적화 (고려 중)

### 10.4 API 응답 시간

| 엔드포인트 | 평균 응답 시간 |
|-----------|--------------|
| GET /api/customers | ~50ms |
| GET /api/documents | ~100ms |
| POST /api/search (RAG) | ~2-3초 |
| POST /api/annual-report/parse | ~30-60초 (비동기) |

---

## 11. 개발 워크플로우

### 11.1 백엔드 수정

```bash
# 1. 로컬에서 파일 수정 (D:\aims)
vim backend/api/aims_api/server.js

# 2. scp로 서버 복사
scp backend/api/aims_api/server.js tars.giize.com:/home/rossi/aims/backend/api/aims_api/

# 3. 서버에서 배포 스크립트 실행
ssh tars.giize.com
cd /home/rossi/aims/backend/api/aims_api
./deploy_aims_api.sh
```

### 11.2 프론트엔드 개발

```bash
cd frontend/aims-uix3

# 개발 서버 (HMR)
npm run dev

# 타입 체크
npm run typecheck

# 테스트
npm test

# 프로덕션 빌드
npm run build

# E2E 테스트
npx playwright test
```

### 11.3 Git 워크플로우

```bash
# 1. 변경사항 확인
git status
git diff

# 2. 테스트 실행
npm test

# 3. 커밋 (한글 작성)
git add .
git commit -m "feat: 고객 관계도 기능 추가"

# 4. Push
git push origin main
```

**주의사항:**
- ⚠️ **사용자 명시적 승인 없이 절대 커밋 금지**
- 커밋 메시지는 한글로 작성
- 커밋 전 테스트 필수

---

## 12. 향후 개선 사항

### 12.1 성능 개선

- [ ] Redis 캐싱 도입 (문서 메타데이터, 검색 결과)
- [ ] Nginx 로드 밸런싱 설정
- [ ] CDN 도입 (정적 파일)
- [ ] Virtual Scrolling (대용량 목록)

### 12.2 기능 확장

- [ ] 모바일 앱 (React Native)
- [ ] 실시간 협업 (WebRTC)
- [ ] 고급 통계 대시보드
- [ ] AI 챗봇 (24/7 고객 지원)

### 12.3 아키텍처

- [ ] 마이크로서비스 독립 배포 (Kubernetes)
- [ ] 이벤트 기반 아키텍처 (Kafka)
- [ ] GraphQL API 도입 검토
- [ ] 서버리스 함수 (Lambda) 활용

### 12.4 모니터링

- [ ] Prometheus + Grafana 대시보드
- [ ] Sentry 에러 추적
- [ ] 검색 품질 지속 모니터링
- [ ] 사용자 행동 분석 (Mixpanel)

---

## 13. 참조 문서

### 13.1 프로젝트 문서

- [CLAUDE.md](../CLAUDE.md) - 개발 철학 및 규칙
- [TEST_RESULTS_2025-12-08.md](./TEST_RESULTS_2025-12-08.md) - 전체 테스트 결과
- [SECURITY_FIX_LOG.md](./SECURITY_FIX_LOG.md) - 보안 취약점 수정 로그
- [SECURITY_ROADMAP.md](./SECURITY_ROADMAP.md) - 보안 로드맵

### 13.2 프론트엔드 문서

- [CSS_SYSTEM.md](../frontend/aims-uix3/CSS_SYSTEM.md) - CSS 시스템 상세
- [DENSE_TYPOGRAPHY_SYSTEM.md](../frontend/aims-uix3/docs/DENSE_TYPOGRAPHY_SYSTEM.md) - 타이포그래피 규격
- [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](./ICON_IMPLEMENTATION_TROUBLESHOOTING.md) - 아이콘 문제 해결
- [EXCEL_IMPORT_SPECIFICATION.md](./EXCEL_IMPORT_SPECIFICATION.md) - 엑셀 입력 표준

### 13.3 외부 문서

- [MongoDB Documentation](https://www.mongodb.com/docs/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [React Query Documentation](https://tanstack.com/query/latest)

---

## 14. 부록

### 14.1 용어 사전

| 용어 | 설명 |
|------|------|
| **설계사 (Agent)** | 보험 영업인, 시스템 주 사용자 |
| **고객 (Customer)** | 보험 가입자, 설계사가 관리 |
| **계약 (Contract)** | 보험 증권, 고객-보험사 간 계약 |
| **AR (Annual Report)** | 연간보고서, 보험사 발행 계약 요약 |
| **OCR** | Optical Character Recognition, 이미지 → 텍스트 |
| **RAG** | Retrieval-Augmented Generation, 검색 기반 답변 생성 |
| **Vector Embedding** | 텍스트 → 고차원 벡터 (1536차원) |
| **Soft Delete** | 논리 삭제, deleted_at 기록 (복구 가능) |
| **Hard Delete** | 물리 삭제, 완전 제거 (복구 불가) |
| **Cascade Delete** | 연쇄 삭제, 관련 데이터 모두 삭제 |

### 14.2 API 엔드포인트 전체 목록

**참조**: [3.1 aims_api - API 엔드포인트 (61개)](#api-엔드포인트-61개)

### 14.3 데이터베이스 스키마 상세

**참조**: [3.5 데이터베이스 스키마](#35-데이터베이스-스키마)

### 14.4 아키텍처 다이어그램

**참조**: [2.4 전체 시스템 아키텍처](#24-전체-시스템-아키텍처)

---

## 마무리

이 문서는 AIMS 시스템의 **완전한 기술 참조 자료**입니다.

### 문서 활용 방법

- **신규 개발자**: 1→2→3→4→5 순서로 읽으며 전체 이해
- **기존 개발자**: 필요한 섹션만 참조 (Ctrl+F 검색)
- **아키텍트**: 2, 5, 12 섹션 중점 검토
- **QA 엔지니어**: 8 섹션 테스트 전략 참조

### 문서 업데이트

이 문서는 시스템 변경 시 함께 업데이트되어야 합니다:
- 새로운 API 추가 시
- 데이터베이스 스키마 변경 시
- 주요 비즈니스 로직 변경 시
- 아키텍처 개선 시

**최종 업데이트**: 2025-12-08
**문서 버전**: 1.0
**작성자**: Claude Code (AI Assistant)

---

**AIMS - Agent Intelligent Management System**
© 2025 AIMS Project. All rights reserved.
