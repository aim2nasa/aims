#!/usr/bin/env python3
"""
VERSION 파일의 patch 버전을 자동으로 증가시키는 스크립트.
Pre-commit hook에서 사용됩니다.

사용법:
    python bump_version.py <VERSION_파일_경로>

예시:
    python bump_version.py backend/api/aims_api/VERSION
"""

import sys
from pathlib import Path


def bump_patch_version(version_file: Path) -> str:
    """
    VERSION 파일에서 patch 버전을 1 증가시킵니다.

    Args:
        version_file: VERSION 파일 경로

    Returns:
        새 버전 문자열
    """
    if not version_file.exists():
        print(f"ERROR: VERSION 파일을 찾을 수 없습니다: {version_file}")
        sys.exit(1)

    # 현재 버전 읽기
    current_version = version_file.read_text().strip()

    # 버전 파싱 (예: 0.1.0 -> major=0, minor=1, patch=0)
    parts = current_version.split('.')
    if len(parts) != 3:
        print(f"ERROR: 올바르지 않은 버전 형식입니다: {current_version}")
        print("       예상 형식: major.minor.patch (예: 0.1.0)")
        sys.exit(1)

    try:
        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        print(f"ERROR: 버전 번호가 숫자가 아닙니다: {current_version}")
        sys.exit(1)

    # patch 버전 증가
    new_patch = patch + 1
    new_version = f"{major}.{minor}.{new_patch}"

    # 새 버전 저장
    version_file.write_text(new_version + '\n')

    print(f"  {current_version} -> {new_version}")
    return new_version


def main():
    if len(sys.argv) < 2:
        print("사용법: python bump_version.py <VERSION_파일_경로>")
        sys.exit(1)

    version_file = Path(sys.argv[1])
    bump_patch_version(version_file)


if __name__ == "__main__":
    main()
