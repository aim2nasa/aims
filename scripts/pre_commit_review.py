#!/usr/bin/env python3
"""
pre_commit_review.py - Claude Code PreToolUse Hook
===================================================
git commit 시 자동 실행되어 "근본적 해결 원칙" 준수를 검증합니다.

검증 항목:
  1. 밴드에이드 패턴 감지 (DB 조작만, !important, 하드코딩 등)
  2. 변경된 서비스의 테스트 실행

Exit codes:
  0 = 허용 (경고가 있으면 JSON additionalContext로 전달)
  2 = 차단 (stderr로 사유 전달, Claude가 재작업)
"""

import sys
import json
import subprocess
import re
import os


def get_stdin():
    """Read JSON input from Claude Code hook"""
    try:
        return json.loads(sys.stdin.read())
    except Exception:
        return {}


def is_git_commit(input_data):
    """git commit 명령인지 확인"""
    command = input_data.get("tool_input", {}).get("command", "")
    # git commit을 포함하되, git commit --amend 등도 포함
    return bool(re.search(r'\bgit\s+commit\b', command))


def get_staged_diff():
    """스테이징된 변경사항 조회"""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--unified=3"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        return result.stdout
    except Exception:
        return ""


def get_staged_files():
    """스테이징된 파일 목록 조회"""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        return [f for f in result.stdout.strip().split("\n") if f.strip()]
    except Exception:
        return []


def split_diff_by_file(diff):
    """
    git diff를 파일별로 분리

    Returns:
        dict: { "path/to/file.ext": "해당 파일의 diff 내용" }
    """
    file_diffs = {}
    current_file = None
    current_lines = []

    for line in diff.split("\n"):
        if line.startswith("diff --git"):
            # 이전 파일 저장
            if current_file:
                file_diffs[current_file] = "\n".join(current_lines)
            # 새 파일 시작: "diff --git a/path b/path"
            parts = line.split(" b/")
            current_file = parts[-1] if len(parts) > 1 else None
            current_lines = [line]
        else:
            current_lines.append(line)

    # 마지막 파일
    if current_file:
        file_diffs[current_file] = "\n".join(current_lines)

    return file_diffs


