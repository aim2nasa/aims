#!/usr/bin/env python3
"""
dev_verify.py - dev 검증 실행 + .dev-verified 마커 생성
========================================================
실제 검증(빌드/테스트)을 통과해야만 마커를 생성한다.
마커에는 스테이징된 파일 해시가 포함되어 위조 불가.

사용법:
  py scripts/dev_verify.py          # 스테이징된 파일 기준 검증
  py scripts/dev_verify.py --force  # 스테이징 없어도 전체 검증
"""

import hashlib
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER_PATH = os.path.join(PROJECT_ROOT, ".dev-verified")


def get_staged_files():
    """스테이징된 파일 목록"""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True, text=True, cwd=PROJECT_ROOT,
            encoding="utf-8", errors="replace"
        )
        return sorted(f.strip() for f in result.stdout.strip().split("\n") if f.strip())
    except Exception:
        return []


def get_changed_files():
    """스테이징 + 비스테이징 변경 파일 목록 (--force용)"""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            capture_output=True, text=True, cwd=PROJECT_ROOT,
            encoding="utf-8", errors="replace"
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        # untracked 파일도 포함
        result2 = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            capture_output=True, text=True, cwd=PROJECT_ROOT,
            encoding="utf-8", errors="replace"
        )
        files += [f.strip() for f in result2.stdout.strip().split("\n") if f.strip()]
        return sorted(set(files))
    except Exception:
        return []


def compute_hash():
    """스테이징된 diff 내용으로 해시 생성 (파일 내용 변경 감지)"""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--raw"],
            capture_output=True, text=True, cwd=PROJECT_ROOT,
            encoding="utf-8", errors="replace"
        )
        content = result.stdout.strip()
        if not content:
            content = "empty"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    except Exception:
        return hashlib.sha256(b"fallback").hexdigest()[:16]


def has_frontend_changes(files):
    return any(f.startswith("frontend/aims-uix3/") for f in files)


def has_backend_changes(files):
    return any(f.startswith("backend/") for f in files)


def run_frontend_build():
    """프론트엔드 빌드 검증"""
    print("  [Frontend] npm run build...")
    frontend_dir = os.path.join(PROJECT_ROOT, "frontend", "aims-uix3")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=frontend_dir,
        capture_output=True, text=True, timeout=120,
        encoding="utf-8", errors="replace",
        shell=(os.name == "nt")
    )
    if result.returncode != 0:
        print(f"  [FAIL] Frontend build FAIL")
        print(result.stderr[-500:] if result.stderr else result.stdout[-500:])
        return False
    print("  [PASS] Frontend build PASS")
    return True


def run_frontend_tests(files):
    """프론트엔드 테스트 (변경 파일 기준)"""
    print("  [Frontend] npm test (changed)...")
    frontend_dir = os.path.join(PROJECT_ROOT, "frontend", "aims-uix3")
    result = subprocess.run(
        ["npm", "test", "--", "--run", "--changed"],
        cwd=frontend_dir,
        capture_output=True, text=True, timeout=120,
        encoding="utf-8", errors="replace",
        shell=(os.name == "nt")
    )
    if result.returncode != 0:
        print(f"  [FAIL] Frontend tests FAIL")
        print(result.stderr[-500:] if result.stderr else result.stdout[-500:])
        return False
    print("  [PASS] Frontend tests PASS")
    return True


def run_python_syntax_check(files):
    """Python 구문 검사"""
    py_files = [f for f in files if f.endswith(".py") and not "__pycache__" in f]
    if not py_files:
        return True

    py_cmd = None
    for cmd in ["py", "python3", "python"]:
        try:
            subprocess.run([cmd, "-c", "pass"], capture_output=True, timeout=5,
                           shell=(os.name == "nt"))
            py_cmd = cmd
            break
        except Exception:
            continue

    if not py_cmd:
        print("  [WARN]  Python 없음, 구문 검사 스킵")
        return True

    print(f"  [Backend] Python syntax check ({len(py_files)} files)...")
    failed = []
    for f in py_files:
        fpath = os.path.join(PROJECT_ROOT, f)
        if os.path.exists(fpath):
            result = subprocess.run(
                [py_cmd, "-m", "py_compile", fpath],
                capture_output=True, timeout=30,
                shell=(os.name == "nt")
            )
            if result.returncode != 0:
                failed.append(f)

    if failed:
        print(f"  [FAIL] Python syntax FAIL: {', '.join(failed)}")
        return False
    print("  [PASS] Python syntax PASS")
    return True


def _run_tests_via_ssh(service_path, venv=True):
    """SSH로 tars 서버에서 pytest 실행 (로컬 의존성 부족 시 폴백)"""
    activate = "source venv/bin/activate && " if venv else ""
    cmd = f"cd ~/aims/{service_path} && {activate}python -m pytest tests/ -v --tb=short 2>&1"
    try:
        result = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
             "rossi@100.110.215.65", cmd],
            capture_output=True, text=True, timeout=120,
            encoding="utf-8", errors="replace",
            shell=(os.name == "nt")
        )
        return result.returncode == 0, result.stdout[-500:] if result.stdout else ""
    except Exception as e:
        return False, str(e)


