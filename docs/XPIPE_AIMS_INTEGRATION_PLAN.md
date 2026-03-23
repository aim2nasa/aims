# xPipe × AIMS 통합 기획안

**작성일**: 2026-03-24
**상태**: 기획

---

## 핵심 목표

**AIMS의 문서 처리 엔진을 document_pipeline에서 xPipe로 교체한다.**
**AIMS는 교체되었다는 사실을 전혀 알아차리지 못해야 한다.** 정상 동작뿐 아니라 오류 처리까지 포함해서, 교체 전후가 완벽히 투명하고(transparent) 매끄럽게(seamless) 동일해야 한다.

이를 자동화된 테스트로 증명하고, 지속적 모니터링으로 시간이 지나도 문제를 발견할 수 있는 구조를 만든다.

멀티테넌시는 미래 목표이며, 지금은 확장 가능한 구조로만 설계한다.

---

## 1. 검증 전략 — 3계층 테스트

교체는 위험하다. **"출력이 같다"만으로는 부족하다.** AIMS의 문서 처리는 결과물 외에 DB 상태 변경, SSE 알림, 크레딧 차감 등 부수 동작이 핵심이다. 분류가 맞아도 `ar_parsing_status`가 세팅 안 되면 AR 파싱이 멈춘다.

따라서 3개 계층으로 검증한다.

```
Layer 1: Golden Master (출력 비교)
  "동일 입력 → 동일 출력"을 증명

Layer 2: 부수 동작 통합 테스트 (DB 상태 + 트리거 검증)
  "출력 외에 DB 상태, 크레딧, SSE 알림이 동일하게 동작"을 증명

Layer 3: E2E 브라우저 테스트 (사용자 흐름 검증)
  "사용자가 보는 화면이 동일하게 동작"을 증명
```

**3계층 모두 PASS여야 "AIMS가 정상 동작한다"고 선언할 수 있다.**

---

### Layer 1: Golden Master — 출력 비교

교체 전에 "정답"을 캡처하고, 교체 후에 "정답과 일치"를 자동 판정한다.

```
교체 전: 실제 문서 → document_pipeline → 결과 스냅샷 저장 (정답)
교체 후: 동일 문서 → xPipe                → 스냅샷과 비교    (검증)
```

**테스트 문서 ~100건 (정상 + 오류):**

| 카테고리 | 건수 | 이유 |
|---------|------|------|
| **정상 경로** | | |
| 25소분류 × 2건 | ~50건 | 모든 분류가 정확히 나오는지 |
| 파일 형식별 (PDF, HWP, JPG 등) | ~10건 | 변환 + OCR 동작 |
| AR 5건 + CRS 5건 | 10건 | 특수문서 감지 |
| **오류 경로** | | |
| HWP/DOC 변환 실패 | 3건 | `processingSkipReason: "conversion_failed"` + 완료 처리 |
| 지원 안 되는 MIME | 2건 | `processingSkipReason: "unsupported_format"` + 완료 처리 |
| 빈 파일 / 손상된 PDF | 3건 | `status: "failed"` + 에러 메시지 |
| 중복 파일 업로드 | 2건 | DuplicateKeyError → 정리(cleanup) 동작 |
| 크레딧 부족 문서 | 3건 | `credit_pending` 상태 전이 + 텍스트 추출은 수행 |
| 대용량 스캔 불량 | 2건 | OCR 실패 시 상태 전이 |

정상 경로뿐 아니라 **오류가 발생했을 때 동일한 상태 전이, 동일한 에러 메시지, 동일한 정리(cleanup) 동작**이 이루어지는지를 검증한다.

**스냅샷 (문서당 1개 JSON):**

```json
{
  "id": "gm_001",
  "input": { "filename": "...", "file_hash": "sha256:..." },
  "expected": {
    "text_length": 4521,
    "classification": { "major": "보장성보험", "sub": "건강보험" },
    "is_ar": false,
    "is_crs": false,
    "display_name": "홍길동_건강보험_보험증권",
    "metadata": { "insurer": "메트라이프생명" }
  }
}
```

**PASS 기준:**

| 항목 | 기준 |
|------|------|
| 분류 (7대/25소) | 100% 일치 |
| AR/CRS 감지 | 100% 일치 |
| 표시명 | 100% 일치 |
| 텍스트 추출 | 길이 ±5% 이내 (OCR 비결정성 허용) |
| 핵심 메타데이터 (보험사, 계약자) | 100% 일치 |

---

### Layer 2: 부수 동작 통합 테스트 — DB 상태 + 트리거 검증

Golden Master가 잡지 못하는 것: **문서 처리 후 DB에 세팅되는 상태값과 다른 시스템에 보내는 트리거**.

이것이 틀리면 Golden Master는 PASS인데 AIMS는 깨진다.

