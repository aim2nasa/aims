# 문서 처리 크레딧 정책

## 개요

AIMS의 문서 처리(OCR + 임베딩) 시 크레딧 관리 정책을 정의합니다.

### 크레딧 시스템 배경

**왜 크레딧인가?**

| 과금 방식 | 적용 대상 | 문제점 |
|----------|----------|--------|
| 토큰 | AI만 | OCR에는 토큰 개념 없음 |
| 페이지 | OCR만 | AI에는 페이지 개념 없음 |
| **크레딧** | **OCR + AI 통합** | ✅ 둘 다 적용 가능 |

**크레딧 = OCR과 AI를 통합 관리하기 위한 과금 단위**

```
OCR 1페이지 = 2 크레딧
AI 1K 토큰 = 0.5 크레딧
```

**따라서:**
- 크레딧 부족 → OCR도 AI도 모두 사용 불가
- "OCR만 처리하고 AI 보류"는 불가능 (OCR도 크레딧 소비)

---

## 문제 분석

### 현재 상태 (2026-02-05 기준)

| 기능 | 크레딧 체크 | 결과 |
|------|------------|------|
| **AI 채팅** | ✅ 사전 체크 | 초과 시 즉시 차단 + 다이얼로그 |
| **문서 OCR** | ❌ 없음 | 무제한 실행 → 크레딧 초과 |
| **임베딩** | ❌ 없음 | 무제한 실행 → 비용 폭발 |

### 증상

- 크레딧 901.6% 초과 상태에서도 OCR/임베딩 계속 실행
- $32.83 / 189.9M 토큰 소비 (제한 없이)
- AI 채팅만 차단되고 문서 처리는 무제한

### 근본 원인

문서 처리 파이프라인에 크레딧 체크 로직 부재:

```python
# 현재 코드 (document_pipeline/upload_worker.py)
def process_document(doc_id, owner_id):
    # 크레딧 체크 없음! ← 문제
    ocr_result = run_ocr(doc_id)       # OCR 실행 → 크레딧 소비
    embedding_result = run_embedding(doc_id)  # 임베딩 실행 → 크레딧 소비
```

---

## 코드 분석

### 1. 문서 처리 흐름

```
[프론트엔드] 문서 업로드
    ↓
[aims_api] POST /api/documents/upload
    - 파일 저장 (S3/디스크)
    - MongoDB에 문서 레코드 생성
    ↓
[document_pipeline] upload_worker.py
    - OCR 처리 ← 크레딧 체크 없음!
    - 임베딩 트리거
    ↓
[backend/embedding] full_pipeline.py
    - 임베딩 생성 (OpenAI API) ← 크레딧 체크 없음!
    - Qdrant 저장
    - 토큰 사용량 로깅 (사후 기록)
```

### 2. AI 채팅 크레딧 체크 (비교)

**파일**: `backend/api/aims_api/server.js` (라인 11647-11669)

```javascript
// POST /api/chat 엔드포인트
const { checkCreditBeforeAI } = require('./lib/creditService');
const creditCheck = await checkCreditBeforeAI(db, analyticsDb, userId);

if (!creditCheck.allowed) {
  // 크레딧 부족 SSE 이벤트 전송
  res.write(`data: ${JSON.stringify({
    type: 'credit_exceeded',
    credits_used: creditCheck.credits_used,
    credits_remaining: creditCheck.credits_remaining,
    credit_quota: creditCheck.credit_quota,
    // ...
  })}\n\n`);
  res.end();
  return;
}
```

### 3. 크레딧 계산 기준

**파일**: `backend/api/aims_api/lib/creditService.js`

```javascript
const CREDIT_RATES = {
  OCR_PER_PAGE: 2,        // OCR 1페이지 = 2 크레딧
  AI_PER_1K_TOKENS: 0.5   // AI 1K 토큰 = 0.5 크레딧
};
```

---

## 해결 방안

### 채택 방식: 파일 저장 + 처리 보류

```
문서 업로드 → 파일 저장 (S3/디스크) ✅
           → 크레딧 체크
                ↓
           ┌─────────────────────────────────┐
           │ 크레딧 충분: OCR + 임베딩 즉시 처리 │
           │ 크레딧 부족: OCR + 임베딩 모두 보류 │
           └─────────────────────────────────┘
                ↓
           크레딧 리셋 시 → 보류된 문서 자동 처리
```

### 왜 "업로드 차단"이 아닌 "처리 보류"인가?

| 관점 | 업로드 차단 | 처리 보류 (채택) |
|------|------------|-----------------|
| **급한 문서** | 아예 못 올림 | 일단 올려둠 → 나중에 처리 |
| **원본 보관** | 불가 | 원본 PDF는 저장됨 |
| **사용자 심리** | "왜 안 올라가지?" 불만 | "대기 중이구나" 이해 |
| **이탈 방지** | 다른 서비스 찾음 | "기다리면 되겠네" |

### 사용자 시나리오

