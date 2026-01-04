#!/usr/bin/env python3
"""
PDF Proxy Thumbnail API Tests
@since 2026-01-05

썸네일 API 자동화 테스트
"""

import requests
import sys
from pathlib import Path

# 테스트 설정
BASE_URL = "http://localhost:8002"
TEST_PDF_PATH = None  # 동적으로 찾음


def find_test_pdf():
    """테스트용 PDF 파일 찾기"""
    files_dir = Path("/data/files")
    if not files_dir.exists():
        return None

    for pdf_file in files_dir.rglob("*.pdf"):
        # /data/files/ 이후의 상대 경로 반환
        return str(pdf_file.relative_to(files_dir))
    return None


def test_health_check():
    """헬스 체크 테스트"""
    print("🧪 Testing health check...")
    resp = requests.get(f"{BASE_URL}/health")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    data = resp.json()
    assert data["status"] == "healthy", f"Expected healthy, got {data['status']}"
    assert "thumbnail" in data.get("service", "") or data.get("service") == "pdf-proxy"
    print("   ✅ Health check passed")
    return True


def test_thumbnail_basic(pdf_path: str):
    """기본 썸네일 생성 테스트"""
    print(f"🧪 Testing basic thumbnail generation for: {pdf_path}")
    resp = requests.get(f"{BASE_URL}/thumbnail/{pdf_path}")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert resp.headers.get("content-type") == "image/jpeg", \
        f"Expected image/jpeg, got {resp.headers.get('content-type')}"
    assert len(resp.content) > 100, "Thumbnail too small, likely invalid"

    # JPEG 시그니처 확인
    assert resp.content[:2] == b'\xff\xd8', "Not a valid JPEG file"

    print(f"   ✅ Thumbnail generated: {len(resp.content)} bytes")
    return True


def test_thumbnail_custom_width(pdf_path: str):
    """커스텀 너비 썸네일 테스트"""
    print(f"🧪 Testing custom width thumbnail...")

    # 작은 너비
    resp_small = requests.get(f"{BASE_URL}/thumbnail/{pdf_path}?width=100")
    assert resp_small.status_code == 200

    # 큰 너비
    resp_large = requests.get(f"{BASE_URL}/thumbnail/{pdf_path}?width=400")
    assert resp_large.status_code == 200

    # 큰 이미지가 더 커야 함
    assert len(resp_large.content) > len(resp_small.content), \
        "Larger width should produce larger file"

    print(f"   ✅ Custom width test passed (100px: {len(resp_small.content)}B, 400px: {len(resp_large.content)}B)")
    return True


def test_thumbnail_caching(pdf_path: str):
    """캐싱 테스트"""
    print(f"🧪 Testing thumbnail caching...")

    # 첫 번째 요청
    resp1 = requests.get(f"{BASE_URL}/thumbnail/{pdf_path}?width=150")
    assert resp1.status_code == 200

    # 두 번째 요청 (캐시에서 반환되어야 함)
    resp2 = requests.get(f"{BASE_URL}/thumbnail/{pdf_path}?width=150")
    assert resp2.status_code == 200

    # 동일한 콘텐츠
    assert resp1.content == resp2.content, "Cache should return identical content"

    print(f"   ✅ Caching test passed")
    return True


def test_thumbnail_404():
    """존재하지 않는 파일 테스트"""
    print(f"🧪 Testing 404 for non-existent file...")
    resp = requests.get(f"{BASE_URL}/thumbnail/nonexistent/file.pdf")
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
    print(f"   ✅ 404 test passed")
    return True


def test_thumbnail_invalid_type():
    """PDF가 아닌 파일 테스트"""
    print(f"🧪 Testing 400 for non-PDF file...")
    resp = requests.get(f"{BASE_URL}/thumbnail/test.txt")
    assert resp.status_code in [400, 404], f"Expected 400 or 404, got {resp.status_code}"
    print(f"   ✅ Invalid type test passed")
    return True


def test_thumbnail_width_limits():
    """너비 제한 테스트"""
    print(f"🧪 Testing width limits...")

    # 너무 작은 너비 (50 미만)
    resp = requests.get(f"{BASE_URL}/thumbnail/test.pdf?width=10")
    # 유효성 검사로 422 또는 400 반환 예상
    assert resp.status_code in [400, 404, 422], f"Expected validation error, got {resp.status_code}"

    # 너무 큰 너비 (800 초과)
    resp = requests.get(f"{BASE_URL}/thumbnail/test.pdf?width=1000")
    assert resp.status_code in [400, 404, 422], f"Expected validation error, got {resp.status_code}"

    print(f"   ✅ Width limits test passed")
    return True


def run_tests():
    """모든 테스트 실행"""
    print("=" * 50)
    print("PDF Proxy Thumbnail API Tests")
    print("=" * 50)

    # 서버 연결 확인
    try:
        requests.get(f"{BASE_URL}/health", timeout=5)
    except Exception as e:
        print(f"❌ Cannot connect to server at {BASE_URL}: {e}")
        return False

    # 테스트용 PDF 찾기
    pdf_path = find_test_pdf()
    if not pdf_path:
        print("⚠️  No PDF files found in /data/files, skipping file-based tests")
        pdf_path = None
    else:
        print(f"📄 Using test PDF: {pdf_path}")

    passed = 0
    failed = 0

    tests = [
        ("Health Check", lambda: test_health_check()),
        ("404 Not Found", lambda: test_thumbnail_404()),
        ("Invalid File Type", lambda: test_thumbnail_invalid_type()),
        ("Width Limits", lambda: test_thumbnail_width_limits()),
    ]

    # PDF 파일이 있을 때만 실행하는 테스트
    if pdf_path:
        tests.extend([
            ("Basic Thumbnail", lambda: test_thumbnail_basic(pdf_path)),
            ("Custom Width", lambda: test_thumbnail_custom_width(pdf_path)),
            ("Caching", lambda: test_thumbnail_caching(pdf_path)),
        ])

    for name, test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"   ❌ {name} FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"   ❌ {name} ERROR: {e}")
            failed += 1

    print("=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)

    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
