"""
AIMS Stop Checker Hook
Claude 턴 완료 시 수정된 파일을 검사하고 오류 수준에 따라 조치를 안내
- 오류 적음 → AI 바로 수정 지시
- 오류 많음 → Gini 검수 추천
"""
import json
import sys
import os
import io
import re
import subprocess

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

FRONTEND_DIR = "D:/aims/frontend/aims-uix3"


def get_changed_files() -> list[str]:
    """git diff로 현재 수정된 파일 목록 반환 (staged + unstaged)"""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            capture_output=True, text=True, timeout=5, cwd="D:/aims"
        )
        staged = subprocess.run(
            ["git", "diff", "--name-only", "--cached"],
            capture_output=True, text=True, timeout=5, cwd="D:/aims"
        )
        files = set(result.stdout.strip().split("\n") + staged.stdout.strip().split("\n"))
        return [f for f in files if f]
    except Exception:
        return []


def has_extension(files: list[str], exts: list[str]) -> bool:
    """파일 목록에 특정 확장자가 있는지"""
    return any(f.endswith(tuple(exts)) for f in files)


def run_typecheck() -> tuple[int, str]:
    """프론트엔드 typecheck 실행, (에러 수, 출력) 반환"""
    try:
        result = subprocess.run(
            ["npm", "run", "typecheck"],
            capture_output=True, text=True, timeout=60, cwd=FRONTEND_DIR,
            shell=True
        )
        output = result.stderr + result.stdout
        if result.returncode == 0:
            return 0, ""
        # 에러 수 카운트 (TS 에러는 "error TS" 패턴)
        error_count = output.count("error TS")
        # 첫 10줄만 추출
        lines = [l for l in output.split("\n") if "error TS" in l][:10]
        summary = "\n".join(lines)
        return error_count, summary
    except subprocess.TimeoutExpired:
        return -1, "typecheck timeout (60s)"
    except Exception as e:
        return -1, str(e)


def check_css_violations(files: list[str]) -> list[str]:
    """수정된 CSS 파일에서 규칙 위반 검사"""
    violations = []
    css_files = [f for f in files if f.endswith(".css")]
    for css_file in css_files:
        full_path = os.path.join("D:/aims", css_file)
        if not os.path.exists(full_path):
            continue
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            filename = os.path.basename(css_file)
            if "!important" in content:
                violations.append(f"{filename}: !important 사용 감지")
            if "font-weight: 500" in content or "font-weight:500" in content:
                violations.append(f"{filename}: font-weight: 500 사용 (400 또는 600만 허용)")
            # #hex 색상 감지 (var(--color-*) 대신)
            hex_matches = re.findall(r'(?<!-)#[0-9a-fA-F]{3,8}\b', content)
            if hex_matches and "var(--" not in content[:100]:  # 변수 정의 파일 제외
                violations.append(f"{filename}: 하드코딩 색상 {len(hex_matches)}건 (var(--color-*) 사용 권장)")
        except Exception:
            continue
    return violations


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    # 수정된 파일 확인
    changed_files = get_changed_files()
    if not changed_files:
        sys.exit(0)

    errors = []
    warnings = []

    # TypeScript/TSX 변경 시 typecheck
    if has_extension(changed_files, [".ts", ".tsx"]):
        error_count, summary = run_typecheck()
        if error_count > 0:
            errors.append(f"TypeScript 에러 {error_count}건:\n{summary}")
        elif error_count == -1:
            warnings.append(f"typecheck 실행 실패: {summary}")

    # CSS 변경 시 규칙 검사
    if has_extension(changed_files, [".css"]):
        css_violations = check_css_violations(changed_files)
        for v in css_violations:
            warnings.append(v)

    # 결과가 없으면 통과
    if not errors and not warnings:
        sys.exit(0)

    total_issues = len(errors) + len(warnings)

    # 리포트 생성
    report = "[Stop Check: 작업 완료 검사]\n"
    report += f"수정 파일 {len(changed_files)}개, "

    if errors:
        report += f"에러 {len(errors)}건, "
    report += f"경고 {len(warnings)}건\n\n"

    for e in errors:
        report += f"[ERROR] {e}\n"
    for w in warnings:
        report += f"[WARN] {w}\n"

    report += "\n"

    # 판단: 오류 적으면 직접 수정, 많으면 Gini 추천
    if total_issues <= 3:
        report += "→ 위 항목을 직접 수정하세요."
    else:
        report += "→ 오류가 많습니다. Gini 검수를 추천합니다."

    output = {
        "hookSpecificOutput": {
            "hookEventName": "Stop",
            "decision": "block",
            "reason": report,
        }
    }
    json.dump(output, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