```
👤 설계사 A (크레딧 소진)

1월 25일: 급한 계약서 업로드 시도
→ 파일 저장 ✅ (S3에 원본 저장)
→ OCR 보류 ⏸️ (크레딧 부족)
→ 임베딩 보류 ⏸️ (크레딧 부족)
→ 문서 목록에 "처리 대기" 표시
→ 원본 PDF는 열람 가능 (OCR 전이라 텍스트 검색은 안 됨)

2월 1일: 크레딧 리셋 (2,000 크레딧 충전)
→ 백그라운드에서 보류된 문서 자동 처리
→ OCR 처리 ✅ (크레딧 소비)
→ 임베딩 처리 ✅ (크레딧 소비)
→ 문서 열람 + 텍스트 검색 + AI 검색 모두 활성화
→ 사용자는 아무것도 안 해도 됨
```

---

## 구현 설계

### 1. 새로운 문서 상태 추가

**MongoDB files 컬렉션**:

```javascript
{
  _id: ObjectId,
  ownerId: userId,

  // 전체 처리 상태
  overallStatus: 'pending' | 'processing' | 'completed' | 'error' | 'credit_pending',

  // OCR 상태
  ocrStatus: 'pending' | 'processing' | 'done' | 'failed' | 'credit_pending',

  // 임베딩 상태
  docembed: {
    status: 'pending' | 'processing' | 'done' | 'failed' | 'credit_pending',
    credit_pending_since: ISODate,  // 보류 시작 시점
  }
}
```

| 상태 | 의미 |
|------|------|
| `pending` | 처리 대기 중 |
| `processing` | 처리 중 |
| `done` | 처리 완료 |
| `failed` | 처리 실패 (재시도 소진) |
| `credit_pending` | **크레딧 부족으로 보류** (신규) |

### 2. 문서 업로드 시 크레딧 체크

**파일**: `backend/api/aims_api/routes/document-routes.js`

```javascript
// POST /api/documents/upload
router.post('/upload', async (req, res) => {
  // 1. 파일 저장 (항상 수행)
  const fileId = await saveFile(req.file);

  // 2. 크레딧 체크
  const creditCheck = await checkCreditForDocumentProcessing(userId, estimatedPages);

  if (!creditCheck.allowed) {
    // 크레딧 부족 → 보류 상태로 저장
    await db.files.updateOne(
      { _id: fileId },
      {
        $set: {
          overallStatus: 'credit_pending',
          ocrStatus: 'credit_pending',
          'docembed.status': 'credit_pending',
          'docembed.credit_pending_since': new Date()
        }
      }
    );

    return res.json({
      success: true,
      data: {
        fileId,
        status: 'credit_pending',
        message: '크레딧 부족으로 처리가 보류되었습니다. 리셋 후 자동 처리됩니다.',
        days_until_reset: creditCheck.days_until_reset
      }
    });
  }

  // 3. 크레딧 충분 → 정상 처리
  queueDocumentProcessing(fileId);
  return res.json({ success: true, data: { fileId, status: 'processing' } });
});
```

### 3. 임베딩 파이프라인 크레딧 체크

**파일**: `backend/embedding/full_pipeline.py`

```python
def process_document(doc_id, owner_id):
    # 1. 크레딧 체크 (신규)
    credit_check = check_credit_for_embedding(owner_id, estimated_tokens)

    if not credit_check['allowed']:
        # 크레딧 부족 → 보류 상태로 변경
        update_docembed_status(doc_id, 'credit_pending')
        log_info(f"Document {doc_id} embedding deferred: credit insufficient")
        return

    # 2. 기존 임베딩 로직
    text = extract_text(doc_id)
    chunks = split_into_chunks(text)
    embeddings = create_embeddings(chunks)
    save_to_qdrant(embeddings)
```

### 4. 크레딧 리셋 시 자동 재처리

**스케줄러**: 매월 1일 00:05 KST 실행

```python
def process_credit_pending_documents():
    # 1. credit_pending 상태 문서 조회 (사용자별 그룹)
    pending_docs = db.files.aggregate([
        { '$match': { 'overallStatus': 'credit_pending' } },
        { '$group': { '_id': '$ownerId', 'docs': { '$push': '$_id' } } }
    ])

    for user_group in pending_docs:
        user_id = user_group['_id']

        # 2. 사용자별 크레딧 확인
        credit_check = check_user_credit(user_id)

        if credit_check['allowed']:
            # 3. 보류된 문서 처리 큐에 추가
            for doc_id in user_group['docs']:
                queue_document_processing(doc_id)
                log_info(f"Queued credit_pending doc {doc_id} for processing")
```

### 5. UI 표시

#### 5.1 크레딧 부족 시 기능 제한 안내

**핵심 원칙**: 사용자가 크레딧 부족 시 무엇이 되고 안 되는지 명확히 이해해야 함

| 기능 | 크레딧 부족 시 | 표시 위치 |
|------|---------------|----------|
| **OCR 처리** | ❌ 안 됨 | 문서 상태 뱃지 |
| **AI 처리 (임베딩)** | ❌ 안 됨 | 문서 상태 뱃지 |
| **AI 검색 (RAG)** | ❌ 안 됨 | 검색창/결과에 안내 |
| **키워드 검색** | ✅ 됨 | (기존 OCR 완료 문서) |

