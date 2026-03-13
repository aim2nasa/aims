# reranker.py
"""
Cross-Encoder 재순위화 모듈

하이브리드 검색 결과(Top-20)를 더 정확한 Cross-Encoder 모델로 재순위화합니다.
- 모델: cross-encoder/ms-marco-MiniLM-L-12-v2 (MS MARCO 데이터셋 학습)
- 입력: 쿼리-문서 쌍
- 출력: 관련성 점수 (높을수록 관련 있음)
"""

from typing import List, Dict
from sentence_transformers import CrossEncoder
import traceback
import math


class SearchReranker:
    """Cross-Encoder를 사용한 검색 결과 재순위화"""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-12-v2"):
        """
        Args:
            model_name: Cross-Encoder 모델 이름
                - ms-marco-MiniLM-L-12-v2: 빠르고 정확 (현재 사용, 영어 중심)
                - ms-marco-MiniLM-L-6-v2: 더 빠름, 약간 낮은 정확도
                - cross-encoder/mmarco-mMiniLMv2-L12-H384-v1: 다국어 MS MARCO (P5-3 후보)
                  → 한국어 보험 문서 재순위화 정확도 개선 기대
                  → 주의: Docker 이미지 크기 ~500MB 증가, Phase 1~3 효과 측정 후 결정
        """
        try:
            print(f"🔄 Cross-Encoder 모델 로딩 중: {model_name}")
            self.model = CrossEncoder(model_name, max_length=512)
            print(f"✅ Cross-Encoder 모델 로딩 완료")
        except Exception as e:
            print(f"❌ Cross-Encoder 모델 로딩 실패: {e}")
            print(traceback.format_exc())
            self.model = None

    def rerank(self, query: str, search_results: List[Dict], top_k: int = 5) -> List[Dict]:
        """
        검색 결과를 Cross-Encoder로 재순위화

        Args:
            query: 사용자 검색 쿼리
            search_results: 하이브리드 검색 결과 (Top-20)
            top_k: 최종 반환할 문서 수 (기본 5개)

        Returns:
            재순위화된 검색 결과 (Top-K)
        """
        if not self.model:
            print("⚠️ Cross-Encoder 모델 없음, 재순위화 스킵")
            return search_results[:top_k]

        if not search_results:
            return []

        try:
            # P1-5: 쿼리-문서 쌍 생성 (preview 500→1000자로 확대하여 Cross-Encoder 정확도 향상)
            pairs = []
            for result in search_results:
                # payload에서 preview 추출 (하이브리드 검색 결과 구조)
                # 🔥 수정: None 안전 처리 (payload.get()이 None을 반환할 수 있음)
                payload = result.get('payload') or {}
                preview = (payload.get('preview') or '')[:1000]  # P1-5: 최대 1000자

                # 쿼리-문서 쌍 생성
                pairs.append([query, preview])

            # Cross-Encoder로 관련성 점수 계산
            scores = self.model.predict(pairs)

            # 재순위화 점수 추가
            for i, result in enumerate(search_results):
                # 🔥 점수 정규화: Cross-Encoder 범위 (-10~10) → 0~1 범위로 변환
                # sigmoid 함수 사용: 1 / (1 + exp(-x))
                # 0 근처 점수를 0.5로, 양수는 0.5~1.0, 음수는 0~0.5로 변환
                raw_score = float(scores[i])
                normalized_score = 1.0 / (1.0 + math.exp(-raw_score))

                result["rerank_score"] = normalized_score
                result["original_score"] = result.get("score", 0.0)  # 원본 점수 보존

                # P1-2: final_score 단순화 — 가중 합산 (0.3×original + 0.7×CE)
                # P1-1에서 Entity 점수가 이미 Sigmoid 정규화되었으므로
                # original_score도 0~1 범위, normalized_score(CE)도 0~1 범위
                # → 분기 없이 단순 가중 합산으로 0~1 범위의 final_score 생성
                original = result["original_score"]
                semantic = normalized_score

                result["final_score"] = 0.3 * original + 0.7 * semantic

            # 🔥 수정: final_score 기준으로 정렬 (동일 점수일 경우 doc_id로 일관된 순서 보장)
            reranked = sorted(search_results, key=lambda x: (-x["final_score"], x.get("doc_id", "")))

            # Top-K 반환
            return reranked[:top_k]

        except Exception as e:
            print(f"❌ 재순위화 중 오류 발생: {e}")
            print(traceback.format_exc())
            # 오류 시 원본 결과 반환
            return search_results[:top_k]


# 사용 예시
if __name__ == '__main__':
    # 테스트용 더미 데이터
    test_query = "곽승철의 USB 개발 경험"
    test_results = [
        {
            "doc_id": "doc1",
            "score": 0.8,
            "payload": {
                "original_name": "곽승철 이력서.pdf",
                "preview": "곽승철은 USB Firmware, 드라이버, 소프트웨어 개발 경험이 있습니다..."
            }
        },
        {
            "doc_id": "doc2",
            "score": 0.7,
            "payload": {
                "original_name": "다른문서.pdf",
                "preview": "일반적인 소프트웨어 개발에 대한 내용입니다..."
            }
        }
    ]

    # 재순위화 테스트
    reranker = SearchReranker()
    reranked_results = reranker.rerank(test_query, test_results, top_k=2)

    print(f"\n🔎 쿼리: '{test_query}'")
    print(f"\n✅ 재순위화 결과:")
    for i, result in enumerate(reranked_results, 1):
        print(f"  {i}. {result['payload'].get('original_name', '?')}")
        print(f"     원본 점수: {result.get('original_score', 0):.3f}")
        print(f"     재순위 점수: {result.get('rerank_score', 0):.3f}")
