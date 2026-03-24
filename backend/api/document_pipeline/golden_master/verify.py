"""
Golden Master — 자동 비교 검증 스크립트

스냅샷의 expected 값과 실제 DB 상태를 비교하여 PASS/FAIL을 판정한다.
현재는 "현재 프로덕션 DB 상태 vs 스냅샷" 비교 (교체 전 베이스라인 확인).
교체 후에는 "xPipe 처리 결과 vs 스냅샷" 비교로 사용.

실행:
    cd ~/aims/backend/api/document_pipeline
    python -m golden_master.verify [--snapshots ./golden_master/snapshots] [--fail-fast]

출력:
    PASS/FAIL 리포트 + 상세 diff
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from pymongo import MongoClient
from bson import ObjectId


def get_db():
    uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    client = MongoClient(uri)
    return client["docupload"]


# ──────────────────────────────────────────────
# 비교 함수들
# ──────────────────────────────────────────────

def compare_exact(expected: Any, actual: Any, field: str) -> dict | None:
    """정확 일치 비교. 불일치 시 diff 반환."""
    if expected is None:
        return None  # expected가 None이면 검증 스킵
    # 빈 문자열과 None을 동등하게 취급 (DB 필드 미존재 = 빈 값)
    if _is_empty(expected) and _is_empty(actual):
        return None
    if expected != actual:
        return {"field": field, "expected": expected, "actual": actual, "type": "exact_mismatch"}
    return None


def _is_empty(val: Any) -> bool:
    return val is None or val == "" or val == []


def compare_text_length(expected_len: int, actual_len: int, tolerance: float = 0.05) -> dict | None:
    """텍스트 길이 ±허용범위 비교."""
    if expected_len == 0 and actual_len == 0:
        return None
    if expected_len == 0:
        return {"field": "text_length", "expected": expected_len, "actual": actual_len, "type": "text_appeared"}
    diff_ratio = abs(actual_len - expected_len) / max(expected_len, 1)
    if diff_ratio > tolerance:
        return {
            "field": "text_length",
            "expected": expected_len,
            "actual": actual_len,
            "diff_percent": f"{diff_ratio * 100:.1f}%",
            "tolerance": f"{tolerance * 100:.0f}%",
            "type": "text_length_drift",
        }
    return None


def compare_bool_field(expected: bool, actual: Any, field: str) -> dict | None:
    """불리언 필드 비교."""
    actual_bool = bool(actual)
    if expected != actual_bool:
        return {"field": field, "expected": expected, "actual": actual_bool, "type": "bool_mismatch"}
    return None


# ──────────────────────────────────────────────
# 문서 1건 검증
# ──────────────────────────────────────────────

def verify_document(snapshot: dict, db_doc: dict) -> list[dict]:
    """스냅샷 1건과 DB 문서를 비교. 불일치 항목 리스트 반환."""
    expected = snapshot["expected"]
    diffs = []

    meta = db_doc.get("meta", {})
    ocr = db_doc.get("ocr", {})
    docembed = db_doc.get("docembed", {})
    upload = db_doc.get("upload", {})
    error = db_doc.get("error", {})
    if not isinstance(error, dict):
        error = {}

    full_text = meta.get("full_text", "") or ""
    ocr_text = ocr.get("full_text", "") or ""
    effective_text = full_text or ocr_text

    # ── Layer 1: 출력 비교 ──

    # 상태
    d = compare_exact(expected.get("status"), db_doc.get("status"), "status")
    if d:
        diffs.append(d)

    d = compare_exact(expected.get("overall_status"), db_doc.get("overallStatus"), "overallStatus")
    if d:
        diffs.append(d)

    # 분류
    d = compare_exact(expected.get("document_type"), db_doc.get("document_type"), "document_type")
    if d:
        diffs.append(d)

    # 표시명
    d = compare_exact(expected.get("display_name"), db_doc.get("displayName"), "displayName")
    if d:
        diffs.append(d)

    # 텍스트 길이
    d = compare_text_length(expected.get("text_length", 0), len(effective_text))
    if d:
        diffs.append(d)

    # OCR 사용 여부
    d = compare_bool_field(expected.get("has_ocr_text", False), ocr_text, "has_ocr_text")
    if d:
        diffs.append(d)

    # 처리 스킵 사유
    d = compare_exact(expected.get("processing_skip_reason"), db_doc.get("processingSkipReason"), "processingSkipReason")
    if d:
        diffs.append(d)

    # 메타데이터 (핵심 필드만)
    exp_meta = expected.get("metadata", {})
    for key in ["insurer", "contractor", "product_name"]:
        exp_val = exp_meta.get(key)
        act_val = meta.get(key)
        if exp_val is not None:
            d = compare_exact(exp_val, act_val, f"metadata.{key}")
            if d:
                diffs.append(d)

    # 오류 상태 코드
    exp_error_code = expected.get("error_status_code")
    act_error_code = error.get("statusCode")
    if exp_error_code is not None:
        d = compare_exact(exp_error_code, act_error_code, "error.statusCode")
        if d:
            diffs.append(d)

    # ── Layer 2: 부수 동작 (DB 상태) ──

    # AR/CRS 감지
    d = compare_bool_field(expected.get("is_annual_report", False),
                           db_doc.get("is_annual_report", False), "is_annual_report")
    if d:
        diffs.append(d)

    d = compare_bool_field(expected.get("is_customer_review", False),
                           db_doc.get("is_customer_review", False), "is_customer_review")
    if d:
        diffs.append(d)

    # AR 파싱 상태
    d = compare_exact(expected.get("ar_parsing_status"),
                      db_doc.get("ar_parsing_status"), "ar_parsing_status")
    if d:
        diffs.append(d)

    # 고객 연결 여부
    exp_has_customer = expected.get("has_related_customer", False)
    act_has_customer = db_doc.get("relatedCustomerId") is not None
    d = compare_bool_field(exp_has_customer, act_has_customer, "has_related_customer")
    if d:
        diffs.append(d)

    # 임베딩 상태
    d = compare_exact(expected.get("docembed_status"),
                      docembed.get("status"), "docembed.status")
    if d:
        diffs.append(d)

    # 진행 단계
    d = compare_exact(expected.get("progress_stage"),
                      db_doc.get("progressStage"), "progressStage")
    if d:
        diffs.append(d)

    return diffs


# ──────────────────────────────────────────────
# 메인 실행
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Golden Master 검증")
    parser.add_argument("--snapshots", default="./golden_master/snapshots",
                        help="스냅샷 디렉토리")
    parser.add_argument("--fail-fast", action="store_true",
                        help="첫 번째 FAIL에서 중단")
    parser.add_argument("--alert-on-fail", action="store_true",
                        help="FAIL 시 알림 (크론용)")
    args = parser.parse_args()

    snapshots_dir = Path(args.snapshots)
    manifest_path = snapshots_dir / "manifest.json"

    if not manifest_path.exists():
        print(f"ERROR: 매니페스트 없음: {manifest_path}")
        print("먼저 python -m golden_master.collect 를 실행하세요.")
        sys.exit(1)

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    db = get_db()
    files_col = db["files"]

    print("=" * 60)
    print("Golden Master — 검증 실행")
    print(f"스냅샷: {manifest['total_count']}건")
    print(f"생성일: {manifest['created_at']}")
    print("=" * 60)

    total = 0
    passed = 0
    failed = 0
    failures = []

    for sample in manifest["samples"]:
        gm_id = sample["id"]
        snap_path = snapshots_dir / f"{gm_id}.json"

        if not snap_path.exists():
            print(f"  SKIP  {gm_id} — 스냅샷 파일 없음")
            continue

        with open(snap_path, encoding="utf-8") as f:
            snapshot = json.load(f)

        doc_id = snapshot.get("doc_id")
        if not doc_id:
            print(f"  SKIP  {gm_id} — doc_id 없음")
            continue

        # DB에서 현재 상태 조회
        try:
            db_doc = files_col.find_one({"_id": ObjectId(doc_id)})
        except Exception:
            db_doc = None

        if not db_doc:
            failures.append({
                "id": gm_id,
                "category": snapshot["category"],
                "diffs": [{"field": "document", "type": "not_found", "expected": "exists", "actual": "missing"}],
            })
            failed += 1
            total += 1
            print(f"  FAIL  {gm_id} [{snapshot['category']}] — DB에서 문서를 찾을 수 없음")
            if args.fail_fast:
                break
            continue

        # 비교
        diffs = verify_document(snapshot, db_doc)
        total += 1

        if diffs:
            failed += 1
            failures.append({
                "id": gm_id,
                "category": snapshot["category"],
                "original_name": snapshot["input"]["original_name"],
                "diffs": diffs,
            })
            diff_fields = ", ".join(d["field"] for d in diffs)
            print(f"  FAIL  {gm_id} [{snapshot['category']}] — {diff_fields}")
            if args.fail_fast:
                break
        else:
            passed += 1
            print(f"  PASS  {gm_id} [{snapshot['category']}]")

    # ── 결과 리포트 ──
    print()
    print("=" * 60)
    print(f"Golden Master 검증 결과")
    print(f"총: {total}건 | PASS: {passed}건 | FAIL: {failed}건")
    print(f"통과율: {passed / max(total, 1) * 100:.1f}%")
    print("=" * 60)

    if failures:
        print(f"\n{'─' * 60}")
        print("FAIL 상세:")
        print(f"{'─' * 60}")
        for f_item in failures:
            print(f"\n  {f_item['id']} [{f_item['category']}]")
            for d in f_item["diffs"]:
                print(f"    {d['field']}: expected={d.get('expected')}, actual={d.get('actual')} ({d['type']})")

    # 결과 파일 저장
    result = {
        "timestamp": datetime.now().isoformat(),
        "total": total,
        "passed": passed,
        "failed": failed,
        "pass_rate": f"{passed / max(total, 1) * 100:.1f}%",
        "failures": failures,
    }
    result_path = snapshots_dir / "last_result.json"
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n결과 저장: {result_path}")

    # 알림: FAIL 시 aims-admin 시스템 로그에 에러 등록
    if args.alert_on_fail and failed > 0:
        print(f"\n[ALERT] Golden Master FAIL: {failed}/{total}건")
        _send_error_to_admin(failed, total, failures)

    sys.exit(1 if failed > 0 else 0)


def _send_error_to_admin(failed: int, total: int, failures: list):
    """aims-admin 시스템 로그에 Golden Master FAIL 에러를 등록"""
    import requests as req

    aims_api_url = os.environ.get("AIMS_API_URL", "http://localhost:3010")
    fail_details = "; ".join(
        f"{f['id']}({','.join(d['field'] for d in f['diffs'])})"
        for f in failures[:5]  # 최대 5건만
    )

    try:
        req.post(
            f"{aims_api_url}/api/error-logs",
            json={
                "source": {
                    "type": "server",
                    "component": "golden_master_verify",
                    "endpoint": "cron/golden-master",
                },
                "error": {
                    "type": "GoldenMasterFail",
                    "message": f"[xPipe 모니터링] Golden Master FAIL: {failed}/{total}건 불일치 — {fail_details}",
                    "severity": "high",
                    "category": "xpipe_monitoring",
                },
                "context": {
                    "version": os.environ.get("PIPELINE_ENGINE", "unknown"),
                    "payload": {"failures": failures[:5]},
                },
            },
            timeout=5,
        )
        print("  → aims-admin 시스템 로그에 에러 등록 완료")
    except Exception as e:
        print(f"  → aims-admin 에러 등록 실패: {e}")


if __name__ == "__main__":
    main()