**사용자 메시지 예시**:

```
"크레딧이 부족하여 문서 처리가 보류되었습니다.
- OCR/AI 처리: 대기 중
- AI 검색: 사용 불가
- 키워드 검색: 기존 문서에서 가능

다음 리셋일(2/1)에 자동 처리됩니다."
```

#### 5.2 문서 상태 아이콘/뱃지 흐름

```
[크레딧 부족 시 업로드]
     ↓
  📄 + ⏸️ (처리 대기)
  "크레딧 부족 - 처리 대기 중"
     ↓
[크레딧 리셋 → 자동 처리]
     ↓
  📄 + ⏳ (처리 중)
  "OCR/AI 처리 중..."
     ↓
[처리 완료]
     ↓
  📄 정상 (뱃지 없음)
  "검색 가능"
```

#### 5.3 UI 공간 최소화 설계

**원칙**: 레이아웃에 영향 주지 않기

| 상태 | UI 표시 | 공간 |
|------|--------|------|
| **정상 (completed)** | 없음 | 0px |
| **처리 중 (processing)** | 작은 스피너 | 최소 |
| **보류 (credit_pending)** | 작은 뱃지 | 최소 |

**구현 방식**: 아이콘 오버레이 (텍스트 뱃지 아님)

```tsx
// 문서 아이콘 옆에 작은 오버레이로 표시
<DocumentIcon>
  {status === 'credit_pending' && <SmallBadge>⏸</SmallBadge>}
  {status === 'processing' && <SmallSpinner />}
  {/* completed = 아무것도 없음 */}
</DocumentIcon>
```

**크기 가이드**:
- 문서 아이콘: 16~20px
- 상태 뱃지: 8~10px (우측 하단 오버레이)
- 완료되면 뱃지 완전히 사라짐 → 평소 레이아웃 영향 없음

#### 5.4 상태별 표시 상세

| 상태 | 아이콘 | 색상 | 툴팁 |
|------|--------|------|------|
| `credit_pending` | ⏸️ | 주황 | "크레딧 부족으로 대기 중 (~2/1 자동 처리)" |
| `processing` | ⏳ | 파랑 | "OCR/AI 처리 중..." |
| `completed` | 없음 | - | "검색 가능" |
| `error` | ❌ | 빨강 | "처리 실패 - 재시도 필요" |

#### 5.5 업로드 시 안내

```tsx
// 크레딧 부족 시 업로드 후 메시지
<Alert variant="info">
  문서가 저장되었습니다. 현재 크레딧이 부족하여 OCR/AI 처리는
  {daysUntilReset}일 후(리셋일) 자동으로 진행됩니다.

  - 원본 PDF 열람: 가능
  - 텍스트/AI 검색: 처리 완료 후 가능
</Alert>
```

#### 5.6 실시간 상태 변경

- 크레딧 리셋 후 처리 시작 → SSE로 상태 변경 알림
- 프론트엔드에서 뱃지 자동 업데이트
- 사용자가 새로고침 안 해도 상태 반영

---

## 구현 체크리스트

- [x] `credit_pending` 상태 추가 (MongoDB 스키마)
- [x] 문서 업로드 시 크레딧 체크 로직 추가 (`doc_prep_main.py`)
- [x] `full_pipeline.py`에 크레딧 체크 로직 추가
- [x] `checkCreditForDocumentProcessing()` 함수 구현 (`creditService.js`)
- [x] 크레딧 체크 내부 API 추가 (`/api/internal/check-credit`)
- [x] 크레딧 리셋 시 자동 재처리 스크립트 (`process_credit_pending.py`)
- [ ] 프론트엔드 상태 표시 (뱃지, 툴팁, 업로드 안내)
- [ ] aims-admin 대시보드에 보류 문서 현황 표시

---

## 파일 위치

| 기능 | 파일 경로 |
|------|---------|
| 문서 업로드 파이프라인 | `backend/api/document_pipeline/routers/doc_prep_main.py` |
| 임베딩 파이프라인 | `backend/embedding/full_pipeline.py` |
| 크레딧 보류 재처리 | `backend/embedding/process_credit_pending.py` |
| 크레딧 서비스 | `backend/api/aims_api/lib/creditService.js` |
| 크레딧 체크 API | `backend/api/aims_api/server.js` (`/api/internal/check-credit`) |
| 파이프라인 설정 | `backend/api/document_pipeline/config.py` |

---

## 참고: 크레딧 계산

### 문서 처리 크레딧 추정

```
총 크레딧 = OCR 크레딧 + 임베딩 크레딧
         = (페이지 수 × 2) + (문자 수 ÷ 8000)

예: 10페이지, 50,000자 문서
   → OCR: 20 크레딧
   → 임베딩: 6.25 크레딧
   → 총: 26.25 크레딧
```

### 업로드 전 예상 크레딧

```javascript
// 페이지 수만 알 수 있는 경우 (업로드 시점)
const estimatedCredits = pageCount * 2 * 1.5;  // OCR + 임베딩 예상 (1.5배 버퍼)
```

---

## 논의 요약 (2026-02-05)

### 문제 발견 배경

