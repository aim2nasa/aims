# 교차 검증 보고서 — AIMS 로그인 UX 재설계 리뷰 검증

**검증일**: 2026.03.14
**검증 대상**: Gini 품질 검증 보고서 + Code Reviewer 코드 리뷰 보고서
**검증자**: Security Auditor, Alex (개발자/아키텍트), Sora (보험 설계사)

---

## 1. 심각도 재판정 종합표

| # | 이슈 | Gini | Code Reviewer | Security Auditor | Alex | Sora | **최종 판정** |
|---|------|------|--------------|-----------------|------|------|------------|
| 1 | admin-login 인증 부재 | **누락** | Critical | Critical | Critical | 배포전필수 | **Critical P0** |
| 2 | sessionToken 서버 검증 미구현 | Critical | Critical | Critical | Critical | 개발팀판단 | **Critical P0** |
| 3 | mode=pin-setup 라우트 미처리 | Major | Warning | Major | Major | 배포전필수 | **Major P1** |
| 4 | BroadcastChannel PIN_VERIFIED | Major | 미언급 | Major | Major+보완 | 배포전필수 | **Major P1** |
| 5 | Idle Timeout 미구현 | Major | 미언급 | Major | Major | 1주내추가 | **Major P2** |
| 6 | tokenVersion/Refresh Token | Critical | 미언급 | **Major로 하향** | **Major로 하향** | 개발팀판단 | **Major P2** |
| 7 | JWT URL 쿼리 노출 | Minor | Critical | **P2로 조정** | **Major** | 무관 | **Major P2** |
| 8 | 지수 백오프 미구현 | Major | 미언급 | Major | **Minor로 하향** | 급하지않음 | **Minor P3** |
| 9 | CSS 브랜드 색상 하드코딩 | 미언급 | Critical | **Suggestion** | **반박(예외)** | 무관 | **예외 허용** |
| 10 | `<button>` 직접 사용 | 미언급 | Critical | **Suggestion** | **반박(규칙없음)** | 무관 | **Suggestion** |
| 11 | ProtectedRoute inline style | Minor | Warning | 동의 | Minor | 무관 | **Minor** |
| 12 | E2E TC-12 불일치 | Minor | Warning | 동의 | 동의 | 무관 | **Minor** |
| 13 | console.log PII 노출 | 미언급 | Warning | Warning | 미언급 | 무관 | **Warning** |

---

## 2. 오탐/과장 판정

### Code Reviewer 과장 (2건)
- **Critical #4 (CSS 브랜드 색상)**: Security Auditor + Alex 모두 **반박**. 카카오/네이버/구글 브랜드 가이드라인에서 강제하는 고정 색상이므로 CSS 변수화 불필요. 보안 이슈 아님.
- **Critical #5 (`<button>` 직접 사용)**: Alex **반박**. CLAUDE.md에 `<Button>` 강제 규칙 없음. 소셜 로그인 버튼은 고유 디자인으로 범용 컴포넌트에 부적합.

### Gini 과장 (1건)
- **Critical #2 (tokenVersion)**: Security Auditor + Alex 모두 **Major로 하향 권장**. 기기 기억 해제 메커니즘이 이미 강제 재인증을 보장하므로 실질적 위험 제한적.

---

## 3. 놓친 이슈 (신규 발견)

### Security Auditor 신규 발견 (2건)
- **[신규-01] verify-session API가 sessionToken을 query string으로 수신** (Medium) — 서버 로그에 토큰 노출. POST body로 변경 필요.
- **[신규-03] onRehydrateStorage가 만료된 JWT도 isAuthenticated=true로 복원** (Medium) — jwt-decode로 exp 사전 검사 권장.

### Alex 신규 발견 (2건)
- **[추가 #1] LoginPage에서 aims-remembered-user 미저장** (Major) — OAuth 콜백이 `/login?token=`으로 돌아올 때 AuthCallbackPage가 아닌 LoginPage가 처리하는데, remembered user 저장 로직 없음. 다음 방문 시 PIN 화면에서 사용자 이름 미표시.
- **[추가 #3] LoginPage 배경색 설정에 el.style.background 사용** (Minor) — document.body.classList.add('login-active') 방식으로 대체 가능.

### Alex 보완 (1건)
- **BroadcastChannel PIN_VERIFIED 한계**: sessionStorage는 탭 간 공유되지 않으므로, BroadcastChannel로 PIN_VERIFIED를 전파해도 팝업 탭의 sessionStorage에 토큰을 직접 저장할 수 없음. 팝업 라우트 전용 세션 공유 메커니즘 별도 설계 필요.

---

## 4. Sora (보험 설계사) 실사용자 검증

### 배포 전 필수 3건
1. **간편 비밀번호 변경 (pin-setup)** — "메뉴 눌러서 안 되면 그냥 포기해요. 비밀번호를 못 바꾸면 보안이고 뭐고 없어요"
2. **팝업 PIN 재입력 (BroadcastChannel)** — "AI 어시스턴트 열었는데 또 비밀번호? 그러면 안 써요"
3. **admin-login 인증** — "비밀번호 없이 관리자 계정 들어간다니 무서워요"

### 추가 UX 피드백
- "PIN"이 화면에 노출되는 곳 전수 검사 필요 → "간편 비밀번호"로 통일
- 5번 틀려서 잠겼을 때 안내 문구 보강: "소셜 로그인 후 비밀번호를 새로 만들 수 있습니다"
- 모바일 Idle Timeout 5분 → 10분 권장 ("통화 중 AIMS 보다가 잠기면 짜증나요")
- "나중에 설정하기" 누르기 전 결과 안내 부족

### Sora 결론
> "쓸 수 있는 상태에 거의 다 왔어요. 3개만 고치면 내일부터 써볼게요."

---

## 5. 최종 수정 우선순위 (3자 합의)

### P0 — 즉시 (배포 차단)
| # | 항목 | 합의 근거 |
|---|------|----------|
| 1 | admin-login 비활성화 또는 인증 추가 | Security+Alex+Sora 전원 동의 |
| 2 | ProtectedRoute verify-session API 호출 | Security+Gini+Alex 전원 동의 |

### P1 — 이번 스프린트 (배포 전 권장)
| # | 항목 | 합의 근거 |
|---|------|----------|
| 3 | mode=pin-setup 라우트 처리 | Gini+Alex+Sora 동의 |
| 4 | BroadcastChannel PIN_VERIFIED + 팝업 세션 설계 | Gini+Alex+Sora 동의 |
| 5 | LoginPage에서 aims-remembered-user 저장 | Alex 신규 발견 |
| 6 | verify-session API를 POST로 변경 | Security 신규 발견 |

### P2 — 다음 스프린트
| # | 항목 |
|---|------|
| 7 | Idle Timeout (PC 30분, 모바일 10분) |
| 8 | JWT 만료 7d → 1d |
| 9 | JWT URL 토큰 즉시 제거 |
| 10 | 토큰 처리 로직 공통 함수 추출 |

### P3 — 개선
| # | 항목 |
|---|------|
| 11 | 지수 백오프 (UX) |
| 12 | inline style 정리 |
| 13 | console.log PII 제거 |
| 14 | E2E TC-12 수정 |
| 15 | rgba() → CSS 변수 |
