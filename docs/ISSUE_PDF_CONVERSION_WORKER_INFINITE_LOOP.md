# ISSUE: PDF 변환 워커 무한 루프 버그

> **발견일**: 2026-03-18
> **심각도**: Medium (리소스 낭비 + 잠재적 성능 저하)
> **상태**: 분석 완료 → 구현 승인 대기
> **관련 파일**: `backend/api/document_pipeline/workers/pdf_conversion_worker.py`

---

## Executive Summary

**5개 에이전트(Alex, Gini, 보안, 성능, Sora) 전원이 근본 원인과 수정 방향에 합의 완료.**

### 원인
`_extract_and_update_text()`가 텍스트 추출 불가(스캔 문서) 시 DB에 아무 표시 없이 `return` → `_recover_completed_without_text()`가 3분마다 동일 문서를 무한 재감지. 현재 `69b2367013bd6b58a4e459dd` (안영미신분증.ppt) 1건이 영원히 반복 중.

### 수정 방향 — 전원 합의
- **A+B안 채택**: 마커 `meta.text_extraction_failed=True` DB 기록 + 쿼리 필터로 재감지 차단
- **C안(재시도 카운터) 전원 기각**: 과잉 설계, CLAUDE.md 0-2(근본 원인 해결) 위반, 소진 후 상태 모호
- **범위**: `pdf_conversion_worker.py` 1파일, 4곳, ~20줄 수정

### 교차 리뷰에서 해소된 논쟁
| 논쟁 | 결론 |
|------|------|
| `meta.full_text: ""` 저장 여부 | Gini 의견 채택 — 마커 전용 필드만 사용, `full_text` 미변경 |
| 인덱스 추가 시점 | 동시 배포하되 별도 커밋으로 분리 |
| smoke_test 30초 타임아웃 원인 | 현재 1건으로는 직접 원인 아님 → 별도 조사 필요 |
| `_post_process_preview()` 재변환 | 마커 `$unset` 필수 (전원 동의) |

### 추가 발견 (별도 이슈로 추적)
- **성능**: `upload.conversion_status` 인덱스 부재 → COLLSCAN × 2 (3분마다)
- **보안**: `config.py` 내부 API 키 하드코딩, CORS `allow_origins=["*"]` + `allow_credentials=True` 모순
- **UX (Sora)**: "BIN" 뱃지가 비전문 사용자에게 의미 불명 → "검색 안 됨" 등 안내 필요

---

## 1. 증상

### 1-1. 무한 반복 로그
PM2 로그에서 **3분마다** 동일 문서에 대한 "텍스트 누락 복구" 시도가 반복됨:

```
20:45:15 [PDF변환워커] 텍스트 누락 감지 (completed): 69b2367013bd6b58a4e459dd - 안영미신분증.ppt
20:45:15 [PDF변환워커] 변환 PDF에서 텍스트 없음 (스캔 문서?): 69b2367013bd6b58a4e459dd
20:45:15 [PDF변환워커] 텍스트 누락 복구 완료: 1건

20:48:15 [PDF변환워커] 텍스트 누락 감지 (completed): 69b2367013bd6b58a4e459dd - 안영미신분증.ppt
20:48:15 [PDF변환워커] 변환 PDF에서 텍스트 없음 (스캔 문서?): 69b2367013bd6b58a4e459dd
20:48:15 [PDF변환워커] 텍스트 누락 복구 완료: 1건

... (영원히 반복) ...
```

### 1-2. 배포 시간 영향
- `deploy_all.sh`의 document_pipeline smoke_test에서 docx 처리가 30초 타임아웃 실패 (간헐적)
- 정상 시 6초에 완료되는 docx 처리가 워커 부하 시 지연 가능성

---

## 2. 재현 조건

다음 조건을 모두 만족하는 문서가 1건 이상 존재하면 발생:
1. `upload.conversion_status` = `"completed"` (PDF 변환 성공)
2. `upload.convPdfPath`가 존재하고 비어있지 않음
3. `meta.full_text`가 비어있거나 없음
4. `ocr.full_text`가 비어있거나 없음

→ **스캔된 이미지 기반 PPT/DOC/HWP** 등 텍스트가 추출 불가능한 변환 문서

---

## 3. 근본 원인

### 3-1. 코드 흐름

```
_periodic_cleanup() [3분마다]
  └→ _recover_completed_without_text()
       └→ 쿼리: conversion_status=completed AND full_text 비어있음
       └→ 매칭 문서마다:
            └→ _extract_and_update_text(doc_id, pdf_path)
                 └→ 텍스트 추출 시도
                 └→ 텍스트 없음 → return (DB 변경 없음!)  ← 여기가 문제
            └→ recovered += 1  (성공으로 카운트하지만 실제로 아무것도 안 함)
```

### 3-2. 핵심 결함

