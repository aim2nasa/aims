# 초성 필터 버그 수정 + 서버사이드 아키텍처 전환

> **작성일**: 2026-03-03
> **기준 커밋**: `130d5b70`
> **원칙**: 프론트엔드는 렌더링만 한다. 분류/집계/필터링은 서버가 한다. `limit=XXXX` 하드코딩 금지.

---

## 1. 문제 정의

### 버그
문서 탐색기에서 ㄱ 초성 고객이 표시되지 않음.

### 근본 원인
`initialType=korean` + `limit=500` → 서버가 한글 고객 문서 중 최신 500건만 반환 → ㄱ 고객 문서(545건)가 전부 500위 밖.

### 구조적 문제
프론트엔드가 `limit=500`이나 `limit=10000` 같은 숫자를 지정하여 대량 데이터를 받아와 클라이언트에서 분류/필터링하는 방식. 이는:
- 데이터 누락 (limit이 작으면)
- 성능 저하 (limit이 크면, S PC에서 32MB/72초)
- 프론트엔드에 불필요한 처리 부하

---

## 2. 설계 원칙

| 원칙 | 설명 |
|------|------|
| **서버가 분류** | 초성별 그룹핑, 카운트 집계, 필터링은 모두 서버(MongoDB)에서 수행 |
| **프론트는 렌더링만** | 서버가 보내준 결과를 그대로 표시. 클라이언트 필터/정렬/집계 금지 |
| **limit 하드코딩 금지** | 프론트엔드에 `limit=500`, `limit=10000` 같은 매직넘버 없음 |
| **서버가 적절한 크기 반환** | 서버가 컨텍스트에 맞는 데이터량을 결정 (페이지네이션, 초성별 등) |
| **S PC 성능 유지** | 단일 API 응답 2MB 이하, 불필요한 데이터 전송 금지 |

---

## 3. 페이지별 해결 방안

### 3-1. 문서 탐색기 (DocumentExplorerView) — 서버사이드 트리 구조

**현재**: 프론트엔드가 500건 문서를 받아 트리 구조를 클라이언트에서 구축
**변경**: 서버가 트리 구조(고객별 문서 요약)를 반환, 프론트엔드는 렌더링만

#### BE: 트리 요약 API 추가

`GET /api/documents/status/explorer-tree`

**요청 파라미터**: `fileScope`, `initial` (선택)

**응답** (초성 미선택 시 — 전체 고객 요약):
```json
{
  "success": true,
  "data": {
    "customers": [
      { "customerId": "...", "name": "강지윤", "initial": "ㄱ", "docCount": 15, "latestUpload": "2026-03-01T..." },
      { "customerId": "...", "name": "나영희", "initial": "ㄴ", "docCount": 8, "latestUpload": "2026-02-28T..." }
    ],
    "totalCustomers": 282,
    "totalDocuments": 2080,
    "initials": { "ㄱ": 545, "ㄴ": 200, "ㄷ": 150, "#": 30 }
  }
}
```

**응답 크기**: 고객 282명 × ~100바이트 ≈ **~30KB** (현재 1MB 대비 -97%)

**응답** (초성 선택 시 — `?initial=ㄱ`):
```json
{
  "data": {
    "customers": [
      { "customerId": "...", "name": "강지윤", "docCount": 15, "latestUpload": "..." },
      { "customerId": "...", "name": "김보성", "docCount": 8, "latestUpload": "..." }
    ],
    "documents": [
      { "_id": "...", "customer_name": "강지윤", "originalName": "보험증권.pdf", "uploaded_at": "...", "badgeType": "TXT", ... },
      ...
    ],
    "totalDocuments": 545,
    "initials": { "ㄱ": 545, "ㄴ": 200, ... }
  }
}
```

초성 선택 시 해당 초성의 문서도 함께 반환. 서버가 크기를 판단하여:
- 문서 수 ≤ 1000건: 전체 반환
- 문서 수 > 1000건: 최신 1000건 + `hasMore: true` (향후 확장)

#### FE: 트리 렌더링 전환

| 항목 | Before | After |
|------|--------|-------|
| 데이터 소스 | DocumentStatusProvider (문서 500건) | explorer-tree API (고객 요약 ~30KB) |
| 트리 구축 | 클라이언트 (useDocumentExplorerTree) | 서버 응답 그대로 렌더링 |
| 초성 카운트 | getDocumentInitials() 별도 API | explorer-tree 응답에 포함 |
| 초성 필터 | Provider에 initialFilter 전달 → 재요청 | `?initial=ㄱ` 파라미터로 재요청 |
| 탭 (한글/영문/숫자) | initialTypeFilter → 서버 필터 (버그) | **UI만** (버튼 표시 제어) |
| limit 하드코딩 | `initialItemsPerPage={500}` | **없음** |

#### 성능 비교

