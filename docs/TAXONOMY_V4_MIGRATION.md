# 문서 분류 체계 v4 마이그레이션 계획

> **상태**: 계획 수립 | **작성일**: 2026-03-08
>
> 현행: [DOCUMENT_TAXONOMY.md](DOCUMENT_TAXONOMY.md) (v3.2, 9대분류 45소분류)
> 튜닝 가이드: [CLASSIFICATION_TUNING_GUIDE.md](CLASSIFICATION_TUNING_GUIDE.md)

---

## 1. 변경 목적

현행 9대분류/45소분류 체계를 **7대분류/25소분류**로 간소화한다.

- 실무에서 거의 사용되지 않는 소분류 병합/제거
- 보험 설계사의 실제 문서 관리 흐름에 맞춘 재구성
- AI 분류 정확도 향상 (유형 수 감소 → 혼동 감소)

---

## 2. 신규 분류 체계 (v4)

```
AIMS 문서 분류 체계 v4 (7대분류, 26소분류)
│
├── 1. 보험계약 (insurance)
│   ├── 1.1 보험증권 ··········· policy
│   ├── 1.2 보장분석 ··········· coverage_analysis
│   ├── 1.3 청약서 ············· application
│   ├── 1.4 가입설계서 ········· plan_design
│   ├── 1.5 Annual Report(AR) · annual_report          [시스템 — 변경 없음]
│   ├── 1.6 변액 리포트(CRS) · customer_review        [시스템 — 변경 없음]
│   └── 1.7 기타 보험관련 ····· insurance_etc
│
├── 2. 보험금 청구 (claim)
│   ├── 2.1 진단서/소견서 ····· diagnosis
│   ├── 2.2 진료비 영수증 ····· medical_receipt
│   ├── 2.3 보험금 청구서 ····· claim_form
│   └── 2.4 위임장/동의서 ····· consent_delegation
│
├── 3. 신분/증명 (identity)
│   ├── 3.1 신분증 ············· id_card
│   ├── 3.2 가족관계 서류 ····· family_cert
│   └── 3.3 기타 통장 및 개인서류 · personal_docs
│
├── 4. 건강/의료 (medical)
│   └── 4.1 건강검진 결과 ····· health_checkup
│
├── 5. 자산 (asset)
│   ├── 5.1 자산관련 서류 ····· asset_document
│   └── 5.2 상속/증여 관련 ··· inheritance_gift
│
├── 6. 법인 (corporate)
│   ├── 6.1 기본서류 ··········· corp_basic
│   ├── 6.2 인사/노무 ········· hr_document
│   ├── 6.3 세무 ··············· corp_tax
│   ├── 6.4 법인자산 ··········· corp_asset
│   └── 6.5 기타 법률 서류 ··· legal_document
│
└── 7. 기타 (etc)
    ├── 7.1 일반문서 ··········· general
    ├── 7.2 분류불가 ··········· unclassifiable
    └── 7.3 미지정 ············· unspecified            [시스템 — 변경 없음]
```

---

## 3. 현행 → v4 매핑 (마이그레이션 맵)

### 1. 보험계약 (insurance)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 1.1 보험증권 | `policy` | `policy` | 유지 |
| 1.2 보장분석 | `coverage_analysis` | `coverage_analysis` | 유지 |
| 1.3 청약서 | `application` | `application` | 유지 |
| 1.4 가입설계서 | `plan_design` | `plan_design`, `proposal` | **proposal 흡수** — 제안서/설계서 통합 |
| 1.5 Annual Report(AR) | `annual_report` | `annual_report` | 유지 [시스템 — 변경 없음] |
| 1.6 변액 리포트(CRS) | `customer_review` | `customer_review` | 유지 [시스템 — 변경 없음] |
| 1.7 기타 보험관련 | `insurance_etc` | `terms`, `change_request`, `surrender` | **3개 흡수** — 약관, 계약변경, 해지 |

