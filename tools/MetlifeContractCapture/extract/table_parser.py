"""
테이블 데이터 파싱 및 정규화 모듈
"""
import re
from typing import List, Dict, Any, Optional, Set
from dataclasses import asdict

import sys
sys.path.insert(0, str(__file__).rsplit("\\", 2)[0])

from models.contract import ContractRow


class TableParser:
    """테이블 데이터 파서"""

    @staticmethod
    def normalize_date(date_str: Optional[str]) -> Optional[str]:
        """
        날짜 형식 정규화

        Args:
            date_str: 원본 날짜 문자열

        Returns:
            정규화된 날짜 (YYYY-MM-DD 형식) 또는 None
        """
        if not date_str:
            return None

        date_str = str(date_str).strip()

        # 이미 YYYY-MM-DD 형식
        if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
            return date_str

        # YYYY.MM.DD 또는 YYYY/MM/DD
        match = re.match(r"^(\d{4})[./](\d{2})[./](\d{2})$", date_str)
        if match:
            return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

        # YYMMDD (6자리, 생년월일)
        if re.match(r"^\d{6}$", date_str):
            return date_str  # 생년월일은 그대로 유지

        return date_str

    @staticmethod
    def normalize_number(num_str: Optional[Any]) -> int:
        """
        숫자 정규화 (쉼표 제거)

        Args:
            num_str: 원본 숫자 문자열 또는 숫자

        Returns:
            정수값
        """
        if num_str is None:
            return 0
        if isinstance(num_str, (int, float)):
            return int(num_str)

        cleaned = re.sub(r"[^\d]", "", str(num_str))
        return int(cleaned) if cleaned else 0

    @staticmethod
    def normalize_gender(gender_str: Optional[str]) -> Optional[str]:
        """
        성별 정규화

        Args:
            gender_str: 원본 성별 문자열

        Returns:
            "남" 또는 "여" 또는 None
        """
        if not gender_str:
            return None

        gender_str = str(gender_str).strip()

        if gender_str in ("남", "M", "Male", "male"):
            return "남"
        if gender_str in ("여", "F", "Female", "female"):
            return "여"

        return gender_str

    @staticmethod
    def _safe_str(value: Any, default: str = "") -> str:
        """None-safe 문자열 변환 (None → 빈 문자열)"""
        if value is None:
            return default
        return str(value).strip()

    def parse_row(self, raw_row: Dict[str, Any]) -> ContractRow:
        """
        원시 데이터를 ContractRow로 변환

        Args:
            raw_row: Claude Vision에서 추출된 원시 행 데이터

        Returns:
            정규화된 ContractRow
        """
        # 모집/이양 키 처리 (슬래시 포함된 키 대응)
        모집이양_value = raw_row.get("모집이양") or raw_row.get("모집/이양")

        return ContractRow(
            순번=self.normalize_number(raw_row.get("순번")),
            계약일=self.normalize_date(raw_row.get("계약일")),
            계약자=self._safe_str(raw_row.get("계약자")),
            생년월일=self.normalize_date(raw_row.get("생년월일")),
            성별=self.normalize_gender(raw_row.get("성별")),
            지역=self._safe_str(raw_row.get("지역")) or None,
            피보험자=self._safe_str(raw_row.get("피보험자")),
            증권번호=self._safe_str(raw_row.get("증권번호")),
            보험상품=self._safe_str(raw_row.get("보험상품")),
            통화=self._safe_str(raw_row.get("통화"), "KRW"),
            월납입보험료=self.normalize_number(raw_row.get("월납입보험료")),
            상태=self._safe_str(raw_row.get("상태")) or None,
            수금방법=self._safe_str(raw_row.get("수금방법")) or None,
            납입상태=self._safe_str(raw_row.get("납입상태")) or None,
            전자청약=self._safe_str(raw_row.get("전자청약")) or None,
            모집이양=self._safe_str(모집이양_value),
            신탁=self._safe_str(raw_row.get("신탁")) or None,
        )

    def merge_results(
        self,
        results: List[Dict[str, Any]],
        dedupe_by: str = "증권번호"
    ) -> List[ContractRow]:
        """
        여러 이미지 결과 병합 및 중복 제거

        Args:
            results: Claude Vision 추출 결과 목록
            dedupe_by: 중복 제거 기준 필드명

        Returns:
            병합된 ContractRow 목록
        """
        seen_keys: Set[str] = set()
        merged_rows: List[ContractRow] = []

        for result in results:
            if "error" in result and result["error"]:
                print(f"[WARN] 추출 오류 스킵: {result.get('source_image')}")
                continue

            for raw_row in result.get("rows", []):
                row = self.parse_row(raw_row)

                # 유효성 검사
                if not row.is_valid():
                    continue

                # 중복 제거
                key = getattr(row, dedupe_by, None)
                if key and key not in seen_keys:
                    seen_keys.add(key)
                    merged_rows.append(row)

        # 순번 재정렬
        for i, row in enumerate(merged_rows, 1):
            row.순번 = i

        return merged_rows

    def to_dicts(self, rows: List[ContractRow]) -> List[Dict[str, Any]]:
        """
        ContractRow 목록을 딕셔너리 목록으로 변환

        Args:
            rows: ContractRow 목록

        Returns:
            딕셔너리 목록
        """
        return [asdict(row) for row in rows]

    def get_statistics(self, rows: List[ContractRow]) -> Dict[str, Any]:
        """
        데이터 통계 계산

        Args:
            rows: ContractRow 목록

        Returns:
            통계 정보
        """
        if not rows:
            return {
                "total_count": 0,
                "total_premium": 0,
                "avg_premium": 0,
                "by_status": {},
                "by_currency": {},
            }

        total_premium = sum(row.월납입보험료 for row in rows)

        by_status: Dict[str, int] = {}
        by_currency: Dict[str, int] = {}

        for row in rows:
            status = row.상태 or "미상"
            by_status[status] = by_status.get(status, 0) + 1

            currency = row.통화 or "KRW"
            by_currency[currency] = by_currency.get(currency, 0) + 1

        return {
            "total_count": len(rows),
            "total_premium": total_premium,
            "avg_premium": total_premium // len(rows) if rows else 0,
            "by_status": by_status,
            "by_currency": by_currency,
        }
