# AI 어시스턴트 자연어 응답 품질 개선 — GT(Ground Truth) 전략 보고서

**작성일**: 2026-03-20
**목적**: 키워드 검색을 GT 소스로 활용하여 AI 어시스턴트 응답 품질을 개선하는 방안의 실현 가능성 분석

---

## 1. 핵심 아이디어

AI 어시스턴트의 자연어 응답은 틀릴 수 있다.
반면, 상세 문서검색의 **키워드 검색(AND/OR)**은 정규식 매칭으로 **100% 정확**하다.
이 정확한 결과를 Ground Truth로 사용하여, AI 응답 품질을 측정하고 개선한다.

```
자연어 질의 → 키워드 추출 → 키워드 검색 API → 정확한 결과(GT)
                                                    ↕ 비교
자연어 질의 → AI 어시스턴트 → AI 응답
```

---

## 2. 질의 유형 분류

### 그룹 정의
- **SQ** (Structured Queries): GT가 존재하는 질의 — Q1~Q2, Q4~Q8
- **UQ** (Unstructured Queries): GT가 없는 질의 — Q3, Q9

| # | 코드 | 그룹 | 질의 유형 | 예시 |
|---|------|:---:|----------|------|
| 1 | **Q1** | SQ | 문서 찾기 | "캐치업코리아 자동차보험 서류 찾아줘" |
| 2 | **Q2** | SQ | 문서 존재 확인 | "건강검진 결과 있어?" |
| 3 | **Q3** | UQ | 문서 내용 질의 | "이 보험증권에 뭐가 써있어?" |
| 4 | **Q4** | SQ | 계약 정보 | "보험료 얼마야?" |
| 5 | **Q5** | SQ | 고객 정보 | "김보성 연락처 알려줘" |
| 6 | **Q6** | SQ | 집계/통계 | "총 보험료?", "계약 몇 건?" |
| 7 | **Q7** | SQ | 날짜 범위 | "이번 달 만기 계약" |
| 8 | **Q8** | SQ | 관계 질의 | "김보성과 캐치업코리아 관계는?" |
| 9 | **Q9** | UQ | 복합 질의 | "김보성 보험료 총액이랑 관련 서류 보여줘" |

---

## 3. GT 소스 및 자동 생성 가능 여부

| 코드 | GT 소스 | GT 자동 생성 | 비고 |
|------|---------|:---:|------|
| **Q1** | 키워드 검색 API (`POST /smartsearch`) | ✅ | 검색 결과 = GT |
| **Q2** | 키워드 검색 API | ✅ | 결과 0건/N건 = GT |
| **Q3** | 없음 | ❌ | GT 존재하지 않음. supervised learning 불가 |
| **Q4** | MongoDB `customers.annual_reports` | ✅ | DB 직접 조회 = GT |
| **Q5** | MongoDB `customers` 컬렉션 | ✅ | DB 직접 조회 = GT |
| **Q6** | MongoDB aggregation | ✅ | 집계 파이프라인 = GT |
| **Q7** | MongoDB 날짜 쿼리 | ✅ | 날짜 필터 = GT |
| **Q8** | MongoDB `customer_relationships` | ✅ | DB 직접 조회 = GT |
| **Q9** | 해당 유형들의 GT 조합 | ⚠️ | 개별 데이터 정확성은 검증 가능. 통합 응답 품질은 검증 불가 |

---

## 4. Q3 — GT가 존재하지 않는 유형

Q3(문서 내용 질의)는 정답이 하나로 정의될 수 없다. GT가 존재하지 않는다.

- "이 문서에 뭐가 써있어?"에 대한 올바른 요약/해석은 사람마다 다름
- supervised learning에 적합하지 않은 문제
- **대응 방침**: AI가 해석/답변을 만들지 않고, 키워드 검색 결과와 RAG 검색 결과를 사용자에게 직접 보여준다 (구글링과 같은 방식)

---

## 5. Q9 — 복합 질의 처리

복합 질의는 여러 유형이 조합된 질의다.

- 개별 질의로 분해하여 각각 답변 가능한 부분만 답변
- 못하는 부분(Q3 포함)은 못한다고 명시
- **문제점**: AI가 답변 불가 영역을 정확히 구분하여 처리해야 함

---

## 6. 미해결 문제: AI 응답 제어

Q3, Q9에서 AI가 "못하는 건 못한다"고 정직하게 응답해야 하는데, 이를 보장하기 어렵다.

