"""
DB Gateway 아키텍처 규칙 강제 테스트

aims_api를 files/customers 컬렉션의 유일한 데이터 게이트웨이로 유지하기 위해,
다른 서비스에서 files/customers 컬렉션에 직접 write하는 코드가 잔존하면 테스트를 실패시킨다.

Phase 1~4에서 전환 완료된 write 접근이 다시 도입되는 것을 방지하는 regression guard.

실행:
  python -m pytest tests/architecture/test_db_gateway_enforcement.py -v
  또는
  python tests/architecture/test_db_gateway_enforcement.py
"""
import os
import re
import sys

# 프로젝트 루트 기준
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 검사 대상 서비스 디렉토리 (aims_api는 게이트웨이이므로 제외)
TARGET_SERVICES = [
    os.path.join(PROJECT_ROOT, "backend", "api", "annual_report_api"),
    os.path.join(PROJECT_ROOT, "backend", "api", "document_pipeline"),
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_rag_api"),
    os.path.join(PROJECT_ROOT, "backend", "api", "aims_mcp"),
]

# files/customers 컬렉션 직접 write 패턴
# update_one, insert_one, delete_one, update_many, delete_many, find_one_and_update, replace_one, bulk_write
WRITE_OPS = r'\.(update_one|insert_one|delete_one|update_many|delete_many|find_one_and_update|replace_one|bulk_write)\('

# 컬렉션 접근 패턴 (files 또는 customers)
COLLECTION_PATTERNS = [
    # db["files"].update_one(...)
    r'db\[[\"\']files[\"\']\]\.' + WRITE_OPS.lstrip(r'\.'),
    # db["customers"].update_one(...)
    r'db\[[\"\']customers[\"\']\]\.' + WRITE_OPS.lstrip(r'\.'),
    # files_collection.update_one(...)
    r'files_collection\.' + WRITE_OPS.lstrip(r'\.'),
    # customers_collection.update_one(...)
    r'customers_collection\.' + WRITE_OPS.lstrip(r'\.'),
    # ctx.files_collection.update_one(...)
    r'ctx\.files_collection\.' + WRITE_OPS.lstrip(r'\.'),
    # db.files.update_one(...)
    r'db\.files\.' + WRITE_OPS.lstrip(r'\.'),
    # db.customers.update_one(...)
    r'db\.customers\.' + WRITE_OPS.lstrip(r'\.'),
    # collection.update_one(...) — 변수명이 files/customers 컬렉션을 가리키는 경우는 별도 주석으로 제외
    # MongoService.get_collection("files") 이후 write — 이미 Phase 4에서 전환됨
    r'files_col\.' + WRITE_OPS.lstrip(r'\.'),
]

# 제외 패턴: 테스트 파일, 스크립트, 큐/모니터링 컬렉션
EXCLUDE_DIRS = {
    "tests", "test", "__tests__", "scripts", "golden_master", "e2e", "__pycache__", "node_modules",
}

EXCLUDE_FILES = {
    "conftest.py",
}

# 주석 처리된 코드는 무시
COMMENT_PATTERN = re.compile(r'^\s*#')


def find_violations():
    """모든 대상 서비스에서 files/customers 직접 write 접근을 탐색"""
    violations = []
    compiled_patterns = [re.compile(p) for p in COLLECTION_PATTERNS]

    for service_dir in TARGET_SERVICES:
        if not os.path.exists(service_dir):
            continue

        for root, dirs, files in os.walk(service_dir):
            # 제외 디렉토리 스킵
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            for filename in files:
                if not filename.endswith(".py") and not filename.endswith(".ts") and not filename.endswith(".js"):
                    continue
                if filename in EXCLUDE_FILES:
                    continue

                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, PROJECT_ROOT)

                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        for line_num, line in enumerate(f, 1):
                            # 주석 무시
                            if COMMENT_PATTERN.match(line):
                                continue
                            # TODO 주석 안의 코드 무시
                            if "TODO" in line and "#" in line:
                                continue

                            for pattern in compiled_patterns:
                                if pattern.search(line):
                                    violations.append({
                                        "file": rel_path.replace("\\", "/"),
                                        "line": line_num,
                                        "code": line.strip()[:120],
                                    })
                except (UnicodeDecodeError, PermissionError):
                    continue

    return violations


def test_no_direct_db_write_to_files_customers():
    """
    [아키텍처 규칙] files/customers 컬렉션 직접 write 금지

    aims_api의 Internal API를 경유해야 합니다.
    위반 발견 시 이 테스트가 실패합니다.

    허용 예외:
    - tests/, scripts/, golden_master/, e2e/ 디렉토리
    - 주석 처리된 코드
    - upload_queue, pdf_conversion_queue, ar_parse_queue, shadow_*, errors 등 자체 컬렉션
    """
    violations = find_violations()

    if violations:
        msg_lines = [
            "",
            "=" * 70,
            "DB GATEWAY 아키텍처 규칙 위반 발견!",
            "=" * 70,
            "",
            "files/customers 컬렉션에 직접 write하는 코드가 발견되었습니다.",
            "aims_api의 Internal API를 경유해야 합니다.",
            "",
            "위반 목록:",
        ]
        for v in violations:
            msg_lines.append(f"  {v['file']}:{v['line']}  →  {v['code']}")
        msg_lines.extend([
            "",
            "해결 방법:",
            "  1. internal_api.py의 create_file/update_file/delete_file 등을 사용하세요",
            "  2. 테스트 코드라면 tests/ 디렉토리에 배치하세요",
            "  3. 스크립트라면 scripts/ 디렉토리에 배치하세요",
            "=" * 70,
        ])
        assert False, "\n".join(msg_lines)


# standalone 실행 지원
if __name__ == "__main__":
    violations = find_violations()
    if violations:
        print("=" * 70)
        print("DB GATEWAY 아키텍처 규칙 위반 발견!")
        print("=" * 70)
        print()
        for v in violations:
            print(f"  {v['file']}:{v['line']}  →  {v['code']}")
        print()
        print(f"총 {len(violations)}건 위반")
        sys.exit(1)
    else:
        print("DB Gateway 아키텍처 규칙 검사 통과 (위반 0건)")
        sys.exit(0)
