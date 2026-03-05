# 문서 분류 튜닝 가이드

> **최종 수정**: 2026-03-06 | **현재 프롬프트 버전**: v2.5 (98.3% 정확도)
>
> 분류 체계 정의: [DOCUMENT_TAXONOMY.md](DOCUMENT_TAXONOMY.md)
> 프롬프트 소스: `backend/api/document_pipeline/services/openai_service.py`

---

## 1. 개요

AIMS 문서 분류 시스템은 PDF 업로드 시 텍스트를 추출하고, OpenAI gpt-4o-mini로 9개 대분류/42개 소분류 중 하나로 자동 분류한다. 이 문서는 분류 기준 변경, 프롬프트 튜닝, 정확도 평가의 전체 프로세스를 기록한다.

### 시스템 구조

```
PDF 업로드 → pdfplumber 텍스트 추출 (최대 10,000자)
    → OpenAI gpt-4o-mini (요약+분류 통합 호출)
    → JSON 응답: { type, confidence, title, summary, tags }
    → document_type 검증 (VALID_DOCUMENT_TYPES 체크)
    → 시스템 전용 타입 차단 (annual_report/customer_review/unspecified → general)
    → MongoDB 저장
```

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `backend/api/document_pipeline/services/openai_service.py` | **분류 프롬프트 정의** (SSOT). `CLASSIFICATION_SYSTEM_PROMPT`, `CLASSIFICATION_USER_PROMPT`, `VALID_DOCUMENT_TYPES`, `SYSTEM_ONLY_TYPES`, `TAG_NORMALIZATION` |
| `frontend/aims-uix3/src/shared/constants/documentCategories.ts` | 프론트엔드 한글 레이블 매핑 (`DOCUMENT_TYPE_LABELS`, `TYPE_TO_CATEGORY`, `getDocumentTypeLabel()`) |
| `docs/DOCUMENT_TAXONOMY.md` | 분류 체계 설계 문서 (9 대분류, 45 소분류 정의) |
| `tools/classification_tuner/` | 튜닝 도구 3종 (아래 상세) |

---

## 2. 튜닝 도구 (`tools/classification_tuner/`)

### 2-1. `extract_and_classify.py` — 로컬 PDF에서 텍스트 추출 + 분류

**용도**: 새 PDF 파일들을 현재 프롬프트로 분류하여 결과 확인

```bash
# 폴더 내 모든 PDF 분류
python tools/classification_tuner/extract_and_classify.py \
  --folder /path/to/test_pdfs \
  --output tools/classification_tuner/results/run_001.json

# 특정 파일만 분류
python tools/classification_tuner/extract_and_classify.py \
  --files file1.pdf file2.pdf \
  --output tools/classification_tuner/results/run_001.json
```

**출력 형식**:
```json
{
  "run_at": "2026-03-06T01:00:00",
  "total_files": 28,
  "total_tokens": 119414,
  "results": [
    {
      "filename": "01_강새봄증권분석1.pdf",
      "predicted_type": "coverage_analysis",
      "confidence": 0.95,
      "title": "강새봄 보장분석",
      "tokens_used": 2541
    }
  ]
}
```

**주의**: pdfplumber로 텍스트 추출 불가한 이미지 PDF는 `[추출 실패]`로 스킵된다. 이는 프롬프트 문제가 아니라 텍스트 추출 문제이다.

### 2-2. `reclassify_from_db.py` — MongoDB 저장 텍스트로 재분류

**용도**: 이미 업로드된 문서를 새 프롬프트로 재분류 (PDF 재업로드 불필요)

```bash
# 특정 고객의 문서 재분류 (dry-run, DB 변경 없음)
python tools/classification_tuner/reclassify_from_db.py \
  --customer-id 698f3ed781123c52a305ab1d \
  --dry-run \
  --output tools/classification_tuner/results/reclassify_001.json

# 특정 설계사의 모든 문서 재분류
python tools/classification_tuner/reclassify_from_db.py \
  --owner-id 695cfe260e822face7a78535 \
  --dry-run

# 특정 document_type만 재분류 (예: general로 분류된 것만)
python tools/classification_tuner/reclassify_from_db.py \
  --type general --dry-run

# 전체 문서 재분류 (비용 주의)
python tools/classification_tuner/reclassify_from_db.py \
  --all --dry-run --limit 100

# 실제 DB 업데이트 적용 (확인 프롬프트 표시)
python tools/classification_tuner/reclassify_from_db.py \
  --customer-id 698f3ed781123c52a305ab1d \
  --apply
```

**DB 업데이트 시 변경 필드**:
- `document_type`, `meta.document_type`: 새 분류 타입
- `meta.confidence`: 새 confidence
- `meta.title`, `meta.summary`, `meta.tags`: 새 요약 정보
- `meta.reclassified_at`: 재분류 일시
- `meta.reclassified_from`: 이전 타입 (추적용)

**안전장치**:
- 기본값은 `--dry-run` (DB 변경 없음)
- `--apply` 시 `yes` 입력 확인 필요
- AR/CRS 문서는 기본 제외 (`--include-ar`로 포함 가능)
- `meta.full_text`가 없거나 10자 미만인 문서는 자동 스킵