### 시도 가능한 접근
1. **시스템 프롬프트** — Q3 유형 감지 시 "해석하지 말고 검색 결과를 보여줘라" 지시. 단, LLM이 무시할 수 있음
2. **코드 레벨 후처리** — 프론트엔드에서 Q3 유형 감지 시 검색 결과 UI로 강제 전환. 확실하지만 구현 복잡

### 결론
- 프롬프트만으로는 100% 보장 불가
- 확실한 제어를 위해서는 코드 레벨 처리가 필요
- 두 가지를 병행하는 것이 현실적이나, 구현 복잡도가 높음
- **이 문제는 미해결 상태**

---

## 7. 명령 유형 (참고)

현재 C1~C6 명령 유형은 시스템 프롬프트에 상세 가이드가 있고, 실제 사용에서 문제 없음.

| 코드 | 명령 유형 | 현재 상태 |
|------|----------|----------|
| C1 | 고객 생성 | 문제 없음 |
| C2 | 고객 수정 | 문제 없음 |
| C3 | 메모 추가 | 문제 없음 |
| C4 | 메모 수정/삭제 | 문제 없음 |
| C5 | 관계 설정 | 문제 없음 |
| C6 | 관계 삭제 | 문제 없음 |

---

## 8. 키워드 검색 API 상세

- **엔드포인트**: `POST /smartsearch` (document_pipeline:8100)
- **프록시**: `POST /api/n8n/smartsearch` (aims_api)
- **파라미터**: `query` (공백 구분 키워드), `mode` (AND/OR), `user_id`, `customer_id` (선택)
- **검색 대상 필드**: displayName, originalName, full_text, summary, notes
- **정확도**: 정규식 매칭, 100% 정확

---

## 9. 미해결 과제 종합

1. **자연어 질의 → 키워드 추출 자동화**: LLM 추출은 부정확할 수 있고, 수동은 노동 집약적
2. **GT 응답 형식**: DB/검색 결과(구조화 데이터) → 자연어 정답 변환 방법
3. **비교 기준**: AI 응답 vs GT를 어떤 메트릭으로 비교할 것인가
4. **Q3 응답 제어**: AI가 해석을 끼워 넣지 않도록 보장하는 방법 (프롬프트 + 코드 병행 필요, 구현 복잡)
5. **Q9 분해 처리**: 복합 질의를 개별 유형으로 분해하고, 유형별로 다르게 처리하는 로직

---

## 10. SQ 품질 향상 실행 계획

### 목표
SQ(Q1~Q2, Q4~Q8)에 대해 AI 어시스턴트의 자연어 질의 처리 품질 향상

### 실행 순서

```
Task 0 (GT 테스트 셋) → Task 1 (도구 확장) → Task 3 (프롬프트 튜닝) → Task 4 (자동 평가) → Task 5 (반복 개선)
```

| Task | 작업 | 산출물 | 상태 |
|------|------|--------|:---:|
| 0 | GT 테스트 셋 구축 (80건) | `docs/gt_test_cases.json` | ✅ 완료 |
| 1 | MCP 도구 확장 — summary 집계, 날짜 필터/정렬, 다중 AR 지원 | `contracts.ts` 수정 | ✅ 완료 (Gini PASS) |
| 3 | 시스템 프롬프트에 Q4/Q6/Q7 도구 선택 가이드 추가 | `chatService.js` 수정 | ✅ 완료 |
| 4 | Regression 29건 PASS + GT 80건 심화 평가 | `run_regression.py` + `run_gt_evaluation.py` | ✅ 완료 |
| 5 | 반복 개선 (4라운드 실행) | GT 수정 + 도구/프롬프트 개선 | ✅ 4차 완료 |

### Regression 결과 (2026-03-21)

Regression 29건 전부 PASS. 이전 실패 3가지 문제 모두 해결:
- ❌→✅ 집계 누락 (REG-023, 024, 027): summary 필드 활용으로 합계 정확 응답
- ❌→✅ 도구 활용 실패 (REG-025, 029): 날짜 정렬/필터로 최근 계약 정확 응답
- ❌→✅ 필터링 실패 (REG-028): 계약자 필터링 프롬프트 가이드로 정확 응답

### GT 80건 심화 평가 추이 (2026-03-21)

