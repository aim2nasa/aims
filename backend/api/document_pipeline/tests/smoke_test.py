#!/usr/bin/env python3
"""
Smoke Test for Document Pipeline
==================================
배포 후 각 문서 형식의 텍스트 추출 경로가 정상 동작하는지 자동 검증한다.

사용법:
    python tests/smoke_test.py [옵션]

옵션:
    --host HOST         서버 호스트 (기본: localhost)
    --port PORT         서버 포트 (기본: 8100)
    --skip-ocr          OCR 경로(경로3) 테스트 스킵 (크레딧 절약)
    --timeout SECONDS   문서 처리 대기 타임아웃 (기본: 120)
    --keep              테스트 후 문서를 삭제하지 않음

종료 코드:
    0  전체 PASS
    1  일부 FAIL 또는 ERROR
"""
import argparse
import sys
import time
from pathlib import Path
from dataclasses import dataclass

import httpx
from pymongo import MongoClient
from bson import ObjectId

# --- 상수 ---

FIXTURES_DIR = Path(__file__).parent / "fixtures"
KEYWORD = "AIMS_SMOKE_TEST"
USER_ID = "smoke_test_user"

# MongoDB 기본값 (서버 환경)
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "docupload"
MONGO_COLLECTION = "files"


@dataclass
class FixtureFile:
    """테스트 대상 파일 정의"""
    filename: str
    path_type: int          # 1: 직접 파서, 2: PDF 변환, 3: OCR
    check_field: str        # 키워드를 확인할 MongoDB 필드 경로
    mime: str               # Content-Type
    keyword_check: bool = True  # AIMS_SMOKE_TEST 키워드 확인 여부


