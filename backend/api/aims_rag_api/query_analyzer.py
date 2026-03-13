# query_analyzer.py
"""
쿼리 의도 분석 모듈

사용자 검색 쿼리를 분석하여 최적의 검색 전략을 결정합니다.
- entity: 개체명 쿼리 (사람, 회사, 문서명) → 메타데이터 검색
- concept: 개념 쿼리 (주제, 기술, 키워드) → 벡터 검색
- mixed: 혼합 쿼리 → 하이브리드 검색
"""

from openai import OpenAI
from typing import Dict, List
import json
import time
import hashlib
from system_logger import send_error_log

# P2-1: 쿼리 분석 결과 캐시 (TTL 10분)
# 동일 쿼리 반복 시 LLM 호출을 생략하여 400~1200ms 절약
_query_cache: Dict[str, tuple] = {}  # {query_hash: (result, timestamp)}
_CACHE_TTL = 600  # 10분


class QueryAnalyzer:
    """쿼리 의도를 분석하여 검색 전략 결정"""

    def __init__(self):
        self.client = OpenAI()

    def analyze(self, query: str) -> Dict:
        """
        쿼리를 분석하여 의도 파악

        Args:
            query: 사용자 검색 쿼리

        Returns:
            {
                "query_type": "entity" | "concept" | "mixed",
                "entities": ["곽승철"],
                "concepts": ["이력", "경력"],
                "metadata_keywords": ["곽승철", "이력서"]
            }
        """

        # P2-1: 캐시 확인 (TTL 10분)
        cache_key = hashlib.md5(query.strip().lower().encode()).hexdigest()
        if cache_key in _query_cache:
            cached_result, cached_time = _query_cache[cache_key]
            if time.time() - cached_time < _CACHE_TTL:
                print(f"📊 쿼리 분석 캐시 히트: '{query[:30]}...'")
                return cached_result
            else:
                del _query_cache[cache_key]  # 만료된 캐시 삭제

        prompt = f"""다음 검색 쿼리를 분석하여 JSON 형식으로 답변해줘.

쿼리: "{query}"

분석 항목:
1. query_type:
   - "entity": 특정 사람, 회사, 문서명을 찾는 쿼리 (예: "곽승철에 대해서", "김철수 이력서")
   - "concept": 주제, 개념, 기술을 찾는 쿼리 (예: "USB Firmware 개발", "보험 계약서")
   - "mixed": 둘 다 포함 (예: "곽승철의 USB 개발 경험")

2. entities: 고유명사 추출 (사람명, 회사명, 문서명)
   - 예: ["곽승철"], ["삼성전자", "애플"]

3. concepts: 일반 개념/주제 추출
   - 예: ["이력", "경력"], ["소프트웨어", "개발"]

4. metadata_keywords: 파일명, 태그에서 찾을 키워드 (개체명 + 주요 명사)
   - 예: ["곽승철", "이력서"], ["USB", "Firmware", "개발"]

예시 1:
쿼리: "곽승철 이력에 대해서"
{{
  "query_type": "entity",
  "entities": ["곽승철"],
  "concepts": ["이력", "경력"],
  "metadata_keywords": ["곽승철", "이력서", "이력"]
}}

예시 2:
쿼리: "USB Firmware 개발 경험"
{{
  "query_type": "concept",
  "entities": [],
  "concepts": ["USB", "Firmware", "개발", "경험"],
  "metadata_keywords": ["USB", "Firmware", "개발"]
}}

예시 3:
쿼리: "김보성님의 보험 계약 정보"
{{
  "query_type": "mixed",
  "entities": ["김보성"],
  "concepts": ["보험", "계약", "정보"],
  "metadata_keywords": ["김보성", "보험", "계약"]
}}

JSON만 응답해줘:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # 빠르고 저렴한 모델
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)

            # 기본값 설정 (누락된 필드 대비)
            result.setdefault("query_type", "concept")
            result.setdefault("entities", [])
            result.setdefault("concepts", [])
            result.setdefault("metadata_keywords", [])

            # P2-1: 캐시에 저장
            _query_cache[cache_key] = (result, time.time())

            # 캐시 크기 제한 (최대 100개, 초과 시 가장 오래된 것부터 제거)
            if len(_query_cache) > 100:
                oldest_key = min(_query_cache, key=lambda k: _query_cache[k][1])
                del _query_cache[oldest_key]

            return result

        except Exception as e:
            print(f"❌ 쿼리 분석 중 오류 발생: {e}")
            send_error_log("aims_rag_api", f"QueryAnalyzer 쿼리 분석 오류: {e}", e)
            # 오류 시 기본 개념 쿼리로 처리
            return {
                "query_type": "concept",
                "entities": [],
                "concepts": query.split(),
                "metadata_keywords": query.split()
            }


# 사용 예시
if __name__ == '__main__':
    analyzer = QueryAnalyzer()

    # 테스트 쿼리들
    test_queries = [
        "곽승철에 대해서",
        "곽승철 이력서",
        "USB Firmware 드라이버 소프트웨어 개발",
        "김보성님의 보험 계약 정보",
        "2025년 2월 퇴직연금 부담금 내역"
    ]

    for query in test_queries:
        print(f"\n🔎 쿼리: '{query}'")
        intent = analyzer.analyze(query)
        print(f"📊 분석 결과:")
        print(f"  - 유형: {intent['query_type']}")
        print(f"  - 개체명: {intent['entities']}")
        print(f"  - 개념: {intent['concepts']}")
        print(f"  - 검색 키워드: {intent['metadata_keywords']}")