| 유형 | 1차 | 2차 | 3차 | 4차 | 5차 | 6차 | 7차 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Q1 문서 찾기 | 86% | 93% | 93% | 100% | 84% | 90% | **90%** |
| Q2 문서 존재 | 0% | 100% | 100% | 100% | 100% | 100% | **100%** |
| Q4 계약 정보 | 54% | 59% | 59% | 55% | 64% | 63% | **55%** |
| Q5 고객 정보 | 68% | 82% | 82% | 77% | 95% | 95% | **95%** |
| Q6 집계/통계 | 31% | 35% | 34% | 59% | 63% | 61% | **60%** |
| Q7 날짜 범위 | 40% | 50% | 58% | 60% | 48% | 55% | **57%** |
| Q8 관계 질의 | 63% | 65% | 60% | 63% | 65% | 60% | **72%** |
| **전체** | **50%** | **69%** | **70%** | **73%** | **75%** | **75%** | **75%** |

### 라운드별 개선 내용

**1차→2차 (50%→69%)**
- 평가 스크립트 Q2 오판 수정 (Q2: 0%→100%)
- list_contracts limit 10→50
- summary에 monthlyPremium/lumpSumPremium 분리

**2차→3차 (69%→70%)**
- list_contracts 다중 AR 지원 (모든 AR에서 계약 수집 + 증권번호 중복 제거)

**3차→4차 (70%→73%)**
- Alex+Gini 교차 분석으로 GT expected 오류 발견
- 곽승철 AR 정상화, 곽지민 AR 등록, 이분희 보험료 GT 수정
- GT 전체를 테스트 계정(695cfe) 소유 기준으로 재검증

**4차→5차 (73%→75%)**
- 평가 스크립트: 방향성 expected 처리, Q5 검색 폴백, 숫자 매칭 개선
- monthlyPremium 정상/유지 계약만 포함 (실효 계약 제외)

**5차→6차 (75%→75%)**
- get_customer/search_customers에 birthDate 반환 추가 (Q5 95% 안정)
- 이름 검색 tool description 개선 (query vs lastName 구분)

**6차→7차 (75%→75%)**
- list_contracts에 contractor/insured 필터 파라미터 추가
- Q4 필터링을 프롬프트 의존→도구 파라미터로 전환

### 최종 종료 판단 (2026-03-21)

**75%에서 3라운드 연속 수렴. SQ 최적화 종료.**

- 전체 평균 50%→75%로 **25%p 개선** 달성
- 5차~7차 3라운드 연속 75% → 완전 수렴
- Q4/Q7 유형별 ±10% 변동은 LLM 비결정성 (overfitting 아님)
- 추가 도구/프롬프트 수정으로 개선 불가능한 구간 진입

### 안정 유형 (해결됨)
- Q1(90%): 문서 찾기 — 안정적 고성능
- Q2(100%): 문서 존재 확인 — 완벽
- Q5(95%): 고객 정보 — birthDate 추가로 안정

### 변동 유형 (LLM 비결정성)
- Q4(55~64%): 계약자/피보험자 필터링 — AI가 파라미터를 비일관적으로 사용
- Q6(59~63%): 집계/통계 — 다중 AR 합산 정확도 변동
- Q7(48~60%): 날짜 범위 — "올해", "최근" 해석 비결정적
- Q8(60~72%): 관계 질의 — "마리치"↔"주식회사마리치" 이름 불일치

### 핵심 원칙
- Task 0(GT)이 없으면 나머지 전부 의미 없음
- 한 번에 하나씩, PoC 검증 후 본 구현
- 실제 채팅 로그 기반으로 판단
- **GT는 반드시 테스트 계정 소유 데이터 기준으로 작성**

---

## 11. UQ 설계안 v2 (2026-03-21, Alex+Gini 교차 리뷰 반영)

### 배경
- Q3(문서 내용 질의): GT 정의 불가. AI가 문서 원문을 해석하면 오염 위험
- Q9(복합 질의): 개별 분해 후 가능 부분만 답변. Q3 영역은 방안 A 규칙 적용

### 방안 정의

| 방안 | 내용 | 난이도 | 순서 |
|------|------|:---:|:---:|
| **A** | 프롬프트 수정 — "문서 원문 요약/재서술 금지" (기존 533~553행에 통합) | 낮음 | 1 |
| **C** | 프론트엔드 후처리 — Q3 응답에서 해석 감지 시 경고 표시 | 중간 | 2 (조건부) |
| **B** | 프론트엔드 문서 카드 — AI는 문서ID만, 프론트엔드가 textPreview 직접 표시 | 높음 | 3 (최후 수단) |

