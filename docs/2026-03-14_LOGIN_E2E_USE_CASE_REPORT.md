# 로그인 E2E Use Case 테스트 보고서

**테스트일**: 2026.03.14
**테스트 환경**: https://localhost:5177 (Chromium Playwright)
**PC 기준 해상도**: 1920x1080
**모바일 기준**: 390x844 (iPhone 12)

---

## 테스트 결과 요약

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | 소셜 로그인 페이지 초기 상태 | **PASS** |
| 1b | 카카오 OAuth 리다이렉트 | **PASS** |
| 2 | 로그아웃 후 재방문 | **PASS** |
| 3 | PIN 설정 플로우 (체크박스 → 로그인) | **FAIL** |
| 4 | PIN 재방문 (탭 닫기 → 재접속) | SKIP (OAuth 필요) |
| 5 | PIN 잘못 입력 | SKIP (서버 PIN 필요) |
| 6 | PIN 화면 → 다른 계정으로 전환 | **FAIL** |
| 7 | 나중에 설정하기 | **FAIL** |
| 8 | 모바일 뷰포트 | **PASS** |

**PASS 4 / FAIL 3 / SKIP 2 (실행 기준 58%) — 전체 FAIL**

---

## 핵심 버그 2건

### BUG-1 (HIGH): 재방문 시 PIN 화면이 렌더링되지 않음

**증상**: aims-remember-device=true + aims-remembered-user가 localStorage에 있고, ProtectedRoute가 /login?mode=pin으로 리다이렉트하지만, PIN 입력 화면 대신 소셜 로그인 화면이 표시됨.

**근본 원인**: `LoginPage.tsx:317`의 렌더링 조건:
```typescript
if (isPinMode && rememberedUser && pinSetupStep !== 'check') {
```

`pinSetupStep`의 초기값이 `'check'`이고, `authToken`이 null이면 이 값이 변경되지 않음.
재방문 시(브라우저 닫았다 열기) JWT가 만료되거나 sessionStorage에서 삭제되어 `authToken=null` → `pinSetupStep`이 `'check'`에 고착 → PIN 화면 미표시.

**영향**: PIN을 설정한 사용자가 재방문하면 PIN 입력 화면이 안 나오고 소셜 로그인 화면만 보임. **PIN 기능 자체가 무용지물.**

**수정 방향**: `authToken`이 없어도 `rememberedUser`가 있으면 PIN 입력 화면을 표시하고, PIN 입력 시점에 토큰 갱신/재인증을 수행해야 함.

---

### BUG-2 (LOW): handleDevLogin이 localStorage.clear() 호출

**증상**: 개발 모드에서 체크박스 체크 후 "개발용 로그인 건너뛰기" 클릭 → PIN 설정 화면 미표시, 바로 메인 진입.

**근본 원인**: `LoginPage.tsx:173`의 `handleDevLogin`에서 `localStorage.clear()`로 `aims-remember-device`를 삭제.

**영향**: 개발 환경에서 PIN 플로우 테스트 불가. 프로덕션 OAuth 사용자는 영향 없음.

---

## 사용자(Sora 설계사) 관점 평가

### 현재 상태에서 사용자 경험

1. **카카오 로그인 → 바로 메인 진입**: PIN 설정을 했어도 재방문 시 소셜 로그인 화면이 나옴. 체크박스를 체크한 의미가 없음.
2. **PIN 입력 화면을 한번도 볼 수 없음**: 설정은 되지만 다음 방문에서 활용이 안 됨.
3. **결론**: 로그인 UX 0점. PIN 기능이 존재하나 동작하지 않음.

### 정상적으로 동작해야 하는 플로우

```
[첫 방문] 소셜 로그인 → 체크박스 체크 → PIN 설정 → 메인
[재방문] 로그인 페이지 → PIN 입력 화면 → 4자리 입력 → 메인
[PIN 잊음] "다른 계정으로 로그인" → 소셜 로그인 → PIN 재설정
```

현재는 [재방문] 단계가 완전히 깨져있음.

---

## 참고 문서

- [로그인 UX 설계서 v3.1](docs/2026-03-14_LOGIN_UX_PROPOSAL.md)
- [Gini 품질 검증](docs/2026-03-14_LOGIN_GINI_REVIEW.md)
- [Code Review](docs/2026-03-14_LOGIN_CODE_REVIEW.md)
- [교차 검증](docs/2026-03-14_LOGIN_CROSS_VALIDATION.md)
