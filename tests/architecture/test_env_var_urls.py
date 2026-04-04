"""
환경변수 URL 네이밍 표준 아키텍처 규칙 강제 테스트

서비스 URL 환경변수가 {SERVICE_NAME}_URL 표준을 따르는지 검사한다.
또한 deploy_aims_api.sh에 해당 환경변수가 Docker -e로 전달되는지 확인한다.

실행:
  python -m pytest tests/architecture/test_env_var_urls.py -v
  또는
  python tests/architecture/test_env_var_urls.py
"""
import os
import re
import sys

# 프로젝트 루트 기준
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 검사 대상 디렉토리
TARGET_DIR = os.path.join(PROJECT_ROOT, "backend", "api", "aims_api", "routes")

# 배포 스크립트 경로
DEPLOY_SCRIPT = os.path.join(PROJECT_ROOT, "backend", "api", "aims_api", "deploy_aims_api.sh")

# 표준 서비스 URL 환경변수 목록
STANDARD_URL_VARS = {
    "ANNUAL_REPORT_API_URL",
    "DOCUMENT_PIPELINE_URL",
    "AIMS_RAG_API_URL",
    "PDF_PROXY_URL",
    "PDF_CONVERTER_URL",
    "N8N_URL",
    "AIMS_MCP_URL",
    "AIMS_API_URL",
    "FRONTEND_URL",
    "VIRUS_SCAN_SERVICE_URL",
}

# 제외: URL이지만 서비스 URL이 아닌 환경변수
EXCLUDED_URL_VARS = {
    "KAKAO_CALLBACK_URL",
    "NAVER_CALLBACK_URL",
    "GOOGLE_CALLBACK_URL",
    "MCP_SERVER_URL",  # AIMS_MCP_URL로 마이그레이션 예정이지만, server.js에서 사용
    "VIRUS_SCAN_SERVICE_URL",  # Tailscale IP fallback 사용, Docker 외부 서비스
}

# process.env.XXX_URL 패턴
ENV_URL_PATTERN = re.compile(r'process\.env\.(\w+_URL)\b')

# 주석 패턴
COMMENT_PATTERN = re.compile(r'^\s*//')

# 제외 디렉토리
EXCLUDE_DIRS = {
    "tests", "test", "__tests__", "node_modules", "dist", "__pycache__",
}


def find_env_url_vars():
    """routes 디렉토리에서 사용되는 모든 *_URL 환경변수를 수집"""
    found_vars = {}  # {var_name: [(file, line_num, code), ...]}

    if not os.path.exists(TARGET_DIR):
        return found_vars

    for root, dirs, files in os.walk(TARGET_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for filename in files:
            if not filename.endswith(".js"):
                continue

            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, PROJECT_ROOT)

            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line_num, line in enumerate(f, 1):
                        if COMMENT_PATTERN.match(line):
                            continue

                        for match in ENV_URL_PATTERN.finditer(line):
                            var_name = match.group(1)
                            if var_name in EXCLUDED_URL_VARS:
                                continue
                            if var_name not in found_vars:
                                found_vars[var_name] = []
                            found_vars[var_name].append({
                                "file": rel_path.replace("\\", "/"),
                                "line": line_num,
                                "code": line.strip()[:120],
                            })
            except (UnicodeDecodeError, PermissionError):
                continue

    return found_vars


def get_deploy_env_vars():
    """deploy_aims_api.sh에서 Docker -e로 전달되는 환경변수 목록 수집"""
    deploy_vars = set()

    if not os.path.exists(DEPLOY_SCRIPT):
        return deploy_vars

    # Docker -e 패턴: -e VAR_NAME=... 또는 -e VAR_NAME="..."
    docker_env_pattern = re.compile(r'-e\s+"?(\w+_URL)=')

    try:
        with open(DEPLOY_SCRIPT, "r", encoding="utf-8") as f:
            for line in f:
                for match in docker_env_pattern.finditer(line):
                    deploy_vars.add(match.group(1))
    except (UnicodeDecodeError, PermissionError):
        pass

    return deploy_vars


