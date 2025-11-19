# 설정값 후보 목록

추후 중앙 집중식 설정 시스템으로 이동해야 할 하드코딩된 값들

## 📊 폴링 및 실시간 업데이트

### 폴링 주기
- **현재 위치**:
  - `frontend/aims-uix3/src/providers/DocumentStatusProvider.tsx:333`
  - `frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx:537`
- **현재 값**: `5000` (5초)
- **설정명 제안**: `POLLING_INTERVAL`
- **설명**: 문서 상태 및 파일 목록 자동 새로고침 주기

### 페이지 가시성 체크 디바운스
- **현재 위치**: DocumentStatusProvider, PersonalFilesView
- **현재 값**: 즉시 반응 (디바운스 없음)
- **설정명 제안**: `PAGE_VISIBILITY_DEBOUNCE`
- **설명**: 탭 전환 시 폴링 on/off 반응 지연 시간

## 🔍 검색 관련

### 검색 디바운스
- **현재 위치**: `PersonalFilesView.tsx:542`
- **현재 값**: `500` (500ms)
- **설정명 제안**: `SEARCH_DEBOUNCE_MS`
- **설명**: 검색어 입력 후 실제 검색 실행까지 대기 시간

### 검색 결과 최대 개수
- **현재 위치**:
  - `PersonalFilesView.tsx:255` - `getRecentDocuments(1, 1000)`
  - `CustomerDocument.ts` - `limit: 10000`
- **현재 값**: 1000 또는 10000
- **설정명 제안**: `MAX_SEARCH_RESULTS`
- **설명**: API에서 가져올 최대 검색 결과 수

## 📄 페이지네이션

### 기본 페이지 크기
- **현재 위치**: 여러 API 호출
- **현재 값**: 다양 (10, 50, 100, 1000, 10000)
- **설정명 제안**:
  - `DEFAULT_PAGE_SIZE` (기본값: 50)
  - `MAX_PAGE_SIZE` (최대값: 10000)
- **설명**: 목록 조회 시 기본 페이지 크기

## ⏱️ 타임아웃 및 지연

### API 타임아웃
- **현재 위치**: axios/fetch 호출
- **현재 값**: 브라우저 기본값 (명시 안 됨)
- **설정명 제안**: `API_TIMEOUT_MS`
- **설명**: API 요청 최대 대기 시간

### 모달 애니메이션 딜레이
- **현재 위치**: 여러 모달 컴포넌트
- **현재 값**: CSS에 분산 (200ms, 300ms 등)
- **설정명 제안**: `MODAL_ANIMATION_DURATION`
- **설명**: 모달 열기/닫기 애니메이션 시간

## 🎨 UI/UX

### 툴팁 표시 지연
- **현재 위치**: Tooltip 컴포넌트
- **현재 값**: CSS transition 또는 즉시
- **설정명 제안**: `TOOLTIP_DELAY_MS`
- **설명**: 마우스 호버 후 툴팁 표시까지 대기 시간

### 토스트 메시지 자동 닫기
- **현재 위치**: Toast/Notification 시스템
- **현재 값**: 3000ms (추정)
- **설정명 제안**: `TOAST_AUTO_CLOSE_MS`
- **설명**: 토스트 메시지 자동 닫기 시간

## 🔐 인증 및 세션

### 세션 만료 시간
- **현재 위치**: 인증 시스템
- **설정명 제안**: `SESSION_TIMEOUT_MS`
- **설명**: 사용자 세션 자동 만료 시간

### 자동 로그아웃 경고 시간
- **설정명 제안**: `SESSION_WARNING_BEFORE_MS`
- **설명**: 세션 만료 전 경고 표시 시간

## 📦 캐시 및 스토리지

### 로컬 스토리지 만료
- **현재 위치**: 여러 localStorage 사용처
- **설정명 제안**: `CACHE_EXPIRY_MS`
- **설명**: 로컬 스토리지 캐시 유효 기간

## 🌐 API 엔드포인트

### 백엔드 API 베이스 URL
- **현재 위치**:
  - `services/documentStatusService.ts`
  - `services/personalFilesService.ts`
  - 기타 service 파일들
- **현재 값**:
  - `http://tars.giize.com:3010`
  - `http://tars.giize.com:8000`
- **설정명 제안**:
  - `API_BASE_URL`
  - `DOC_STATUS_API_URL`
  - `RAG_API_URL`
- **설명**: 백엔드 API 엔드포인트

## 📁 파일 업로드

### 최대 파일 크기
- **설정명 제안**: `MAX_FILE_SIZE_MB`
- **설명**: 업로드 가능한 최대 파일 크기

### 동시 업로드 제한
- **설정명 제안**: `MAX_CONCURRENT_UPLOADS`
- **설명**: 동시에 업로드 가능한 최대 파일 수

## 🎯 추천 구현 방법

### 1단계: 상수 파일 생성
```typescript
// frontend/aims-uix3/src/config/constants.ts
export const POLLING_CONFIG = {
  INTERVAL: 5000,
  PAGE_VISIBILITY_DEBOUNCE: 1000,
} as const

export const SEARCH_CONFIG = {
  DEBOUNCE_MS: 500,
  MAX_RESULTS: 1000,
} as const

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://tars.giize.com:3010',
  DOC_STATUS_URL: import.meta.env.VITE_DOC_STATUS_API_URL || 'http://tars.giize.com:8000',
  TIMEOUT_MS: 30000,
} as const

export const UI_CONFIG = {
  MODAL_ANIMATION_DURATION: 300,
  TOOLTIP_DELAY_MS: 500,
  TOAST_AUTO_CLOSE_MS: 3000,
} as const
```

### 2단계: 환경변수 (.env)
```bash
# .env.development
VITE_API_BASE_URL=http://localhost:3010
VITE_DOC_STATUS_API_URL=http://localhost:8000
VITE_POLLING_INTERVAL=5000

# .env.production
VITE_API_BASE_URL=http://tars.giize.com:3010
VITE_DOC_STATUS_API_URL=http://tars.giize.com:8000
VITE_POLLING_INTERVAL=5000
```

### 3단계: 설정 UI (추후)
- 사용자 설정 화면에서 일부 값 조정 가능
- 예: 폴링 주기, 검색 디바운스, 토스트 자동 닫기 등

## ✅ 우선순위

### High (즉시 적용)
- [x] `POLLING_INTERVAL` - 여러 곳에서 사용 중
- [ ] `API_BASE_URL` - 환경별 다른 값 필요
- [ ] `SEARCH_DEBOUNCE_MS` - 사용자 경험에 직접 영향

### Medium (1-2주 내)
- [ ] `MAX_SEARCH_RESULTS`
- [ ] `API_TIMEOUT_MS`
- [ ] `TOAST_AUTO_CLOSE_MS`

### Low (필요시)
- [ ] `MODAL_ANIMATION_DURATION`
- [ ] `TOOLTIP_DELAY_MS`
- [ ] `CACHE_EXPIRY_MS`

## 📌 관련 이슈

- 깜빡임 해결: 폴링 주기 통일 필요 (완료)
- API 엔드포인트 분산: 중앙 집중식 관리 필요
- 환경별 설정: dev/staging/prod 구분 필요
