# 문서 분류 프롬프트 튜닝

## 데이터셋 정의

| 이름 | 출처 | 건수 | GT 기준 | 비고 |
|------|------|------|---------|------|
| **캐치업** | 캐치업코리아 (법인) | 387 | AI 추정 (Claude) | 자산/기타 카테고리 포함 |
| **마리치** | 마리치 외 다수 (개인+법인) | 177 | 설계사 직접 분류 | 자산/기타 0건 |
| **캐치업+마리치** | 합본 | 564 | 마리치 우선, 캐치업 보완 | R7부터 사용 |

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

### 캐치업+마리치 564건 기준

| 버전 | 정확도 | 일치/총 | 비고 |
|------|--------|---------|------|
| R7 | - | -/564 | 예정 |

---

## 튜닝 전략

### 적용 중
- **Edge Case 규칙**: 혼동되는 타입 쌍별로 구체적 판단 기준 명시
- **혼동 주의 섹션**: 자주 오분류되는 패턴을 프롬프트에 직접 기술

### R6 불일치 주요 패턴 (33건)
- `plan_design → policy/application` 5건: 운전자보험 설계서 혼동 지속
- `→ unclassifiable` 7건: OCR 품질 낮은 이미지
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
- 고객 컨텍스트: `[고객: 법인/개인(고객명)]` + `[파일명: xxx]` 주입
- 테스트 스크립트: `tests/classification/test_v4_classification.py`
- Ground Truth: `tests/classification/ground_truth_v5.json` (캐치업), `ground_truth_marichi.json` (마리치, 예정)

---

## 샘플 데이터 경로

| 데이터셋 | 로컬 경로 | 비고 |
|----------|----------|------|
| **캐치업** | `D:\Users\rossi\Documents\AIMS\sample\캐치업코리아` | 446건 (중복 포함), DB 기준 387건 |
| **마리치** | `D:\Users\rossi\Documents\AIMS\sample\마리치` | 177건, 폴더 구조 = 타입 |