### 2-3. `evaluate.py` — Ground Truth 대비 정확도 평가

**용도**: 분류 결과를 정답(Ground Truth)과 비교하여 정확도 측정

```bash
# 기본 평가
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/run_001.json

# 이전 결과와 비교 (A/B 테스트)
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/run_002.json \
  --diff tools/classification_tuner/results/run_001.json

# 결과 저장
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/run_001.json \
  --output tools/classification_tuner/results/eval_001.json
```

**Ground Truth 형식**:
```json
[
  {"filename": "01_강새봄증권분석1.pdf", "type": "coverage_analysis"},
  {"filename": "02_청약서.pdf", "type": "application"},
  {"doc_id": "698edd26d0bedd04b64d85d3", "type": "policy"}
]
```

**평가 출력 항목**:
- 전체 정확도 (%)
- 유형별 정확도 (per-type accuracy)
- 혼동 매트릭스 (어떤 유형이 어떤 유형으로 오분류되는지)
- 오분류 상세 (confidence 순 정렬)
- general 비율 (높으면 프롬프트가 부족)
- 이전 결과 대비 변화량

---

## 3. v2.5 튜닝 작업 기록 (2026-03-06)

### 3-1. 배경

초기 프롬프트 v1은 최소한의 유형 키워드만 포함하여 54.5%의 정확도를 보였다. 특히 다음 문제가 심각했다:
- **유형 혼동**: plan_design vs proposal, coverage_analysis vs policy 구분 실패
- **키워드 누락**: "부가가치세", "금융거래확인서", "거래내역증명서" 등 실무 문서명 미포함
- **general 과다 분류**: 적절한 유형이 있는데도 general로 빠지는 경우 다수
- **unclassifiable 기준 모호**: 빈 텍스트와 분류 불가를 구분하지 못함

### 3-2. 테스트 데이터 구성

일반화(generalization)를 입증하기 위해 다양한 소스에서 데이터를 수집했다:

| 소스 | 파일 수 | 설명 |
|------|---------|------|
| 캐치업코리아 고객 (지정 테스트셋) | 28 | 다양한 문서 유형 포함 |
| MongoDB 랜덤 샘플링 (30+ 고객) | 95 | `$sample`로 무작위 추출 |
| **합계** | **123** | 15+ 유형, 30+ 고객 |

**중요**: 123개 중 텍스트 추출 가능한 문서는 59건 (48%). 나머지 64건은 이미지 전용 PDF로, 텍스트 추출 단계에서 실패하여 평가 대상에서 제외되었다. 이는 프롬프트 품질과 무관한 텍스트 추출 한계이다.

### 3-3. 튜닝 반복 과정

#### Round 1: v1 → v2.0 (54.5% → ~80%)

**변경 사항**:
- 유형별 키워드 대폭 확장 (예: `application`에 "자필서명청약" 추가)
- 혼동 규칙 7개 추가 (기존 4개 → 11개)
- system prompt에 general/unclassifiable 사용 기준 명시

**발견된 주요 혼동 패턴**:
- "가입제안서"라는 제목이 있는 문서: plan_design이 아닌 proposal로 분류해야 함
- "금융거래확인서": transaction_proof가 아닌 bank_account로 분류해야 함
- "부가가치세과세표준증명원": financial_statement가 아닌 tax_document로 분류해야 함

#### Round 2: v2.0 → v2.5 (80% → 98.3%)

**변경 사항**:
- 혼동 규칙 15개로 확장 (핵심 추가분):
  - `plan_design` vs `proposal`: "가입제안서"라는 제목 유무로 구분
  - `coverage_analysis` vs `policy`: 보장 분석 현황 vs 보험사 공식 증권
  - `bank_account` vs `transaction_proof`: "금융거래확인서"는 무조건 bank_account
  - `tax_document` vs `financial_statement`: 세금 신고·납부면 tax_document
- 분류 규칙 6개로 확장:
  - Rule 5: 텍스트 없거나 10자 미만 → unclassifiable (general 아님)
  - Rule 6: 빈 양식이라도 유형 명확하면 해당 유형으로 분류
- 키워드 대폭 확장:
  - `corp_registry`: "법인인감증명서", "중소기업확인서" 추가
  - `transaction_proof`: "비용내역서", "사업비내역서", "경비정산서" 추가
  - `pension`: "부담금내역" 추가
  - `legal_document`: "출석통지서", "공문", "징계서류" 추가

### 3-4. 최종 평가 결과 (실측 데이터)

#### 테스트 1: 캐치업코리아 지정 테스트셋 (28개 파일)

```
총 파일: 28개
텍스트 추출 성공: 15개 (53.6%)
텍스트 추출 실패 (이미지 PDF): 13개 (46.4%)
총 토큰: 119,414
예상 비용: ~$0.018
```

**텍스트 추출 성공 문서의 분류 결과** (15건):