1. **크레딧 사용률 901.6%** - 한도 대비 9배 초과
2. **AI 채팅**은 `checkCreditBeforeAI()` 함수로 사전 체크 → 초과 시 차단 ✅
3. **임베딩**은 크레딧 체크 없음 → 무제한 실행 → $32.83 비용 발생 ❌

### 핵심 결정 사항

| 항목 | 결정 |
|------|------|
| **과금 단위** | 크레딧 (OCR + AI 통합) |
| **크레딧 부족 시** | 파일 저장 ✅ + 처리 보류 ⏸️ |
| **자동 재처리** | 매월 1일 크레딧 리셋 후 자동 |
| **UI 표시** | 작은 오버레이 뱃지 (레이아웃 영향 없음) |

### 논의된 방안들

| 방안 | 채택 | 이유 |
|------|------|------|
| 업로드 차단 | ❌ | 사용자 불만, 이탈 |
| OCR만 처리 + 임베딩 보류 | ❌ | OCR도 크레딧 소비 |
| **파일 저장 + 전체 보류** | ✅ | 원본 보관, 자동 재처리 |

### 사용자 경험 설계 원칙

1. **급한 문서** → 일단 올려둠 (원본 보관)
2. **크레딧 리셋** → 자동 처리 (사용자 개입 불필요)
3. **명확한 안내** → 무엇이 되고 안 되는지 표시
4. **레이아웃 영향 없음** → 완료 시 뱃지 사라짐

### 기능 제한 명세

**크레딧 부족 시:**
- ❌ OCR 처리 안 됨
- ❌ AI 처리 (임베딩) 안 됨
- ❌ AI 검색 (RAG) 안 됨
- ✅ 키워드 검색 가능 (기존 OCR 완료 문서)
- ✅ 원본 PDF 열람 가능

### 관련 문서

- [SAAS_BILLING_POLICY.md](SAAS_BILLING_POLICY.md) - SaaS 과금 방식 (일할 계산)
- [TIER_PRICING_POLICY.md](TIER_PRICING_POLICY.md) - 티어별 크레딧 정책

---

## 구현 결과 (2026-02-05)

### 1. 크레딧 체크 함수 (`creditService.js`)

```javascript
/**
 * 문서 처리 전 크레딧 한도 체크
 * @param {Db} db - MongoDB docupload DB
 * @param {Db} analyticsDb - MongoDB aims_analytics DB
 * @param {string} userId - 사용자 ID
 * @param {number} estimatedPages - 예상 페이지 수
 * @returns {Promise<{allowed, reason, credits_remaining, ...}>}
 */
async function checkCreditForDocumentProcessing(db, analyticsDb, userId, estimatedPages = 1)
```

**예상 크레딧 계산:**
```
estimatedCredits = (페이지 × 2 + 페이지 × 0.5) × 1.5 버퍼
                 = 페이지 × 3.75
```

### 2. 내부 API 엔드포인트

```
POST /api/internal/check-credit
Headers: x-api-key: aims-internal-token-logging-key-2024
Body: { user_id, estimated_pages }

GET /api/internal/credit-pending-documents
Headers: x-api-key: aims-internal-token-logging-key-2024
Query: ?user_id=xxx (optional)
```

### 3. 문서 업로드 흐름 (`doc_prep_main.py`)

```
업로드 요청 →
  ├─ 크레딧 체크 (check_credit_for_upload)
  │     ├─ 충분: 파일 저장 → 큐 등록 → status: "queued"
  │     └─ 부족: 파일 저장 → status: "credit_pending"
  │                       └─ 큐 등록 안 함
  └─ 응답 반환
```

**credit_pending 문서 스키마:**
```javascript
{
  overallStatus: "credit_pending",
  ocrStatus: "credit_pending",
  status: "credit_pending",
  credit_pending_since: ISODate,
  credit_pending_info: {
    credits_remaining: number,
    credit_quota: number,
    days_until_reset: number,
    estimated_credits: number
  },
  docembed: {
    status: "credit_pending",
    credit_pending_since: string
  }
}
```

### 4. 임베딩 파이프라인 (`full_pipeline.py`)

```python
for doc_data in documents_to_process:
    # 크레딧 체크
    credit_check = check_credit_for_embedding(owner_id, estimated_pages)

    if not credit_check.get('allowed', True):
        # credit_pending 상태로 변경
        collection.update_one(
            {'_id': doc_id},
            {'$set': {
                'docembed.status': 'credit_pending',
                'overallStatus': 'credit_pending'
            }}
        )
        continue  # 다음 문서로
```

### 5. 자동 재처리 스크립트 (`process_credit_pending.py`)

**크론탭 설정 (매월 1일 00:05 KST):**
```bash
5 0 1 * * cd /home/rossi/aims/backend/embedding && python process_credit_pending.py
```

**처리 흐름:**
1. `credit_pending` 상태 문서 조회 (사용자별 그룹)
2. 각 사용자 크레딧 체크
3. 크레딧 충분: `pending` 상태로 변경 (재처리 대기)
4. `full_pipeline.py` 실행하여 실제 처리

### 6. 배포 필요 서비스

