# AI 검색 페이지네이션 테스트 가이드

## 개요

키워드 검색과 시맨틱 검색 모두에서 페이지네이션이 정상 동작하는지 검증하는 자동화 테스트입니다.

---

## 테스트 구성

### 1. Python 단위 테스트 (RAG API)

**파일**: `backend/api/aims_rag_api/tests/test_rag_search.py`

| 테스트 클래스 | 테스트 수 | 설명 |
|--------------|----------|------|
| `TestPaginationKeyword` | 8개 | 키워드 검색 페이지네이션 |
| `TestPaginationSemantic` | 4개 | 시맨틱 검색 페이지네이션 |
| `TestPaginationConsistency` | 3개 | 페이지네이션 일관성 검증 |

**테스트 항목**:
- 페이지네이션 필드 존재 (`total_count`, `has_more`)
- 첫 페이지, 두 번째 페이지, 마지막 페이지
- `offset + len == total` 경계 조건
- 빈 결과 처리
- `total_count` 일관성 (페이지 간 동일)
- 페이지 간 결과 중복 없음
- `has_more` 경계 조건

### 2. E2E 테스트 (MCP 서버)

**파일**: `backend/api/aims_mcp/src/__tests__/tools/phase5-rag.e2e.test.ts`

| 테스트 섹션 | 테스트 수 | 설명 |
|------------|----------|------|
| `5.1.1 시맨틱 검색 페이지네이션` | 5개 | 시맨틱 검색 E2E |
| `5.1.2 키워드 검색 페이지네이션` | 6개 | 키워드 검색 E2E |

**테스트 항목**:
- 페이지네이션 필드 존재 (`totalCount`, `hasMore`, `offset`, `nextOffset`, `pagination`)
- 첫 페이지 `offset=0`
- 두 번째 페이지 조회 및 중복 검증
- `totalCount` 일관성
- 마지막 페이지 `hasMore=false`
- 키워드/시맨틱 검색 비교

---

## 테스트 실행 방법

### 사전 요구사항

E2E 테스트를 로컬에서 실행하려면 SSH 터널이 필요합니다:

```bash
# 터미널 1: SSH 터널 시작 (백그라운드)
ssh -L 3011:localhost:3011 -L 8000:localhost:8000 -L 3010:localhost:3010 -N rossi@tars.giize.com
```

### Python 단위 테스트

```bash
# 서버 연결 없이 실행 가능 (mock 사용)
cd backend/api/aims_rag_api
pytest tests/test_rag_search.py -v

# 페이지네이션 테스트만
pytest tests/test_rag_search.py -v -k "Pagination"
```

### E2E 테스트

```bash
# SSH 터널 연결 후 실행
cd backend/api/aims_mcp
npm test

# 페이지네이션 테스트만
npm test -- --testNamePattern="페이지네이션"
```

---

## 테스트 결과 (2024.12.25)

### Python 단위 테스트

```
==================== 34 passed in 9.16s ====================

TestPaginationKeyword: 8 passed
TestPaginationSemantic: 4 passed
TestPaginationConsistency: 3 passed
```

### E2E 테스트

```
✓ 시맨틱 검색: 페이지네이션 필드 존재 확인 (2079ms)
✓ 시맨틱 검색: 첫 페이지 offset=0 (1754ms)
✓ 시맨틱 검색: 두 번째 페이지 조회 (1726ms)
✓ 시맨틱 검색: totalCount 일관성 (3627ms)
✓ 시맨틱 검색: 마지막 페이지 hasMore=false (1411ms)
✓ 키워드 검색: 페이지네이션 필드 존재 확인 (539ms)
✓ 키워드 검색: 첫 페이지 offset=0 (486ms)
✓ 키워드/시맨틱 검색: 동일 쿼리 결과 비교 (2291ms)

Test Files: 2 passed
Tests: 17 passed
Duration: 15.61s
```

---

## 환경 설정

### package.json 스크립트