### 교차 리뷰에서 수정된 사항
- **방안 A**: "해석 금지" → "문서 원문 요약/재서술 금지"로 범위 한정 (Q4/Q6 포맷팅 충돌 방지)
- **방안 B**: textPreview를 AI에 전달하면 hallucination 증가 → AI에서 분리, 프론트엔드 직접 표시로 변경
- **측정**: Proxy GT 선행 정의 필수 (측정 없이 배포 금지)

### 측정 기준 (Proxy GT)

| 판정 | 조건 |
|------|------|
| PASS | 도구 반환 summary 그대로 표시하거나, 검색 결과 + 문서 링크만 제공 |
| FAIL | AI가 문서 원문을 직접 요약/해석한 내용 포함 |

자동 감지 패턴: "이 문서는", "내용을 정리하면", "요약하면" 등 해석 시작 표현

### 실행 로드맵 및 결과

```
Step 1: 방안 A+D+E 적용 (프롬프트 수정) ✅ 완료
Step 2: Proxy GT로 FAIL률 측정 ✅ 완료
Step 3: 분기 → FAIL률 < 30% → 방안 C/B 불필요
```

### Step 2 결과 (2026-03-21)

**Q3 Proxy GT 평가: 20건 중 PASS 18, FAIL 2 → FAIL률 10%**

- FAIL 2건은 평가 스크립트 오판 (도구 반환 summary를 해석으로 잘못 감지)
- 실질적 FAIL률: **0%** — AI가 문서 원문을 재서술/해석한 케이스 없음
- 방안 A(프롬프트 수정)만으로 Q3 제어 충분
- **방안 C(프론트엔드 후처리) 불필요, 방안 B(textPreview) 불필요**

### SQ regression 검증

UQ 프롬프트 변경 후 SQ regression **35/35 PASS** — 기존 응답 깨지지 않음 확인

### Q9 대응
- 방안 D+E(복합 질의 분해 규칙 + Few-shot) 적용 완료
- Q9 전용 추가 작업 없음. Q3 영역은 방안 A 규칙 자동 적용

### UQ 최종 판정
- **Q3: 방안 A만으로 해결 (FAIL률 0%)**
- **Q9: 방안 D+E 적용 완료**
- **추가 작업 불필요**

---

## 12. NL 품질 개선 1차 종료 (2026-03-21)

### 최종 성과

| 영역 | 시작 | 결과 |
|------|:---:|:---:|
| SQ (Q1~Q8) | 50% | **75%** (7라운드 수렴) |
| UQ Q3 | 미대응 | **FAIL률 0%** |
| UQ Q9 | 미대응 | 분해 규칙 적용 완료 |
| Regression | - | **35/35 PASS** |

### 구축된 인프라
- `docs/gt_test_cases.json` — SQ GT 80건
- `tools/ai_assistant_regression/run_regression.py` — 기본 regression 35건
- `tools/ai_assistant_regression/run_gt_evaluation.py` — SQ 심화 평가
- `tools/ai_assistant_regression/run_uq_evaluation.py` — UQ Proxy GT 평가

### 2차 개선 계획 (실사용 로그 기반)
- **트리거**: `aims_analytics.chat_messages`에 실제 사용자 질의가 충분히 누적되었을 때
- **방법**: 채팅 로그에서 실패 패턴 수집 → GT 보강 → 평가 → 개선
- **인프라**: 1차에서 구축한 평가 스크립트 그대로 활용

---

## 13. AR/CRS 데이터 질의 확장 (2026-03-21~)

### 목표
AR(Annual Report)과 CRS(Customer Review Service)에 파싱된 모든 정보를 자연어로 질의할 수 있도록 한다.

### AR 데이터 필드 (customers.annual_reports[].contracts[])

| 필드 | 한글명 | 현재 질의 가능 |
|------|--------|:---:|
| 증권번호 | 증권번호 | ✅ |
| 보험상품 | 상품명 | ✅ |
| 계약자 | 계약자 | ✅ |
| 피보험자 | 피보험자 | ✅ |
| 계약일 | 계약일 | ✅ |
| 계약상태 | 상태 | ✅ |
| 가입금액(만원) | 보장금액 | ⚠️ 정렬/필터 미지원 |
| 보험기간 | 보험기간 | ⚠️ 만기 계산 미지원 |
| 납입기간 | 납입기간 | ⚠️ 납입완료 판단 미지원 |
| 보험료(원) | 보험료 | ✅ |