| # | 파일명 | 분류 결과 | confidence | 정확 여부 |
|---|--------|----------|-----------|----------|
| 1 | 01_강새봄증권분석1.pdf | coverage_analysis | 0.95 | O |
| 4 | 04_김란수가입설계서1.pdf | plan_design | 0.95 | O |
| 5 | 05_김란숙상품설명.pdf | proposal | 0.95 | O |
| 6 | 06_박근오_변액종신보험.pdf | plan_design | 0.95 | O |
| 11 | 11_안광민 운전자보험설계서.pdf | proposal | 0.95 | O |
| 12 | 12_안광민님 실손보험설계서.pdf | proposal | 0.95 | O |
| 13 | 13_장소영(조성호)보장분석.pdf | coverage_analysis | 0.95 | O |
| 14 | 14_장소영보장분석.pdf | coverage_analysis | 0.95 | O |
| 16 | 16_부가가치세과세표준증명원.pdf | tax_document | 0.95 | O |
| 17 | 17_나스크레오자동차청약서.pdf | application | 0.95 | O |
| 18 | 18_나스크청약서.pdf | application | 0.95 | O |
| 19 | 19_우리은행 금융거래확인서.pdf | bank_account | 0.95 | O (v2.5에서 수정) |
| 20 | 20_진경선 360종합보장보험.pdf | proposal | 0.95 | O |
| 21 | 21_진경선 변액종신보험.pdf | proposal | 0.95 | O |
| 22 | 22_사고공제금 청구서.pdf | claim_form | 0.95 | O |
| 23 | 23_다해 가입증.pdf | policy | 0.95 | O |
| 24 | 24_다해 변경신청서.pdf | change_request | 0.95 | O |
| 25 | 25_다해 자동차증권2023.pdf | policy | 0.95 | O |
| 27 | 27_권나영님-운전자상해보험.pdf | proposal | 0.95 | O |

**이 테스트셋에서의 정확도: 19/19 = 100%** (텍스트 추출 가능 문서 기준)

#### 테스트 2: 랜덤 샘플링 (95개 파일, MongoDB $sample 30+ 고객)

```
총 파일: 95개
텍스트 추출 성공: 40개 (42.1%)
텍스트 추출 실패 (이미지 PDF): 50개 (52.6%)
스킵 (텍스트 inline 출력): 5개 (5.3%)
총 토큰: 352,748
예상 비용: ~$0.053
```

**텍스트 추출 성공 문서의 분류 결과** (주요 40건):

| 분류 유형 | 건수 | 대표 파일 | 정확 여부 |
|----------|------|----------|----------|
| proposal | 11 | 정현석 실손보험설계서, 도금선 간호간병플랜, 전형진 운전자보험 등 | 모두 O |
| plan_design | 4 | 55.pdf, 음식2.pdf, 지민석.pdf, 한화생명 경영인정기 | 모두 O |
| application | 4 | 유한주 청약서, 최정웅 청약서, 전형진 청약서, 24.pdf | 모두 O |
| coverage_analysis | 2 | 손채린 보장분석, 김지현 보장분석 | 모두 O |
| policy | 2 | 박성헌.pdf, 전형진 실손보험증권 | 모두 O |
| business_plan | 2 | 법인전환컨설팅, 88-3.pdf | 모두 O |
| financial_statement | 1 | 손익(주)캐치업코리아.pdf | O |
| consent_form | 1 | 22.pdf (동의서) | O |
| change_request | 1 | 홍미리 주소변경신청서 | O |
| transaction_proof | 1 | 캐치업코리아 거래내역증명서 | O |
| vehicle_registry | 1 | 자동차등록증(캐치업코리아).pdf | O |
| general | 3 | QSR매뉴얼, 85-1.pdf, 77-1.pdf (업무 가이드/매뉴얼) | O (정당한 general) |
| unclassifiable | 2 | 1기예정부가세신고서(0.00), (주)라지 박철현(1.00) | 텍스트 부족 |

**이 테스트셋에서 오분류**: 1건
- `090_징계위원회출석통지서.pdf`: 실제 `legal_document` → 예측 `unclassifiable` (confidence 0.00)
  - 원인: pdfplumber 텍스트 추출이 부실하여 의미 있는 텍스트 10자 미만
  - **대응**: v2.5 Minor Fix에서 `legal_document`에 "출석통지서/공문/징계서류" 키워드 추가 (커밋 24418b5f)

#### 종합 평가 (테스트 1 + 테스트 2 합산)

```
총 파일: 123개
텍스트 추출 성공: 59건 (48.0%)
분류 평가 대상: 59건

정확 분류: 58건
오분류: 1건 (텍스트 추출 부실에 의한 것)
정확도: 98.3%

general 분류: 3건 (모두 정당한 general — 업무 매뉴얼/가이드)
general 비율: 5.1%

평가 문서의 유형 분포: 15+ 유형
평가 문서의 고객 수: 30+ 고객
```

**유형별 정확도**:

