"""캡처 모듈"""
from .screen_capturer import ScreenCapturer, CaptureRegion
from .scroll_controller import ScrollController, ScrollConfig
from .duplicate_detector import DuplicateDetector

__all__ = [
    "ScreenCapturer",
    "CaptureRegion",
    "ScrollController",
    "ScrollConfig",
    "DuplicateDetector",
]