### 2. 보험금 청구 (claim)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 2.1 진단서/소견서 | `diagnosis` | `diagnosis`, `hospital_cert`, `medical_record` | **입퇴원확인서, 의무기록 흡수** |
| 2.2 진료비 영수증 | `medical_receipt` | `medical_receipt` | 유지 |
| 2.3 보험금 청구서 | `claim_form` | `claim_form`, `accident_cert` | **사고증명서 흡수** |
| 2.4 위임장/동의서 | `consent_delegation` | `consent_form`, `power_of_attorney` | **동의서 + 위임장 병합** |

### 3. 신분/증명 (identity)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 3.1 신분증 | `id_card` | `id_card` | 유지 |
| 3.2 가족관계 서류 | `family_cert` | `family_cert` | 유지 |
| 3.3 기타 통장 및 개인서류 | `personal_docs` | `bank_account`, `seal_signature`, `business_card` | **통장사본, 인감/서명, 명함 흡수** |

### 4. 건강/의료 (medical)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 4.1 건강검진 결과 | `health_checkup` | `health_checkup` | 유지 |

### 5. 자산 (asset)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 5.1 자산관련 서류 | `asset_document` | `property_registry`, `vehicle_registry`, `business_registry`, `income_proof`, `employment_cert`, `financial_statement`, `transaction_proof` | **부동산, 자동차, 사업자, 소득, 재직, 재무제표, 거래증빙 흡수** |
| 5.2 상속/증여 관련 | `inheritance_gift` | `inheritance_gift` | 법인에서 자산으로 이동 |

### 6. 법인 (corporate)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 6.1 기본서류 | `corp_basic` | `corp_registry`, `shareholder`, `meeting_minutes` | **법인등기/정관, 주주/지분, 의사록 통합** |
| 6.2 인사/노무 | `hr_document` | `hr_document`, `pension` | **퇴직연금 흡수** |
| 6.3 세무 | `corp_tax` | `tax_document` | 재정/세무에서 법인으로 이동 |
| 6.4 법인자산 | `corp_asset` | — | **신규** — 법인 부동산, 자동차 등 |
| 6.5 기타 법률 서류 | `legal_document` | `legal_document`, `contract`, `business_plan` | **계약서, 사업계획서 흡수** |

### 7. 기타 (etc)

| v4 소분류 | v4 코드 | 현행 코드 (흡수 대상) | 변경 내용 |
|-----------|---------|----------------------|----------|
| 7.1 일반문서 | `general` | `general`, `memo` | **메모 흡수** |
| 7.2 분류불가 | `unclassifiable` | `unclassifiable` | 유지 |
| 7.3 미지정 | `unspecified` | `unspecified` | 유지 [시스템] |

---

## 4. 삭제되는 현행 코드 요약

v4에서 독립 코드로 존재하지 않게 되는 현행 소분류:

| 현행 코드 | 현행 이름 | 흡수 대상 (v4) | 사유 |
|-----------|----------|---------------|------|
| `proposal` | 제안서 | `plan_design` | 설계서와 실무적 구분 어려움 |
| `terms` | 약관 | `insurance_etc` | 빈도 낮음 (25건) |
| `change_request` | 계약변경 | `insurance_etc` | 기타 보험관련으로 통합 |
| `surrender` | 해지서류 | `insurance_etc` | 빈도 낮음 (78건) |
| `hospital_cert` | 입퇴원확인서 | `diagnosis` | 진단서/소견서와 병합 |
| `medical_record` | 의무기록 | `diagnosis` | 진단서/소견서와 병합 |
| `accident_cert` | 사고증명서 | `claim_form` | 청구서와 통합 |
| `consent_form` | 동의서 | `consent_delegation` | 위임장과 병합 |
| `power_of_attorney` | 위임장 | `consent_delegation` | 동의서와 병합 |
| `bank_account` | 통장사본 | `personal_docs` | 개인서류로 통합 |
| `seal_signature` | 인감/서명 | `personal_docs` | 개인서류로 통합 |
| `business_card` | 명함 | `personal_docs` | 개인서류로 통합 |
| `income_proof` | 소득증빙 | `asset_document` | 자산관련으로 통합 |
| `employment_cert` | 재직증명 | `asset_document` | 자산관련으로 통합 |
| `financial_statement` | 재무제표 | `asset_document` | 자산관련으로 통합 |
| `transaction_proof` | 거래증빙 | `asset_document` | 자산관련으로 통합 |
| `property_registry` | 등기부등본 | `asset_document` | 자산관련으로 통합 |
| `vehicle_registry` | 자동차등록 | `asset_document` | 자산관련으로 통합 |
| `business_registry` | 사업자등록 | `asset_document` | 자산관련으로 통합 |
| `corp_registry` | 법인등기/정관 | `corp_basic` | 법인 기본서류로 통합 |
| `shareholder` | 주주/지분 | `corp_basic` | 법인 기본서류로 통합 |
| `meeting_minutes` | 의사록 | `corp_basic` | 법인 기본서류로 통합 |
| `pension` | 퇴직연금 | `hr_document` | 인사/노무로 통합 |
| `tax_document` | 세무서류 | `corp_tax` | 법인 세무로 이동 |
| `contract` | 계약서 | `legal_document` | 법률 서류로 통합 |
| `business_plan` | 사업계획서 | `legal_document` | 법률 서류로 통합 |
| `memo` | 메모 | `general` | 일반문서로 통합 |