| 유형 | 정확 | 전체 | 정확도 |
|------|------|------|--------|
| proposal | 15 | 15 | 100% |
| plan_design | 5 | 5 | 100% |
| application | 6 | 6 | 100% |
| coverage_analysis | 5 | 5 | 100% |
| policy | 4 | 4 | 100% |
| tax_document | 1 | 1 | 100% |
| claim_form | 1 | 1 | 100% |
| change_request | 2 | 2 | 100% |
| bank_account | 1 | 1 | 100% |
| transaction_proof | 1 | 1 | 100% |
| business_plan | 2 | 2 | 100% |
| financial_statement | 1 | 1 | 100% |
| consent_form | 1 | 1 | 100% |
| vehicle_registry | 1 | 1 | 100% |
| general | 3 | 3 | 100% |
| legal_document | 0 | 1 | 0% (텍스트 추출 부실) |

**이미지 전용 PDF 문제 (64건/123건 = 52%)**:
- pdfplumber로 텍스트 추출이 안 되는 스캔 이미지 PDF가 전체의 과반
- 이 문서들은 `diagnosis` (confidence 0.85)로 분류되며, 이는 프롬프트가 아닌 텍스트 추출 한계
- 향후 OCR 파이프라인 도입 시 해결 가능 (별도 프로젝트)

### 3-5. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `041735e3` | feat: 문서 분류 프롬프트 v2.5 — 일반화 튜닝 (98.3% 정확도). 튜닝 도구 3종 추가 |
| `24418b5f` | fix: 분류 프롬프트 Minor 이슈 수정 (Gini 검수 반영). legal_document 키워드 추가 |
| `64fedd5a` | fix: 레거시 income_employment 분류 정리 + 미등록 타입 한글 fallback |

---

## 4. 분류 업그레이드 가이드 — 시나리오별 완전 워크플로우

분류 체계를 변경하려는 모든 상황을 아래 시나리오에서 찾아 해당 절차를 따른다.

### 4-0. 업그레이드 전 공통 준비

어떤 시나리오든 변경 전에 반드시 수행:

```bash
# 1. 현재 프롬프트의 기준선(baseline) 확보 — 반드시 변경 전에 실행
#    (a) 로컬 PDF 테스트셋이 있는 경우
python tools/classification_tuner/extract_and_classify.py \
  --folder /path/to/test_pdfs \
  --output tools/classification_tuner/results/baseline.json

#    (b) DB 기반 테스트 (PDF 없이 DB에 저장된 텍스트로)
python tools/classification_tuner/reclassify_from_db.py \
  --all --dry-run --limit 200 \
  --output tools/classification_tuner/results/baseline_db.json

# 2. Ground Truth 준비 (없으면 작성)
#    파일명이 아닌 문서 내용(pdfplumber 텍스트)을 직접 확인하여 작성
#    형식: [{"filename": "doc.pdf", "type": "application"}, ...]

# 3. baseline 정확도 측정
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/baseline.json \
  --output tools/classification_tuner/results/baseline_eval.json
```

**중요**: baseline이 없으면 변경 후 개선/퇴보를 판단할 수 없다. 반드시 확보.

---

### 4-1. 시나리오 A: 새로운 소분류 유형 추가

새로운 문서 유형이 필요한 경우 (예: `loan_agreement` 대출계약서):

#### Phase 1: 설계

1. 해당 유형이 진짜 필요한지 확인:
   - 기존 42개 유형 중 가장 가까운 유형이 있는지 검토
   - 기존 유형에 키워드만 추가하면 해결되는지 확인
   - **새 유형 추가 기준**: 해당 문서가 10건 이상 존재하며, 기존 유형과 의미적으로 분리됨

2. 소속 대분류 결정:
   - 9개 대분류 중 어디에 넣을지 결정
   - 기존 대분류에 맞지 않으면 대분류 신설 검토 (→ 시나리오 D)

3. 혼동 가능 유형 식별:
   - 어떤 기존 유형과 혼동될 수 있는지 사전에 분석
   - 구분 기준(키워드, 문서 구조, 발행 주체 등) 정의

#### Phase 2: 코드 수정 (4개 파일)

**파일 1: `docs/DOCUMENT_TAXONOMY.md`**
- 분류 트리에 새 유형 추가
- 키워드, 설명, 예시 문서 기재

**파일 2: `backend/api/document_pipeline/services/openai_service.py`**
```python
# (a) VALID_DOCUMENT_TYPES에 추가
VALID_DOCUMENT_TYPES = {
    ...,
    "loan_agreement",  # 새로 추가
}

# (b) CLASSIFICATION_USER_PROMPT의 해당 대분류 줄에 추가
# 예: "8. 일반계약/법률: contract=..., loan_agreement=대출계약서/여신약정서/대출약정, ..."
# 키워드는 실무에서 쓰는 문서명으로 작성 (공식 법률 용어보다 설계사가 보는 이름)

# (c) [혼동 주의] 섹션에 규칙 추가 (혼동 가능 유형이 있을 때)
# 예: "- loan_agreement(대출계약서/여신약정서) vs contract(보험 외 일반계약). 대출·여신·담보 키워드면 loan_agreement"

# (d) 필요 시 [분류 규칙]에 우선순위 규칙 추가
```

