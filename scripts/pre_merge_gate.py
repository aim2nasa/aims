#!/usr/bin/env python3
"""
pre_merge_gate.py - Claude Code PreToolUse Hook
================================================
git merge 시 .dev-verified 마커 존재를 강제한다.
dev 검증 없이 main 머지를 차단.

Exit codes:
  0 = 허용
  2 = 차단
"""

import sys
import json
import subprocess
import os
import re


def get_stdin():
    try:
        return json.loads(sys.stdin.read())
    except Exception:
        return {}


def is_git_merge(input_data):
    """git merge 명령인지 확인"""
    command = input_data.get("tool_input", {}).get("command", "")
    return bool(re.search(r'\bgit\s+merge\b', command))


def get_current_branch():
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        return result.stdout.strip()
    except Exception:
        return ""


def main():
    input_data = get_stdin()

    # git merge가 아니면 즉시 통과
    if not is_git_merge(input_data):
        sys.exit(0)

    # main 브랜치가 아니면 통과 (브랜치 간 머지는 허용)
    branch = get_current_branch()
    if branch != "main":
        sys.exit(0)

    # .dev-verified 마커 확인
    marker = os.path.join(os.environ.get("AIMS_ROOT", "D:/aims"), ".dev-verified")
    if os.path.exists(marker):
        # 마커 삭제 (1회용)
        try:
            os.remove(marker)
        except OSError:
            pass
        sys.exit(0)
    else:
        sys.stderr.write(
            "[DEV VERIFY GATE] dev 검증 없이 main 머지 금지!\n"
            "  dev 환경에서 동작 검증을 완료한 후 .dev-verified 마커를 생성하세요.\n"
            "  (compact-fix Phase 3 또는 ACE 4/6에서 자동 생성)\n"
        )
        sys.exit(2)


if __name__ == "__main__":
    main()
