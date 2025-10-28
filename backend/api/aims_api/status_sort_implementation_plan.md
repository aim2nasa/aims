# 문서 상태(Status) 정렬 기능 구현 계획서

## 📋 목표
문서처리현황 페이지에서 상태별 정렬 기능 구현

## 🔍 현황 분석

### 현재 문제점
1. **상태값이 DB에 저장되지 않음**
   - `overallStatus`는 `prepareDocumentResponse()` 함수가 매번 계산
   - DB에는 `upload`, `meta`, `ocr`, `docembed` 원본 데이터만 존재

2. **프론트엔드 정렬의 한계**
   - 현재: 백엔드에서 받은 페이지(예: 100개)만 정렬
   - 문제: 전체 데이터 기준 정렬 불가능
   - 성능: 전체 데이터 다운로드 시 메모리/네트워크 낭비

3. **백엔드 정렬 불가**
   - DB에 `overallStatus` 필드 없음
   - aggregation pipeline에서 정렬 기준 없음

### 상태 계산 로직 위치
- **파일**: `backend/api/aims_api/lib/documentStatusHelper.js`
- **함수**: `prepareDocumentResponse(doc)`
- **입력**: MongoDB files 컬렉션의 document
- **출력**: `{ raw, computed }` 구조
  - `computed.overallStatus`: 'pending' | 'processing' | 'completed' | 'completed_with_skip' | 'error'

### overallStatus 결정 로직
```
1. pending: 초기 상태
2. processing: 처리 중
   - upload 완료 + meta/ocr/docembed 처리 중
3. error: 실패
   - meta.meta_status === 'error'
   - ocr.status === 'error'
   - docembed.status === 'failed'
4. completed_with_skip: OCR 생략 완료
   - ocr.warn 존재
5. completed: 정상 완료
   - docembed.status === 'done'
```

## 🎯 해결 방안

### MongoDB Change Streams 활용
- **선택 이유**:
  - self-hosted MongoDB에서 사용 가능
  - server.js가 이미 항상 실행 중
  - 기존 `prepareDocumentResponse()` 로직 재사용 가능

- **동작 구조**:
  ```
  MongoDB 도큐먼트 변경
    ↓
  Change Stream 감지
    ↓
  server.js 콜백 실행
    ↓
  prepareDocumentResponse() 호출
    ↓
  overallStatus 계산
    ↓
  MongoDB에 overallStatus 필드 업데이트
  ```

## 📝 구현 단계

### 1단계: Change Stream 리스너 구현 ✅
**파일**: `backend/api/aims_api/server.js`

**작업 내용**:
- files 컬렉션 Change Stream 생성
- insert/update 감지
- `prepareDocumentResponse()` 호출
- `overallStatus` 필드 업데이트

**검증 방법**:
- 문서 업로드 → overallStatus 필드 자동 생성 확인
- meta/ocr/docembed 완료 → overallStatus 업데이트 확인

### 2단계: 기존 문서 상태 초기화 ✅
**목적**: 이미 존재하는 문서들의 overallStatus 생성

**작업 내용**:
- 모든 files 문서 조회
- `prepareDocumentResponse()` 호출
- `overallStatus` 필드 추가

**검증 방법**:
- DB 조회로 모든 문서에 overallStatus 필드 확인
- 상태별 문서 개수 집계

### 3단계: 백엔드 정렬 로직 수정 ✅
**파일**: `backend/api/aims_api/server.js`

**작업 내용**:
- `sort=status_asc` / `sort=status_desc` 파라미터 처리
- MongoDB에서 `overallStatus` 필드로 정렬
- 정렬 우선순위 정의:
  ```javascript
  const statusPriority = {
    'pending': 1,
    'processing': 2,
    'error': 3,
    'completed_with_skip': 4,
    'completed': 5
  };
  ```

**검증 방법**:
- API 호출: `/api/customers/{id}/documents?sort=status_asc`
- 100개 문서의 상태 순서 확인
- pending → processing → error → completed 순서 검증

### 4단계: 프론트엔드 수정 ✅
**파일**: `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx`

**작업 내용**:
- status 정렬 차단 코드 제거
- `handleColumnSort`에서 status 허용
- 백엔드 정렬 사용

**검증 방법**:
- 문서처리현황에서 "상태" 컬럼 클릭
- 전체 문서가 상태별로 정렬되는지 확인
- 페이지 이동해도 정렬 순서 유지 확인

## 🧪 검증 계획

### 데이터 기반 검증 (CLAUDE.MD 준수)
**원칙**: 코드 리뷰만으로 판단 금지! 반드시 실제 데이터로 증명

**검증 스크립트**: `d:/tmp/verify_status_sort.py`

**검증 항목**:
1. **DB 직접 조회 vs API 정렬 비교**
   - 100개 문서 전체 비교
   - overallStatus 필드 존재 확인
   - 정렬 순서 일치 여부

2. **상태별 위치 분석**
   - pending 문서들의 위치
   - processing 문서들의 위치
   - completed 문서들의 위치
   - 올바른 순서인지 검증

3. **일치율 계산**
   - 예상 정렬 vs 실제 정렬 일치율
   - 100% 일치 필수

**성공 기준**:
- ✅ 모든 문서에 overallStatus 필드 존재
- ✅ DB 정렬 결과 = API 정렬 결과 (100% 일치)
- ✅ 상태별 그룹화 확인 (pending → processing → completed)

## 📊 예상 결과

### Before (현재)
```
클라이언트 정렬:
- 페이지 1 (100개) 내에서만 정렬
- 전체 데이터 정렬 불가
- 대용량 데이터 시 성능 문제
```

### After (구현 후)
```
서버 정렬:
- DB 레벨에서 전체 데이터 정렬
- 페이지네이션과 정렬 동시 지원
- overallStatus 인덱스로 빠른 정렬
```

## 🚨 주의사항

### CLAUDE.MD 준수
1. **최소 수정 원칙**
   - status 정렬 기능에 직접 필요한 부분만 수정
   - 관련 없는 리팩토링 금지

2. **객관적 증거 기반 개발**
   - 구현 완료 후 반드시 실제 데이터로 검증
   - 100개 문서 전체 비교표 생성
   - 코드만 보고 "작동할 것이다" 판단 금지

3. **원복 원칙**
   - 구현 실패 시 즉시 git checkout으로 원복
   - 깨끗한 상태에서 재구현

### 커밋 전 체크리스트
- [ ] overallStatus 필드가 모든 문서에 존재하는가?
- [ ] Change Stream이 정상 작동하는가?
- [ ] API 정렬이 DB 정렬과 100% 일치하는가?
- [ ] 프론트엔드에서 정렬이 작동하는가?
- [ ] 기존 기능이 깨지지 않았는가?

## 📅 작업 순서

1. ✅ **계획 수립** (현재)
2. ⏳ Change Stream 리스너 구현
3. ⏳ 기존 문서 상태 초기화
4. ⏳ 백엔드 정렬 로직 수정
5. ⏳ 실제 데이터로 검증 (100개 문서 비교)
6. ⏳ 프론트엔드 수정
7. ⏳ 최종 테스트
8. ⏳ 커밋

## 🔗 관련 파일

### 백엔드
- `backend/api/aims_api/server.js` - Change Stream, 정렬 로직
- `backend/api/aims_api/lib/documentStatusHelper.js` - 상태 계산 함수

### 프론트엔드
- `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.tsx`
- `frontend/aims-uix3/src/services/DocumentService.ts`

### 검증
- `d:/tmp/verify_status_sort.py` - 검증 스크립트
