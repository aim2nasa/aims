# 토의 보고서: #53 대량 파일 처리 중 현재 처리 파일 표시

- **날짜**: 2026-04-10
- **이슈**: [aims#53](https://github.com/aim2nasa/aims/issues/53)
- **브랜치**: `feat/batch-upload-detail-53`
- **프로세스**: /compact-fix

## 배경

대량 파일 업로드 후 파이프라인 처리 중, 프로그레스 바에는 전체 통계(N/M 완료, K 처리중, L 에러)만 보일 뿐, **"지금 이 순간 어떤 파일이 어느 단계에 있는지"**는 알 수 없었다. 사용자는 처리가 멈춘 것인지, 살아있는 것인지 확신할 수 없는 불안감을 느꼈다.

## 사용자 요청

프로그레스 바 영역에 다음을 표시:
```
⟳ 주_마리치_증권-DB.pdf  OCR 처리 중 (70%)
```

- 위치: **기존 프로그레스 바 영역** (테이블 행은 수정하지 않음)
- 목적: 현재 활발히 처리 중인 파일을 보여주어 시스템 liveness 확인

## 조사 결과

백엔드와 API는 이미 준비되어 있음 (85% ready):

| 레이어 | 상태 |
|--------|------|
| 백엔드 파이프라인 | ✅ `progressMessage`를 DB에 기록 ("메타데이터 추출 중", "텍스트 추출 중", "OCR 처리 중" 등) |
| API 응답 | ✅ `/api/documents/status`가 `progressMessage` 반환 ([documents-routes.js:1905](../backend/api/aims_api/routes/documents-routes.js#L1905)) |
| 프론트 타입 | ❌ `Document` 타입에 필드 없음 |
| 프론트 서비스 | ❌ 추출 안 함 |
| 프론트 UI | ❌ 표시 안 함 |

**결론: 프론트엔드만 수정하면 됨. 백엔드 배포 불필요.**

## UX 결정

### 표시 파일 선정
- **1개만 표시** (다수 슬롯은 시각 노이즈)
- 선정: `status: processing` 중 **가장 최근 progress가 업데이트된 파일**
- 갱신: **2초마다** (너무 빠르면 읽을 수 없고, 너무 느리면 멈춘 것 같음)

### 표시 위치
- 기존 프로그레스 바 **아래 줄**에 secondary info로 추가
- 레이아웃 변경 최소화, AR/CRS 배지와 충돌 없음

### 표시 형식
```
⟳ {파일명(30자 말줄임)} — {progressMessage} ({progress}%)
```

- 파일명: **displayName(별칭) 우선**, 없으면 originalName
- 한글 포함 시 전각 고려한 말줄임
- 진행률 0 또는 없으면 퍼센트 생략

### 전환 애니메이션
- 파일이 바뀔 때 **200ms fade** (CSS opacity transition)
- 끊김 없이 자연스럽게

### 숨김 조건
- 기존 프로그레스 바의 숨김 조건과 **완전히 동일** (processing === 0 등)
- 별도 로직 추가하지 않음

### 완료/에러 플래시 — 하지 않음
- 100+ 파일이 빠르게 처리될 때 flicker가 발생하여 오히려 UX 저하
- 단순함 유지

## 구현 범위

**프론트엔드 3개 파일 수정:**

1. **[entities/document/model.ts](../frontend/aims-uix3/src/entities/document/model.ts)** — `Document` 타입에 `progressMessage?: string` 필드 추가
2. **[services/DocumentStatusService.ts](../frontend/aims-uix3/src/services/DocumentStatusService.ts)** — API 응답에서 `progressMessage` 추출
3. **[DocumentViews/DocumentLibraryView/DocumentProcessingStatusBar.tsx](../frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentProcessingStatusBar.tsx)** — 새 줄에 현재 처리 파일 표시
4. **DocumentProcessingStatusBar.css** — 새 줄 스타일 + fade 전환

**백엔드 변경 없음. 배포 불필요.**

## Regression 테스트

1. `DocumentProcessingStatusBar` 테스트 파일에 케이스 추가:
   - processing 파일이 여러 개일 때 가장 최근 것을 표시하는지
   - 파일명이 30자 초과일 때 말줄임이 동작하는지
   - processing === 0 일 때 전체가 사라지는지 (기존 동작 유지 확인)
   - progressMessage가 없을 때 fallback 동작

## 검증 방법

- Playwright로 dev 서버(`https://localhost:5177`) 접속
- 작은 파일 여러 개(5~10개)를 업로드해 실제 프로그레스 바에 현재 처리 파일이 표시되는지 확인
- 처리 완료 후 프로그레스 바가 정상 사라지는지 확인
- 뷰포트 1920x840 기준

## 리스크

| 리스크 | 대응 |
|--------|------|
| progressMessage가 백엔드에서 한글 여러 종류로 내려옴 | 그대로 표시 (이미 백엔드가 결정한 텍스트) |
| 파일이 2초 전 상태 그대로라면 "멈춘 듯한" 느낌 | 실제로 멈춘 것이므로 유저가 알 수 있어야 함 — 정상 UX |
| 매우 빠른 처리 시 파일명이 번쩍거림 | 2초 고정 갱신 + 200ms fade로 완화 |
