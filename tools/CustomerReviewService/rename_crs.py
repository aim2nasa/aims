#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
import sys
import argparse
from pathlib import Path
from datetime import datetime
import shutil

# 텍스트 추출: pdfminer.six 권장 (한국어 인식 안정적)
# pip install pdfminer.six
from pdfminer.high_level import extract_text

ILLEGAL = r'\/:*?"<>|'

def sanitize_filename(name: str) -> str:
    for ch in ILLEGAL:
        name = name.replace(ch, "")
    # 공백 정리
    name = re.sub(r"\s+", " ", name).strip()
    return name

def normalize_date(raw: str) -> str:
    raw = raw.strip()
    # 2025년 9월 9일
    m = re.search(r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", raw)
    if m:
        y, mo, d = map(int, m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}"
    # 2025-09-09 or 2025.09.09 or 2025/09/09
    m = re.search(r"(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})", raw)
    if m:
        y, mo, d = map(int, m.groups())
        return f"{y:04d}-{mo:02d}-{d:02d}"
    # 마지막 방어: 파싱 실패 시 오늘 날짜
    return datetime.now().strftime("%Y-%m-%d")

def normalize_product(raw: str) -> str:
    s = raw
    # 앞의 "무)" 제거
    s = re.sub(r"^\s*무\)\s*", "", s)
    # 'V보험' -> '보험' (모델명 V 제거)
    s = re.sub(r"V(?=보험)", "", s)
    # '..., 종신, 전기납' 등 뒤쪽 설명은 제거하고 '...보험(월납...)'까지만 보존
    m = re.search(r"(.+?보험(?:\([^)]*\))?)", s)
    if m:
        s = m.group(1)
    # 여백 정리
    s = re.sub(r"\s+", " ", s).strip()
    return s

def extract_first_page_text(pdf_path: Path) -> str:
    return extract_text(str(pdf_path), page_numbers=[0]) or ""

def find_customer(text: str) -> str:
    # 1순위: "계약자 : 이름"
    m = re.search(r"계약자\s*[:：]\s*([^\s\n]+)", text)
    if m:
        return m.group(1)
    # 2순위: "정지호 고객님"
    m = re.search(r"([^\s\n]+)\s*고객님", text)
    if m:
        return m.group(1)
    # 실패 시 기본값
    return "고객"

def find_product(text: str) -> str:
    # 라인 단위로 후보 탐색
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    # 가장 강한 패턴: '변액유니버셜' 포함 라인
    for ln in lines:
        if "변액유니버셜" in ln or ("보험" in ln and "월납" in ln):
            return normalize_product(ln)
    # 문서에서 섹션 위치로 직접 추출
    m = re.search(r"상품명\s*[:：]?\s*(.+)", text)
    if m:
        return normalize_product(m.group(1))
    # 실패 시 기본값
    return "상품"

def find_issue_date(text: str) -> str:
    # '발행(기준)일:' 바로 뒤
    m = re.search(r"발행\(기준\)일\s*[:：]\s*([^\n]+)", text)
    if m:
        return normalize_date(m.group(1))
    # 여의치 않으면 문서 전체에서 날짜 패턴 첫 매치
    m = re.search(r"\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일", text)
    if m:
        return normalize_date(m.group(0))
    m = re.search(r"\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}", text)
    if m:
        return normalize_date(m.group(0))
    return datetime.now().strftime("%Y-%m-%d")

def build_filename(customer: str, product: str, date_yyyy_mm_dd: str) -> str:
    base = f"{customer}_CRS_{product}_{date_yyyy_mm_dd}.pdf"
    return sanitize_filename(base)

def unique_path(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem, suf = dest.stem, dest.suffix
    i = 2
    while True:
        cand = dest.with_name(f"{stem}({i}){suf}")
        if not cand.exists():
            return cand
        i += 1

def process(pdf_in: Path, outdir: Path) -> Path:
    text = extract_first_page_text(pdf_in)

    customer = find_customer(text)
    product  = find_product(text)
    issue_dt = find_issue_date(text)

    new_name = build_filename(customer, product, issue_dt)
    outdir.mkdir(parents=True, exist_ok=True)

    target = unique_path(outdir / new_name)
    shutil.copy2(pdf_in, target)
    return target

def main():
    ap = argparse.ArgumentParser(description="CRS PDF 1페이지에서 핵심값 추출 → 파일명 생성 → 복사 저장")
    ap.add_argument("pdf", type=str, help="입력 PDF 경로")
    ap.add_argument("--outdir", type=str, default="", help="출력 폴더(미지정 시 입력 파일과 동일 폴더)")
    args = ap.parse_args()

    src = Path(args.pdf).expanduser().resolve()
    if not src.exists():
        print(f"[에러] 파일이 존재하지 않습니다: {src}")
        sys.exit(1)
    outdir = Path(args.outdir).expanduser().resolve() if args.outdir else src.parent

    new_path = process(src, outdir)
    print(str(new_path))

if __name__ == "__main__":
    main()