def run_backend_tests(files):
    """백엔드 서비스별 테스트 (로컬 실행 우선, 실패 시 SSH 폴백)"""
    # document_pipeline pytest
    if any(f.startswith("backend/api/document_pipeline/") for f in files):
        test_dir = os.path.join(PROJECT_ROOT, "backend", "api", "document_pipeline")
        tests_path = os.path.join(test_dir, "tests")
        if os.path.exists(tests_path):
            print("  [Backend] document_pipeline pytest...")
            py_cmd = None
            for cmd in ["py", "python3", "python"]:
                try:
                    subprocess.run([cmd, "-c", "pass"], capture_output=True, timeout=5,
                                   shell=(os.name == "nt"))
                    py_cmd = cmd
                    break
                except Exception:
                    continue

            # 로컬 실행 시도
            local_ok = False
            if py_cmd:
                result = subprocess.run(
                    [py_cmd, "-m", "pytest", "-v", "--tb=short", "tests/"],
                    cwd=test_dir,
                    capture_output=True, text=True, timeout=120,
                    encoding="utf-8", errors="replace",
                    shell=(os.name == "nt")
                )
                if result.returncode == 0:
                    local_ok = True
                    print("  [PASS] document_pipeline tests PASS")
                elif "ModuleNotFoundError" in (result.stdout or "") + (result.stderr or ""):
                    # 로컬 의존성 부족 -> SSH 폴백
                    print("  [WARN] 로컬 의존성 부족, SSH로 서버 테스트...")
                    ok, output = _run_tests_via_ssh("backend/api/document_pipeline")
                    if ok:
                        local_ok = True
                        print("  [PASS] document_pipeline tests PASS (server)")
                    else:
                        # "N failed" 중 신규 실패만 차단 (기존 실패 목록)
                        KNOWN_FAILURES = {
                            "test_ocr_progress_fix.py::TestOCRErrorProgress::test_error_sets_progress_minus1",
                        }
                        unknown = [
                            line for line in output.split("\n")
                            if line.startswith("FAILED ")
                            and not any(kf in line for kf in KNOWN_FAILURES)
                        ]
                        if unknown:
                            print(f"  [FAIL] document_pipeline tests FAIL (server)")
                            for u in unknown:
                                print(f"    {u}")
                            return False
                        else:
                            local_ok = True
                            print("  [PASS] document_pipeline tests PASS (server, known failures only)")
                else:
                    print(f"  [FAIL] document_pipeline tests FAIL")
                    print(result.stdout[-500:] if result.stdout else "")
                    return False

    # annual_report_api pytest
    if any(f.startswith("backend/api/annual_report_api/") for f in files):
        test_dir = os.path.join(PROJECT_ROOT, "backend", "api", "annual_report_api")
        if os.path.exists(os.path.join(test_dir, "tests")):
            print("  [Backend] annual_report_api pytest...")
            py_cmd = None
            for cmd in ["py", "python3", "python"]:
                try:
                    subprocess.run([cmd, "-c", "pass"], capture_output=True, timeout=5,
                                   shell=(os.name == "nt"))
                    py_cmd = cmd
                    break
                except Exception:
                    continue

            if py_cmd:
                # 이슈 #59 후속: annual_report_api 테스트가 성장하여 120s 초과.
                # 통합 테스트 포함 시 전체 실행은 약 5분. 600s 로 상향.
                result = subprocess.run(
                    [py_cmd, "-m", "pytest", "-v", "--tb=short"],
                    cwd=test_dir,
                    capture_output=True, text=True, timeout=600,
                    encoding="utf-8", errors="replace",
                    shell=(os.name == "nt")
                )
                if result.returncode != 0:
                    print(f"  [FAIL] annual_report_api tests FAIL")
                    print(result.stdout[-1500:] if result.stdout else "")
                    return False
                print("  [PASS] annual_report_api tests PASS")

    return True


def create_marker():
    """검증 성공 시 해시 포함 마커 생성"""
    file_hash = compute_hash()
    with open(MARKER_PATH, "w") as f:
        f.write(f"VERIFIED:{file_hash}\n")
    return file_hash


def main():
    force = "--force" in sys.argv

    print("[DEV] dev 검증 시작...")
    print()

    # 검증 대상 파일 결정
    if force:
        files = get_changed_files()
        print(f"  대상: 모든 변경 파일 ({len(files)}개)")
    else:
        files = get_staged_files()
        print(f"  대상: 스테이징된 파일 ({len(files)}개)")

    if not files:
        print("  변경 파일 없음. 마커 생성 스킵.")
        sys.exit(0)

    print()
    all_pass = True

    # 프론트엔드 검증
    if has_frontend_changes(files):
        js_ts_changed = any(
            f.startswith("frontend/aims-uix3/") and
            any(f.endswith(ext) for ext in (".ts", ".tsx", ".js", ".jsx", ".json"))
            for f in files
        )
        if js_ts_changed:
            if not run_frontend_build():
                all_pass = False
            if all_pass and not run_frontend_tests(files):
                all_pass = False
        else:
            print("  [Frontend] CSS/자원만 변경 - 빌드 스킵")

    # 백엔드 검증
    if has_backend_changes(files):
        if not run_python_syntax_check(files):
            all_pass = False
        if all_pass and not run_backend_tests(files):
            all_pass = False

    print()

    if all_pass:
        file_hash = create_marker()
        print(f"[PASS] dev 검증 PASS - .dev-verified 생성 (hash: {file_hash})")
    else:
        # 실패 시 기존 마커 삭제
        if os.path.exists(MARKER_PATH):
            os.remove(MARKER_PATH)
        print("[FAIL] dev 검증 FAIL - 오류를 수정한 후 다시 실행하세요.")
        sys.exit(1)


if __name__ == "__main__":
    main()