def detect_bandaid_patterns(diff, files):
    """
    밴드에이드 패턴 감지 (파일 유형별 타겟 분석)

    Returns:
        warnings: 경고 목록 (Claude에게 피드백, 커밋은 허용)
        blocks: 차단 목록 (커밋 차단, 재작업 요구)
    """
    warnings = []
    blocks = []

    # 검사 제외 파일 (도구/설정 파일은 오감지 방지)
    EXCLUDE_PATTERNS = [
        "scripts/pre_commit_review.py",  # 이 스크립트 자체
        ".claude/",                       # Claude Code 설정
        ".husky/",                        # Git 훅
    ]

    # 파일별 diff 분리
    file_diffs = split_diff_by_file(diff)

    # 분석 대상 파일 분류
    css_diffs = []      # .css 파일의 diff
    js_ts_diffs = []    # .js/.ts/.tsx/.jsx 파일의 diff
    py_diffs = []       # .py 파일의 diff (소스 디렉토리)
    all_code_diffs = [] # 모든 코드 파일의 diff

    for filepath, fdiff in file_diffs.items():
        # 제외 패턴 확인
        if any(filepath.startswith(p) or filepath.endswith(p) for p in EXCLUDE_PATTERNS):
            continue

        _, ext = os.path.splitext(filepath)
        if ext == '.css':
            css_diffs.append((filepath, fdiff))
            all_code_diffs.append((filepath, fdiff))
        elif ext in ('.js', '.ts', '.tsx', '.jsx'):
            js_ts_diffs.append((filepath, fdiff))
            all_code_diffs.append((filepath, fdiff))
        elif ext == '.py':
            py_diffs.append((filepath, fdiff))
            all_code_diffs.append((filepath, fdiff))

    # ━━━━━━━━━━━ BLOCK 패턴 (커밋 차단) ━━━━━━━━━━━

    # 1. !important 사용 → CSS 파일에서만 감지
    #    전체 CSS diff를 집계하여 순수 신규 추가만 감지
    #    (파일 분할/리네임 시 per-file 카운트는 오탐 발생 → 전체 집계로 해결)
    total_important_added = 0
    total_important_removed = 0
    important_files = []
    for filepath, fdiff in css_diffs:
        added = len(re.findall(r'^\+.*!important', fdiff, re.MULTILINE))
        removed = len(re.findall(r'^-.*!important', fdiff, re.MULTILINE))
        net_new = added - removed
        total_important_added += added
        total_important_removed += removed
        if net_new > 0:
            important_files.append((filepath, net_new))
    total_net_new = total_important_added - total_important_removed
    if total_net_new > 0 and important_files:
        file_details = ", ".join(
            "{f}({n}건)".format(f=f, n=n) for f, n in important_files
        )
        blocks.append(
            "!important 순수 신규 추가 감지 (전체 {total}건: {details}) - "
            "CSS 변수(var(--*)) 또는 specificity로 해결하세요"
            .format(total=total_net_new, details=file_details)
        )

    # 2. DB 조작만 있고 소스코드 변경 없음
    source_prefixes = [
        "backend/api/", "frontend/aims-uix3/src/",
        "src/", "tools/auto_clicker_v2/"
    ]
    code_extensions = {'.js', '.ts', '.tsx', '.jsx', '.py', '.css', '.vue'}

    has_source_changes = False
    for f in files:
        _, ext = os.path.splitext(f)
        is_excluded = any(f.startswith(p) or f.endswith(p) for p in EXCLUDE_PATTERNS)
        if not is_excluded and ext in code_extensions and any(f.startswith(p) for p in source_prefixes):
            has_source_changes = True
            break

    # JS/TS 파일에서만 DB 조작 패턴 감지
    db_op_count = 0
    for filepath, fdiff in js_ts_diffs:
        db_op_count += len(re.findall(
            r'^\+.*(updateMany|deleteMany|insertMany|\.remove\(|\.drop\(|bulkWrite)',
            fdiff, re.MULTILINE
        ))
    if db_op_count > 0 and not has_source_changes:
        blocks.append(
            "DB 조작만 감지 (소스코드 변경 없음) - "
            "결과만 치우는 것은 해결이 아닙니다. 근본 원인을 코드에서 해결하세요."
        )

    # 3. 하드코딩된 ObjectId로 예외 처리 → JS/TS/Python에서만
    for filepath, fdiff in js_ts_diffs + py_diffs:
        matches = re.findall(
            r'^\+.*(?:if|===|!==|==|!=)\s*.*["\'][0-9a-f]{24}["\']',
            fdiff, re.MULTILINE
        )
        if matches:
            blocks.append(
                "하드코딩된 ObjectId 감지 ({count}건, {file}) - "
                "특정 ID 예외 처리는 근본 해결이 아닙니다. 일반화된 로직을 설계하세요."
                .format(count=len(matches), file=filepath)
            )

    # 4. 파일명으로 AR/CRS 판단 → JS/TS/Python에서만
    for filepath, fdiff in js_ts_diffs + py_diffs:
        matches = re.findall(
            r'^\+.*(?:file\.?name|fileName|file_name).*(?:match|includes|indexOf|startsWith).*(?:_AR_|_CRS_|annual.?report|customer.?review)',
            fdiff, re.MULTILINE | re.IGNORECASE
        )
        if matches:
            blocks.append(
                "파일명으로 AR/CRS 판단하는 코드 감지 ({file}) - "
                "PDF 텍스트 파싱으로만 판단해야 합니다 (CLAUDE.md 규칙 0-2)"
                .format(file=filepath)
            )

    # ━━━━━━━━━━━ WARN 패턴 (경고, 커밋 허용) ━━━━━━━━━━━

    # 5. 빈 catch 블록 → JS/TS에서만
    for filepath, fdiff in js_ts_diffs:
        empty_catch = re.findall(
            r'^\+\s*(?:\}\s*)?catch\s*\([^)]*\)\s*\{\s*\}',
            fdiff, re.MULTILINE
        )
        if empty_catch:
            warnings.append(
                "빈 catch 블록 감지 ({file}) - 에러를 숨기지 말고 적절히 처리하세요"
                .format(file=filepath)
            )

    # 6. console.error/warn 제거 → JS/TS에서만
    for filepath, fdiff in js_ts_diffs:
        removed = len(re.findall(r'^-\s*console\.(error|warn)', fdiff, re.MULTILINE))
        added = len(re.findall(r'^\+\s*console\.(error|warn)', fdiff, re.MULTILINE))
        if removed > added and removed > 0:
            warnings.append(
                "console.error/warn 제거 감지 ({count}건, {file}) - "
                "에러 로그를 숨기는 것은 해결이 아닙니다"
                .format(count=removed - added, file=filepath)
            )

    # 7. 하드코딩된 색상값 → CSS 파일에서만 (variables.css 제외)
    #    순수 신규 추가만 감지 (들여쓰기 변경 등으로 인한 오탐 방지)
    COLOR_RE = r'(?:color|background(?:-color)?|border(?:-color)?)\s*:\s*#[0-9a-fA-F]{3,8}'
    for filepath, fdiff in css_diffs:
        if 'variables.css' in filepath:
            continue
        added = len(re.findall(r'^\+\s*' + COLOR_RE, fdiff, re.MULTILINE))
        removed = len(re.findall(r'^-\s*' + COLOR_RE, fdiff, re.MULTILINE))
        net_new = added - removed
        if net_new > 0:
            warnings.append(
                "하드코딩된 색상값 감지 ({count}건, {file}) - var(--color-*) CSS 변수를 사용하세요"
                .format(count=net_new, file=filepath)
            )

    # 8. 인라인 스타일 색상값 → JS/TS에서만
    for filepath, fdiff in js_ts_diffs:
        matches = re.findall(
            r'^\+.*style\s*=\s*\{\{[^}]*(?:color|background)\s*:',
            fdiff, re.MULTILINE
        )
        if matches:
            warnings.append(
                "인라인 스타일 색상값 감지 ({file}) - className과 CSS 변수를 사용하세요"
                .format(file=filepath)
            )

    return warnings, blocks