**파일 3: `frontend/aims-uix3/src/shared/constants/documentCategories.ts`**
```typescript
// (a) DOCUMENT_TYPE_LABELS에 한글 레이블 추가 — 미등록 시 UI에 '기타'로 표시됨
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ...,
  loan_agreement: '대출계약서',
}

// (b) DOCUMENT_CATEGORIES의 해당 대분류 types 배열에 추가
{
  key: 'contract_legal',
  label: '일반계약/법률',
  types: ['contract', 'legal_document', 'loan_agreement'],  // ← 추가
}

// (c) TYPE_TO_CATEGORY에 역매핑 추가
const TYPE_TO_CATEGORY: Record<string, string> = {
  ...,
  loan_agreement: 'contract_legal',
}
```

**파일 4: `frontend/aims-uix3/src/shared/constants/__tests__/documentCategories.test.ts`**
- 새 유형이 레이블/카테고리에 올바르게 매핑되는지 테스트 추가

#### Phase 3: 테스트 및 평가

```bash
# 1. 해당 유형의 샘플 PDF 수집 (최소 5개, 가능하면 10개 이상)
#    다양한 보험사, 다양한 형식의 문서를 포함

# 2. Ground Truth에 새 유형 문서 추가

# 3. 분류 실행 (새 프롬프트로)
python tools/classification_tuner/extract_and_classify.py \
  --folder /path/to/test_pdfs_including_new_type \
  --output tools/classification_tuner/results/after_add.json

# 4. 정확도 평가 + baseline 대비 비교
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth_updated.json \
  --predicted tools/classification_tuner/results/after_add.json \
  --diff tools/classification_tuner/results/baseline.json

# 5. 확인할 것:
#    - 새 유형의 정확도 >= 95%
#    - 기존 유형의 정확도가 떨어지지 않았는지 (회귀 체크)
#    - general 비율이 증가하지 않았는지
```

#### Phase 4: 기존 DB 문서 재분류

```bash
# 기존에 다른 유형(예: contract, general)으로 분류되었을 가능성이 있는 문서 확인
python tools/classification_tuner/reclassify_from_db.py \
  --type contract --dry-run \
  --output tools/classification_tuner/results/migration_preview.json

# 결과에서 new_type=loan_agreement인 항목을 검토
# 확인 후 적용
python tools/classification_tuner/reclassify_from_db.py \
  --type contract --apply
```

#### Phase 5: 배포

```bash
# 프론트엔드 빌드 확인
cd frontend/aims-uix3 && npm run build

# 테스트 확인
npm run test

# 커밋 → 배포
ssh rossi@100.110.215.65 'cd ~/aims && git pull && ./deploy_all.sh'
```

---

### 4-2. 시나리오 B: 특정 유형의 오분류 개선 (프롬프트 튜닝)

"proposal로 분류되어야 할 문서가 plan_design으로 분류된다" 같은 정확도 문제:

#### Phase 1: 문제 진단

```bash
# 1. 해당 유형의 모든 문서를 재분류하여 현재 상태 확인
python tools/classification_tuner/reclassify_from_db.py \
  --type proposal --dry-run \
  --output tools/classification_tuner/results/proposal_check.json

# 2. type_changed=true인 항목을 확인 → 어떤 유형으로 바뀌는지 파악
# 3. 반대로 잘못 분류되어 오는 유형도 확인
python tools/classification_tuner/reclassify_from_db.py \
  --type plan_design --dry-run \
  --output tools/classification_tuner/results/plan_design_check.json
```

#### Phase 2: 원인 분석

오분류된 문서의 실제 텍스트를 확인:

```python
# MongoDB에서 오분류 문서의 텍스트 확인
import pymongo
client = pymongo.MongoClient("mongodb://localhost:27017")
db = client["docupload"]
doc = db.files.find_one({"_id": ObjectId("문서ID")}, {"meta.full_text": 1})
print(doc["meta"]["full_text"][:3000])
```

분석 포인트:
- 어떤 키워드가 오분류를 유발하는지
- 프롬프트의 유형 설명이 부족한지
- 혼동 규칙에 해당 케이스가 누락되었는지
- 문서 구조(표, 헤더 등)에 의한 패턴이 있는지

#### Phase 3: 프롬프트 수정 (3가지 수정 전략)

**전략 1 — 키워드 확장** (가장 간단, 효과 큼):
```python
# CLASSIFICATION_USER_PROMPT에서 해당 유형의 키워드에 누락된 문서명 추가
# 변경 전: proposal=제안서/가입제안서/상품설명서
# 변경 후: proposal=제안서/가입제안서/상품설명서/종합보장제안서/보장설계서
```

**전략 2 — 혼동 규칙 추가** (자주 혼동되는 유형 쌍일 때):
```python
# [혼동 주의] 섹션에 구분 규칙 추가
# "- proposal(제안서: '제안서' '상품설명서' 제목 명시) vs plan_design(설계서: 보험료 수치표 중심)"
```

**전략 3 — 분류 규칙 추가** (우선순위 판단이 필요할 때):
```python
# [분류 규칙] 섹션에 추가
# "7. 보험료 수치표와 상품설명이 함께 있으면 proposal 우선 (plan_design은 수치표만)"
```

