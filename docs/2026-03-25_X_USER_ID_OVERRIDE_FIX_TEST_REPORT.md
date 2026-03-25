# 테스트 결과 보고서

## 건명: x-user-id 오버라이드 제거 — 문서 일괄등록 prod 검증

| 항목 | 내용 |
|------|------|
| 일시 | 2026.03.25 14:20 ~ 15:39 |
| 환경 | Production (aims.giize.com) |
| 테스트 계정 | 곽승철 (aim2nasa@gmail.com) |
| 커밋 | `9dc11ff8` |
| 테스터 | Claude / 사용자 |

---

## 1. 버그 요약

### 현상
- dev(localhost:5177)에서 곽승철 계정으로 문서 일괄등록 → 캐치업코리아 387건 업로드
- prod(aims.giize.com)에서 동일 계정으로 접속 → 캐치업코리아 파일 0건 (보이지 않음)
- dev 전체 문서 1,847건 vs prod 전체 문서 776건 — 동일 DB인데 수치 불일치

### 근본 원인
백엔드 auth 미들웨어(`middleware/auth.js`)에서 **dev 환경(`NODE_ENV=development`)일 때 `x-user-id` 헤더로 JWT 사용자 ID를 오버라이드**하는 코드가 존재.

프론트엔드(`api.ts`)는 모든 요청에 `localStorage.getItem('aims-current-user-id')` 값을 `x-user-id` 헤더로 전송. 이 localStorage에 이전 세션의 **youmi 계정 ID가 잔존**하여, 곽승철로 로그인했음에도 실제 API 요청은 youmi ID로 전송됨.

**결과**: 업로드된 387건의 파일이 youmi의 ownerId로 저장 → prod에서 곽승철 계정으로 조회 불가.

| 환경 | JWT (실제 사용자) | x-user-id (오버라이드) | 적용된 ownerId |
|------|------------------|----------------------|---------------|
| dev | 곽승철 | youmi (stale) | youmi (잘못됨) |
| prod | 곽승철 | 무시됨 | 곽승철 (정상) |

---

## 2. 수정 내용

### 커밋: `9dc11ff8`

| 파일 | 변경 |
|------|------|
| `backend/api/aims_api/middleware/auth.js` | `authenticateJWT`, `authenticateJWTorAPIKey`의 dev x-user-id 오버라이드 제거 |
| `frontend/aims-uix3/src/shared/lib/api.ts` | `getAuthHeaders()`, `apiRequest()` fetch 빌더에서 x-user-id 헤더 전송 제거. `getCurrentUserId()`에서 dev-override 우선 로직 제거 |
| `frontend/.../annualReportProcessor.ts` | raw fetch의 x-user-id 헤더 제거 |
| `frontend/.../customerReviewProcessor.ts` | raw fetch의 x-user-id 헤더 제거, 미사용 import 정리 |
| 테스트 4개 파일 | x-user-id 관련 단언을 JWT 단일 인증 방향으로 변경 |

**원칙**: JWT 토큰이 유일한 사용자 인증 수단. localStorage의 stale 값으로 사용자 ID가 뒤바뀌는 일이 구조적으로 불가능.

---

## 3. 테스트 결과

### 3-1. 단위 테스트

| 항목 | 결과 |
|------|------|
| 백엔드 (aims_api) | PASS (전체 통과) |
| 프론트엔드 (vitest) | PASS (133 파일, 2,567 테스트, 0 실패) |
| 빌드 | PASS (3.27s) |

### 3-2. Production 일괄등록 테스트

| 항목 | 값 |
|------|---|
| 테스트 데이터 | 캐치업코리아 고객 문서 (법인자료, 개인자료, 건강검진 등) |
| 업로드 건수 | **388건** |
| 완료 건수 | **388건** (100%) |
| 실패 건수 | **0건** |
| ownerId 검증 | **곽승철 (`695cfe26...`) — 정상** |
| 소요 시간 | 73분 (14:26 ~ 15:39) |

### 3-3. 타임라인

| 시각 | 이벤트 | 곽승철 전체 파일 | 캐치업코리아 | processing |
|------|--------|:----------:|:--------:|:--------:|
| 14:26 | 업로드 시작 | 784 | 0 | 0 |
| 14:30 | 업로드 진행 중 | 1,058 | 282 | 237 |
| 14:33 | 업로드 진행 중 | 1,150 | 373 | 316 |
| 14:37 | **업로드 완료** | 1,177 | 394 | 325 |
| 14:44 | 파이프라인 처리 중 | — | — | 303 |
| 15:00 | 파이프라인 처리 중 | — | — | 217 |
| 15:12 | OCR 처리 가속 | — | — | 158 |
| 15:23 | HWP 변환 병목 구간 | — | — | 132 |
| 15:39 | **전체 완료** | 1,171 | 388 | **0** |

### 3-4. 파이프라인 처리 상세

- 업로드 큐: pending 0, processing 0, completed 1,034, failed 0
- HWP 변환 병목: 14:23~14:39 구간에서 HWP 파일 60초 타임아웃 + 재시도 발생 (정상 복구)
- OCR: Upstage API + OpenAI 분류 정상 동작
- 최종: 전 파일 completed, failed 0

### 3-5. 데이터 정합성 검증

| 검증 항목 | 결과 |
|----------|------|
| 캐치업코리아 파일 ownerId = 곽승철 | **388건 전체 일치** |
| 이전 잘못된 데이터 (youmi ownerId) | 387건 잔존 (별도 정리 필요) |
| processing 잔류 | 0건 |
| failed 잔류 | 0건 |

---

## 4. 잔여 이슈

| # | 이슈 | 심각도 | 상태 |
|---|------|--------|------|
| 1 | youmi ownerId로 잘못 저장된 캐치업코리아 387건 정리 필요 | Medium | 미처리 |
| 2 | HeaderView.tsx의 dev 사용자 전환 UI가 더 이상 동작하지 않음 (Dead UI) | Low | 미처리 |
| 3 | `aims-dev-user-override` localStorage 키 잔여 참조 정리 | Low | 미처리 |

---

## 5. 결론

**PASS** — x-user-id 오버라이드 제거 후 production 환경에서 문서 일괄등록이 올바른 ownerId로 정상 동작함을 확인. 388건 업로드 전량 성공, 실패 0건.
