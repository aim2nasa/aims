"""
계약 데이터 모델
MetLife 계약사항 조회 테이블의 각 행을 표현
"""
from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, Any


@dataclass
class ContractRow:
    """계약 데이터 행"""
    순번: int = 0
    계약일: Optional[str] = None  # YYYY-MM-DD
    계약자: str = ""
    생년월일: Optional[str] = None  # YYMMDD 또는 YYYY-MM-DD
    성별: Optional[str] = None  # "남" / "여"
    지역: Optional[str] = None
    피보험자: str = ""
    증권번호: str = ""
    보험상품: str = ""
    통화: str = "KRW"
    월납입보험료: int = 0
    상태: Optional[str] = None  # 정상, 만기, 생존소멸 등
    수금방법: Optional[str] = None
    납입상태: Optional[str] = None
    전자청약: Optional[str] = None
    모집이양: Optional[str] = None  # 이양, 모집 등
    신탁: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContractRow":
        """딕셔너리에서 생성"""
        # 모집/이양 키 처리 (슬래시 포함된 키 대응)
        if "모집/이양" in data and "모집이양" not in data:
            data["모집이양"] = data.pop("모집/이양")

        # 알려진 필드만 추출
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}

        return cls(**filtered)

    def is_valid(self) -> bool:
        """유효성 검사 - 최소 필수 필드 존재 여부"""
        return bool(self.증권번호 and self.계약자)
