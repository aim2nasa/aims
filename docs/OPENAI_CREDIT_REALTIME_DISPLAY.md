# OpenAI 크레딧 실시간 표시 가능 여부

> 작성일: 2026-02-02
> 결론: **잔액(remaining balance) API는 공식 미제공. 사용량(spending) 조회만 가능.**

---

## 1. OpenAI 공식 API 현황

| 항목 | API 지원 | 엔드포인트 | 비고 |
|------|----------|-----------|------|
| 일별 사용 비용 (Costs) | O | `GET /v1/organization/costs` | 일/시간 단위 비용 집계 |
| 토큰 사용량 (Usage) | O | `GET /v1/organization/usage/completions` | 모델별, 프로젝트별 필터 가능 |
| 임베딩 사용량 | O | `GET /v1/organization/usage/embeddings` | 임베딩 전용 |
| **잔여 크레딧/잔액** | **X** | 없음 | 공식 API 미제공 |
| **월 한도 잔여량** | **X** | 없음 | 공식 API 미제공 |
| **결제 정보** | **X** | 없음 | 공식 API 미제공 |

### 참고: 과거 비공식 엔드포인트 (현재 사용 불가)

| 엔드포인트 | 상태 |
|-----------|------|
| `GET /v1/dashboard/billing/subscription` | 폐기됨 (session token 필요, API key 미지원) |
| `GET /v1/dashboard/billing/credit_grants` | 폐기됨 |
| `GET /v1/usage?start_date=...&end_date=...` | 폐기됨 |

---

## 2. 현실적 대안

### 대안 A: 월 예산 기반 잔여량 표시

Admin에서 월 예산을 직접 설정하고, Costs API로 사용량을 조회하여 **"예산 대비 사용률"** 표시.

```
[예산: $50.00]  [사용: $42.30 (84.6%)]  [잔여: $7.70]
████████████████████░░░░ 84.6%
```

**구현:**
1. Admin 설정에 `openai_monthly_budget` 필드 추가
2. 백엔드에서 OpenAI Costs API 호출 (Admin API Key 필요)
3. `사용 비용 / 예산 * 100` 으로 진행률 계산

**장점:** 직관적, 예산 소진 전 경고 가능
**단점:** 실제 잔액이 아닌 추정치 (prepaid credit과 불일치 가능)

### 대안 B: QUOTA_EXCEEDED 감지 (현재 구현)

실제 API 호출 실패 시 빨간 배너로 알림. 크레딧 소진을 **사후 감지**.

```
! OpenAI API 크레딧 소진
  임베딩 생성에 필요한 OpenAI 크레딧이 부족합니다.
  [OpenAI 크레딧 충전 페이지]
```

**장점:** 구현 간단, 정확한 감지
**단점:** 사전 경고 불가 (소진 후에야 알 수 있음)

### 대안 C: 대안 A + B 조합 (권장)

- 평상시: 예산 대비 사용률 표시 (대안 A)
- 80% 도달: 노란색 경고
- 소진 감지: 빨간색 배너 (대안 B, 현재 구현)

---

## 3. OpenAI Costs API 상세

### 인증

- **Admin API Key** 필요 (일반 API Key로는 접근 불가)
- OpenAI 대시보드 → Settings → API Keys → Admin Key 생성

### 요청 예시

```bash
curl https://api.openai.com/v1/organization/costs \
  -H "Authorization: Bearer $OPENAI_ADMIN_KEY" \
  -d '{
    "start_time": 1706745600,
    "end_time": 1709424000,
    "bucket_width": "1d"
  }'
```

### 응답 구조

```json
{
  "object": "page",
  "data": [
    {
      "object": "bucket",
      "start_time": 1706745600,
      "end_time": 1706832000,
      "results": [
        {
          "object": "organization_costs_result",
          "amount": {
            "value": 0.042,
            "currency": "usd"
          },
          "line_item": "Embeddings",
          "project_id": "proj_xxx"
        }
      ]
    }
  ]
}
```

---

## 4. 구현 시 필요 작업 (대안 A 기준)

| 단계 | 내용 |
|------|------|
| 1 | OpenAI Admin API Key 발급 + 서버 환경변수 등록 |
| 2 | 백엔드: `/api/admin/openai-budget` GET/PUT API (예산 설정 + 비용 조회) |
| 3 | 백엔드: OpenAI Costs API 호출 + 캐싱 (1시간 주기) |
| 4 | 프론트: Admin AI/OCR 사용량 페이지에 예산 진행률 카드 추가 |
| 5 | 프론트: 80% 초과 시 경고 배너 표시 |

---

## 5. 참고 링크

- [OpenAI Usage API Reference](https://platform.openai.com/docs/api-reference/usage)
- [OpenAI Billing Overview](https://platform.openai.com/settings/organization/billing/overview)
- [OpenAI Community: How to view billing via API](https://community.openai.com/t/how-to-view-billing-via-api/1362751)
- [OpenAI Community: Access billing data via API](https://community.openai.com/t/access-billing-data-via-api/370172)
