# CRS/AR 파이프라인 신뢰성 분석 및 개선 보고서

**날짜**: 2026-02-07
**심각도**: CRITICAL
**상태**: 🔧 수정 진행 중

---

## 1. 증상

사용자가 CRS(변액리포트) 문서를 업로드한 후, 변액리포트 탭에서 데이터가 표시되지 않음.
- "몇 개 등록 이후 그 뒤로는 안 되고 있어"
- 11개 CRS 문서 업로드 후 변액리포트 탭이 비어있는 상태

---

## 2. 조사 결과

### 2.1 백엔드 데이터 상태 (정상)

| 항목 | 상태 |
|------|------|
| CRS 문서 11개 | 모두 `cr_parsing_status: "completed"` |
| 9명 고객 customer_reviews 배열 | 11건 파싱 결과 저장 완료 (파일 수 100% 일치) |
| 펀드 데이터 | fund_allocations, contract_info, premium_info 모두 정상 |
| annual_report_api | 실행 중 (PID 3125313, 포트 8004) |
| SSE 웹훅 알림 | 11건 모두 전송 성공 |

### 2.2 타임라인 분석 (문제의 핵심)

```
22:28:16 KST → 프론트엔드가 11개 고객의 변액리포트 일괄 조회 → 모두 0건 반환
22:28:17-18   → CRS 문서 11개 DB 생성 (조회보다 1~2초 뒤!)
22:28:26-51   → CRS 파싱 완료 + SSE 웹훅 전송 (조회보다 10~35초 뒤!)
22:42:13      → 같은 고객 재조회 → 1건 정상 반환
23:03:25      → 다른 고객 조회 → 2건 정상 반환
```

**직접적 원인**: 프론트엔드가 CRS 문서가 DB에 생성되기도 전에 조회를 시작.
SSE 이벤트는 이후에 발송되었으나, 사용자가 이미 다른 화면으로 이동한 후.

---

## 3. 파이프라인 전체 취약점 분석

### 3.1 [CRITICAL] 자가복구 로직 사각지대

**파일**: `backend/api/annual_report_api/main.py` (스캐너 함수)

**문제**: 자가복구 로직이 `cr_parsing_status` 필드가 **존재하는** 문서만 점검.
`is_customer_review: true`인데 `cr_parsing_status` 필드 자체가 누락된 고아 문서는 자가복구 대상에서 제외.

**영향**: doc_prep_main.py에서 CRS 감지 후 DB 업데이트가 실패하면, 문서가 영원히 방치됨.

**수정 방안**: 자가복구 범위를 확장하여 `is_customer_review: true`이면서 `cr_parsing_status`가 없는 문서도 "pending"으로 복구.

**수정 상태**: ✅ 완료

---

### 3.2 [CRITICAL] doc_prep_main.py CRS 감지 예외 삼킴

**파일**: `backend/api/document_pipeline/routers/doc_prep_main.py`

**문제**: credit_pending 경로에서 CRS 감지 예외가 `WARNING`으로만 로깅되고 무시됨.
```python
except Exception as meta_error:
    logger.warning(f"[CreditPending] 메타 추출 실패 (무시): {meta_error}")
```

**영향**: CRS 문서가 감지되지 않으면 `is_customer_review`, `cr_parsing_status` 모두 미설정 → 스캐너 발견 불가.

**수정 방안**: CRS 감지 실패 시 별도 try/except로 격리하여 최소한 `is_customer_review` 플래그는 보존. 에러 로깅을 `ERROR` 레벨로 승격.

**수정 상태**: ✅ 완료

---

### 3.3 [CRITICAL] save_customer_review() 실패해도 "completed" 처리

**파일**: `backend/api/annual_report_api/routes/cr_background.py`

**문제**: `save_customer_review()` 호출 결과(`success: false`)에도 불구하고 `cr_parsing_status: "completed"`로 설정되는 경로 존재.

**영향**: customer_reviews 배열에 데이터 없음 + 상태는 "completed" → 자가복구 대상에서 제외 → 데이터 영구 누락.

**수정 방안**: save 실패 시 `cr_parsing_status: "error"`로 설정 + 에러 메시지 저장. 자가복구 로직이 재처리.

**수정 상태**: ✅ 완료

---

### 3.4 [HIGH] processing 상태 영구 잠김

**파일**: `backend/api/annual_report_api/main.py`

**문제**: 스캐너가 `cr_parsing_status: "processing"`으로 설정한 후 파싱이 실패하면, 예외 핸들러에서 "error"로 변경 시도. 이 DB 업데이트마저 실패하면 "processing" 상태로 영원히 잠김.

**영향**: 스캐너의 `$nin: ["completed", "processing"]` 쿼리에서 제외 → 영원히 재처리 불가.

**수정 방안**: 자가복구 로직에 "processing" 상태가 5분 이상 지속된 문서를 "pending"으로 복구하는 타임아웃 메커니즘 추가.

**수정 상태**: ✅ 완료

---

### 3.5 [HIGH] SSE 웹훅 실패 시 조용히 무시

**파일**: `backend/api/annual_report_api/services/db_writer.py`

**문제**: SSE 웹훅 전송 실패 시 `WARNING` 로그만 남기고 무시. 프론트엔드가 파싱 완료를 알 수 없음.

