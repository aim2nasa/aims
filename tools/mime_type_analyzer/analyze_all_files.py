import os
import sys
# file_analyzer.py 파일에서 get_mime_type_from_file 함수를 임포트합니다.
# analyze_all_files.py와 file_analyzer.py가 같은 디렉토리에 있다고 가정합니다.
from file_analyzer import get_mime_type_from_file

def analyze_directory_files(root_dir: str):
    """
    주어진 루트 디렉토리와 모든 하위 디렉토리에 있는 파일들의 MIME 타입을 분석합니다.
    """
    if not os.path.isdir(root_dir):
        print(f"오류: '{root_dir}'는 유효한 디렉토리가 아닙니다.", file=sys.stderr)
        return

    print(f"--- '{root_dir}' 디렉토리의 모든 파일 MIME 타입 분석 시작 ---")
    print("-" * 50)

    # os.walk를 사용하여 디렉토리 트리를 탐색합니다.
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # 현재 디렉토리의 파일들을 순회합니다.
        for filename in filenames:
            file_full_path = os.path.join(dirpath, filename)
            
            # get_mime_type_from_file 함수를 호출하여 MIME 타입을 얻습니다.
            mime_type, error = get_mime_type_from_file(file_full_path)

            if mime_type:
                print(f"파일: '{file_full_path}' -> MIME 타입: {mime_type}")
            elif error:
                print(f"파일: '{file_full_path}' -> 분석 실패: {error}")
            else:
                print(f"파일: '{file_full_path}' -> MIME 타입을 알 수 없습니다.")
    
    print("-" * 50)
    print("--- 모든 파일 MIME 타입 분석 완료 ---")

# --- CLI 실행을 위한 메인 블록 ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python analyze_all_files.py <분석_시작_디렉토리_경로>")
        print("예시: python analyze_all_files.py D:\\aims\\samples")
        sys.exit(1)

    # 명령줄 인자로 받은 분석 시작 디렉토리 경로를 사용
    target_directory = sys.argv[1]
    analyze_directory_files(target_directory)