FIXTURE_FILES = [
    # 경로 1: 직접 파서
    FixtureFile("sample.pdf",  1, "meta.full_text", "application/pdf"),
    FixtureFile("sample.docx", 1, "meta.full_text", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    FixtureFile("sample.xlsx", 1, "meta.full_text", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    FixtureFile("sample.pptx", 1, "meta.full_text", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    # 경로 2: PDF 변환
    FixtureFile("sample.hwp",  2, "meta.full_text", "application/x-hwp", keyword_check=False),  # 프로그래밍 생성 불가 → 텍스트 추출 여부만 확인
    FixtureFile("sample.doc",  2, "meta.full_text", "application/msword"),
    FixtureFile("sample.ppt",  2, "meta.full_text", "application/vnd.ms-powerpoint"),
    FixtureFile("sample.rtf",  2, "meta.full_text", "application/rtf"),
    # 경로 3: OCR
    FixtureFile("sample_scan.pdf", 3, "ocr.full_text", "application/pdf"),
    FixtureFile("sample.jpg",      3, "ocr.full_text", "image/jpeg"),
]


# --- 테스트 실행 ---

class SmokeTestRunner:
    def __init__(self, host: str, port: int, timeout: int, skip_ocr: bool, keep: bool):
        self.base_url = f"http://{host}:{port}"
        self.timeout = timeout
        self.skip_ocr = skip_ocr
        self.keep = keep
        self.results: list[dict] = []
        self.mongo = MongoClient(MONGO_URI)
        self.db = self.mongo[MONGO_DB]
        self.collection = self.db[MONGO_COLLECTION]

    def run(self) -> int:
        """전체 테스트 실행. 0=성공, 1=실패"""
        print(f"\n{'='*60}")
        print(f"  AIMS Document Pipeline Smoke Test")
        print(f"  Server: {self.base_url}")
        print(f"  Timeout: {self.timeout}s | Skip OCR: {self.skip_ocr}")
        print(f"{'='*60}\n")

        # 1. Health check
        if not self._health_check():
            return 1

        # 2. 이전 스모크 테스트 데이터 정리 (해시 충돌 방지)
        self._cleanup()

        # 3. 파일별 테스트
        for fixture in FIXTURE_FILES:
            if self.skip_ocr and fixture.path_type == 3:
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "SKIP",
                    "detail": "OCR skipped (--skip-ocr)",
                })
                continue

            filepath = FIXTURES_DIR / fixture.filename
            if not filepath.exists():
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "SKIP",
                    "detail": f"File not found: {filepath}",
                })
                continue

            self._test_file(fixture, filepath)

        # 4. 결과 출력
        self._print_results()

        # 5. 정리
        if not self.keep:
            self._cleanup()

        self.mongo.close()

        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        errors = sum(1 for r in self.results if r["status"] == "ERROR")
        return 1 if (failed + errors) > 0 else 0

    def _health_check(self) -> bool:
        """서버 health check"""
        print("[1/3] Health check...", end=" ")
        try:
            resp = httpx.get(f"{self.base_url}/health", timeout=10)
            data = resp.json()
            if data.get("status") == "healthy":
                print("OK")
                return True
            print(f"FAIL (status={data.get('status')})")
            return False
        except Exception as e:
            print(f"ERROR ({e})")
            return False

    def _test_file(self, fixture: FixtureFile, filepath: Path):
        """단일 파일 테스트: 업로드 → 대기 → 검증"""
        print(f"\n[Path {fixture.path_type}] {fixture.filename}...", end=" ", flush=True)

        doc_id = None
        try:
            # 업로드
            doc_id = self._upload(filepath, fixture.mime)
            if not doc_id:
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "ERROR",
                    "detail": "Upload failed - no document_id",
                    "doc_id": None,
                })
                return

            # 완료 대기
            doc = self._wait_for_completion(doc_id, fixture)
            if not doc:
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "ERROR",
                    "detail": f"Timeout ({self.timeout}s) waiting for completion",
                    "doc_id": doc_id,
                })
                return

            # 처리 실패 확인
            doc_status = doc.get("overallStatus") or doc.get("status")
            if doc_status in ("failed", "error"):
                err_msg = doc.get("progressMessage") or doc.get("error", {}).get("statusMessage", "unknown")
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "FAIL",
                    "detail": f"Processing failed: {err_msg}",
                    "doc_id": doc_id,
                })
                print(f"FAIL ({err_msg})")
                return

            # 키워드 검증
            text = self._get_nested_field(doc, fixture.check_field)
            if not text:
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "FAIL",
                    "detail": f"Field '{fixture.check_field}' is empty or missing",
                    "doc_id": doc_id,
                })
                print("FAIL (empty text)")
                return

            if not fixture.keyword_check or KEYWORD in text:
                # 경로2 추가 검증: ocr 필드가 없어야 함
                extra = ""
                if fixture.path_type == 2:
                    ocr = doc.get("ocr")
                    if ocr and ocr.get("full_text"):
                        extra = " (WARNING: ocr field exists)"
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "PASS",
                    "detail": f"{'Keyword found' if fixture.keyword_check else 'Text extracted'} in {fixture.check_field}{extra}",
                    "doc_id": doc_id,
                })
                print(f"PASS{extra}")
            else:
                snippet = text[:100] if text else "(empty)"
                self.results.append({
                    "file": fixture.filename,
                    "path": f"Path {fixture.path_type}",
                    "status": "FAIL",
                    "detail": f"Keyword '{KEYWORD}' not found. Text starts with: {snippet}",
                    "doc_id": doc_id,
                })
                print("FAIL (keyword missing)")

        except Exception as e:
            self.results.append({
                "file": fixture.filename,
                "path": f"Path {fixture.path_type}",
                "status": "ERROR",
                "detail": str(e),
                "doc_id": doc_id,
            })
            print(f"ERROR ({e})")

    def _upload(self, filepath: Path, mime: str) -> str | None:
        """파일을 업로드하고 document_id를 반환"""
        with open(filepath, "rb") as f:
            files = {"file": (filepath.name, f, mime)}
            data = {"userId": USER_ID}
            resp = httpx.post(
                f"{self.base_url}/webhook/docprep-main",
                files=files,
                data=data,
                timeout=30,
            )

        if resp.status_code != 200:
            return None

        body = resp.json()
        return body.get("document_id")

    def _wait_for_completion(self, doc_id: str, fixture: FixtureFile) -> dict | None:
        """MongoDB에서 문서 처리 완료를 polling으로 대기"""
        deadline = time.time() + self.timeout
        poll_interval = 2  # 초

        while time.time() < deadline:
            doc = self.collection.find_one({"_id": ObjectId(doc_id)})
            if not doc:
                time.sleep(poll_interval)
                continue

            status = doc.get("overallStatus") or doc.get("status")

            # 실패 상태 즉시 반환
            if status in ("failed", "error"):
                return doc

            # 경로3(OCR): ocr.status == "completed" 확인
            if fixture.path_type == 3:
                ocr = doc.get("ocr", {})
                if isinstance(ocr, dict) and ocr.get("status") == "completed":
                    return doc
            else:
                # 경로1/2: overallStatus == "completed"
                if status == "completed":
                    return doc

            time.sleep(poll_interval)

        # 타임아웃 시 현재 상태라도 반환
        return self.collection.find_one({"_id": ObjectId(doc_id)})

    def _get_nested_field(self, doc: dict, field_path: str):
        """점으로 구분된 필드 경로에서 값을 추출 (예: 'meta.full_text')"""
        parts = field_path.split(".")
        current = doc
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current

    def _print_results(self):
        """결과 테이블 출력"""
        print(f"\n{'='*60}")
        print(f"  Results")
        print(f"{'='*60}")
        print(f"{'File':<20} {'Path':<8} {'Status':<6} Detail")
        print(f"{'-'*20} {'-'*8} {'-'*6} {'-'*24}")

        for r in self.results:
            status_marker = {
                "PASS": "PASS",
                "FAIL": "FAIL",
                "ERROR": "ERR ",
                "SKIP": "SKIP",
            }.get(r["status"], "???")
            print(f"{r['file']:<20} {r['path']:<8} {status_marker:<6} {r['detail']}")

        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        errors = sum(1 for r in self.results if r["status"] == "ERROR")
        skipped = sum(1 for r in self.results if r["status"] == "SKIP")

        print(f"\n  PASS: {passed}  FAIL: {failed}  ERROR: {errors}  SKIP: {skipped}")
        print(f"{'='*60}")

    def _cleanup(self):
        """스모크 테스트로 생성된 문서를 MongoDB에서 삭제"""
        result = self.collection.delete_many({"ownerId": USER_ID})
        if result.deleted_count > 0:
            print(f"[Cleanup] Deleted {result.deleted_count} test documents (ownerId={USER_ID})")
        # 큐에서도 정리
        queue_result = self.db["upload_queue"].delete_many({"owner_id": USER_ID})
        if queue_result.deleted_count > 0:
            print(f"[Cleanup] Deleted {queue_result.deleted_count} queue entries")


def main():
    parser = argparse.ArgumentParser(description="AIMS Document Pipeline Smoke Test")
    parser.add_argument("--host", default="localhost", help="Server host (default: localhost)")
    parser.add_argument("--port", type=int, default=8100, help="Server port (default: 8100)")
    parser.add_argument("--skip-ocr", action="store_true", help="Skip OCR tests (saves credits)")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout per file in seconds (default: 120)")
    parser.add_argument("--keep", action="store_true", help="Keep test documents after run")
    args = parser.parse_args()

    runner = SmokeTestRunner(
        host=args.host,
        port=args.port,
        timeout=args.timeout,
        skip_ocr=args.skip_ocr,
        keep=args.keep,
    )
    sys.exit(runner.run())


if __name__ == "__main__":
    main()
