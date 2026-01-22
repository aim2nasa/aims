"""
화면 캡처 모듈
mss 기반 고성능 화면 캡처
"""
import os
import winsound
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any

import mss
import mss.tools


@dataclass
class CaptureRegion:
    """캡처 영역 정의"""
    left: int
    top: int
    width: int
    height: int

    def to_dict(self) -> Dict[str, int]:
        """mss grab용 딕셔너리 변환"""
        return {
            "left": self.left,
            "top": self.top,
            "width": self.width,
            "height": self.height,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CaptureRegion":
        """딕셔너리에서 생성"""
        return cls(
            left=int(data.get("left", 0)),
            top=int(data.get("top", 0)),
            width=int(data.get("width", 800)),
            height=int(data.get("height", 600)),
        )


class ScreenCapturer:
    """화면 캡처 관리자"""

    def __init__(
        self,
        save_path: str,
        monitor: int = 0,
        beep_on_capture: bool = True
    ):
        """
        Args:
            save_path: 캡처 이미지 저장 경로
            monitor: 모니터 인덱스 (0=전체, 1=메인, 2=보조...)
            beep_on_capture: 캡처 시 비프음 재생 여부
        """
        self.save_path = Path(save_path)
        self.monitor = monitor
        self.beep_on_capture = beep_on_capture
        self.capture_count = 0
        self._ensure_save_path()

    def _ensure_save_path(self) -> None:
        """저장 경로 생성"""
        self.save_path.mkdir(parents=True, exist_ok=True)

    def _play_beep(self) -> None:
        """캡처 완료 비프음"""
        if self.beep_on_capture:
            try:
                winsound.Beep(1000, 50)  # 1000Hz, 50ms
            except Exception:
                pass  # 비프음 실패해도 무시

    def get_monitor_info(self) -> Dict[str, int]:
        """선택된 모니터 정보 반환"""
        with mss.mss() as sct:
            return sct.monitors[self.monitor]

    def capture_region(
        self,
        region: CaptureRegion,
        filename_prefix: str = ""
    ) -> Optional[str]:
        """
        지정 영역 캡처

        Args:
            region: 캡처 영역 (모니터 기준 상대 좌표)
            filename_prefix: 파일명 접두사

        Returns:
            저장된 파일 경로 또는 None
        """
        try:
            with mss.mss() as sct:
                monitor_info = sct.monitors[self.monitor]

                # 절대 좌표 계산 (모니터 좌표 + 영역 좌표)
                capture_area = {
                    "left": monitor_info["left"] + region.left,
                    "top": monitor_info["top"] + region.top,
                    "width": region.width,
                    "height": region.height,
                }

                # 캡처 실행
                screenshot = sct.grab(capture_area)
                self.capture_count += 1

                # 파일명 생성
                prefix = f"{filename_prefix}_" if filename_prefix else ""
                filename = self.save_path / f"{prefix}{self.capture_count:03d}.png"

                # PNG 저장
                mss.tools.to_png(
                    screenshot.rgb,
                    screenshot.size,
                    output=str(filename)
                )

                self._play_beep()
                return str(filename)

        except Exception as e:
            print(f"[ERROR] 캡처 실패: {e}")
            return None

    def capture_full_monitor(self, filename_prefix: str = "full") -> Optional[str]:
        """
        전체 모니터 캡처 (영역 확인용)

        Args:
            filename_prefix: 파일명 접두사

        Returns:
            저장된 파일 경로 또는 None
        """
        try:
            with mss.mss() as sct:
                monitor = sct.monitors[self.monitor]
                screenshot = sct.grab(monitor)

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = self.save_path / f"{filename_prefix}_{timestamp}.png"

                mss.tools.to_png(
                    screenshot.rgb,
                    screenshot.size,
                    output=str(filename)
                )

                self._play_beep()
                return str(filename)

        except Exception as e:
            print(f"[ERROR] 전체 화면 캡처 실패: {e}")
            return None

    def reset_count(self) -> None:
        """캡처 카운터 초기화"""
        self.capture_count = 0

    @staticmethod
    def list_monitors() -> None:
        """사용 가능한 모니터 목록 출력"""
        with mss.mss() as sct:
            print(f"총 {len(sct.monitors) - 1}개 모니터 감지:")
            for i, mon in enumerate(sct.monitors):
                label = "전체 (가상)" if i == 0 else f"모니터 {i}"
                print(f"  [{i}] {label}: {mon['width']}x{mon['height']} "
                      f"위치=({mon['left']}, {mon['top']})")
