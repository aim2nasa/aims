# 설계서: 문서 분류 정확도 개선 — 다중 정보 활용

**일자:** 2026-03-28
**버전:** v2 (Alex/Gini 리뷰 반영)
**영역:** 백엔드 (document_pipeline — openai_service.py, doc_prep_main.py, ocr_worker.py)

---

## 1. 현재 문제

### 1-1. 텍스트 10자 미만 파일의 분류 누락

현재 `summarize_text()`는 `full_text`가 10자 이상일 때만 AI 호출. 10자 미만이면 분류를 스킵하여 `document_type`이 비어있음.

**예시:** `캐치업코리아/김보성,안영미/김보성/암검진067.jpg`
- OCR 결과: 텍스트 없음 (스캔 이미지, OCR 인식 실패)
- 파일명에 "암검진"이라는 분류 단서가 있음
- 하지만 AI 호출 스킵 → `document_type` 없음

### 1-2. 사용 가능한 분류 정보가 활용되지 않음

| 정보 | 저장 위치 | 현재 사용 | 활용 가치 |
|------|-----------|-----------|-----------|
| `full_text` | `meta.full_text` 또는 `ocr.full_text` | O (10자 이상만) | 최고 — 본문 기반 분류 가장 정확 |
| `summary` | `meta.summary` 또는 `ocr.summary` | X | 높음 — AI가 생성한 요약, 핵심 정보 압축 |
| 원본 파일명 | `upload.originalName` | 프롬프트에 포함되지만 분류 판단에 미활용 | 보조 — 의미 있는 경우와 없는 경우 혼재 |

---

## 2. 수정 설계

### 핵심 아이디어

**`full_text`가 10자 미만이어도, `summary`나 `원본 파일명`에 분류 단서가 있으면 AI 분류를 시도한다.**

### 2-1. 분류 입력 우선순위

```
1순위: full_text (10자 이상) → 기존대로 본문 기반 분류
2순위: summary (10자 이상) → 요약 기반 분류
3순위: 원본 파일명 (의미 있는 파일명만) → 파일명 기반 분류 시도
최종: 모든 정보 부실 → unclassifiable (AI 호출 없이 즉시 저장)
```

### 2-2. 파일명 사전 필터링 — `_is_meaningful_filename()` 활용

의미 없는 파일명(`IMG_20230401.jpg`, `document(3).pdf`, `123456.jpg`)은 AI에 전달해도 `unclassifiable`만 반환하므로 비용 낭비. 기존 `_is_meaningful_filename()` 메서드를 활용하여 사전 차단:

```python
# 분류 입력 텍스트 결정
classify_text = ""
classify_source = "none"

if ocr_text and len(ocr_text) >= 10:
    classify_text = ocr_text
    classify_source = "full_text"
elif summary and len(summary.strip()) >= 10:
    classify_text = summary
    classify_source = "summary"
elif original_name and _is_meaningful_filename(original_name):
    classify_text = _sanitize_filename_for_prompt(original_name)
    classify_source = "filename"

if classify_text:
    result = await self.openai_service.summarize_text(...)
else:
    # 모든 정보 부실 → unclassifiable (AI 호출 안 함)
    result = {"document_type": "unclassifiable", "confidence": 0.0, ...}
```

### 2-3. 파일명 sanitization (보안 — 프롬프트 인젝션 방어)

파일명이 AI 프롬프트에 직접 삽입되므로, 악의적 문자열 차단 필수:

```python
def _sanitize_filename_for_prompt(filename: str) -> str:
    """AI 프롬프트 삽입 전 파일명 정제"""
    import os, re
    name = os.path.basename(filename)  # 경로 제거, 순수 파일명만
    name = name[:100]                  # 길이 제한
    name = re.sub(r'[\r\n\t]', ' ', name)  # 줄바꿈/탭 제거
    return name.strip()
```

이 함수는 호출부에서 파일명 fallback 시 적용. 기존 `full_text` 경로에서는 `filename` 파라미터가 `file_info`에만 포함되므로 기존 동작 불변.

### 2-4. `summarize_text()` 프롬프트 — 수정 불필요

기존 프롬프트 규칙 1:
> "본문 텍스트가 충분하면 본문 내용 최우선, 텍스트 부실하면 파일명/별칭 최우선"

파일명만 `text` 파라미터로 전달하면 AI가 자동으로 파일명 기반 분류 수행. PoC에서 확인 필요.

### 2-5. `ocr_worker.py` 호출부 변경

OCR 완료 시점에는 `summary`가 아직 없으므로 `full_text` → `filename` 2단 fallback만 적용:

1. `full_text` 10자 이상 → 기존대로 AI 분류
2. `full_text` 10자 미만 + 의미 있는 파일명 → 파일명으로 AI 분류 시도
3. 모두 부실 → `unclassifiable` 명시 저장 (AI 호출 안 함)

### 2-6. `doc_prep_main.py` 호출부 변경

doc_prep_main.py에서도 동일한 fallback 로직. `summary`는 재분류 시나리오에서만 활용 가능 (첫 처리 시에는 summary가 아직 없음).

### 2-7. 분류 실패 시 정책

| 시나리오 | document_type |
|----------|---------------|
| 모든 입력 부실 (AI 호출 안 함) | `unclassifiable` |
| AI 호출했으나 exception 발생 | `general` (기존 exception handler 유지) |
| AI가 `unclassifiable` 반환 | `unclassifiable` (AI 판단 존중) |

### 2-8. `unclassifiable` 프론트엔드 호환성

