"""
xPipe CLI — 패키지 상태 확인, 테스트 실행, 버전 조회

사용법:
    python -m xpipe status    → 패키지 정보 + ABC 정의 상태 출력
    python -m xpipe test      → 내장 테스트 실행 (pytest 호출)
    python -m xpipe version   → 버전 출력

xpipe 패키지 독립성 유지: 표준 라이브러리만 사용.
"""
from __future__ import annotations

import argparse
import importlib
import inspect
import subprocess
import sys
from pathlib import Path


def _get_version() -> str:
    """pyproject.toml에서 버전을 읽는다."""
    pyproject_path = Path(__file__).parent / "pyproject.toml"
    if not pyproject_path.exists():
        return "unknown"

    # 표준 라이브러리만 사용하여 TOML 파싱 (정규식 불필요한 간단한 파싱)
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:
        # Python 3.10 fallback: 간단한 문자열 파싱
        text = pyproject_path.read_text(encoding="utf-8")
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("version"):
                # version = "0.1.0"
                parts = stripped.split("=", 1)
                if len(parts) == 2:
                    return parts[1].strip().strip('"').strip("'")
        return "unknown"

    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)
    return data.get("project", {}).get("version", "unknown")


def _cmd_version(_args: argparse.Namespace) -> int:
    """버전 출력"""
    print(f"xpipe {_get_version()}")
    return 0


def _cmd_status(_args: argparse.Namespace) -> int:
    """패키지 정보 + ABC 정의 상태 출력"""
    version = _get_version()
    print(f"xpipe v{version}")
    print()

    # ABC 목록
    from xpipe.adapter import DomainAdapter
    from xpipe.store import DocumentStore
    from xpipe.queue import JobQueue

    abcs = [
        ("DomainAdapter", DomainAdapter),
        ("DocumentStore", DocumentStore),
        ("JobQueue", JobQueue),
    ]

    print("=== ABC 정의 ===")
    for name, cls in abcs:
        abstract_methods = []
        optional_methods = []
        for method_name, method in inspect.getmembers(cls, predicate=inspect.isfunction):
            if method_name.startswith("_"):
                continue
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.append(method_name)
            else:
                optional_methods.append(method_name)

        print(f"\n  {name}:")
        print(f"    abstract 메서드 ({len(abstract_methods)}개):")
        for m in sorted(abstract_methods):
            print(f"      - {m}")
        if optional_methods:
            print(f"    선택적 메서드 ({len(optional_methods)}개):")
            for m in sorted(optional_methods):
                print(f"      - {m}")

    # 등록된 어댑터 탐색 (동적 import — xpipe 독립성 유지)
    print("\n=== 등록된 어댑터 ===")
    try:
        ins_module = importlib.import_module("insurance.adapter")
        adapter_cls = getattr(ins_module, "InsuranceDomainAdapter")
        adapter = adapter_cls()
        print(f"  - InsuranceDomainAdapter (insurance.adapter)")
        print(f"    DomainAdapter 구현: {'OK' if isinstance(adapter, DomainAdapter) else 'FAIL'}")
    except (ImportError, AttributeError):
        print("  (어댑터를 찾을 수 없습니다. insurance 패키지가 경로에 있는지 확인하세요)")

    return 0


def _cmd_test(args: argparse.Namespace) -> int:
    """내장 테스트 실행 (pytest 호출)"""
    # xpipe 테스트 디렉토리
    xpipe_dir = Path(__file__).parent
    tests_dir = xpipe_dir / "tests"

    # pytest 인수 구성
    pytest_args = [sys.executable, "-m", "pytest"]

    # 테스트 경로 결정
    test_paths = []
    if tests_dir.exists():
        test_paths.append(str(tests_dir))

    # document_pipeline/tests의 xpipe 관련 테스트도 포함
    dp_tests_dir = xpipe_dir.parent / "tests"
    xpipe_test_files = [
        dp_tests_dir / "test_adapter_contract.py",
        dp_tests_dir / "test_xpipe_independence.py",
    ]
    for tf in xpipe_test_files:
        if tf.exists():
            test_paths.append(str(tf))

    if not test_paths:
        print("테스트 파일을 찾을 수 없습니다.")
        return 1

    pytest_args.extend(test_paths)
    pytest_args.append("-v")

    # 추가 인수 전달
    if hasattr(args, "extra") and args.extra:
        pytest_args.extend(args.extra)

    print(f"테스트 실행: {' '.join(pytest_args)}")
    print()

    result = subprocess.run(pytest_args, cwd=str(xpipe_dir.parent))
    return result.returncode


def main() -> None:
    """CLI 엔트리포인트"""
    parser = argparse.ArgumentParser(
        prog="xpipe",
        description="xPipe - Domain-agnostic document processing engine",
    )
    subparsers = parser.add_subparsers(dest="command", help="사용 가능한 명령")

    # version
    sub_version = subparsers.add_parser("version", help="버전 출력")
    sub_version.set_defaults(func=_cmd_version)

    # status
    sub_status = subparsers.add_parser("status", help="패키지 상태 확인")
    sub_status.set_defaults(func=_cmd_status)

    # test
    sub_test = subparsers.add_parser("test", help="내장 테스트 실행")
    sub_test.set_defaults(func=_cmd_test)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
