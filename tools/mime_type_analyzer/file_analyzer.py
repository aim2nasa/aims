import magic
import os
import sys
import shutil
import tempfile
import uuid # 고유한 파일명 생성을 위해 추가
from typing import Optional, Tuple

def get_mime_type_from_file(file_path: str) -> Tuple[Optional[str], Optional[str]]:
    """
    주어진 파일 경로에서 MIME 타입을 분석합니다.
    한글 경로/파일명 문제를 해결하기 위해 파일을 임시 영문 파일명으로 복사 후 분석합니다.
    """
    if not os.path.exists(file_path):
        error_msg = f"오류: '{file_path}' 파일을 찾을 수 없습니다."
        print(error_msg, file=sys.stderr)
        return None, error_msg

    temp_file_path = None
    original_extension = os.path.splitext(file_path)[1] # 원본 파일 확장자 추출
    
    try:
        # 1. 임시 디렉토리 생성 (시스템 기본 임시 경로 - 보통 영문)
        with tempfile.TemporaryDirectory() as tmpdir:
            # 2. 임시 파일명 생성 (고유한 영문 이름 + 원본 확장자)
            # UUID를 사용하여 완전히 중복되지 않는 영문 파일명을 만듭니다.
            temp_filename = str(uuid.uuid4()) + original_extension
            temp_file_path = os.path.join(tmpdir, temp_filename)

            # 3. 원본 파일을 생성된 임시 영문 파일명으로 복사
            shutil.copy2(file_path, temp_file_path)

            # 4. 복사된 임시 파일 경로를 사용하여 MIME 타입 분석
            mime_type = magic.from_file(temp_file_path, mime=True)
            return mime_type, None
    except magic.MagicException as e:
        error_msg = f"오류: '{file_path}' (임시 파일명: '{temp_file_path}') 분석 중 Magic 라이브러리 오류 발생: {e}"
        print(error_msg, file=sys.stderr)
        return None, error_msg
    except Exception as e:
        error_msg = f"오류: '{file_path}' (임시 파일명: '{temp_file_path}') 분석 중 예기치 않은 오류 발생: {e}"
        print(error_msg, file=sys.stderr)
        return None, error_msg
    finally:
        # TemporaryDirectory를 사용하면 블록이 끝나면 임시 디렉토리와 그 안의 파일이 자동으로 삭제됩니다.
        pass

# --- CLI 실행을 위한 메인 블록 ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python file_analyzer.py <파일_경로>")
        sys.exit(1)

    file_path_to_analyze = sys.argv[1]

    print("--- 파일 MIME 타입 분석 시작 ---")
    mime_type, error = get_mime_type_from_file(file_path_to_analyze)

    if mime_type:
        print(f"'{file_path_to_analyze}'의 MIME 타입: {mime_type}")
    elif error:
        print(f"'{file_path_to_analyze}' 분석 실패: {error}")
    else:
        print(f"'{file_path_to_analyze}'의 MIME 타입을 알 수 없습니다.")

    print("--- 분석 완료 ---")