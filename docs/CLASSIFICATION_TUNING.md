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
| M2 | 77.2% | 122/158 | AIMS 파이프라인 업로드 172건 (GT 매칭 158건) | R6 프롬프트, OCR 포함. M1 대비 +21.6%p |
| **M3** | **82.9%** | **131/158** | **M2 동일 158건 재분류** | **프롬프트 튜닝: 파일명 우선 분류, unclassifiable 기준 강화. M2 대비 +5.7%p** |

### M2 오분류 분석 (36건)

#### 패턴 1: coverage_analysis → insurance_etc — 7건 (최대 문제)
보장분석 문서를 보험기타로 오인. confidence=0인 경우가 5건 (텍스트 부실).

#### 패턴 2: → unclassifiable — 12건
OCR 인식 실패 또는 텍스트 부족으로 분류 불가 판정.

| 실제 유형 | 건수 | 예시 |
|----------|------|------|
| id_card | 4 | 날짜형 파일명 사진들 (20221012, 20230503 등) |
| personal_docs | 3 | 법인카드, 통장사본, 날짜형 사진 |
| hr_document | 2 | 사업주가 알아야 할 사항, 별첨 사직서 |
| insurance_etc | 1 | 직원상해해지서류 |
| family_cert | 1 | 송연등본.pdf |
| medical_receipt | 1 | 서류207.jpg |

#### 패턴 3: corp_asset ↔ policy — 5건
법인 자동차보험 가입증을 policy로, 일반 가입증을 corp_asset으로 혼동.

#### 패턴 4: corp_tax → insurance_etc — 3건
손비처리 납입증명서, 경비처리 문서를 보험기타 또는 법인자산으로 오인.

#### 패턴 5: application → corp_asset — 2건
법인 관련 청약서를 corp_asset으로 오인.

#### 패턴 6: 기타 — 7건
- plan_design → insurance_etc (1): 현대화재 설계서
- medical_receipt → claim_form (1): 이방 병원비서류
- corp_tax → corp_asset (1): 경비처리 엑셀
- coverage_analysis → insurance_etc (2): 보험조회 PNG
- health_checkup → general (1): 안영미 건강검진

### M2 유형별 정확도

| 유형 | 정확/전체 | 정확도 | | 유형 | 정확/전체 | 정확도 |
|------|-----------|--------|-|------|-----------|--------|
| claim_form | 6/6 | 100.0% | | application | 9/11 | 81.8% |
| consent_delegation | 13/13 | 100.0% | | insurance_etc | 4/5 | 80.0% |
| corp_basic | 10/10 | 100.0% | | plan_design | 4/5 | 80.0% |
| diagnosis | 6/6 | 100.0% | | medical_receipt | 6/8 | 75.0% |
| legal_document | 1/1 | 100.0% | | id_card | 9/13 | 69.2% |
| hr_document | 14/16 | 87.5% | | corp_asset | 13/19 | 68.4% |
| policy | 10/12 | 83.3% | | family_cert | 2/3 | 66.7% |
| | | | | health_checkup | 2/3 | 66.7% |
| | | | | corp_tax | 5/9 | 55.6% |
| | | | | personal_docs | 3/6 | 50.0% |
| | | | | coverage_analysis | 5/12 | 41.7% |

### M1 vs M2 비교

| 항목 | M1 | M2 | 변화 |
|------|-----|-----|------|
| 정확도 | 55.6% | 77.2% | +21.6%p |
| 평가 건수 | 72 | 158 | +86 (+119%) |
| diagnosis 버그 | 14건 일괄 오분류 | 6/6 정확 | OCR로 해결 |
| consent_delegation | 0/1 (0%) | 13/13 (100%) | HWP 변환으로 해결 |
| corp_basic | 2/4 (50%) | 10/10 (100%) | OCR/변환으로 해결 |
| coverage_analysis | 5/10 (50%) | 5/12 (41.7%) | 여전히 최대 약점 |

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

### M3 결과 (82.9%, +5.7%p from M2)

#### 변경 내용
- **시스템 프롬프트**: "텍스트 부실해도 파일명 추론 가능하면 해당 유형으로 분류" + "unclassifiable은 텍스트도 없고 파일명도 추론 불가할 때만"
- **규칙 1**: 파일명을 "최우선 분류 근거"로 격상
- **규칙 5**: "보험조회" 키워드 추가 + 파일명 기반 coverage_analysis 강제
- **규칙 7**: unclassifiable 기준 대폭 강화 — "날짜/숫자만인 경우에만" + 유형 단서 키워드 나열
- **규칙 21**: 파일명→유형 매핑 확장 (사직서→hr_document, 통장/카드→personal_docs, 등본→family_cert, 손비처리→corp_tax)

#### 개선 항목
| 변화 | M2 → M3 | 개선건수 |
|------|---------|---------|
| unclassifiable 감소 | 12건 → 3건 | +9건 정분류 |
| coverage_analysis 개선 | 5/12 (41.7%) → 7/12 (58.3%) | +2건 |
| corp_tax 개선 | 5/9 (55.6%) → 7/9 (77.8%) | +2건 |

#### 잔존 오분류 (27건)
- coverage_analysis → insurance_etc: 5건 (여전히 최대 약점)
- corp_asset ↔ policy: 5건 (법인 자동차보험 혼동)
- corp_tax → insurance_etc/corp_asset: 2건
- application → corp_asset: 2건
- 기타 산발: 13건

### M4 방향 (M3 기반)
1. **coverage_analysis ↔ insurance_etc** (5건): 보장분석 vs 보험기타 구분 — confidence 0 (텍스트 부실) 케이스 해결 필요
2. **corp_asset ↔ policy** (5건): 법인 자동차보험 가입증/증권 구분
3. **corp_tax 잔여** (2건): 경비처리/손비처리 문서
4. **규칙 수 유지**: 27개 규칙 이하 유지 (R7 교훈)

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
