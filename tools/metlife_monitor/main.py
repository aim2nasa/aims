# -*- coding: utf-8 -*-
"""
MetLife 고객목록 자동화 모니터 - 엔트리포인트

Usage:
    python main.py                                    # GUI 열기
    python main.py --replay <log_file>                # 로그 파일 자동 리플레이
    python main.py --save-dir <path>                  # PDF 저장 경로 지정
    python main.py --save-dir <path> --replay <log>   # 둘 다
"""
import sys
import os

# 모듈 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gui_main import MetlifeMonitorApp


def _parse_arg(name: str) -> str:
    """CLI에서 --name <value> 형태의 인자를 추출"""
    if name in sys.argv:
        idx = sys.argv.index(name)
        if idx + 1 < len(sys.argv):
            return sys.argv[idx + 1]
    return ""


def main():
    save_dir = _parse_arg("--save-dir")
    replay_file = _parse_arg("--replay")

    app = MetlifeMonitorApp(save_dir=save_dir)

    # --replay: 지정된 로그 파일을 자동으로 로드 + 시작
    if replay_file and os.path.exists(replay_file):
        from data_source import FileReplaySource
        from app_state import AppState

        app._state = AppState()
        app._source = FileReplaySource(replay_file, speed=5.0)
        filename = os.path.basename(replay_file)
        app._file_label.configure(text=filename)
        app._compact_panel.set_file_loaded(filename)
        # 약간의 딜레이 후 자동 시작
        app.after(500, app._toggle_play)

    # --compact: 자동으로 컴팩트 모드 진입
    if "--compact" in sys.argv:
        app.after(500, app._toggle_compact)

    app.mainloop()


if __name__ == "__main__":
    main()