---

## 5. 튜닝용 샘플 파일 준비 가이드

### 5-1. 소분류별 권장 샘플 수

AI 분류 프롬프트 최적화를 위해 소분류별로 테스트 파일을 준비한다.

| 우선순위 | 대상 소분류 | 권장 수량 | 사유 |
|---------|-----------|----------|------|
| **Tier 1** (혼동 위험 높음) | 아래 표 참조 | **15개** | 유형 간 혼동 패턴 식별 필수 |
| **Tier 2** (명확한 유형) | 아래 표 참조 | **10개** | 안정적 평가를 위한 충분한 샘플 |
| **Tier 3** (catch-all) | 기타/분류불가 | **5~7개** | 오분류 방지 확인 |

#### Tier 1 — 혼동 위험 높음 (소분류당 15개)

| 소분류 | 혼동 대상 | 혼동 이유 |
|--------|----------|----------|
| 1.1 보험증권 (`policy`) | 1.4 가입설계서 | 보험사 로고 + 보장내용 공통 |
| 1.2 보장분석 (`coverage_analysis`) | 1.4 가입설계서 | 보장 수치표 공통 |
| 1.3 청약서 (`application`) | 1.4 가입설계서 | 보험상품 정보 공통 |
| 1.4 가입설계서 (`plan_design`) | 1.1, 1.2, 1.3 | 여러 유형과 혼동 가능 |
| 2.1 진단서/소견서 (`diagnosis`) | 4.1 건강검진 결과 | 의료 문서 공통 |
| 2.4 위임장/동의서 (`consent_delegation`) | 1.7 기타 보험관련 | 보험사 양식 공통 |
| 6.1 기본서류 (`corp_basic`) | 6.3 세무 | 법인 문서 공통 |

#### Tier 2 — 명확한 유형 (소분류당 10개)

| 소분류 | 비고 |
|--------|------|
| 1.7 기타 보험관련 (`insurance_etc`) | 약관/변경/해지 등 다양한 하위 문서 포함 |
| 2.2 진료비 영수증 (`medical_receipt`) | 키워드로 명확히 구분 |
| 2.3 보험금 청구서 (`claim_form`) | 키워드로 명확히 구분 |
| 3.1 신분증 (`id_card`) | 키워드로 명확히 구분 |
| 3.2 가족관계 서류 (`family_cert`) | 키워드로 명확히 구분 |
| 4.1 건강검진 결과 (`health_checkup`) | 진단서와 구분 필요 |
| 5.1 자산관련 서류 (`asset_document`) | 다양한 하위 문서 포함 |
| 5.2 상속/증여 (`inheritance_gift`) | 명확한 유형 |
| 6.2 인사/노무 (`hr_document`) | 급여대장, 퇴직연금 등 |
| 6.3 세무 (`corp_tax`) | 세금 신고/납부 문서 |
| 6.4 법인자산 (`corp_asset`) | 신규 유형, 충분한 샘플 필요 |
| 6.5 기타 법률 서류 (`legal_document`) | 계약서, 공문 등 |