**`_extract_and_update_text()` 라인 254-258:**
```python
if not extracted_text or not extracted_text.strip():
    logger.info(f"[PDF변환워커] 변환 PDF에서 텍스트 없음 (스캔 문서?): {document_id}")
    return  # ← DB 변경 없이 조용히 반환
```

텍스트 추출이 불가능한 스캔 문서에 대해:
- **DB에 아무 표시도 남기지 않음** → 다음 주기에 다시 감지
- `recovered` 카운트에는 포함 → 로그에 "복구 완료: 1건"으로 표시 (실제로는 복구 안 됨)
- 결과: **영원히 같은 문서를 3분마다 재시도하는 무한 루프**

### 3-3. 영향 범위

| 항목 | 영향 |
|------|------|
| 로그 오염 | 3분마다 무의미한 로그 3줄씩 적재 |
| 디스크 I/O | 매번 변환된 PDF 파일을 읽고 PyMuPDF로 파싱 |
| MongoDB 부하 | 매번 쿼리 2회 (candidates 조회 + 텍스트 확인) |
| 워커 블로킹 | `_periodic_cleanup()`이 동기적으로 처리 → 이 시간 동안 다른 cleanup 작업 지연 |
| 확장성 | 스캔 문서가 늘어날수록 매 주기 처리량 선형 증가 (현재 1건, 최대 50건/주기) |

---

## 4. 현재 해당 문서 상태

```
문서 ID: 69b2367013bd6b58a4e459dd
파일명: 안영미신분증.ppt
상태: upload.conversion_status = "completed"
텍스트: meta.full_text 없음, ocr.full_text 없음
원인: 스캔된 이미지 기반 PPT → PDF 변환 성공했지만 텍스트 추출 불가
```

---

## 5. 수정 방향 (제안)

### A안: 텍스트 추출 실패 시 마커 표시
`_extract_and_update_text()`에서 텍스트 추출 불가 시 DB에 마커를 남겨 재시도 방지:
```python
# 텍스트 추출 불가 → 마커 표시
await files_col.update_one(
    {"_id": BsonObjectId(document_id)},
    {"$set": {"meta.text_extraction_attempted": True, "meta.full_text": ""}}
)
```

### B안: 쿼리에서 이미 시도한 문서 제외
`_recover_completed_without_text()` 쿼리에 `text_extraction_attempted` 필터 추가.

### C안: 최대 재시도 횟수 제한
`_recover_completed_without_text()`에 재시도 카운터 + 최대 3회 제한.

---

## 6. 에이전트 리뷰

> 아래는 각 에이전트의 독립적 분석 결과입니다.

### 6-1. Alex (설계/구현 전문가)

#### 근본 원인 — 동의

코드 검증 결과 이슈 문서의 분석이 정확합니다. `_extract_and_update_text()` 라인 254-258에서 텍스트 추출 불가 시 DB에 아무 표시도 남기지 않고 `return`하며, 호출자 `_recover_completed_without_text()`의 `recovered += 1`이 무조건 증가하여 거짓 성공을 보고합니다. **전형적인 "terminate condition 없는 재시도 루프"**입니다.

#### 영향 범위 — pdf_conversion_worker에만 해당

| 워커 | 무한 루프 위험 | 비고 |
|------|:-:|------|
| upload_worker.py | 없음 | stale job 복구 + 임시파일/완료 job 삭제만 수행 |
| ocr_worker.py | 없음 | Redis Stream 기반, `ack_and_delete()`로 메시지 제거 |
| annual_report_api | 없음 | `MAX_RETRY_COUNT=3`으로 보호됨 |
| embedding/full_pipeline.py | 없음 | `full_text` 존재 문서만 대상 |

프로젝트 전체 grep 결과, **동일한 "terminate condition 없는 무한 재시도" 패턴은 `_recover_completed_without_text()` 1곳뿐**입니다.

#### 수정 방향 평가

| 안 | 판정 | 이유 |
|---|---|---|
| **A안: 마커 표시** | **추천** | 간단, 명확, 1곳 수정. 텍스트 추출 불가는 영구적 속성 |
| B안: 쿼리 필터 | A의 부속 | A안에 의존 (마커가 있어야 필터 가능) → A+B 조합 |
| C안: 재시도 카운터 | 과잉 설계 | 스캔 문서는 100번 시도해도 텍스트 안 나옴 |

**최선의 방안: A안 + B안 병합 — `meta.text_extraction_failed` 마커 + 쿼리 필터 + 반환값 정확성**

#### 구현 설계 (4곳 수정, ~20줄)

