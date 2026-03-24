"""
AIMS Post-Edit Checker Hook
Edit/Write 완료 후 파일 유형별 체크 리마인더를 additionalContext로 주입
강제 차단이 아님 — "혹시 이것도 확인했어?" 상기용
"""
import json
import sys
import os
import io

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

# 파일 확장자별 체크리스트
CHECKLISTS = {
    # 프론트엔드 컴포넌트/뷰
    ".tsx": [
        "CSS 색상을 var(--color-*) 변수로 사용했나요? (하드코딩 hex 금지)",
        "Tooltip은 AIMS <Tooltip> 컴포넌트인가요? (native title 속성 금지)",
        "inline style을 사용하지 않았나요?",
        "font-weight: 500을 사용하지 않았나요? (400 또는 600만 허용)",
        "아이콘 크기가 17px 이하인가요?",
        "API 호출로 데이터를 변경했다면 window.location.reload()를 호출했나요? (Optimistic Update 금지)",
    ],
    # CSS 파일
    ".css": [
        "색상을 var(--color-*) CSS 변수로 사용했나요?",
        "!important를 사용하지 않았나요?",
        "font-weight: 500을 사용하지 않았나요?",
        "부모 뷰에서 같은 클래스를 오버라이드하고 있지 않나요? (grep 확인 필요)",
        "고정 칼럼이면 flex-wrap 대신 CSS Grid를 사용했나요?",
    ],
    # TypeScript
    ".ts": [
        "에러 처리가 적절한가요? (try-catch, 에러 타입 구분)",
        "타입 정의가 명확한가요?",
    ],
    # 백엔드 라우트 (Express)
    ".js": [
        "인증 미들웨어(authenticateJWT)를 적용했나요?",
        "에러 응답 형식이 { success: false, error, timestamp } 인가요?",
        "소유자 격리 필터(userId)를 쿼리에 포함했나요?",
        "새 라우트라면 server.js에 등록했나요?",
    ],
    # Python (파이프라인/백엔드)
    ".py": [
        "로깅을 추가했나요? (logger.info/error)",
        "credit_pending 상태를 고려했나요?",
        "에러 발생 시 적절한 상태 업데이트가 있나요?",
        "파일명으로 문서 유형을 판단하지 않았나요? (텍스트 기반만 허용)",
    ],
}

# 특수 경로 패턴별 추가 체크
PATH_CHECKS = {
    "routes": [
        "프론트엔드 API URL과 일치하는지 확인했나요? (3곳 일치: aims_api + pipeline + 프론트)",
    ],
    "pipeline": [
        "document_pipeline 재시작이 필요한 변경인가요?",
    ],
    "ocr": [
        "OCR 쿼터/크레딧 체크 로직을 우회하지 않았나요?",
    ],
}


def get_checklist(file_path: str) -> list[str]:
    """파일 경로에 맞는 체크리스트 반환"""
    _, ext = os.path.splitext(file_path)
    items = list(CHECKLISTS.get(ext, []))

    # 경로 기반 추가 체크
    path_lower = file_path.lower().replace("\\", "/")
    for pattern, checks in PATH_CHECKS.items():
        if pattern in path_lower:
            items.extend(checks)

    return items


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path:
        sys.exit(0)

    checklist = get_checklist(file_path)
    if not checklist:
        sys.exit(0)

    _, ext = os.path.splitext(file_path)
    filename = os.path.basename(file_path)

    reminder = f"[Post-Edit Check: {filename}]\n"
    reminder += "다음 항목을 확인했는지 점검하세요:\n"
    for item in checklist:
        reminder += f"  - {item}\n"

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": reminder,
        }
    }
    json.dump(output, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
