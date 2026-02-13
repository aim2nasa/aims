"""
기존 AR 데이터의 fsr_name, report_title 복구 스크립트
PDF 1페이지에서 추출하여 customers.annual_reports에 업데이트
"""
import re
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient
from bson import ObjectId
from utils.pdf_utils import extract_text_from_page

client = MongoClient("mongodb://localhost:27017")
db = client["docupload"]

# 모든 AR을 가져와서 fsr_name, report_title 업데이트
custs = list(db["customers"].find(
    {"annual_reports.0": {"$exists": True}},
    {"annual_reports": 1}
))

fixed_fsr = 0
fixed_title = 0
no_file = 0
errors = 0

for c in custs:
    reports = c.get("annual_reports", [])
    updated = False

    for i, ar in enumerate(reports):
        needs_fsr = ar.get("fsr_name") is None
        needs_title = ar.get("report_title") is None

        if not needs_fsr and not needs_title:
            continue

        source_file_id = ar.get("source_file_id")
        if not source_file_id:
            no_file += 1
            continue

        file_doc = db["files"].find_one({"_id": source_file_id}, {"upload.destPath": 1})
        if not file_doc:
            no_file += 1
            continue

        file_path = file_doc.get("upload", {}).get("destPath")
        if not file_path or not os.path.exists(file_path):
            no_file += 1
            continue

        try:
            text = extract_text_from_page(file_path, page_num=0)

            # fsr_name 추출
            if needs_fsr:
                fsr_match = re.search(r"([가-힣]\s*[가-힣]\s*[가-힣])\s*\n\s*FSR", text)
                if fsr_match:
                    fsr_name = fsr_match.group(1).replace(" ", "").strip()
                    reports[i]["fsr_name"] = fsr_name
                    fixed_fsr += 1
                    updated = True
                else:
                    fsr_match2 = re.search(r"(?:FSR|담당자|설계사)[:\s]*([가-힣]{2,4})", text)
                    if fsr_match2:
                        reports[i]["fsr_name"] = fsr_match2.group(1).strip()
                        fixed_fsr += 1
                        updated = True

            # report_title 추출
            if needs_title:
                title_match = re.search(r"(Annual\s+Review\s+Report)", text, re.IGNORECASE)
                if title_match:
                    reports[i]["report_title"] = title_match.group(1).strip()
                    fixed_title += 1
                    updated = True
                else:
                    title_kr = re.search(r"(보유계약\s*현황)", text)
                    if title_kr:
                        reports[i]["report_title"] = title_kr.group(1).strip()
                        fixed_title += 1
                        updated = True
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"  Error: {e}")

    if updated:
        db["customers"].update_one(
            {"_id": c["_id"]},
            {"$set": {"annual_reports": reports}}
        )

print(f"Fixed fsr_name: {fixed_fsr}")
print(f"Fixed report_title: {fixed_title}")
print(f"No file/path: {no_file}")
print(f"Errors: {errors}")

# 최종 확인
custs2 = list(db["customers"].find({}, {"annual_reports.fsr_name": 1, "annual_reports.report_title": 1}))
null_fsr = 0
null_title = 0
total = 0
for c2 in custs2:
    for ar in c2.get("annual_reports", []):
        total += 1
        if not ar.get("fsr_name"):
            null_fsr += 1
        if not ar.get("report_title"):
            null_title += 1
print(f"\nAfter fix - Total: {total}, null fsr: {null_fsr}, null title: {null_title}")

client.close()