#### Tier 3 — catch-all (소분류당 5~7개)

| 소분류 | 비고 |
|--------|------|
| 3.3 기타 통장 및 개인서류 (`personal_docs`) | 통장, 인감, 명함 등 |
| 7.1 일반문서 (`general`) | 다른 유형에 해당하지 않는 문서 |
| 7.2 분류불가 (`unclassifiable`) | 텍스트 추출 불가/내용 불명 |

### 5-2. 총 예상 규모

```
Tier 1:  7개 유형 x 15개 = 105개
Tier 2: 12개 유형 x 10개 = 120개
Tier 3:  3개 유형 x  5개 =  15개
미지정(시스템):              제외
──────────────────────────────────
합계: ~240개 (텍스트 추출 가능 기준)
```

> 현재 이미지 PDF 비율이 ~52%이므로, 실제로는 **~500개 PDF**를 준비해야 240개의 유효 샘플을 확보할 수 있다.
> AR(1.5)과 CRS(1.6)는 시스템 유형으로 AI 분류 대상이 아니므로 샘플 준비 불필요.

### 5-3. 샘플 준비 원칙

1. **다양한 보험사/출처**: 같은 소분류라도 삼성생명, 한화생명, DB손보 등 다양한 양식 포함
2. **경계 사례 반드시 포함**: "보장분석인가 가입설계서인가?" 모호한 문서가 가장 중요
3. **텍스트 추출 가능 확인**: pdfplumber로 텍스트 추출이 되는 PDF만 유효
4. **파일명으로 판단 금지**: Ground Truth는 PDF 내용을 직접 확인하여 작성
5. **병합 대상 포함**: 현행 `proposal`, `hospital_cert` 등 흡수되는 유형의 문서도 포함하여 올바른 v4 유형으로 분류되는지 검증

### 5-4. Ground Truth 형식

```json
[
  {"filename": "삼성생명_종신보험증권.pdf", "type": "policy"},
  {"filename": "한화생명_보장분석표.pdf", "type": "coverage_analysis"},
  {"filename": "DB손보_청약서.pdf", "type": "application"},
  {"filename": "입퇴원확인서_서울대병원.pdf", "type": "diagnosis"},
  {"filename": "금융거래확인서_우리은행.pdf", "type": "personal_docs"},
  {"filename": "사업자등록증_캐치업코리아.pdf", "type": "corp_basic"}
]
```

---

## 6. 사전 준비 작업 (샘플 데이터 없이 가능)

샘플 데이터가 준비되기 전에 미리 해둘 수 있는 작업 목록.

### 6-1. 수정 대상 파일 및 변경 내용

#### 파일 1: `backend/api/document_pipeline/services/openai_service.py`

**(a) `VALID_DOCUMENT_TYPES` (현행 line 81~94)**

현행 42개 → v4 22개 (시스템 유형 3개 제외):

```python
# v4
VALID_DOCUMENT_TYPES = {
    # 1. 보험계약
    "policy", "coverage_analysis", "application", "plan_design", "insurance_etc",
    # 2. 보험금 청구
    "diagnosis", "medical_receipt", "claim_form", "consent_delegation",
    # 3. 신분/증명
    "id_card", "family_cert", "personal_docs",
    # 4. 건강/의료
    "health_checkup",
    # 5. 자산
    "asset_document", "inheritance_gift",
    # 6. 법인
    "corp_basic", "hr_document", "corp_tax", "corp_asset", "legal_document",
    # 7. 기타
    "general", "unclassifiable",
}

# 변경 없음
SYSTEM_ONLY_TYPES = {"annual_report", "customer_review", "unspecified"}
```

**(b) `CLASSIFICATION_SYSTEM_PROMPT` (현행 line 99~104)**

```python
# v4
CLASSIFICATION_SYSTEM_PROMPT = (
    "보험설계사 문서분류기. JSON만 응답. "
    "annual_report/customer_review/unspecified 선택 금지. "
    "general은 22개 유형 어디에도 해당하지 않을 때만 선택. "
    "텍스트가 없거나 판독 불가하면 반드시 unclassifiable 선택."
)
```

