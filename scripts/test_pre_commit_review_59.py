"""
Issue #59 회귀 테스트 — pre_commit_review.py hook 순서 및 main 브랜치 가드.

검증 대상:
  1. check_not_on_main() 이 main/master 브랜치에서 커밋을 차단한다.
  2. check_not_on_main() 이 fix/* 브랜치는 통과시킨다.
  3. AIMS_ALLOW_MAIN_COMMIT=1 환경변수로 main 커밋을 우회할 수 있다.
  4. main() 실행 순서에서 check_dev_verified 가 check_gini_gate 보다 먼저 실행된다.
     → dev 검증 실패 시에도 .gini-approved 마커가 소비되지 않는다.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from unittest import mock

import pytest

_SCRIPT = Path(__file__).parent / "pre_commit_review.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("pre_commit_review", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def mod():
    return _load_module()


# ─────────────────────────────────────────────────────────────
# 1) check_not_on_main 가드
# ─────────────────────────────────────────────────────────────
class TestCheckNotOnMain:
    def test_blocks_main_branch(self, mod, monkeypatch):
        monkeypatch.setattr(mod, "get_current_branch", lambda: "main")
        monkeypatch.delenv("AIMS_ALLOW_MAIN_COMMIT", raising=False)
        err = mod.check_not_on_main()
        assert err is not None
        assert "MAIN PROTECT" in err
        assert "fix/" in err
        assert "AIMS_ALLOW_MAIN_COMMIT" in err

    def test_blocks_master_branch(self, mod, monkeypatch):
        monkeypatch.setattr(mod, "get_current_branch", lambda: "master")
        monkeypatch.delenv("AIMS_ALLOW_MAIN_COMMIT", raising=False)
        err = mod.check_not_on_main()
        assert err is not None
        assert "MAIN PROTECT" in err

    def test_allows_fix_branch(self, mod, monkeypatch):
        monkeypatch.setattr(mod, "get_current_branch", lambda: "fix/some-issue-123")
        assert mod.check_not_on_main() is None

    def test_allows_feat_branch(self, mod, monkeypatch):
        monkeypatch.setattr(mod, "get_current_branch", lambda: "feat/new-thing")
        assert mod.check_not_on_main() is None

    def test_escape_hatch_allows_main(self, mod, monkeypatch, capsys):
        monkeypatch.setattr(mod, "get_current_branch", lambda: "main")
        monkeypatch.setenv("AIMS_ALLOW_MAIN_COMMIT", "1")
        assert mod.check_not_on_main() is None
        err_out = capsys.readouterr().err
        assert "AIMS_ALLOW_MAIN_COMMIT" in err_out


# ─────────────────────────────────────────────────────────────
# 2) main() 호출 순서: dev_verify → gini_gate
# ─────────────────────────────────────────────────────────────
class TestMainHookOrder:
    """
    이슈 #59: check_dev_verified 가 실패하면 Gini 마커는 소비되지 않아야 한다.
    즉, dev_error 발생 시 check_gini_gate 가 호출되면 안 된다.
    """

    def test_dev_verify_failure_does_not_consume_gini_marker(
        self, mod, monkeypatch
    ):
        call_order: list[str] = []

        # git commit 으로 인식
        monkeypatch.setattr(mod, "is_git_commit", lambda data: True)
        monkeypatch.setattr(mod, "get_stdin", lambda: {"tool_input": {"command": "git commit"}})

        # main 브랜치 가드 통과
        monkeypatch.setattr(mod, "get_current_branch", lambda: "fix/sample-999")

        # staged files 존재
        monkeypatch.setattr(mod, "get_staged_diff", lambda: "diff text")
        monkeypatch.setattr(mod, "get_staged_files", lambda: ["backend/api/fake.py", "tests/test_fake.py"])

        def fake_regression(_files):
            call_order.append("regression")
            return None

        def fake_dev(_files):
            call_order.append("dev_verify")
            return "[DEV UNVERIFIED] mocked failure"

        def fake_gini(_input_data):
            call_order.append("gini_gate")
            return True

        monkeypatch.setattr(mod, "check_regression_test", fake_regression)
        monkeypatch.setattr(mod, "check_dev_verified", fake_dev)
        monkeypatch.setattr(mod, "check_gini_gate", fake_gini)

        with pytest.raises(SystemExit) as exc_info:
            mod.main()

        assert exc_info.value.code == 2
        # Gini 게이트는 호출되지 않아야 한다 (마커 소비 안 함)
        assert "gini_gate" not in call_order
        assert "dev_verify" in call_order
        # 그리고 dev_verify 는 regression 이후에 실행된다
        assert call_order.index("dev_verify") > call_order.index("regression")

    def test_main_branch_guard_runs_before_gini_gate(self, mod, monkeypatch):
        """main 브랜치에서 커밋하려 할 때도 Gini 마커가 소비되지 않아야 한다."""
        call_order: list[str] = []

        monkeypatch.setattr(mod, "is_git_commit", lambda data: True)
        monkeypatch.setattr(mod, "get_stdin", lambda: {"tool_input": {"command": "git commit"}})
        monkeypatch.setattr(mod, "get_current_branch", lambda: "main")
        monkeypatch.delenv("AIMS_ALLOW_MAIN_COMMIT", raising=False)

        def fake_gini(_input_data):
            call_order.append("gini_gate")
            return True

        monkeypatch.setattr(mod, "check_gini_gate", fake_gini)

        with pytest.raises(SystemExit) as exc_info:
            mod.main()

        assert exc_info.value.code == 2
        assert call_order == []  # Gini 게이트 호출 없음

    def test_happy_path_calls_gini_last(self, mod, monkeypatch):
        """dev 검증 통과 시에만 Gini 게이트가 호출된다."""
        call_order: list[str] = []

        monkeypatch.setattr(mod, "is_git_commit", lambda data: True)
        monkeypatch.setattr(mod, "get_stdin", lambda: {"tool_input": {"command": "git commit"}})
        monkeypatch.setattr(mod, "get_current_branch", lambda: "fix/issue-59-test")
        monkeypatch.setattr(mod, "get_staged_diff", lambda: "diff text")
        monkeypatch.setattr(mod, "get_staged_files", lambda: ["backend/api/fake.py", "tests/test_fake.py"])

        def fake_regression(_files):
            call_order.append("regression")
            return None

        def fake_dev(_files):
            call_order.append("dev_verify")
            return None

        def fake_gini(_input_data):
            call_order.append("gini_gate")
            return True

        # 후속 체크들도 mock 처리 (빈 결과)
        monkeypatch.setattr(mod, "check_regression_test", fake_regression)
        monkeypatch.setattr(mod, "check_dev_verified", fake_dev)
        monkeypatch.setattr(mod, "check_gini_gate", fake_gini)
        monkeypatch.setattr(mod, "check_issue_recording", lambda _d: None)
        monkeypatch.setattr(mod, "check_eslint_aims_api", lambda _f: None)
        monkeypatch.setattr(mod, "detect_bandaid_patterns", lambda _d, _f: ([], []))
        monkeypatch.setattr(mod, "detect_changed_services", lambda _f: [])
        monkeypatch.setattr(mod, "run_service_tests", lambda _s: [])

        with pytest.raises(SystemExit) as exc_info:
            mod.main()

        assert exc_info.value.code == 0
        assert "regression" in call_order
        assert "dev_verify" in call_order
        assert "gini_gate" in call_order
        # 순서 검증: dev_verify → gini_gate
        assert call_order.index("dev_verify") < call_order.index("gini_gate")