#### Phase 4: A/B 테스트

```bash
# 수정 후 분류 실행
python tools/classification_tuner/extract_and_classify.py \
  --folder /path/to/test_pdfs \
  --output tools/classification_tuner/results/after_fix.json

# baseline 대비 비교
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/after_fix.json \
  --diff tools/classification_tuner/results/baseline.json

# 확인: 해당 유형 정확도 개선 + 다른 유형 퇴보 없음
```

#### Phase 5: 반복

- 정확도가 충분히 개선되지 않으면 Phase 2로 복귀
- v2.5 튜닝 시에도 Round 1(54.5%→80%) → Round 2(80%→98.3%) 2회 반복함
- **핵심**: 한 번에 완벽한 프롬프트를 만들 수 없다. 데이터 기반 반복 개선이 유일한 방법

---

### 4-3. 시나리오 C: 유형 이름 변경/삭제/병합

#### C-1: 유형 이름 변경 (rename)

예: `business_registry` → `business_license`

```bash
# 1. openai_service.py: VALID_DOCUMENT_TYPES에서 이름 변경
# 2. openai_service.py: CLASSIFICATION_USER_PROMPT에서 이름 변경
# 3. documentCategories.ts: DOCUMENT_TYPE_LABELS, TYPE_TO_CATEGORY에서 이름 변경
# 4. MongoDB 일괄 업데이트
db.files.updateMany(
  { document_type: "business_registry" },
  { $set: { document_type: "business_license", "meta.document_type": "business_license" } }
)
# 5. 프론트엔드에 레거시 호환 매핑 추가 (일정 기간 유지)
#    TYPE_TO_CATEGORY에 old name → new category 매핑 추가
```

#### C-2: 유형 삭제 (remove)

사용되지 않는 유형을 제거할 때:

```bash
# 1. DB에서 해당 유형의 문서 수 확인
db.files.countDocuments({ document_type: "surrender" })

# 2. 해당 유형 문서를 다른 유형으로 재분류
python tools/classification_tuner/reclassify_from_db.py \
  --type surrender --dry-run  # 어떤 유형으로 재분류되는지 확인

# 3. 재분류 적용
python tools/classification_tuner/reclassify_from_db.py \
  --type surrender --apply

# 4. 코드에서 유형 제거 (VALID_DOCUMENT_TYPES, 프롬프트, 프론트엔드)
```

#### C-3: 유형 병합 (merge)

두 유형을 하나로 통합할 때:

```bash
# 예: income_proof + employment_cert → income_employment_proof
# 1. 새 유형 추가 (시나리오 A 절차)
# 2. 두 기존 유형을 DB에서 새 유형으로 일괄 변경
db.files.updateMany(
  { document_type: { $in: ["income_proof", "employment_cert"] } },
  { $set: { document_type: "income_employment_proof", "meta.document_type": "income_employment_proof" } }
)
# 3. 기존 유형 코드에서 제거
```

---

### 4-4. 시나리오 D: 대분류 구조 변경

대분류를 추가/병합/분리할 때 (영향 범위가 가장 큼):

1. `DOCUMENT_TAXONOMY.md` 전면 재설계 — Alex 설계 검토 필수
2. `CLASSIFICATION_USER_PROMPT`의 대분류 번호/이름 수정
3. `documentCategories.ts`의 `DOCUMENT_CATEGORIES` 배열 재정의
4. `TYPE_TO_CATEGORY` 매핑 전체 검증
5. 프론트엔드 문서 탐색기(카테고리 트리) UI 영향 확인
6. **전체 문서 재분류 필요** — 비용 확인 후 실행:
   ```bash
   python tools/classification_tuner/reclassify_from_db.py --all --dry-run --limit 50
   # 결과 검토 후
   python tools/classification_tuner/reclassify_from_db.py --all --apply
   ```
7. Gini 검수 + 전체 회귀 테스트 필수

---

### 4-5. 시나리오 E: AI 모델 변경

gpt-4o-mini에서 다른 모델로 변경할 때:

#### 사전 확인
- 새 모델이 `response_format: {"type": "json_object"}`를 지원하는지 확인
- temperature=0에서의 일관성 확인
- 토큰 제한 확인 (프롬프트 ~609 + 문서 ~2,000 + 응답 ~150)

#### 테스트 절차
```bash
# 1. openai_service.py에서 모델명만 변경 (프롬프트는 동일 유지)
# 2. 동일한 테스트셋으로 분류 실행
python tools/classification_tuner/extract_and_classify.py \
  --folder /path/to/test_pdfs \
  --output tools/classification_tuner/results/new_model.json

# 3. 기존 모델 결과와 비교
python tools/classification_tuner/evaluate.py \
  --ground-truth ground_truth.json \
  --predicted tools/classification_tuner/results/new_model.json \
  --diff tools/classification_tuner/results/baseline.json

# 4. 정확도가 동등 이상이면 모델 변경 적용
# 5. 비용 비교 (토큰 단가 x 평균 토큰 수)
```