1. **`_extract_and_update_text()` 텍스트 없음 시**: `meta.text_extraction_failed=True` 마커 DB 기록 + `return False`
2. **`_recover_completed_without_text()` 쿼리**: `"meta.text_extraction_failed": {"$ne": True}` 필터 추가
3. **`recovered` 카운트**: `_extract_and_update_text()` 반환값으로 실제 성공만 집계
4. **`_post_process_preview()` 재변환 시**: `meta.text_extraction_failed`를 `$unset`하여 재시도 허용

#### 엣지 케이스

| 케이스 | 대응 |
|---|---|
| 기존 무한 루프 문서 (`69b2367013bd6b58a4e459dd`) | 배포 후 첫 주기에서 마커 기록 → 자동 해결 |
| 나중에 OCR로 텍스트 채워지는 경우 | `ocr.full_text` 존재 → 쿼리에 안 걸림 |
| PDF 파일이 삭제된 경우 | `os.path.exists` 체크에서도 마커 남겨야 함 |
| 수동 재변환 시 | `_post_process_preview()`에서 마커 `$unset` |
| 50건 이상 | `to_list(length=50)` 상한으로 수렴 |

---

### 6-2. Gini (품질 검증 엔지니어)

#### 이슈 문서 정확성 — 원인 분석 정확, 추가 결함 2건 발견

코드 교차 검증 결과 근본 원인 분석은 정확합니다. 추가로 발견한 결함:

**결함 A: `recovered` 카운트 거짓 성공 보고** — `_extract_and_update_text()`가 `None`을 반환하므로 호출자가 성공/실패를 구분 불가. 운영자가 로그를 오판할 위험.

**결함 B: `_recover_stuck_pending_documents()` N+1 쿼리** — 최대 100건 × `find_one` = N+1 패턴. `upload.conversion_status` 인덱스 부재로 COLLSCAN.

#### 테스트 커버리지 — 핵심 경로 테스트 전무

| 테스트 대상 | 존재 여부 |
|---|---|
| `_convert()` text_extraction / preview_pdf | 있음 |
| `_handle_failure()` FileNotFoundError / 재시도 | 있음 |
| **`_recover_completed_without_text()`** | **없음** (핵심 버그 경로) |
| **`_extract_and_update_text()` 스캔 문서** | **없음** |
| **`_periodic_cleanup()` 전체 흐름** | **없음** |

#### 회귀 테스트 시나리오 (필수 6건)

| ID | 시나리오 | 기대 |
|---|---|---|
| TC-01 | 스캔 문서 재시도 차단 | 마커 기록 후 다음 주기에 candidates에서 제외 |
| TC-02 | 거짓 성공 카운트 제거 | 스캔 1건+정상 1건 → recovered=1 |
| TC-03 | 정상 복구 비회귀 | 텍스트 추출 성공 → DB 저장 → 다음 주기 제외 |
| TC-04 | 마커 필터링 쿼리 | `text_extraction_failed=True` 문서 쿼리 제외 확인 |
| TC-05 | 반환값 계약 | 성공→True, 실패→False |
| TC-06 | 에러 격리 | 한 함수 예외 시 다른 cleanup 함수 정상 실행 |

#### 수정 방향 QA 의견

**A+B안 권장.** C안은 CLAUDE.md `0-2. 근본 원인 해결` 규칙에 위반 (증상 제한 ≠ 원인 해결).

**주의**: `meta.full_text: ""`를 마커와 함께 저장하면 기존 OCR 재처리 쿼리에 영향 가능. 마커 전용 필드(`meta.text_extraction_failed`)만 사용하는 것이 Single Source of Truth 원칙에 부합.

**TDD 순서 필수**: TC-01 RED → 코드 수정 → GREEN. 커밋 시 테스트 동봉 필수 (CLAUDE.md 규칙).

---

### 6-3. 보안 감사 (Security Auditor)

> 분석 기준: OWASP Top 10, CWE 리소스 고갈 패턴, AIMS 네트워크 보안 아키텍처
> 분석일: 2026-03-18

#### 종합 평가

| 항목 | 등급 | 근거 |
|------|------|------|
| 리소스 고갈(DoS) 위험 | Medium | 무한 루프 + 최대 50건/주기 처리 한계 존재, 단독으로 서비스 다운 불가 |
| 악의적 이용(공격 벡터) | Low-Medium | UFW + Tailscale VPN 방어층 존재, 그러나 인증된 내부 사용자는 악용 가능 |
| 로그 인젝션 | Low | 로그 내용이 제한적, 단 무한 반복 로그는 모니터링 마비 유발 가능 |
| 수정 방향 보안 적합성 | A+B안 권장 | C안은 재시도 소진 후 상태 불분명, 보안상 A+B안이 명확 |

---

#### 1. 리소스 고갈 (CWE-400: Uncontrolled Resource Consumption)

**평가: Medium**

`_recover_completed_without_text()`는 3분마다 다음 리소스를 소비합니다.

