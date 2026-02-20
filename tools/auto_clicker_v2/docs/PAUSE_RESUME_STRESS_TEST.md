# AC Pause/Resume 스트레스 테스트

## 목적

AC(AutoClicker)의 일시정지/재개 기능이 PDF 저장 등 위험 구간에서 안전하게 동작하는지 검증한다.

### 테스트 대상 버그 (수정 완료)
- `verify_customer_integrated_view.py`의 PDF 저장 구간에서 pause → `_recover_after_resume()`가 저장 다이얼로그를 ESC/Alt+F4로 닫아버리는 버그
- **수정**: `enter_critical_section()` / `exit_critical_section()`으로 PDF 저장 구간을 보호

---

## 사전 조건

1. MetLife(MetDO) 브라우저가 **전체화면(최대화)** 상태로 열려 있어야 함
2. 화면 해상도 **1920x1080**
3. AC의 SikuliX 이미지가 현재 환경과 일치해야 함

---

## 테스트 절차

### Step 1: AC GUI 실행

```bash
cd d:/aims/tools/auto_clicker_v2
python gui_main.py --chosung ㄹ --auto-start
```

| 옵션 | 설명 |
|------|------|
| `--chosung ㄹ` | 초성 'ㄹ' 고객만 처리 (~10명, 적절한 테스트 분량) |
| `--auto-start` | 사용법 안내 건너뛰고 즉시 실행 |

> **주의**: `--auto-start` 없이 실행하면 사용법 다이얼로그가 뜨므로 "확인" 버튼을 수동으로 클릭한 후 "실행" 버튼을 눌러야 한다.

### Step 2: SikuliX 시작 대기

AC GUI가 SikuliX(Java) 프로세스를 시작할 때까지 **약 15~30초** 대기한다.
GUI가 컴팩트 모드(850x47)로 전환되고 "일시정지" 버튼이 표시되면 SikuliX가 활성화된 것이다.

### Step 3: Pause Injector 실행

```bash
python test_pause_injector.py --continuous --auto-start
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--continuous` | - | AC 종료까지 반복 (필수) |
| `--auto-start` | - | Enter 대기 없이 즉시 시작 |
| `--pause-duration` | 4초 | 일시정지 유지 시간 |
| `--interval-min` | 8초 | pause 간 최소 대기 |
| `--interval-max` | 20초 | pause 간 최대 대기 |
| `--no-mouse` | False | 마우스 이동 비활성화 |

### Step 4: 모니터링

Injector가 자동으로 다음을 수행한다:
1. AC GUI 윈도우 검색 (타이틀에 "AutoClicker v" 포함)
2. 랜덤 간격(8~20초)으로 "일시정지" 버튼 클릭 (좌표: `gl+93, gt+16`)
3. 4초 유지 + 마우스를 랜덤 위치로 이동 (사용자 행동 시뮬레이션)
4. "계속" 버튼 클릭 (같은 좌표, 텍스트만 변경됨)
5. Java(SikuliX) 프로세스 종료 감지 시 자동 중단

**결과 파일**: `D:\tmp\pause_injector_result.txt`

### Step 5: 결과 확인

```bash
cat D:/tmp/pause_injector_result.txt
```

정상 완료 예시:
```
[19:56:18] AC PAUSE/RESUME STRESS TEST (GUI BUTTON)
[19:56:34] --- PAUSE #1 START ---
[19:56:40] --- PAUSE #1 END (held 4.0s) ---
...
[19:58:26] STRESS TEST COMPLETE (GUI BUTTON)
  Total pauses: 6
  AC 종료로 자동 중단
```

---

## 핵심 동작 원리

### GUI 버튼 클릭 방식 (파일 시그널 아님!)

Injector는 `ctypes.windll.user32`로 실제 마우스 클릭을 수행한다:
- `EnumWindows()`로 AC GUI 윈도우 HWND 검색
- `SetForegroundWindow(hwnd)`로 활성화
- `SetCursorPos()` + `mouse_event()`로 버튼 좌표 클릭

> AC GUI는 `overrideredirect(True)` 상태라 타이틀바가 없다.
> 버튼 좌표: 윈도우 좌상단 기준 **(93, 16)** — 일시정지/계속 토글 버튼 중심

### Critical Section 보호

`verify_customer_integrated_view.py`에서 PDF 저장 등 위험 구간:
```python
enter_critical_section()   # _in_critical_section = True
try:
    # PDF 저장 다이얼로그 조작 (Ctrl+S, 경로 입력, 저장 등)
    ...
finally:
    exit_critical_section()  # _in_critical_section = False; check_pause()
```

- `_in_critical_section == True`일 때 `check_pause()`가 즉시 반환 → pause 지연
- `exit_critical_section()` 호출 시 축적된 pause 신호 즉시 처리

### 적용 구간 (총 8곳)

| 위치 | 용도 |
|------|------|
| `_set_pdf_save_path()` | 저장 경로 설정 (Home + paste) |
| Annual Report PDF 저장 (line ~1547) | PDF 저장 아이콘 ~ 저장(S) 완료 |
| Annual Report PDF 닫기 (line ~1654) | Alt+F4 + 확인 다이얼로그 |
| 변액리포트 PDF 저장 (line ~2220) | PDF 저장 아이콘 ~ 저장(S) 완료 |
| 변액리포트 PDF 닫기 (line ~2352) | Alt+F4 + 확인 다이얼로그 |
| 상태 정리 PDF 닫기 (line ~1361) | 정리 시 PDF 뷰어 닫기 |
| 복구 시 PDF 닫기 (line ~1793) | 복구 시 PDF 뷰어 닫기 |
| 강제 복구 (line ~2176) | ESC + 다이얼로그 닫기 |

---

## 판단 기준

| 결과 | 판정 |
|------|------|
| 모든 pause/resume 완료 + AC 정상 종료 | **PASS** |
| pause 중 크래시/에러 | **FAIL** — 로그 분석 후 수정 |
| critical section 구간에서 pause → 다이얼로그 깨짐 | **FAIL** — enter/exit 누락 |

---

## 트러블슈팅

### AC GUI 윈도우 못 찾음
- AC GUI가 실행 중인지 확인 (`tasklist | grep python`)
- 윈도우 타이틀에 "AutoClicker v"가 포함되어야 함

### Java 프로세스 즉시 종료 감지
- SikuliX가 MetLife 브라우저를 못 찾아 빠르게 종료된 경우
- MetDO 브라우저가 전체화면으로 열려있는지 확인

### 버튼 좌표 불일치
- AC GUI 윈도우 크기가 480x440(NORMAL)인지 확인
- `overrideredirect(True)` 상태(타이틀바 없음)에서 버튼 y좌표: 6~27px
