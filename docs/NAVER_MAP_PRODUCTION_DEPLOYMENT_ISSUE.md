# 네이버 지도 프로덕션 배포 인증 문제 해결

## 문제 상황

**증상**: 프로덕션 환경(`https://aims.giize.com`)에 배포 후 "지역별 보기" 페이지의 네이버 지도가 표시되지 않음

**에러 메시지**:
```
네이버 지도 Open API 인증이 실패하였습니다
```

**발생 시점**: 로컬 개발 환경(`http://localhost:5177`)에서는 정상 작동하던 지도가 프로덕션 도메인으로 배포 후 작동하지 않음

---

## 원인 분석

### 네이버 Maps API 인증 방식

네이버 Maps API는 **도메인 기반 인증**을 사용합니다:

1. **Client ID 검증**: `ncpKeyId` 파라미터로 전달된 클라이언트 ID 확인
2. **도메인 검증**: 요청이 발생한 도메인이 NCP Console에 등록된 "Web Service URL" 목록에 있는지 확인
3. **둘 다 통과해야** 인증 성공

### 문제의 핵심

- ✅ **개발 환경**: `http://localhost`가 NCP에 등록되어 있음 → 정상 작동
- ❌ **프로덕션 환경**: `https://aims.giize.com`이 NCP에 등록되지 않음 → 인증 실패

**결론**: 새로운 도메인으로 배포 시 반드시 해당 도메인을 NCP Console에 추가해야 함

---

## 해결 방법

### 1단계: Naver Cloud Platform Console 접속

```
https://console.ncloud.com
```

### 2단계: 애플리케이션 찾기

1. **AI·NAVER API** 메뉴 선택
2. **Application** 선택
3. **현재 사용 중인 애플리케이션 선택**
   - Client ID: `urrj0r17r8`

### 3단계: Web Service URL 추가

**편집 버튼 클릭** 후 다음 도메인 추가:

```
https://aims.giize.com
```

**⚠️ 중요 - 올바른 등록 형식**:
```
✅ 올바름: https://aims.giize.com
❌ 잘못됨: https://aims.giize.com/
❌ 잘못됨: https://aims.giize.com:443
❌ 잘못됨: https://aims.giize.com/view=customers-regional
```

**규칙**:
- 프로토콜 포함 (`https://`)
- 포트 번호 **제외**
- URI 경로 **제외**
- 끝에 슬래시(`/`) **제외**
- 호스트 도메인만 정확히 입력

### 4단계: 설정 반영 대기

```
저장 → 5분 정도 대기 (DNS 전파 시간)
```

### 5단계: 브라우저에서 검증

```bash
# 브라우저에서 프로덕션 사이트 접속
https://aims.giize.com

# 하드 리프레시 (브라우저 캐시 무시)
Ctrl+Shift+R

# 지역별 보기 페이지로 이동
좌측 메뉴 → "지역별 보기" 클릭
```

---

## 검증 방법

### 1. 브라우저 개발자 도구 콘솔 확인

**정상 작동 시**:
```
[NaverMap] 지도 초기화 완료
```

**인증 실패 시**:
```
NAVER Maps JavaScript API v3 네이버 지도 Open API 인증이 실패하였습니다.
Error 200: Authentication Failed
```

### 2. 네트워크 탭 확인

**개발자 도구 → Network → JS 필터**:

```
요청: https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=urrj0r17r8
상태: 200 OK
응답: JavaScript 코드 정상 로드
```

### 3. 실제 지도 렌더링 확인

**지역별 보기 페이지**:
- 왼쪽: 지역 트리 (주소 미입력 5명 → 캐치잇 코리아 등)
- 오른쪽: 네이버 지도 (대한민국 중심, 줌 레벨 7)
- 지도 위에 네이버 로고와 컨트롤 버튼 표시

---

## 현재 설정 (참고)

### index.html (프론트엔드)

**파일 위치**: `frontend/aims-uix3/index.html`

```html
<!-- Naver Maps API -->
<script type="text/javascript"
        src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=urrj0r17r8">
</script>
```

**핵심**:
- 파라미터: `ncpKeyId` (구버전 `ncpClientId` 아님!)
- Client ID: `urrj0r17r8`

### NCP Application 설정 (필수 등록)

**Web Service URL 목록**:
```
- http://localhost          (개발 환경)
- https://aims.giize.com    (프로덕션 환경)
```

---

## 체크리스트

배포 전 확인 사항:

- [ ] 새 도메인을 NCP Console에 추가했는가?
- [ ] 도메인 형식이 올바른가? (프로토콜 포함, 포트/경로 제외)
- [ ] 설정 저장 후 5분 이상 대기했는가?
- [ ] 브라우저 하드 리프레시(`Ctrl+Shift+R`)를 했는가?
- [ ] 개발자 도구 콘솔에 인증 에러가 없는가?
- [ ] 실제 지도가 정상적으로 렌더링되는가?

---

## 향후 배포 시 주의사항

### 새 도메인 추가 시마다 NCP 등록 필수

```
개발: http://localhost
스테이징: https://staging.aims.giize.com    ← 추가 필요
프로덕션: https://aims.giize.com            ← 추가 완료
```

**원칙**: 모든 배포 환경의 도메인을 NCP Console에 사전 등록

### 서브도메인도 별도 등록 필요

```
https://aims.giize.com       ← 등록 1
https://www.aims.giize.com   ← 별도 등록 필요 (다른 도메인으로 간주)
```

### HTTPS/HTTP 구분

```
http://example.com    ← 등록 1
https://example.com   ← 별도 등록 필요 (프로토콜이 다름)
```

---

## 관련 문서

- [naver-map-authentication-issue.md](./naver-map-authentication-issue.md) - 초기 인증 문제 해결 (파라미터 이름 변경)
- [FRONTEND_DEPLOYMENT.md](./FRONTEND_DEPLOYMENT.md) - 프론트엔드 배포 가이드

---

## 요약

**문제**: 프로덕션 도메인(`https://aims.giize.com`)이 NCP에 등록되지 않아 네이버 지도 API 인증 실패

**해결**: NCP Console → AI·NAVER API → Application → Web Service URL에 `https://aims.giize.com` 추가

**교훈**: 새 도메인 배포 시 반드시 외부 API 제공자(NCP)에 도메인 등록 필수

---

**작성일**: 2025-11-23
**프로젝트**: AIMS (Agent Intelligent Management System)
**관련 페이지**: 지역별 보기 (CustomerRegionalView)
