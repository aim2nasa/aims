"""
error_logger regression test
- requests 의존성 제거 후 import 정상 동작 검증
- report_to_admin / report_to_admin_sync 메서드 존재 검증
"""
import ast
import pathlib


def test_error_logger_no_requests_dependency():
    """error_logger.py가 requests 모듈을 최상단 import하지 않는지 검증"""
    src = pathlib.Path(__file__).resolve().parent.parent / "workers" / "error_logger.py"
    tree = ast.parse(src.read_text(encoding="utf-8"))

    top_level_imports = [
        node.names[0].name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import) and hasattr(node, "col_offset") and node.col_offset == 0
    ]
    assert "requests" not in top_level_imports, (
        "error_logger.py must not top-level import 'requests' — "
        "document_pipeline venv does not have it"
    )


def test_error_logger_has_admin_methods():
    """report_to_admin 및 report_to_admin_sync 메서드 존재 검증"""
    src = pathlib.Path(__file__).resolve().parent.parent / "workers" / "error_logger.py"
    tree = ast.parse(src.read_text(encoding="utf-8"))

    method_names = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    assert "report_to_admin" in method_names
    assert "report_to_admin_sync" in method_names


def test_error_logger_uses_direct_mongo_not_http():
    """report_to_admin이 HTTP 호출 대신 MongoDB 직접 기록을 사용하는지 검증"""
    src = pathlib.Path(__file__).resolve().parent.parent / "workers" / "error_logger.py"
    content = src.read_text(encoding="utf-8")
    assert "aims_analytics" in content, "report_to_admin should write to aims_analytics DB"
    assert "requests.post" not in content, "Should not use requests.post"
    # AIMS_API_URL/api/error-logs 직접 호출이 없어야 함 (아키텍처 규칙)
    assert 'AIMS_API_URL}/api/error-logs' not in content, (
        "Should not call AIMS_API_URL/api/error-logs directly"
    )
