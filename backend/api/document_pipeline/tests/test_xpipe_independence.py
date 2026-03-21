"""
xPipe 독립성 검증 테스트 (Phase 3-A)

xpipe 패키지가 document_pipeline 내부 모듈(insurance, routers, services 등)에
의존하지 않는지 검증한다. xpipe는 표준 라이브러리만 사용해야 한다.
"""
import ast
import os
from pathlib import Path

import pytest

# xpipe 소스 디렉토리
XPIPE_DIR = Path(__file__).parent.parent / "xpipe"

# xpipe가 사용해도 되는 모듈 (표준 라이브러리)
ALLOWED_MODULES = frozenset({
    "__future__",
    "abc",
    "argparse",      # CLI
    "asyncio",       # testing.py (async 테스트 러너)
    "dataclasses",
    "enum",
    "importlib",     # CLI status (동적 어댑터 탐색)
    "inspect",       # CLI status (ABC 메서드 목록 조회)
    "json",          # testing.py (테스트 셋 로드)
    "pathlib",       # CLI, testing.py (파일 경로)
    "subprocess",    # CLI test (pytest 실행)
    "sys",           # CLI (sys.exit, sys.executable)
    "tomllib",       # CLI (_get_version, Python 3.11+)
    "typing",
    "warnings",      # deprecation 정책에서 사용 예정
})

# 절대 import하면 안 되는 모듈 패턴 (document_pipeline 내부)
FORBIDDEN_MODULES = frozenset({
    "insurance",
    "routers",
    "services",
    "middleware",
    "config",
    "main",
    "motor",
    "redis",
    "fastapi",
    "httpx",
    "openai",
    "anthropic",
})


def _collect_imports(filepath: Path) -> list[tuple[str, int]]:
    """AST로 파일의 모든 import를 추출한다.

    Returns:
        (모듈명, 라인번호) 튜플 리스트
    """
    source = filepath.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(filepath))

    imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((alias.name.split(".")[0], node.lineno))
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append((node.module.split(".")[0], node.lineno))
    return imports


def _get_xpipe_py_files() -> list[Path]:
    """xpipe 디렉토리의 .py 파일 목록 (pyproject.toml, __pycache__ 제외)"""
    return [
        f for f in XPIPE_DIR.glob("*.py")
        if f.name != "__pycache__"
    ]


class TestXpipeIndependence:
    """xpipe 패키지의 독립성을 검증한다."""

    def test_xpipe_files_exist(self):
        """xpipe 핵심 파일이 존재하는지 확인"""
        expected = {"__init__.py", "adapter.py", "store.py", "queue.py"}
        actual = {f.name for f in _get_xpipe_py_files()}
        assert expected.issubset(actual), f"누락된 파일: {expected - actual}"

    def test_pyproject_toml_exists(self):
        """pyproject.toml이 존재하는지 확인"""
        assert (XPIPE_DIR / "pyproject.toml").exists()

    def test_no_forbidden_imports(self):
        """xpipe가 document_pipeline 내부 모듈을 import하지 않는지 검증"""
        violations = []
        for filepath in _get_xpipe_py_files():
            for module_name, lineno in _collect_imports(filepath):
                if module_name in FORBIDDEN_MODULES:
                    violations.append(
                        f"  {filepath.name}:{lineno} — import {module_name}"
                    )
        assert not violations, (
            "xpipe가 금지된 모듈을 import합니다:\n" + "\n".join(violations)
        )

    def test_only_allowed_external_imports(self):
        """xpipe가 허용된 표준 라이브러리만 사용하는지 검증"""
        violations = []
        for filepath in _get_xpipe_py_files():
            for module_name, lineno in _collect_imports(filepath):
                # xpipe 내부 import는 허용
                if module_name == "xpipe":
                    continue
                if module_name not in ALLOWED_MODULES:
                    violations.append(
                        f"  {filepath.name}:{lineno} — import {module_name}"
                    )
        assert not violations, (
            "xpipe가 허용되지 않은 모듈을 import합니다:\n"
            + "\n".join(violations)
            + f"\n허용 목록: {sorted(ALLOWED_MODULES)}"
        )

    def test_no_relative_imports(self):
        """xpipe가 상대 import를 사용하지 않는지 검증

        독립 패키지로서 절대 import만 사용해야 한다.
        (from .adapter import ... 같은 상대 import 금지)
        """
        violations = []
        for filepath in _get_xpipe_py_files():
            source = filepath.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(filepath))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    if node.level and node.level > 0:
                        violations.append(
                            f"  {filepath.name}:{node.lineno} — "
                            f"from {'.' * node.level}{node.module or ''} import ..."
                        )
        assert not violations, (
            "xpipe에서 상대 import를 사용합니다:\n" + "\n".join(violations)
        )

    def test_abc_classes_defined(self):
        """핵심 ABC 클래스가 import 가능한지 검증"""
        from xpipe import DomainAdapter, DocumentStore, JobQueue
        from xpipe.adapter import (
            Category,
            Detection,
            ClassificationConfig,
            HookResult,
            StageHookAction,
        )

        # ABC 확인
        assert hasattr(DomainAdapter, "__abstractmethods__")
        assert hasattr(DocumentStore, "__abstractmethods__")
        assert hasattr(JobQueue, "__abstractmethods__")

        # 데이터 클래스 확인
        cat = Category(code="test", name="테스트")
        assert cat.code == "test"

        det = Detection(doc_type="test", confidence=0.9)
        assert det.confidence == 0.9

    def test_version_in_pyproject(self):
        """pyproject.toml에 올바른 버전이 명시되어 있는지 확인"""
        try:
            import tomllib  # Python 3.11+
        except ModuleNotFoundError:
            import tomli as tomllib  # Python 3.10 fallback

        pyproject_path = XPIPE_DIR / "pyproject.toml"
        with open(pyproject_path, "rb") as f:
            data = tomllib.load(f)

        assert data["project"]["name"] == "xpipe"
        assert data["project"]["version"] == "0.1.0"
        assert data["project"]["requires-python"] == ">=3.10"
        # 외부 의존성 없음
        assert data["project"]["dependencies"] == []