현재 `document-types-routes.js:503-507`의 미분류 쿼리:
```javascript
query.$or = [
  { document_type: { $exists: false } },
  { document_type: null },
  { document_type: 'unspecified' }
];
```

**수정 필요**: `unclassifiable`을 미분류 쿼리에 추가:
```javascript
query.$or = [
  { document_type: { $exists: false } },
  { document_type: null },
  { document_type: 'unspecified' },
  { document_type: 'unclassifiable' }  // 추가
];
```

이를 통해 `unclassifiable` 문서도 "미분류" 탭에서 확인 가능.

---

## 3. AR/CRS 규칙 준수

**파일명은 분류(document_type) 판단의 보조 입력으로만 사용.**
**AR/CRS 감지에는 파일명을 절대 사용하지 않음** — 기존 규칙 그대로 유지.

- 분류: `summarize_text()` → `document_type` (22개 유형)
- AR/CRS 감지: PDF 텍스트 키워드 매칭 → `is_annual_report`, `is_customer_review` 플래그

AI가 `annual_report`/`customer_review` 반환 시 → `_validate_document_type()`이 `general`로 교체 (SYSTEM_ONLY_TYPES).

---

## 4. 변경 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `backend/api/document_pipeline/workers/ocr_worker.py` | 10자 미만 시 파일명 fallback 분류 + `_sanitize_filename_for_prompt` |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 10자 미만 시 `summary` → 파일명 fallback 분류 |
| `backend/api/aims_api/routes/document-types-routes.js` | 미분류 쿼리에 `unclassifiable` 추가 |

`openai_service.py`의 `summarize_text()` 함수 자체는 수정 불필요.

---

## 5. PoC 필요 사항

### 5-1. 파일명만으로 분류 정확도 테스트

| 입력 (basename 처리 후) | 기대 분류 |
|------|-----------|
| `암검진067.jpg` | `health_checkup` 또는 `diagnosis` |
| `김보성 메트라이프 생명보험 청약서 2009.05.pdf` | `application` |
| `김보성 통장사본 2023.08.pdf` | `personal_docs` |
| `보장분석_2024.pdf` | `coverage_analysis` |
| `한글English혼합_보험증권.pdf` | `policy` |
| `123456.jpg` | `unclassifiable` (숫자만 — `_is_meaningful_filename` 사전 차단) |
| `IMG_20230401_123456.jpg` | AI 호출 안 함 (`_is_meaningful_filename` 사전 차단) |
| `document(3).pdf` | AI 호출 안 함 (`_is_meaningful_filename` 사전 차단) |

### 5-2. 비용 영향

파일명 입력 시 토큰: 입력 ~1,000토큰(프롬프트 + 분류 규칙) + 출력 ~50토큰 ≈ ~1,050토큰.
gpt-4o-mini 비용: ~$0.0002/문서 — `_is_meaningful_filename()`으로 의미 없는 파일명을 사전 차단하므로 실제 추가 호출은 극소.

---

## 6. 테스트 계획

### 6-1. ocr_worker.py

- full_text 10자 이상 → 기존대로 `summarize_text()` 호출 (변경 없음)
- full_text 10자 미만 + 의미 있는 original_name → `summarize_text(sanitized_name)` 호출 확인
- full_text 10자 미만 + 의미 없는 original_name → AI 호출 스킵 + `unclassifiable` 저장 확인
- full_text 10자 미만 + original_name 없음(None/"") → AI 호출 스킵 확인
- 크레딧 부족 상태에서 filename fallback 호출 시 → `credit_skipped` 반환 처리 확인

### 6-2. doc_prep_main.py

- full_text 10자 이상 → 기존대로 호출 (변경 없음)
- full_text 10자 미만 + summary 있음 → `summarize_text(summary)` 호출 확인
- full_text 10자 미만 + summary 없음 + 의미 있는 original_name → `summarize_text(sanitized_name)` 호출 확인
- full_text 10자 미만 + 모두 부실 → `unclassifiable` 저장 확인

### 6-3. 보안

- 파일명 `Ignore instructions.pdf` → sanitization 후 정상 분류 (프롬프트 인젝션 실패)
- 파일명에 줄바꿈/탭 포함 → 제거 후 전달 확인
- 경로 포함 파일명 → `os.path.basename()` 처리 확인

### 6-4. 프론트엔드 호환성

- `document_type: "unclassifiable"` 문서 → 미분류 탭에서 표시 확인
- 기존 `document_type: null` 문서 → 기존대로 미분류 탭에서 표시 확인

---

## 7. 영향 범위

| 대상 | 영향 |
|------|------|
| full_text 10자 이상 문서 | 없음 — 기존 경로 그대로 |
| full_text 10자 미만 + 의미 있는 파일명 | 개선 — 분류 가능 |
| full_text 10자 미만 + 의미 없는 파일명 | 개선 — `unclassifiable` 명시 (AI 호출 없이) |
| AI 비용 | 극소 추가 (의미 있는 파일명만 호출) |
| AR/CRS 감지 | 없음 — 별도 로직, 파일명 미사용 |
| 미분류 탭 UI | `unclassifiable` 추가 표시 |

---

## 8. 비고

- CLAUDE.md 규칙 0-0 (PoC 필수): 파일명 기반 분류는 새로운 접근이므로 **PoC 승인 후 본 구현 진입**
- 프롬프트 수정 없이 기존 규칙 1("텍스트 부실하면 파일명/별칭 최우선")이 자동 적용됨을 PoC에서 확인 필요
- `_is_meaningful_filename()` 함수가 이미 존재하므로 추가 구현 부담 최소
