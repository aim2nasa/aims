# 문서유형 SToT 마이그레이션 — DB를 유일한 소스로

> 작성일: 2026-03-27 | 상태: 구현 결정 | 분석: Alex, Gini

## 문제 (근본 원인)

문서유형 라벨이 **두 곳**에서 따로 관리되어 동기화가 깨짐 (SToT 위반).

| 소스 | 내용 | 개수 |
|------|------|------|
| 프론트엔드 `documentCategories.ts` | TypeScript 상수 (v4 기준) | 22개 |
| DB `document_types` 컬렉션 | MongoDB 컬렉션 (v3 기준) | 47개 |

### 불일치 현황
- DB에 없는데 실사용 중인 유형: 7개 (corp_basic, corp_tax 등)
- 같은 유형인데 라벨이 다른 것: 4건
- DB에만 있는 레거시 유형: 25개
- document_type이 null인 문서: 749건 (33%)

### 증상
- 전체 문서 보기에서 문서유형 정렬 시 영문/한글이 뒤섞임
- null 문서가 '미지정'으로 한글 ㅁ 위치에 배치되어 다른 유형 사이에 섞임
- 유형 추가 시 두 곳을 모두 수정해야 하는데 빠뜨림

## 결정: DB를 유일한 소스로 (방향 B)

### 근거
1. 서버사이드 정렬이 MongoDB aggregate $lookup 기반 → DB에 정확한 데이터 필수
2. aims-admin에 문서유형 CRUD UI가 이미 존재 → DB 관리 인프라 80% 완성
3. 유형 추가 시 DB 한 곳만 수정 → 코드 배포 불필요
4. 프론트 상수가 SToT이면 서버에 복사본이 필연적으로 발생

### 최종 구조
```
DB document_types 컬렉션 (유일한 소스)
    ↓
GET /api/document-types (API)
    ↓
├─ 프론트엔드: useDocumentTypes() hook으로 조회 + 캐시
├─ 백엔드 정렬: $lookup으로 참조 (기존 구조 유지)
└─ aims-admin: CRUD UI (기존 구조 유지)
```

## 구현 계획

### Phase 1: DB 마이그레이션
- document_types 컬렉션에 누락 7개 유형 추가 (프론트 v4 기준)
- 라벨 불일치 4건 수정 (프론트 기준으로 통일)
- category 필드 추가 (대분류: insurance, claim, identity 등)
- order 필드를 v4 순서로 재정렬
- 레거시 유형에 isLegacy: true 표시

### Phase 2: 백엔드 API 확장
- GET /api/document-types 응답에 category 필드 포함
- documents-routes.js ZIP 다운로드용 하드코딩(3190행) DB 조회로 교체

### Phase 3: 프론트 전환
- useDocumentTypes() hook 생성 (API 조회 + TanStack Query 캐시)
- documentCategories.ts에서 제거:
  - DOCUMENT_TYPE_LABELS (하드코딩 라벨 → API)
  - TYPE_TO_CATEGORY (하드코딩 매핑 → API)
- getDocumentTypeLabel() → API 데이터 기반으로 전환
- getCategoryForType() → API 데이터 기반으로 전환
- DOCUMENT_CATEGORIES (7대분류 아이콘/색상): 프론트 유지 (순수 UI 관심사)

### Phase 4: 정렬 정상화
- null/unspecified → 정렬 맨 뒤 배치 (sortWeight 도입)
- 모든 유형이 DB에서 한글 라벨을 가져오므로 영문 섞임 문제 해소

## 실행 결과

### Phase 1: DB 마이그레이션 — 완료 (2026-03-27)

스크립트: `backend/scripts/migrate_document_types_v4.py`

| 항목 | 결과 |
|------|------|
| 신규 추가 | 7건 (corp_basic, corp_tax, corp_asset, asset_document, personal_docs, consent_delegation, insurance_etc) |
| 라벨 수정 | 6건 (customer_review, diagnosis, plan_design, legal_document, general, unspecified) |
| 카테고리 설정 | 18건 (전체 v4 유형에 category 부여) |
| 순서 변경 | 18건 (v4 DOCUMENT_TYPE_LABELS 순서로 재정렬) |
| 레거시 표시 | 29건 (v4에 없는 유형에 isLegacy: true) |
| 멱등성 | 확인됨 (재실행 시 0건 변경) |

### Phase 2: 백엔드 API — 미착수
### Phase 3: 프론트 전환 — 미착수
### Phase 4: 정렬 정상화 — 미착수

## 영향 파일

| Phase | 파일 | 변경 |
|-------|------|------|
| 1 | DB `document_types` 컬렉션 | 마이그레이션 스크립트 |
| 2 | `backend/api/aims_api/routes/document-types-routes.js` | category 필드 |
| 2 | `backend/api/aims_api/routes/documents-routes.js` | ZIP 하드코딩 제거 |
| 3 | `frontend/aims-uix3/src/shared/constants/documentCategories.ts` | 상수 제거, API 전환 |
| 3 | `frontend/aims-uix3/src/shared/hooks/useDocumentTypes.ts` (신규) | API hook |
| 3 | 소비 파일 ~13개 | import 변경 |
| 4 | `backend/api/aims_api/routes/documents-routes.js` | null sortWeight |
