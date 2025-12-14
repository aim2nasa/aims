# OCR 429 "Too Many Requests" 오류 분석

> 작성일: 2025.12.14

## 오류 개요

| 항목 | 내용 |
|------|------|
| 오류 코드 | `429` |
| 오류 메시지 | `Too Many Requests` |
| 원인 | Upstage Document OCR API Rate Limit 초과 |

## 정확한 원인

Upstage API는 서비스 안정성을 위해 **일정 시간 내 최대 API 호출 횟수를 제한**합니다. 이 제한을 초과하면 서버가 HTTP 429 상태 코드를 반환합니다.

### Rate Limit 측정 지표

| 지표 | 의미 | 적용 대상 |
|------|------|----------|
| **RPS** | Requests per Second (초당 요청 수) | 모든 API |
| **RPM** | Requests per Minute (분당 요청 수) | 모든 API |
| **TPM** | Tokens per Minute (분당 토큰 수) | 텍스트 모델 |
| **PPM** | Pages per Minute (분당 페이지 수) | 문서 처리 |

## Document OCR 티어별 Rate Limit

### 동기(Synchronous) API

| 티어 | RPS | PPM |
|------|-----|-----|
| Tier 0 (기본) | 1 | 300 |
| Tier 1 | 2 | 600 |
| Tier 2 | 5 | 1,200 |
| Tier 3 | 10 | 2,000 |
| Tier 4 (Enterprise) | 20 | 3,000 |

### 비동기(Asynchronous) API

| 티어 | RPS | PPM |
|------|-----|-----|
| Tier 0 (기본) | 2 | 1,200 |
| Tier 1 | 4 | 2,400 |
| Tier 2 | 10 | 6,000 |
| Tier 3 | 20 | 12,000 |
| Tier 4 (Enterprise) | 40 | 24,000 |

## 발생 시나리오

기본 티어(Tier 0)에서 동기 API 사용 시:
- **초당 1건 초과** 요청 시 429 발생
- **분당 300페이지 초과** 처리 시 429 발생

예: 다수의 문서를 동시에 업로드하거나, 짧은 시간 내 여러 OCR 요청이 집중되면 발생

## 해결 방안

### 1. 지수 백오프 (Exponential Backoff)

실패 시 대기 시간을 점진적으로 늘리며 재시도:

```javascript
async function retryWithBackoff(fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s, 8s, 16s
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### 2. 비동기 API 사용

동기 API 대비 **4배 높은 한도** 제공:
- 동기: 1 RPS / 300 PPM
- 비동기: 2 RPS / 1,200 PPM

### 3. 요청 큐잉 및 배치 처리

한 번에 몰아서 보내지 않고 분산:

```javascript
const queue = [];
const RATE_LIMIT = 1; // 초당 1건

setInterval(() => {
  if (queue.length > 0) {
    const request = queue.shift();
    processOCR(request);
  }
}, 1000 / RATE_LIMIT);
```

### 4. 티어 업그레이드

| 티어 | 최소 월 사용액 | 보너스 크레딧 |
|------|---------------|--------------|
| Explore | $100+ | +10% |
| Build | $500+ | +15% |
| Scale | $5,000+ | +20% |

## 참고 자료

- [Upstage Rate Limits Guide](https://console.upstage.ai/docs/guides/rate-limits)
- [Upstage Pricing](https://www.upstage.ai/pricing)
- [Upstage Document OCR API](https://console.upstage.ai/docs/capabilities/document-ocr)

## 관련 문서

- [OCR_TROUBLESHOOTING.md](./OCR_TROUBLESHOOTING.md)