| 서비스 | 배포 스크립트 | 변경 내용 |
|--------|-------------|----------|
| aims_api | `deploy_aims_api.sh` | 크레딧 체크 함수, 내부 API |
| document_pipeline | PM2 restart | 업로드 시 크레딧 체크 |
| embedding | 수동 실행 | full_pipeline.py 크레딧 체크 |

### 7. 미완료 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| 프론트엔드 상태 뱃지 | 미구현 | UI 설계 완료, 코드 작성 필요 |
| aims-admin 대시보드 | 미구현 | 내부 API 준비됨 |
| SSE 실시간 상태 변경 | 미구현 | 기존 SSE 인프라 활용 가능 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-05 | 문제 분석 및 정책 문서 작성 |
| 2026-02-05 | 크레딧 시스템 배경 추가 (OCR + AI 통합) |
| 2026-02-05 | UX 설계 추가 (기능 제한 안내, 뱃지 흐름, 공간 최소화) |
| 2026-02-05 | 논의 요약 섹션 추가 |
| 2026-02-05 | **백엔드 구현 완료** - creditService.js, doc_prep_main.py, full_pipeline.py, process_credit_pending.py |
| 2026-02-05 | **전체 크레딧 소비 요소 조사** - Chat/Embed/RAG/Summary/OCR 현황 파악 |
| 2026-02-05 | **OCR 크레딧 통합** - check-quota API가 통합 크레딧 시스템 사용하도록 변경 |
| 2026-02-05 | **RAG 크레딧 체크 추가** - rag_search.py에 사전 체크 로직 구현 |
| 2026-02-05 | **Summary 크레딧 체크 추가** - openai_service.py에 사전 체크 로직 구현 |

---

## 크레딧 소비 요소별 현황 (2026-02-05 조사)

### 요약표

| 요소 | 위치 | 사전 크레딧 체크 | 사후 로깅 | 상태 | 위험도 |
|------|------|-----------------|---------|------|--------|
| **Chat** | aims_api | ✅ `checkCreditBeforeAI()` | ✅ | 완료 | 🟢 낮음 |
| **Embed (업로드)** | doc_prep_main.py | ✅ `check_credit_for_upload()` | - | 완료 | 🟢 낮음 |
| **Embed (파이프라인)** | full_pipeline.py | ✅ `check_credit_for_embedding()` | ✅ | 완료 | 🟢 낮음 |
| **OCR** | ocr_worker.py | ⚠️ `_check_quota()` | ✅ | **별도 한도!** | 🟡 중간 |
| **RAG** | rag_search.py | ❌ 없음 | ✅ `token_tracker` | **미구현** | 🔴 높음 |
| **Summary** | openai_service.py | ❌ 없음 | ✅ `_log_token_usage()` | **미구현** | 🔴 높음 |

### 문제점 상세

#### 1. OCR - 별도 한도 시스템 (⚠️)

**현재 상태:**
- `ocr_worker.py`에서 `/api/internal/ocr/check-quota` 호출
- 이 API는 `ocr_page_quota` (페이지 기반 별도 한도) 체크
- 통합 크레딧 시스템 (`credit_quota`)과 **별도로 동작**

**문제:**
```
storageQuotaService.js:26 주석: "ocr_page_quota: 페이지 수 기반 (deprecated - 크레딧으로 통합)"
→ 하지만 여전히 별도로 사용 중!
```

**티어별 설정 (현재):**
| 티어 | credit_quota | ocr_page_quota |
|------|-------------|----------------|
| free_trial | 300 | 100 |
| standard | 2000 | 500 |
| premium | 8000 | 3000 |
| vip | 30000 | 10000 |

**해결 필요:**
- `/api/internal/ocr/check-quota`가 통합 크레딧 시스템 사용하도록 변경
- 또는 OCR 워커가 `/api/internal/check-credit` 호출하도록 변경

#### 2. RAG - 사전 체크 없음 (🔴)

**현재 상태:**
- `rag_search.py`의 `search_endpoint()`에서 검색 수행
- 토큰 사용 **후** `token_tracker.save_usage()` 호출 (line 407-417)
- 사전 크레딧 체크 **없음**

**문제:**
```python
# 검색 수행 → LLM 호출 → 토큰 소비 → 사후 로깅
# 크레딧이 0이어도 검색 가능!
```

**해결 필요:**
- `search_endpoint()` 시작 부분에 크레딧 체크 추가
- 크레딧 부족 시 HTTP 402 또는 429 응답

#### 3. Summary - 사전 체크 없음 (🔴)

**현재 상태:**
- `openai_service.py`의 `summarize_text()`에서 요약 생성
- 토큰 사용 **후** `_log_token_usage()` 호출 (line 140-147)
- 사전 크레딧 체크 **없음**

**문제:**
```python
# OpenAI API 호출 → 토큰 소비 → 사후 로깅
# 크레딧이 0이어도 요약 생성 가능!
```

**해결 필요:**
- `summarize_text()` 시작 부분에 크레딧 체크 추가
- 크레딧 부족 시 요약 스킵 또는 에러 반환

### 구현 계획

