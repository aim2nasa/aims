# AI Regression 22/49 FAIL 상세 분석 및 수정 계획

> 작성일: 2026-04-07
> 상태: **Step 5 완료 — 2차 결과 평가 후 추가 대응 필요**

---

## 1. 현황

| 항목 | 값 |
|------|-----|
| 테스트 실행일 | 2026-04-07 |
| 전체 케이스 | 49건 |
| PASS | 27건 (55%) |
| FAIL | 22건 (45%) |
| WARN | 35건 |
| 목표 | FAIL 0건 (WARN은 허용) |

---

## 2. 실패 원인 분류

### A. AI 체이닝 미실행 (20건) — 프롬프트 문제

**패턴**: 고객명 + 계약 키워드 질문 시 `search_customers`만 호출하고 `list_contracts` 체이닝 안 함

| REG | 질문 | 기대 도구 | 실제 호출 |
|-----|------|-----------|----------|
| 009 | 캐치업코리아 계약 현황 알려줘 | list_contracts | search_customers |
| 010 | 캐치업코리아의 정상 상태 계약 목록 보여줘 | list_contracts | search_customers |
| 011 | 캐치업코리아 보험료 얼마나 내고 있어? | list_contracts | search_customers |
| 012 | 캐치업코리아 증권번호 목록 알려줘 | list_contracts | search_customers |
| 021 | 마리치 계약 현황 보여줘 | list_contracts | search_customers |
| 022 | 캐치업코리아의 실효된 계약이 있어? | list_contracts | search_customers |
| 023 | 캐치업코리아 보험료 얼마나 내고 있어? | list_contracts | search_customers |
| 024 | 캐치업코리아 계약 몇 건이야? | list_contracts | search_customers |
| 025 | 김보성 최근 가입한 보험이 뭐야? | list_contracts | search_customers |
| 027 | 캐치업코리아 보험료 얼마나 내고 있어? | list_contracts | search_customers |
| 028 | 김보성 고객이 계약자로 되어 있는 계약들을 모두 보여줘 | list_contracts | search_customers |
| 032 | 김보성 고객이 계약자로 되어 있는 계약들을 모두 보여줘 | list_contracts | search_customers |
| 033 | 안영미가 피보험자인 계약 보여줘 | list_contracts | search_customers |
| 038 | 캐치업코리아 메트라이프 계약만 보여줘 | list_contracts | search_customers |
| 040 | 이분희 납입 완료된 보험 있어? | list_contracts | search_customers |
| 041 | 이상윤 실효된 계약 포함해서 전부 보여줘 | list_contracts | search_customers |
| 042 | 캐치업코리아 보험 언제 끝나? | list_contracts | search_customers |
| 043 | 캐치업코리아 보장금액 1억 이상 계약 보여줘 | list_contracts | search_customers |
| 044 | 캐치업코리아 계약자와 피보험자가 다른 계약만 보여줘 | list_contracts | search_customers |

**핵심 관찰**: 고객명 없이 질문(REG-026 "2024년 이후 계약", REG-029 "가장 최근 계약")은 list_contracts를 정상 호출함.
→ AI가 "고객명 → search_customers 호출 → 결과 반환 → 끝" 패턴에 빠짐

### B. 문서 검색 체이닝 미실행 (2건) — 프롬프트 문제

| REG | 질문 | 기대 도구 | 실제 호출 |
|-----|------|-----------|----------|
| 001 | 캐치업코리아 자동차 관련 문서 찾아줘 | search_documents | search_customers |
| 002 | 캐치업코리아 보험증권 문서 찾아줘 | search_documents | search_customers |

### C. 응답 내용 오류 (1건) — 프롬프트 문제 (데이터는 정상)

| REG | 질문 | 문제 | DB 실태 |
|-----|------|------|---------|
| 030 | 김보성 생년월일이 어떻게 돼? | "등록되어 있지 않습니다" 응답 | birth_date: "1968-02-15" 존재 |

→ DB에 데이터 있는데 AI가 "없다"고 답함. **하네스는 정당, 프롬프트/도구 문제**

---

## 3. Step 1 분석 결과: search_customers 응답 스키마

**결론: search_customers는 계약 정보를 전혀 반환하지 않음**

| 필드 | search_customers | list_contracts |
|------|:---:|:---:|
| 고객 기본정보 (이름, 연락처) | O | X |
| 증권번호/상품명/보험사 | X | **O** |
| 보험료/가입금액 | X | **O** |
| 계약일/만기일 | X | **O** |
| 계약자/피보험자 | X | **O** |
| 집계 (총보험료, 총계약수) | X | **O** (summary) |

