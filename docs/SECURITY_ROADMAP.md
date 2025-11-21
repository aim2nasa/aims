# AIMS 보안 로드맵

**문서 목적**: 향후 AIMS 보안 강화를 위해 고려해야 할 사안들을 지속적으로 기록
**최종 업데이트**: 2025-11-22

---

## 보안 우선순위

| 우선순위 | 항목 | 현재 상태 | 권장 시점 |
|---------|------|----------|----------|
| 🔴 High | JWT 인증 도입 | 미구현 | 서비스 정식 오픈 전 |
| 🟡 Medium | API Rate Limiting | 미구현 | 사용자 증가 시 |
| 🟡 Medium | 감사 로그 시스템 | 미구현 | 서비스 오픈 후 |
| 🟢 Low | HTTPS 강제화 | 부분 적용 | 운영 환경 |

---

## 🔴 High Priority

### 1. JWT 인증 도입

**현재 문제점**:
- `x-user-id` HTTP 헤더로 사용자 식별
- 브라우저 개발자 도구로 헤더 변조 가능
- 악의적 사용자가 다른 설계사로 위장 가능

**권장 해결책**:
```
현재 방식:
  Headers: { "x-user-id": "user123" }  ← 변조 가능

JWT 방식:
  Headers: { "Authorization": "Bearer eyJhbGc..." }
  → 서버에서 서명 검증
  → 변조 시 401 Unauthorized
```

**구현 범위**:
- [ ] JWT 토큰 발급 API (로그인 시)
- [ ] 토큰 검증 미들웨어 (모든 API)
- [ ] 토큰 갱신 메커니즘 (Refresh Token)
- [ ] 프론트엔드 토큰 관리

**예상 작업량**: 2-3일

**권장 시점**: 서비스 정식 오픈 전

---

## 🟡 Medium Priority

### 2. API Rate Limiting

**현재 문제점**:
- API 호출 횟수 제한 없음
- DDoS 공격에 취약
- 악의적 대량 요청 가능

**권장 해결책**:
```javascript
// express-rate-limit 적용
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 100회
  message: 'Too many requests'
});

app.use('/api/', limiter);
```

**권장 시점**: 사용자 증가 시

---

### 3. 감사 로그 시스템

**현재 문제점**:
- 403 Forbidden 응답 발생 시 기록 없음
- 의심스러운 접근 패턴 추적 불가
- 보안 사고 발생 시 원인 분석 어려움

**권장 해결책**:
```javascript
// 보안 이벤트 로깅
const securityLog = {
  timestamp: new Date(),
  event: 'UNAUTHORIZED_ACCESS',
  userId: req.headers['x-user-id'],
  targetResource: req.params.id,
  ip: req.ip,
  userAgent: req.headers['user-agent']
};

await db.collection('security_logs').insertOne(securityLog);
```

**기록 대상**:
- [ ] 403 응답 (권한 없는 접근 시도)
- [ ] 401 응답 (인증 실패)
- [ ] 비정상적 요청 패턴
- [ ] 로그인 실패 반복

**권장 시점**: 서비스 오픈 후

---

## 🟢 Low Priority

### 4. HTTPS 강제화

**현재 상태**: 개발 환경에서 HTTP 사용

**운영 환경 적용 사항**:
- [ ] SSL 인증서 적용
- [ ] HTTP → HTTPS 리다이렉트
- [ ] HSTS 헤더 설정

---

## 향후 추가 검토 사항

새로운 보안 이슈 발견 시 이 섹션에 추가:

### (예시) 2025-XX-XX: 이슈 제목
- **발견 경위**:
- **위험도**:
- **권장 조치**:
- **상태**: 검토 중 / 대응 완료

---

## 보안 점검 체크리스트

서비스 오픈 전 확인 사항:

- [ ] JWT 인증 도입 완료
- [ ] 모든 API에 인증 미들웨어 적용
- [ ] HTTPS 적용
- [ ] 민감 정보 환경변수 분리
- [ ] 에러 메시지에 내부 정보 노출 없음
- [ ] SQL/NoSQL Injection 방어
- [ ] XSS 방어
- [ ] CORS 설정 검토

---

## 관련 문서

- [데이터 격리 현황](DATA_ISOLATION_STATUS.md)
- [고객 데이터 격리 작업](CUSTOMER_ISOLATION_FIX_PROGRESS.md)
- [문서 데이터 격리 작업](DOCUMENT_ISOLATION_FIX_PROGRESS.md)
