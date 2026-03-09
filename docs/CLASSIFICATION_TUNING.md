# 문서 분류 프롬프트 튜닝

## 데이터셋 정의

| 이름 | 출처 | 건수 | GT 기준 | 비고 |
|------|------|------|---------|------|
| **마리치** | 마리치 외 다수 (개인+법인) | 177 | 설계사 직접 분류 | **유일한 인간 GT**, v4 폴더 구조 1:1 대응 |
| **캐치업** | 캐치업코리아 (법인) | 445 (유니크 ~386) | AI 추정 (Claude) | GT 신뢰도 낮음 — 보조 참고용만 |

### GT 신뢰도
- **마리치**: 설계사가 직접 폴더로 분류 → 높은 신뢰도
- **캐치업**: AI(Claude)가 분류 → 낮은 신뢰도 ("시험지를 본인이 채점")
- **R8부터 마리치 GT만 사용** (캐치업 GT 기준 평가 중단)

### 마리치 데이터 분포 (177건)

| 파일 형식 | 건수 | 텍스트 추출 | 비고 |
|----------|------|-----------|------|
| PDF (텍스트 있음) | 72 | ✅ 가능 | 프롬프트 평가 대상 |
| PDF (스캔 이미지) | 24 | ❌ 불가 | unclassifiable (OCR 필요) |
| JPG/PNG/JPEG | 56 | ❌ 불가 | 이미지 파일 |
| HWP | 18 | ❌ 불가 | 한글 문서 |
| XLSX | 7 | ❌ 불가 | 엑셀 파일 |

> 텍스트 추출 가능: 72/177 = 41%. 프롬프트 튜닝으로 개선 가능한 범위는 이 72건.

### 마리치 GT 유형별 분포 (163건, 시스템 타입 제외)

| 유형 | 건수 | | 유형 | 건수 |
|------|------|-|------|------|
| corp_asset | 22 | | personal_docs | 6 |
| hr_document | 16 | | diagnosis | 6 |
| consent_delegation | 13 | | claim_form | 6 |
| id_card | 13 | | plan_design | 5 |
| policy | 12 | | family_cert | 3 |
| coverage_analysis | 12 | | health_checkup | 3 |
| application | 11 | | legal_document | 1 |
| corp_basic | 10 | | | |
| corp_tax | 10 | | | |
| medical_receipt | 8 | | | |
| insurance_etc | 6 | | | |

### 마리치 폴더 구조 → v4 타입 매핑

| 폴더 | 타입 |
|------|------|
| 1.1 보험증권 | policy |
| 1.2 보장분석 | coverage_analysis |
| 1.3 청약서 | application |
| 1.4 가입설계서 | plan_design |
| 1.5 Annual Report | annual_report (시스템) |
| 1.6 변액 리포트 | customer_review (시스템) |
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
| 7.3 미지정 | unspecified (시스템) |

---

## 버전별 정확도 이력

### 마리치 기준

| 버전 | 정확도 | 일치/총 | 평가 대상 | 주요 변경 |
|------|--------|---------|----------|----------|
| M1 | 55.6% | 40/72 | 로컬 PDF (텍스트 추출 가능 72건) | R6 프롬프트, pypdfium2 텍스트 추출. 이미지/HWP/XLSX 미처리 |
| M2 | - | - | DB 업로드 후 전체 177건 | 예정 (AIMS 파이프라인 업로드 → OCR 포함) |

### M1 오분류 분석 (32건)

#### 패턴 1: 스캔 PDF → diagnosis (0.85) — 14건 (최대 문제)
텍스트를 추출했으나 내용이 부실한 PDF가 일괄 `diagnosis`로 분류.

| 실제 유형 | 건수 | 예시 |
|----------|------|------|
| policy | 2 | 마리치(박병호)증권, 이방이력(ING) |
| id_card | 2 | 송연(이방)신분증, 이방_신분증 |
| corp_basic | 2 | 캐치업코리아매뉴얼, 캐치업코리아사업자등록증주주명부 |
| hr_document | 1 | 근로재계약서 2024.4.1 |
| consent_delegation | 1 | 이방동의서위임서류 |
| family_cert | 1 | 송연등 |
| personal_docs | 1 | 통장사본(일일공팔) |
| health_checkup | 1 | 안영미건강검진결과(20230811) |
| insurance_etc | 2 | 계약내용변경신청서, 송연진료비내역 |
| claim_form | 1 | 이방보험금분류청구서류(현대생명) |

