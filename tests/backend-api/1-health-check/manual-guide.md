# 🔍 Health Check 수동 확인 가이드

## 📋 개요
자동화 테스트와 함께 수동으로 각 서비스 상태를 직접 확인하는 방법을 제공합니다.

## 🌐 브라우저에서 직접 확인

### 1. TARS Main API (필수 서비스)
```
URL: http://tars.giize.com:3010/api/health
포트: 3010
```
**예상 응답:**
```json
{
  "success": true,
  "message": "API is healthy",
  "database": "connected"
}
```

### 2. Document Status API (선택적 서비스)
```
URL: http://tars.giize.com:8080/health
포트: 8080
```
**예상 응답:**
```json
{
  "status": "healthy",
  "database": "connected"
}
```

### 3. RAG Search API (선택적 서비스)
```
URL: http://tars.giize.com:8000/
포트: 8000
```
**예상 응답:**
```json
{
  "message": "RAG Search API",
  "version": "1.0.0"
}
```

### 4. N8N Workflow (선택적 서비스)
```
URL: https://n8nd.giize.com/
포트: 5678
```
**예상 응답:** N8N 로그인 페이지 또는 대시보드

## 🖥️ 터미널에서 확인 (curl)

### 모든 서비스 한번에 확인
```bash
# TARS Main API
echo "=== TARS Main API ==="
curl -s http://tars.giize.com:3010/api/health | jq . || echo "JSON 파싱 실패"

# Document Status API
echo -e "\n=== Document Status API ==="
curl -s http://tars.giize.com:8080/health | jq . || echo "JSON 파싱 실패"

# RAG Search API
echo -e "\n=== RAG Search API ==="
curl -s http://tars.giize.com:8000/ | jq . || echo "JSON 파싱 실패"

# N8N Workflow
echo -e "\n=== N8N Workflow ==="
curl -s -I https://n8nd.giize.com/ | head -1
```

### 개별 서비스 확인
```bash
# 1. TARS Main API
curl -v http://tars.giize.com:3010/api/health

# 2. Document Status API
curl -v http://tars.giize.com:8080/health

# 3. RAG Search API
curl -v http://tars.giize.com:8000/

# 4. N8N Workflow
curl -v https://n8nd.giize.com/
```

## 📊 상태 코드 해석

| HTTP 코드 | 의미 | 조치 |
|-----------|------|------|
| 200 | ✅ 정상 | 추가 조치 불필요 |
| 404 | ⚠️ 엔드포인트 없음 | URL 확인 필요 |
| 500 | ❌ 서버 에러 | 서버 로그 확인 |
| 503 | ❌ 서비스 불가 | 서비스 재시작 필요 |
| ECONNREFUSED | ❌ 연결 거부 | 서버 미실행 |
| EHOSTUNREACH | ❌ 호스트 도달 불가 | 네트워크/방화벽 확인 |

## 🚨 문제 해결

### 연결 실패 시
1. **서비스 실행 상태 확인**
   ```bash
   sudo netstat -tulpn | grep :3010   # TARS Main
   sudo netstat -tulpn | grep :8080   # Document Status
   sudo netstat -tulpn | grep :8000   # RAG Search
   sudo netstat -tulpn | grep :5678   # N8N
   ```

2. **방화벽 확인**
   ```bash
   sudo ufw status
   ```

3. **Docker 컨테이너 확인** (RAG Search, Document Status)
   ```bash
   docker ps
   docker logs [컨테이너명]
   ```

### 응답 이상 시
1. **서버 로그 확인**
2. **의존성 서비스 확인** (MongoDB, Qdrant 등)
3. **리소스 사용량 확인** (CPU, 메모리, 디스크)

## ✅ 정상 상태 확인 체크리스트

- [ ] TARS Main API (3010) 응답 정상
- [ ] Document Status API (8080) 응답 정상 (또는 선택적 서비스)
- [ ] RAG Search API (8000) 응답 정상 (또는 선택적 서비스)
- [ ] N8N Workflow (5678) 응답 정상 (또는 선택적 서비스)
- [ ] 응답 시간이 10초 이내
- [ ] JSON 형식 응답 (N8N 제외)

## 📞 문제 발생 시 연락처
- 시스템 관리자: [연락처]
- 개발팀: [연락처]
- 문서 업데이트: [GitHub/문서 링크]