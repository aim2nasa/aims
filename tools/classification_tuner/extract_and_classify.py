#!/usr/bin/env python3
"""
extract_and_classify.py — 로컬 파일에서 텍스트 추출 + 현재 프롬프트로 분류

사용법:
  python extract_and_classify.py --folder /path/to/samples --output results/run_001.json
  python extract_and_classify.py --files file1.pdf file2.pdf --output results/run_001.json
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

# .env.shared에서 OPENAI_API_KEY 로드
ENV_SHARED = Path(__file__).resolve().parent.parent.parent / ".env.shared"
if ENV_SHARED.exists():
    for line in ENV_SHARED.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

import openai
import pdfplumber

# SSOT: openai_service.py에서 프롬프트/상수 직접 import
from services.openai_service import (
    CLASSIFICATION_SYSTEM_PROMPT,
    CLASSIFICATION_USER_PROMPT,
    VALID_DOCUMENT_TYPES,
    SYSTEM_ONLY_TYPES,
    TAG_NORMALIZATION,
)


def extract_text_pdf(filepath: str) -> str:
    """pdfplumber로 PDF 텍스트 추출"""
    text_parts = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        return f"[추출 실패: {e}]"
    return "\n".join(text_parts)


def extract_text(filepath: str) -> str:
    """파일 유형에 따라 텍스트 추출"""
    ext = Path(filepath).suffix.lower()
    if ext == ".pdf":
        return extract_text_pdf(filepath)
    elif ext in (".txt", ".csv", ".md"):
        return Path(filepath).read_text(encoding="utf-8", errors="replace")
    else:
        return f"[지원하지 않는 형식: {ext}]"


def validate_document_type(doc_type: str) -> str:
    """AI 분류 결과 검증 (openai_service.py 로직 동일)"""
    if not doc_type or doc_type in SYSTEM_ONLY_TYPES or doc_type not in VALID_DOCUMENT_TYPES:
        return "general"
    return doc_type


def normalize_tags(tags: list) -> list:
    """태그 정규화 (openai_service.py 로직 동일)"""
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
    """현재 프롬프트로 텍스트 분류 (openai_service.py 로직 재현)"""
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
                "raw_response": content, "usage": usage, "truncated": truncated,
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


async def main():
    parser = argparse.ArgumentParser(description="파일에서 텍스트 추출 + 분류")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--folder", help="PDF 파일이 있는 폴더 경로")
    group.add_argument("--files", nargs="+", help="개별 파일 경로 리스트")
    parser.add_argument("--output", default=None, help="결과 저장 경로 (기본: results/run_YYYYMMDD_HHmmss.json)")
    parser.add_argument("--extensions", default=".pdf", help="처리할 확장자 (쉼표 구분, 기본: .pdf)")
    args = parser.parse_args()

    # 파일 목록 수집
    files = []
    if args.folder:
        exts = [e.strip() for e in args.extensions.split(",")]
        folder = Path(args.folder)
        if not folder.exists():
            print(f"[오류] 폴더가 존재하지 않습니다: {folder}")
            sys.exit(1)
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() in exts:
                files.append(f)
    else:
        files = [Path(f) for f in args.files]

    if not files:
        print("[오류] 처리할 파일이 없습니다.")
        sys.exit(1)

    print(f"[INFO] 처리 대상: {len(files)}개 파일")

    # OpenAI 클라이언트 생성
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("[오류] OPENAI_API_KEY가 설정되지 않았습니다.")
        sys.exit(1)
    client = openai.AsyncOpenAI(api_key=api_key)

    # 처리
    results = []
    total_tokens = 0
    for i, filepath in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {filepath.name} ... ", end="", flush=True)

        text = extract_text(str(filepath))
        if text.startswith("["):
            print(f"스킵 ({text})")
            results.append({"filename": filepath.name, "filepath": str(filepath), "error": text})
            continue

        classification = await classify_text(text, client)
        tokens = classification.get("usage", {}).get("total_tokens", 0)
        total_tokens += tokens

        result = {
            "filename": filepath.name,
            "filepath": str(filepath),
            "extracted_text_preview": text[:300],
            "extracted_text_length": len(text),
            "predicted_type": classification["type"],
            "confidence": classification["confidence"],
            "title": classification["title"],
            "summary": classification["summary"],
            "tags": classification["tags"],
            "tokens_used": tokens,
            "truncated": classification.get("truncated", False),
        }
        if "error" in classification:
            result["error"] = classification["error"]
        results.append(result)
        print(f"{classification['type']} ({classification['confidence']:.2f}) [{tokens} tokens]")

    # 출력 경로
    if args.output:
        output_path = Path(args.output)
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = Path(__file__).parent / "results" / f"run_{ts}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "run_at": datetime.now().isoformat(),
        "total_files": len(files),
        "total_tokens": total_tokens,
        "results": results,
    }
    output_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[완료] 결과 저장: {output_path}")
    print(f"[통계] 파일 {len(files)}개, 총 토큰 {total_tokens}, 예상 비용 ~${total_tokens * 0.00000015:.4f}")


if __name__ == "__main__":
    asyncio.run(main())
