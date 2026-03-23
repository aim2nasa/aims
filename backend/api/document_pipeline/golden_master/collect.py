"""
Golden Master — 테스트 문서 수집 스크립트

프로덕션 DB에서 대표 문서를 층화 추출(stratified sampling)하고,
현재 처리 결과를 정답 스냅샷으로 저장한다.

실행:
    cd ~/aims/backend/api/document_pipeline
    python -m golden_master.collect [--output-dir ./golden_master/snapshots] [--max-per-type 10]

출력:
    golden_master/snapshots/
    ├── manifest.json          # 전체 테스트 셋 목록
    ├── gm_0001.json           # 문서별 스냅샷 (DB 결과 + 기대값)
    ├── gm_0002.json
    └── files/                 # 실제 파일 복사본
        ├── gm_0001.pdf
        └── gm_0002.jpg
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pymongo import MongoClient

# ──────────────────────────────────────────────
# 샘플링 설정
# ──────────────────────────────────────────────

SAMPLING_PLAN = {
    # ── 정상 경로: document_type별 ──
    "normal_by_type": {
        "annual_report": 10,       # AR (가장 중요)
        "customer_review": 10,     # CRS
        None: 15,                  # 미분류 (일반 문서, 가장 많음)
        "policy": 5,               # 보험증권
        "proposal": 5,             # 청약서
        "application": 3,          # 보험신청서
        "medical_receipt": 1,      # 진료비영수증
        "bank_account": 1,         # 통장사본
        "unclassifiable": 1,       # 분류 불가
    },
    # ── 정상 경로: MIME 타입별 (document_type 무관, 추가 커버리지) ──
    "normal_by_mime": {
        "image/jpeg": 8,
        "image/png": 3,
        "application/x-hwp": 5,                                           # HWP 변환
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 3,  # XLSX
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 3,  # DOCX
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": 2,  # PPTX
        "application/vnd.ms-excel": 2,                                    # XLS
        "text/plain": 1,
    },
    # ── 오류 경로 ──
    "error_skip_reasons": {
        "unsupported_format": 5,   # ZIP, PS 등
        "conversion_failed": 5,    # PPT 변환 실패 등
    },
    "error_statuses": {
        "credit_pending": 1,       # 크레딧 부족 대기
        "failed": 3,               # 처리 실패 (있는 만큼)
    },
    # ── 특수 상태 ──
    "special": {
        "ar_parsing_completed": 5,   # AR 파싱까지 완료된 것
        "ar_parsing_pending": 2,     # AR 파싱 대기 중
        "docembed_done": 5,          # 임베딩 완료
        "docembed_failed": 2,        # 임베딩 실패
        "has_ocr": 5,                # OCR 거친 문서
    },
}

FILE_BASE_PATH = os.environ.get("FILE_BASE_PATH", "/data/files")


def get_db():
    uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    client = MongoClient(uri)
    return client["docupload"]


def resolve_file_path(doc: dict) -> str | None:
    """문서 DB 레코드에서 실제 파일 경로를 해결"""
    # 1순위: upload.destPath (가장 정확)
    upload = doc.get("upload", {})
    dest_path = upload.get("destPath", "")
    if dest_path and os.path.exists(dest_path):
        return dest_path

    # 2순위: upload.saveName + ownerId + createdAt로 경로 조립
    save_name = upload.get("saveName", "")
    if save_name:
        owner_id = str(doc.get("ownerId", ""))
        created = doc.get("createdAt")
        if created:
            if isinstance(created, datetime):
                pass
            elif isinstance(created, dict) and "$date" in created:
                created = datetime.fromisoformat(created["$date"].replace("Z", "+00:00"))
            elif isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            candidate = Path(FILE_BASE_PATH) / "users" / owner_id / str(created.year) / f"{created.month:02d}" / save_name
            if candidate.exists():
                return str(candidate)

    return None


def file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()[:16]}"


def build_snapshot(doc: dict, gm_id: str, file_path: str | None) -> dict:
    """DB 문서에서 Golden Master 스냅샷 생성"""
    meta = doc.get("meta", {})
    ocr = doc.get("ocr", {})
    docembed = doc.get("docembed", {})

    # full_text 길이 (텍스트 자체는 저장하지 않음 — 개인정보)
    full_text = meta.get("full_text", "") or ""
    ocr_text = ocr.get("full_text", "") or ""
    effective_text = full_text or ocr_text

    snapshot = {
        "id": gm_id,
        "category": _categorize(doc),
        "input": {
            "original_name": doc.get("originalName", ""),
            "mime_type": meta.get("mime", ""),
            "file_size": os.path.getsize(file_path) if file_path and os.path.exists(file_path) else 0,
            "file_hash": file_hash(file_path) if file_path and os.path.exists(file_path) else "",
            "file_ref": f"files/{gm_id}{Path(doc.get('originalName', '.pdf')).suffix}",
        },
        "expected": {
            # Layer 1: 출력 비교
            "status": doc.get("status", ""),
            "overall_status": doc.get("overallStatus", ""),
            "document_type": doc.get("document_type"),
            "display_name": doc.get("displayName", ""),
            "text_length": len(effective_text),
            "has_ocr_text": bool(ocr_text),
            "processing_skip_reason": doc.get("processingSkipReason"),
            "metadata": {
                "insurer": meta.get("insurer"),
                "contractor": meta.get("contractor"),
                "product_name": meta.get("product_name"),
            },

            # Layer 2: 부수 동작 (DB 상태)
            "is_annual_report": doc.get("is_annual_report", False),
            "is_customer_review": doc.get("is_customer_review", False),
            "ar_parsing_status": doc.get("ar_parsing_status"),
            "has_related_customer": doc.get("relatedCustomerId") is not None,
            "docembed_status": docembed.get("status"),
            "progress_stage": doc.get("progressStage"),

            # 오류 경로
            "error_status_code": doc.get("error", {}).get("statusCode") if isinstance(doc.get("error"), dict) else None,
        },
        "doc_id": str(doc["_id"]),
        "captured_at": datetime.now().isoformat(),
    }

    return snapshot


def _categorize(doc: dict) -> str:
    """테스트 카테고리 분류"""
    skip = doc.get("processingSkipReason")
    if skip:
        return f"error_{skip}"
    status = doc.get("status", "")
    if status == "credit_pending":
        return "error_credit_pending"
    if status == "failed":
        return "error_failed"
    dtype = doc.get("document_type") or "unclassified"
    return f"normal_{dtype}"


def sample_documents(db) -> list[dict]:
    """층화 추출로 테스트 문서 수집"""
    files = db["files"]
    collected_ids = set()
    samples = []

    def _add(query: dict, limit: int, tag: str):
        cursor = files.find(
            {**query, "_id": {"$nin": [s["_id"] for s in samples]}},
        ).limit(limit)
        for doc in cursor:
            if doc["_id"] not in collected_ids:
                collected_ids.add(doc["_id"])
                doc["_sample_tag"] = tag
                samples.append(doc)

    # 1. document_type별
    for dtype, count in SAMPLING_PLAN["normal_by_type"].items():
        q = {"status": "completed", "processingSkipReason": {"$exists": False}}
        if dtype is None:
            q["document_type"] = None
        else:
            q["document_type"] = dtype
        _add(q, count, f"type_{dtype or 'null'}")

    # 2. MIME 타입별 추가 커버리지
    for mime, count in SAMPLING_PLAN["normal_by_mime"].items():
        _add({
            "meta.mime": mime,
            "status": "completed",
            "processingSkipReason": {"$exists": False},
        }, count, f"mime_{mime}")

    # 3. 오류: processingSkipReason
    for reason, count in SAMPLING_PLAN["error_skip_reasons"].items():
        _add({"processingSkipReason": reason}, count, f"error_{reason}")

    # 4. 오류: status별
    for status, count in SAMPLING_PLAN["error_statuses"].items():
        _add({"status": status}, count, f"error_{status}")

    # 5. 특수 상태
    _add({"ar_parsing_status": "completed", "is_annual_report": True},
         SAMPLING_PLAN["special"]["ar_parsing_completed"], "special_ar_completed")
    _add({"ar_parsing_status": "pending", "is_annual_report": True},
         SAMPLING_PLAN["special"]["ar_parsing_pending"], "special_ar_pending")
    _add({"docembed.status": "done"},
         SAMPLING_PLAN["special"]["docembed_done"], "special_embed_done")
    _add({"docembed.status": "failed"},
         SAMPLING_PLAN["special"]["docembed_failed"], "special_embed_failed")
    _add({"ocr.status": "done"},
         SAMPLING_PLAN["special"]["has_ocr"], "special_ocr")

    return samples


def main():
    parser = argparse.ArgumentParser(description="Golden Master 테스트 문서 수집")
    parser.add_argument("--output-dir", default="./golden_master/snapshots",
                        help="스냅샷 출력 디렉토리")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    files_dir = output_dir / "files"
    output_dir.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Golden Master — 테스트 문서 수집")
    print("=" * 60)

    db = get_db()
    print("\n[1/4] 프로덕션 DB에서 층화 추출 중...")
    samples = sample_documents(db)
    print(f"  → {len(samples)}건 수집됨")

    # 카테고리별 통계
    categories: dict[str, int] = {}
    for s in samples:
        cat = _categorize(s)
        categories[cat] = categories.get(cat, 0) + 1
    print("\n[카테고리별 분포]")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}건")

    print("\n[2/4] 파일 복사 + 스냅샷 생성 중...")
    snapshots = []
    file_found = 0
    file_missing = 0

    for i, doc in enumerate(samples):
        gm_id = f"gm_{i + 1:04d}"
        file_path = resolve_file_path(doc)

        # 파일 복사
        if file_path and os.path.exists(file_path):
            ext = Path(doc.get("originalName", ".pdf")).suffix
            dest = files_dir / f"{gm_id}{ext}"
            shutil.copy2(file_path, dest)
            file_found += 1
        else:
            file_missing += 1

        # 스냅샷 생성
        snapshot = build_snapshot(doc, gm_id, file_path)
        snapshot["_sample_tag"] = doc.get("_sample_tag", "")
        snapshots.append(snapshot)

        # 개별 스냅샷 저장
        with open(output_dir / f"{gm_id}.json", "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2, default=str)

    print(f"  → 파일 복사: {file_found}건 성공, {file_missing}건 누락")

    # 매니페스트 생성
    manifest = {
        "version": "1.0",
        "created_at": datetime.now().isoformat(),
        "total_count": len(snapshots),
        "categories": categories,
        "samples": [
            {
                "id": s["id"],
                "category": s["category"],
                "original_name": s["input"]["original_name"],
                "mime_type": s["input"]["mime_type"],
                "expected_status": s["expected"]["status"],
                "tag": s.get("_sample_tag", ""),
            }
            for s in snapshots
        ],
    }

    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n[3/4] 매니페스트 저장: {output_dir / 'manifest.json'}")
    print(f"\n[4/4] 완료!")
    print(f"  총 {len(snapshots)}건 스냅샷 생성")
    print(f"  출력: {output_dir}")
    print(f"\n다음 단계: python -m golden_master.verify --engine document_pipeline")


if __name__ == "__main__":
    main()
