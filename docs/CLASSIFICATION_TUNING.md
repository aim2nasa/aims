# 문서 분류 프롬프트 튜닝

## 데이터셋 정의

| 이름 | 출처 | 건수 | GT 기준 | 비고 |
|------|------|------|---------|------|
| **캐치업** | 캐치업코리아 (법인) | 387 | AI 추정 (Claude) | 자산/기타 카테고리 포함 |
| **마리치** | 마리치 외 다수 (개인+법인) | 177 | 설계사 직접 분류 | 자산/기타 0건 |
| **캐치업+마리치** | 합본 | 511 (GT) / 536 (DB) | 마리치 우선, 캐치업 보완 | R7부터 사용. GT 511건 (중복 제거), DB 536건 |

### 데이터셋 우선순위
- **마리치**(설계사 분류)와 **캐치업**(AI 추정)이 충돌 시 → 마리치 우선
- 캐치업은 마리치에 없는 카테고리(자산, 기타) 보완 용도

### 마리치 폴더 구조 → 타입 매핑

| 폴더 | 타입 |
|------|------|
| 1.1 보험증권 | policy |
| 1.2 보장분석 | coverage_analysis |
| 1.3 청약서 | application |
| 1.4 가입설계서 | plan_design |
| 1.5 Annual Report | annual_report |
| 1.6 변액 리포트 | variable_report |
| 1.7 기타 보험관련 서류 | insurance_etc |
| 2.1 진단서,소견서 | diagnosis |
| 2.2 진료비 영수증 | medical_receipt |
| 2.3 보험금 청구서 | claim_form |
| 2.4 위임장,동의서 | consent_delegation |
| 3.1 신분증 | id_card |
| 3.2 가족관계 서류 | family_cert |
| 3.3 기타 통장 및 개인서류 | personal_docs |
| 4.1 건강검진 결과 | health_checkup |
| 5.1 자산관련 서류 | asset_document |
| 5.2 상속,증여 관련 서류 | inheritance_gift |
| 6.1 기본서류 | corp_basic |
| 6.2 인사,노무 | hr_document |
| 6.3 세무 | corp_tax |
| 6.4 법인자산(부동산,자동차) | corp_asset |
| 6.5 기타 법률 서류 | legal_document |
| 7.1 일반문서 | general |
| 7.2 분류불가 | unclassifiable |
| 7.3 미지정 | unclassified |

---

## 버전별 정확도 이력

### 캐치업 387건 기준

| 버전 | 정확도 | 일치/총 | 주요 변경 |
|------|--------|---------|----------|
| Baseline | 44.7% | 173/387 | v3 프롬프트 (12개 타입) |
| R1 | 79.6% | 308/387 | v4 프롬프트 최초 적용 (22개 타입) |
| R2 | 86.6% | 335/387 | 법인 자동차/특허/설계서 규칙 강화 |
| R3 | 82.4% | 319/387 | 실험적 변경, reverted |
| R4 | 87.9% | 340/387 | 20개 핵심 규칙, 13개 혼동 주의 |
| R5 | 87.6% | 339/387 | R4 미세 조정 (6 API errors) |
| R6 | 91.5% | 354/387 | 27개 핵심 규칙, 17개 혼동 주의 |

### 캐치업+마리치 합본 기준 (536건 분류 → 511건 GT 매칭 평가)

| 버전 | 정확도 | 일치/총 | 비고 |
|------|--------|---------|------|
| R6 베이스라인 | 76.5% | 410/536 | 오분류 126건. 캐치업 74.3% (249/335), 마리치 80.1% (161/201, 중복매칭 포함). GT v5 단독 76.5% (296/387) |
| R7 | - | - | 예정 |

---

## R6 합본 베이스라인 분석 (76.5%, 오분류 126건)

> 캐치업 단독 91.5%에서 합본 76.5%로 하락.
>
> **중요 발견**: 같은 GT v5 (387건) 기준으로도 91.5% → 76.5% (296/387)로 하락.
> 원인은 두 가지 (Alex+Gini 교차 검증):
>
> 1. **텍스트 추출 라이브러리 차이** (~20건): 91.5% 테스트는 로컬 pdfplumber 파싱,
>    실전은 DB 저장 텍스트(PyMuPDF/fitz 추출). 같은 PDF에서 추출 결과가 다를 수 있음.
> 2. **프롬프트 unclassifiable 과다** (~38건): 텍스트가 충분한데도 프롬프트가 분류를 포기.
>    meta.full_text에 내용이 있는 문서(결근계, 퇴직금 영수증, 잔고증명서 등)도 unclassifiable 판정.
>
> 즉 **91.5%는 이상적 조건(pdfplumber), 76.5%가 실전 정확도(PyMuPDF/DB)**에 가깝다.

