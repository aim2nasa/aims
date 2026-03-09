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
| M3 | 82.9% | 131/158 | M2 동일 158건 재분류 | 프롬프트 튜닝: 파일명 우선 분류, unclassifiable 기준 강화. M2 대비 +5.7%p |
| M4 | 86.7% | 137/158 | M3 동일 158건 재분류 | 규칙5 우선순위, 청약서→application, 개인용 자동차→policy. M3 대비 +3.2%p |
| M5b | 87.3% | 138/158 | M4 동일 158건 재분류 | 파일명+별칭(displayName) 프롬프트 전달. 본문 우선 규칙 추가. M4 대비 +0.6%p |
| **M6** | **91.8%** | **145/158** | **M5b 동일 158건 재분류** | **별칭 기반 분류를 별도 규칙(★규칙7)으로 분리. M5b 대비 +4.5%p. 프롬프트 튜닝 최종** |

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

### M4 결과 (86.7%, +3.2%p from M3)

#### 변경 내용
- **규칙 2/14**: 법인 자동차 청약서 → application (GT 기준). 개인용/"KB개인용" 가입증 → policy
- **규칙 5/6**: coverage_analysis가 insurance_etc보다 우선 (★표시). "사전조회" 키워드 추가
- **규칙 20**: "경비처리세무사제출/손금산입" → corp_tax 강화
- **소분류 정의**: application에 법인자동차 청약서 포함, corp_asset에서 청약서 제거 + 건물가액평가/담보삭제 추가
- **혼동 주의**: 보장분석 보고서 내 "보험가입현황" 있어도 coverage_analysis 명시

#### 개선 항목
| 변화 | M3 → M4 | 개선건수 |
|------|---------|---------|
| coverage_analysis | 6/12 (50%) → 11/12 (92%) | +5건 |
| application | 9/11 (82%) → 11/11 (100%) | +2건 |

#### 잔존 오분류 (21건)
- corp_tax → insurance_etc: 3건 (경비처리/손비처리/납입증명서)
- corp_asset → policy: 3건 (개인용 자동차 가입증, 법인 맥락 부재)
- unclassifiable: 4건 (**OCR 실패가 아님! 아래 M5 참조**)
- corp_asset → insurance_etc: 2건 (건물가액평가/담보삭제)
- 기타 산발: 9건

### M5 방향 (M4 기반)

#### ★ 핵심 발견: unclassifiable 4건은 OCR 실패가 아니다! (2026-03-09)

**근본 원인**: `ocr_worker.py:199`에서 `summarize_text(ocr_result["full_text"])`로 **OCR 텍스트만** 분류기에 전달.
`originalName`도 `displayName`(AI 생성 별칭)도 전달하지 않음. 따라서 OCR 텍스트가 깨져있으면 판단 근거 부족 → unclassifiable.

**실제 확인 결과**: 4건 모두 분류 가능한 정보가 충분함!

| # | 원본 파일명 | displayName (AI 생성) | full_text 핵심 내용 | GT |
|---|-----------|----------------------|-------------------|-----|
| 1 | 20221012_154240.jpg | 인천 체류기간 및 국내거소 정보 | 일련번호, 체류기간, 국내거소, 부평동 주소 | id_card |
| 2 | 20230925_174445.jpg | 부천시와 고양시 주민등록 정보 | OCR 깨짐 있으나 displayName으로 명확 | id_card |
| 3 | 마리치 법인카드.jpeg | 신한카드 하리시 법인 카드 정보 | HARICI, CORP, ShinhanCard, Corporate, VISA | personal_docs |
| 4 | 20231125_110227.jpg | 신한카드 사용 안내 및 상담 정보 | 신한은행, 신한카드, 체크카드, CVC, VALID | personal_docs |

**수정 방향**: 분류 시 `originalName` + `displayName` + `full_text`를 모두 프롬프트 텍스트에 포함
- `ocr_worker.py`: OCR 완료 후 summarize_text 호출 시 파일명/displayName 합성
- `doc_prep_main.py`: 텍스트 추출 후 summarize_text 호출 시 동일 적용
- `openai_service.py`: `summarize_text()`에 filename 파라미터 추가

