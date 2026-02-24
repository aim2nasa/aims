# AC 일시정지 시스템 도입과 크래시의 상관관계

> 작성일: 2026-02-24
> 대상: AutoClicker v2 (`verify_customer_integrated_view.py`, `MetlifeCustomerList.py`)

---

## 요약

AC v2에 일시정지/재개 시스템(Critical Section 포함)을 도입한 이후 크래시 빈도가 급증했다.
근본 원인은 **예외 기반 제어 흐름(NavigationResetRequired)을 기존 bare except 코드 위에 얹은 설계 충돌**이다.

---

## 타임라인 (git log 기반)

```
2/10 이전  기본 기능 안정기
           - 크래시 관련 fix 거의 없음
           - 예외 대신 return None으로 에러 처리

2/11       ★ 일시정지 시스템 시작
           c23dfbd3  일시정지가 SikuliX를 못 멈추는 버그 수정
           6b012f5a  click() 함수 래핑 (일시정지 반영)
           db44523e  type()/paste() 래핑 (123개 UI 조작 전부 커버)

2/13       c39db706  일시정지 버그 수정 (경로 불일치)
           9abc8e0b  MetDo 알림 팝업 범용 감지 추가

2/20       ★★★ c6a7fb1d  CS 전면 구현 (critical section + 멀티모니터 + 복구)
           ─── 여기서부터 크래시 fix 폭증 ───

2/21       8a17f800  "크래시 복구 강화" (커밋 메시지에 crash가 들어감)

2/22       edfff525  resume 오류 고객 스킵 버그 수정
           a93a427d  동명 고객 스킵 버그

2/24       8f48d953  SikuliX FindFailed 크래시 근본 수정 (ABORT→SKIP)
           ec742621  저장 다이얼로그 크래시 + CS 중첩 해제 + 커서 안정화
           (미커밋)  곽지민 크래시 — MetDo 알림 → NRR → SystemExit(1)
```

## fix 커밋 빈도 비교

| 구간 | fix 커밋 수 | 크래시 성격 |
|------|-----------|------------|
| 2/10 이전 (CS 도입 전) | 2건 | 경미한 UI 버그 |
| 2/11~2/19 (일시정지 도입기) | 4건 | 일시정지 자체 버그 (경로, 래핑 누락) |
| **2/20 이후 (CS 전면 구현 후)** | **8건+** | **FATAL 크래시, 복구 실패, 프로그램 종료** |

---

## 근본 원인 분석

### 1. 예외 기반 제어 흐름 vs bare except 충돌

CS 도입 전: 에러 발생 시 `return None` → 호출부에서 None 체크 → 재시도 또는 스킵.
`bare except: return None` 패턴이 모든 에러를 삼켜도 문제없었음.

CS 도입 후: `NavigationResetRequired` 예외를 사용한 제어 흐름 추가.
기존 `bare except:` 블록이 NRR까지 삼겨서 **예외가 전파되지 않음** → 코드가 비정상 상태에서 계속 실행 → 크래시.

```python
# CS 도입 전 (안전)
try:
    result = _scr().click(target)
except:
    return None  # Java 예외만 삼킴, NRR은 존재하지 않았음

# CS 도입 후 (위험)
try:
    some_operation()  # NRR을 raise할 수 있는 코드
except:
    pass  # NRR까지 삼김 → 상위에서 catch 못함 → 비정상 상태 계속
```

### 2. CS enter/exit 불일치 (고착)

`enter_critical_section()` 후 예외 발생 → `exit_critical_section()` 미호출 → CS 영구 잠금.
CS 잠김 상태에서 `check_pause()`가 항상 즉시 반환 → **일시정지 기능 완전 무력화**.
후속 작업에서 화면 상태 불일치 → 복구 실패 → 크래시.

```
enter_critical_section()
click(save_match)       ← 여기서 예외 발생 시
...                     ← exit_critical_section() 도달 못함
exit_critical_section() ← 실행 안 됨 → CS 영구 고착
```

### 3. NRR → SystemExit(1) 변환

MetlifeCustomerList.py에서 `NavigationResetRequired`를 `raise SystemExit(1)`로 변환했음.
CS 도입 전에는 NRR 자체가 없었으므로 이 코드 경로가 존재하지 않았음.
결과: 보고서 1개 실패 → 고객 1명 실패 → **프로그램 전체 종료**.

---

## 2026-02-24 수정 내역

### 구조적 수정 (CS 설계 결함 해소)

| 수정 | 내용 |
|------|------|
| CS try/finally 보호 | `download_annual_report()` + `save_report_pdf() Step6`에 try/finally 추가 |
| bare except 교체 | 애플리케이션 로직 12곳 `except:` → `except Exception:` (NRR 삼킴 방지) |
| _cs_active 플래그 | recover_to_report_list() 호출 전 수동 CS 해제 + finally에서 조건부 해제 (중첩 방지) |

### 3단계 방어 체계 구축

| 레이어 | 위치 | 동작 |
|--------|------|------|
| Layer 1 (graceful return) | save_report_pdf() 내부 | 알림 팝업 감지 시 NRR 대신 return result |
| Layer 2 (per-report catch) | click_all_rows_with_scroll() | save_report_pdf()의 NRR을 catch → 다음 보고서로 continue |
| Layer 3 (per-customer catch) | MetlifeCustomerList.py 4곳 | 모든 NRR을 catch → 오류 기록 → 다음 고객으로 continue |

### 로그 정확성

`"프로그램 종료"` → `"상위 복구 처리"` (4곳) — 실제 동작과 로그 메시지 일치시킴.

---

## 검증 결과

- 포괄 시뮬레이션 테스트: **51/51 PASS** (6개 카테고리, 20개 NRR 경로 전수 추적)
- 알림 팝업 복원력 테스트: **15/15 PASS**
- 저장 다이얼로그 재시도 테스트: **13/13 PASS**
- SikuliX 래퍼 안전성 테스트: **15/15 PASS**
- Gini 품질 검수: **PASS**

---

## 잔여 기술 부채

### 모듈 간 _in_critical_section 불일치

`_in_critical_section` 전역변수가 `verify_customer_integrated_view.py`와 `MetlifeCustomerList.py`에 각각 독립적으로 존재한다. 현재는 verify 모듈의 래핑 함수가 verify 모듈의 `check_pause()`를 사용하므로 실질적으로 안전하지만, 장기적으로 공유 모듈(`critical_section_shared.py`)로 추출이 바람직하다.

### SikuliX 래퍼의 bare except 15곳 유지

Java 예외가 `except Exception:`으로 잡히지 않는 Jython/SikuliX 특성상 `bare except:`가 불가피하다. 이 15곳에서 NRR이 발생할 구조적 가능성은 없지만, 향후 코드 변경 시 주의가 필요하다.

---

## 교훈

1. **기존 에러 처리 패턴 위에 새로운 예외 시스템을 얹을 때는 전수 호환성 검증이 필수**
2. **CS(Critical Section)는 반드시 try/finally로 보호** — 수동 exit 호출만으로는 예외 경로를 커버할 수 없음
3. **bare except는 Python 예외 기반 제어 흐름과 양립 불가** — 예외를 사용하려면 bare except를 먼저 제거해야 함
4. **예외를 프로그램 종료 트리거로 사용하지 말 것** — NRR → SystemExit(1) 패턴은 단일 실패를 전체 장애로 확대시킴
