# -*- coding: utf-8 -*-
"""
AutoClicker - 엔트리포인트

Usage:
    python main.py                                    # GUI 열기
    python main.py --replay <log_file>                # 로그 파일 자동 리플레이
    python main.py --live                             # SikuliX 실행 (전체 초성)
    python main.py --live --chosung ㅋ                # SikuliX 실행 (특정 초성)
    python main.py --save-dir <path>                  # PDF 저장 경로 지정
    python main.py --compact                          # 자동 컴팩트 모드
"""
import sys
import os

# 모듈 경로 설정
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gui_main import AutoClickerApp


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
    chosung = _parse_arg("--chosung")
    is_live = "--live" in sys.argv
    is_compact = "--compact" in sys.argv

    app = AutoClickerApp(save_dir=save_dir)

    if is_live:
        # --live: SikuliX 실행 + 자동 컴팩트 모드
        app.after(500, lambda: app._start_live(chosung=chosung))
    elif replay_file and os.path.exists(replay_file):
        # --replay: 지정된 로그 파일을 자동으로 로드 + 시작
        from data_source import FileReplaySource
        from app_state import AppState

        app._state = AppState()
        app._source = FileReplaySource(replay_file, speed=5.0)
        filename = os.path.basename(replay_file)
        app._file_label.configure(text=filename)
        app._compact_panel.set_file_loaded(filename)
        app.after(500, app._toggle_play)

        if is_compact:
            app.after(500, app._toggle_compact)
    elif is_compact:
        app.after(500, app._toggle_compact)

    app.mainloop()


if __name__ == "__main__":
    main()
