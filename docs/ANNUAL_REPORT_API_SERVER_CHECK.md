# Annual Report API 서버 실행 확인 가이드

> Annual Report API 서버(포트 8004)의 실행 상태를 확인하고 관리하는 방법

## 📋 목차

1. [서버 실행 확인 방법](#서버-실행-확인-방법)
2. [서버 재시작 방법](#서버-재시작-방법)
3. [문제 해결](#문제-해결)
4. [로그 확인](#로그-확인)

---

## 🔍 서버 실행 확인 방법

### 1️⃣ 프로세스 확인 (기본)

가장 기본적인 확인 방법입니다.

```bash
ssh tars.giize.com 'ps aux | grep "annual_report_api/main.py" | grep -v grep'
```

**정상 출력 예시:**
```
rossi    3074960  0.1  0.8 168152 70820 ?        Sl   Nov06  12:43
/home/rossi/aims/backend/api/annual_report_api/venv/bin/python
/home/rossi/aims/backend/api/annual_report_api/main.py
```

**확인 항목:**
- **PID**: 프로세스 ID (예: 3074960)
- **실행 시간**: 서버가 시작된 시간 (예: Nov06 12:43)
- **경로**: 정확한 Python 인터프리터와 main.py 경로

**출력이 없으면**: ❌ 서버가 실행되지 않음 → [서버 재시작](#서버-재시작-방법) 참조

---

### 2️⃣ 헬스체크 API (가장 확실)

서버가 정상적으로 응답하는지 확인하는 가장 확실한 방법입니다.

```bash
ssh tars.giize.com 'curl -s http://localhost:8004/health | python3 -m json.tool'
```

**정상 응답 예시:**
```json
{
    "status": "healthy",
    "database": "connected",
    "openai": "configured",
    "version": "1.0.0"
}
```

**상태별 의미:**

| 항목 | 정상 값 | 의미 |
|------|---------|------|
| `status` | `healthy` | API 서버 정상 |
| `database` | `connected` | MongoDB 연결 정상 |
| `openai` | `configured` | OpenAI API 키 설정됨 |
| `version` | `1.0.0` | API 버전 |

**오류 응답 예시:**
```json
{
    "status": "unhealthy",
    "error": "Connection refused"
}
```

---

### 3️⃣ 포트 확인

서버가 포트 8004에서 리스닝 중인지 확인합니다.

```bash
ssh tars.giize.com 'netstat -tlnp 2>/dev/null | grep :8004'
```

**정상 출력 예시:**
```
tcp        0      0 0.0.0.0:8004            0.0.0.0:*               LISTEN      3074960/python
```

**확인 항목:**
- **포트**: `0.0.0.0:8004` (모든 인터페이스에서 리스닝)
- **상태**: `LISTEN` (연결 대기 중)
- **PID**: 프로세스 ID (프로세스 확인과 일치해야 함)

---

### 4️⃣ API 엔드포인트 전체 확인

서버의 모든 정보를 한 번에 확인합니다.

```bash
ssh tars.giize.com 'curl -s http://localhost:8004/ | python3 -m json.tool'
```

**정상 응답 예시:**
```json
{
    "name": "Annual Report API",
    "version": "1.0.0",
    "status": "running",
    "endpoints": {
        "health": "/health",
        "docs": "/docs",
        "parse": "/annual-report/parse (POST)",
        "query": "/customers/{customer_id}/annual-reports (GET)"
    }
}
```

---

### 5️⃣ 빠른 전체 체크 (권장)

한 번의 명령으로 모든 상태를 확인합니다.

```bash
ssh tars.giize.com '
echo "=========================================="
echo "  Annual Report API 서버 상태 확인"
echo "=========================================="
echo ""

echo "=== 1. 프로세스 확인 ==="
ps aux | grep "annual_report_api/main.py" | grep -v grep
if [ $? -eq 0 ]; then
  echo "✅ 프로세스 실행 중"
else
  echo "❌ 프로세스 없음"
fi
echo ""

echo "=== 2. 포트 확인 ==="
netstat -tlnp 2>/dev/null | grep :8004
if [ $? -eq 0 ]; then
  echo "✅ 포트 8004 리스닝 중"
else
  echo "❌ 포트 8004 닫혀있음"
fi
echo ""

echo "=== 3. 헬스체크 ==="
curl -s http://localhost:8004/health | python3 -m json.tool
echo ""
'
```

---

## 🚀 서버 재시작 방법

### 배포 스크립트 사용 (권장)

배포 스크립트를 사용하면 안전하게 서버를 재시작할 수 있습니다.

```bash
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && ./deploy_annual_report_api.sh'
```

**스크립트가 자동으로 수행하는 작업:**

1. ✅ 기존 프로세스 종료
2. ✅ 가상환경 확인 및 생성
3. ✅ 환경변수 (.env) 확인
4. ✅ 백그라운드로 새 프로세스 시작
5. ✅ 로그 파일 생성

**출력 예시:**
```
🚫 기존 프로세스 중지...
   기존 프로세스 종료됨
✅ 가상환경 확인 완료
🚀 새 프로세스 시작...
✅ Annual Report API 재배포 완료

📊 프로세스 정보:
  PID: 1234567
  포트: 8004

📖 로그 확인:
  tail -f /home/rossi/aims/backend/api/annual_report_api/logs/api.log

📊 상태 확인:
  ps aux | grep python | grep main.py

🌍 헬스체크:
  curl http://localhost:8004/health

🛑 프로세스 종료:
  pkill -f 'python.*main.py'
```

---

### 수동 재시작 (고급)

직접 프로세스를 제어하고 싶을 때 사용합니다.

#### 1. 기존 프로세스 종료

```bash
ssh tars.giize.com 'pkill -f "python.*annual_report_api/main.py"'
```

#### 2. 프로세스 종료 확인

```bash
ssh tars.giize.com 'ps aux | grep "annual_report_api/main.py" | grep -v grep'
```

출력이 없으면 종료 완료 ✅

#### 3. 새 프로세스 시작

```bash
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && \
  nohup venv/bin/python main.py >> logs/api.log 2>&1 &'
```

#### 4. 시작 확인 (5초 후)

```bash
ssh tars.giize.com 'sleep 5 && curl -s http://localhost:8004/health | python3 -m json.tool'
```

---

## 🛠️ 문제 해결

### 문제 1: 프로세스는 실행 중인데 응답이 없음

**증상:**
```bash
ps aux | grep main.py  # ✅ 프로세스 있음
curl http://localhost:8004/health  # ❌ 응답 없음
```

**원인:** 프로세스가 멈춰있거나 충돌 상태

**해결:**
```bash
# 1. 강제 종료
ssh tars.giize.com 'pkill -9 -f "annual_report_api/main.py"'

# 2. 재시작
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && ./deploy_annual_report_api.sh'

# 3. 로그 확인
ssh tars.giize.com 'tail -100 ~/aims/backend/api/annual_report_api/logs/api.log'
```

---

### 문제 2: 포트 8004가 이미 사용 중

**증상:**
```
[Errno 98] Address already in use
```

**원인:** 이전 프로세스가 완전히 종료되지 않음

**해결:**
```bash
# 1. 포트를 사용 중인 프로세스 찾기
ssh tars.giize.com 'lsof -i :8004'

# 2. 해당 PID 강제 종료
ssh tars.giize.com 'kill -9 <PID>'

# 3. 재시작
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && ./deploy_annual_report_api.sh'
```

---

### 문제 3: MongoDB 연결 실패

**증상:**
```json
{
    "status": "unhealthy",
    "database": "not_connected",
    "error": "Connection refused"
}
```

**원인:** MongoDB 서버가 실행되지 않음

**해결:**
```bash
# 1. MongoDB 상태 확인
ssh tars.giize.com 'systemctl status mongod'

# 2. MongoDB 재시작 (필요시)
ssh tars.giize.com 'sudo systemctl restart mongod'

# 3. Annual Report API 재시작
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && ./deploy_annual_report_api.sh'
```

---

### 문제 4: OpenAI API 키 없음

**증상:**
```json
{
    "status": "healthy",
    "database": "connected",
    "openai": "not_configured"
}
```

**원인:** .env 파일에 OPENAI_API_KEY가 설정되지 않음

**해결:**
```bash
# 1. .env 파일 확인
ssh tars.giize.com 'cat ~/aims/backend/api/annual_report_api/.env | grep OPENAI_API_KEY'

# 2. .env 파일 편집 (키가 없는 경우)
ssh tars.giize.com 'nano ~/aims/backend/api/annual_report_api/.env'

# 3. 다음 줄 추가 또는 수정:
# OPENAI_API_KEY=sk-proj-...

# 4. 재시작
ssh tars.giize.com 'cd ~/aims/backend/api/annual_report_api && ./deploy_annual_report_api.sh'
```

---

## 📖 로그 확인

### 실시간 로그 보기

```bash
ssh tars.giize.com 'tail -f ~/aims/backend/api/annual_report_api/logs/api.log'
```

**주요 로그 패턴:**

| 로그 메시지 | 의미 |
|------------|------|
| `✅ MongoDB 연결 성공` | 데이터베이스 연결 정상 |
| `✅ OPENAI_API_KEY 설정 확인` | OpenAI API 키 확인 완료 |
| `🚀 [BG Parsing] 시작` | 백그라운드 파싱 시작 |
| `✅ [BG Parsing] 파싱 완료` | 파싱 성공 |
| `❌ [BG Parsing] 파싱 실패` | 파싱 오류 발생 |

---

### 최근 로그 확인

```bash
# 최근 100줄
ssh tars.giize.com 'tail -100 ~/aims/backend/api/annual_report_api/logs/api.log'

# 특정 키워드 검색 (오류만)
ssh tars.giize.com 'grep "ERROR\|❌" ~/aims/backend/api/annual_report_api/logs/api.log | tail -50'

# 특정 키워드 검색 (파싱 관련)
ssh tars.giize.com 'grep "BG Parsing" ~/aims/backend/api/annual_report_api/logs/api.log | tail -20'
```

---

### 로그 파일 크기 확인

```bash
ssh tars.giize.com 'ls -lh ~/aims/backend/api/annual_report_api/logs/api.log'
```

**너무 크면 정리:**
```bash
# 백업 후 초기화
ssh tars.giize.com '
  cd ~/aims/backend/api/annual_report_api/logs
  mv api.log api.log.backup.$(date +%Y%m%d)
  touch api.log
'
```

---

## 📊 서버 정보 요약

| 항목 | 값 |
|------|-----|
| **서버** | tars.giize.com |
| **포트** | 8004 (내부 전용) |
| **프로세스** | `/home/rossi/aims/backend/api/annual_report_api/venv/bin/python main.py` |
| **로그 파일** | `~/aims/backend/api/annual_report_api/logs/api.log` |
| **배포 스크립트** | `~/aims/backend/api/annual_report_api/deploy_annual_report_api.sh` |
| **환경 설정** | `~/aims/backend/api/annual_report_api/.env` |
| **프록시** | Node.js API (3010) → Annual Report API (8004) |

---

## 🔗 관련 문서

- [Annual Report 기능 명세](./ANNUAL_REPORT_FEATURE_SPEC.md)
- [Annual Report 백엔드 구현](./ANNUAL_REPORT_BACKEND_IMPLEMENTATION.md)
- [Annual Report 사용자 가이드](./ANNUAL_REPORT_USER_GUIDE.md)
- [Annual Report 구현 계획](./ANNUAL_REPORT_IMPLEMENTATION_PLAN.md)

---

## 📝 체크리스트

서버 상태 점검 시 확인할 항목:

- [ ] 프로세스 실행 중
- [ ] 포트 8004 리스닝
- [ ] 헬스체크 API 정상 응답
- [ ] MongoDB 연결 성공
- [ ] OpenAI API 키 설정됨
- [ ] 로그 파일 오류 없음

---

**작성일**: 2025-11-11
**최종 수정**: 2025-11-11
**작성자**: Claude Code