**(c) `CLASSIFICATION_USER_PROMPT` (현행 line 106~)**

7대분류/22소분류 구조로 전면 재작성 필요. 샘플 데이터 튜닝 후 확정.

#### 파일 2: `frontend/aims-uix3/src/shared/constants/documentCategories.ts`

**(a) `DOCUMENT_CATEGORIES` (현행 line 14~24) — 9개 → 7개**

```typescript
// v4
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  { value: 'insurance', label: '보험계약', icon: 'shield', color: '#2563eb' },
  { value: 'claim', label: '보험금청구', icon: 'cross.case', color: '#dc2626' },
  { value: 'identity', label: '신분/증명', icon: 'person.text.rectangle', color: '#7c3aed' },
  { value: 'medical', label: '건강/의료', icon: 'heart.text.square', color: '#e11d48' },
  { value: 'asset', label: '자산', icon: 'building.2', color: '#d97706' },
  { value: 'corporate', label: '법인', icon: 'building.columns', color: '#0891b2' },
  { value: 'etc', label: '기타', icon: 'doc', color: '#6b7280' },
]
```

삭제 대분류: `financial`(재정/세무 → 법인 세무 + 자산으로 분산), `legal`(법률 → 법인으로 흡수)

**(b) `DOCUMENT_TYPE_LABELS` (현행 line 27~90) — 전면 교체**

```typescript
// v4
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  // 1. 보험계약
  policy: '보험증권',
  coverage_analysis: '보장분석',
  application: '청약서',
  plan_design: '가입설계서',
  annual_report: '연간보고서(AR)',
  customer_review: '변액리포트(CRS)',
  insurance_etc: '기타 보험관련',

  // 2. 보험금 청구
  diagnosis: '진단서/소견서',
  medical_receipt: '진료비영수증',
  claim_form: '보험금청구서',
  consent_delegation: '위임장/동의서',

  // 3. 신분/증명
  id_card: '신분증',
  family_cert: '가족관계서류',
  personal_docs: '기타 통장 및 개인서류',

  // 4. 건강/의료
  health_checkup: '건강검진결과',

  // 5. 자산
  asset_document: '자산관련서류',
  inheritance_gift: '상속/증여',

  // 6. 법인
  corp_basic: '기본서류',
  hr_document: '인사/노무',
  corp_tax: '세무',
  corp_asset: '법인자산',
  legal_document: '기타 법률서류',

  // 7. 기타
  general: '일반문서',
  unclassifiable: '분류불가',
  unspecified: '미지정',
}
```

**(c) `TYPE_TO_CATEGORY` (현행 line 93~159) — 전면 교체 + 레거시 매핑**

```typescript
// v4
const TYPE_TO_CATEGORY: Record<string, string> = {
  // 1. 보험계약
  policy: 'insurance',
  coverage_analysis: 'insurance',
  application: 'insurance',
  plan_design: 'insurance',
  annual_report: 'insurance',
  customer_review: 'insurance',
  insurance_etc: 'insurance',

  // 2. 보험금 청구
  diagnosis: 'claim',
  medical_receipt: 'claim',
  claim_form: 'claim',
  consent_delegation: 'claim',

  // 3. 신분/증명
  id_card: 'identity',
  family_cert: 'identity',
  personal_docs: 'identity',

  // 4. 건강/의료
  health_checkup: 'medical',

  // 5. 자산
  asset_document: 'asset',
  inheritance_gift: 'asset',

  // 6. 법인
  corp_basic: 'corporate',
  hr_document: 'corporate',
  corp_tax: 'corporate',
  corp_asset: 'corporate',
  legal_document: 'corporate',

  // 7. 기타
  general: 'etc',
  unclassifiable: 'etc',
  unspecified: 'etc',

  // === 레거시 매핑 (DB 마이그레이션 전 방어) ===
  proposal: 'insurance',          // → plan_design
  terms: 'insurance',             // → insurance_etc
  change_request: 'insurance',    // → insurance_etc
  surrender: 'insurance',         // → insurance_etc
  hospital_cert: 'claim',         // → diagnosis
  medical_record: 'claim',        // → diagnosis (현행: medical)
  accident_cert: 'claim',         // → claim_form
  consent_form: 'claim',          // → consent_delegation (현행: identity)
  power_of_attorney: 'claim',     // → consent_delegation (현행: identity)
  bank_account: 'identity',       // → personal_docs
  seal_signature: 'identity',     // → personal_docs
  business_card: 'identity',      // → personal_docs
  income_proof: 'asset',          // → asset_document (현행: financial)
  employment_cert: 'asset',       // → asset_document (현행: financial)
  financial_statement: 'asset',   // → asset_document (현행: financial)
  tax_document: 'corporate',      // → corp_tax (현행: financial)
  transaction_proof: 'asset',     // → asset_document (현행: financial)
  property_registry: 'asset',     // → asset_document
  vehicle_registry: 'asset',      // → asset_document
  business_registry: 'asset',     // → asset_document
  corp_registry: 'corporate',     // → corp_basic
  shareholder: 'corporate',       // → corp_basic
  meeting_minutes: 'corporate',   // → corp_basic
  pension: 'corporate',           // → hr_document
  business_plan: 'corporate',     // → legal_document
  contract: 'corporate',          // → legal_document (현행: legal)
  memo: 'etc',                    // → general
  claim: 'claim',                 // 기존 레거시
}
```