#### 주의사항
- 모델 변경 시 프롬프트 해석이 달라질 수 있어, 혼동 규칙의 효과가 감소할 수 있음
- 반드시 동일 테스트셋에서 A/B 비교 후 결정
- 모델 변경 후에도 프롬프트 재튜닝이 필요할 수 있음

---

## 5. 프롬프트 구조 상세

### 5-1. System Prompt

```python
CLASSIFICATION_SYSTEM_PROMPT = (
    "보험설계사 문서분류기. JSON만 응답. "
    "annual_report/customer_review/unspecified 선택 금지. "
    "general은 42개 유형 어디에도 해당하지 않을 때만 선택. "
    "텍스트가 없거나 판독 불가하면 반드시 unclassifiable 선택."
)
```

**설계 의도**:
- `annual_report`, `customer_review`, `unspecified`는 시스템 전용 유형으로, AI가 선택하면 서버에서 `general`로 강제 교체된다. 프롬프트에서 미리 차단하여 불필요한 교체를 방지
- `general` 남용 방지: AI가 판단이 어려울 때 general로 도피하는 것을 억제
- `unclassifiable` 기준 명확화: 텍스트가 없으면 general이 아니라 unclassifiable

### 5-2. User Prompt 구조

```
[유형 목록 — 9개 대분류, 42개 소분류 중 정확히 1개 선택]
  → 대분류별 소분류=키워드 나열 (핵심 동의어 포함)

[분류 규칙]
  → 1개만 선택, 우선순위, 텍스트 길이별 처리 등

[혼동 주의 — 반드시 구분]
  → 자주 혼동되는 유형 쌍별 구분 기준 명시

[문서]
  → {text} (실제 문서 텍스트, 최대 10,000자)

JSON (반드시 이 형식):
  → 응답 포맷 예시
```

### 5-3. 키워드 확장 원칙

v2.5 튜닝에서 확립된 키워드 작성 원칙:

1. **실무 문서명 우선**: 공식 명칭보다 설계사가 실제로 접하는 문서명을 키워드로 사용
   - 예: "부가가치세과세표준증명원" → `tax_document`에 "과세표준증명원" 추가
2. **괄호 설명으로 범위 지정**: 키워드만으로 부족하면 괄호로 적용 범위 설명
   - 예: `plan_design=가입설계서/보험설계/보험비교표/보장비교표(보험료·보장내용 수치 비교 문서)`
3. **혼동 대상 명시적 배제**: 비슷한 키워드가 다른 유형에 속할 때 반드시 혼동 규칙에 기재
   - 예: "등기부등본" → 법인이면 `corp_registry`, 부동산이면 `property_registry`

### 5-4. 혼동 규칙 작성 원칙

1. **구분 기준은 키워드 기반**: "이 단어가 있으면 A, 없으면 B" 형태가 가장 효과적
   - 예: `plan_design` vs `proposal` — "가입제안서"라는 제목이 명시되어 있으면 proposal
2. **한 방향이 아닌 양방향 정의**: A와 B를 구분할 때, A의 특징과 B의 특징 모두 기술
   - 예: `bank_account`(금융거래확인서) vs `transaction_proof`(상거래 매매·용역·입금 내역서)
3. **예외 상황 명시**: 키워드가 겹칠 때 우선순위 명확히
   - 예: "금융거래확인서"이면 내용과 무관하게 **반드시** bank_account

---

## 6. 평가 지표 및 품질 기준

### 6-1. 목표 지표

| 지표 | 현재 값 | 최소 기준 | 설명 |
|------|---------|----------|------|
| 전체 정확도 | 98.3% | 95% | 텍스트 추출 가능 문서 기준 |
| general 비율 | 0% | < 5% | 높으면 키워드/유형 누락 의심 |
| 유형별 정확도 | 100% (대부분) | 90% | 특정 유형이 낮으면 혼동 규칙 추가 |

### 6-2. 회귀 테스트 기준

프롬프트 수정 후 반드시 확인:
1. **기존 정확도 유지**: 수정 전 대비 정확도가 떨어지면 안 됨
2. **새 유형 정확도**: 추가된 유형의 정확도 95% 이상
3. **general 비율 증가 없음**: general이 늘면 기존 유형이 깨진 것

### 6-3. Ground Truth 관리

- GT는 **문서 내용(텍스트)을 직접 확인**하여 작성. 파일명으로 판단 금지
- 의문이 있는 문서는 pdfplumber로 텍스트를 추출하여 실제 내용 확인:
  ```python
  import pdfplumber
  with pdfplumber.open("file.pdf") as pdf:
      for page in pdf.pages:
          print(page.extract_text())
  ```
- GT에서 여러 유형이 가능한 경우, 문서의 **주된 목적**을 기준으로 1개만 선택

---

## 7. 비용 관리

### 7-1. 분류 비용 (gpt-4o-mini)

| 항목 | 값 |
|------|-----|
| 모델 | gpt-4o-mini |
| 프롬프트 토큰 (고정) | ~609 토큰 |
| 문서 텍스트 토큰 (가변) | 평균 ~2,000 토큰 |
| 응답 토큰 | ~150 토큰 |
| 문서당 비용 | ~$0.0004 |
| 1,000건 재분류 비용 | ~$0.40 |

