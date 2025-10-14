# AIMS API 아키텍처 분석

## 📋 개요

AIMS 프로젝트의 API 아키텍처와 각 백엔드 서비스의 역할, 사용 현황을 조사한 문서입니다.

**조사 날짜**: 2025-10-14
**조사자**: Claude Code

---

## 🏗️ 현재 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
├─────────────────────────────────────────────────────────────┤
│  aims-uix3 (React/TypeScript)                               │
│  - 현재 운영 중인 메인 프론트엔드                              │
│  - Port: 5173 (개발), 빌드 후 정적 배포                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP (Port 3010)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                           │
├─────────────────────────────────────────────────────────────┤
│  aims-api (Node.js - server.js)                             │
│  - Port: 3010                                               │
│  - Process: root 3950117 - node server.js                  │
│  - 위치: ~/aims/backend/api/aims_api/                       │
│                                                             │
│  [제공 API]                                                 │
│  • GET  /api/documents                                      │
│  • GET  /api/documents/status                               │
│  • GET  /api/documents/:id/status                           │
│  • GET  /api/documents/status/live (폴링용)                 │
│  • POST /api/documents/upload                               │
│  • GET  /api/customers/:id/documents                        │
│  • POST /api/customers/:customerId/documents/:documentId     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ MongoDB Driver
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                          │
├─────────────────────────────────────────────────────────────┤
│  MongoDB                                                    │
│  - Database: docupload                                      │
│  - Collection: files                                        │
│  - Port: 27017                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 레거시 시스템 (현재 미사용)

### Legacy Stack

```
┌─────────────────────────────────────────────────────────────┐
│  doc-status-dashboard (React 구버전)                         │
│  - 위치: ~/aims/frontend/doc-status-dashboard/              │
│  - API URL: http://tars.giize.com:8080                     │
│  - 상태: 레거시, 현재 미사용 ❌                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP (Port 8080)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  doc_status_api (Python FastAPI)                            │
│  - Port: 8080 (기본값)                                      │
│  - 위치: ~/aims/backend/api/doc_status_api/                 │
│  - Docker: document-status-api (삭제 가능)                  │
│  - 상태: 레거시, aims-uix3에서 사용 안 함 ❌                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 API 사용 현황 분석

### aims-uix3에서 사용하는 서비스

| 페이지 | 사용 API | 엔드포인트 | 실제 서버 |
|--------|---------|-----------|----------|
| 📚 문서 라이브러리 | DocumentStatusService | `/api/documents/status` | aims-api (Node.js) |
| 📋 문서 처리 현황 | DocumentStatusService | `/api/documents/status` | aims-api (Node.js) |
| 🔍 문서 검색 | SearchService | `/api/documents/search` | aims-api (Node.js) |
| 👤 고객 상세 > 문서 목록 | DocumentService | `/api/customers/:id/documents` | aims-api (Node.js) |

### API 호출 빈도

```javascript
// DocumentLibraryView.tsx
React.useEffect(() => {
  // 3초마다 자동 새로고침
  const intervalId = setInterval(() => {
    loadDocuments(searchParams, true) // silent=true로 깜빡임 방지
  }, 3000)
}, [visible, loadDocuments, searchParams])
```

- **문서 라이브러리**: 3초마다 폴링 (백그라운드)
- **문서 처리 현황**: 3초마다 폴링 (백그라운드)
- **고객 문서**: 필요시 호출

---

## 🔧 서비스별 상세 분석

### 1. aims-api (Node.js) - **현재 운영 중**

**실행 정보**:
```bash
# 프로세스 확인
root     3950117  1.2  1.0 11451764 85092 ?      Ssl  12:45   0:19 node server.js

