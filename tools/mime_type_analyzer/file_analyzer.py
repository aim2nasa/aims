import magic
import os
import sys
import shutil
import tempfile
import uuid
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
    original_extension = os.path.splitext(file_path)[1].lower()  # 소문자 확장자

    try:
        # 임시 디렉토리 생성 후 복사 (한글 경로 문제 해결)
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_filename = str(uuid.uuid4()) + original_extension
            temp_file_path = os.path.join(tmpdir, temp_filename)
            shutil.copy2(file_path, temp_file_path)

            # libmagic으로 MIME 분석
            mime_type = magic.from_file(temp_file_path, mime=True)

            # --- 확장자 기반 후처리 매핑 ---
            extension_based_map = {
                ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".xls": "application/vnd.ms-excel",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".doc": "application/msword",
                ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                ".ppt": "application/vnd.ms-powerpoint",
                ".hwp": "application/x-hwp",
                ".ai": "application/pdf",  # Illustrator 파일은 PDF 기반
            }

            # magic이 zip이나 octet-stream으로만 반환되면 확장자로 보정
            if mime_type in ("application/zip", "application/octet-stream"):
                if original_extension in extension_based_map:
                    mime_type = extension_based_map[original_extension]

            return mime_type, None

    except magic.MagicException as e:
        error_msg = (
            f"오류: '{file_path}' (임시 파일명: '{temp_file_path}') 분석 중 "
            f"Magic 라이브러리 오류 발생: {e}"
        )
        print(error_msg, file=sys.stderr)
        return None, error_msg
    except Exception as e:
        error_msg = (
            f"오류: '{file_path}' (임시 파일명: '{temp_file_path}') 분석 중 "
            f"예기치 않은 오류 발생: {e}"
        )
        print(error_msg, file=sys.stderr)
        return None, error_msg


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python file_analyzer.py <파일 경로>")
        sys.exit(1)

    file_path = sys.argv[1]

    print("--- 파일 MIME 타입 분석 시작 ---")
    mime_type, error = get_mime_type_from_file(file_path)
    if error:
        print(f"오류: {error}")
    else:
        print(f"'{file_path}'의 MIME 타입: {mime_type}")
    print("--- 분석 완료 ---")
