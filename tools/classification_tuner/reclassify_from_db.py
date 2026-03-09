#!/usr/bin/env python3
"""
reclassify_from_db.py — MongoDB에 저장된 텍스트로 재분류 (업로드 불필요)

사용법:
  # 특정 고객의 문서 재분류 (dry-run)
  python reclassify_from_db.py --customer-id 698f3ed781123c52a305ab1d --dry-run --output results/run_002.json

  # 특정 설계사의 모든 문서 재분류
  python reclassify_from_db.py --owner-id 695cfe260e822face7a78535 --dry-run

  # 특정 document_type만 재분류
  python reclassify_from_db.py --type general --dry-run

  # 전체 문서 재분류 (주의: API 비용 발생)
  python reclassify_from_db.py --all --dry-run

  # 실제 DB 업데이트 적용
  python reclassify_from_db.py --customer-id 698f3ed781123c52a305ab1d --apply
"""
import sys
import os
import json
import argparse
import asyncio
from pathlib import Path
from datetime import datetime

# document_pipeline 모듈 import를 위한 경로 추가
PIPELINE_DIR = Path(__file__).resolve().parent.parent.parent / "backend" / "api" / "document_pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

# .env.shared에서 API 키 로드
ENV_SHARED = Path(__file__).resolve().parent.parent.parent / ".env.shared"
if ENV_SHARED.exists():
    for line in ENV_SHARED.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

import openai
import pymongo
from bson import ObjectId

# SSOT: openai_service.py에서 프롬프트/상수 직접 import
from services.openai_service import (
    CLASSIFICATION_SYSTEM_PROMPT,
    CLASSIFICATION_USER_PROMPT,
    VALID_DOCUMENT_TYPES,
    SYSTEM_ONLY_TYPES,
)

# TAG_NORMALIZATION이 없을 수 있음
try:
    from services.openai_service import TAG_NORMALIZATION
except ImportError:
    TAG_NORMALIZATION = {}


def validate_document_type(doc_type: str) -> str:
    """AI 분류 결과 검증"""
    if not doc_type or doc_type in SYSTEM_ONLY_TYPES or doc_type not in VALID_DOCUMENT_TYPES:
        return "general"
    return doc_type


def normalize_tags(tags: list) -> list:
    """태그 정규화"""
    normalized = []
    seen = set()
    for tag in tags:
        tag = tag.strip()
        if not tag:
            continue
        tag = TAG_NORMALIZATION.get(tag, tag)
        if tag.lower() not in seen:
            seen.add(tag.lower())
            normalized.append(tag)
    return normalized


async def classify_text(text: str, client: openai.AsyncOpenAI) -> dict:
    """현재 프롬프트로 텍스트 분류"""
    truncated = len(text) > 10000
    if truncated:
        text = text[:10000]

    user_prompt = CLASSIFICATION_USER_PROMPT.format(text=text)

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": CLASSIFICATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=600,
            temperature=0,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        usage = {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        } if response.usage else {}

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return {
                "type": "general", "confidence": 0.0, "title": "",
                "summary": content[:500], "tags": [],
                "usage": usage, "truncated": truncated,
            }

        doc_type = validate_document_type(parsed.get("type"))
        confidence = parsed.get("confidence", 0.0)
        if not isinstance(confidence, (int, float)):
            confidence = 0.0
        confidence = max(0.0, min(1.0, float(confidence)))

        tags = parsed.get("tags", [])
        if not isinstance(tags, list):
            tags = []
        tags = normalize_tags(tags)

        return {
            "type": doc_type,
            "confidence": confidence,
            "title": parsed.get("title", ""),
            "summary": parsed.get("summary", ""),
            "tags": tags,
            "usage": usage,
            "truncated": truncated,
        }

    except Exception as e:
        return {
            "type": "general", "confidence": 0.0, "title": "",
            "summary": f"분류 실패: {e}", "tags": [],
            "error": str(e), "truncated": truncated,
        }


