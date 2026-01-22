"""
Excel 내보내기 모듈
"""
from pathlib import Path
from typing import List, Optional
from dataclasses import asdict

import pandas as pd

import sys
sys.path.insert(0, str(__file__).rsplit("\\", 2)[0])

from models.contract import ContractRow


class ExcelExporter:
    """Excel 내보내기"""

    # 컬럼 순서
    COLUMN_ORDER = [
        "순번", "계약일", "계약자", "생년월일", "성별", "지역",
        "피보험자", "증권번호", "보험상품", "통화", "월납입보험료",
        "상태", "수금방법", "납입상태", "전자청약", "모집이양", "신탁"
    ]

    # 컬럼 너비 설정
    COLUMN_WIDTHS = {
        "순번": 8,
        "계약일": 12,
        "계약자": 12,
        "생년월일": 10,
        "성별": 6,
        "지역": 14,
        "피보험자": 12,
        "증권번호": 14,
        "보험상품": 30,
        "통화": 6,
        "월납입보험료": 14,
        "상태": 8,
        "수금방법": 10,
        "납입상태": 10,
        "전자청약": 8,
        "모집이양": 8,
        "신탁": 6,
    }

    @staticmethod
    def export(
        rows: List[ContractRow],
        output_path: str,
        sheet_name: str = "계약사항"
    ) -> str:
        """
        계약 데이터를 Excel로 내보내기

        Args:
            rows: ContractRow 목록
            output_path: 출력 파일 경로
            sheet_name: 시트 이름

        Returns:
            저장된 파일 경로
        """
        # DataFrame 생성
        df = pd.DataFrame([asdict(row) for row in rows])

        # 컬럼 순서 정렬
        existing_cols = [c for c in ExcelExporter.COLUMN_ORDER if c in df.columns]
        df = df[existing_cols]

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Excel 저장
        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name=sheet_name, index=False)

            # 컬럼 너비 조정
            worksheet = writer.sheets[sheet_name]
            for i, col in enumerate(df.columns):
                col_letter = chr(65 + i)  # A, B, C, ...
                width = ExcelExporter.COLUMN_WIDTHS.get(col, 12)
                worksheet.column_dimensions[col_letter].width = width

        return str(path)

    @staticmethod
    def export_with_statistics(
        rows: List[ContractRow],
        output_path: str,
        statistics: Optional[dict] = None
    ) -> str:
        """
        계약 데이터와 통계를 Excel로 내보내기

        Args:
            rows: ContractRow 목록
            output_path: 출력 파일 경로
            statistics: 통계 데이터

        Returns:
            저장된 파일 경로
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with pd.ExcelWriter(path, engine="openpyxl") as writer:
            # 메인 데이터 시트
            df = pd.DataFrame([asdict(row) for row in rows])
            existing_cols = [c for c in ExcelExporter.COLUMN_ORDER if c in df.columns]
            df = df[existing_cols]
            df.to_excel(writer, sheet_name="계약사항", index=False)

            # 통계 시트
            if statistics:
                stats_df = pd.DataFrame([
                    {"항목": "총 계약 수", "값": statistics.get("total_count", 0)},
                    {"항목": "총 월납입보험료", "값": statistics.get("total_premium", 0)},
                    {"항목": "평균 월납입보험료", "값": statistics.get("avg_premium", 0)},
                ])
                stats_df.to_excel(writer, sheet_name="통계", index=False)

            # 컬럼 너비 조정
            worksheet = writer.sheets["계약사항"]
            for i, col in enumerate(df.columns):
                col_letter = chr(65 + i)
                width = ExcelExporter.COLUMN_WIDTHS.get(col, 12)
                worksheet.column_dimensions[col_letter].width = width

        return str(path)