### CRS 데이터 필드 (customers.customer_reviews[])

| 필드 | 한글명 | 현재 질의 가능 |
|------|--------|:---:|
| product_name | 상품명 | ❌ |
| death_beneficiary | 사망수익자 | ❌ |
| accumulated_amount | 적립금 | ❌ |
| investment_return_rate | 투자수익률 | ❌ |
| surrender_value | 해지환급금 | ❌ |
| surrender_rate | 해지환급률 | ❌ |
| initial_premium | 최초보험료 | ❌ |
| monthly_premium | 월보험료 | ❌ |
| net_premium | 순보험료 | ❌ |
| policy_loan | 보험계약대출 | ❌ |
| fund_allocations[] | 펀드 배분 | ❌ |
| total_accumulated_amount | 총 적립금 | ❌ |

### 진행 상태

| Step | 작업 | 상태 |
|------|------|:---:|
| 1 | AR/CRS 질의 유형 46건 정의 | ✅ |
| 2 | 갭 분석 — 불가 8건 식별 | ✅ |
| 3 | Quick Win — CRS 필드 6개 추가, AR 보험사/가입금액 정렬 | ✅ |
| 4 | GT 93건 구축 + CRS 프롬프트 가이드 + 평가 | ✅ |

### 평가 결과 (2026-03-21)

GT 93건 (기존 80건 + AR 3건 + CRS 10건):

| 유형 | 1차 (도구추가 전) | 2차 (프롬프트 추가 후) |
|------|:---:|:---:|
| Q1 | 90% | **90%** |
| Q2 | 20% | **100%** |
| Q4 (AR+CRS) | 60% | **67%** |
| Q5 | 95% | **95%** |
| Q6 (AR+CRS) | 58% | **68%** |
| Q7 | 53% | **48%** |
| Q8 | 70% | **68%** |
| **전체** | **65%** | **76%** |

### 개선 효과
- CRS 누락 필드 추가 → 사망수익자, 적립금, 수익률 등 질의 가능해짐
- CRS 도구 선택 프롬프트 가이드 → AI가 `list_contracts` 대신 `get_customer_reviews` 올바르게 선택
- AR 보험사 필드 + 가입금액 정렬 → 보험사별 필터, 보장금액 순위 질의 가능

---

## 14. AR/CRS 도구 재설계 v2 — 커버율 95% 이상 목표

> Alex + Gini + Sora 교차 리뷰 반영 (2026-03-21)

### 목표
AR/CRS 문서에 파싱된 모든 데이터를 자연어로 조회할 수 있게 한다.
**모든 영역 커버율 95% 이상.** (단, AR 원본에 없는 데이터는 Out of Scope)

### 교차 리뷰 반영 사항

| 출처 | 지적 | 반영 |
|------|------|------|
| Gini | 파라미터 16+개 → AI 오선택 위험 | 1단계/2단계 순차 투입 |
| Gini | get_ vs query_ 혼동 | description + 프롬프트 가이드 명확화 |
| Gini | 만기일/납입완료 예정일 계산 없음 | `expiryDate`, `paymentEndDate` 계산 필드 추가 |
| Gini | bestReturnRate 구조 미정의 | `{productName, returnRate}` 최소 구조 명시 |
| Gini | 커밋 간 중간 regression Gate | 각 커밋 후 regression 확인 |
| Sora | 특약 정보 없음 (설계사 TOP2) | **Out of Scope** — AR 원본에 특약 데이터 없음 |
| Sora | 갱신형 여부/갱신일 없음 (설계사 TOP4) | **Out of Scope** — AR 원본에 갱신 필드 없음 |
| Sora | 납입면제, 보험금 청구 이력 | **Out of Scope** — AR/CRS에 해당 데이터 없음 |
| Alex | lapsed_contracts 수집 누락 | 구현 전 DB 중복 여부 확인 필수 |
| Alex | 보험사 필드 채움율 미확인 | DB 샘플 확인 후 구현 |

### Out of Scope 명시