**현재 코드**:
```python
except Exception as e:
    logger.warning(f"⚠️ [SSE] CR 알림 전송 실패 (무시됨): {e}")
```

**영향**: 파싱은 성공했지만 프론트엔드 화면이 갱신되지 않음 → 사용자가 "등록 안 됨"으로 인식.

**수정 방안**: 프론트엔드에서 SSE만 의존하지 않고, 폴링 기반 백업 갱신 메커니즘 추가.

**수정 상태**: ✅ 완료

---

### 3.6 [HIGH] 프론트엔드 레이스 컨디션

**파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/CustomerReviewTab.tsx`

**문제**: CRS 업로드 직후 변액리포트 탭 조회 시, 파싱이 아직 완료되지 않아 0건 반환.
SSE 이벤트는 개별 고객 단위이므로, 사용자가 다른 고객으로 이동하면 이벤트를 놓침.

**영향**: 사용자가 "등록이 안 된다"고 인식 (실제로는 10~35초 후에 완료됨).

**수정 방안**:
- `loadCustomerReviews()`에서 결과가 0건일 때, 3초 간격으로 최대 5회(15초) 점진적 재시도.
- 결과에 `pending`/`processing` 상태가 있으면 5초 간격 폴링으로 전환 (파싱 완료 감지).
- "파싱 진행 중" 상태를 명시적으로 표시.

**1차 수정**: 1회 3초 재시도 → **근본 재검증 후 불충분 판단** (서버 부하 시 3초 내 DB 미생성 가능)
**2차 수정**: 최대 5회(15초) 점진적 재시도로 강화. 파일 DB 생성 → pending 반환 → 폴링 자동 전환.

**수정 상태**: ✅ 완료 (2차)

---

### 3.7 [CRITICAL] CRS/AR 감지 시 SSE 알림 부재 (근본 원인)

**파일**: `backend/api/document_pipeline/routers/doc_prep_main.py`

**문제**: doc_prep_main.py에서 CRS/AR을 감지하고 `cr_parsing_status: "pending"`으로 DB 업데이트하지만,
프론트엔드에 SSE 알림을 보내지 않음. SSE 알림은 annual_report_api 파싱 완료(10~35초 후)에만 발생.

**영향**: 프론트엔드가 CRS 감지 사실을 즉시 알 수 없어, 업로드 직후 탭 조회 시 빈 화면 표시.
폴링/재시도는 이 근본 결함에 대한 보상 로직일 뿐.

**데이터 흐름 (수정 전)**:
```
감지 → DB pending 저장 → ❌ SSE 없음 → ... 10~35초 ... → 파싱 완료 → ✅ SSE 전송
```

**데이터 흐름 (수정 후)**:
```
감지 → DB pending 저장 → ✅ SSE "pending" 즉시 전송 → 프론트엔드 즉시 갱신
                        → ... 10~35초 ... → 파싱 완료 → ✅ SSE "completed" 전송
```

**수정 방안**: `_detect_and_process_customer_review()` 및 `_detect_and_process_annual_report()` 함수에서
DB 업데이트 직후 aims_api 웹훅 호출 (`/api/webhooks/cr-status-change`, `/api/webhooks/ar-status-change`)

**수정 상태**: ✅ 완료

---

## 4. 수정 이력

| 순번 | 수정 항목 | 파일 | 커밋 |
|------|----------|------|------|
| 1 | 문제 분석 문서 작성 | `docs/2026-02-07_CRS_PIPELINE_RELIABILITY_ANALYSIS.md` | 초기 커밋 |
| 2 | 자가복구 로직 강화 | `backend/api/annual_report_api/main.py` | - |
| 3 | CRS 감지 에러 핸들링 | `backend/api/document_pipeline/routers/doc_prep_main.py` | - |
| 4 | save 실패 시 상태 일관성 | `backend/api/annual_report_api/routes/cr_background.py` | - |
| 5 | processing 타임아웃 복구 | `backend/api/annual_report_api/main.py` | - |
| 6 | 프론트엔드 폴링 백업 | `frontend/aims-uix3/.../CustomerReviewTab.tsx` | - |
| 7 | 빈 결과 재시도 강화 (1회→5회) | `frontend/aims-uix3/.../CustomerReviewTab.tsx` | - |
| 8 | **[ROOT] CRS/AR 감지 즉시 SSE 알림** | `backend/api/document_pipeline/routers/doc_prep_main.py` | - |

---

## 5. 검증 방법

```bash
# 1. CRS 문서 상태 확인
docker exec aims-api node -e '
const { MongoClient } = require("mongodb");
MongoClient.connect("mongodb://localhost:27017").then(async client => {
  const db = client.db("docupload");
  const orphans = await db.collection("files").countDocuments({
    is_customer_review: true,
    cr_parsing_status: {$nin: ["completed"]}
  });
  console.log("미완료 CRS:", orphans);
  await client.close();
});'

# 2. annual_report_api 로그 모니터링
tail -f ~/aims/backend/api/annual_report_api/logs/api.log | grep -E "(CRS|CR |자가복구)"

# 3. SSE 웹훅 전송 확인
tail -f ~/aims/backend/api/annual_report_api/logs/api.log | grep "SSE"
```
