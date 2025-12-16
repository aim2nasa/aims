# AIMS 버전 관리 시스템

## 개요

AIMS 시스템의 각 구성요소 버전을 추적하고 표시하는 방법을 정의합니다.

## 배경

### 문제점
- 개발서버(localhost)와 운용서버(aims.giize.com)가 동일한지 확인하기 어려움
- 버전 번호(`v0.165.0`)만으로는 코드 동일성을 보장할 수 없음
- **Git commit hash**가 코드 동일성의 유일한 기준

### 결론
```
버전 번호(v0.165.0) = 수동 관리, 신뢰도 낮음
Git commit hash(7a83d7d2) = 코드 기반 자동 생성, 1바이트라도 다르면 완전히 다른 값
```

## 시스템 구성요소

| 구성요소 | 포트 | 버전 상태 | 비고 |
|----------|------|-----------|------|
| Frontend (React) | 5177 (dev), 443 (prod) | ✅ 구현됨 | package.json + git hash |
| aims_api (Node.js) | 3010 | ❌ 미구현 | Docker 컨테이너 |
| aims_rag_api (Python) | 8003 | ❌ 미구현 | Docker 컨테이너 |
| annual_report_api (Python) | 8004 | ⚠️ 버전만 있음 | `"version": "1.0.0"` |
| pdf_proxy (Python) | 8002 | ❌ 미구현 | Python 프로세스 |

### 현재 버전 정보 상태 (2025-12-16 기준)

| 서비스 | 버전 필드 | Git hash |
|--------|-----------|----------|
| Frontend | ✅ package.json | ✅ 빌드 시 주입 |
| aims_api | ❌ 없음 | ❌ 없음 |
| aims_rag_api | ❌ 응답 오류 | ❌ 없음 |
| annual_report_api | ✅ 1.0.0 | ❌ 없음 |
| pdf_proxy | ❌ 없음 | ❌ 없음 |

## 프론트엔드 버전 표시 (구현됨)

### UX 설계 원칙
> "Invisible until you need it" - Apple Design Philosophy

### 표시 방식 (A+B+D 조합)

| 상황 | 표시 내용 |
|------|-----------|
| 평소 | `v0.165.0` |
| 호버 | 툴팁으로 `v0.165.0 (7a83d7d2)` 표시 |
| 클릭 | 클립보드에 복사 + 토스트 알림 |
| 콘솔 | 앱 시작 시 자동 로그 |

### 기술 구현

1. **빌드 시 git hash 주입**
   - `vite.config.ts`에서 `child_process.execSync('git rev-parse --short HEAD')` 실행
   - Vite `define` 옵션으로 `__GIT_HASH__` 전역 변수 주입
   - `src/config/version.ts`에서 `declare const __GIT_HASH__: string`로 타입 선언 후 사용

2. **버전 정보 구조**
   ```typescript
   interface VersionInfo {
     version: string      // "0.165.0" (package.json)
     gitHash: string      // "7a83d7d2" (빌드 시 주입)
     buildTime?: string   // ISO timestamp (선택)
   }
   ```

3. **UI 컴포넌트**
   - 기존 LeftPane 하단 버전 표시 영역 수정
   - Tooltip 컴포넌트 활용
   - 클릭 시 `navigator.clipboard.writeText()` 호출

## 백엔드 버전 표시 (TODO)

### 목표
각 API의 `/health` 엔드포인트에 버전 정보 포함:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "gitHash": "abc1234",
  "database": "connected"
}
```

### 구현 방법

1. **배포 스크립트 수정**
   - 배포 시 `git rev-parse --short HEAD` 실행
   - 환경변수 `GIT_HASH`로 전달

2. **각 API 수정**
   - health 엔드포인트에 version, gitHash 필드 추가

3. **프론트엔드 통합 (향후)**
   - 설정 페이지 또는 시스템 정보 모달에서 전체 버전 조회
   - `/api/system/versions` 엔드포인트로 통합 조회

## 검증 방법

### 현재 (프론트엔드만)
```bash
# 로컬
cd d:/aims && git rev-parse --short HEAD

# 서버
ssh rossi@tars.giize.com "cd /home/rossi/aims && git rev-parse --short HEAD"

# 두 값이 같으면 동일한 코드
```

### 향후 (전체 시스템)
```bash
# 프론트엔드에서 시스템 버전 조회 API 호출
curl https://aims.giize.com/api/system/versions
```

## 관련 파일

- `frontend/aims-uix3/vite.config.ts` - git hash 빌드 타임 주입
- `frontend/aims-uix3/src/config/version.ts` - 버전 정보 모듈
- `frontend/aims-uix3/src/App.tsx` - 버전 표시 UI (LeftPane 하단)

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2025-12-16 | 초안 작성, 프론트엔드 버전 표시 구현 |