**원칙**: 분류 불가 판정 전에 full_text + displayName + originalName 모두 활용해야 함!

#### 기타 개선 항목
1. **corp_tax → insurance_etc** (3건): 경비처리/손비처리 문서의 세무 키워드 매칭 강화
2. **corp_asset ↔ policy** (3건): 법인 고객 맥락 없이는 개선 어려움 (한계)
3. **프롬프트 한글화 실험 실패**: gpt-4o-mini에서 유형명 한글화 시 퇴보 확인 (77.2%)

### M5b 결과 (87.3%, +0.6%p from M4)

#### 변경 내용
- **파이프라인**: `ocr_worker.py`, `doc_prep_main.py`에서 `summarize_text()`에 `filename` 파라미터 전달
- **Redis 메시지**: `original_name` 필드 추가 (`redis_service.add_to_stream()`)
- **프롬프트**: `{file_info}` 섹션 추가 — `[문서 메타정보]` + `[본문]` 분리, "본문 우선" 규칙
- **규칙 1**: "본문 텍스트가 충분하면 본문 내용이 최우선, 파일명/별칭은 보조 참고"
- **규칙 7**: "별칭에 주민등록/체류기간 → id_card, 카드/통장 → personal_docs"

#### 개선 한계
- M5a (파일명 무조건 우선) → 84.8% (회귀 발생). plan_design이 1/5로 급락
- M5b (본문 우선 + 파일명 보조) → 87.3%로 복구. 하지만 id_card/personal_docs 미해결

### M6 결과 (91.8%, +4.5%p from M5b) — 프롬프트 튜닝 최종

#### 변경 내용
- **규칙 7을 분리**: 별칭 기반 분류를 ★별도 규칙으로 독립 (모델 주목도 향상)
  - "체류기간/국내거소/주민등록/여권/외국인등록/운전면허" → id_card
  - "카드 정보/통장/은행" → personal_docs
  - "진단/소견" → diagnosis, "청구서" → claim_form, "증권/보험증" → policy
- **시스템 프롬프트**: 별칭 기반 분류 예시 추가 ("체류기간 정보→id_card, 카드 정보→personal_docs")
- **규칙 번호 재정렬**: 7(별칭) → 8(unclassifiable) → 9~28

#### 개선 항목 (회귀 0건)
| 유형 | M5b → M6 | 개선건수 |
|------|----------|---------|
| id_card | 84.6% (11/13) → 100% (13/13) | +2건 |
| personal_docs | 66.7% (4/6) → 100% (6/6) | +2건 |
| diagnosis | 83.3% (5/6) → 100% (6/6) | +1건 |
| policy | 91.7% (11/12) → 100% (12/12) | +1건 |
| general 발생 | 2건 → 0건 | +1건 |

#### 잔존 오분류 (13건)
- **corp_asset (7건)**: policy(3), asset_document(1), id_card(1), application(1), insurance_etc(1) — 고객 컨텍스트(법인/개인) 없이 구조적 한계
- **plan_design (2건)**: policy(1), insurance_etc(1) — "운전자보험"→policy 혼동, "단독실비"→insurance_etc 혼동
- **insurance_etc (2건)**: corp_tax(1), claim_form(1) — "손비처리"↔corp_tax, "해지서류"→claim_form 혼동
- **medical_receipt (1건)**: claim_form 혼동 — "보험금 청구 절차" 제목이 claim_form으로 유인
- **corp_tax (1건)**: corp_asset으로 오분류 — "경비처리세무사제출" xlsx

#### 프롬프트 튜닝 종료 사유
1. 91.8%는 목표(89~90%)를 초과
2. 잔존 13건 중 7건은 구조적 한계 (프롬프트로 해결 불가)
3. 나머지 6건은 1건짜리 edge case (규칙 추가 = 오버피팅)
4. M6 변경으로 회귀 0건 — 깨끗한 마무리

#### 향후 개선 방향 (구조적 변경 필요)
- 법인/개인 고객 컨텍스트를 분류기에 전달 → corp_asset↔policy 근본 해결
- 2단계 분류 (대분류→세분류) 또는 Few-shot 예시 추가
- gpt-4o 업그레이드 (비용 10배, 정확도 상승 예상)

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