def detect_changed_services(files):
    """변경된 서비스 감지"""
    services = {}
    service_map = {
        "frontend/aims-uix3/": "frontend",
        "backend/api/aims_api/": "aims_api",
        "backend/api/aims_mcp/": "aims_mcp",
        "backend/api/annual_report_api/": "annual_report_api",
        "backend/api/document_pipeline/": "document_pipeline",
        "backend/api/aims_rag_api/": "aims_rag_api",
        "backend/api/pdf_proxy/": "pdf_proxy",
    }
    for f in files:
        for prefix, service in service_map.items():
            if f.startswith(prefix):
                services[service] = True
    return services


def run_service_tests(services):
    """변경된 서비스의 테스트 실행"""
    results = []
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Frontend 테스트는 git pre-commit hook에서 처리 (여기서는 스킵)

    # aims_api 테스트 (SSH로 tars 서버에서 실행 — MongoDB가 서버에 있음)
    if services.get("aims_api"):
        try:
            result = subprocess.run(
                ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
                 "rossi@100.110.215.65",
                 "cd ~/aims/backend/api/aims_api && npm run test:ci 2>&1"],
                capture_output=True, text=True, timeout=120,
                encoding="utf-8", errors="replace",
                shell=(os.name == 'nt')
            )
            if result.returncode != 0:
                stderr_short = result.stderr[:300] if result.stderr else result.stdout[-300:]
                results.append(("FAIL", f"aims_api 테스트 실패:\n{stderr_short}"))
            else:
                results.append(("PASS", "aims_api 테스트 통과 (서버)"))
        except subprocess.TimeoutExpired:
            results.append(("WARN", "aims_api 테스트 타임아웃 (120초)"))
        except Exception as e:
            results.append(("WARN", f"aims_api 테스트 실행 불가: {e}"))

    # aims_mcp 테스트 (로컬: TypeScript 컴파일 체크만, 전체 테스트는 서버에서 실행)
    # MCP 서버가 원격(tars)에서만 실행되므로 로컬에서는 e2e 테스트 실행 불가
    if services.get("aims_mcp"):
        aims_mcp_dir = os.path.join(project_root, "backend", "api", "aims_mcp")
        if os.path.exists(os.path.join(aims_mcp_dir, "package.json")):
            try:
                result = subprocess.run(
                    ["npx", "tsc", "--noEmit"],
                    cwd=aims_mcp_dir,
                    capture_output=True, text=True, timeout=60,
                    encoding="utf-8", errors="replace",
                    shell=(os.name == 'nt')
                )
                if result.returncode != 0:
                    stderr_short = result.stderr[:300] if result.stderr else result.stdout[:300]
                    results.append(("FAIL", f"aims_mcp TypeScript 컴파일 실패:\n{stderr_short}"))
                else:
                    results.append(("PASS", "aims_mcp TypeScript 컴파일 통과"))
            except subprocess.TimeoutExpired:
                results.append(("WARN", "aims_mcp TypeScript 체크 타임아웃 (60초)"))
            except Exception as e:
                results.append(("WARN", f"aims_mcp TypeScript 체크 실행 불가: {e}"))

    # annual_report_api 테스트 (Python pytest)
    if services.get("annual_report_api"):
        ar_api_dir = os.path.join(project_root, "backend", "api", "annual_report_api")
        # Python 실행 명령 찾기
        py_cmd = None
        for cmd in ["py", "python3", "python"]:
            try:
                subprocess.run(
                    [cmd, "-c", "pass"],
                    capture_output=True, timeout=5,
                    shell=(os.name == 'nt')
                )
                py_cmd = cmd
                break
            except Exception:
                continue

        if py_cmd and os.path.exists(ar_api_dir):
            try:
                result = subprocess.run(
                    [py_cmd, "-m", "pytest", "-v", "--tb=short"],
                    cwd=ar_api_dir,
                    capture_output=True, text=True, timeout=120,
                    encoding="utf-8", errors="replace",
                    shell=(os.name == 'nt')
                )
                if result.returncode != 0:
                    stderr_short = result.stderr[:300] if result.stderr else result.stdout[:300]
                    results.append(("FAIL", f"annual_report_api 테스트 실패:\n{stderr_short}"))
                else:
                    results.append(("PASS", "annual_report_api 테스트 통과"))
            except subprocess.TimeoutExpired:
                results.append(("WARN", "annual_report_api 테스트 타임아웃 (120초)"))
            except Exception as e:
                results.append(("WARN", f"annual_report_api 테스트 실행 불가: {e}"))

    return results


