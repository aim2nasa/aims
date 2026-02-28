# AC 포커스 자동 복구 이슈

## 상태: 대기 (PDF 재클릭 수정 테스트 완료 후 진행)

## 문제
AC(SikuliX) 실행 중 TeamViewer 등으로 kitten에 접속하여 다른 작업을 하면,
MetLife 브라우저가 비활성 윈도우가 되어 SikuliX 클릭이 먹히지 않음.

### 증상
- SikuliX `exists()` / `find()` → 이미지 매칭 **성공** (화면에 보이니까)
- `click(Location(x, y))` → 좌표에 클릭 **전달됨**
- 하지만 MetLife nexacro **JavaScript 이벤트 핸들러 미발동** (비활성 윈도우)
- 결과: "고객통합뷰 3회 클릭 실패 → FATAL"

### 재현 조건
- AC 실행 중 TeamViewer로 kitten 접속
- PowerShell/탐색기 등 다른 창을 열거나 클릭
- MetLife 브라우저가 비활성화됨
- 2026-03-01 01:03 'ㅈ' 그룹 테스트에서 장경진 고객에서 발생

## 근본 원인
`verify_customer_integrated_view.py`에 `App.focus()` 호출이 **전혀 없음**.
SikuliX는 화면 좌표 기반이라 윈도우 포커스를 자체 관리하지 않음.

## 해결 방안

### 핵심: `ensure_browser_focus()` 함수 추가
```python
def ensure_browser_focus():
    """MetLife 브라우저를 최상위 활성 윈도우로 강제 복구"""
    # SikuliX App.focus()는 창 제목 일부 매칭으로 포커스 전환
    App.focus("MetLife")  # 또는 "nexacro", "Chrome" 등 실제 창 제목 확인 필요
    sleep(0.5)
```

### 적용 위치 (모든 주요 클릭 전)
1. **고객통합뷰 버튼 클릭 전** (Step 2) — FATAL 발생 지점
2. **미리보기 버튼 클릭 전** (Step 4)
3. **PDF 저장 버튼 클릭 전** (Step 6-8)
4. **보고서인쇄 창 X 버튼 클릭 전** (Step 11)
5. **scroll_to_top() 내 포커스 클릭 전** (line 463)

### 구현 시 확인 필요
1. kitten에서 MetLife 브라우저 **정확한 창 제목** 확인 (SikuliX App.focus()에 전달할 문자열)
2. `App.focus()`가 SikuliX Jython에서 정상 동작하는지 PoC
3. 포커스 복구 후 충분한 대기 시간 (0.3~0.5초)
4. 포커스 실패 시 fallback (Alt+Tab 등)

### 마우스 위치 복원은 불필요
SikuliX `click(Location(x,y))`는 마우스를 목표로 이동시킨 후 클릭하므로,
마우스 위치 저장/복원은 이 문제의 해결책이 아님. 핵심은 **윈도우 포커스(z-order)**.

## 파일
- `D:/aims/tools/auto_clicker_v2/verify_customer_integrated_view.py`
- 현재 `App.focus()` 사용: 0건 (`grep` 확인)
- 현재 포커스 관련: `scroll_to_top()` 내 좌표 클릭(300,250)만 있음

## 우선순위
PDF 재클릭 수정 v0.1.118 테스트 완료 후 진행.
테스트 중 kitten 화면 터치가 불가피하므로 이 이슈의 우선순위 높음.
