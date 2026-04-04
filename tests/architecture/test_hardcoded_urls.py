"""
하드코딩 URL 아키텍처 규칙 강제 테스트

서비스 간 호출 URL이 환경변수 없이 하드코딩되어 있는지 검사한다.
http://localhost:PORT 패턴은 반드시 process.env.XXX의 fallback으로만 사용해야 한다.

실행:
  python -m pytest tests/architecture/test_hardcoded_urls.py -v
  또는
  python tests/architecture/test_hardcoded_urls.py
"""
import os
import re
import sys

# 프로젝트 루트 기준
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 검사 대상 디렉토리
TARGET_DIRS = [
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_api", "routes"),
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_mcp", "src"),
]

# 제외 디렉토리
EXCLUDE_DIRS = {
    "tests", "test", "__tests__", "node_modules", "dist", "__pycache__",
}

# localhost:PORT 패턴
LOCALHOST_PATTERN = re.compile(r'http://localhost:\d+')

# 허용 패턴: 같은 줄에 process.env가 있으면 OK (fallback)
PROCESS_ENV_PATTERN = re.compile(r'process\.env\.')

# 허용 패턴: 허용 도메인/오리진 배열 (auth.js의 CORS, 리다이렉트 설정)
ALLOWED_ORIGINS_PATTERN = re.compile(r'allowedOrigins|allowedOrigin|corsOptions|origins\s*[=:]|ALLOWED_REDIRECT_ORIGINS')

# 허용 패턴: 콘솔 로그
CONSOLE_LOG_PATTERN = re.compile(r'console\.(log|error|warn|info|debug)\(')

# 주석 패턴 (JS/TS 한줄 주석)
COMMENT_PATTERN = re.compile(r'^\s*//')


def find_violations():
    """모든 대상 디렉토리에서 하드코딩된 localhost URL을 탐색"""
    violations = []

    for target_dir in TARGET_DIRS:
        if not os.path.exists(target_dir):
            continue

        for root, dirs, files in os.walk(target_dir):
            # 제외 디렉토리 스킵
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for filename in files:
                if not filename.endswith((".js", ".ts")):
                    continue
                # 테스트 파일 제외
                if ".test." in filename or ".spec." in filename:
                    continue

                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, PROJECT_ROOT)

                # allowedOrigins 컨텍스트 추적
                in_allowed_origins = False

                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        lines = f.readlines()

                    for line_num, line in enumerate(lines, 1):
                        # 주석 무시
                        if COMMENT_PATTERN.match(line):
                            continue

                        # allowedOrigins 배열 컨텍스트 추적
                        if ALLOWED_ORIGINS_PATTERN.search(line):
                            in_allowed_origins = True
                        if in_allowed_origins and ']' in line:
                            in_allowed_origins = False
                            continue
                        if in_allowed_origins:
                            continue

                        # localhost URL 탐색
                        if not LOCALHOST_PATTERN.search(line):
                            continue

                        # 허용: 같은 줄에 process.env가 있으면 (fallback 패턴)
                        if PROCESS_ENV_PATTERN.search(line):
                            continue

                        # 허용: 콘솔 로그 안의 URL
                        if CONSOLE_LOG_PATTERN.search(line):
                            continue

                        violations.append({
                            "file": rel_path.replace("\\", "/"),
                            "line": line_num,
                            "code": line.strip()[:120],
                        })

                except (UnicodeDecodeError, PermissionError):
                    continue

    return violations


def test_no_hardcoded_localhost_urls():
    """
    [아키텍처 규칙] localhost URL 하드코딩 금지

    http://localhost:PORT 패턴은 반드시 process.env.XXX || 'http://localhost:...'
    형태의 fallback으로만 사용해야 합니다.

    허용 예외:
    - process.env.XXX와 같은 줄에 있는 fallback URL
    - CORS allowedOrigins 배열 (프론트엔드 개발 URL)
    - console.log/error/warn 안의 URL
    - 주석 처리된 코드
    - tests/, __tests__/, node_modules/, dist/ 디렉토리
    """
    violations = find_violations()

    if violations:
        msg_lines = [
            "",
            "=" * 70,
            "하드코딩 URL 아키텍처 규칙 위반 발견!",
            "=" * 70,
            "",
            "http://localhost:PORT가 환경변수 fallback 없이 직접 사용되고 있습니다.",
            "process.env.XXX_URL || 'http://localhost:...' 형태로 수정하세요.",
            "",
            "위반 목록:",
        ]
        for v in violations:
            msg_lines.append(f"  {v['file']}:{v['line']}  →  {v['code']}")
        msg_lines.extend([
            "",
            "해결 방법:",
            "  1. 환경변수를 정의하고 fallback으로 localhost URL을 사용하세요",
            "  2. 예: const API_URL = process.env.SERVICE_URL || 'http://localhost:8000'",
            "=" * 70,
        ])
        assert False, "\n".join(msg_lines)


# standalone 실행 지원
if __name__ == "__main__":
    violations = find_violations()
    if violations:
        print("=" * 70)
        print("하드코딩 URL 아키텍처 규칙 위반 발견!")
        print("=" * 70)
        print()
        for v in violations:
            print(f"  {v['file']}:{v['line']}  →  {v['code']}")
        print()
        print(f"총 {len(violations)}건 위반")
        sys.exit(1)
    else:
        print("하드코딩 URL 아키텍처 규칙 검사 통과 (위반 0건)")
        sys.exit(0)