def build_query(args) -> dict:
    """CLI 인자로 MongoDB 쿼리 생성"""
    # 텍스트 유무와 무관하게 모든 문서 대상 (파일명 fallback 지원)
    query = {}

    if args.customer_id:
        # 복수 customer_id 지원 (리스트 또는 단일값)
        cids = args.customer_id if isinstance(args.customer_id, list) else [args.customer_id]
        oid_list = [ObjectId(cid) if ObjectId.is_valid(cid) else cid for cid in cids]
        query["customerId"] = {"$in": oid_list} if len(oid_list) > 1 else oid_list[0]
    if args.owner_id:
        query["ownerId"] = args.owner_id
    if args.type:
        query["document_type"] = args.type
    if args.doc_ids:
        query["_id"] = {"$in": [ObjectId(did) for did in args.doc_ids]}
    if args.since:
        query["createdAt"] = {"$gte": datetime.strptime(args.since, "%Y-%m-%d")}

    # --all 플래그 없이 필터도 없으면 거부
    if not args.all and not any([args.customer_id, args.owner_id, args.type, args.doc_ids, args.since]):
        print("[오류] --customer-id, --owner-id, --type, --doc-ids 중 하나를 지정하거나 --all을 사용하세요.")
        sys.exit(1)

    # AR/CRS는 기본 제외 (별도 파싱 시스템 사용)
    if not args.include_ar:
        query["document_type"] = {"$nin": ["annual_report", "customer_review"]}
        # type 필터와 병합
        if args.type:
            query["document_type"] = args.type

    return query


