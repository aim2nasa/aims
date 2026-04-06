# 비결정적 AI 테스트 — 본질적 해결 방안

> 작성일: 2026-04-07
> 적용 대상: AI 어시스턴트, MCP 도구 선택, LLM 기반 기능 전반

---

## 배경

LLM 기반 시스템은 동일 입력에 다른 출력을 낼 수 있다.
1회 실행 PASS/FAIL로 품질을 판단하면, 우연에 의존하는 테스트가 된다.

---

## 원칙: 순서가 핵심이다

```
1단계: 비결정성의 원천 제거 (temperature=0)
   ↓
2단계: 반복 실행 + 통계적 판정 (pass@k)
   ↓
3단계: 판정 기준 분리 (구조적 vs 자연어)
   ↓
4단계: 잔여 비결정성 수용 (LLM 본질적 특성)
```

**1~3을 모두 적용한 후에야 4가 합리적이다.**
1도 안 하고 "비결정성이니까"라고 넘기는 것은 회피다.

---

## 1단계: temperature=0 — 비결정성의 원천 제거

```python
# run_regression.py
response = openai.chat.completions.create(
    model="gpt-4o",
    temperature=0,  # 결정적 출력 강제
    ...
)
```

- 도구 선택 같은 **구조적 판단**은 temperature=0이면 거의 결정적이 된다
- 자연어 표현은 달라질 수 있지만, 어떤 도구를 호출할지는 일관되어야 한다
- temperature=0에서도 도구 선택이 흔들리면 → 프롬프트/도구 구조 문제

---

## 2단계: pass@k — 반복 실행 + 통계적 판정

```python
# 각 케이스를 N회 실행, M회 이상 PASS해야 최종 PASS
REPEAT_COUNT = 3
PASS_THRESHOLD = 2  # 3회 중 2회 이상

for case in cases:
    results = [run_single(case) for _ in range(REPEAT_COUNT)]
    pass_count = sum(1 for r in results if r.passed)
    final = "PASS" if pass_count >= PASS_THRESHOLD else "FAIL"
```

- OpenAI Evals, LangSmith, Braintrust 등 주요 eval 프레임워크의 표준
- 1회 실행의 우연에 의존하지 않음
- 비용과 시간의 트레이드오프: N=3이 실용적 기본값

---

## 3단계: 판정 기준 분리

| 판정 대상 | 성격 | 기대 | 판정 방법 |
|-----------|------|------|-----------|
| 도구 선택 | 구조적 | 결정적이어야 함 | exact match (required_tools) |
| 파라미터 값 | 구조적 | 결정적이어야 함 | exact match |
| 응답 내용 포함 여부 | 반구조적 | 대부분 일관 | must_contain / must_not_contain |
| 응답 품질/자연어 | 비결정적 | 변동 허용 | LLM-as-judge (의미 평가) |

- **도구 선택이 FAIL이면 비결정성 탓이 아니라 프롬프트/도구 구조 문제**
- 응답 품질만 비결정적 허용

---

## 4단계: 잔여 비결정성 수용

1~3을 모두 적용한 후에도 남는 비결정성은 LLM의 본질적 특성이다.
이것은 수용한다. 단, 다음 조건을 충족해야 한다:

- temperature=0 설정됨
- pass@k로 N회 반복 실행됨
- 도구 선택은 결정적 기준으로 판정됨
- 그래도 FAIL이면 → 해당 케이스의 pass rate를 기록하고 개선 대상으로 관리

---

## 구현 위치

| 하네스 코드 | 역할 |
|------------|------|
| `tools/ai_assistant_regression/run_regression.py` | 실행 엔진 — temperature, 반복 횟수, 판정 로직 내장 |
| `tools/ai_assistant_regression/regression_cases.json` | 테스트 케이스 정의 |

- temperature=0과 pass@k는 `run_regression.py`에 내장
- 누가 실행하든 (수동, deploy_all.sh, CI) 동일 기준 자동 적용

---

## 실무 적용 가이드

### Regression 테스트 실행 시
```bash
# deploy_all.sh --with-regression이 자동으로 run_regression.py 호출
# temperature=0 + pass@k가 하네스에 내장되어 있으므로 별도 설정 불필요
```

### 새 테스트 케이스 추가 시
```json
{
  "id": "REG-XXX",
  "question": "...",
  "required_tools": ["도구명"],     // 구조적 판정 (결정적 기대)
  "expected_tools": ["도구명"],     // 소프트 판정 (WARN만)
  "response_must_contain": ["키워드"],  // 반구조적 판정
  "must_call_tools": true
}
```

### FAIL 발생 시 판단 흐름
```
FAIL 발생
  ↓
temperature=0인가? → 아니면 먼저 설정
  ↓
pass@k로 N회 실행했나? → 아니면 반복 실행
  ↓
도구 선택 FAIL인가? → 프롬프트/도구 구조 문제. "비결정성" 탓 금지
  ↓
응답 품질 FAIL인가? → LLM-as-judge 적용 검토
  ↓
모두 적용 후에도 FAIL → pass rate 기록, 개선 대상으로 관리
```

---

## 참고: 업계 표준 Eval 프레임워크

| 프레임워크 | 핵심 접근 |
|-----------|----------|
| OpenAI Evals | 반복 실행 + 통계적 판정 |
| LangSmith | pass@k + LLM-as-judge |
| Braintrust | 스코어링 + 임계값 기반 판정 |
| LMSYS | ELO 레이팅 + 블라인드 비교 |

---

## 핵심 교훈 (2026-04-07 AI Regression 작업에서)

1. **"비결정성이니까"는 면죄부가 아니다** — 1~3단계를 안 하고 비결정성 탓을 하는 것은 회피
2. **도구 선택은 결정적이어야 한다** — temperature=0에서 도구 선택이 흔들리면 프롬프트/도구 구조 문제
3. **1회 실행 PASS/FAIL은 무의미하다** — 동전 던지기와 같음. 반복 실행이 최소 기준
4. **하네스 코드에 내장해야 강제된다** — 문서/규칙/프롬프트가 아닌 코드가 검증
