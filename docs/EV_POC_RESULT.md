# EV (Evidence Verification) PoC 결과 보고서

**작성일**: 2026-03-27
**작성자**: Alex (AI Software Architect)
**데이터**: AIMS files 컬렉션 (mongodb://127.0.0.1:27017/docupload)

---

## 1. PoC 설계안 (방법론)

### 1.1 목적
DB에 실제 저장된 문서 데이터를 바탕으로, AI가 생성한 분류(document_type)와 별칭(displayName)이
충분한 근거를 바탕으로 생성되었는지를 객관적으로 판별하는 EV 체계의 실효성을 검증합니다.

### 1.2 대상
- **전체 문서**: 2677건 (overallStatus=completed, displayName 존재)
- **고객 수**: 1144명

### 1.3 EV 점수 계산 방법

**Layer 1 -- 입력 품질 (Input Quality)**
| 등급 | 조건 |
|------|------|
| none | 0자 |
| critical | 1~9자 |
| low | 10~49자 |
| medium | 50~199자 |
| high | 200자 이상 |

**Layer 3 -- 출력 근거성 (Grounding Score)**
- displayName에서 확장자 제거 후 토큰화 (공백/특수문자 기준)
- 3자 이상 토큰만 검증 대상
- 각 토큰이 full_text에 부분 문자열로 존재하는지 확인 (대소문자 무시)
- grounding_score = 매칭 토큰 수 / 전체 검증 대상 토큰 수

**통합 등급 판정**
```
if text_length == 0:                              → SUSPECT
elif grounding_score < 0.3:                        → SUSPECT
elif text_length < 50:                             → LOW
elif text_length >= 200 and grounding_score >= 0.7: → HIGH
else:                                              → MEDIUM
```

---

## 2. 전체 결과 수치

| 지표 | 값 |
|------|-----|
| 분석 대상 문서 | 2677건 |
| 고객 수 | 1144명 |
| 텍스트 보유율 | 100.0% |
| 평균 텍스트 길이 | 6566자 |
| 평균 grounding_score | 0.871 |

---

## 3. 등급별 분포

### 3.1 EV 등급 분포

| 등급 | 건수 | 비율 |
|------|------|------|
| HIGH | 2255건 | 84.2% ██████████████████████████████████████████ |
| MEDIUM | 299건 | 11.2% █████ |
| LOW | 5건 | 0.2%  |
| SUSPECT | 118건 | 4.4% ██ |

### 3.2 텍스트 품질 분포

| 등급 | 건수 | 비율 |
|------|------|------|
| none | 0건 | 0.0% |
| critical | 2건 | 0.1% |
| low | 14건 | 0.5% |
| medium | 72건 | 2.7% |
| high | 2589건 | 96.7% |

### 3.3 Grounding Score 분포 (텍스트 보유 문서)

| 범위 | 건수 | 비율 |
|------|------|------|
| [0.0, 0.1) | 102건 | 3.8% |
| [0.1, 0.3) | 16건 | 0.6% |
| [0.3, 0.5) | 56건 | 2.1% |
| [0.5, 0.7) | 217건 | 8.1% |
| [0.7, 0.9) | 625건 | 23.3% |
| [0.9, 1.0] | 1661건 | 62.0% |

**핵심 발견**: 전체 문서의 85.3%가 grounding score 0.7 이상으로, 대부분의 displayName이
실제 문서 내용에 근거하여 생성되었음을 확인합니다.

---

## 4. SUSPECT 패턴 분석

SUSPECT 판정 문서: **118건** (4.4%)

### 4.1 SUSPECT 원인 분류

| 원인 | 건수 | 비율 |
|------|------|------|
| 텍스트 없음 (text_length=0) | 0건 | 0.0% |
| 텍스트 있으나 grounding < 0.3 | 118건 | 100.0% |

- "텍스트 있으나 grounding 낮음" 그룹의 평균 grounding_score: **0.033**
- 평균 text_length: **3733자** (텍스트가 풍부함에도 근거성이 낮음)

### 4.2 SUSPECT의 document_type 분포

| document_type | SUSPECT | 전체 | SUSPECT 비율 |
|---------------|---------|------|--------------|
| unclassifiable | 13건 | 35건 | 37.1% |
| family_cert | 5건 | 14건 | 35.7% |
| hr_document | 26건 | 97건 | 26.8% |
| legal_document | 2건 | 8건 | 25.0% |
| diagnosis | 13건 | 56건 | 23.2% |
| personal_docs | 6건 | 28건 | 21.4% |
| corp_tax | 7건 | 39건 | 17.9% |
| plan_design | 10건 | 79건 | 12.7% |
| corp_asset | 5건 | 41건 | 12.2% |
| coverage_analysis | 4건 | 45건 | 8.9% |
| id_card | 4건 | 67건 | 6.0% |
| corp_basic | 2건 | 49건 | 4.1% |
| general | 10건 | 300건 | 3.3% |
| application | 2건 | 70건 | 2.9% |
| claim_form | 1건 | 42건 | 2.4% |
| policy | 3건 | 135건 | 2.2% |
| medical_receipt | 1건 | 104건 | 1.0% |
| insurance_etc | 4건 | 666건 | 0.6% |

**패턴 해석**:
- `hr_document` (인사서류): 26.8%로 가장 높은 SUSPECT 비율. 급여명세서, 재직증명서 등
  문서 특성상 OCR 텍스트와 AI가 생성한 별칭 간 어휘 불일치가 큼
- `diagnosis` (진단서): 23.2%. 의학 용어와 별칭의 간극
- `corp_tax` (법인세): 17.9%. 엑셀 기반 문서로 OCR 텍스트 품질 이슈
- `plan_design` (설계안): 12.7%. 보험 상품 설계서의 전문 용어 문제

---

## 5. 기존 confidence와의 비교

| EV 등급 | 건수 | 평균 confidence | 최소 | 최대 |
|---------|------|----------------|------|------|
| HIGH | 1481건 | 0.327 | 0.000 | 0.950 |
| MEDIUM | 294건 | 0.306 | 0.000 | 0.950 |
| LOW | 5건 | 0.180 | 0.000 | 0.900 |
| SUSPECT | 118건 | 0.430 | 0.000 | 0.950 |

**핵심 발견 -- 기존 confidence 체계의 맹점**:

SUSPECT 등급의 평균 confidence가 **0.430**으로, HIGH 등급(0.327)이나 MEDIUM 등급(0.306)보다
**오히려 더 높습니다**. 이는 기존 confidence가 "AI가 스스로 매긴 자신감"일 뿐,
실제 문서 내용과의 근거성(grounding)을 반영하지 못한다는 것을 의미합니다.

즉, AI가 "높은 확신"을 가지고 있어도 실제 문서 내용에 근거하지 않은 분류/별칭을
생성할 수 있으며, 이를 탐지하려면 EV와 같은 독립적 검증 체계가 필요합니다.

---

## 6. 샘플 데이터

### 6.1 SUSPECT 샘플 (20건)

**[1]**
- displayName: `신한카드 정보.jpeg`
- originalName: `마리치법인카드.jpeg`
- document_type: `personal_docs`
- text_length: 106자
- grounding_score: 0.000
- tokens: ['신한카드']
- matched: []
- confidence: 0.9

**[2]**
- displayName: `마리치청약서.pdf`
- originalName: `마리치청약서.pdf`
- document_type: `application`
- text_length: 8308자
- grounding_score: 0.000
- tokens: ['마리치청약서']
- matched: []
- confidence: 0.95

**[3]**
- displayName: `2023년경비처리세무사제출용.xlsx`
- originalName: `2023년경비처리세무사제출용(20240504).xlsx`
- document_type: `corp_tax`
- text_length: 1945자
- grounding_score: 0.000
- tokens: ['2023년경비처리세무사제출용']
- matched: []
- confidence: 0.9

**[4]**
- displayName: `2025년경비처리직원상해세무사제출용.xlsx`
- originalName: `2025년경비처리(직원상해)세무사제출용(20260313).xlsx`
- document_type: `corp_tax`
- text_length: 1095자
- grounding_score: 0.000
- tokens: ['2025년경비처리직원상해세무사제출용']
- matched: []
- confidence: 0.9

**[5]**
- displayName: `2025년경비처리화재자동차세무사제출용.xlsx`
- originalName: `2025년경비처리(화재,자동차)세무사제출용(20260313).xlsx`
- document_type: `corp_tax`
- text_length: 1395자
- grounding_score: 0.000
- tokens: ['2025년경비처리화재자동차세무사제출용']
- matched: []
- confidence: 0.9

**[6]**
- displayName: `마리치자동차납입1.pdf`
- originalName: `마리치(자동차)납입1.pdf`
- document_type: `corp_asset`
- text_length: 522자
- grounding_score: 0.000
- tokens: ['마리치자동차납입1']
- matched: []
- confidence: 0.95

**[7]**
- displayName: `이불님화재증권.pdf`
- originalName: `이불님화재증권(삼송105,성북로23길10,23길24,8길24).pdf`
- document_type: `policy`
- text_length: 28623자
- grounding_score: 0.000
- tokens: ['이불님화재증권']
- matched: []
- confidence: 0.95

**[8]**
- displayName: `단체상해보험제안서.pdf`
- originalName: `이불작가님-단체상해보험제안서-현대해상.pdf`
- document_type: `plan_design`
- text_length: 8724자
- grounding_score: 0.000
- tokens: ['단체상해보험제안서']
- matched: []
- confidence: 0.95

**[9]**
- displayName: `사업자등록증.jpg`
- originalName: `마리치사업자등록증.jpg`
- document_type: `corp_basic`
- text_length: 511자
- grounding_score: 0.000
- tokens: ['사업자등록증']
- matched: []
- confidence: 0.95

**[10]**
- displayName: `박현순마리치보장분석2026.pdf`
- originalName: `박현순(마리치)보장분석2026.pdf`
- document_type: `coverage_analysis`
- text_length: 7671자
- grounding_score: 0.000
- tokens: ['박현순마리치보장분석2026']
- matched: []
- confidence: 0.95

**[11]**
- displayName: `오나경보장분석.pdf`
- originalName: `오나경보장분석.pdf`
- document_type: `coverage_analysis`
- text_length: 5572자
- grounding_score: 0.000
- tokens: ['오나경보장분석']
- matched: []
- confidence: 0.95

**[12]**
- displayName: `이수진고객님제안서.pdf`
- originalName: `이수진고객님제안서.pdf`
- document_type: `plan_design`
- text_length: 29625자
- grounding_score: 0.000
- tokens: ['이수진고객님제안서']
- matched: []
- confidence: 0.95

**[13]**
- displayName: `진단서.jpg`
- originalName: `송연 병원비영수증1.jpg`
- document_type: `diagnosis`
- text_length: 877자
- grounding_score: 0.000
- tokens: ['진단서']
- matched: []
- confidence: 0.85

**[14]**
- displayName: `주민등록등본.jpg`
- originalName: `이경 주민등록등본.jpg`
- document_type: `family_cert`
- text_length: 997자
- grounding_score: 0.000
- tokens: ['주민등록등본']
- matched: []
- confidence: 0.95

**[15]**
- displayName: `이경신분증.pptx`
- originalName: `이경신분증.pptx`
- document_type: `id_card`
- text_length: 14자
- grounding_score: 0.000
- tokens: ['이경신분증']
- matched: []
- confidence: 0.9

**[16]**
- displayName: `주민등록등본.pdf`
- originalName: `송연등본.pdf`
- document_type: `family_cert`
- text_length: 851자
- grounding_score: 0.000
- tokens: ['주민등록등본']
- matched: []
- confidence: 0.9

**[17]**
- displayName: `송연 가족보험내역.xlsx`
- originalName: `송연 가족보험내역202509.xlsx`
- document_type: `insurance_etc`
- text_length: 3572자
- grounding_score: 0.000
- tokens: ['가족보험내역']
- matched: []
- confidence: 0.9

**[18]**
- displayName: `송연 가족보험내역.xlsx`
- originalName: `송연 가족보험내역.xlsx`
- document_type: `insurance_etc`
- text_length: 2941자
- grounding_score: 0.000
- tokens: ['가족보험내역']
- matched: []
- confidence: 0.9

**[19]**
- displayName: `송연 자동차사고 정리.xlsx`
- originalName: `송연 자동차사고 정리.xlsx`
- document_type: `claim_form`
- text_length: 2876자
- grounding_score: 0.000
- tokens: ['자동차사고']
- matched: []
- confidence: 0.9

**[20]**
- displayName: `송연 기념일 2023.10.txt`
- originalName: `송연기념일.txt`
- document_type: `unclassifiable`
- text_length: 42자
- grounding_score: 0.000
- tokens: ['기념일', '2023']
- matched: []
- confidence: 0.0

### 6.2 HIGH 샘플 (5건, grounding 상세)

**[1]**
- displayName: `류이화_AR_2026-02-20.pdf`
- originalName: `AR20260220_00038235_0003823520100610O00321.pdf`
- document_type: `insurance_etc`
- text_length: 5607자
- grounding_score: 1.000
- tokens: ['류이화', '2026']
- matched: ['류이화', '2026']
- unmatched: []

**[2]**
- displayName: `류창수_AR_2026-02-20.pdf`
- originalName: `AR20260220_00038235_0003823520100610O00174.pdf`
- document_type: `insurance_etc`
- text_length: 10830자
- grounding_score: 1.000
- tokens: ['류창수', '2026']
- matched: ['류창수', '2026']
- unmatched: []

**[3]**
- displayName: `류이화_AR_2026-02-27.pdf`
- originalName: `AR20260227_00038235_0003823520100610O00321.pdf`
- document_type: `insurance_etc`
- text_length: 5607자
- grounding_score: 1.000
- tokens: ['류이화', '2026']
- matched: ['류이화', '2026']
- unmatched: []

**[4]**
- displayName: `류창수_AR_2026-02-27.pdf`
- originalName: `AR20260227_00038235_0003823520100610O00174.pdf`
- document_type: `insurance_etc`
- text_length: 10830자
- grounding_score: 1.000
- tokens: ['류창수', '2026']
- matched: ['류창수', '2026']
- unmatched: []

**[5]**
- displayName: `류하정_AR_2026-02-20.pdf`
- originalName: `AR20260220_00038235_0003823520101006O00001.pdf`
- document_type: `insurance_etc`
- text_length: 7452자
- grounding_score: 1.000
- tokens: ['류하정', '2026']
- matched: ['류하정', '2026']
- unmatched: []

---

## 7. SUSPECT 심층 분석 -- 토큰 매칭 실패 원인

SUSPECT 중 토큰이 있는 문서: 117건

매칭 실패 고유 토큰 수: 112개

**매칭 실패 토큰 패턴**:

- 8자 이상 복합 토큰: 13개 (5%)
- 8자 미만 단순 토큰: 247개 (95%)

이는 토큰화 전략의 한계를 보여줍니다. 한글의 경우 공백/특수문자 기준 토큰화만으로는
복합 명사를 적절히 분리하지 못하며, "가입설계서", "보험분석서" 같은 토큰이
OCR 텍스트에서 "가입 설계서", "보험 분석서"처럼 띄어쓰기가 다르면 매칭에 실패합니다.

---

## 8. PoC에서 발견한 이슈/개선점

### 8.1 토큰화 전략 개선 필요
- **현재**: 공백/특수문자 기준 단순 분할 → 한글 복합 명사 분리 불가
- **개선안**: 3-gram 서브스트링 매칭 또는 형태소 분석기 도입
- **사례**: `마리치청약서` → 전체 매칭 실패, 하지만 `마리치`(3-gram) FOUND, `청약서`(3-gram) FOUND
- **n-gram(3) 시뮬레이션 결과**:

| 등급 | 기존 방식 | n-gram(3) 방식 | 변화 |
|------|----------|---------------|------|
| HIGH | 2,255건 (84.2%) | 2,331건 (87.1%) | +76건 |
| MEDIUM | 299건 (11.2%) | 246건 (9.2%) | -53건 |
| LOW | 5건 (0.2%) | 5건 (0.2%) | 0건 |
| SUSPECT | 118건 (4.4%) | 95건 (3.5%) | -23건 |

- n-gram 적용만으로 SUSPECT 19.5% 감소 (118→95건)
- 등급 전이: SUSPECT→MEDIUM 21건, SUSPECT→HIGH 2건, MEDIUM→HIGH 74건
- **잔여 SUSPECT 95건은 실제 근거 부족으로 판단** (true positive 가능성 높음)

### 8.2 엑셀(.xlsx) 문서의 텍스트 품질
- 엑셀 파일의 OCR/파싱 텍스트는 셀 구조가 파괴되어 연속 문자열로 추출됨
- 이로 인해 토큰 매칭이 어려워지는 경향

### 8.3 이미지 문서의 한계
- .jpg, .jpeg 등 이미지 문서는 OCR 품질에 따라 grounding이 크게 좌우됨
- OCR 정확도 자체가 낮으면 EV도 낮게 나올 수밖에 없음

### 8.4 기존 confidence의 무의미성 확인
- SUSPECT의 평균 confidence(0.430) > HIGH의 평균 confidence(0.327)
- confidence는 AI의 "자기 확신"일 뿐, 실제 근거성과 무관
- **EV가 confidence를 대체하거나 보완해야 함**

### 8.5 Layer 2 (분류 근거성) 미반영
- 이번 PoC는 Layer 1(입력 품질)과 Layer 3(출력 근거성)만 검증
- document_type이 실제 문서 내용과 맞는지(Layer 2)는 추후 구현 필요

---

## 9. 결론

### 9.1 EV 체계의 실효성

| 항목 | 평가 |
|------|------|
| 실효성 | **높음** -- 기존 confidence로 탐지 불가능한 문제를 식별 |
| SUSPECT 탐지율 | 4.4% (118건) -- 합리적 수준 |
| 오탐 가능성 | 있음 -- 토큰화 한계로 인한 false positive 예상 |
| 구현 난이도 | 낮음 -- 단순 문자열 매칭 기반 |

### 9.2 핵심 발견

1. **전체 문서의 84.2%가 HIGH 등급** -- AI 분류/별칭 생성의 전반적 품질은 양호
2. **SUSPECT 118건 전부가 "텍스트 있으나 grounding 낮음"** -- 텍스트 부재가 아닌 근거성 부족이 주 문제
3. **기존 confidence는 근거성을 반영하지 못함** -- EV가 독립적 가치를 가짐
4. **토큰화 전략 개선 시 정확도 향상 여지 큼** -- 한글 형태소 분석 도입 권장

### 9.3 권장 사항

1. **EV 체계 본 구현 진행 권장** -- PoC에서 실효성이 확인됨
2. **토큰화 개선 우선** -- n-gram 또는 형태소 분석기로 false positive 감소
3. **Layer 2 (분류 근거성) 추가** -- document_type 검증으로 체계 완성
4. **EV 등급을 UI에 표시** -- 사용자가 의심 문서를 직접 확인할 수 있도록
5. **confidence 필드 재정의** -- 기존 AI confidence → EV 기반 confidence로 전환 검토

---

## 부록: 등급별 grounding_score 평균

| EV 등급 | 평균 grounding_score |
|---------|---------------------|
| HIGH | 0.954 |
| MEDIUM | 0.583 |
| LOW | 0.600 |
| SUSPECT | 0.033 |

---

## 10. 에이전트 리뷰 및 최종 판정

> PoC 결과에 대해 5명의 전문 에이전트(Alex, Gini, Ari, Sora, Dana)가 리뷰를 수행했다.
> 핵심 질문: **"이 결과가 AI 분류/별칭의 근거를 판단하는 데 타당하게 도움이 되는가?"**

### 10.1 전원 합의: 조건부 Yes — 방향은 맞지만 도구가 안 맞다

EV라는 개념 자체의 필요성과, 기존 confidence의 무의미성은 데이터로 증명되었다.
그러나 **현재 토큰 매칭 방식의 precision이 ~15%** 수준으로, 근거 수준의 객관화에는 실패했다.

### 10.2 SUSPECT 오탐률 — 전원 공통 지적

| 에이전트 | 추정 오탐률 | 핵심 근거 |
|----------|:----------:|-----------|
| Alex | 80%+ | "대다수가 토큰화 실패로 인한 오탐" |
| Gini | 80% (16/20건) | 샘플 20건 개별 True/False Positive 판정 수행 |
| Ari | 55%+ | 실제 DB 텍스트와 교차 검증 — "마리치청약서" 텍스트에 "마리치"도 "청약서"도 존재 확인 |
| Sora | "20건 중 진짜 문제 2~3건" | 설계사 관점: "사업자등록증인데 뭐가 문제?" |
| Dana | precision 15~20% | "80% 오탐률의 경고는 경고가 없는 것보다 나쁘다" |

### 10.3 핵심 오탐 원인: 한국어 복합명사 토큰화 실패

현재 방법은 "근거성"이 아니라 **"토큰 분리 능력"을 측정**하고 있다.

| SUSPECT 샘플 | 토큰 | 실제 텍스트 검증 (Ari) |
|---|---|---|
| `마리치청약서` | 통째로 1토큰 → 매칭 실패 | "마리치" **있음**, "청약서" **있음** |
| `단체상해보험제안서` | 통째로 1토큰 → 매칭 실패 | "단체", "상해", "보험", "제안서" **전부 있음** |
| `사업자등록증` | 통째로 1토큰 → 매칭 실패 | 정부 서식 OCR 한계 |

근거가 있는 것도 없다고 판정하고 있으므로, **근거 수준의 객관화에 실패**했다.

### 10.4 HIGH 기준의 관대함 (Gini)

HIGH 샘플 5건 전부 토큰이 2개(`이름`, `2026`)뿐이고, `2026`은 거의 모든 문서에 존재.
토큰 2개 중 1개만 맞아도 사실상 HIGH가 되는 구조 — 기준이 관대하다.

### 10.5 진짜 문제 문서 (True Positive) 샘플

오탐 속에서도 진짜 문제 문서는 존재한다:

| displayName | originalName | 문제 |
|---|---|---|
| 신한카드 정보.jpeg | 마리치법인카드.jpeg | 카드사명이 완전히 다름 — AI 환각 |
| 진단서.jpg | 송연 병원비영수증1.jpg | 진단서 vs 영수증 — 분류 오류 |
| 이경신분증.pptx | (텍스트 14자) | 근거 텍스트 자체가 없음 |

이런 문서를 정밀하게 잡아내는 것이 EV의 본래 목적이다.

### 10.6 검증된 것 vs 미검증

| 검증됨 | 미검증 |
|--------|--------|
| 기존 confidence는 근거성과 무관 (역전 현상) | 현재 토큰 매칭이 실용적 수준인지 |
| EV라는 개념 자체가 필요함 | SUSPECT가 사용자에게 유용한 정보인지 |
| 특정 document_type에서 SUSPECT 집중 | HIGH가 진짜 "잘 된 것"인지 |

### 10.7 최종 판정

**PoC는 "EV가 필요하다"는 것을 증명했지만, "이 방법이 맞다"는 것은 증명하지 못했다.**

근거 수준의 객관화라는 본래 목표를 달성하려면:
1. 한국어 형태소 분석기(kiwi 등) 적용으로 토큰화 정밀도 향상
2. displayName ≒ originalName인 경우 SUSPECT에서 제외하는 필터 추가
3. 개선 후 precision 70%+ 달성 여부 재검증
4. 위 조건 충족 시에만 UI 표시 진행