async def main():
    parser = argparse.ArgumentParser(description="MongoDB 텍스트로 재분류")
    parser.add_argument("--customer-id", nargs="+", help="고객 ID로 필터 (복수 가능)")
    parser.add_argument("--owner-id", help="설계사(소유자) ID로 필터")
    parser.add_argument("--type", help="기존 document_type으로 필터")
    parser.add_argument("--doc-ids", nargs="+", help="특정 문서 ID 리스트")
    parser.add_argument("--all", action="store_true", help="전체 문서 대상 (주의: 비용)")
    parser.add_argument("--since", help="이 날짜 이후 업로드된 문서만 (YYYY-MM-DD)")
    parser.add_argument("--include-ar", action="store_true", help="AR/CRS 문서도 포함")
    parser.add_argument("--limit", type=int, default=0, help="최대 처리 건수 (0=무제한)")
    parser.add_argument("--dry-run", action="store_true", default=True, help="DB 업데이트 없이 결과만 출력 (기본값)")
    parser.add_argument("--apply", action="store_true", help="실제 DB 업데이트 적용")
    parser.add_argument("--output", default=None, help="결과 저장 경로")
    parser.add_argument("--mongodb-uri", default="mongodb://localhost:27017", help="MongoDB URI")
    parser.add_argument("--db-name", default="docupload", help="DB 이름")
    args = parser.parse_args()

    if args.apply:
        args.dry_run = False

    # MongoDB 연결
    mongo_client = pymongo.MongoClient(args.mongodb_uri)
    db = mongo_client[args.db_name]
    collection = db["files"]

    # 쿼리 생성
    query = build_query(args)
    total_count = collection.count_documents(query)
    print(f"[INFO] 대상 문서: {total_count}건")

    if total_count == 0:
        print("[INFO] 처리할 문서가 없습니다.")
        return

    if not args.dry_run:
        confirm = input(f"[경고] {total_count}건의 document_type을 실제 업데이트합니다. 계속하시겠습니까? (yes/no): ")
        if confirm.lower() != "yes":
            print("[취소] 작업을 취소합니다.")
            return

    # OpenAI 클라이언트
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("[오류] OPENAI_API_KEY가 설정되지 않았습니다.")
        sys.exit(1)
    openai_client = openai.AsyncOpenAI(api_key=api_key)

    # 문서 조회
    cursor = collection.find(query, {
        "meta.full_text": 1,
        "ocr.full_text": 1,
        "document_type": 1,
        "meta.document_type": 1,
        "upload.originalName": 1,
        "displayName": 1,
        "customerId": 1,
        "ownerId": 1,
    })
    if args.limit > 0:
        cursor = cursor.limit(args.limit)

    # 처리
    results = []
    total_tokens = 0
    changed = 0
    applied = 0

    docs = list(cursor)
    print(f"[INFO] 처리 시작: {len(docs)}건")

    for i, doc in enumerate(docs, 1):
        doc_id = str(doc["_id"])
        # 텍스트 우선순위: meta.full_text > ocr.full_text
        full_text = doc.get("meta", {}).get("full_text", "")
        text_source = "meta"
        if not full_text or len(full_text.strip()) < 10:
            full_text = doc.get("ocr", {}).get("full_text", "")
            text_source = "ocr"
        old_type = doc.get("document_type", "unknown")
        original_name = doc.get("upload", {}).get("originalName", "")
        display = doc.get("displayName") or original_name or doc_id

        print(f"[{i}/{len(docs)}] {display[:50]} ({old_type}) ... ", end="", flush=True)

        if not full_text or len(full_text.strip()) < 10:
            # 텍스트 없으면 파일명만으로 분류 시도
            fname = original_name or display
            if fname and len(fname) > 3:
                full_text = f"[파일명: {fname}]"
                text_source = "filename"
            else:
                print("스킵 (텍스트 부족)")
                results.append({
                    "doc_id": doc_id, "display": display,
                    "old_type": old_type, "new_type": None,
                    "skipped": True, "reason": "텍스트 부족",
                })
                continue

        classification = await classify_text(full_text, openai_client)
        new_type = classification["type"]
        tokens = classification.get("usage", {}).get("total_tokens", 0)
        total_tokens += tokens

        type_changed = old_type != new_type
        if type_changed:
            changed += 1

        result = {
            "doc_id": doc_id,
            "display": display,
            "filename": original_name or display,  # evaluate.py 호환 (GT 매칭용 원본 파일명)
            "customer_id": str(doc.get("customerId", "")),
            "old_type": old_type,
            "new_type": new_type,
            "predicted_type": new_type,  # evaluate.py 호환
            "confidence": classification["confidence"],
            "title": classification["title"],
            "summary": classification["summary"][:200],
            "tags": classification["tags"],
            "tokens_used": tokens,
            "type_changed": type_changed,
            "text_source": text_source,
        }
        results.append(result)

        status = f"{new_type} ({classification['confidence']:.2f})"
        if type_changed:
            status += f" [변경: {old_type} -> {new_type}]"

        # DB 업데이트 (--apply 시)
        if not args.dry_run and type_changed:
            collection.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "document_type": new_type,
                    "meta.document_type": new_type,
                    "meta.confidence": classification["confidence"],
                    "meta.title": classification["title"],
                    "meta.summary": classification["summary"],
                    "meta.tags": classification["tags"],
                    "meta.reclassified_at": datetime.utcnow().isoformat(),
                    "meta.reclassified_from": old_type,
                }}
            )
            applied += 1
            status += " [DB 업데이트 완료]"

        print(status)

    # 출력 경로
    if args.output:
        output_path = Path(args.output)
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        mode = "apply" if not args.dry_run else "dryrun"
        output_path = Path(__file__).parent / "results" / f"reclassify_{mode}_{ts}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "run_at": datetime.now().isoformat(),
        "mode": "apply" if not args.dry_run else "dry-run",
        "query": json.loads(json.dumps(query, default=str)),
        "total_docs": len(docs),
        "total_tokens": total_tokens,
        "type_changed": changed,
        "db_updated": applied,
        "results": results,
    }
    output_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n[완료] 결과 저장: {output_path}")
    print(f"[통계] 문서 {len(docs)}건, 변경 {changed}건, DB 업데이트 {applied}건")
    print(f"[비용] 총 토큰 {total_tokens}, 예상 비용 ~${total_tokens * 0.00000015:.4f}")


if __name__ == "__main__":
    asyncio.run(main())