#### Phase 1: OCR 크레딧 통합
1. `/api/internal/ocr/check-quota` API 수정
2. `checkCreditForDocumentProcessing()` 호출하도록 변경
3. 응답 형식 유지 (하위 호환성)

#### Phase 2: RAG 크레딧 체크
1. `rag_search.py`에 크레딧 체크 함수 추가
2. `search_endpoint()` 시작 부분에 체크 로직
3. 크레딧 부족 시 에러 응답

#### Phase 3: Summary 크레딧 체크
1. `openai_service.py`에 크레딧 체크 함수 추가
2. `summarize_text()` 시작 부분에 체크 로직
3. 크레딧 부족 시 요약 스킵

---

## 구현 완료 (2026-02-05)

### Phase 1: OCR 크레딧 통합 ✅

**파일**: `backend/api/aims_api/routes/ocr-usage-routes.js`

**변경 내용:**
```javascript
// POST /api/internal/ocr/check-quota
// 🔴 페이지 기반 한도 → 통합 크레딧 시스템으로 변경

const { checkCreditForDocumentProcessing } = require('../lib/creditService');

// 기존: storageInfo.ocr_page_quota 체크
// 변경: checkCreditForDocumentProcessing() 호출
const creditCheck = await checkCreditForDocumentProcessing(db, analyticsDb, owner_id, page_count);

// 응답: 하위 호환성 유지 (페이지 수 환산)
// OCR 1페이지 = 2 크레딧이므로, quota / 2 = 페이지 수
```

### Phase 2: RAG 크레딧 체크 ✅

**파일**: `backend/api/aims_rag_api/rag_search.py`

**변경 내용:**
```python
# 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_URL}/api/internal/check-credit"

def check_credit_for_rag(user_id: str, estimated_tokens: int = 1000) -> dict:
    """RAG 검색 전 크레딧 체크"""
    # anonymous 사용자는 스킵
    if not user_id or user_id == "anonymous":
        return {"allowed": True, "reason": "anonymous_user"}

    # /api/internal/check-credit 호출
    response = requests.post(CREDIT_CHECK_URL, json={...})
    return response.json()

@app.post("/search")
async def search_endpoint(request: SearchRequest):
    # 🔴 semantic 검색 시 크레딧 체크
    if request.search_mode == "semantic" and request.user_id:
        credit_check = check_credit_for_rag(request.user_id, estimated_tokens=2000)
        if not credit_check.get("allowed", True):
            raise HTTPException(status_code=402, detail={...})  # Payment Required
```

### Phase 3: Summary 크레딧 체크 ✅

**파일**: `backend/api/document_pipeline/services/openai_service.py`

**변경 내용:**
```python
# 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_BASE_URL}/api/internal/check-credit"

async def check_credit_for_summary(user_id: str, estimated_tokens: int = 1000) -> dict:
    """Summary 생성 전 크레딧 체크"""
    # system 사용자는 스킵
    if not user_id or user_id == "system":
        return {"allowed": True, "reason": "system_user"}

    # /api/internal/check-credit 호출
    async with httpx.AsyncClient() as client:
        response = await client.post(CREDIT_CHECK_URL, json={...})
    return response.json()

@classmethod
async def summarize_text(cls, text: str, ...):
    # 🔴 크레딧 체크
    if owner_id:
        credit_check = await check_credit_for_summary(owner_id, estimated_tokens)
        if not credit_check.get("allowed", True):
            return {
                "summary": "크레딧 부족으로 요약이 생략되었습니다.",
                "credit_skipped": True,
                ...
            }
```

### 최종 현황표

| 요소 | 위치 | 사전 크레딧 체크 | 상태 |
|------|------|-----------------|------|
| **Chat** | aims_api | ✅ `checkCreditBeforeAI()` | 완료 |
| **Embed (업로드)** | doc_prep_main.py | ✅ `check_credit_for_upload()` | 완료 |
| **Embed (파이프라인)** | full_pipeline.py | ✅ `check_credit_for_embedding()` | 완료 |
| **OCR** | ocr-usage-routes.js | ✅ `checkCreditForDocumentProcessing()` | **완료** |
| **RAG** | rag_search.py | ✅ `check_credit_for_rag()` | **완료** |
| **Summary** | openai_service.py | ✅ `check_credit_for_summary()` | **완료** |

### 배포 필요 서비스

| 서비스 | 변경 파일 | 배포 방법 |
|--------|----------|----------|
| aims_api | ocr-usage-routes.js | `deploy_aims_api.sh` |
| aims_rag_api | rag_search.py | Docker restart |
| document_pipeline | openai_service.py | PM2 restart |

---

## 배포 및 검증 완료 (2026-02-05)

### 배포 결과

