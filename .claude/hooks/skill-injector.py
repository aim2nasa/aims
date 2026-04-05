"""
AIMS Skill Auto-Injector Hook
UserPromptSubmit 시 키워드를 감지하여 관련 스킬을 additionalContext로 주입
"""
import json
import sys
import os
import re
import io

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

# 스킬 디렉토리 (스크립트 위치 기준 상대 경로)
_here = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.normpath(os.path.join(_here, "..", "skills"))

# 키워드 → 스킬 매핑 (우선순위 순)
SKILL_MAP = [
    {
        "skill": "frontend-skill",
        "keywords": [
            r"프론트", r"프런트", r"frontend", r"컴포넌트", r"component",
            r"react", r"tsx", r"vite", r"zustand", r"tanstack",
            r"화면\s*수정", r"뷰\s*수정", r"UI\s*수정", r"화면\s*개발",
            r"페이지\s*수정", r"페이지\s*개발", r"페이지\s*추가",
        ],
    },
    {
        "skill": "backend-skill",
        "keywords": [
            r"백엔드", r"backend", r"API\s*추가", r"API\s*수정", r"라우트",
            r"route", r"express", r"fastapi", r"서버\s*수정", r"서버\s*코드",
            r"미들웨어", r"middleware", r"aims_api", r"엔드포인트",
        ],
    },
    {
        "skill": "database-skill",
        "keywords": [
            r"데이터베이스", r"database", r"mongodb", r"몽고", r"컬렉션",
            r"collection", r"쿼리", r"query", r"스키마", r"schema",
            r"인덱스", r"index", r"aggregat", r"필드\s*추가", r"필드\s*수정",
        ],
    },
    {
        "skill": "customer-skill",
        "keywords": [
            r"고객\s*삭제", r"고객\s*생성", r"고객\s*수정", r"고객\s*추가",
            r"고객명", r"휴면", r"inactive", r"hard\s*delete",
            r"고객\s*복원", r"restore", r"고객\s*관계", r"relationship",
            r"고객\s*CRUD", r"고객\s*API",
            r"고객\s*목록", r"고객\s*조회", r"고객\s*정보",
        ],
    },
    {
        "skill": "pipeline-skill",
        "keywords": [
            r"파이프라인", r"pipeline", r"문서\s*업로드", r"업로드\s*처리",
            r"OCR", r"분류", r"classify", r"임베딩", r"embedding",
            r"credit.?pending", r"displayname", r"별칭\s*생성",
            r"문서\s*처리", r"문서\s*상태", r"overall.?status",
        ],
    },
    {
        "skill": "ar-crs-parsing-rules",
        "keywords": [
            r"AR", r"CRS", r"연차\s*보고서", r"annual.?report", r"customer.?review",
            r"문서\s*감지", r"문서\s*판단", r"문서\s*유형\s*판단", r"파싱",
            r"pdfplumber", r"보유계약\s*현황",
        ],
    },
    {
        "skill": "css-rules",
        "keywords": [
            r"CSS", r"스타일", r"색상", r"color", r"font", r"레이아웃",
            r"layout", r"애니메이션", r"animation", r"transition",
        ],
    },
    {
        "skill": "ui-components",
        "keywords": [
            r"툴팁", r"tooltip", r"모달", r"modal", r"버튼", r"button",
            r"드롭다운", r"dropdown", r"토스트", r"toast", r"팝오버", r"popover",
        ],
    },
]

def load_skill(skill_name: str) -> str | None:
    """스킬 파일을 읽어서 내용 반환 (frontmatter 제외)"""
    path = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    # frontmatter 제거
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            content = content[end + 3:].strip()
    return content

def match_skills(prompt: str) -> list[str]:
    """프롬프트에서 키워드를 감지하여 매칭되는 스킬 목록 반환"""
    prompt_lower = prompt.lower()
    matched = []
    for entry in SKILL_MAP:
        for kw in entry["keywords"]:
            if re.search(kw, prompt_lower, re.IGNORECASE):
                matched.append(entry["skill"])
                break
    return matched

def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    prompt = input_data.get("prompt", "")
    if not prompt:
        sys.exit(0)

    matched_skills = match_skills(prompt)
    if not matched_skills:
        sys.exit(0)

    # 매칭된 스킬 내용 결합
    sections = []
    for skill_name in matched_skills:
        content = load_skill(skill_name)
        if content:
            sections.append(f"[Auto-injected: {skill_name}]\n{content}")

    if not sections:
        sys.exit(0)

    context = "\n\n---\n\n".join(sections)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": context,
        }
    }
    json.dump(output, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