def get_current_branch():
    """현재 브랜치명 조회"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        return result.stdout.strip()
    except Exception:
        return ""


def check_main_code_commit(files):
    """
    main 브랜치에서 코드 파일 직접 커밋을 차단한다.
    코드 변경은 반드시 fix/ 또는 feat/ 브랜치에서 진행해야 한다.
    (문서, 설정, 스킬 등 비코드 파일은 main에서 허용)

    Returns:
        None if OK, error message string if blocked
    """
    branch = get_current_branch()
    if branch != "main":
        return None

    CODE_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'}
    EXCLUDE_PATHS = [
        'scripts/',          # 빌드/배포 스크립트
        '.claude/',          # Claude 설정
        'docs/',             # 문서
    ]

    code_files = []
    for f in files:
        if any(f.startswith(p) for p in EXCLUDE_PATHS):
            continue
        _, ext = os.path.splitext(f)
        if ext in CODE_EXTENSIONS:
            code_files.append(f)

    if code_files:
        file_list = "\n".join(f"    - {f}" for f in code_files[:5])
        if len(code_files) > 5:
            file_list += f"\n    ... 외 {len(code_files) - 5}개"
        return (
            f"[MAIN PROTECT] main 브랜치에서 코드 파일 직접 커밋 금지!\n"
            f"  코드 변경 파일:\n{file_list}\n"
            f"  fix/ 또는 feat/ 브랜치를 생성하여 작업하세요.\n"
            f"  (git checkout -b fix/이슈명)"
        )

    return None


def check_regression_test(files):
    """
    fix/ 브랜치에서 코드 변경 시 regression 테스트 포함 여부 체크.
    테스트 없이 버그 수정 커밋을 차단한다.

    Returns:
        None if OK, error message string if blocked
    """
    branch = get_current_branch()
    if not branch.startswith("fix/"):
        return None  # fix 브랜치가 아니면 체크 안 함

    CODE_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.css'}
    TEST_PATTERNS = ['test', 'spec', '__tests__']
    # 테스트 체크 제외 대상
    EXCLUDE_PATHS = [
        'scripts/',          # 빌드/배포 스크립트
        '.claude/',          # Claude 설정
        'docs/',             # 문서
    ]

    has_code_change = False
    has_test_change = False

    for f in files:
        # 제외 대상
        if any(f.startswith(p) for p in EXCLUDE_PATHS):
            continue

        _, ext = os.path.splitext(f)
        if ext not in CODE_EXTENSIONS:
            continue

        # 테스트 파일인지 확인
        f_lower = f.lower()
        is_test = any(tp in f_lower for tp in TEST_PATTERNS)

        if is_test:
            has_test_change = True
        else:
            has_code_change = True

    if has_code_change and not has_test_change:
        return (
            f"[REGRESSION TEST] fix/ 브랜치에서 코드 변경이 있지만 테스트 파일이 없습니다.\n"
            f"  브랜치: {branch}\n"
            f"  버그 수정 시 regression 테스트를 반드시 포함하세요.\n"
            f"  (테스트 파일: *test*, *spec*, __tests__/ 경로)"
        )

    return None


def check_dev_verified(files):
    """
    fix/feat 브랜치에서 코드 변경 시 .dev-verified 마커 필수.
    마커 내 해시가 스테이징된 파일 목록과 일치해야 통과.
    dev_verify.py가 검증 통과 후에만 올바른 해시로 마커를 생성한다.

    Returns:
        None if OK, error message string if blocked
    """
    import hashlib

    branch = get_current_branch()
    if not branch.startswith("fix/") and not branch.startswith("feat/"):
        return None  # fix/feat 브랜치가 아니면 체크 안 함

    CODE_EXTENSIONS = {'.py', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'}
    EXCLUDE_PATHS = ['scripts/', '.claude/', 'docs/']

    has_code_change = False
    for f in files:
        if any(f.startswith(p) for p in EXCLUDE_PATHS):
            continue
        _, ext = os.path.splitext(f)
        if ext in CODE_EXTENSIONS:
            has_code_change = True
            break

    if not has_code_change:
        return None  # 코드 변경 없으면 체크 안 함

    marker = os.path.join(os.environ.get("AIMS_ROOT", "D:/aims"), ".dev-verified")

    if not os.path.exists(marker):
        return (
            "[DEV VERIFY GATE] dev 검증 없이 커밋 금지!\n"
            "  py scripts/dev_verify.py 를 실행하여 검증을 통과하세요.\n"
            "  (compact-fix Phase 3 또는 ACE 4/6에서도 자동 실행)"
        )

    # 해시 검증: 마커 내용이 현재 스테이징 파일과 일치하는지 확인
    try:
        with open(marker, "r") as f:
            content = f.read().strip()
    except Exception:
        return (
            "[DEV VERIFY GATE] .dev-verified 마커를 읽을 수 없습니다.\n"
            "  py scripts/dev_verify.py 를 다시 실행하세요."
        )

    # 기대 해시 계산 (git diff --cached --raw 기반, dev_verify.py와 동일)
    try:
        hash_result = subprocess.run(
            ["git", "diff", "--cached", "--raw"],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        hash_content = hash_result.stdout.strip() or "empty"
    except Exception:
        hash_content = "fallback"
    expected_hash = hashlib.sha256(hash_content.encode()).hexdigest()[:16]

    if not content.startswith("VERIFIED:"):
        return (
            "[DEV VERIFY GATE] .dev-verified 마커가 올바르지 않습니다.\n"
            "  touch로 직접 생성하지 마세요. py scripts/dev_verify.py 를 실행하세요."
        )

    marker_hash = content.split(":", 1)[1] if ":" in content else ""
    if marker_hash != expected_hash:
        return (
            "[DEV VERIFY GATE] 검증 후 파일이 변경되었습니다.\n"
            f"  마커 해시: {marker_hash}\n"
            f"  현재 해시: {expected_hash}\n"
            "  py scripts/dev_verify.py 를 다시 실행하세요."
        )

    # 검증 통과 — 마커 소비 (1회용)
    # 이후 밴드에이드 차단/테스트 실패로 exit(2) 시에도 마커는 삭제된 상태.
    # 이는 의도된 동작: 다음 커밋 시도 시 dev_verify.py 재실행 필요.
    try:
        os.remove(marker)
    except OSError:
        pass

    return None


def check_issue_recording(input_data):
    """
    fix/feat 브랜치에서 커밋 메시지에 이슈 번호(#N)가 있으면,
    해당 이슈에 오늘 날짜 코멘트가 최소 1개 있는지 GitHub API로 검증.
    작업 과정 기록 없이 커밋하는 것을 차단.

    Returns:
        None if OK, error message string if blocked
    """
    branch = get_current_branch()
    if not branch.startswith("fix/") and not branch.startswith("feat/"):
        return None

    # 커밋 메시지에서 이슈 번호 추출
    command = input_data.get("tool_input", {}).get("command", "")
    issue_numbers = re.findall(r'#(\d+)', command)
    if not issue_numbers:
        return None

    issue_num = issue_numbers[0]

    # GitHub API로 오늘(KST) 코멘트 확인
    try:
        from datetime import datetime, timezone, timedelta
        kst = timezone(timedelta(hours=9))
        kst_midnight = datetime.now(kst).replace(hour=0, minute=0, second=0, microsecond=0)
        utc_threshold = kst_midnight.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        result = subprocess.run(
            ["gh", "issue", "view", issue_num, "--json", "comments",
             "--jq", f'[.comments[] | select(.createdAt >= "{utc_threshold}")] | length'],
            capture_output=True, text=True, timeout=15
        )

        if result.returncode != 0:
            return None  # gh CLI 실패 시 차단하지 않음 (네트워크 문제 등)

        count_str = re.search(r'\d+', result.stdout.strip() or "0")
        comment_count = int(count_str.group()) if count_str else 0
        if comment_count == 0:
            return (
                f"[ISSUE RECORDING GATE] 이슈 #{issue_num}에 오늘 기록된 코멘트가 없습니다!\n"
                f"  작업 과정을 이슈에 기록한 후 커밋하세요.\n"
                f"  gh issue comment {issue_num} --body \"진행 내용...\"\n"
                f"  (compact-fix/ACE 각 Phase 완료 시 이슈 코멘트 필수)"
            )
    except (ValueError, subprocess.TimeoutExpired, FileNotFoundError):
        return None  # 검증 불가 시 차단하지 않음

    return None


def check_gini_gate(input_data):
    """
    Gini 검수 게이트: .gini-approved 마커 파일 존재 여부 확인
    - 마커 있으면 삭제 후 통과 (True 반환)
    - 마커 없으면 차단 메시지 출력 후 exit(2)
    """
    marker = os.path.join(os.environ.get("AIMS_ROOT", "D:/aims"), ".gini-approved")
    if os.path.exists(marker):
        try:
            os.remove(marker)
        except OSError:
            pass
        return True
    else:
        sys.stderr.write(
            "[GINI GATE] git commit 직접 실행 금지! "
            "/gini-commit 스킬을 사용하세요. "
            "Gini 품질 검수를 반드시 거쳐야 합니다.\n"
        )
        sys.exit(2)


def main():
    input_data = get_stdin()

    # git commit 명령이 아니면 즉시 통과
    if not is_git_commit(input_data):
        sys.exit(0)

    # ━━━━━━ 0단계: Gini 검수 게이트 ━━━━━━
    check_gini_gate(input_data)

    diff = get_staged_diff()
    files = get_staged_files()

    if not files or not diff:
        sys.exit(0)

    # ━━━━━━ 0.5단계: main 브랜치 코드 커밋 차단 ━━━━━━
    main_error = check_main_code_commit(files)
    if main_error:
        sys.stderr.write(main_error + "\n")
        sys.exit(2)

    # ━━━━━━ 0.6단계: Regression 테스트 강제 (fix/ 브랜치) ━━━━━━
    regression_error = check_regression_test(files)
    if regression_error:
        sys.stderr.write(regression_error + "\n")
        sys.exit(2)

    # ━━━━━━ 0.7단계: dev 검증 게이트 (fix/feat 브랜치, 코드 변경 시) ━━━━━━
    dev_error = check_dev_verified(files)
    if dev_error:
        sys.stderr.write(dev_error + "\n")
        sys.exit(2)

    # ━━━━━��� 0.8단계: 이슈 기록 게이트 (fix/feat 브랜치, 이슈 번호 포함 시) ━━━━━━
    issue_error = check_issue_recording(input_data)
    if issue_error:
        sys.stderr.write(issue_error + "\n")
        sys.exit(2)

    # ━━━━━━ 1단계: 밴드에이드 패턴 감지 ━━━━━━
    warnings, blocks = detect_bandaid_patterns(diff, files)

    # ━━━━━━ 2단계: 변경 서비스 테스트 실행 ━━━━━━
    services = detect_changed_services(files)
    test_results = run_service_tests(services)

    # ━━━━━━ 결과 종합 ━━━━━━
    has_test_failure = any(status == "FAIL" for status, _ in test_results)

    # BLOCK: 밴드에이드 패턴 감지 시
    if blocks:
        msg_parts = ["커밋 차단 - 근본적 해결 원칙 위반:\n"]
        for b in blocks:
            msg_parts.append(f"  BLOCK: {b}")
        if warnings:
            msg_parts.append("\n추가 경고:")
            for w in warnings:
                msg_parts.append(f"  WARN: {w}")
        if test_results:
            msg_parts.append("\n테스트 결과:")
            for status, msg in test_results:
                msg_parts.append(f"  [{status}] {msg}")

        sys.stderr.write("\n".join(msg_parts) + "\n")
        sys.exit(2)

    # BLOCK: 테스트 실패 시
    if has_test_failure:
        msg_parts = ["커밋 차단 - 테스트 실패:\n"]
        for status, msg in test_results:
            msg_parts.append(f"  [{status}] {msg}")
        if warnings:
            msg_parts.append("\n추가 경고:")
            for w in warnings:
                msg_parts.append(f"  WARN: {w}")

        sys.stderr.write("\n".join(msg_parts) + "\n")
        sys.exit(2)

    # PASS (경고가 있으면 additionalContext로 전달)
    context_parts = []
    if warnings:
        context_parts.append("코드 품질 경고:\n" + "\n".join(f"  - {w}" for w in warnings))
    if test_results:
        context_parts.append("테스트 결과:\n" + "\n".join(f"  [{s}] {m}" for s, m in test_results))

    if context_parts:
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": "\n\n".join(context_parts)
            }
        }
        print(json.dumps(output, ensure_ascii=False))

    sys.exit(0)


if __name__ == "__main__":
    main()