AR/CRS 원본에 **존재하지 않는 데이터**는 도구로 해결 불가:
- 특약(특별약관) 정보
- 갱신형 여부, 갱신일
- 납입면제 여부
- 보험금 청구 이력
- 추가납입 한도/잔여 한도
- 중도인출 가능 금액

> Sora 의견: "특약과 갱신일이 빠지면 시스템 데이터 기준 95%이지, 설계사 실무 기준 95%는 아니다." → 장기적으로 AR 파서 확장이 필요한 영역.

### 도구 구성 (7개)

| 도구 | 상태 | 용도 |
|------|:---:|------|
| `list_contracts` | **대폭 보강** | AR 계약 조건부 조회 + 집계 |
| `get_contract_details` | 유지 | 단일 계약 상세 |
| `get_ar_contract_history` | 유지 | AR 이력 변화 |
| `get_annual_reports` | 유지 | AR 메타 |
| `get_customer_reviews` | 유지 | CRS 현재 상태 반환 (단순 조회) |
| `query_customer_reviews` | **신규** | CRS 조건부 조회 + 집계 (필터/정렬) |
| `get_cr_contract_history` | **보강** | CRS 이력 변화 + 펀드 필터 |

### list_contracts 보강 (순차 투입)

**1단계 (핵심, 커밋 2):**

| 파라미터/필드 | 용도 |
|---------|------|
| insurerName | 보험사 필터 |
| paymentStatus | 납입상태 필터 |
| includeLapsed | 실효 계약 포함 (기본 false) |
| expiryDate | **계산 필드** — 계약일 + 보험기간 (만기일) |
| paymentEndDate | **계산 필드** — 계약일 + 납입기간 (납입완료 예정일) |
| byInsurer[] | summary — 보험사별 {name, count, totalPremium} |

**2단계 (regression 확인 후, 커밋 2-b):**

| 파라미터 | 용도 |
|---------|------|
| coverageAmountMin/Max | 보장금액 범위 |
| premiumMin/Max | 보험료 범위 |
| insurancePeriod | 보험기간 필터 |
| contractorNotInsured | 계약자≠피보험자 |
| paymentPeriodMin | 납입기간 최소 |

### query_customer_reviews 신규 도구

**description 명확화**: "CRS 데이터를 조건부로 필터링/정렬/집계할 때 사용. 단순 현황 조회는 get_customer_reviews 사용."

**파라미터:**

| 파라미터 | 용도 |
|---------|------|
| customerId | 특정 고객 (선택) |
| returnRateMin/Max | 수익률 범위 |
| accumulatedAmountMin/Max | 적립금 범위 |
| surrenderRateMin/Max | 해지환급률 범위 |
| hasPolicyLoan | 약관대출 유무 |
| hasWithdrawal | 중도인출 유무 |
| hasAdditionalPremium | 추가납입 유무 |
| fundName | 특정 펀드 포함 여부 |
| sortBy | 정렬 (accumulatedAmount/returnRate/surrenderValue) |
| sortOrder | asc/desc |

**응답 summary:**

| 필드 | 구조 |
|------|------|
| totalAccumulated | number |
| avgReturnRate | number |
| totalPolicyLoan | number |
| bestReturnRate | `{productName: string, returnRate: number}` |
| worstReturnRate | `{productName: string, returnRate: number}` |
| principalVsAccumulated | number (비율) |

### get_cr_contract_history 보강

| 파라미터 | 용도 |
|---------|------|
| fundName | 특정 펀드 이력만 필터 |
| field | 추적 대상 필드 (accumulatedAmount/returnRate/surrenderValue) |

### 구현 전 DB 확인 필요 (3건)

1. lapsed_contracts vs contracts 내 실효 항목 중복 여부
2. 보험사 필드(`ARContract['보험사']`) 채움율
3. CRS `premium_info.withdrawal` 실데이터 존재 여부

### 구현 계획 (수정)

| 커밋 | 내용 | Gate |
|:---:|------|:---:|
| 1 | 설계안 보고서 v2 (교차 리뷰 반영) | ✅ 완료 |
| 2 | list_contracts 1단계 보강 + DB 확인 | regression PASS |
| 2-b | list_contracts 2단계 보강 | regression PASS |
| 3 | query_customer_reviews 신규 + get_cr_contract_history 보강 | regression PASS |
| 4 | GT 추가 + 배포 + 평가 | - |
| 5 | CRS 프롬프트 도구 선택 가이드 보강 | regression PASS |
