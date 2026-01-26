# 스크롤 맨 위로 이동 테스트 결과

## 테스트 일자
2026-01-27

## 문제
메트라이프 고객목록 화면에서 스크롤을 맨 위로 이동하는 기존 코드가 동작하지 않음

### 기존 코드 (동작 안 함)
```python
type(Key.HOME, KeyModifier.CTRL)  # Ctrl+Home
```

## 테스트한 방법들

| 방법 | 코드 | 결과 |
|------|------|------|
| Ctrl+Home | `type(Key.HOME, KeyModifier.CTRL)` | ❌ 안됨 |
| Page Up (Sikuli) | `type(Key.PAGE_UP)` | ❌ 안됨 |
| Arrow Up (Sikuli) | `type(Key.UP)` | ❌ 안됨 |
| 마우스 휠 | `wheel(target, WHEEL_UP, 3)` | ✅ 동작 |
| **Java Robot Page Up** | `_robot.keyPress(KeyEvent.VK_PAGE_UP)` | ✅ **동작** |

## 원인 분석
- 사용자가 직접 키보드로 Page Up/Down을 누르면 동작함
- Sikuli의 `type()` 함수가 메트라이프 사이트에 키 입력을 전달하지 못함
- 사이트가 프로그래매틱 키 입력을 무시하거나, Sikuli 내부 문제로 추정
- Java Robot API는 낮은 레벨에서 키 입력을 생성하여 동작함

## 해결책
Java Robot을 사용한 Page Up 방식으로 교체

### 새 코드
```python
from java.awt import Robot
from java.awt.event import KeyEvent

_robot = Robot()

def scroll_to_top(header, max_pageup=20):
    """Java Robot의 Page Up 키로 스크롤을 맨 위로 이동"""
    click(header.right(300).below(150))  # 포커스
    sleep(0.3)
    for i in range(max_pageup):
        _robot.keyPress(KeyEvent.VK_PAGE_UP)
        _robot.keyRelease(KeyEvent.VK_PAGE_UP)
        sleep(0.1)
    sleep(0.5)
```

## 수정된 파일
- `MetlifeCustomerList.py`
  - Java Robot import 추가
  - `scroll_to_top()` 함수 추가
  - 3군데 `type(Key.HOME, KeyModifier.CTRL)` → `scroll_to_top(header)` 교체

## 테스트 스크립트
- `test_scroll_to_top_simple.py` - 스크롤 맨 위 이동 테스트

### 실행 방법
```bash
java -jar C:\sikulix\sikulixide-2.0.5.jar -r test_scroll_to_top_simple.py
```

## 결론
- Sikuli `type()` 함수는 메트라이프 사이트에서 키보드 입력이 동작하지 않음
- Java Robot API를 직접 사용하면 동작함
- Page Up 방식이 마우스 휠보다 한 번에 많이 스크롤되어 효율적
