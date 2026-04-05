# AC 마우스 독점 모드

**일시**: 2026-04-06
**프로세스**: Compact Fix

## 이슈

AC 실행 중 사용자의 마우스 조작이 SikuliX 이미지 매칭을 방해하여 크래시 발생 가능.

## PoC 결과

- WH_MOUSE_LL Hook으로 물리 마우스 입력 차단 성공
- 프로그래밍 입력(Java Robot/SendInput)은 Hook 우회 확인
- Ctrl+Alt+P로 잠금/해제 토글 확인
- 64비트 Windows에서 lParam 오버플로우 이슈 해결

## 구현

- mouse_lock.py: Hook 로직 + 오버레이 모듈
- gui_main.py: AC 실행/일시정지/종료 시 연동
- 오버레이: 좌측 하단 빨간 배경 알림 (이미지 매칭 비간섭 위치)
- 안전장치: atexit Hook 해제, Ctrl+Alt+P 토글, 일시정지 연동