**검증 대상 — 정상 경로 (문서 처리 후 DB 직접 조회):**

| 트리거 조건 | 검증할 DB 상태 | 실패 시 영향 |
|-----------|--------------|-------------|
| AR 감지 | `ar_parsing_status = "pending"` | annual_report_api 파싱 안 됨 |
| AR 감지 | `relatedCustomerId` 연결됨 | 고객-문서 매핑 깨짐 |
| CRS 감지 | `is_customer_review = true` | CRS 탭에 안 나옴 |
| 크레딧 부족 | `overallStatus = "credit_pending"` | 충전 후 자동 재처리 안 됨 |
| 크레딧 충전 후 재처리 | `reprocessed_from_credit_pending = true` | 크레딧 이중 차감 |
| 처리 완료 | `docembed.status` 세팅 | 임베딩 크론이 무시 |
| SSE 알림 | aims_api 웹훅 호출됨 | 프론트엔드 실시간 갱신 안 됨 |

**검증 대상 — 오류 경로 (에러 시 상태 전이와 복구가 동일한지):**

| 오류 상황 | 검증할 동작 | 실패 시 영향 |
|----------|-----------|-------------|
| 메타 추출 실패 | `status: "failed"`, `overallStatus: "error"` | 문서가 중간 상태로 방치 |
| 중복 파일 | cleanup 실행 (고객 참조 제거 + 파일 삭제 + DB 삭제) | 고아 데이터 잔존 |
| HWP 변환 실패 | `processingSkipReason: "conversion_failed"` + **완료 처리** | 에러로 잘못 표시 |
| 처리 중 예외 | `status: "failed"` + 워커 재시도 트리거 | 재시도 안 됨 → 영구 stuck |
| 임베딩 실패 | `docembed.status: "failed"` + `retry_count` 증가 | 자동 재시도 3회 안 됨 |
| 임베딩 3회 초과 | 더 이상 재시도 안 함 (영구 failed) | 무한 재시도 루프 |
| Stale 작업 | 타임아웃 후 `pending`으로 자동 복구 | 작업 영구 stuck |
| credit_pending 중 텍스트 추출 | OCR 없이 pdfplumber로 텍스트 추출 **수행** | 크레딧 충전 후 재처리 시 텍스트 없음 |

**구현:** pytest로 작성. 테스트 문서를 xPipe에 넣고, 처리 완료 후 MongoDB를 직접 조회하여 상태값 검증.

```python
# 예시: AR 감지 부수 동작 테스트
def test_ar_detection_side_effects():
    result = xpipe.process(ar_test_document)

    # Layer 1: 출력 확인
    assert result.is_ar == True

    # Layer 2: DB 부수 동작 확인
    doc = db.files.find_one({"_id": result.doc_id})
    assert doc["ar_parsing_status"] == "pending"          # AR 파서 트리거
    assert doc["relatedCustomerId"] is not None            # 고객 연결
    assert doc["overallStatus"] == "ar_detected"           # 상태 전이
```

---

### Layer 3: E2E 브라우저 테스트 — 사용자 흐름 검증

백엔드가 맞아도 **프론트엔드 SSE 수신 → UI 반영**이 깨질 수 있다.
Playwright로 최소 3개 시나리오를 자동화한다.

| 시나리오 | 검증 내용 |
|---------|----------|
| **정상: 문서 업로드 → 처리 완료** | 업로드 후 문서함에 카드 표시, 상태 뱃지 "완료" |
| **정상: AR 감지 → 파싱 대기** | AR 문서 업로드 후 연간보고서 탭에 "파싱 대기" 배지 |
| **오류: 크레딧 부족 → pending** | 크레딧 소진 상태에서 업로드 시 "크레딧 부족" 안내 |
| **오류: 변환 실패 → 완료(스킵)** | HWP 변환 실패 문서가 에러가 아닌 "처리 완료"로 표시 |
| **오류: 처리 실패 → 에러 표시** | 손상된 파일 업로드 시 에러 상태 표시 |

---

### 3계층 실행 요약

```bash
# Layer 1: Golden Master (출력 비교)
python golden_master/verify.py --engine xpipe
# → 80/80 PASS

# Layer 2: 부수 동작 통합 테스트 (DB 상태)
pytest tests/integration/test_side_effects.py
# → 7/7 PASS

# Layer 3: E2E 브라우저 테스트 (사용자 흐름)
npx playwright test tests/e2e/xpipe-integration.spec.ts
# → 3/3 PASS
```

**3계층 모두 PASS가 아니면 다음 Phase로 진행하지 않는다.**

---

## 2. 교체 로드맵

### Phase 0: 3계층 테스트 구축

교체 작업 시작 전에 검증 인프라를 먼저 만든다.

