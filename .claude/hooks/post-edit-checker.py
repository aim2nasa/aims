"""
AIMS Post-Edit Self-Check Reminder
Edit/Write 완료 후 설계 수준 체크 리마인더를 additionalContext로 주입
기계적 오류는 Stop Hook이 담당, 여기는 설계/보안/누락 질문만
"""
import json
import sys
import os
import io

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

CHECKLISTS = {
    ".tsx": [
        "혹시 오류 처리는 추가했나요?",
        "보안상 위험한 부분은 없나요?",
    ],
    ".ts": [
        "혹시 오류 처리는 추가했나요?",
        "빠뜨린 엣지 케이스는 없나요?",
    ],
    ".css": [
        "부모 뷰에서 같은 클래스를 오버라이드하고 있지 않나요?",
    ],
    ".js": [
        "혹시 오류 처리는 추가했나요?",
        "보안상 위험한 부분은 없나요?",
    ],
    ".py": [
        "혹시 오류 처리는 추가했나요?",
        "보안상 위험한 부분은 없나요?",
    ],
}


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    _, ext = os.path.splitext(file_path)
    checklist = CHECKLISTS.get(ext, [])
    if not checklist:
        sys.exit(0)

    filename = os.path.basename(file_path)
    reminder = f"[Self-Check: {filename}] " + " / ".join(checklist)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": reminder,
        }
    }
    json.dump(output, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
