#!/usr/bin/env python3
"""
엑셀 파일 키워드 검색 도구 (CLI)
모든 탭에서 키워드를 검색하고 일치하는 행의 전체 데이터 출력
"""

import pandas as pd
import sys
from pathlib import Path


def search_excel(file_path: str, keyword: str):
    """
    엑셀 파일에서 키워드 검색

    Args:
        file_path: 엑셀 파일 경로
        keyword: 검색할 키워드
    """
    print(f"\n📂 파일: {file_path}")
    print(f"🔍 검색어: '{keyword}'")
    print("=" * 80)

    # 엑셀 파일의 모든 시트 읽기
    try:
        excel_file = pd.ExcelFile(file_path)
    except Exception as e:
        print(f"❌ 파일 읽기 실패: {e}")
        return

    total_matches = 0

    # 각 시트별로 검색
    for sheet_name in excel_file.sheet_names:
        try:
            # 시트 읽기
            df = pd.read_excel(file_path, sheet_name=sheet_name)

            # 빈 데이터프레임 건너뛰기
            if df.empty:
                continue

            # 키워드가 포함된 행 찾기 (모든 컬럼에서 검색)
            mask = df.astype(str).apply(
                lambda row: row.str.contains(keyword, case=False, na=False).any(),
                axis=1
            )

            matched_rows = df[mask]

            if len(matched_rows) > 0:
                print(f"\n📄 [{sheet_name}] - {len(matched_rows)}건 발견")
                print("-" * 80)

                for idx, (row_num, row_data) in enumerate(matched_rows.iterrows(), 1):
                    total_matches += 1

                    # 행 번호 (엑셀은 1부터 시작, 헤더 고려)
                    excel_row_num = row_num + 2

                    print(f"\n  [{idx}] 행 {excel_row_num}:")

                    # 각 컬럼의 데이터 출력
                    for col_name, cell_value in row_data.items():
                        # NaN이 아닌 경우만 출력
                        if pd.notna(cell_value):
                            # 키워드가 포함된 셀은 강조 표시
                            if keyword.lower() in str(cell_value).lower():
                                print(f"      {col_name}: {cell_value} ⭐")
                            else:
                                print(f"      {col_name}: {cell_value}")

        except Exception as e:
            print(f"\n⚠️  [{sheet_name}] 시트 읽기 실패: {e}")
            continue

    print("\n" + "=" * 80)
    print(f"✅ 검색 완료: 총 {total_matches}건 발견")


def main():
    """메인 함수"""
    print("\n" + "=" * 80)
    print("📊 엑셀 키워드 검색 도구")
    print("=" * 80)

    # 파일 경로 입력
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = input("\n엑셀 파일 경로를 입력하세요: ").strip().strip('"')

    # 파일 존재 확인
    if not Path(file_path).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {file_path}")
        return

    # 키워드 입력
    if len(sys.argv) > 2:
        keyword = sys.argv[2]
    else:
        keyword = input("검색할 키워드를 입력하세요: ").strip()

    if not keyword:
        print("❌ 키워드를 입력해주세요")
        return

    # 검색 실행
    search_excel(file_path, keyword)


if __name__ == "__main__":
    main()
