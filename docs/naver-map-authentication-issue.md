# 네이버 지도 API 인증 문제 해결 가이드

## 문제 상황

네이버 Maps Dynamic API를 프론트엔드에 통합하는 과정에서 지속적으로 인증 실패 에러가 발생했습니다.

### 에러 메시지
```
NAVER Maps JavaScript API v3 네이버 지도 Open API 인증이 실패하였습니다.
Error 200: Authentication Failed
```

### 환경 정보
- **프론트엔드**: React + TypeScript + Vite (localhost:5177)
- **네이버 클라우드**: NCP Console에서 Maps API 애플리케이션 생성
- **사용 API**: Dynamic Map (JavaScript API)
- **Client ID**: urrj0r17r8

---

## 시도한 해결 방법들

### 1차 시도: Web Service URL 등록 확인
- **시도**: Web Service URL에 `http://localhost` 등록
- **결과**: 실패
- **이유**: 파라미터 이름 자체가 잘못됨

### 2차 시도: 포트 번호 추가/제거
- **혼란**: 포트 번호가 필요한지 불필요한지에 대한 정보 혼선
- **결과**: 실패
- **이유**: 포트 번호 문제가 아니었음 (실제로는 포트 번호 불필요)

### 3차 시도: Application 재생성
- **시도**: 기존 애플리케이션 삭제 후 새로 생성
- **결과**: 실패
- **이유**: 근본 원인은 스크립트 로딩 파라미터 이름

---

## 🎯 최종 원인: API 파라미터 명칭 변경

### 핵심 문제

네이버가 Maps API의 **파라미터 이름을 변경**했습니다:
- **구버전**: `ncpClientId`
- **신버전**: `ncpKeyId` ✅

이것이 인증 실패의 **유일하고 결정적인 원인**이었습니다.

### 잘못된 코드

```html
<!-- ❌ 구버전 파라미터 사용 (인증 실패) -->
<script type="text/javascript"
        src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=urrj0r17r8">
</script>
```

### 올바른 코드

```html
<!-- ✅ 신버전 파라미터 사용 (인증 성공) -->
<script type="text/javascript"
        src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=urrj0r17r8">
</script>
```

---

## 해결 방법

### 1. index.html 수정

**파일 위치**: `frontend/aims-uix3/index.html`

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AIMS - Agent Intelligent Management System</title>

  <!-- Naver Maps API -->
  <script type="text/javascript"
          src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=urrj0r17r8">
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

### 2. Web Service URL 등록 규칙

NCP Console에서 애플리케이션 설정 시:

**올바른 등록 방법**:
```
Web Service URL: http://localhost
```

**잘못된 등록 방법**:
```
❌ http://localhost:5173
❌ http://localhost:5173/
❌ http://localhost/aims
```

**중요**:
- 포트 번호 **제외**
- URI 경로 **제외**
- 호스트 도메인만 등록

---

## 검증 방법

### 1. 브라우저 콘솔 확인

정상 작동 시:
```
[NaverMap] 지도 초기화 완료
```

인증 실패 시:
```
NAVER Maps JavaScript API v3 네이버 지도 Open API 인증이 실패하였습니다.
Error 200: Authentication Failed
```

### 2. 네트워크 탭 확인

개발자 도구 → Network → JS 필터:
- `maps.js?ncpKeyId=urrj0r17r8` 요청이 **200 OK**로 로드되어야 함
- 파라미터 이름이 `ncpKeyId`인지 확인

### 3. 실제 지도 렌더링 확인

지역별보기 페이지에서:
- 왼쪽: 지역 트리
- 오른쪽: 네이버 지도 (대한민국 중심)

---

## 참고 자료

### 공식 문서
- [Naver Maps JavaScript API v3 - Getting Started](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)
  - `ncpKeyId` 파라미터 사용 명시

### 커뮤니티 포럼
- [Naver Cloud Forums - 인증 실패 관련 토론](https://www.ncloud-forums.com/topic/513/)
  - Web Service URL 등록 시 포트 번호 불필요 확인
  - `ncpKeyId` 파라미터로 변경된 사실 확인

---

## 교훈

### 1. 공식 문서의 중요성
- 네이버 공식 가이드에 `ncpKeyId` 사용이 명시되어 있었음
- 초기에 공식 문서를 철저히 확인했다면 즉시 해결 가능

### 2. API 변경사항 추적
- 네이버가 파라미터 명칭을 변경했지만, 마이그레이션 가이드가 부족했음
- 구버전 자료와 신버전 자료가 혼재하여 혼란 발생

### 3. 체계적인 디버깅
- 문제 발생 시 근본 원인을 찾기 위해 공식 문서와 포럼을 먼저 확인
- 추측보다는 검증된 정보에 기반한 접근

### 4. 최소한의 수정 원칙 준수
- 인증 문제 해결 시 단 1줄의 파라미터 변경으로 해결
- 불필요한 추가 코드나 설정 변경 없이 최소한만 수정

---

## 요약

**문제**: `ncpClientId` 파라미터 사용으로 인한 인증 실패

**해결**: `ncpKeyId` 파라미터로 변경

**결과**: 네이버 지도 API 정상 작동, 지역별보기에 성공적으로 통합

**핵심**: API 제공자의 파라미터 명칭 변경을 놓쳤던 것이 원인

---

**작성일**: 2025-10-22
**프로젝트**: AIMS (Agent Intelligent Management System)
**관련 커밋**: feat(map): 지역별 보기에 네이버 지도 추가