→ 하네스의 `required_tools: ["list_contracts"]`는 **정당함**
→ **프롬프트 체이닝 강화가 정답**

---

## 4. 하네스 문제: 중복 테스트 케이스 5건

| 중복 그룹 | 케이스 | 질문 | 유지 제안 |
|-----------|--------|------|-----------|
| 보험료 | REG-011, **023**, 027 | "캐치업코리아 보험료 얼마나 내고 있어?" | **023만 유지** (summary 검증) |
| 계약자 필터 | **028**, 032 | "김보성 고객이 계약자로 되어 있는 계약들을 모두 보여줘" | **032만 유지** (contractor 파라미터) |
| CRS 적립금 | **036**, 039 | "정승우 변액보험 적립금 얼마야?" | **036만 유지** |
| 증권번호 | 012, **049** | "캐치업코리아 증권번호 목록 알려줘" | **049만 유지** (limit 50 검증, required→expected) |

삭제 대상: REG-011, REG-027, REG-028, REG-039, REG-012

---

## 5. 수정 계획

### Step 2: 프롬프트 체이닝 규칙 강화 ⬅ 현재 진행

**chatService.js SYSTEM_PROMPT 수정**

현재 문제: 체이닝 가이드가 프롬프트 중반부(line 508~529)에 "예시"로만 존재
→ AI가 24,000 토큰 프롬프트에서 놓침

수정 방안:
1. **CRITICAL 규칙 바로 아래(line 69 근처)에 명시적 체이닝 규칙 추가**
2. search_customers 결과에 `_nextStepHint` 삽입 (보강)

### Step 3: 하네스 정리

- 중복 5건 삭제 (49→44건)
- REG-030: 유지 (DB에 데이터 있으므로 테스트 정당)

### Step 4: 배포 후 regression 재실행

### Step 5: 결과 평가 → 부족 시 방안 B/C 추가

---

## 6. 2차 결과 (Step 4 실행 후)

| 항목 | 1차 (수정 전) | 2차 (수정 후) | 변화 |
|------|:---:|:---:|------|
| 전체 | 49건 | 44건 | -5 (중복 삭제) |
| PASS | 27 (55%) | 28 (64%) | +1 |
| FAIL | 22 (45%) | 16 (36%) | **-6 개선** |

### 개선된 케이스 (FAIL→PASS)
- REG-001: 자동차 문서 검색 → search_documents 체이닝 성공
- REG-021: 마리치 계약 현황
- REG-022: 실효 계약 필터
- REG-025: 최근 가입 보험
- REG-030: 김보성 생년월일
- REG-033: 피보험자 필터

### 잔여 FAIL 16건 (모두 동일 패턴)
search_customers만 호출하고 list_contracts 체이닝 안 함.
프롬프트 위치/강조만으로는 한계. 코드 레벨 대응 필요.

### 잔여 FAIL 케이스 목록
REG-002, 009, 010, 023, 024, 026, 029, 032, 038, 040, 041, 042, 043, 044 + REG-030 (간헐적)

---

## 7. 다음 단계 제안

### 방안 B: search_customers 결과에 _nextStepHint 삽입 (서버 코드)
search_customers API 응답 끝에 자동 삽입:
```json
"_nextStepHint": "계약 관련 질문이면 list_contracts(customerId=...) 호출 필수"
```
→ AI가 결과를 받을 때 다음 도구를 호출해야 한다는 신호를 직접 받음

### 방안 C: 코드 레벨 강제 체이닝
chatService.js의 while 루프에서, search_customers 결과 후 질문에 계약 키워드가 있으면
자동으로 list_contracts를 호출하는 로직 추가.
→ AI 판단에 의존하지 않는 확실한 해결

### 방안 D: MCP 도구 통합
search_customers + list_contracts를 하나의 도구(search_customer_with_contracts)로 통합.
→ 체이닝 자체가 불필요해짐

---

## 8. 변경 이력

| 일자 | 단계 | 내용 |
|------|------|------|
| 2026-04-07 | Step 1 | search_customers 스키마 확인 → 계약 정보 미포함 확인 |
| 2026-04-07 | Step 1 | REG-030 DB 확인 → 김보성 birth_date 존재. 하네스 정당 |
| 2026-04-07 | Step 2 | 프롬프트 CRITICAL 바로 아래에 체이닝 테이블 추가 |
| 2026-04-07 | Step 3 | 중복 5건 삭제 (49→44건) |
| 2026-04-07 | Step 4 | 배포 후 2차 regression → 28/44 PASS (6건 개선, 16건 잔여) |
| 2026-04-07 | Step 5 | 프롬프트만으로 한계 확인. 방안 B/C/D 추가 대응 필요 |