**(d) `SYSTEM_TYPES` (현행 line 191) — 변경 없음**

```typescript
const SYSTEM_TYPES = new Set(['annual_report', 'customer_review'])
```

#### 파일 3: `frontend/aims-uix3/src/shared/constants/__tests__/documentCategories.test.ts`

- 새 유형 코드 테스트 추가
- 레거시 매핑 테스트 추가 (현행 코드 → 올바른 v4 카테고리)

### 6-2. DB 마이그레이션 스크립트 (초안)

샘플 데이터 확정 후 실행. 현재는 매핑만 정의.

```javascript
// MongoDB Shell — dry-run: find로 확인 후 updateMany로 실행
// document_type + meta.document_type 동시 변경

const migrations = [
  // 1. 보험계약 — 흡수
  { from: 'proposal', to: 'plan_design' },
  { from: 'terms', to: 'insurance_etc' },
  { from: 'change_request', to: 'insurance_etc' },
  { from: 'surrender', to: 'insurance_etc' },

  // 2. 보험금 청구 — 병합
  { from: 'hospital_cert', to: 'diagnosis' },
  { from: 'medical_record', to: 'diagnosis' },
  { from: 'accident_cert', to: 'claim_form' },
  { from: 'consent_form', to: 'consent_delegation' },
  { from: 'power_of_attorney', to: 'consent_delegation' },

  // 3. 신분/증명 — 통합
  { from: 'bank_account', to: 'personal_docs' },
  { from: 'seal_signature', to: 'personal_docs' },
  { from: 'business_card', to: 'personal_docs' },

  // 4. 자산 — 흡수 (재정/세무 + 자산 통합)
  { from: 'income_proof', to: 'asset_document' },
  { from: 'employment_cert', to: 'asset_document' },
  { from: 'financial_statement', to: 'asset_document' },
  { from: 'transaction_proof', to: 'asset_document' },
  { from: 'property_registry', to: 'asset_document' },
  { from: 'vehicle_registry', to: 'asset_document' },
  { from: 'business_registry', to: 'asset_document' },

  // 5. 법인 — 통합
  { from: 'corp_registry', to: 'corp_basic' },
  { from: 'shareholder', to: 'corp_basic' },
  { from: 'meeting_minutes', to: 'corp_basic' },
  { from: 'pension', to: 'hr_document' },
  { from: 'tax_document', to: 'corp_tax' },
  { from: 'contract', to: 'legal_document' },
  { from: 'business_plan', to: 'legal_document' },

  // 6. 기타 — 통합
  { from: 'memo', to: 'general' },
]

// dry-run: 건수 확인
for (const m of migrations) {
  const count = db.files.countDocuments({ document_type: m.from })
  print(`${m.from} → ${m.to}: ${count}건`)
}

// 실행 (확인 후)
for (const m of migrations) {
  db.files.updateMany(
    { document_type: m.from },
    { $set: {
      document_type: m.to,
      'meta.document_type': m.to,
      'meta.migrated_from_v3': m.from,
      'meta.migrated_at': new Date()
    }}
  )
}

// 검증: v3 코드가 남아있지 않은지 확인
const v3Types = migrations.map(m => m.from)
const remaining = db.files.countDocuments({ document_type: { $in: v3Types } })
print(`마이그레이션 후 잔여 v3 코드: ${remaining}건 (0이어야 함)`)
```

