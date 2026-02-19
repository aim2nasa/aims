# -*- coding: utf-8 -*-
"""
AC v2 리포트 생성기

초성별 customer_results_*.json 파일을 읽어:
1. AIMS 고객일괄등록 호환 엑셀 (customer_import.xlsx)
2. 동일 내용 JSON (customer_import.json)
3. 고객별 실행결과 엑셀 (execution_report.xlsx)

Usage:
    python generate_reports.py <output_base_dir> [--chosung ㄱ,ㄴ,ㄷ]

Examples:
    python generate_reports.py D:\\aims\\tools\\auto_clicker_v2\\output\\ㄴ
    python generate_reports.py D:\\aims\\tools\\auto_clicker_v2\\output\\ㄴ,ㄷ,ㅁ
"""
import os
import sys
import json
import glob
import argparse
from datetime import datetime

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
except ImportError:
    print("[ERROR] openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)


# ──────────────────────────────────────────────────────────
# AIMS 엑셀 포맷 상수 (EXCEL_IMPORT_SPECIFICATION.md v0.2.2)
# ──────────────────────────────────────────────────────────
PERSONAL_COLUMNS = ["고객명", "이메일", "휴대폰", "주소", "성별", "생년월일"]
CORPORATE_COLUMNS = ["고객명", "이메일", "대표전화", "주소", "사업자번호", "대표자명"]

REPORT_COLUMNS = [
    "고객명", "구분", "휴대폰", "이메일", "주소", "성별", "생년월일",
    "CRS 수", "CRS 파일명",
    "AR 수", "AR 파일명",
    "처리상태"
]

# 스타일 상수
HEADER_FONT = Font(name="맑은 고딕", bold=True, size=11, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
HEADER_ALIGNMENT = Alignment(horizontal="center", vertical="center", wrap_text=True)
DATA_FONT = Font(name="맑은 고딕", size=10)
DATA_ALIGNMENT = Alignment(vertical="center", wrap_text=True)
THIN_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)


def load_customer_results(output_dir):
    """초성별 customer_results_*.json 파일 로드 후 통합"""
    all_results = []
    pattern = os.path.join(output_dir, "customer_results_*.json")
    json_files = sorted(glob.glob(pattern))

    if not json_files:
        # 하위 디렉토리 탐색 (output/ㄱ/customer_results_ㄱ.json 구조)
        pattern = os.path.join(output_dir, "*", "customer_results_*.json")
        json_files = sorted(glob.glob(pattern))

    for json_path in json_files:
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                all_results.extend(data)
                print("  [로드] %s → %d명" % (os.path.basename(json_path), len(data)))
        except Exception as e:
            print("  [ERROR] %s 로드 실패: %s" % (json_path, e))

    return all_results


def get_customer_detail(result):
    """customer_result에서 상세정보 추출 (metdo_reader 우선, 폴백 사용)"""
    detail = result.get("customer_detail")
    if detail:
        return detail
    # metdo_reader 실패 시 폴백 데이터 사용
    return result.get("customer_detail_fallback", {})


def normalize_gender(gender_raw):
    """성별 정규화: '남자' → '남', '여자' → '여', '미사용' → ''"""
    if not gender_raw:
        return ""
    g = gender_raw.strip()
    if g in ("남자", "남"):
        return "남"
    if g in ("여자", "여"):
        return "여"
    return ""


def normalize_birth_date(date_raw):
    """생년월일 정규화: 'YYYY.MM.DD' → 'YYYY-MM-DD'"""
    if not date_raw:
        return ""
    return date_raw.strip().replace(".", "-")


def classify_customers(results):
    """고객을 개인/법인으로 분류"""
    personal = []
    corporate = []

    for result in results:
        detail = get_customer_detail(result)
        ctype = detail.get("customer_type", "개인")
        name = result.get("customer_name", "") or detail.get("name", "")

        if not name:
            continue

        if ctype == "법인":
            corporate.append({
                "고객명": name,
                "이메일": detail.get("email", "") or "",
                "대표전화": detail.get("work_phone", "") or detail.get("mobile_phone", "") or "",
                "주소": detail.get("business_address", "") or detail.get("hq_address", "") or "",
                "사업자번호": detail.get("business_number", "") or "",
                "대표자명": "",  # metdo_reader에서 추출 불가
            })
        else:
            personal.append({
                "고객명": name,
                "이메일": detail.get("email", "") or "",
                "휴대폰": detail.get("mobile_phone", "") or "",
                "주소": detail.get("home_address", "") or detail.get("work_address", "") or "",
                "성별": normalize_gender(detail.get("gender", "")),
                "생년월일": normalize_birth_date(detail.get("birth_date", "")),
            })

    return personal, corporate


def apply_header_style(ws, columns):
    """헤더 행에 스타일 적용"""
    for col_idx, col_name in enumerate(columns, 1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGNMENT
        cell.border = THIN_BORDER


def write_data_rows(ws, data_list, columns):
    """데이터 행 작성"""
    for row_idx, data in enumerate(data_list, 2):
        for col_idx, col_name in enumerate(columns, 1):
            value = data.get(col_name, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = DATA_FONT
            cell.alignment = DATA_ALIGNMENT
            cell.border = THIN_BORDER


def auto_column_width(ws, columns, data_list):
    """컬럼 너비 자동 조절"""
    for col_idx, col_name in enumerate(columns, 1):
        max_len = len(col_name) * 2  # 한글은 2배
        for data in data_list[:50]:  # 상위 50개만 샘플링
            val = str(data.get(col_name, ""))
            # 한글 문자는 2배 너비
            char_len = sum(2 if ord(c) > 127 else 1 for c in val)
            max_len = max(max_len, char_len)
        ws.column_dimensions[chr(64 + col_idx) if col_idx <= 26 else "A"].width = min(max_len + 4, 50)


def generate_customer_import_excel(personal, corporate, output_path):
    """AIMS 고객일괄등록 호환 엑셀 생성"""
    wb = Workbook()
    wb.remove(wb.active)  # 기본 시트 제거

    if personal:
        ws = wb.create_sheet("개인고객")
        apply_header_style(ws, PERSONAL_COLUMNS)
        write_data_rows(ws, personal, PERSONAL_COLUMNS)
        auto_column_width(ws, PERSONAL_COLUMNS, personal)

    if corporate:
        ws = wb.create_sheet("법인고객")
        apply_header_style(ws, CORPORATE_COLUMNS)
        write_data_rows(ws, corporate, CORPORATE_COLUMNS)
        auto_column_width(ws, CORPORATE_COLUMNS, corporate)

    if not personal and not corporate:
        print("  [WARN] 개인/법인 고객 데이터가 없습니다.")
        return False

    wb.save(output_path)
    print("  [생성] %s (개인: %d명, 법인: %d명)" % (
        os.path.basename(output_path), len(personal), len(corporate)))
    return True


def generate_customer_import_json(personal, corporate, output_path):
    """AIMS 고객일괄등록 호환 JSON 생성 (엑셀과 동일 내용)"""
    data = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "개인고객": personal,
        "법인고객": corporate,
        "통계": {
            "개인고객_수": len(personal),
            "법인고객_수": len(corporate),
            "총_고객_수": len(personal) + len(corporate),
        }
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("  [생성] %s" % os.path.basename(output_path))
    return True


def generate_execution_report(results, output_path):
    """고객별 실행결과 엑셀 생성"""
    wb = Workbook()
    ws = wb.active
    ws.title = "실행결과"

    apply_header_style(ws, REPORT_COLUMNS)

    for row_idx, result in enumerate(results, 2):
        detail = get_customer_detail(result)
        name = result.get("customer_name", "") or detail.get("name", "")
        ctype = detail.get("customer_type", "개인")

        # CRS (변액리포트) 정보
        var_info = result.get("variable_insurance", {})
        crs_saved = var_info.get("saved", 0)
        crs_files = var_info.get("saved_files", [])
        crs_filenames = "\n".join(crs_files) if crs_files else ""

        # AR 정보
        ar_info = result.get("annual_report", {})
        ar_saved = 1 if ar_info.get("saved") else 0
        ar_files = ar_info.get("saved_files", [])
        ar_filenames = "\n".join(ar_files) if ar_files else ""

        # 처리 상태
        issues = result.get("issues", [])
        status = "완료" if not issues else "문제 있음: " + "; ".join(issues[:2])

        row_data = {
            "고객명": name,
            "구분": ctype,
            "휴대폰": detail.get("mobile_phone", "") or "",
            "이메일": detail.get("email", "") or "",
            "주소": (detail.get("home_address", "") or detail.get("business_address", "") or
                    detail.get("work_address", "") or ""),
            "성별": normalize_gender(detail.get("gender", "")),
            "생년월일": normalize_birth_date(detail.get("birth_date", "")),
            "CRS 수": crs_saved,
            "CRS 파일명": crs_filenames,
            "AR 수": ar_saved,
            "AR 파일명": ar_filenames,
            "처리상태": status,
        }

        for col_idx, col_name in enumerate(REPORT_COLUMNS, 1):
            value = row_data.get(col_name, "")
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = DATA_FONT
            cell.alignment = DATA_ALIGNMENT
            cell.border = THIN_BORDER

    auto_column_width(ws, REPORT_COLUMNS, [])

    # 컬럼 너비 수동 보정 (파일명은 넓게)
    ws.column_dimensions["I"].width = 40  # CRS 파일명
    ws.column_dimensions["K"].width = 40  # AR 파일명

    wb.save(output_path)
    print("  [생성] %s (%d명)" % (os.path.basename(output_path), len(results)))
    return True


def main():
    parser = argparse.ArgumentParser(description="AC v2 리포트 생성기")
    parser.add_argument("output_dir", help="출력 베이스 디렉토리 (customer_results_*.json이 있는 경로)")
    parser.add_argument("--chosung", help="초성 필터 (쉼표 구분, 예: ㄱ,ㄴ,ㄷ)")
    args = parser.parse_args()

    output_dir = args.output_dir
    if not os.path.isdir(output_dir):
        print("[ERROR] 디렉토리가 존재하지 않습니다: %s" % output_dir)
        sys.exit(1)

    print("=" * 60)
    print("AC v2 리포트 생성기")
    print("=" * 60)
    print("  출력 디렉토리: %s" % output_dir)
    print()

    # 1. customer_results JSON 로드
    print("[1단계] 고객 결과 JSON 로드")
    results = load_customer_results(output_dir)
    if not results:
        print("  [WARN] 로드된 고객 결과가 없습니다.")
        print("  확인: customer_results_*.json 파일이 존재하는지 확인하세요.")
        sys.exit(0)
    print("  총 %d명 로드 완료" % len(results))
    print()

    # 2. 개인/법인 분류
    print("[2단계] 개인/법인 고객 분류")
    personal, corporate = classify_customers(results)
    print("  개인: %d명, 법인: %d명" % (len(personal), len(corporate)))
    print()

    # 3. AIMS 고객일괄등록 엑셀 생성
    print("[3단계] AIMS 고객일괄등록 엑셀 생성")
    excel_path = os.path.join(output_dir, "customer_import.xlsx")
    generate_customer_import_excel(personal, corporate, excel_path)
    print()

    # 4. 통합 JSON 생성
    print("[4단계] 통합 JSON 생성")
    json_path = os.path.join(output_dir, "customer_import.json")
    generate_customer_import_json(personal, corporate, json_path)
    print()

    # 5. 고객별 실행결과 엑셀 생성
    print("[5단계] 고객별 실행결과 엑셀 생성")
    report_path = os.path.join(output_dir, "execution_report.xlsx")
    generate_execution_report(results, report_path)
    print()

    # 완료
    print("=" * 60)
    print("리포트 생성 완료!")
    print("  - %s" % os.path.basename(excel_path))
    print("  - %s" % os.path.basename(json_path))
    print("  - %s" % os.path.basename(report_path))
    print("=" * 60)


if __name__ == "__main__":
    main()
