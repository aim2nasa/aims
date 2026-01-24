# -*- coding: utf-8 -*-
"""
고객목록조회 테이블 파서 - Final
정확한 X좌표 범위 기반
"""
import sys
import json

sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 정확한 컬럼 X좌표 범위 (캘리브레이션 완료)
COLUMN_RANGES = [
    ("고객명",         0,   170),
    ("구분",         170,   280),
    ("생년월일",     280,   500),
    ("보험나이",     500,   570),
    ("성별",         570,   700),
    ("이메일",       700,  1000),
    ("휴대폰",      1000,  1200),
    ("가입설계만료일", 1200, 1400),
]

TABLE_Y_START = 420
TABLE_Y_END = 900


def load_ocr_result(json_path: str) -> list:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    fields = data.get("images", [{}])[0].get("fields", [])

    result = []
    for field in fields:
        vertices = field.get("boundingPoly", {}).get("vertices", [])
        if not vertices:
            continue
        x = vertices[0].get("x", 0)
        y = vertices[0].get("y", 0)
        text = field.get("inferText", "").strip()
        if text:
            result.append({"text": text, "x": x, "y": y})
    return result


def get_column_name(x: float) -> str:
    for col_name, x_start, x_end in COLUMN_RANGES:
        if x_start <= x < x_end:
            return col_name
    return None


def group_into_rows(fields: list, y_threshold: int = 20) -> list:
    table_fields = [f for f in fields if TABLE_Y_START <= f["y"] <= TABLE_Y_END]
    if not table_fields:
        return []

    table_fields.sort(key=lambda f: f["y"])

    rows = []
    current_row = []
    current_y = None

    for field in table_fields:
        if current_y is None:
            current_y = field["y"]
            current_row.append(field)
        elif abs(field["y"] - current_y) <= y_threshold:
            current_row.append(field)
        else:
            if current_row:
                rows.append(current_row)
            current_row = [field]
            current_y = field["y"]

    if current_row:
        rows.append(current_row)

    return rows


def parse_row(row_fields: list) -> dict:
    result = {col: "" for col, _, _ in COLUMN_RANGES}

    for field in row_fields:
        col_name = get_column_name(field["x"])
        if col_name:
            if result[col_name]:
                result[col_name] += " " + field["text"]
            else:
                result[col_name] = field["text"]

    return result


def parse_table(json_path: str, max_rows: int = 15) -> list:
    fields = load_ocr_result(json_path)
    rows = group_into_rows(fields)

    table_data = []
    for row in rows:
        row_data = parse_row(row)
        if row_data.get("고객명"):
            table_data.append(row_data)

    return table_data[:max_rows]


def print_table(data: list):
    print()
    print("| No | 고객명 | 구분 | 생년월일 | 나이 | 성별 | 이메일 | 휴대폰 | 가입설계만료일 |")
    print("|---:|:-------|:-----|:---------|-----:|:-----|:-------|:-------|:---------------|")

    for i, row in enumerate(data):
        print(f"| {i+1} | {row.get('고객명', '')} | {row.get('구분', '')} | {row.get('생년월일', '')} | {row.get('보험나이', '')} | {row.get('성별', '')} | {row.get('이메일', '')} | {row.get('휴대폰', '')} | {row.get('가입설계만료일', '')} |")

    print()
    print(f"총 {len(data)}행")


if __name__ == "__main__":
    table_data = parse_table(r"D:\aims\clova_response.json", max_rows=15)
    print_table(table_data)
