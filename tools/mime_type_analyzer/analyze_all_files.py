import os
import sys

# src 경로 추가
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from src.docmeta.core import get_file_metadata

def analyze_directory(directory):
    for root, _, files in os.walk(directory):
        for f in files:
            file_path = os.path.join(root, f)
            meta = get_file_metadata(file_path)
            print(f"[분석] {file_path}")
            print(f"  MIME: {meta['mime']}")
            print(f"  Size: {meta['size_bytes']} bytes")
            print(f"  Status: {meta['status']}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python analyze_all_files.py <디렉토리경로>")
        sys.exit(1)

    target_dir = sys.argv[1]
    analyze_directory(target_dir)