- 테스트 문서 80건 수집
- **Layer 1**: Golden Master 캡처 + `verify.py` 자동 비교 도구
- **Layer 2**: 부수 동작 통합 테스트 `test_side_effects.py` 작성
- **Layer 3**: Playwright E2E 시나리오 3개 작성
- **Shadow 안전장치**: `DryRunDocumentStore` 구현 (Shadow 실행 시 실제 DB 쓰기 차단)
- 현재 document_pipeline 기준으로 3계층 모두 100% PASS 확인

### Phase 1: Shadow Mode

xPipe가 AIMS 옆에서 같은 문서를 처리한다. 결과는 비교만 하고 AIMS에 반영하지 않는다.

```
문서 업로드 → document_pipeline (실제 처리) → AIMS DB 반영
               └→ xPipe (Shadow)            → Golden Master 비교만
```

**핵심 작업:**
- InsuranceAdapter v1 구현 (doc_prep_main.py에서 보험 로직 추출)
- Shadow Router로 document_pipeline → xPipe 문서 전달
- Golden Master로 xPipe 결과 검증

**다음 단계 진입 조건:** 3계층 모두 PASS (Golden Master 80건 + 부수 동작 7건 + E2E 3건)

### Phase 2: 스테이지별 교체

리스크 낮은 것부터 하나씩 xPipe로 교체한다.

```
교체 순서:
1. Convert (PDF 변환) — 도메인 무관, 가장 안전
2. Extract (텍스트 추출 + OCR)
3. Classify + DetectSpecial (AI 분류 + AR/CRS 감지) — 핵심, 가장 위험
4. Embed (임베딩)
```

각 스테이지 교체 후 **3계층 테스트** 실행. FAIL 시 해당 스테이지 롤백.

**다음 단계 진입 조건:** 전체 스테이지 교체 완료 + 3계층 모두 100% PASS

### Phase 3: 완전 교체

document_pipeline의 처리 코드를 제거하고, xPipe가 유일한 엔진이 된다.

**완료 기준:**
- 3계층 테스트 100% PASS
- AIMS 전체 기능 정상 동작 (문서 업로드 → AI 채팅 → 검색)
- 1주 프로덕션 운영 (아래 모니터링 항목 기준 무장애)

**1주 프로덕션 모니터링 항목:**

| 지표 | 확인 방법 | 기준 |
|------|----------|------|
| AR 파싱 전환 시간 | `ar_parsing_status` 변화 추적 | 기존 대비 ±20% |
| 임베딩 완료율 | `docembed.status=completed` 비율 | 99%+ |
| credit_pending 재처리 | 크레딧 충전 후 자동 처리 | 100% 성공 |
| SSE 이벤트 누락 | aims_api 로그 | 0건 |
| AI 채팅 검색 결과 | 업로드 5분 내 Qdrant 반영 | 100% |

**롤백 보험:** Phase 3 진입 전에 document_pipeline 코드를 태그로 보존. 장애 시 태그로 복귀.

### Phase 3 이후: 지속 모니터링 — 시간이 지나도 문제를 발견하는 구조

초기 1주 검증을 통과해도 **나중에 드러나는 문제**가 있다. 특정 문서 유형, 계절적 트래픽, API 변경 등은 시간이 지나야 발견된다. 따라서 교체 완료 후에도 **상시 동작하는 모니터링**을 운영한다.

**A. 일일 자동 회귀 테스트 (크론)**

매일 1회, Golden Master 테스트를 자동 실행한다. FAIL 시 즉시 알림.

```bash
# 크론: 매일 새벽 2시
0 2 * * * cd ~/aims && python golden_master/verify.py --engine xpipe --alert-on-fail
```

교체 직후에는 발견 못했지만, OCR API 버전 변경이나 LLM 모델 업데이트로 분류 결과가 달라지는 상황을 잡아낸다.

**B. 프로덕션 처리 결과 샘플링 비교**

실제 프로덕션 문서 중 매일 N건을 **랜덤 샘플링**하여, document_pipeline 시절 동일 유형 문서의 결과와 통계적으로 비교한다.

| 지표 | 비교 방식 | 알림 기준 |
|------|----------|----------|
| 분류 분포 | 25소분류별 비율 추이 (주간) | 특정 분류 ±20% 변동 |
| 처리 실패율 | `status: "failed"` 비율 (일간) | 기존 대비 2배 초과 |
| 평균 처리 시간 | 스테이지별 소요 시간 (일간) | 기존 대비 +30% |
| 임베딩 완료율 | `docembed.status: "done"` 비율 (일간) | 95% 미만 |
| credit_pending 체류 시간 | 크레딧 충전 후 재처리까지 시간 | 10분 초과 |