#### 패턴 2: coverage_analysis → insurance_etc — 5건
보장분석 문서를 보험기타로 오인. "보장분석" 키워드가 있어도 insurance_etc로 분류.

#### 패턴 3: corp_asset ↔ policy — 6건
법인 자동차보험 가입증/증권을 policy로, 일반 증권을 corp_asset으로 혼동.

#### 패턴 4: application → corp_asset — 2건
법인 자동차 관련 청약서를 corp_asset으로 오인.

#### 패턴 5: corp_tax → insurance_etc — 2건
손비처리 납입증명서를 보험기타로 오인.

#### 패턴 6: 기타 — 3건
- plan_design → insurance_etc (1)
- corp_asset → insurance_etc (2): 건물가액평가, 담보삭제요청서

### 유형별 정확도

| 유형 | 정확/전체 | 정확도 |
|------|-----------|--------|
| legal_document | 1/1 | 100.0% |
| hr_document | 6/7 | 85.7% |
| plan_design | 4/5 | 80.0% |
| corp_tax | 4/6 | 66.7% |
| corp_asset | 9/15 | 60.0% |
| policy | 6/10 | 60.0% |
| coverage_analysis | 5/10 | 50.0% |
| corp_basic | 2/4 | 50.0% |
| application | 2/4 | 50.0% |
| insurance_etc | 1/4 | 25.0% |
| consent_delegation | 0/1 | 0.0% |
| id_card | 0/2 | 0.0% |
| family_cert | 0/1 | 0.0% |
| personal_docs | 0/1 | 0.0% |
| health_checkup | 0/1 | 0.0% |

---

## 과거 이력 (캐치업 AI GT 기준 — 참고만)

> **주의**: 아래 수치는 AI가 만든 GT 기준이므로 실제 정확도와 다를 수 있음.

| 버전 | 정확도 | 일치/총 | 주요 변경 |
|------|--------|---------|----------|
| Baseline | 44.7% | 173/387 | v3 프롬프트 (12개 타입) |
| R1 | 79.6% | 308/387 | v4 프롬프트 최초 적용 (22개 타입) |
| R2 | 86.6% | 335/387 | 법인 자동차/특허/설계서 규칙 강화 |
| R3 | 82.4% | 319/387 | 실험적 변경, reverted |
| R4 | 87.9% | 340/387 | 20개 핵심 규칙, 13개 혼동 주의 |
| R5 | 87.6% | 339/387 | R4 미세 조정 (6 API errors) |
| R6 | 91.5% | 354/387 | 27개 핵심 규칙, 17개 혼동 주의 |
| R7 | - | - | 폐기 (합본 기준 시도, 규칙 과다로 퇴보) |

---

## 튜닝 전략

### M2 방향 (예정)
1. **diagnosis (0.85) 버그 수정**: 텍스트 부실 PDF가 일괄 diagnosis로 분류되는 문제 해결
2. **coverage_analysis vs insurance_etc**: 보장분석 구분 강화
3. **corp_asset vs policy**: 법인 자동차보험 구분 명확화
4. **규칙 과다 금지**: R7 교훈 — gpt-4o-mini는 규칙이 많으면 오히려 퇴보

### 참고
- v2.5 프롬프트 (42타입, 98.3%): 구조와 접근법 참고 (커밋 `041735e3`)
- v4 분류 체계는 FIXED — `docs/TAXONOMY_V4_MIGRATION.md`

---

## 테스트 환경

- 모델: `gpt-4o-mini` (temperature=0, max_tokens=600, response_format=json_object)
- 텍스트 추출: pypdfium2 (프로덕션 동일)
- 텍스트 최대 길이: 10,000자 truncate
- 테스트 스크립트:
  - 로컬 파일 분류: `tools/classification_tuner/extract_and_classify.py`
  - DB 기반 재분류: `tools/classification_tuner/reclassify_from_db.py`
  - 평가: `tools/classification_tuner/evaluate.py`
- Ground Truth: `tests/classification/ground_truth_marichi_v4.json` (마리치 163건, 시스템 타입 제외)

---

## 샘플 데이터 경로

| 데이터셋 | 로컬 경로 | 비고 |
|----------|----------|------|
| **마리치** | `D:\Users\rossi\Documents\AIMS\sample\마리치` | 177건, 폴더 구조 = 타입 |
| **캐치업** | `D:\Users\rossi\Documents\AIMS\sample\캐치업코리아` | 445건 (유니크 ~386건), 보조 참고용 |