| 시나리오 | 현재 | 변경 후 |
|---------|------|---------|
| 초기 진입 (전체) | ~1MB (500건 문서) | **~30KB** (고객 요약) |
| ㄱ 초성 선택 | ~1MB (500건 문서) | **~1.1MB** (ㄱ 고객 545건) |
| 초성 카운트 | 별도 API 1건 | 응답에 포함 (추가 요청 없음) |

---

### 3-2. 전체고객보기 (AllCustomersView) — 카운트 API 추가

**현재**: initialCounts가 빈 Map (카운트 표시 안됨)
**변경**: 서버에서 고객 초성별 카운트 반환

#### BE: 고객 초성 카운트 API

`GET /api/customers/initials`

```json
{ "success": true, "data": { "initials": { "ㄱ": 150, "ㄴ": 45, "A": 20, "#": 5 } } }
```

`documents/status/initials`와 동일 패턴. 응답 크기: **수 KB**.

#### FE: 서버 카운트 사용

AllCustomersView에서 빈 Map → `CustomerService.getCustomerInitials()` 호출.
기존 서버사이드 페이지네이션 + `initial` 필터는 그대로 유지.

---

### 3-3. 전체문서보기 (DocumentLibraryView)

**변경 없음**. 이미 서버사이드 페이지네이션 + 초성 필터 + 서버 카운트로 올바르게 동작.

---

### 3-4. 관계별/지역별 고객보기

**이번 스코프 제외**.
- 관계 트리/지도 마커에 전체 고객 데이터 구조적으로 필요
- 고객 3,000건 돌파 시 서버사이드 전환 재검토 (Phase 5)
- 단, 탭 전환 시 `selectedInitial` 초기화 누락 → 이번에 수정

---

## 4. 구현 계획

### Step 1: BE — explorer-tree 엔드포인트 추가
**파일**: `backend/api/aims_api/routes/documents-routes.js`
- `GET /api/documents/status/explorer-tree` 구현
- 고객별 문서 요약 집계 (MongoDB aggregation)
- 초성별 카운트 포함
- `initial` 파라미터 지원 (선택 시 해당 초성 문서 포함)

### Step 2: BE — 고객 초성 카운트 API 추가
**파일**: `backend/api/aims_api/routes/customers-routes.js`
- `GET /api/customers/initials` 구현
- documents/status/initials와 동일 패턴

### Step 3: FE — 문서 탐색기 서버사이드 트리 전환
**파일**: `DocumentExplorerView.tsx`, `DocumentStatusService.ts`
- DocumentStatusProvider 의존 제거 (또는 explorer-tree API 전용으로 전환)
- `initialItemsPerPage={500}` 제거
- `initialTypeFilter` 제거
- explorer-tree API 호출 → 트리 렌더링
- 초성 선택 시 `?initial=ㄱ` 재요청

### Step 4: FE — 전체고객보기 서버 카운트 연동
**파일**: `AllCustomersView.tsx`, `CustomerService.ts`
- `CustomerService.getCustomerInitials()` 추가
- 빈 Map → 서버 카운트로 교체

### Step 5: FE — 탭 전환 시 selectedInitial 초기화
**파일**: `AllCustomersView.tsx`, `CustomerRelationshipView.tsx`
- `handleInitialTypeChange` 콜백 추가

### Step 6: 검증
- `npm run build` + `npm run test`
- Gini 검수
- 배포 + S PC 실환경 확인

---

## 5. 예상 성능 영향

| 페이지 | 현재 | 변경 후 | 개선 |
|--------|------|---------|------|
| 문서 탐색기 (초기) | ~1MB / 500건 문서 | **~30KB** / 고객 요약 | **-97%** |
| 문서 탐색기 (ㄱ선택) | ~1MB / 500건 문서 | ~1.1MB / ㄱ 문서 전체 | 동등 (데이터 완전) |
| 전체고객보기 | 변화 없음 | +수KB (initials API) | 무시 가능 |
| 기타 | 변화 없음 | 변화 없음 | — |

**`limit=XXXX` 하드코딩**: 문서 탐색기에서 완전 제거.

---

## 6. 이전 시도와 실패 원인

| 시도 | 실패 원인 |
|------|----------|
| `initialTypeFilter` 제거만 | 기능적으로는 동작하나, limit=500 유지 → 트리에 ㄱ 고객 미표시 |
| `limit=10000` + 클라이언트 필터 | Phase 1~4 성능 최적화 무효화, S PC 성능 파괴 |

### 이번 수정이 다른 이유
- 프론트엔드가 대량 문서를 받아 분류하는 구조 자체를 제거
- 서버가 트리 구조를 집계하여 **경량 요약(~30KB)**으로 반환
- 프론트엔드는 렌더링만 수행
- `limit=XXXX` 하드코딩 없음
- 초성 선택 시 서버가 해당 초성 문서를 적절한 크기로 반환
