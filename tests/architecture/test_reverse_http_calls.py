"""
역방향 HTTP 호출 아키텍처 규칙 강제 테스트

하위 서비스(document_pipeline, annual_report_api, aims_rag_api, aims_mcp)가
aims_api의 공개 API를 직접 호출하는지 검사한다.
하위 서비스는 반드시 /api/internal/ 경로만 사용해야 한다.

실행:
  python -m pytest tests/architecture/test_reverse_http_calls.py -v
  또는
  python tests/architecture/test_reverse_http_calls.py
"""
import os
import re
import sys

# 프로젝트 루트 기준
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 검사 대상 서비스 디렉토리
TARGET_SERVICES = [
    os.path.join(PROJECT_ROOT, "backend", "api", "document_pipeline"),
    os.path.join(PROJECT_ROOT, "backend", "api", "annual_report_api"),
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_rag_api"),
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_mcp", "src"),
]

# 제외 디렉토리
EXCLUDE_DIRS = {
    "tests", "test", "__tests__", "scripts", "node_modules", "dist",
    "__pycache__", "e2e", "golden_master", "xpipe",
}

# aims_api 공개 API 호출 패턴
# localhost:3010/api/... 또는 AIMS_API_URL + '/api/...' 형태에서
# /api/internal/이 아닌 경우
PATTERNS = [
    # 직접 URL: localhost:3010/api/xxx (not /api/internal/)
    re.compile(r'localhost:3010/api/(?!internal/)'),
    # 환경변수 + 문자열 결합: AIMS_API_URL.*"/api/xxx" (not /api/internal/)
    # Python f-string: f"{...}/api/xxx"
    re.compile(r'AIMS_API_URL[^"\']*["\'][^"\']*?/api/(?!internal/)'),
    # Python f-string 패턴: {settings.AIMS_API_URL}/api/xxx
    re.compile(r'\{[^}]*AIMS_API_URL\}/api/(?!internal/)'),
    # 변수 결합: `${AIMS_API_URL}/api/xxx`
    re.compile(r'\$\{[^}]*AIMS_API_URL\}/api/(?!internal/)'),
]

# 허용 패턴: aims_mcp에서 aims_api 공개 API 호출 (MCP는 aims_api의 상위 프록시)
# address 검색, health 체크 등은 공개 API를 사용하는 것이 정상
ALLOWED_PUBLIC_API_PATHS = [
    "/api/address/",
    "/api/health",
]

# 주석 패턴
COMMENT_PATTERNS = [
    re.compile(r'^\s*#'),     # Python 주석
    re.compile(r'^\s*//'),    # JS/TS 주석
    re.compile(r'^\s*\*'),    # JSDoc 주석
]


def is_comment(line):
    """줄이 주석인지 확인"""
    return any(p.match(line) for p in COMMENT_PATTERNS)


def is_allowed_public_api(line):
    """허용된 공개 API 경로인지 확인"""
    return any(path in line for path in ALLOWED_PUBLIC_API_PATHS)


def find_violations():
    """모든 대상 서비스에서 aims_api 공개 API 직접 호출을 탐색"""
    violations = []

    for service_dir in TARGET_SERVICES:
        if not os.path.exists(service_dir):
            continue

        for root, dirs, files in os.walk(service_dir):
            # 제외 디렉토리 스킵
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for filename in files:
                if not filename.endswith((".py", ".ts", ".js")):
                    continue
                # 테스트 파일 제외
                if ".test." in filename or ".spec." in filename:
                    continue
                if filename == "conftest.py":
                    continue

                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, PROJECT_ROOT)

                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        for line_num, line in enumerate(f, 1):
                            # 주석 무시
                            if is_comment(line):
                                continue

                            # 허용된 공개 API 경로 무시
                            if is_allowed_public_api(line):
                                continue

                            for pattern in PATTERNS:
                                if pattern.search(line):
                                    violations.append({
                                        "file": rel_path.replace("\\", "/"),
                                        "line": line_num,
                                        "code": line.strip()[:120],
                                    })
                                    break  # 같은 줄에서 중복 매칭 방지

                except (UnicodeDecodeError, PermissionError):
                    continue

    return violations


def test_no_reverse_public_api_calls():
    """
    [아키텍처 규칙] 하위 서비스 → aims_api 공개 API 직접 호출 금지

    하위 서비스(document_pipeline, annual_report_api, aims_rag_api, aims_mcp)는
    aims_api의 /api/internal/ 경로만 사용해야 합니다.
    공개 API(/api/xxx)를 직접 호출하면 인증/권한 우회 위험이 있습니다.

    허용 예외:
    - /api/internal/ 경로 사용
    - aims_mcp의 /api/address/, /api/health 호출 (프록시 역할)
    - tests/, scripts/, e2e/, golden_master/, xpipe/ 디렉토리
    - 주석 처리된 코드
    """
    violations = find_violations()

    if violations:
        msg_lines = [
            "",
            "=" * 70,
            "역방향 HTTP 호출 아키텍처 규칙 위반 발견!",
            "=" * 70,
            "",
            "하위 서비스에서 aims_api의 공개 API를 직접 호출하고 있습니다.",
            "/api/internal/ 경로를 사용하도록 수정하세요.",
            "",
            "위반 목록:",
        ]
        for v in violations:
            msg_lines.append(f"  {v['file']}:{v['line']}  →  {v['code']}")
        msg_lines.extend([
            "",
            "해결 방법:",
            "  1. aims_api에 Internal API 엔드포인트를 추가하세요",
            "  2. /api/internal/xxx 경로를 사용하도록 변경하세요",
            "  3. aims_analytics 직접 기록은 별도 DB이므로 허용됩니다",
            "=" * 70,
        ])
        assert False, "\n".join(msg_lines)


# standalone 실행 지원
if __name__ == "__main__":
    violations = find_violations()
    if violations:
        print("=" * 70)
        print("역방향 HTTP 호출 아키텍처 규칙 위반 발견!")
        print("=" * 70)
        print()
        for v in violations:
            print(f"  {v['file']}:{v['line']}  →  {v['code']}")
        print()
        print(f"총 {len(violations)}건 위반")
        sys.exit(1)
    else:
        print("역방향 HTTP 호출 아키텍처 규칙 검사 통과 (위반 0건)")
        sys.exit(0)