### 6-3. 현행 DB 유형별 건수 조회 (마이그레이션 전 스냅샷)

마이그레이션 실행 전에 아래 쿼리로 현재 상태를 기록해둘 것:

```javascript
db.files.aggregate([
  { $group: { _id: '$document_type', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

---

## 7. 구현 절차

> [CLASSIFICATION_TUNING_GUIDE.md](CLASSIFICATION_TUNING_GUIDE.md)의 시나리오 D(대분류 구조 변경) + C(유형 병합) 참조

### Phase 1: 샘플 준비 + Ground Truth 작성
- 소분류별 샘플 파일 수집 (섹션 5 참조)
- PDF 내용을 직접 확인하여 Ground Truth JSON 작성
- 현행 프롬프트로 baseline 정확도 측정

### Phase 2: 프롬프트 v4 작성
- `openai_service.py` — 섹션 6-1 파일 1의 (a)(b)(c) 적용
- 키워드, 혼동 규칙, 분류 규칙 재정의

### Phase 3: 튜닝 + A/B 테스트
- 새 프롬프트로 분류 실행 (`extract_and_classify.py`)
- Ground Truth 대비 정확도 평가 (`evaluate.py`)
- baseline 대비 비교 (`evaluate.py --diff`)
- 목표: 전체 정확도 95% 이상, general 비율 5% 미만

### Phase 4: 프론트엔드 수정
- `documentCategories.ts` — 섹션 6-1 파일 2의 (a)(b)(c)(d) 적용
- 테스트 코드 업데이트 — 섹션 6-1 파일 3
- 레거시 매핑으로 DB 마이그레이션 전에도 UI가 정상 동작하도록 보장

### Phase 5: DB 마이그레이션
- 섹션 6-3 쿼리로 현재 상태 스냅샷
- 섹션 6-2 스크립트로 dry-run → 건수 확인 → 실행
- 검증 쿼리로 잔여 v3 코드 0건 확인

### Phase 6: 전체 재분류 (선택)
- 필요 시 `reclassify_from_db.py --all --apply`로 기존 문서 재분류
- 비용: ~2,000건 x $0.0004 = ~$0.80

### Phase 7: 배포 + 검증
- 빌드 확인 (`npm run build`)
- 테스트 확인 (`npm run test`)
- Gini 검수
- 배포 (`deploy_all.sh`)

---

## 7. 주의사항

### 시스템 유형 처리 (변경 없음)
- `annual_report`: AR 파서가 설정하는 시스템 유형. AI 분류에서 선택 금지 유지
- `customer_review`: CRS 파서가 설정하는 시스템 유형. AI 분류에서 선택 금지 유지
- `unspecified`: 미분류 문서의 기본값. AI 분류에서 선택 금지 유지

### 법인 vs 개인 문서 구분
- 6.3 세무(`corp_tax`)와 5.1 자산(`asset_document`)의 세금 관련 문서 구분 기준 필요
  - 법인세, 부가세 → `corp_tax`
  - 개인 소득세, 재산세 → `asset_document`
- 6.4 법인자산(`corp_asset`)과 5.1 자산(`asset_document`)의 구분 기준 필요
  - 법인 명의 부동산/자동차 → `corp_asset`
  - 개인 명의 부동산/자동차 → `asset_document`

### 하위 호환성
- 프론트엔드에 레거시 매핑 기간(1개월) 동안 현행 코드도 표시 가능하도록 처리
- DB 마이그레이션 후 현행 코드가 남아있지 않도록 검증 쿼리 실행