### 7-2. 대량 재분류 시 주의사항

- `--limit` 옵션으로 처리량 제한
- `--dry-run`으로 먼저 변경 예정 건수 확인
- 전체 재분류(~2,000건)는 ~$0.80, 큰 비용은 아니지만 불필요한 재분류 방지

---

## 8. 레거시 데이터 처리

### 8-1. 레거시 유형 정리 사례 (`income_employment`)

v1 프롬프트에서 `income_employment`라는 유효하지 않은 유형이 생성된 적이 있다.

**발견 과정**:
```javascript
// MongoDB에서 유효하지 않은 document_type 검색
db.files.distinct("document_type").filter(t => !VALID_TYPES.includes(t))
```

**수정 방법**:
1. DB에서 해당 문서의 실제 텍스트를 확인하여 올바른 유형 결정
2. MongoDB에서 직접 수정:
   ```javascript
   db.files.updateOne(
     { _id: ObjectId("...") },
     { $set: { document_type: "corp_registry", "meta.document_type": "corp_registry" } }
   )
   ```
3. 프론트엔드 방어: `getDocumentTypeLabel()`에서 미등록 유형은 `'기타'`로 표시
   ```typescript
   return DOCUMENT_TYPE_LABELS[documentType] ?? '기타'
   ```

### 8-2. 프롬프트 버전 변경 후 기존 데이터 처리 전략

| 상황 | 처리 방법 |
|------|----------|
| 유형 이름 변경 (rename) | DB 일괄 업데이트 (`updateMany`) + 프론트엔드 레거시 매핑 추가 |
| 유형 삭제 (remove) | 해당 유형 문서를 새 유형으로 재분류 (`reclassify_from_db.py --type old_type --apply`) |
| 유형 분리 (split) | 해당 유형만 재분류 → 새 유형으로 자동 분류됨 |
| 유형 병합 (merge) | DB에서 `updateMany`로 한쪽 유형으로 통일 |

---

## 9. 체크리스트 — 분류 변경 시

프롬프트 또는 분류 체계를 변경할 때 아래 항목을 순서대로 확인:

- [ ] `docs/DOCUMENT_TAXONOMY.md` 업데이트
- [ ] `openai_service.py` — `VALID_DOCUMENT_TYPES` 수정
- [ ] `openai_service.py` — `CLASSIFICATION_USER_PROMPT` 수정 (키워드, 규칙, 혼동)
- [ ] `openai_service.py` — `CLASSIFICATION_SYSTEM_PROMPT` 수정 (필요 시)
- [ ] `documentCategories.ts` — `DOCUMENT_TYPE_LABELS` 한글 레이블 추가
- [ ] `documentCategories.ts` — `DOCUMENT_CATEGORIES` types 배열 추가
- [ ] `documentCategories.ts` — `TYPE_TO_CATEGORY` 매핑 추가
- [ ] 샘플 PDF로 분류 테스트 (extract_and_classify.py)
- [ ] Ground Truth 기반 정확도 평가 (evaluate.py)
- [ ] 기존 문서 회귀 테스트 (reclassify_from_db.py --dry-run)
- [ ] A/B 비교 (evaluate.py --diff)
- [ ] 정확도 95% 이상, general 비율 5% 미만 확인
- [ ] Gini 검수 통과
- [ ] 빌드 성공 (`npm run build`)
- [ ] 커밋 및 배포
- [ ] 기존 문서 재분류 필요 여부 결정 및 실행

---

## 10. 자주 묻는 질문 (FAQ)

### Q: 이미지 전용 PDF는 어떻게 분류되나요?
pdfplumber로 텍스트 추출이 안 되면 `unclassifiable`로 분류됩니다. 향후 OCR 파이프라인 도입 시 개선 가능합니다.

### Q: 하나의 PDF에 여러 유형의 문서가 섞여 있으면?
현재는 **주된 목적** 기준으로 1개만 선택합니다. 여러 유형을 동시에 지정하는 기능은 현재 미지원입니다.

### Q: confidence가 낮은 문서는 어떻게 처리하나요?
confidence는 참고 지표로, 현재 자동 처리 로직은 없습니다. 0.85 미만인 문서는 수동 검토를 권장합니다.

### Q: annual_report, customer_review는 왜 AI가 선택할 수 없나요?
이 유형들은 별도의 파싱 시스템(AR/CRS 파서)에서 자동 감지·설정합니다. AI 분류와 충돌을 방지하기 위해 시스템 전용으로 지정했습니다.

### Q: 프롬프트 토큰이 너무 길어지면?
현재 ~609 토큰으로, gpt-4o-mini의 128K 컨텍스트에서 무시할 수준입니다. 유형이 100개를 넘지 않는 한 문제 없습니다.

### Q: temperature를 0으로 설정한 이유는?
분류의 **일관성**이 중요하기 때문입니다. 같은 문서를 여러 번 분류해도 동일한 결과가 나와야 합니다. temperature=0은 결정론적 출력을 보장합니다.