| 리소스 | 소비 내용 | 누적 영향 |
|--------|-----------|-----------|
| **디스크 I/O** | `convPdfPath` 파일을 매 주기 전체 읽기 (`open + f.read()`) | 대용량 PDF(수십 MB) 스캔 문서가 다수일 경우 I/O burst 발생 |
| **메모리** | `pdf_bytes` 전체를 메모리에 로드 후 PyMuPDF 파싱 | 50건 동시 처리 시 peak 메모리 수백 MB 가능 |
| **MongoDB 연결** | 후보 조회 1회 + 문서별 find_one 1회 = 최대 51회/주기 | 커넥션 풀 소진 없음 (asyncio 순차 처리), 단 쿼리 레이턴시 누적 |
| **CPU** | PyMuPDF 파싱은 동기 호출 (`fitz.open`) — asyncio 이벤트 루프 블로킹 | 대용량 PDF 다수 시 업로드 워커 응답 지연 |

**핵심 취약점:** `_extract_and_update_text()`의 동기 디스크 I/O (`open(pdf_path, "rb")`, `fitz.open(stream=...)`)가 asyncio 이벤트 루프를 직접 블로킹합니다. 이는 cleanup 루프 내에서 호출되므로, 스캔 문서 50건이 쌓이면 매 3분마다 이벤트 루프가 수 초간 점유됩니다. `deploy_all.sh` smoke test의 docx 처리 30초 타임아웃 실패는 이 블로킹이 현실화된 증거입니다.

**현재 안전 장치:** `candidates` 조회 시 `length=50`으로 상한이 있어 단일 주기의 최대 피해를 제한합니다. 이 설계는 적절합니다.

---

#### 2. 악의적 이용 가능성 (OWASP A05:2021 - Security Misconfiguration / A07 - Identification Failures)

**평가: Low-Medium**

**공격 시나리오:** 인증된 AIMS 사용자(보험 설계사)가 스캔 이미지 기반 PPT/DOC 파일을 대량으로 반복 업로드하여 워커 부하를 유발하는 경우.

**방어 계층 분석:**

```
외부 공격자       → UFW 차단 (document_pipeline :8100 포트 외부 접근 불가)
                  → Tailscale VPN (인증되지 않은 접근 차단)

인증된 내부 사용자 → [현재 방어 없음] 스캔 문서 대량 업로드 가능
                  → 1인당 업로드 횟수/용량 제한 없음 (doc_upload.py L42 주석 확인)
```

`doc_upload.py` 42번 줄에 다음 주석이 명시되어 있습니다:
```python
# 파일 크기 제한은 Nginx 서버 블록(10G)이 담당하며, 여기서는 제한하지 않는다.
```

Nginx가 10GB 단일 파일을 허용하고, 업로드 횟수 제한이 없으며, 스캔 문서가 자동으로 무한 재처리 대상이 됩니다. 인증된 악의적 사용자가 10MB급 스캔 PPT 50건 이상을 업로드하면 현재 per-cycle 상한(50건) 포화 상태가 지속됩니다.

**AIMS 사용 맥락 고려:** 현재 AIMS는 초대 기반 소규모 서비스(보험 설계사 전용)로, 외부 무차별 공격 가능성은 낮습니다. 그러나 계정 탈취 시나리오는 배제할 수 없습니다.

---

#### 3. 로그 인젝션 및 로그 시스템 마비 (CWE-117: Log Injection / CWE-779: Log Forging)

**평가: Low (현재), Medium (확장 시)**

**현재 상태:** 로그 메시지에 `document_id`와 `originalName`이 포함됩니다.

```python
# pdf_conversion_worker.py L547-549
logger.info(
    f"[PDF변환워커] 텍스트 누락 감지 (completed): {doc_id} - "
    f"{(doc.get('upload') or {}).get('originalName', '')}"
)
```

`originalName`은 사용자가 업로드 시 지정한 파일명입니다. 악의적 파일명(`
[FAKE LOG] admin logged in
`)을 사용하면 로그 포맷이 오염될 수 있습니다. 현재 Python `logging` 모듈은 줄바꿈 문자를 그대로 출력하므로, PM2 로그 파서가 이를 별도 이벤트로 해석할 수 있습니다.

**무한 반복 로그의 실질적 위험:**
- 3분마다 최대 150줄(50건 × 3줄) 적재 → 하루 72,000줄
- PM2 `pm2 logs` 출력이 잡음으로 가득 차 **실제 오류 로그 탐지 지연**
- 디스크 공간 소비 (단, `/health/deep`의 1GB 임계값으로 감지 가능)

---

#### 4. 수정 방향 보안 관점 평가

**A안 (텍스트 추출 불가 시 DB 마커 표시) — 권장**

```python
await files_col.update_one(
    {"_id": BsonObjectId(document_id)},
    {"$set": {"meta.text_extraction_attempted": True, "meta.full_text": ""}}
)
```

