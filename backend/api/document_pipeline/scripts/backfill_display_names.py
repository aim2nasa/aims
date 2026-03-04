"""
기존 OCR 완료 문서에 displayName 일괄 생성 스크립트

대상: ocr.status="done" + (ocr.full_text 또는 ocr.summary 존재) + displayName 없음 + AR/CRS 아님
방법: gpt-4o-mini로 full_text/summary에서 짧은 제목 추출

사용법: python backfill_display_names.py [--dry-run]
"""
import asyncio
import os
import re
import sys
import argparse

from pymongo import MongoClient
import openai

# MongoDB 연결
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://tars:27017")
DB_NAME = os.getenv("MONGODB_DB", "docupload")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]


async def generate_title(text: str) -> str:
    """텍스트에서 짧은 제목 추출"""
    # 텍스트가 너무 길면 앞부분만 사용
    if len(text) > 3000:
        text = text[:3000]

    aclient = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await aclient.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "문서 텍스트를 읽고 문서 내용을 대표하는 짧은 제목(최대 40자, 한국어)을 생성하세요. 제목만 출력하세요."
            },
            {"role": "user", "content": text}
        ],
        max_tokens=60,
        temperature=0.3
    )
    return response.choices[0].message.content.strip()


def get_target_documents():
    """backfill 대상 문서 조회"""
    query = {
        "ocr.status": "done",
        "$or": [
            {"displayName": {"$exists": False}},
            {"displayName": None}
        ],
        "is_annual_report": {"$ne": True},
        "is_customer_review": {"$ne": True}
    }
    projection = {
        "_id": 1,
        "ocr.summary": 1,
        "ocr.full_text": 1,
        "upload.originalName": 1
    }
    return list(db["files"].find(query, projection))


async def main():
    parser = argparse.ArgumentParser(description="OCR 문서 displayName 일괄 생성")
    parser.add_argument("--dry-run", action="store_true", help="실제 DB 업데이트 없이 미리보기만")
    args = parser.parse_args()

    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    docs = get_target_documents()
    print(f"대상 문서: {len(docs)}건")

    if not docs:
        print("처리할 문서가 없습니다.")
        return

    updated = 0
    skipped = 0
    errors = 0

    for i, doc in enumerate(docs, 1):
        try:
            ocr = doc.get("ocr", {})
            # summary 우선, 없으면 full_text 사용
            text = ocr.get("summary") or ocr.get("full_text") or ""
            if not text or text.startswith("크레딧 부족"):
                skipped += 1
                continue

            original_name = doc.get("upload", {}).get("originalName", "")
            ext = os.path.splitext(original_name)[1].lower() if original_name else ""

            # OpenAI로 제목 생성
            title = await generate_title(text)
            if not title:
                skipped += 1
                continue

            # 제목 정제
            safe_title = re.sub(r'[\\/:*?"<>|]', '', title)
            safe_title = re.sub(r'\s+', ' ', safe_title).strip()
            if len(safe_title) > 40:
                safe_title = safe_title[:40].rstrip()

            display_name = f"{safe_title}{ext}" if ext else safe_title

            if args.dry_run:
                print(f"  [{i}/{len(docs)}] {original_name} -> {display_name}")
            else:
                db["files"].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"displayName": display_name}}
                )
                print(f"  [{i}/{len(docs)}] {original_name} -> {display_name}")

            updated += 1

            # Rate limiting
            await asyncio.sleep(0.3)

        except Exception as e:
            print(f"  [{i}/{len(docs)}] ERROR {doc['_id']}: {e}")
            errors += 1

    mode = "(DRY RUN)" if args.dry_run else ""
    print(f"\n완료 {mode}: {updated}건 업데이트, {skipped}건 스킵, {errors}건 실패")


if __name__ == "__main__":
    asyncio.run(main())
