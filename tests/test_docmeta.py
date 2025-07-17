import unittest
import os
import sys
from src.docmeta.core import get_file_metadata

SAMPLES_DIR = "samples"
VERBOSE = "-v" in sys.argv  # unittest 실행 옵션 확인

class TestDocMetaDynamic(unittest.TestCase):
    def test_all_samples(self):
        all_files = []
        for root, _, files in os.walk(SAMPLES_DIR):
            for f in files:
                all_files.append(os.path.join(root, f))

        # 샘플 파일 없으면 실패
        self.assertTrue(len(all_files) > 0, "samples 폴더에 테스트할 파일이 없습니다!")

        for file_path in all_files:
            with self.subTest(file=file_path):
                meta = get_file_metadata(file_path)

                # 기본 검증
                self.assertIn("filename", meta, f"filename 누락됨: {file_path}")
                self.assertEqual(meta["extension"], os.path.splitext(file_path)[1],
                                 f"확장자 불일치: {file_path} → {meta['extension']}")
                self.assertIsNotNone(meta["mime"], f"MIME 감지 실패: {file_path}")
                self.assertGreaterEqual(meta["size_bytes"], 0, f"파일 크기 이상: {file_path}")
                self.assertIn(meta["status"], ["ok", "not_found"],
                              f"status 이상: {file_path} → {meta['status']}")

                # 이미지라면 exif 필드 반드시 dict
                if meta["mime"].startswith("image/"):
                    self.assertIn("exif", meta, f"EXIF 필드 누락됨: {file_path}")
                    self.assertIsInstance(meta["exif"], dict, f"EXIF 필드 타입 오류: {file_path}")

                if VERBOSE:
                    print(f"ok: {file_path} → mime={meta['mime']}")