- **보안 적합성: 우수.** 상태를 DB에 명시적으로 저장하여 재처리 루프를 원천 차단
- 추가 권장: `"meta.text_extraction_failed_at": datetime.utcnow()` 타임스탬프 함께 기록 → 감사 추적(audit trail) 확보
- `"meta.full_text": ""`를 명시적으로 설정하는 것은 쿼리 필터 일관성 측면에서 올바름

**B안 (쿼리에서 시도 완료 문서 제외) — 필수 보완**

A안과 반드시 함께 적용해야 합니다. A안만 적용 시 `text_extraction_attempted` 필드 없는 기존 레거시 문서에 대해 마커가 없을 경우 재처리 가능성이 있습니다. B안이 방어 계층을 추가합니다.

**C안 (최대 재시도 횟수 제한) — 비권장**

- 3회 재시도 소진 후 해당 문서의 상태가 모호해집니다. `conversion_status`는 여전히 `"completed"`이지만 텍스트는 없는 "절름발이 상태"가 됩니다
- 재시도 카운터는 DB 별도 필드에 저장해야 하는데, 이는 결국 A안의 마커와 동일한 구조입니다
- 3회 후 중단이 보장되지 않는 버그(예: 카운터 리셋)가 추가될 위험이 있습니다

**보안 관점 최종 권장: A안 + B안 동시 적용 (Defense in Depth)**

---

#### 5. 추가 발견 사항

**하드코딩된 내부 API 키 (MEDIUM)**

`config.py` 47번 줄:
```python
INTERNAL_API_KEY: str = "aims-internal-token-logging-key-2024"  # 크레딧 체크 API용
AIMS_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"
WEBHOOK_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"
```

기본값이 하드코딩되어 있습니다. `.env.shared`에서 재정의되는지 확인이 필요하며, 코드 베이스에 키가 노출된 상태입니다. Git 이력에서 영구 노출되므로 키 교체가 권장됩니다. 단, UFW + Tailscale VPN으로 해당 API가 외부에 노출되지 않아 현재 실질 위험은 낮습니다.

**CORS 전체 허용 (LOW)**

