# AIMS Load Test (동시접속 수용량 테스트)

## 목적
동시접속 설계사 수를 점진적으로 늘리며 시스템 성능을 측정하고, 그래프로 분석합니다.

## 사전 준비

### 1. k6 설치
```bash
# Windows
winget install Grafana.k6

# Mac
brew install k6

# Linux
sudo apt install k6
```

### 2. 테스트용 JWT 토큰 획득
1. AIMS 사이트 로그인 (https://aims.giize.com)
2. 브라우저 개발자도구 열기 (F12)
3. Application → Local Storage → aims.giize.com
4. `auth-storage-v2` 값에서 `token` 복사

## 테스트 실행

### 기본 실행 (10 → 100명)
```bash
k6 run --env TOKEN=eyJ... aims-capacity-test.js
```

### CSV 결과 저장 (그래프 생성용)
```bash
k6 run --env TOKEN=eyJ... --out csv=results.csv aims-capacity-test.js
```

### 최대 동시접속자 조절
```bash
k6 run --env TOKEN=eyJ... --env MAX_VUS=200 aims-capacity-test.js
```

### 다른 서버 테스트
```bash
k6 run --env TOKEN=eyJ... --env BASE_URL=http://localhost:3010 aims-capacity-test.js
```

## 결과 분석

### 콘솔 출력
테스트 완료 후 자동으로 요약 결과가 출력됩니다:
```
📊 AIMS 동시접속 수용량 테스트 결과
============================================================
🎯 테스트 최대 동시접속자: 100명

📈 전체 성능:
   총 요청 수: 1,523
   처리량: 12.5 req/s
   평균 응답시간: 245ms
   95% 응답시간: 892ms
   에러율: 0.52%

💡 용량 추정: ✅ 양호: 약 100명 처리 가능
```

### 그래프 분석
1. `generate-report.html` 파일을 브라우저에서 열기
2. `results.csv` 내용을 붙여넣기
3. "분석 실행" 클릭

생성되는 그래프:
- 📈 동시접속자 vs 응답시간
- 📊 응답시간 분포 (P50/P95/P99)
- ⚡ 처리량 (Requests)
- 🎯 권장 동시접속자 분석

## 테스트 시나리오

### 단계별 증가
| 단계 | 시간 | 동시접속자 | 목적 |
|------|------|------------|------|
| 1 | 0:30 | 10명 | 워밍업 |
| 2 | 1:30 | 10명 | 기준 측정 |
| 3 | 2:00 | 20명 | 증가 |
| 4 | 3:00 | 20명 | 측정 |
| 5 | 3:30 | 30명 | 증가 |
| ... | ... | ... | ... |
| 11 | 8:00 | 100명 | 최대 |
| 12 | 10:00 | 100명 | 피크 유지 |

### 시뮬레이션 동작
각 가상 사용자(VU)는 다음 행동을 반복:
1. 헬스체크 → 문서 목록 조회 → 문서 상세(50%)
2. 고객 목록 조회 → 고객 상세(30%)
3. 검색(20%)
4. 생각 시간(2~5초)

## 성능 기준

| 지표 | 우수 | 양호 | 주의 | 성능 저하 |
|------|------|------|------|----------|
| P95 응답시간 | <1초 | <2초 | <3초 | >3초 |
| 에러율 | <1% | <5% | <10% | >10% |

## 파일 구조
```
tests/load-test/
├── aims-capacity-test.js    # 메인 테스트 스크립트
├── aims-realistic-load-test.js  # 복잡한 시나리오 (참고용)
├── generate-report.html     # 그래프 생성 HTML
└── README.md               # 이 파일
```
