# NavigationResetRequired(NRR) 완전 제거 리팩토링

> 작성일: 2026-02-24
> 대상: AutoClicker v2 (`verify_customer_integrated_view.py`, `MetlifeCustomerList.py`)
> 선행 문서: `docs/2026-02-24_AC_PAUSE_SYSTEM_CRASH_ANALYSIS.md`

---

## 요약

일시정지 시스템(Critical Section) 도입 이후 크래시가 급증한 근본 원인인 **NavigationResetRequired(NRR) 예외**를 코드베이스에서 완전히 제거하고, **return 기반 에러 처리**로 전환하였다.

---

## 배경

### 문제

2026-02-20 CS(Critical Section) 전면 도입 이후, NRR 예외가 기존 bare except 패턴과 충돌하여 3가지 크래시 메커니즘이 발생:

1. **bare except가 NRR 삼킴** → 비정상 상태에서 코드 계속 실행 → 크래시
2. **NRR이 CS exit을 건너뜀** → CS 영구 고착 → 일시정지 무력화 → 연쇄 크래시
3. **NRR → SystemExit(1) 변환** → 보고서 1건 실패가 프로그램 전체 종료로 확대

### 근본 원인

예외 기반 제어 흐름(NRR)을 bare except 코드 위에 얹은 **설계 충돌**. CS 도입 전에는 `return None/False`로 에러를 처리하여 bare except와 충돌이 없었다.

### 해결 방향

NRR 예외를 완전히 제거하고, CS 도입 전의 안전한 에러 처리 방식(return 기반)으로 복귀하되 CS는 유지.

---

## 변경 내역

### verify_customer_integrated_view.py

| # | 변경 | 상세 |
|---|------|------|
| 1 | NRR 클래스 삭제 | `class NavigationResetRequired(Exception)` 제거 |
| 2 | wait_and_click() | 알림 팝업 감지 시 `raise NRR` → `return False` |
| 3 | download_annual_report() | 7곳 `raise NRR(msg)` → `return {'exists': True, 'saved': False, 'reason': msg}` |
| 4 | save_report_pdf() | 8곳 `raise NRR(msg)` → `result['error'] = msg; return result` |
| 5 | save_report_pdf() 외부 핸들러 | `except NRR: raise` 제거, `raise NRR(...)` → `return result` |
| 6 | click_all_rows_with_scroll() | `except NRR` try/except 블록 제거 → 직접 호출 |
| 7 | step2 (고객통합뷰 열기) | 2곳 `raise NRR` → early return with error dict |
| 8 | step8 (고객통합뷰 닫기) | `raise NRR` → early return with partial result dict |
| 9 | download_annual_report 호출부 | `try/except NRR/Exception` 래퍼 제거 → 직접 호출 |
| 10 | `__main__` 블록 | 반환값 dict 처리 수정 (`isinstance(result, dict) and not result.get('error')`) |

### MetlifeCustomerList.py

| # | 변경 | 상세 |
|---|------|------|
| 1 | NRR 핸들러 4곳 제거 | `if err_type_name == 'NavigationResetRequired':` 분기 삭제 |
| 2 | dead code 제거 | `err_type_name = e.__class__.__name__` 삭제 (사용처 없음) |
| 3 | 들여쓰기 정정 | NRR if/else 블록 제거 후 남은 코드 정렬 |

### 유지된 구조 (변경 없음)

- CS (enter_critical_section / exit_critical_section) — 일시정지 보호, try/finally 유지
- check_pause() — 일시정지 신호 처리
- IntegratedViewError — 복구 불가 오류 시 capture_and_exit()에서 사용
- recover_to_report_list() — 보고서 목록 복귀
- bare except 15곳 (SikuliX 래퍼) — Java 예외 처리에 필수

---

## 왜 return이 예외보다 안전한가

```
예외 기반 (NRR):
  raise NRR → bare except가 삼킬 수 있음 → 비정상 상태 → 크래시
  raise NRR → CS exit 건너뜀 → CS 고착 → 일시정지 파괴
  raise NRR → catch에서 SystemExit 변환 → 프로그램 종료

return 기반:
  return dict → bare except로 삼킬 수 없음 (예외가 아니므로)
  return dict → finally 블록 반드시 통과 → CS exit 보장
  return dict → catch 대상이 아님 → SystemExit 변환 불가능
```

---

## 검증 결과

### 테스트

| 테스트 파일 | 결과 |
|-----------|------|
| test_nrr_removal.py (NRR 제거 전용) | **30/30 PASS** |
| test_comprehensive_failure_simulation.py (종합 시뮬레이션) | **36/36 PASS** |
| test_alert_popup_resilience.py (알림 팝업 복원력) | **15/15 PASS** |
| test_save_dialog_retry.py (저장 다이얼로그 재시도) | **13/13 PASS** |
| test_exists_wait_wrapper.py (SikuliX 래퍼 안전성) | **15/15 PASS** |
| **전체** | **109/109 ALL PASS** |

### AST 구문 검증

```
verify_customer_integrated_view.py: AST OK
MetlifeCustomerList.py: AST OK
```

### Gini 품질 검수

- 1차: FAIL (Critical 1건 + Major 2건)
  - Critical: MCL 들여쓰기 오류 (SyntaxError)
  - Major: err_type_name dead code
  - Major: __main__ 반환값 타입 불일치
- 수정 후 재검증: **ALL PASS**

---

## 잔여 기술 부채

### _in_critical_section 모듈 간 독립 (기존과 동일)

`_in_critical_section` 전역변수가 VCIV와 MCL에 각각 독립 존재. 현재 안전하지만, 장기적으로 공유 모듈 추출이 바람직하다.

### SikuliX 래퍼 bare except 15곳 (기존과 동일)

Java 예외 특성상 bare except 유지. NRR이 없으므로 삼킬 위험은 완전히 해소.

---

## 교훈

1. **예외를 제어 흐름에 사용하지 말 것** — return 기반 에러 처리가 bare except/CS와 양립 가능
2. **기존 에러 처리 패턴과 새 시스템의 호환성을 먼저 검증** — NRR + bare except 충돌은 사전에 방지 가능했음
3. **크래시 패턴이 특정 커밋 이후 급증하면 해당 커밋의 설계를 의심** — git log 분석이 근본 원인 발견에 핵심
4. **AST 구문 검증을 테스트에 포함** — 텍스트 분석만으로는 들여쓰기 오류를 탐지 못함
