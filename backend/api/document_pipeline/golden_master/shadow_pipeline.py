"""
Golden Master — Shadow Pipeline (Phase 1-B)

Golden Master 테스트 파일을 xPipeWeb에 업로드하여 전체 파이프라인을 실행하고,
xPipe 처리 결과를 Golden Master 스냅샷과 비교한다.

실제 OCR/AI API를 호출하므로 비용이 발생한다.

실행:
    cd ~/aims/backend/api/document_pipeline
    source venv/bin/activate
    python -m golden_master.shadow_pipeline [--snapshots ./golden_master/snapshots] [--xpipe-url http://localhost:8200]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

XPIPE_URL = os.environ.get("XPIPE_URL", "http://localhost:8200")
MAX_WAIT = 180  # 문서당 최대 대기 시간 (초, 대용량 OCR 고려)
POLL_INTERVAL = 3  # 폴링 간격 (초)


async def upload_and_wait(client: httpx.AsyncClient, file_path: str, filename: str, base_url: str) -> dict | None:
    """파일을 xPipeWeb에 업로드하고 처리 완료까지 대기"""
    # 업로드
    with open(file_path, "rb") as f:
        resp = await client.post(
            f"{base_url}/api/upload",
            files={"file": (filename, f)},
            timeout=30,
        )
    if resp.status_code != 200:
        return {"error": f"업로드 실패: {resp.status_code} {resp.text}"}

    data = resp.json()
    doc_id = data.get("doc_id")
    if not doc_id:
        return {"error": "doc_id 없음"}

    # 처리 완료 대기
    start = time.time()
    while time.time() - start < MAX_WAIT:
        await asyncio.sleep(POLL_INTERVAL)
        resp = await client.get(f"{base_url}/api/documents", timeout=30)
        if resp.status_code != 200:
            continue

        docs = resp.json().get("documents", [])
        doc = next((d for d in docs if d["id"] == doc_id), None)
        if not doc:
            continue

        status = doc.get("status", "")
        if status in ("completed", "error"):
            # 스테이지 데이터 조회
            stages_resp = await client.get(f"{base_url}/api/stages/{doc_id}", timeout=30)
            stages_data = stages_resp.json() if stages_resp.status_code == 200 else {}
            return {
                "doc_id": doc_id,
                "status": status,
                "result": doc.get("result", {}),
                "stages_data": stages_data,
                "duration": doc.get("duration"),
                "error": doc.get("error"),
                "cost": doc.get("cost"),
            }

    return {"error": f"타임아웃 ({MAX_WAIT}초)"}


def compare_results(snapshot: dict, xpipe_result: dict) -> list[dict]:
    """Golden Master 스냅샷과 xPipe 결과 비교"""
    diffs = []
    expected = snapshot["expected"]
    result = xpipe_result.get("result", {})
    stages = xpipe_result.get("stages_data", {})

    # 1. 처리 성공/실패 비교
    expected_status = expected.get("status", "completed")
    actual_status = xpipe_result.get("status", "")

    # xPipe "completed" = AIMS "completed" (에러 케이스는 별도 처리)
    skip_reason = expected.get("processing_skip_reason")
    if skip_reason:
        # 변환 실패/미지원 형식은 xPipe에서 error로 나올 수 있음 — 이것은 OK
        if actual_status == "error":
            return []  # 에러 케이스는 xPipe에서도 에러 → 정상

    # 2. AR/CRS 감지 비교
    stages_data = stages.get("stages_data", stages)
    detect_data = stages_data.get("detect_special", {}).get("output", {})

    detections = detect_data.get("detections", [])
    # fallback: result.detections도 확인
    if not detections:
        detections = result.get("detections", [])
    actual_ar = any(d.get("doc_type") == "annual_report" for d in detections)
    actual_crs = any(d.get("doc_type") == "customer_review" for d in detections)

    expected_ar = expected.get("is_annual_report", False)
    expected_crs = expected.get("is_customer_review", False)

    if expected_ar != actual_ar:
        diffs.append({"field": "is_annual_report", "expected": expected_ar, "actual": actual_ar})
    if expected_crs != actual_crs:
        diffs.append({"field": "is_customer_review", "expected": expected_crs, "actual": actual_crs})

    # 3. 분류 비교 (AR/CRS는 감지 기반이므로 일반 문서만)
    expected_type = expected.get("document_type")
    if expected_type and expected_type not in ("annual_report", "customer_review", None):
        classify_data = stages_data.get("classify", {}).get("output", {})
        actual_type = classify_data.get("document_type") or result.get("document_type")

        if actual_type and actual_type != expected_type:
            # alias 체크
            from insurance.adapter import LEGACY_TYPE_ALIASES
            expected_normalized = LEGACY_TYPE_ALIASES.get(expected_type, expected_type)
            actual_normalized = LEGACY_TYPE_ALIASES.get(actual_type, actual_type)
            if expected_normalized != actual_normalized:
                diffs.append({
                    "field": "document_type",
                    "expected": expected_type,
                    "actual": actual_type,
                })

    # 4. 텍스트 추출 비교 (길이 ±20% — OCR 비결정성 + xPipe 텍스트 추출 차이 허용)
    expected_text_len = expected.get("text_length", 0)
    extract_data = stages_data.get("extract", {}).get("output", {})
    actual_text = extract_data.get("text", "") or ""
    actual_text_len = len(actual_text)

    if expected_text_len > 0 and actual_text_len > 0:
        ratio = abs(actual_text_len - expected_text_len) / max(expected_text_len, 1)
        if ratio > 0.2:  # 20% 허용
            diffs.append({
                "field": "text_length",
                "expected": expected_text_len,
                "actual": actual_text_len,
                "diff": f"{ratio*100:.0f}%",
            })

    return diffs


async def main():
    parser = argparse.ArgumentParser(description="Shadow Pipeline (Phase 1-B)")
    parser.add_argument("--snapshots", default="./golden_master/snapshots")
    parser.add_argument("--xpipe-url", default=XPIPE_URL)
    parser.add_argument("--max-docs", type=int, default=0, help="최대 처리 건수 (0=전체)")
    parser.add_argument("--no-embed", action="store_true", help="Embed 스테이지 비활성화 (Shadow 비교에 불필요)")
    args = parser.parse_args()

    xpipe_url = args.xpipe_url

    snapshots_dir = Path(args.snapshots)
    manifest_path = snapshots_dir / "manifest.json"
    files_dir = snapshots_dir / "files"

    if not manifest_path.exists():
        print("ERROR: 매니페스트 없음")
        sys.exit(1)

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    print("=" * 60)
    print("Shadow Pipeline — xPipe 전체 파이프라인 검증 (Phase 1-B)")
    print(f"xPipeWeb: {xpipe_url}")
    print(f"스냅샷: {manifest['total_count']}건")
    print("=" * 60)

    # xPipeWeb 상태 확인
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{xpipe_url}/api/config", timeout=5)
            config = resp.json().get("config", {})
            print(f"어댑터: {config.get('adapter')}, 모드: {config.get('mode')}")
            print(f"모델: {config.get('models', {})}")

            # Embed 비활성화 옵션
            if args.no_embed:
                stages = config.get("enabled_stages", [])
                if "embed" in stages:
                    stages = [s for s in stages if s != "embed"]
                    await client.put(
                        f"{xpipe_url}/api/config",
                        json={"enabled_stages": stages},
                        timeout=5,
                    )
                    print(f"Embed 스테이지 비활성화됨")
        except Exception as e:
            print(f"ERROR: xPipeWeb 접속 불가: {e}")
            sys.exit(1)

        total = 0
        passed = 0
        failed = 0
        skipped = 0
        errors = 0
        failures = []

        samples = manifest["samples"]
        if args.max_docs > 0:
            samples = samples[:args.max_docs]

        for i, sample in enumerate(samples):
            gm_id = sample["id"]
            snap_path = snapshots_dir / f"{gm_id}.json"
            if not snap_path.exists():
                continue

            with open(snap_path, encoding="utf-8") as f:
                snapshot = json.load(f)

            # 파일 찾기
            file_ref = snapshot["input"].get("file_ref", "")
            file_path = snapshots_dir / file_ref if file_ref else None

            if not file_path or not file_path.exists():
                # file_ref 없는 경우 files/ 디렉토리에서 gm_id로 검색
                for p in files_dir.iterdir():
                    if p.stem == gm_id or p.name.startswith(gm_id):
                        file_path = p
                        break

            if not file_path or not file_path.exists():
                skipped += 1
                print(f"  SKIP  {gm_id} — 파일 없음")
                continue

            total += 1
            filename = snapshot["input"].get("original_name") or file_path.name
            if not filename or filename == "":
                filename = f"{gm_id}.pdf"

            print(f"  [{i+1}/{len(samples)}] {gm_id} [{snapshot['category']}] 처리 중...", end="", flush=True)

            # xPipeWeb에 업로드 + 처리 대기
            try:
                result = await upload_and_wait(client, str(file_path), filename, xpipe_url)
            except Exception as e:
                errors += 1
                print(f" ERROR: {e}")
                continue

            if result and result.get("error"):
                errors += 1
                print(f" ERROR: {result['error']}")
                continue

            if not result:
                errors += 1
                print(" ERROR: 결과 없음")
                continue

            # 비교
            diffs = compare_results(snapshot, result)
            duration = result.get("duration", "?")

            if diffs:
                failed += 1
                failures.append({"id": gm_id, "category": snapshot["category"], "diffs": diffs})
                diff_fields = ", ".join(d["field"] for d in diffs)
                print(f" FAIL ({duration}s) — {diff_fields}")
            else:
                passed += 1
                print(f" PASS ({duration}s)")

    # 결과
    print()
    print("=" * 60)
    print(f"Shadow Pipeline 결과")
    print(f"총: {total}건 | PASS: {passed} | FAIL: {failed} | SKIP: {skipped} | ERROR: {errors}")
    print(f"통과율: {passed / max(total, 1) * 100:.1f}%")
    print("=" * 60)

    if failures:
        print(f"\nFAIL 상세:")
        for f_item in failures:
            print(f"  {f_item['id']} [{f_item['category']}]")
            for d in f_item["diffs"]:
                print(f"    {d['field']}: expected={d.get('expected')}, actual={d.get('actual')}")

    # 결과 저장
    result_data = {
        "type": "shadow_pipeline",
        "timestamp": datetime.now().isoformat(),
        "xpipe_url": xpipe_url,
        "total": total, "passed": passed, "failed": failed,
        "skipped": skipped, "errors": errors,
        "failures": failures,
    }
    result_path = snapshots_dir / "shadow_pipeline_result.json"
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n결과 저장: {result_path}")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