`main.py` 102~107번 줄:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 출처 허용
    allow_credentials=True,
    ...
)
```

`allow_origins=["*"]`와 `allow_credentials=True`의 조합은 CORS 사양상 브라우저가 거부합니다(자격증명 요청에 와일드카드 허용 불가). 현재 document_pipeline(:8100)은 브라우저에서 직접 호출되지 않고 서버 간 통신만 하므로 실질 위험은 없으나, 설정 자체가 모순입니다.

**`originalName` 로그 출력 시 sanitize 누락 (LOW)**

앞서 언급한 로그 인젝션 가능성. `originalName`을 로그에 출력 시 개행문자 제거를 권장합니다:
```python
safe_name = original_name.replace('
', ' ').replace('', ' ')
logger.info(f"[PDF변환워커] 텍스트 누락 감지 (completed): {doc_id} - {safe_name}")
```

### 6-4. 성능 분석 (Performance Tester)

#### 서버 현황 (측정일: 2026-03-18)

| 항목 | 수치 |
|------|------|
| document_pipeline 메모리 | 148MB / 전체 531MB (27.8%) |
| document_pipeline CPU | 0.7% (평상시) |
| 서버 전체 메모리 | 6.2GB / 7.7GB 사용 (80.5%) |
| 스왑 | 4.0GB / 4.0GB 전량 사용 (포화) |
| 디스크 사용률 | 53% (116GB 중 58GB) |
| 서버 로드 평균 | 0.45 / 0.27 / 0.22 |
| 무한 루프 대상 문서 | **1건** (안영미신분증.ppt) |
| 대상 PDF 파일 크기 | **57KB** |
| files 총 문서 수 | 2,119건 |
| conversion_status=completed 문서 수 | 156건 |

---

#### 4-1. 현재 성능 영향 수치

**주기당 리소스 소모 (3분마다 1회, 현재 1건 기준):**

| 연산 | 상세 | 예상 소요 |
|------|------|----------|
| MongoDB COLLSCAN (files 2,119건) | `upload.conversion_status=completed` 조건, 인덱스 없음 | ~5-15ms |
| 디스크 I/O | 57KB PDF 파일 읽기 (fitz.open) | ~1-3ms |
| PyMuPDF 파싱 | 57KB 스캔 PDF 텍스트 추출 시도 | ~5-20ms |
| MongoDB 추가 쿼리 | `_extract_and_update_text()` 내부 find_one 1회 | ~2-5ms |
| **합계 (1건 기준)** | | **~13-43ms / 3분** |

**현재 1건이므로 절대적 리소스 소모는 미미합니다.** 그러나 두 가지 구조적 문제가 확인되었습니다.

1. **COLLSCAN 확정**: `upload.conversion_status` 필드에 인덱스가 없어 매 주기마다 files 2,119건 전체를 스캔합니다. `_recover_stuck_pending_documents()` (pending 조회)도 동일하게 COLLSCAN입니다. 같은 `_periodic_cleanup()` 내에서 두 COLLSCAN이 순차 실행됩니다.

2. **스왑 포화 상태**: 서버 스왑이 4GB 전량 사용 중입니다. 이 상황에서 PyMuPDF(`fitz`)가 PDF를 메모리에 올릴 때 추가 스왑 I/O가 발생할 수 있으며, 스캔 문서가 늘어날수록 영향이 커집니다.

**1일 누적 소모량 (현재 1건 기준):**

- 주기 수: 480회/일 (1440분 ÷ 3분)
- MongoDB COLLSCAN: 480회 × 2,119건 = **1,017,120 문서 스캔/일**
- 디스크 읽기: 480회 × 57KB = **약 27MB/일** (무의미한 반복 읽기)
- 로그 라인: 480회 × 3줄 = **1,440줄/일** 오염

---

#### 4-2. 확장 시나리오 — 스캔 문서 50건 누적 시

| 항목 | 현재 (1건) | 50건 누적 시 |
|------|-----------|-------------|
| COLLSCAN | 2,119건 스캔/주기 (변화 없음) | 동일 |
| 디스크 읽기 | 57KB/주기 | 최대 2.85MB/주기 |
| PyMuPDF 파싱 | ~5-20ms/주기 | ~250-1,000ms/주기 |
| MongoDB find_one | 1회/주기 | 50회/주기 |
| **주기당 총 처리 시간** | **~13-43ms** | **최대 1-2초** |

`_periodic_cleanup()`은 await 체인으로 동기 실행되므로, 이 1-2초 동안 다른 cleanup 작업(`cleanup_stale_jobs`, `delete_completed_jobs`, `_recover_stuck_pending_documents`)이 블로킹됩니다.

스캔 문서가 누적될수록 `_periodic_cleanup()` 자체가 느려지고, 워커의 비동기 이벤트 루프가 일시적으로 점유됩니다. 이 상태에서 신규 docx 변환 요청이 들어오면, 큐에서 `claim_next()`로 작업을 가져오는 타이밍이 밀릴 수 있습니다.

---

#### 4-3. docx 처리 지연과의 상관관계

**smoke_test 조건:** 배포 직후 docx 파일을 변환 큐에 투입하여 30초 내 완료 여부 확인. 정상 시 6초 완료.

**무한 루프가 타임아웃에 기여하는 경로:**

- 배포 직후 `document_pipeline` 재시작 시: `_periodic_cleanup()` Task가 180초 후 첫 실행되므로 배포 직후에는 무관합니다.
- PM2가 재시작 없이 실행 중인 경우: `_periodic_cleanup()`이 이미 180초 타이머로 실행 중이며, smoke_test docx 투입 시점이 cleanup 실행 중간과 겹칠 수 있습니다.
- 스캔 문서 50건 누적 시: cleanup이 1-2초 이벤트 루프를 점유하여 `_process_next()`가 그만큼 지연됩니다.

**현재(1건)의 직접 기여도: 낮음.** 13-43ms 수준의 지연은 6초 처리 시간에 유의미한 영향을 주지 않습니다. 단, 다음 두 조건이 겹치면 기여도가 높아집니다:

- 스캔 문서가 10건 이상 누적된 경우
- docx 변환 자체가 느린 pdf_converter(:8005) 응답 시간과 겹치는 경우

**결론:** 현재 1건 기준으로는 smoke_test 30초 타임아웃의 **간접적 기여 요인**이지만, 직접 원인은 아닙니다. 그러나 방치하면 스캔 문서 증가에 따라 직접 원인으로 발전할 수 있습니다.

---

#### 4-4. 수정 후 예상 개선

**A안 적용 (텍스트 추출 실패 시 마커 표시) + 인덱스 추가 권고:**

| 항목 | 수정 전 | 수정 후 | 절감 |
|------|---------|---------|------|
| 무한 루프 대상 문서 처리 | 480회/일 (영구 반복) | **1회** (마커 후 종료) | 99.8% |
| 일일 MongoDB 스캔 | 1,017,120 doc-scans | ~2,119 (정상 주기 유지) | 실질적 낭비 제거 |
| 일일 디스크 읽기 | ~27MB (낭비) | **0MB** | 100% |
| 일일 로그 오염 | 1,440줄 | 0줄 | 100% |
| 50건 누적 시 주기당 지연 | 1-2초 | **0ms** | 100% |

**추가 권고 — `upload.conversion_status` 인덱스 추가:**

현재 `_recover_completed_without_text()`와 `_recover_stuck_pending_documents()` 모두 COLLSCAN입니다. files 컬렉션이 2,119건에서 계속 증가한다는 점을 고려하면, `PdfConversionWorker.start()` 또는 별도 마이그레이션으로 다음 인덱스 추가가 필요합니다:

```python
await files_col.create_index(
    [("upload.conversion_status", 1)],
    name="idx_conversion_status",
    sparse=True,
)
```

이 인덱스 하나로 두 복구 함수 모두 COLLSCAN → IXSCAN 전환이 가능하며, 5,000건 기준으로 쿼리 시간이 약 10-20배 단축될 것으로 추정됩니다.

---

#### 종합 판정

| 항목 | 판정 | 근거 |
|------|------|------|
| 현재 즉각적 위험도 | **LOW** | 1건, 57KB, 서버 로드 0.45 |
| 방치 시 위험도 | **MEDIUM** | 스캔 문서 누적 시 선형 증가 |
| smoke_test 직접 원인 | **아님** | 현재 1건으로는 ms 수준 영향 |
| 수정 필요성 | **HIGH** | 근본 원인이 명확하고, 수정 난이도 낮음 |
| 인덱스 추가 필요성 | **HIGH** | COLLSCAN × 2가 3분마다 실행 중 |

**권고:** A안(마커 표시)을 적용하고, `upload.conversion_status` 인덱스를 동시에 추가할 것을 권장합니다. 두 작업 모두 수정 범위가 좁고 사이드이펙트가 없어 즉시 적용 가능합니다.

### 6-5. Sora/김소라 (보험 설계사 페르소나)

#### 사용자 체감 영향

이 버그 자체(서버 뒤쪽 3분마다 무한 루프)는 직접 느끼기 어렵습니다. 문서가 사라지거나 업로드가 안 되는 것은 아닙니다. 그러나:

- **배포 지연으로 간헐적 서비스 중단**: 30분~1시간 접속 불가 시, 고객 미팅 직전 서류 확인이 불가능 → 약속에 빈손으로 가는 상황
- "간헐적"이 더 짜증남 — 언제 안 될지 모르기 때문

#### 검색 영향 — 가장 심각한 문제

텍스트가 없는 스캔 문서는 **AI 검색과 스마트 서치에서 완전히 누락**됩니다. 파일명 검색으로만 찾을 수 있는데, 스캐너에서 `scan001.ppt` 같은 이름으로 나오면 **영원히 못 찾는 문서**가 됩니다. 이건 현실적으로 빈번한 시나리오입니다.

#### 문서 목록 표시

- 텍스트 추출 실패 문서: **"BIN" (회색 뱃지)** 표시
- "BIN"은 비전문 사용자에게 의미 불명 → **"검색 안 됨"** 또는 **"내용 읽기 불가"** 같은 안내가 바람직
- 문서 자체는 목록에 나오고, 미리보기/다운로드는 정상 동작

#### 사용자 관점 요청

> "텍스트를 못 읽은 문서가 있으면, 목록에서 **'이 문서는 내용 검색이 안 됩니다'** 같은 안내를 해주세요. 그래야 파일명을 제대로 바꿔놔야겠다는 대응을 할 수 있어요."

**체감 심각도: 중간** — 패닉은 아니지만, 검색 누락은 꽤 심각하고 빈도가 늘면 시스템 불신으로 이어질 수 있음.

---

## 7. 에이전트 교차 리뷰 — 의견 교환

### 7-1. 합의 사항 (전원 동의)

| 항목 | 합의 내용 |
|------|-----------|
| **근본 원인** | `_extract_and_update_text()` 텍스트 추출 불가 시 DB 상태 미변경 → 무한 재감지. 전원 검증 완료 |
| **수정 방향** | **A안 + B안 병합 적용** (마커 표시 + 쿼리 필터). C안은 전원 비권장 |
| **C안 기각 이유** | Alex: 과잉 설계, Gini: CLAUDE.md 0-2 위반, 보안: 소진 후 상태 모호, 성능: 불필요한 복잡성 |
| **recovered 카운트** | 거짓 성공 보고 수정 필수 (Alex, Gini 동시 발견) |
| **영향 범위** | pdf_conversion_worker 1곳만. 다른 워커에는 동일 패턴 없음 (Alex, Gini 교차 확인) |

### 7-2. 논쟁 지점 및 해소

#### `meta.full_text: ""`를 함께 저장할 것인가?

| 에이전트 | 입장 | 근거 |
|----------|------|------|
| Alex | **저장** | 쿼리 필터 일관성 — 빈 문자열이 명시되면 `{"$exists": False}` 조건에 안 걸림 |
| Gini | **저장 안 함** | `meta.full_text: ""`가 OCR 재처리 쿼리에 영향 가능. Single Source of Truth 위반 |
| 보안 | **저장** | 쿼리 필터 일관성 측면에서 올바름 |

**해소**: Gini의 우려가 타당합니다. `meta.full_text`는 텍스트 유무 판단의 핵심 필드이며, 빈 문자열 명시 저장은 "텍스트가 없다"와 "텍스트 추출을 시도하지 않았다"를 구분 불가하게 만듭니다. **`meta.text_extraction_failed` 마커 전용 필드만 사용하고, `meta.full_text`는 건드리지 않는 것으로 합의.**

#### 인덱스 추가의 범위

| 에이전트 | 입장 |
|----------|------|
| 성능 | `upload.conversion_status` 인덱스 **즉시 추가** (COLLSCAN × 2가 3분마다 실행) |
| Alex | 동의. 단, 본 이슈 수정과 별도 커밋으로 분리 권장 |
| Gini | 인덱스 추가 시 regression 테스트 불필요하므로 동시 배포 가능 |

**해소**: **인덱스 추가는 본 버그 수정과 동시 배포하되, 별도 커밋으로 분리.**

#### `_post_process_preview()` 재변환 시 마커 리셋

| 에이전트 | 입장 |
|----------|------|
| Alex | `$unset` 필수 — 재변환 후 텍스트가 추출될 수 있으므로 |
| Gini | 동의 — 엣지 케이스 TC로 검증 필요 |

**해소**: **재변환 시 `meta.text_extraction_failed`를 `$unset`하는 것으로 합의.**

### 7-3. 각 에이전트가 상호 보완한 발견

| 발견 | 원래 발견자 | 보완자 |
|------|-----------|--------|
| N+1 쿼리 (`_recover_stuck_pending_documents`) | Gini | 성능 (COLLSCAN 실측 확인) |
| asyncio 이벤트 루프 블로킹 (동기 fitz.open) | 보안 | 성능 (스왑 포화와 결합 시 영향 증폭 확인) |
| 하드코딩된 API 키 (config.py) | 보안 | (본 이슈와 별개, 별도 이슈로 추적 권장) |
| BIN 뱃지 UX 문제 | Sora | (본 이슈와 별개, UX 개선 이슈로 분리) |
| PDF 파일 삭제 엣지 케이스 | Alex | Gini (TC-05 반환값 계약으로 포괄) |

### 7-4. smoke_test 30초 타임아웃의 진짜 원인

성능 분석 결과, **현재 1건으로는 무한 루프가 smoke_test 타임아웃의 직접 원인이 아닙니다** (13-43ms/주기). 별도 조사가 필요하며, 가능한 원인:
- smoke_test `--timeout 15` 설정이 너무 짧음 (정상 처리 6초 + 서버 부하 시 마진 부족)
- pdf_converter(:8005) 응답 지연
- 서버 스왑 포화(4GB/4GB)로 인한 전반적 I/O 지연

---

## 8. 종합 결론 및 실행 계획

### 8-1. 최종 수정 방안: A+B안 병합

**변경 파일**: `pdf_conversion_worker.py` 1개 (4곳 수정, ~20줄)

| 수정 | 내용 |
|------|------|
| 1 | `_extract_and_update_text()` — 텍스트 없음 시 `meta.text_extraction_failed=True` DB 기록 + `return False` |
| 2 | `_recover_completed_without_text()` 쿼리 — `meta.text_extraction_failed: {$ne: True}` 필터 추가 |
| 3 | `recovered` 카운트 — 반환값 기반 실제 성공만 집계 |
| 4 | `_post_process_preview()` — 재변환 시 `meta.text_extraction_failed`를 `$unset` |

### 8-2. 부수 작업

| 작업 | 우선순위 | 커밋 |
|------|----------|------|
| `upload.conversion_status` 인덱스 추가 | HIGH | 별도 커밋 |
| 회귀 테스트 TC-01~TC-06 | 필수 | 본 수정과 같은 커밋 |
| smoke_test 타임아웃 근본 원인 별도 조사 | MEDIUM | 별도 이슈 |
| BIN 뱃지 → 사용자 친화적 문구 변경 | LOW | 별도 이슈 |
| 하드코딩된 API 키 → `.env.shared` 이전 | LOW | 별도 이슈 |

### 8-3. 전원 합의 요약

```
근본 원인:    ✅ 전원 동의
수정 방향:    ✅ A+B안 (전원), C안 기각 (전원)
마커 필드:    meta.text_extraction_failed (meta.full_text는 미변경)
인덱스:       동시 배포, 별도 커밋
테스트:       TDD — RED 먼저, 코드 수정 후 GREEN
위험도:       낮음 (기존 정상 흐름 영향 없음)
```

### 8-4. 상태

> **상태**: 분석 완료 → **구현 승인 대기**
