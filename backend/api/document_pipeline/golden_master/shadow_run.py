"""
Golden Master — Shadow Run (Phase 1)

프로덕션 DB의 기존 텍스트를 InsuranceAdapter에 통과시켜,
xPipe 어댑터가 document_pipeline과 동일한 결과를 내는지 검증한다.

Step A: 감지+분류 검증 (DB 텍스트 기반, API 비용 0)
  - detect_special_documents(): AR/CRS 감지 일치
  - get_classification_config(): 분류 체계 일치
  - generate_display_name(): 표시명 일치

Step B: 전체 파이프라인 (실제 파일 → OCR → AI → 분류 → 감지)
  - TODO: Phase 1 Step A 통과 후 구현

실행:
    cd ~/aims/backend/api/document_pipeline
    source venv/bin/activate
    python -m golden_master.shadow_run [--snapshots ./golden_master/snapshots]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from pymongo import MongoClient
from bson import ObjectId

# InsuranceAdapter import
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from insurance.adapter import InsuranceDomainAdapter, LEGACY_TYPE_ALIASES


MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
AIMS_API_URL = os.environ.get("AIMS_API_URL", "http://localhost:3010")


def get_db():
    client = MongoClient(MONGO_URI)
    return client["docupload"]


async def main():
    parser = argparse.ArgumentParser(description="Golden Master Shadow Run")
    parser.add_argument("--snapshots", default="./golden_master/snapshots")
    args = parser.parse_args()

    snapshots_dir = Path(args.snapshots)
    manifest_path = snapshots_dir / "manifest.json"

    if not manifest_path.exists():
        print("ERROR: 매니페스트 없음. 먼저 collect.py 실행 필요.")
        sys.exit(1)

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    db = get_db()
    files_col = db["files"]

    # InsuranceAdapter 생성
    adapter = InsuranceDomainAdapter()

    print("=" * 60)
    print("Shadow Run — InsuranceAdapter 감지/분류 검증")
    print(f"스냅샷: {manifest['total_count']}건")
    print("=" * 60)

    total = 0
    passed = 0
    failed = 0
    skipped = 0
    failures = []

    for sample in manifest["samples"]:
        gm_id = sample["id"]
        snap_path = snapshots_dir / f"{gm_id}.json"
        if not snap_path.exists():
            continue

        with open(snap_path, encoding="utf-8") as f:
            snapshot = json.load(f)

        doc_id = snapshot.get("doc_id")
        if not doc_id:
            continue

        # DB에서 문서 + 텍스트 조회
        try:
            db_doc = files_col.find_one({"_id": ObjectId(doc_id)})
        except Exception:
            db_doc = None

        if not db_doc:
            skipped += 1
            continue

        meta = db_doc.get("meta", {})
        ocr = db_doc.get("ocr", {})
        full_text = meta.get("full_text", "") or ocr.get("full_text", "") or ""
        mime_type = meta.get("mime", "application/pdf")

        total += 1
        diffs = []
        checks_performed = 0  # 실제 검증 수행 횟수

        # ── 1. AR/CRS 감지 검증 ──
        expected_is_ar = snapshot["expected"].get("is_annual_report", False)
        expected_is_crs = snapshot["expected"].get("is_customer_review", False)

        # 감지 1회 실행, 결과 캐시 (Gini #3 수정: 중복 호출 제거)
        detections = []
        if full_text:
            detections = await adapter.detect_special_documents(full_text, mime_type)
            actual_ar = any(d.doc_type == "annual_report" for d in detections)
            actual_crs = any(d.doc_type == "customer_review" for d in detections)
            checks_performed += 1
        else:
            actual_ar = False
            actual_crs = False
            # 텍스트 없는 문서: AR/CRS가 기대되면 FAIL, 아니면 면제
            if expected_is_ar or expected_is_crs:
                diffs.append({
                    "field": "detection_no_text",
                    "expected": f"AR={expected_is_ar}, CRS={expected_is_crs}",
                    "actual": "텍스트 없어 감지 불가",
                    "type": "no_text_but_expected",
                })

        if expected_is_ar != actual_ar:
            diffs.append({
                "field": "is_annual_report",
                "expected": expected_is_ar,
                "actual": actual_ar,
                "type": "ar_detection_mismatch",
            })

        if expected_is_crs != actual_crs:
            diffs.append({
                "field": "is_customer_review",
                "expected": expected_is_crs,
                "actual": actual_crs,
                "type": "crs_detection_mismatch",
            })

        # ── 2. AR/CRS 표시명 검증 (캐시된 detections 재사용) ──
        expected_display = snapshot["expected"].get("display_name", "")
        if (expected_is_ar or expected_is_crs) and detections:
            actual_display = await adapter.generate_display_name(
                {"originalName": db_doc.get("originalName", "")},
                detections[0],
            )
            checks_performed += 1
            if expected_display and actual_display:
                if expected_display != actual_display:
                    diffs.append({
                        "field": "display_name",
                        "expected": expected_display,
                        "actual": actual_display,
                        "type": "display_name_mismatch",
                    })
            elif expected_display and not actual_display:
                diffs.append({
                    "field": "display_name",
                    "expected": expected_display,
                    "actual": "(빈 값)",
                    "type": "display_name_empty",
                })

        # ── 3. 분류 체계 검증 ──
        expected_doc_type = snapshot["expected"].get("document_type")
        if expected_doc_type and expected_doc_type not in (None, ""):
            config = await adapter.get_classification_config()
            valid_types = set(config.valid_types) if config.valid_types else set()
            checks_performed += 1

            # AR/CRS는 감지 기반이므로 분류 체계와 별도
            if expected_doc_type not in ("annual_report", "customer_review"):
                # 레거시 alias 적용 (Gini #2 수정: proposal → plan_design)
                check_type = LEGACY_TYPE_ALIASES.get(expected_doc_type, expected_doc_type)
                if check_type not in valid_types:
                    diffs.append({
                        "field": "classification_coverage",
                        "expected": f"{expected_doc_type} (→ {check_type})" if check_type != expected_doc_type else expected_doc_type,
                        "actual": f"not in valid_types ({len(valid_types)} types)",
                        "type": "classification_missing_type",
                    })

        # ── 결과 판정 (Gini #4 수정: 실검증/면제 분리) ──
        if diffs:
            failed += 1
            failures.append({
                "id": gm_id,
                "category": snapshot["category"],
                "diffs": diffs,
            })
            diff_fields = ", ".join(d["field"] for d in diffs)
            print(f"  FAIL  {gm_id} [{snapshot['category']}] — {diff_fields}")
        elif checks_performed == 0:
            skipped += 1
            print(f"  SKIP  {gm_id} [{snapshot['category']}] — 검증 대상 없음 (텍스트 없음, 비특수문서)")
        else:
            passed += 1
            print(f"  PASS  {gm_id} [{snapshot['category']}] ({checks_performed} checks)")

    # ── 결과 리포트 ──
    print()
    print("=" * 60)
    print(f"Shadow Run 결과")
    print(f"총: {total}건 | PASS: {passed} | FAIL: {failed} | SKIP: {skipped}")
    print(f"통과율: {passed / max(total, 1) * 100:.1f}%")
    print("=" * 60)

    if failures:
        print(f"\n{'─' * 60}")
        print("FAIL 상세:")
        for f_item in failures:
            print(f"\n  {f_item['id']} [{f_item['category']}]")
            for d in f_item["diffs"]:
                print(f"    {d['field']}: expected={d.get('expected')}, actual={d.get('actual')}")

    # 결과 저장
    result = {
        "type": "shadow_run",
        "timestamp": datetime.now().isoformat(),
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "failures": failures,
    }
    result_path = snapshots_dir / "shadow_result.json"
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n결과 저장: {result_path}")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
