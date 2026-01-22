"""
스크롤 제어 모듈
pyautogui 기반 마우스 스크롤 제어
"""
import time
from dataclasses import dataclass
from typing import Tuple, Optional

import pyautogui


@dataclass
class ScrollConfig:
    """스크롤 설정"""
    scroll_amount: int = -3  # 음수 = 아래로, 양수 = 위로
    scroll_delay: float = 0.8  # 스크롤 후 대기 시간 (초)
    scroll_position: Tuple[int, int] = (0, 0)  # 스크롤할 마우스 위치 (x, y)
    rows_per_scroll: int = 11  # 한 번 스크롤에 넘어가는 행 수
    use_pagedown: bool = True  # Page Down 키 사용 (정확한 11행 스크롤)

    @classmethod
    def from_dict(cls, data: dict) -> "ScrollConfig":
        """딕셔너리에서 생성"""
        position = data.get("position", {})
        return cls(
            scroll_amount=data.get("amount", -3),
            scroll_delay=data.get("delay", 0.8),
            scroll_position=(
                position.get("x", 0),
                position.get("y", 0)
            ),
            rows_per_scroll=data.get("rows_per_scroll", 11),
        )


class ScrollController:
    """스크롤 제어기"""

    def __init__(self, config: ScrollConfig):
        """
        Args:
            config: 스크롤 설정
        """
        self.config = config
        # pyautogui 안전 설정
        pyautogui.PAUSE = 0.1  # 명령 간 딜레이
        pyautogui.FAILSAFE = True  # 마우스를 좌상단으로 이동하면 중단

    def move_to_scroll_position(self) -> None:
        """스크롤 위치로 마우스 이동"""
        x, y = self.config.scroll_position
        pyautogui.moveTo(x, y, duration=0.2)

    def scroll_down(self, clicks: int = None) -> None:
        """
        아래로 스크롤

        Args:
            clicks: 스크롤 클릭 수 (None이면 설정값 사용)
        """
        self.move_to_scroll_position()

        if self.config.use_pagedown:
            # Page Down 키 사용 (정확히 한 페이지 = 11행 스크롤)
            pyautogui.click()  # 테이블에 포커스
            time.sleep(0.1)
            pyautogui.press('pagedown')
        else:
            # 마우스 휠 스크롤 - 여러 번 나눠서 실행
            # MetLife 테이블은 1회 스크롤에 3행 정도만 이동
            # 11행 스크롤하려면 4번 필요
            scroll_count = 4  # 3행 x 4번 = 12행 (약간 중복 허용)
            for _ in range(scroll_count):
                pyautogui.scroll(-3)  # 소량씩 여러 번
                time.sleep(0.2)  # 각 스크롤 사이 짧은 대기

        time.sleep(self.config.scroll_delay)

    def scroll_up(self, clicks: int = None) -> None:
        """
        위로 스크롤

        Args:
            clicks: 스크롤 클릭 수 (None이면 설정값 절대값 사용)
        """
        amount = clicks if clicks is not None else abs(self.config.scroll_amount)

        self.move_to_scroll_position()
        pyautogui.scroll(amount)
        time.sleep(self.config.scroll_delay)

    def scroll_to_top(self, max_scrolls: int = 20) -> None:
        """
        맨 위로 스크롤

        Args:
            max_scrolls: 최대 스크롤 횟수
        """
        self.move_to_scroll_position()

        if self.config.use_pagedown:
            # Ctrl+Home 키 사용 (테이블 맨 위로)
            pyautogui.click()  # 테이블에 포커스
            time.sleep(0.1)
            pyautogui.hotkey('ctrl', 'Home')
        else:
            # 마우스 휠로 위로 스크롤
            for _ in range(max_scrolls):
                pyautogui.scroll(10)  # 큰 양수로 위로 스크롤

        time.sleep(self.config.scroll_delay)

    def scroll_to_bottom(self, max_scrolls: int = 100) -> None:
        """
        맨 아래로 스크롤

        Args:
            max_scrolls: 최대 스크롤 횟수
        """
        self.move_to_scroll_position()
        for _ in range(max_scrolls):
            pyautogui.scroll(-10)  # 큰 음수로 아래로 스크롤
        time.sleep(self.config.scroll_delay)

    def click_at(self, x: int, y: int) -> None:
        """
        지정 위치 클릭

        Args:
            x: X 좌표
            y: Y 좌표
        """
        pyautogui.click(x, y)
        time.sleep(0.3)

    def get_mouse_position(self) -> Tuple[int, int]:
        """현재 마우스 위치 반환"""
        return pyautogui.position()

    @staticmethod
    def get_screen_size() -> Tuple[int, int]:
        """화면 크기 반환"""
        return pyautogui.size()

    def wait(self, seconds: float) -> None:
        """대기"""
        time.sleep(seconds)
