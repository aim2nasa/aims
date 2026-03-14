# 지니 종합 품질 검증 보고서 — AIMS 로그인 UX 재설계

**검증일**: 2026.03.14
**대상**: Phase 1~5 전체 구현 (커밋 6652932c..7fef5019, 20개 파일, +1816줄)
**기준 문서**: `docs/2026-03-14_LOGIN_UX_PROPOSAL.md` v3.1

---

## 발견 이슈 목록

### Critical (2건)

**[Critical #1] ProtectedRoute에서 세션 토큰 서버 검증 미구현**

설계서 4.4절: "ProtectedRoute에서 session_token을 서버에 검증 요청 (GET /api/auth/verify-session)"

실제 구현 — `ProtectedRoute.tsx:70`:
```typescript
if (rememberDevice && !sessionToken) {
  return <Navigate to="/login?mode=pin" replace />;
}
```

클라이언트가 `sessionStorage.getItem('aims-session-token')` 값이 존재하는지만 확인. 서버에 유효성을 검증하지 않음. DevTools에서 `sessionStorage.setItem('aims-session-token', 'fake')` 한 줄이면 PIN 인증 완전 우회 가능. 서버에 `/verify-session` 엔드포인트가 구현되어 있음에도 프론트엔드에서 호출하지 않음.

**[Critical #2] 설계서 4.3절 — Refresh Token 및 tokenVersion 미구현**

설계서 4.3절: "JWT 1일 + Refresh Token 30일, DB 저장", "PIN 잠금 시 서버에 tokenVersion++ 요청"

현재 JWT 만료는 `process.env.JWT_EXPIRES_IN || '7d'`(7일)이며, tokenVersion 메커니즘 없음. PIN 5회 실패 시 기기 기억 localStorage만 삭제할 뿐, 서버에서 토큰을 무효화하지 않음.

---

### Major (4건)

**[Major #1] PIN 변경 라우트 오동작 — `?mode=pin-setup` 미처리**

`UserProfileMenu.tsx:175`: `navigate('/login?mode=pin-setup')`
`LoginPage.tsx`는 `mode === 'pin'` 조건만 처리. `mode=pin-setup`은 소셜 로그인 화면이 표시됨. "간편 비밀번호 변경" 메뉴가 동작하지 않음.

**[Major #2] 설계서 4.2절 — 지수 백오프 미구현**

설계서: "3회 실패: 2초 대기, 4회 실패: 5초 대기"
`LoginPage.tsx`의 `handlePinComplete`는 지수 백오프 없이 오류 메시지만 표시. 1~4회 실패 시 즉시 재시도 가능.

**[Major #3] 설계서 4.6절 — Idle Timeout 미구현**

설계서: "PC 30분 / 모바일 5분 미사용 시 세션 토큰 삭제 → PIN 재입력"
어떤 파일에서도 idle 감지 코드가 존재하지 않음.

**[Major #4] 설계서 4.5절 — BroadcastChannel PIN_VERIFIED 미구현**

`authStore.ts`에 BroadcastChannel이 구현되었으나 `LOGOUT` 이벤트만 처리. `PIN_VERIFIED` 메시지 전파 없음. 팝업 라우트(ai-assistant, annual-report)는 세션 토큰 없이 PIN 화면으로 리다이렉트됨.

---

### Minor (3건)

**[Minor #1]** ProtectedRoute에 inline style 사용 (CLAUDE.md 위반)
**[Minor #2]** E2E 테스트 TC-12가 `disabled` 체크박스를 기대하지만 실제는 `enabled`
**[Minor #3]** OAuth 토큰이 여전히 URL 쿼리 파라미터로 전달 (설계서 4.7절)

---

## 검증 체크리스트 요약

| 구분 | 내용 | 결과 |
|------|------|------|
| 설계서 정합성 | PIN API 6개, bcrypt 해시, 취약 PIN 차단, TTL 인덱스 | 부분 구현 |
| 보안 | JWT에서 userId 추출 | PASS |
| 보안 | sessionToken 서버 검증 | FAIL (Critical #1) |
| 보안 | tokenVersion/강제 무효화 | FAIL (Critical #2) |
| 보안 | Rate limit (메모리) | PASS |
| 보안 | 취약 PIN 차단 목록 | PASS |
| 보안 | 지수 백오프 | FAIL (Major #2) |
| CSS | var(--color-*) 사용 | PASS |
| CSS | inline style 금지 | FAIL (Minor #1) |
| 엣지 케이스 | Safari fallback | PASS |
| 엣지 케이스 | 멀티탭 로그아웃 | PASS |
| 엣지 케이스 | Idle Timeout | FAIL (Major #3) |
| 테스트 | authStore, PinInput, LoginPage Phase1/2 | PASS |
| 테스트 | E2E TC-12 코드 불일치 | FAIL (Minor #2) |

---

## 판정

```
GINI QUALITY GATE: FAIL

Critical 2건 + Major 4건 + Minor 3건

우선 수정 필요:
1. [Critical] ProtectedRoute에서 세션 토큰 서버 검증 추가
2. [Critical] JWT 만료 7d→1d 단축 (tokenVersion은 별도 스프린트)
3. [Major] mode=pin-setup 라우트 처리 추가
4. [Major] 지수 백오프 구현
5. [Major] Idle Timeout 구현
6. [Major] BroadcastChannel PIN_VERIFIED 전파
```
