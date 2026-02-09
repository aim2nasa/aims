# -*- coding: utf-8 -*-
"""
MetLife 고객목록 자동화 모니터 - 엔트리포인트

Usage:
    python main.py                          # GUI 열기
    python main.py --replay <log_file>      # 로그 파일 자동 리플레이
"""
import sys
import os

# 모듈 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gui_main import MetlifeMonitorApp


def main():
    app = MetlifeMonitorApp()

    # --replay 옵션: 지정된 로그 파일을 자동으로 로드 + 시작
    if "--replay" in sys.argv:
        idx = sys.argv.index("--replay")
        if idx + 1 < len(sys.argv):
            filepath = sys.argv[idx + 1]
            if os.path.exists(filepath):
                from data_source import FileReplaySource
                from app_state import AppState

                app._state = AppState()
                app._source = FileReplaySource(filepath, speed=5.0)
                app._file_label.configure(text=os.path.basename(filepath))
                # 약간의 딜레이 후 자동 시작
                app.after(500, app._toggle_play)

    app.mainloop()


if __name__ == "__main__":
    main()
