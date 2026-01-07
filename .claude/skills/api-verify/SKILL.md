---
name: api-verify
description: 백엔드 API 응답 확인. API 연동, 엔드포인트 확인, 응답 구조 파악 작업 시 자동 사용
---

# AIMS API 검증 규칙

이 스킬은 AIMS 프로젝트의 API 연동 규칙을 적용합니다.

## 핵심 원칙

**추측 금지** - 반드시 실제 API 호출로 응답 구조 확인 필수

## API 검증 명령어

### 기본 형식
```bash
ssh tars.giize.com 'curl -s "http://localhost:PORT/api/ENDPOINT" | python3 -m json.tool'
```

### 인증이 필요한 경우
```bash
ssh tars.giize.com 'curl -s -H "Authorization: Bearer TOKEN" "http://localhost:PORT/api/ENDPOINT" | python3 -m json.tool'
```

### POST 요청
```bash
ssh tars.giize.com 'curl -s -X POST -H "Content-Type: application/json" -d '\''{"key":"value"}'\'' "http://localhost:PORT/api/ENDPOINT" | python3 -m json.tool'
```

## 서비스별 포트 매핑

| 서비스 | 포트 | 용도 |
|--------|------|------|
| aims_api | 3010 | 메인 API (고객, 문서, 인증) |
| aims_rag_api | 8000 | 검색 API (키워드, 시맨틱) |
| aims_mcp | 3011 | MCP 서버 (AI 연동) |
| pdf_proxy | 8002 | PDF 프록시 |
| annual_report_api | 8004 | 연간 보고서 분석 |
| pdf_converter | 8005 | PDF 변환 |

## 자주 사용하는 API 확인 예시

### 헬스체크
```bash
# 모든 서비스 헬스체크
ssh tars 'curl -s http://localhost:3010/health'
ssh tars 'curl -s http://localhost:8000/health'
ssh tars 'curl -s http://localhost:3011/health'
ssh tars 'curl -s http://localhost:8002/health'
ssh tars 'curl -s http://localhost:8004/health'
ssh tars 'curl -s http://localhost:8005/health'
```

### 고객 API (aims_api)
```bash
# 고객 목록 조회
ssh tars 'curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/customers" | python3 -m json.tool | head -50'

# 특정 고객 조회
ssh tars 'curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/customers/CUSTOMER_ID" | python3 -m json.tool'
```

### 문서 API (aims_api)
```bash
# 문서 목록 조회
ssh tars 'curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/files" | python3 -m json.tool | head -50'
```

### 검색 API (aims_rag_api)
```bash
# 키워드 검색
ssh tars 'curl -s "http://localhost:8000/search?q=검색어&user_id=USER_ID" | python3 -m json.tool'

# 시맨틱 검색
ssh tars 'curl -s -X POST -H "Content-Type: application/json" -d '\''{"query":"검색어","user_id":"USER_ID"}'\'' "http://localhost:8000/semantic-search" | python3 -m json.tool'
```

## 응답 구조 확인 시 주의사항

1. **필드명 정확히 확인**: `customerId` vs `customer_id` (camelCase vs snake_case)
2. **중첩 구조 확인**: `response.data.items` vs `response.items`
3. **타입 확인**: 문자열 ID vs 숫자 ID
4. **배열 vs 객체**: `[]` vs `{}`

## 프론트엔드 연동 시

### Tailscale VPN 경유 (개발 환경)
```
프론트엔드 localhost:5177 → Tailscale VPN → 백엔드 100.110.215.65:3010
```

### vite.config.ts 프록시 설정
```typescript
proxy: {
  '/api': {
    target: 'http://100.110.215.65:3010',  // Tailscale VPN
    secure: false,
    changeOrigin: true
  }
}
```

## 디버깅 팁

### 응답이 없을 때
```bash
# 서비스 상태 확인
ssh tars 'pm2 list'

# 로그 확인
ssh tars 'pm2 logs aims-api --lines 50'
```

### 401 Unauthorized
```bash
# 토큰 유효성 확인
ssh tars 'curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/auth/me" | python3 -m json.tool'
```

### 응답 구조 전체 확인
```bash
# head 없이 전체 응답
ssh tars 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'
```
