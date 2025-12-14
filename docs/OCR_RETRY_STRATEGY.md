# OCR 429 Rate Limit 오류 방지 및 재시도 전략

> 작성일: 2025.12.14
> 상태: Phase 1, 2 구현 완료

---

## 1. 문제 정의

### 1.1 현상
- Upstage Document OCR API 호출 시 HTTP 429 "Too Many Requests" 오류 발생
- 오류 발생 시 재시도 없이 영구 실패로 기록됨
- 관리자가 실패 문서를 확인할 수 있으나 재처리 방법 없음

### 1.2 Upstage API Rate Limit (Tier 0 기준)

| API 유형 | RPS (초당 요청) | PPM (분당 페이지) |
|----------|----------------|------------------|
| 동기 API | **1** | 300 |
| 비동기 API | 2 | 1,200 |

---

## 2. 현재 시스템 분석

### 2.1 OCR 처리 플로우

```
[사용자 업로드]
    → [Redis XADD: ocr_stream]
    → [OCRWorker: 5초 폴링, COUNT 1]
        → [Wait 1s] (Phase 1 추가)
        → [DocOCR: Upstage API 호출]
            → 성공: MongoDB (ocr.status = 'done')
            → 실패: MongoDB (ocr.status = 'error')
                → [Admin 재처리] (Phase 2 추가)
```

### 2.2 핵심 파일

| 파일 | 역할 |
|------|------|
| `backend/n8n_flows/modules/OCRWorker.json` | Redis 폴링 → DocOCR 호출 → MongoDB 업데이트 |
| `backend/n8n_flows/modules/DocOCR.json` | Upstage API 호출 → 응답 정규화 |
| `backend/api/aims_api/routes/ocr-usage-routes.js` | Admin OCR 통계/실패 목록/재처리 API |
| `frontend/aims-admin/src/pages/OCRUsagePage/` | Admin OCR 모니터링/재처리 UI |

---

## 3. 구현 완료 내역

### 3.1 Phase 1: 사전 예방 - Wait 노드 추가 ✅

**목표:** OCR API 호출 전 1초 대기로 Rate Limit 예방

**수정 파일:**
- `backend/n8n_flows/modules/OCRWorker.json`

**변경 내용:**
- `Wait 1s Before OCR` 노드 추가 (n8n-nodes-base.wait)
- 연결 변경: `Set OCR Running` → `Wait 1s Before OCR` → `DocOCR Request`

**워크플로우 흐름:**
```
Schedule Trigger (5초)
    → Read Redis Stream
    → Parse Message
    → Prepare OCR Binary
    → Set OCR Running
    → [Wait 1s Before OCR] ← 새로 추가
    → DocOCR Request
    → Is OCR Error?
        ├─ Error: Update MongoDB (error)
        └─ Success: Update MongoDB (done)
```

**예상 효과:** 429 오류 70-80% 감소

---

### 3.2 Phase 2: Admin 수동 재처리 ✅

**목표:** 관리자가 실패 문서를 선택적으로 재처리

#### API 구현

**엔드포인트:** `POST /api/admin/ocr/reprocess`

**파일:** `backend/api/aims_api/routes/ocr-usage-routes.js`

**요청:**
```json
{
  "document_id": "67890abcdef123456789"
}
```

**응답:**
```json
{
  "success": true,
  "message": "OCR 재처리가 요청되었습니다.",
  "data": {
    "document_id": "67890abcdef123456789",
    "retry_count": 1,
    "queued_at": "2025-12-14T15:30:00.000Z"
  }
}
```

**처리 로직:**
1. document_id 유효성 검증
2. files 컬렉션에서 문서 조회
3. ocr.status === 'error' 확인
4. Redis XADD로 ocr_stream에 재등록
5. MongoDB 상태 업데이트:
   - `ocr.status` = 'queued'
   - `ocr.retry_count` 증가
   - 에러 필드 제거

#### UI 구현

**파일:**
- `frontend/aims-admin/src/pages/OCRUsagePage/OCRFailedModal.tsx`
- `frontend/aims-admin/src/pages/OCRUsagePage/OCRFailedModal.css`
- `frontend/aims-admin/src/features/dashboard/ocrUsageApi.ts`

**기능:**
- 실패 문서 목록에 "재처리" 버튼 추가
- 버튼 클릭 시 즉시 재처리 요청
- 성공 시 목록에서 해당 문서 제거
- 처리 중 상태 표시 ("처리중...")

**UI 레이아웃:**
```
┌─────────────────────────────────────────────────────────────────┐
│ OCR 실패 문서 목록                                            ✕ │
├─────────────────────────────────────────────────────────────────┤
│ 문서명        │ 소유자 │ 고객명 │ 오류코드 │ 실패시간  │ 액션   │
├─────────────────────────────────────────────────────────────────┤
│ 자료004-1.jpg │ 곽승철 │ 곽승철 │ 429      │ 2025...   │[재처리]│
│ 지민이숙제.xlsx│ 곽승철 │ 곽승철 │ 429      │ 2025...   │[재처리]│
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. MongoDB 스키마 확장

**files 컬렉션 ocr 필드:**
```javascript
{
  ocr: {
    status: 'queued' | 'running' | 'done' | 'error',
    queued_at: ISODate,
    started_at: ISODate,
    done_at: ISODate,
    failed_at: ISODate,
    statusCode: Number,
    statusMessage: String,
    errorBody: Object,

    // Phase 2에서 추가
    retry_count: Number,      // 재시도 횟수
    last_retry_at: ISODate,   // 마지막 재시도 시간
  }
}
```

---

## 5. 배포 체크리스트

### Backend

- [ ] `OCRWorker.json` n8n에 import
  ```bash
  # n8n 워크플로우 업데이트
  # n8n UI에서 OCRWorker 워크플로우 비활성화
  # 새 JSON import
  # 워크플로우 활성화
  ```

- [ ] `aims_api` 재배포
  ```bash
  ssh tars.giize.com
  cd /home/rossi/aims
  ./deploy_aims_api.sh
  ```

### Frontend

- [ ] `aims-admin` 빌드 및 배포
  ```bash
  cd frontend/aims-admin
  npm run build
  # 배포
  ```

---

## 6. 향후 계획 (Phase 3)

### 자동 재시도 (선택적 구현)

**목표:** 429 발생 시 n8n 워크플로우에서 자동 재시도

**구현 방안:**
```
[Is OCR Error?]
    ├─ statusCode == 429 → [Check Retry Count]
    │       ├─ retry < 3 → [Wait 2^n초] → [Retry]
    │       └─ retry >= 3 → [Final Error]
    └─ statusCode != 429 → (기존 에러 처리)
```

**참고:** Phase 1, 2로 대부분의 문제가 해결되면 Phase 3는 보류 가능

---

## 7. 참고 자료

- [OCR_429_RATE_LIMIT_ERROR.md](./OCR_429_RATE_LIMIT_ERROR.md) - 429 오류 상세 분석
- [Upstage Rate Limits Guide](https://console.upstage.ai/docs/guides/rate-limits)
- [Upstage Pricing](https://www.upstage.ai/pricing)