```
=== AIMS 전체 배포 완료 (총 1m 37s) ===

[1/13] Git 정리 및 Pull ... 완료 (1s)
[2/13] aims_api 배포 ... 완료 (16s)
[3/13] aims_rag_api 배포 ... 완료 (2s)
[4/13] annual_report_api 배포 ... 완료 (5s)
[5/13] pdf_proxy 배포 ... 완료 (1s)
[6/13] aims_mcp 배포 ... 완료 (1s)
[7/13] aims_health_monitor 배포 ... 완료 (6s)
[8/13] pdf_converter 배포 ... 완료 (1s)
[9/13] n8n 워크플로우 배포 ... 완료 (12s)
[10/13] Frontend 배포 ... 완료 (37s)
[11/13] Admin 배포 ... 완료 (15s)
[12/13] 서비스 상태 확인 ... 완료 (0s)
[13/13] Docker 정리 ... 완료 (0s)
```

### API 검증 결과

#### 1. 크레딧 체크 API (`/api/internal/check-credit`)

**정상 케이스 (크레딧 충분):**
```json
{
  "success": true,
  "allowed": true,
  "reason": "within_quota",
  "credits_used": 0,
  "credits_remaining": 429,
  "credit_quota": 429,
  "credit_quota_full": 500,
  "estimated_credits": 4,
  "is_first_month": true,
  "pro_rata_ratio": 0.8571
}
```

**차단 케이스 (크레딧 부족):**
```json
{
  "success": true,
  "allowed": false,
  "reason": "credit_exceeded",
  "estimated_credits": 1875,
  "credits_remaining": 429,
  "tier": "free_trial",
  "days_until_reset": 24
}
```

#### 2. OCR 쿼터 체크 API (`/api/internal/ocr/check-quota`)

**통합 크레딧 시스템으로 변경 확인:**
```json
{
  "success": true,
  "allowed": true,
  "reason": "within_quota",
  "credits_remaining": 429,
  "estimated_credits": 38,
  "quota": 214,
  "remaining": 214,
  "requested": 10
}
```

- `estimated_credits: 38` = 10페이지 × 3.75
- `quota: 214` = 하위 호환성 (크레딧 / 2 = 페이지)

### 시뮬레이션 테스트 결과

```
PASS __tests__/credit-check-simulation.test.js (21 tests)

엣지 케이스 목록:
1. ✅ 정상 케이스 - 크레딧 충분 → 허용
2. ✅ 크레딧 부족 - 한도 초과 → 차단
3. ✅ 크레딧 정확히 0 - 경계값 → 차단
4. ✅ 무제한 사용자 (admin) - 항상 허용
5. ✅ anonymous 사용자 (RAG) - 스킵 허용
6. ✅ system 사용자 (Summary) - 스킵 허용
7. ✅ API 실패 - fail-open 허용
8. ✅ 첫 달 일할 계산 - pro_rata_ratio 적용
9. ✅ 대용량 문서 - 예상 크레딧 계산
10. ✅ 서비스별 체크 - 모든 서비스 커버
```

### 크레딧 계산 검증

| 페이지 수 | 예상 크레딧 | 계산 |
|----------|------------|------|
| 1 | 4 | (1×2 + 1×0.5) × 1.5 = 3.75 → 4 |
| 10 | 38 | (10×2 + 10×0.5) × 1.5 = 37.5 → 38 |
| 100 | 375 | (100×2 + 100×0.5) × 1.5 = 375 |
| 500 | 1875 | (500×2 + 500×0.5) × 1.5 = 1875 |

### 최종 확인 완료 ✅

**모든 크레딧 소비 요소가 사전 체크를 수행합니다:**

| 요소 | 체크 함수 | 차단 동작 | 검증 |
|------|----------|----------|------|
| Chat | `checkCreditBeforeAI()` | SSE credit_exceeded 이벤트 | ✅ |
| Embed (업로드) | `check_credit_for_upload()` | status: credit_pending | ✅ |
| Embed (파이프라인) | `check_credit_for_embedding()` | 처리 스킵 | ✅ |
| OCR | `checkCreditForDocumentProcessing()` | allowed: false | ✅ |
| RAG | `check_credit_for_rag()` | HTTP 402 | ✅ |
| Summary | `check_credit_for_summary()` | 요약 스킵 | ✅ |

**하나도 빠지는 구멍 없음!**

---

## 진행률 표시 UX 개선 (2026-02-05)

### 문제점

credit_pending 문서가 있으면 진행률이 영원히 100%에 도달할 수 없음:
- 예: "17/18 처리완료 (94%)" - credit_pending 1건으로 인해 100% 불가
- AR 파싱률도 마찬가지: "9/10 파싱완료 (90%)"

### 해결 방안 (채택)

**설계사 페르소나 기반 결정:**
1. 설계사는 "내가 올린 문서가 잘 들어갔는지" 확인하고 싶음
2. 94%에서 멈춘 진행률은 "뭔가 잘못된 건가?" 불안감 유발
3. 100% 업로드 완료를 보면 "일단 다 올렸구나" 안심

**구현:**
- `credit_pending` 문서를 "업로드 완료"로 간주하여 진행률 100% 달성 가능
- 별도로 "⏸ X건 크레딧 대기" 안내 표시
- AR/CRS 파싱률도 동일하게 처리

### 표시 형식

**변경 전:**
```
17/18 처리완료 (94%)
AR 9/10 파싱완료 (90%)
```

