# Admin OCR 사용량 페이지 개선 계획

> **상태**: 조사 완료, 구현 대기
> **작성일**: 2025-12-15
> **목적**: OCR 페이지 수 집계 및 예상 비용 표시 기능 추가

---

## 배경

현재 Admin OCR 사용량 페이지는 **파일 건수**만 집계하고 있음.
Upstage OCR은 **페이지 단위**로 과금되므로, 실제 비용 파악을 위해 페이지 수 집계가 필요함.

### Upstage OCR 과금 정보 (2025-12 기준)

| 항목 | 값 |
|------|-----|
| Document OCR Standard | $0.22 / 149 pages |
| **페이지당 비용** | **$0.001476** (약 $0.0015) |

---

## 현재 상태 분석

### 1. 데이터 흐름

```
파일 업로드 → Redis Stream → OCRWorker (n8n) → DocOCR (n8n) → Upstage API
                                    ↓
                              MongoDB 저장
```

### 2. Upstage API 응답에 페이지 정보 존재

**DocOCR.json - "Normalize DocOCR Response" 노드**:
```javascript
num_pages = response.body.numBilledPages ?? null;
pages = response.body.pages ?? [];
```

### 3. 현재 문제점

| 위치 | 문제 |
|------|------|
| DocOCR.json | "Set OCR Success Response"에서 `num_pages`를 응답에 포함하지 않음 |
| OCRWorker.json | "OCR Done"에서 `ocr.page_count`를 MongoDB에 저장하지 않음 |
| ocr-usage-routes.js | 페이지 수 집계 쿼리 없음 |
| OCRUsagePage.tsx | 페이지 수/비용 표시 UI 없음 |

---

## 수정 대상 파일

### 백엔드 - n8n 워크플로우

| 파일 | 수정 내용 |
|------|----------|
| `backend/n8n_flows/modules/DocOCR.json` | "Set OCR Success Response"에 `num_pages` 필드 추가 |
| `backend/n8n_flows/modules/OCRWorker.json` | "OCR Done"에 `ocr.page_count` 필드 추가 |

### 백엔드 API

| 파일 | 수정 내용 |
|------|----------|
| `backend/api/aims_api/routes/ocr-usage-routes.js` | 페이지 수 집계 및 비용 계산 추가 |

### 프론트엔드

| 파일 | 수정 내용 |
|------|----------|
| `frontend/aims-admin/src/features/dashboard/ocrUsageApi.ts` | 타입 및 포맷팅 함수 추가 |
| `frontend/aims-admin/src/pages/OCRUsagePage/OCRUsagePage.tsx` | 페이지 수/비용 표시 UI 추가 |

---

## 구현 계획

### 1. n8n 워크플로우 수정

**DocOCR.json - "Set OCR Success Response" 노드에 추가**:
```json
{
  "name": "num_pages",
  "value": "={{ $('Normalize DocOCR Response').item.json.num_pages }}",
  "type": "number"
}
```

**OCRWorker.json - "OCR Done" 노드에 추가**:
```json
{
  "name": "ocr.page_count",
  "value": "={{ $json.body.num_pages ?? 1 }}",
  "type": "number"
}
```

### 2. 백엔드 API 수정

**overview API에 추가할 집계**:
```javascript
const OCR_COST_PER_PAGE = 0.001476;

// 이번 달 페이지 수
const pagesThisMonthResult = await filesCollection.aggregate([
  {
    $match: {
      'ocr.status': 'done',
      'ocr.done_at': { $gte: startOfMonth },
      'ocr.page_count': { $exists: true, $gt: 0 }
    }
  },
  { $group: { _id: null, total: { $sum: '$ocr.page_count' } } }
]).toArray();

// 응답에 추가
{
  pages_this_month: pagesThisMonth,
  pages_total: pagesTotal,
  estimated_cost_usd: pagesTotal * OCR_COST_PER_PAGE
}
```

### 3. 프론트엔드 UI 수정

**새로운 섹션 "페이지 및 비용" 추가**:
- 이번 달 페이지 수
- 전체 페이지 수
- 예상 비용 (USD)

**Top 사용자 테이블에 컬럼 추가**:
- 페이지 수
- 예상 비용

---

## 확인 필요 사항

### 1. 기존 데이터 처리 방식

현재 MongoDB에 저장된 문서들은 `ocr.page_count` 필드가 없음.

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| A | 기존 데이터는 집계에서 제외 | 정확한 통계 | 과거 데이터 누락 |
| B | 기존 데이터는 1페이지로 가정 | 간단한 구현 | 부정확한 추정 |
| C | 마이그레이션 스크립트로 기존 데이터에 page_count 추가 | 가장 정확 | 추가 작업 필요, PDF 재분석 비용 |

**결정 필요**: 어떤 방식으로 처리할 것인가?

### 2. n8n 워크플로우 수정 방식

- **옵션 1**: n8n 웹 UI에서 직접 수정
- **옵션 2**: 로컬 JSON 파일 수정 후 n8n에 import

**결정 필요**: 어떤 방식으로 배포할 것인가?

### 3. Upstage 과금 기준 확인

- 현재 사용 중인 요금제가 Standard인지 확인 필요
- $0.22 / 149 pages = $0.001476/page 가 정확한지 확인 필요
- 요금 변경 시 대응 방안 (환경 변수 or 설정 파일)

### 4. 비용 표시 통화

- USD로 표시할 것인지
- 원화(KRW)로 환산해서 표시할 것인지

---

## 예상 결과 UI

### 전체 통계 섹션 (기존)
| 이번 달 OCR | 전체 OCR | 활성 사용자 |
|------------|---------|-----------|
| 150건      | 1.2K건  | 5명       |

### 페이지 및 비용 섹션 (신규)
| 이번 달 페이지 | 전체 페이지 | 예상 비용 |
|--------------|-----------|----------|
| 450페이지    | 3.6K페이지 | $5.31    |

### Top 10 사용자 테이블 (컬럼 추가)
| # | 사용자 | OCR 성공 | OCR 실패 | 페이지 수 | 예상 비용 | 마지막 처리 |
|---|-------|---------|---------|----------|----------|-----------|
| 1 | 홍길동 | 50건    | 2건     | 150페이지 | $0.22    | 2025.12.15 |

---

## 참고 자료

- [Upstage Document OCR 문서](https://console.upstage.ai)
- AI 사용량 페이지 비용 계산 패턴: `frontend/aims-admin/src/pages/AIUsagePage/AIUsagePage.tsx`
- AI 사용량 API 비용 계산: `backend/api/aims_api/lib/tokenUsageService.js`
