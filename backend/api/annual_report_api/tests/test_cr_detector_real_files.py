"""
Customer Review Service PDF 첫 페이지 파싱 자동화 테스트
실제 샘플 PDF 파일을 사용하여 검증

테스트 파일: aims/tools/CustomerReviewService/samples/
- TalkFile_00038235_cm_19.pdf
- TalkFile_00038235_cm_20.pdf
- TalkFile_00038235_cm_21.pdf
- TalkFile_00038235_cm_22.pdf
- TalkFile_00038235_cm_23.pdf
"""

import os
import sys
import pytest

# 프로젝트 루트 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.cr_detector import is_customer_review, extract_cr_metadata_from_first_page


# 샘플 파일 경로
SAMPLES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
    "tools", "CustomerReviewService", "samples"
)

SAMPLE_FILES = [
    "TalkFile_00038235_cm_19.pdf",
    "TalkFile_00038235_cm_20.pdf",
    "TalkFile_00038235_cm_21.pdf",
    "TalkFile_00038235_cm_22.pdf",
    "TalkFile_00038235_cm_23.pdf",
]


class TestCRDetectorRealFiles:
    """실제 PDF 파일을 사용한 Customer Review 감지 테스트"""

    @pytest.fixture(autouse=True)
    def check_samples_exist(self):
        """샘플 디렉토리 존재 확인"""
        if not os.path.exists(SAMPLES_DIR):
            pytest.skip(f"샘플 디렉토리가 없습니다: {SAMPLES_DIR}")

    @pytest.mark.parametrize("filename", SAMPLE_FILES)
    def test_is_customer_review_detection(self, filename):
        """
        모든 샘플 PDF 파일이 Customer Review로 감지되어야 함
        """
        pdf_path = os.path.join(SAMPLES_DIR, filename)

        if not os.path.exists(pdf_path):
            pytest.skip(f"파일이 없습니다: {pdf_path}")

        # 실행
        result = is_customer_review(pdf_path)

        # 검증
        assert result["is_customer_review"] is True, \
            f"{filename}: Customer Review로 감지되지 않음. reason: {result.get('reason')}"

        assert result["confidence"] >= 0.7, \
            f"{filename}: confidence가 너무 낮음 ({result['confidence']})"

        # 필수 키워드 확인
        assert "Customer Review Service" in result["matched_keywords"], \
            f"{filename}: 'Customer Review Service' 키워드 매칭 안됨"

        print(f"✅ {filename}: is_customer_review=True, confidence={result['confidence']}")
        print(f"   매칭된 키워드: {result['matched_keywords']}")

    @pytest.mark.parametrize("filename", SAMPLE_FILES)
    def test_metadata_extraction(self, filename):
        """
        모든 샘플 PDF 파일에서 메타데이터가 추출되어야 함
        """
        pdf_path = os.path.join(SAMPLES_DIR, filename)

        if not os.path.exists(pdf_path):
            pytest.skip(f"파일이 없습니다: {pdf_path}")

        # 실행
        metadata = extract_cr_metadata_from_first_page(pdf_path)

        # 최소 하나의 메타데이터 필드가 있어야 함
        assert len(metadata) > 0, \
            f"{filename}: 메타데이터가 추출되지 않음"

        print(f"✅ {filename}: 메타데이터 추출 완료")
        for key, value in metadata.items():
            print(f"   {key}: {value}")

    @pytest.mark.parametrize("filename", SAMPLE_FILES)
    def test_issue_date_format(self, filename):
        """
        발행일이 YYYY-MM-DD 형식으로 추출되어야 함
        """
        pdf_path = os.path.join(SAMPLES_DIR, filename)

        if not os.path.exists(pdf_path):
            pytest.skip(f"파일이 없습니다: {pdf_path}")

        # 실행
        metadata = extract_cr_metadata_from_first_page(pdf_path)

        # 발행일이 있으면 형식 검증
        if "issue_date" in metadata:
            import re
            date_pattern = r"^\d{4}-\d{2}-\d{2}$"
            assert re.match(date_pattern, metadata["issue_date"]), \
                f"{filename}: 발행일 형식 오류 ({metadata['issue_date']})"
            print(f"✅ {filename}: issue_date={metadata['issue_date']}")
        else:
            print(f"⚠️ {filename}: issue_date 없음 (선택 필드)")


class TestCRDetectorSummary:
    """전체 샘플 파일 통계 테스트"""

    def test_all_files_summary(self):
        """
        전체 샘플 파일 파싱 결과 요약
        """
        if not os.path.exists(SAMPLES_DIR):
            pytest.skip(f"샘플 디렉토리가 없습니다: {SAMPLES_DIR}")

        results = []

        for filename in SAMPLE_FILES:
            pdf_path = os.path.join(SAMPLES_DIR, filename)

            if not os.path.exists(pdf_path):
                continue

            detection = is_customer_review(pdf_path)
            metadata = extract_cr_metadata_from_first_page(pdf_path)

            results.append({
                "filename": filename,
                "is_customer_review": detection["is_customer_review"],
                "confidence": detection["confidence"],
                "matched_keywords": detection["matched_keywords"],
                "metadata": metadata
            })

        # 통계 출력
        print("\n" + "=" * 80)
        print("Customer Review Service 첫 페이지 파싱 테스트 결과")
        print("=" * 80)

        detected_count = sum(1 for r in results if r["is_customer_review"])
        print(f"\n총 {len(results)}개 파일 중 {detected_count}개 감지")

        for result in results:
            print(f"\n📄 {result['filename']}")
            print(f"   감지: {'✅' if result['is_customer_review'] else '❌'}")
            print(f"   신뢰도: {result['confidence']}")
            print(f"   키워드: {', '.join(result['matched_keywords'])}")

            if result["metadata"]:
                print("   메타데이터:")
                for key, value in result["metadata"].items():
                    print(f"     - {key}: {value}")

        print("\n" + "=" * 80)

        # 모든 파일이 감지되었는지 확인
        assert detected_count == len(results), \
            f"{len(results) - detected_count}개 파일이 감지되지 않음"

        # 모든 파일에서 최소 1개의 메타데이터 추출
        files_with_metadata = sum(1 for r in results if r["metadata"])
        assert files_with_metadata == len(results), \
            f"{len(results) - files_with_metadata}개 파일에서 메타데이터 추출 실패"


if __name__ == "__main__":
    # 직접 실행 시
    pytest.main([__file__, "-v", "-s"])
