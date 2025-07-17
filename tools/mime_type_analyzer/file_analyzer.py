import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from src.docmeta.core import get_file_metadata

def analyze_file(file_path: str):
    meta = get_file_metadata(file_path)
    print(f"[분석 결과] {meta}")
    return meta

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python file_analyzer.py <파일경로>")
        sys.exit(1)

    analyze_file(sys.argv[1])

