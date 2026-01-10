# AIMS 성능 테스트

k6를 사용한 API 부하/스트레스 테스트입니다.

## 설치

```bash
# macOS
brew install k6

# Windows (Chocolatey)
choco install k6

# Docker
docker pull grafana/k6
```

## 테스트 실행

### 부하 테스트 (Load Test)
일반적인 부하 상황에서 시스템 성능 측정:

```bash
k6 run tests/performance/api-load-test.js
```

### 스트레스 테스트 (Stress Test)
시스템 한계점 측정:

```bash
k6 run tests/performance/stress-test.js
```

### 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| K6_BASE_URL | API 기본 URL | http://localhost:3010 |

```bash
# 프로덕션 환경 테스트 (주의!)
K6_BASE_URL=https://aims.giize.com k6 run tests/performance/api-load-test.js
```

## 테스트 시나리오

### api-load-test.js
- Health Check
- 고객 목록 조회
- 문서 목록 조회
- 계약 목록 조회
- 문서 검색

### stress-test.js
- 무작위 엔드포인트 부하
- 최대 200 VU까지 증가
- 시스템 한계점 탐색

## 성능 기준 (SLA)

| 메트릭 | 기준 |
|--------|------|
| P95 응답 시간 | < 500ms |
| P99 응답 시간 | < 2000ms |
| 에러율 | < 1% |
| 처리량 | > 100 RPS |

## 결과 분석

테스트 결과는 `tests/performance/results/` 디렉토리에 JSON으로 저장됩니다.

```bash
# 결과 확인
cat tests/performance/results/summary.json
```

## CI/CD 통합

GitHub Actions에서 실행:

```yaml
- name: Run k6 load test
  uses: grafana/k6-action@v0.3.1
  with:
    filename: tests/performance/api-load-test.js
```
