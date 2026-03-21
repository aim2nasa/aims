# AIMS 문서 유형 식별 필드 가이드

> 최종 업데이트: 2026-03-21
> 청킹 개선 시 문서 유형별 차별화를 위한 참조 문서

## 1. 문서 유형 식별 필드

### 1.1 `meta.document_type` — AI 분류 결과 (22개 유형)

문서 업로드 시 `doc_prep_main.py`가 OpenAI를 호출하여 자동 분류한 결과.
시스템 프롬프트 기반 22개 유형 체계 (`openai_service.py`에 정의).

```javascript
// MongoDB 조회 예시
db.files.findOne({ "meta.document_type": "policy" })
```

#### 유형 목록 및 현황 (2026-03-21 기준, 전체 1,857건)

| 대분류 | `meta.document_type` 값 | 설명 | 건수 |
|--------|------------------------|------|------|
| **보험계약** | `policy` | 보험증권 (보험사 발행, 증권번호 확정) | 120 |
| | `coverage_analysis` | 보장분석/보장범위분석 보고서 | 45 |
| | `application` | 청약서/가입신청서 | 63 |
| | `plan_design` | 설계서/제안서/비교표/컨설팅 | 79 |
| | `insurance_etc` | 약관/계약변경/해지/보험가입현황/적립금 등 | 667 |
| **보험금청구** | `diagnosis` | 진단서/소견서/입퇴원확인서 | 56 |
| | `medical_receipt` | 진료비영수증/약제비계산서 | 102 |
| | `claim_form` | 보험금청구서/사고접수 | 41 |
| | `consent_delegation` | 동의서/위임장/FATCA확인서 | 10 |
| **신분증명** | `id_card` | 주민등록증/운전면허증/여권 | 62 |
| | `family_cert` | 가족관계증명서/주민등록등본 | 14 |
| | `personal_docs` | 개인통장/명함/금융거래확인서 | 30 |
| **건강** | `health_checkup` | 건강검진결과/종합검진 | 7 |
| **자산** | `asset_document` | 소득증명/재직증명/부동산등기 | 1 |
| | `inheritance_gift` | 상속/증여 | 2 |
| **법인** | `corp_basic` | 법인등기부등본/정관/사업자등록증 | 43 |
| | `hr_document` | 근로계약서/급여대장/인사발령 | 87 |
| | `corp_tax` | 원천징수영수증/세금계산서/재무제표 | 36 |
| | `corp_asset` | 법인자동차보험/리스/특허수수료 | 37 |
| | `legal_document` | 판결문/소장/내용증명 | 6 |
| **기타** | `general` | 안내문/메모/기타업무문서 | 316 |
| | `unclassifiable` | 텍스트없음/판독불가/빈이미지 | 33 |

### 1.2 AR/CRS 전용 필드

AR(Annual Report)과 CRS(Customer Review Sheet)는 별도 불리언 플래그로도 관리된다.

| 필드 | 타입 | 값 예시 | 건수 |
|------|------|---------|------|
| `is_annual_report` | Boolean | `true` | 1,116 |
| `is_customer_review` | Boolean | `true` | 516 |
| `tags` | Array | `["AR"]`, `["CRS"]` | 1,632 |
| `document_type` (top-level) | String | `"annual_report"`, `"customer_review"` | 1,632 |

> AR/CRS는 PDF 텍스트 파싱으로 감지 (`doc_prep_main.py`). `meta.document_type`과는 별도 경로.

### 1.3 필드 간 관계

```
일반 문서:  meta.document_type = "policy" | "diagnosis" | ... (22개 중 하나)
AR 문서:   is_annual_report = true, tags = ["AR"], document_type = "annual_report"
CRS 문서:  is_customer_review = true, tags = ["CRS"], document_type = "customer_review"
```

---

## 2. 분류 프롬프트 위치

| 파일 | 내용 |
|------|------|
| `backend/api/document_pipeline/services/openai_service.py` | `CLASSIFICATION_SYSTEM_PROMPT`, `CLASSIFICATION_USER_PROMPT` (22개 유형, 28개 규칙) |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 분류 결과를 `meta.document_type`에 저장하는 로직 |
| `backend/api/document_pipeline/xpipe/stages/classify.py` | xPipe용 분류 스테이지 (어댑터 기반) |

---

## 3. 청킹에서의 활용 방법

현재 `full_pipeline.py`는 `meta.document_type`을 청킹 메타데이터에 포함하지 않는다.
문서 유형별 청킹 차별화를 위해서는:

```python
# full_pipeline.py에서 split_text_into_chunks 호출 시
chunks = split_text_into_chunks(full_text, {
    'doc_id': doc_id,
    'document_type': doc_data.get('meta', {}).get('document_type', 'general'),
    # ... 기타 메타
})
```

이렇게 `document_type`을 meta에 전달하면, 청킹 단계에서 유형별로 파라미터를 조정하거나 Qdrant 페이로드에 포함시켜 유형별 필터 검색이 가능해진다.

### 유형별 청킹 차별화 예시

| 유형 그룹 | 특성 | 적합한 청크 크기 |
|-----------|------|-----------------|
| `policy`, `application` | 정형화된 계약 문서, 조항 단위 | 800~1,000자 |
| `diagnosis`, `medical_receipt` | 짧은 의료 문서 | 500~800자 |
| `insurance_etc` | 다양한 보험 부속 문서 | 1,000자 (현행 유지) |
| `corp_tax`, `corp_basic` | 법인 서류, 표 다수 | 1,000~1,200자 |
| `plan_design`, `coverage_analysis` | 비교표/분석 보고서 | 1,200~1,500자 |
| `id_card`, `family_cert` | 매우 짧은 신분 문서 | 500자 이하 |