### 문제 1: unclassifiable 과다 — 63건 (오분류의 50%)

**텍스트가 있는데도 unclassifiable로 판단하는 프롬프트 문제.**
파일 확장자로 텍스트 유무를 판단하면 안 됨 — 오직 `meta.full_text`, `ocr.full_text` 필드로만 판단.

| text_source | 건수 | 주요 실제 유형 |
|-------------|------|---------------|
| **meta** (텍스트 있음) | 29건 | hr_document:16, corp_tax:4, legal_document:3, general:3 |
| **unknown** (캐치업, 텍스트 있었을 가능성 높음) | 29건 | personal_docs:5, id_card:5, corp_basic:4, medical_receipt:3 |
| **filename** (진짜 텍스트 없음) | 5건 | legal_document:2, corp_tax:1 등 |

→ 최소 58건은 텍스트가 있는데 프롬프트가 분류를 포기한 것
>
> **참고**: Predicted에 filename 중복 37건 존재 (캐치업/마리치 고객 양쪽에 같은 파일 업로드).
> 평가 시 같은 GT 항목에 2번 매칭되어 마리치 평가 건수가 176→201로 부풀려짐.

### 문제 2: 유형 간 혼동 — 63건

| 혼동 패턴 | 건수 | 비고 |
|-----------|------|------|
| coverage_analysis → insurance_etc | 8 | 보장분석을 기타보험으로 오인 |
| corp_tax → insurance_etc | 5 | 세무서류를 보험으로 오인 |
| insurance_etc → corp_basic | 4 | 보험기타를 법인기본으로 오인 |
| medical_receipt → diagnosis | 3 | 영수증/진단서 혼동 |
| corp_basic → personal_docs | 3 | 법인서류를 개인서류로 오인 |
| application → corp_asset | 3 | 청약서를 법인자산으로 오인 |

### 유형별 정확도 (위험 구간: 80% 미만)

| 유형 | 정확/전체 | 정확도 |
|------|-----------|--------|
| annual_report | 0/1 | 0.0% |
| general | 0/7 | 0.0% |
| legal_document | 1/6 | 16.7% |
| coverage_analysis | 6/15 | 40.0% |
| personal_docs | 6/11 | 54.5% |
| family_cert | 3/5 | 60.0% |
| id_card | 14/22 | 63.6% |
| corp_tax | 25/38 | 65.8% |
| corp_basic | 38/51 | 74.5% |
| insurance_etc | 30/39 | 76.9% |

---

## 튜닝 전략

### 적용 중
- **Edge Case 규칙**: 혼동되는 타입 쌍별로 구체적 판단 기준 명시
- **혼동 주의 섹션**: 자주 오분류되는 패턴을 프롬프트에 직접 기술

### R6 캐치업 단독 불일치 (33건, 참고)
- `plan_design → policy/application` 5건: 운전자보험 설계서 혼동 지속
- `→ unclassifiable` 7건: 텍스트 있으나 프롬프트가 분류 포기
- `corp_basic → 기타` 3건: 법인 통장/서류 혼동
- `corp_tax ↔ insurance_etc` 2건: 재산현황 혼동

### 향후 고려
- Few-Shot: 토큰 비용 증가 우려로 보류
- Chain-of-Thought: GPT-4o-mini 성능 한계로 보류
- 모델 업그레이드 (GPT-4o): 비용 대비 효과 검토 필요

---

## 테스트 환경

- 모델: `gpt-4o-mini` (temperature=0, max_tokens=600, response_format=json_object)
- 텍스트 소스: `meta.full_text` → `ocr.full_text` → filename (우선순위)
- 텍스트 최대 길이: 10,000자 truncate
- 고객 컨텍스트: 현재 미주입 (향후 R7에서 검토)
- 테스트 스크립트:
  - 로컬 파일 분류: `tools/classification_tuner/extract_and_classify.py` (pdfplumber 사용, 91.5% 달성)
  - DB 기반 재분류: `tools/classification_tuner/reclassify_from_db.py` (DB 텍스트 사용, 실전 조건)
  - 평가: `tools/classification_tuner/evaluate.py`
- Ground Truth: `tests/classification/ground_truth_v5.json` (캐치업), `ground_truth_marichi.json` (마리치), `ground_truth_combined_v1.json` (합본 511건)

---

## 샘플 데이터 경로

| 데이터셋 | 로컬 경로 | 비고 |
|----------|----------|------|
| **캐치업** | `D:\Users\rossi\Documents\AIMS\sample\캐치업코리아` | 446건 (중복 포함), DB 기준 387건 |
| **마리치** | `D:\Users\rossi\Documents\AIMS\sample\마리치` | 177건, 폴더 구조 = 타입 |