**변경 후:**
```
18/18 처리완료 (100%) ⏸ 1 크레딧 대기
AR 10/10 파싱완료 (100%) ⏸ 1
```

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `server.js` | stats에 credit_pending 필드 추가, arParsing/crsParsing에도 추가 |
| `documentStatistics.ts` | DocumentStatistics, ParsingStats에 credit_pending 타입 추가 |
| `DocumentProcessingStatusBar.tsx` | credit_pending을 완료로 간주, 별도 안내 UI |
| `DocumentProcessingStatusBar.css` | 크레딧 대기 스타일 (주황색) |

### UX 원칙

- **명확한 상태 전달**: 진행률 100% + 크레딧 대기 안내로 상황 명확히 이해
- **불안감 해소**: 영원히 미완료 상태가 아님을 시각적으로 표현
- **다음 액션 안내**: "크레딧 충전 후 자동 처리됩니다" 툴팁으로 가이드

---

## batchId 기반 진행률 추적 (2026-02-05)

### 문제점

1. **batchId 변경 감지 안됨**: `useState` 초기값으로만 읽어서 sessionStorage 변경 시 반영 안 됨
2. **credit_pending이 완료에 포함됨**: 진행률 100% 표시되지만 실제로는 미처리
3. **batchId 삭제 로직 없음**: sessionStorage에 영원히 남아있음

### 해결 구현

#### 1. useBatchId Hook (신규)

**파일**: `frontend/aims-uix3/src/hooks/useBatchId.ts`

```typescript
import { useSyncExternalStore } from 'react'

const BATCH_ID_KEY = 'aims-current-batch-id'
const subscribers = new Set<() => void>()

function notifyBatchIdChange(): void {
  subscribers.forEach(callback => callback())
}

export function setBatchId(batchId: string): void {
  sessionStorage.setItem(BATCH_ID_KEY, batchId)
  notifyBatchIdChange()
}

export function clearBatchId(): void {
  sessionStorage.removeItem(BATCH_ID_KEY)
  notifyBatchIdChange()
}

export function useBatchId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

**핵심**: `useSyncExternalStore`로 sessionStorage 실시간 추적

#### 2. useDocumentStatistics Hook 수정

**파일**: `frontend/aims-uix3/src/hooks/useDocumentStatistics.ts`

```typescript
interface UseDocumentStatisticsOptions {
  enabled?: boolean
  batchId?: string | null  // 배치별 필터링
}

// batchId 있으면 캐시 안 씀 (배치별 통계는 독립적)
const useCache = enabled && !batchId

// API 호출 시 batchId 쿼리 파라미터 추가
const url = batchId
  ? `${API_BASE_URL}/api/documents/statistics?batchId=${encodeURIComponent(batchId)}`
  : `${API_BASE_URL}/api/documents/statistics`
```

#### 3. DocumentProcessingStatusBar 수정

**파일**: `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentProcessingStatusBar.tsx`

```typescript
// credit_pending은 "완료"가 아님! 진행률에서 제외
const batchCompleted = (batchStatistics?.completed ?? 0) +
                       (batchStatistics?.completed_with_skip ?? 0)
// credit_pending NOT included

// 배치 100% 완료 + credit_pending 없음 → 2초 후 자동 정리
const shouldCleanup = hasBatch &&
                      batchPct === 100 &&
                      batchProcessing === 0 &&
                      batchPending === 0 &&
                      batchCreditPending === 0

useEffect(() => {
  if (shouldCleanup) {
    cleanupTimerRef.current = setTimeout(() => {
      clearBatchId()
    }, 2000)
  }
}, [shouldCleanup])
```

#### 4. Backend API 수정

**파일**: `backend/api/aims_api/server.js`

```javascript
// GET /api/documents/statistics
const { batchId } = req.query;

const filter = { userId };
if (batchId) {
  filter.batchId = batchId;
}
```

### Status Bar 표시 정책

| 상태 | Status Bar | 이유 |
|------|------------|------|
| processing > 0 | ✅ 표시 | 진행 중 알림 |
| pending > 0 | ✅ 표시 | 대기 중 알림 |
| credit_pending > 0 | ✅ 표시 | 사용자 액션 필요 |
| 100% 완료 + 위 모두 0 | 2초 후 숨김 | 더 이상 정보 없음 |

**Progressive Disclosure**: 할 일이 있으면 표시, 없으면 숨김

### 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `hooks/useBatchId.ts` | 신규 생성 |
| `hooks/useDocumentStatistics.ts` | batchId 옵션 추가 |
| `DocumentProcessingStatusBar.tsx` | credit_pending 제외, 자동 정리 |
| `DocumentLibraryView.tsx` | useBatchId 훅 사용 |
| `DocumentRegistrationView.tsx` | setBatchId 함수 사용 |
| `backend/api/aims_api/server.js` | batchId 쿼리 파라미터 |

### 테스트 결과

- [x] 업로드 시작 → batchId 생성
- [x] "📤 이번 업로드 0/1 완료 (0%) ⏸ 1 크레딧대기" 표시
- [x] 100% 완료 → 2초 후 Status Bar 숨김
- [x] 페이지 새로고침 후 batchId 유지
- [x] 새 업로드 시 이전 batchId 교체
