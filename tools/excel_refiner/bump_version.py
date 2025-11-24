#!/usr/bin/env python3
"""
버전 증가 스크립트

버전 형식: 0.a.b
- a: 중간 버전 (수동 지정)
- b: 패치 버전 (자동 증가)

사용법:
  python bump_version.py         # 패치 버전 증가 (0.2.0 -> 0.2.1)
  python bump_version.py minor   # 중간 버전 증가 (0.2.0 -> 0.3.0)
  python bump_version.py 0.5.0   # 특정 버전으로 설정
"""

import sys
from pathlib import Path


def read_version():
    """현재 버전 읽기"""
    version_file = Path(__file__).parent / 'VERSION'
    if version_file.exists():
        return version_file.read_text().strip()
    return "0.2.0"


def write_version(version):
    """버전 파일에 쓰기"""
    version_file = Path(__file__).parent / 'VERSION'
    version_file.write_text(version)
    print(f"[OK] 버전 업데이트: {version}")


def parse_version(version_str):
    """버전 문자열을 (major, minor, patch)로 파싱"""
    parts = version_str.split('.')
    if len(parts) != 3:
        raise ValueError(f"잘못된 버전 형식: {version_str} (0.a.b 형식이어야 함)")
    return tuple(int(p) for p in parts)


def bump_patch(version_str):
    """패치 버전 증가 (0.2.0 -> 0.2.1)"""
    major, minor, patch = parse_version(version_str)
    return f"{major}.{minor}.{patch + 1}"


def bump_minor(version_str):
    """중간 버전 증가 (0.2.0 -> 0.3.0)"""
    major, minor, patch = parse_version(version_str)
    return f"{major}.{minor + 1}.0"


def main():
    current = read_version()
    print(f"현재 버전: {current}")

    if len(sys.argv) == 1:
        # 인자 없음 -> 패치 버전 증가
        new_version = bump_patch(current)
    elif sys.argv[1] == "minor":
        # "minor" -> 중간 버전 증가
        new_version = bump_minor(current)
    else:
        # 특정 버전 지정
        new_version = sys.argv[1]
        # 유효성 검사
        try:
            parse_version(new_version)
        except ValueError as e:
            print(f"[ERROR] 오류: {e}")
            sys.exit(1)

    write_version(new_version)
    print(f"새 버전: {new_version}")


if __name__ == "__main__":
    main()