def test_env_url_naming_standard():
    """
    [아키텍처 규칙] 서비스 URL 환경변수 네이밍 표준 준수

    서비스 URL 환경변수는 표준 목록에 정의된 이름만 사용해야 합니다.
    표준: ANNUAL_REPORT_API_URL, DOCUMENT_PIPELINE_URL, AIMS_RAG_API_URL,
          PDF_PROXY_URL, PDF_CONVERTER_URL, N8N_URL, AIMS_MCP_URL,
          AIMS_API_URL, FRONTEND_URL, VIRUS_SCAN_SERVICE_URL
    """
    found_vars = find_env_url_vars()
    non_standard = []

    for var_name, locations in found_vars.items():
        if var_name not in STANDARD_URL_VARS:
            for loc in locations:
                non_standard.append({
                    "var": var_name,
                    "file": loc["file"],
                    "line": loc["line"],
                    "code": loc["code"],
                })

    if non_standard:
        msg_lines = [
            "",
            "=" * 70,
            "환경변수 URL 네이밍 표준 위반 발견!",
            "=" * 70,
            "",
            "표준 목록에 없는 *_URL 환경변수가 사용되고 있습니다.",
            "",
            "위반 목록:",
        ]
        for v in non_standard:
            msg_lines.append(f"  {v['file']}:{v['line']}  →  {v['var']}  →  {v['code']}")
        msg_lines.extend([
            "",
            "해결 방법:",
            "  1. 표준 환경변수명으로 변경하세요",
            "  2. 새 서비스 URL이 필요하면 STANDARD_URL_VARS에 추가하세요",
            f"  현재 표준 목록: {sorted(STANDARD_URL_VARS)}",
            "=" * 70,
        ])
        assert False, "\n".join(msg_lines)


def test_env_url_deployed_in_docker():
    """
    [아키텍처 규칙] 서비스 URL 환경변수가 Docker에 전달되는지 확인

    routes에서 사용하는 서비스 URL 환경변수가
    deploy_aims_api.sh의 Docker -e 옵션에 포함되어야 합니다.
    누락되면 프로덕션에서 환경변수가 전달되지 않아 항상 fallback을 사용합니다.

    허용 예외:
    - FRONTEND_URL (별도 메커니즘으로 전달)
    - VIRUS_SCAN_SERVICE_URL (deploy 스크립트에서 직접 전달)
    """
    if not os.path.exists(DEPLOY_SCRIPT):
        return  # 배포 스크립트 없으면 스킵

    found_vars = find_env_url_vars()
    deploy_vars = get_deploy_env_vars()

    # 서비스 URL만 검사 (CALLBACK_URL 등 제외)
    service_url_vars = {
        v for v in found_vars.keys()
        if v in STANDARD_URL_VARS and v not in EXCLUDED_URL_VARS
    }

    missing = []
    for var_name in sorted(service_url_vars):
        if var_name not in deploy_vars:
            locations = found_vars[var_name]
            missing.append({
                "var": var_name,
                "used_in": [f"{loc['file']}:{loc['line']}" for loc in locations],
            })

    if missing:
        msg_lines = [
            "",
            "=" * 70,
            "Docker 환경변수 전달 누락 발견!",
            "=" * 70,
            "",
            "routes에서 사용하는 서비스 URL 환경변수가 deploy_aims_api.sh에 없습니다.",
            "",
            "누락 목록:",
        ]
        for m in missing:
            msg_lines.append(f"  {m['var']}  (사용처: {', '.join(m['used_in'])})")
        msg_lines.extend([
            "",
            "해결 방법:",
            "  deploy_aims_api.sh의 docker run에 -e 옵션을 추가하세요",
            '  예: -e VAR_URL="${VAR_URL:-http://localhost:PORT}"',
            "=" * 70,
        ])
        assert False, "\n".join(msg_lines)


# standalone 실행 지원
if __name__ == "__main__":
    found_vars = find_env_url_vars()
    deploy_vars = get_deploy_env_vars()

    print("=" * 70)
    print("환경변수 URL 네이밍 표준 검사")
    print("=" * 70)
    print()

    # 네이밍 표준 검사
    non_standard = [v for v in found_vars if v not in STANDARD_URL_VARS]
    if non_standard:
        print("비표준 환경변수 발견:")
        for v in non_standard:
            print(f"  {v}")
    else:
        print("네이밍 표준 검사 통과")

    print()

    # Docker 전달 검사
    service_url_vars = {
        v for v in found_vars.keys()
        if v in STANDARD_URL_VARS and v not in EXCLUDED_URL_VARS
    }
    missing = [v for v in service_url_vars if v not in deploy_vars]
    if missing:
        print("Docker 전달 누락:")
        for v in sorted(missing):
            print(f"  {v}")
    else:
        print("Docker 전달 검사 통과")

    print()
    exit_code = 1 if non_standard or missing else 0
    print(f"결과: {'FAIL' if exit_code else 'PASS'}")
    sys.exit(exit_code)