```json
{
  "test": "cross-env MCP_URL=http://localhost:3011 AIMS_API_URL=http://localhost:3010 RAG_API_URL=http://localhost:8000 vitest run ..."
}
```

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MCP_URL` | `http://localhost:3011` | MCP 서버 URL |
| `AIMS_API_URL` | `http://localhost:3010` | AIMS API URL |
| `RAG_API_URL` | `http://localhost:8000` | RAG API URL |

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `backend/api/aims_rag_api/rag_search.py` | RAG 검색 API (페이지네이션 구현) |
| `backend/api/aims_mcp/src/tools/rag.ts` | MCP 검색 도구 (페이지네이션 응답 포맷) |
| `backend/api/aims_rag_api/tests/test_rag_search.py` | Python 단위 테스트 |
| `backend/api/aims_mcp/src/__tests__/tools/phase5-rag.e2e.test.ts` | E2E 테스트 |

---

## 페이지네이션 응답 형식

### RAG API 응답

```json
{
  "search_mode": "keyword|semantic",
  "search_results": [...],
  "total_count": 20,
  "has_more": true
}
```

### MCP 도구 응답

```json
{
  "query": "보험",
  "mode": "semantic",
  "totalResults": 10,
  "totalCount": 20,
  "hasMore": true,
  "offset": 0,
  "nextOffset": 10,
  "pagination": "더 많은 결과를 보려면 offset=10로 다시 검색하세요 (현재 1-10/20개)",
  "results": [...]
}
```

---

## 문제 해결

### SSH 터널 연결 실패

```bash
# 포트 사용 중인지 확인
netstat -an | grep 3011

# 기존 터널 종료 후 재시작
pkill -f "ssh -L 3011"
ssh -L 3011:localhost:3011 -L 8000:localhost:8000 -L 3010:localhost:3010 -N rossi@tars.giize.com
```

### 테스트 스킵됨

테스트가 스킵되면 서버 연결을 확인:

```bash
curl http://localhost:3011/health
curl http://localhost:8000/health
curl http://localhost:3010/api/health
```

---

## 검색 예시

실제 데이터 기반의 검색 예시입니다.

### 키워드 검색 예시

키워드 검색은 **정확한 단어 매칭**으로 문서를 찾습니다.

| 쿼리 | 설명 | 예상 결과 |
|------|------|----------|
| `퇴직연금` | 퇴직연금 관련 문서 검색 | 캐치업코리아 퇴직연금 부담금 내역.xls |
| `운전자보험` | 운전자보험 문서 검색 | 김보성님-운전자보험-20250515.pdf |
| `등기부등본` | 법인 등기 서류 검색 | 등기부등본_(주)캐치업코리아.pdf |

```json
// 키워드 검색 요청 예시
{
  "query": "퇴직연금",
  "mode": "keyword",
  "topK": 10,
  "offset": 0
}
```

### 시맨틱 검색 예시

시맨틱 검색은 **의미 기반**으로 관련 문서를 찾습니다. 자연어 질문에 적합합니다.

| 쿼리 | 설명 | 예상 결과 |
|------|------|----------|
| `직원들 연금 관련 서류` | 퇴직연금, 연금보험 등 연금 관련 문서 | 퇴직연금 부담금 내역, 연금 청약서 등 |
| `회사 법인 등록 서류` | 사업자등록증, 등기부등본 등 법인 서류 | 사업자등록증, 등기부등본, 정관 등 |
| `자동차 관련 보험` | 자동차보험 견적, 청약서 등 | 자동차견적, 운전자보험 등 |

```json
// 시맨틱 검색 요청 예시
{
  "query": "직원들 연금 관련 서류",
  "mode": "semantic",
  "topK": 10,
  "offset": 0
}
```

### 검색 모드 선택 가이드

| 상황 | 권장 모드 | 이유 |
|------|----------|------|
| 정확한 문서명/키워드를 알 때 | `keyword` | 빠르고 정확한 매칭 |
| 자연어로 질문할 때 | `semantic` | 의미 기반 검색 |
| 특정 보험사/상품명 검색 | `keyword` | 고유명사는 키워드가 정확 |
| "~와 비슷한 문서" 찾을 때 | `semantic` | 유사도 기반 검색 |
