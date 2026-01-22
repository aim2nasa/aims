"""
JSON 내보내기 모듈
"""
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import asdict
from datetime import datetime

import sys
sys.path.insert(0, str(__file__).rsplit("\\", 2)[0])

from models.contract import ContractRow


class JsonExporter:
    """JSON 내보내기"""

    @staticmethod
    def export(
        rows: List[ContractRow],
        output_path: str,
        metadata: Optional[Dict[str, Any]] = None,
        indent: int = 2
    ) -> str:
        """
        계약 데이터를 JSON으로 내보내기

        Args:
            rows: ContractRow 목록
            output_path: 출력 파일 경로
            metadata: 추가 메타데이터
            indent: JSON 들여쓰기

        Returns:
            저장된 파일 경로
        """
        output = {
            "meta": {
                "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_count": len(rows),
                **(metadata or {}),
            },
            "contracts": [asdict(row) for row in rows],
        }

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8-sig") as f:
            json.dump(output, f, ensure_ascii=False, indent=indent)

        return str(path)

    @staticmethod
    def export_raw(
        data: Dict[str, Any],
        output_path: str,
        indent: int = 2
    ) -> str:
        """
        원시 데이터를 JSON으로 내보내기 (디버깅용)

        Args:
            data: 저장할 데이터
            output_path: 출력 파일 경로
            indent: JSON 들여쓰기

        Returns:
            저장된 파일 경로
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8-sig") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)

        return str(path)