# 실행 위치
~/aims/backend/api/aims_api/server.js
```

**주요 엔드포인트 구현**:

```javascript
// server.js 라인 565-600
app.get('/api/documents/status', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    // MongoDB에서 직접 조회
    const documents = await db.collection(COLLECTION_NAME)
      .find(filter)
      .sort({ 'upload.uploaded_at': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // 각 문서의 상태 분석
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);
      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: doc.upload?.uploaded_at,
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        ...statusInfo
      };
    });

    res.json({
      success: true,
      data: {
        documents: filteredDocuments,
        pagination: { /* ... */ }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**제공 기능**:
- MongoDB 직접 연결 (docupload.files)
- 문서 상태 분석 로직 내장
- 페이지네이션 지원
- 검색 필터링
- 상태별 필터링 (completed, processing, error, pending)

---

### 2. doc_status_api (Python FastAPI) - **레거시**

**실행 정보**:
```bash
# Docker 컨테이너 (현재 삭제됨)
CONTAINER ID   IMAGE                      COMMAND                  STATUS
6dddc666bc59   document-status-api        "sh -c 'uvicorn main…"   (삭제됨)

# 위치
~/aims/backend/api/doc_status_api/main.py
```

**원래 용도**:
```python
# main.py
from fastapi import FastAPI, HTTPException, WebSocket

app = FastAPI(title="Document Status API", version="1.0.0")

# CORS: doc-status-dashboard와 연결
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
)

# MongoDB 연결
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]
```

**특징**:
- WebSocket 실시간 업데이트 지원
- FastAPI 기반 (비동기)
- doc-status-dashboard 전용으로 개발됨
- **현재 aims-uix3에서는 사용하지 않음**

---

### 3. doc-status-dashboard (React) - **레거시**

**설정 정보**:
```javascript
// src/services/apiService.js
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://tars.giize.com:8080";

// .env
REACT_APP_API_URL=http://tars.giize.com:8080
```

**위치**: `~/aims/frontend/doc-status-dashboard/`

**상태**: 구버전 프론트엔드, aims-uix3로 대체됨

---

## 🎯 프론트엔드 API 설정

### aims-uix3 API 설정

**주요 설정 파일**:

1. **shared/lib/api.ts** (공통 설정)
```typescript
export const API_CONFIG = {
  BASE_URL: import.meta.env['VITE_API_BASE_URL'] || 'http://tars.giize.com:3010',
  TIMEOUT: 10000,
};
```

2. **services/DocumentStatusService.ts**
```typescript
const API_BASE_URL = import.meta.env['VITE_API_URL'] || 'http://tars.giize.com:3010'
```

**환경 변수** (미설정 시 기본값 사용):
- `VITE_API_BASE_URL` → 기본값: `http://tars.giize.com:3010`
- `VITE_API_URL` → 기본값: `http://tars.giize.com:3010`

---

## 🔄 마이그레이션 히스토리

### 시스템 변화 과정

```
[Phase 1: 초기 시스템]
doc-status-dashboard (React 구버전)
        ↓
doc_status_api (Python FastAPI, Port 8080)
        ↓
MongoDB

[Phase 2: 통합 및 현대화]
aims-uix3 (React + TypeScript)
        ↓
aims-api (Node.js, Port 3010) ← 통합된 백엔드
        ↓
MongoDB

[결과]
✅ aims-api: /api/documents/status 엔드포인트 직접 구현
❌ doc_status_api: 레거시화, 더 이상 사용하지 않음
❌ doc-status-dashboard: aims-uix3로 완전 대체
```

---

## 🧪 검증 결과

### 1. doc_status_api 없이 정상 작동 확인

**테스트 시나리오**:
```bash
# 1. doc_status_api Docker 컨테이너 삭제
docker stop doc-status-api
docker rm doc-status-api

# 2. aims-api는 정상 응답
curl http://tars.giize.com:3010/api/documents/status | jq
# 결과: ✅ 정상 응답

# 3. aims-uix3 정상 작동 확인
# 브라우저에서 문서 라이브러리, 문서 처리 현황 페이지 확인
# 결과: ✅ 모든 페이지 정상 작동
```

### 2. aims-api가 제공하는 엔드포인트 확인

```bash
ssh rossi@tars.giize.com "grep -n 'documents/status' ~/aims/backend/api/aims_api/server.js"

# 결과:
# 102:        'GET /api/documents/status',
# 565:app.get('/api/documents/status', async (req, res) => {
# 849:app.get('/api/documents/status/live', async (req, res) => {
```

**확인됨**: aims-api가 `/api/documents/status` 엔드포인트를 직접 구현하고 있음 ✅

---

## 📝 결론

### 핵심 요약

1. **aims-uix3는 doc_status_api를 사용하지 않음**
   - 모든 API 호출은 aims-api (Node.js, Port 3010)로 향함
   - `/api/documents/status` 엔드포인트는 aims-api가 제공

2. **doc_status_api는 레거시 서비스**
   - 원래 doc-status-dashboard (구버전 프론트엔드) 전용
   - 현재 사용되지 않음
   - Docker 컨테이너 삭제해도 시스템에 영향 없음

3. **aims-api가 모든 문서 API 제공**
   - MongoDB 직접 연결
   - 문서 상태 분석 로직 내장
   - 페이지네이션, 검색, 필터링 지원
   - 3초마다 폴링 (문서 라이브러리, 문서 처리 현황)

### 권장 사항

#### 즉시 조치 가능
- ✅ doc_status_api Docker 컨테이너 삭제 (영향 없음)
- ✅ doc-status-dashboard 디렉토리 아카이브 (더 이상 사용 안 함)

#### 코드 정리 (선택 사항)
- ⚠️ DocumentStatusService.ts는 현재 aims-api를 호출하므로 유지
- ⚠️ 변수명 정리: `VITE_API_URL` → `VITE_API_BASE_URL`로 통일 권장

---

## 📚 참고 자료

### 관련 파일 경로

**Backend**:
- `~/aims/backend/api/aims_api/server.js` (현재 사용 중)
- `~/aims/backend/api/doc_status_api/main.py` (레거시)

**Frontend**:
- `frontend/aims-uix3/src/services/DocumentStatusService.ts`
- `frontend/aims-uix3/src/shared/lib/api.ts`
- `~/aims/frontend/doc-status-dashboard/` (레거시)

### 주요 엔드포인트

| 엔드포인트 | 제공 서버 | 용도 |
|-----------|----------|------|
| `GET /api/documents/status` | aims-api | 문서 목록 + 상태 |
| `GET /api/documents/:id/status` | aims-api | 개별 문서 상태 |
| `GET /api/documents/status/live` | aims-api | 실시간 폴링용 |
| `GET /api/documents` | aims-api | 기본 문서 목록 |
| `GET /api/customers/:id/documents` | aims-api | 고객별 문서 |

---

**문서 버전**: 1.0
**최종 업데이트**: 2025-10-14
**작성**: Claude Code + Rossi Kwak
