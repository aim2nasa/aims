"""
AIMS Git Commit Gate - Gini 검수 강제 훅
PreToolUse:Bash 이벤트에서 실제 'git commit' 명령을 감지하면 차단.
반드시 /gini-commit 스킬을 통해 커밋해야 함.

Gini 검수 통과 후 .gini-approved 마커 파일이 존재하면 1회 허용 후 삭제.
"""
import json
import sys
import io
import re
import os

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

# 실제 git commit 명령 패턴
# 줄 시작, &&, ;, ||, | 뒤에 오는 git commit 감지
# 환경변수 할당(VAR=x git commit) 및 env 접두사도 감지
GIT_COMMIT_PATTERN = re.compile(
    r'(?:^|&&\s*|;\s*|\|\|?\s*)(?:(?:\w+=\S*|env\s+\S+)\s+)*git\s+commit\b',
    re.MULTILINE
)

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"decision": "approve"}))
            return

        event = json.loads(raw)
        tool_name = event.get("tool_name", "")
        tool_input = event.get("tool_input") or {}

        if tool_name != "Bash":
            print(json.dumps({"decision": "approve"}))
            return

        command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""

        if GIT_COMMIT_PATTERN.search(command):
            # Gini 검수 통과 마커 확인 (.gini-approved 파일 존재 시 1회 허용)
            marker = os.path.join(os.environ.get("AIMS_ROOT", "D:/aims"), ".gini-approved")
            if os.path.exists(marker):
                try:
                    os.remove(marker)
                except OSError:
                    pass
                print(json.dumps({"decision": "approve"}))
                return

            print(json.dumps({
                "decision": "block",
                "reason": "[GINI GATE] git commit 직접 실행 금지! /gini-commit 스킬을 사용하세요. Gini 품질 검수를 반드시 거쳐야 합니다."
            }))
            return

        print(json.dumps({"decision": "approve"}))
    except Exception:
        # 훅 오류 시 fail-open (Claude 작업 차단 방지)
        print(json.dumps({"decision": "approve"}))

if __name__ == "__main__":
    main()