교체 전 기준값(baseline)을 Phase 0에서 캡처해두고, 교체 후 지속적으로 비교한다.

**C. 오류 패턴 자동 감지**

프로덕션 로그에서 오류 패턴을 자동 감지한다. 교체 전에는 없던 새로운 에러가 나타나면 알림.

```
[모니터링 규칙]
- files 컬렉션에서 status:"failed" 문서가 1시간 내 N건 이상 → 알림
- docembed.retry_count >= 3 문서가 누적 증가 → 알림
- ar_parsing_status:"pending" 체류 시간 5분 초과 → 알림
- SSE 웹훅 호출 실패 연속 3건 → 알림
```

**D. Golden Master 점진적 확장**

프로덕션에서 실패한 문서는 Golden Master에 추가한다. 시간이 지날수록 테스트 셋이 풍부해져서 더 많은 엣지 케이스를 커버한다.

```
프로덕션 장애 발생 → 원인 문서를 Golden Master에 추가 → 수정 → 재발 방지
```

---

## 3. 리뷰에서 나온 핵심 기술 과제

Alex, Gini, PM 교차 리뷰에서 도출된 **실제로 풀어야 할 문제**들:

### 3.1 InsuranceAdapter 추출 난이도

doc_prep_main.py의 AR/CRS 감지 로직이 감지 + 고객 연결 + DB 업데이트 + SSE 알림을 한 함수에서 수행한다.
→ **감지는 어댑터**, 부수 효과는 **on_stage_complete() 훅**으로 분리한다.

### 3.2 분류+요약 통합 호출

현재 OpenAI 호출 1회로 분류와 요약을 동시 처리한다. xPipe ClassifyStage는 분류만 담당.
→ ClassifyStage의 config에 요약 프롬프트를 포함시켜 **통합 호출을 유지**한다.

### 3.3 AIMS MongoDB 스키마 매핑

xPipe의 context dict와 AIMS의 중첩 스키마(meta.*, ai_analysis.*, ocr.* 등)가 다르다.
→ Phase 1에서 `AIMSDocumentStore` 구현체를 만들어 매핑을 해결한다.

### 3.4 크레딧 시스템 연동

xPipe 처리 시에도 크레딧이 정확히 차감되어야 한다.
→ Phase 2 Classify 교체 시 크레딧 체크 훅을 연동한다.

### 3.5 워커/큐 교체

document_pipeline의 MongoDB 큐 + Redis Stream 워커를 xPipe 스케줄러로 교체해야 한다.
→ xPipe의 InMemoryQueue를 MongoDB 기반 영구 큐로 교체하는 것을 Phase 2에서 진행한다.

---

## 4. 멀티테넌시 — 지금은 설계만

지금 구현하지 않는다. 단, 향후 확장 시 문제가 되지 않도록 설계 원칙만 지킨다:

- **어댑터 패턴 유지**: 도메인 로직은 반드시 DomainAdapter에만. xPipe 코어에 보험 키워드 금지.
- **설정 외부화**: 하드코딩 대신 config로. 테넌트별 config 교체만으로 동작 변경 가능한 구조.
- **Store 인터페이스**: DocumentStore ABC를 유지. AIMS용 MongoDB Store가 구현체일 뿐, 다른 Store로 교체 가능.

이 3가지만 지키면, 미래에 멀티테넌시가 필요할 때 코어 수정 없이 확장할 수 있다.

---

## 5. xPipeWeb

현재: 개발 도구 (데모/검증용).
Phase 1~2: Shadow 비교 결과 표시 용도로 **최소한만 확장**.
Phase 3 이후: 프로덕션 엔진이 된 뒤에 운영 관제 투자를 결정한다.

지금은 오버엔지니어링하지 않는다.

---

## 6. 성공 기준

**AIMS가 교체를 전혀 알아차리지 못한다 = 성공.**

**교체 시점 검증 (3계층 자동화):**
- Layer 1: Golden Master ~100건 PASS (정상 + 오류 경로 출력 동일)
- Layer 2: 부수 동작 통합 테스트 PASS (정상 + 오류 경로 DB 상태 동일)
- Layer 3: E2E 브라우저 테스트 PASS (정상 + 오류 사용자 흐름 동일)

**교체 후 운영 (1주 집중 → 이후 상시 모니터링):**
- 크레딧 과금 오류 0건
- AR/CRS 처리 누락 0건
- SSE 이벤트 누락 0건
- 처리 시간 기존 대비 ±10%

**장기 지속 모니터링 (상시):**
- 일일 Golden Master 자동 회귀 테스트 PASS
- 프로덕션 처리 결과 통계가 기존 baseline과 일치
- 새로운 에러 패턴 0건
- 프로덕션 장애 문서 → Golden Master 자동 추가 → 재발 방지
