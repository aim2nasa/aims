# hybrid_search.py
"""
하이브리드 검색 엔진

쿼리 의도에 따라 최적의 검색 전략을 사용합니다:
- entity 쿼리: MongoDB 메타데이터 검색 (파일명, tags, summary)
- concept 쿼리: Qdrant 벡터 검색 (의미적 유사도)
- mixed 쿼리: 두 방법 병합 + 중복 제거
"""

from typing import List, Dict, Optional
from pymongo import MongoClient
from qdrant_client import QdrantClient, models
from openai import OpenAI
import re


class HybridSearchEngine:
    """쿼리 의도에 따라 최적의 검색 전략 사용"""

    def __init__(self):
        # MongoDB 연결 (localhost:27017)
        self.mongo_client = MongoClient("mongodb://localhost:27017/")
        self.db = self.mongo_client["docupload"]  # 🔥 수정: aims_db → docupload
        self.collection = self.db["files"]  # 🔥 수정: docupload.files → files

        # Qdrant 연결
        self.qdrant_client = QdrantClient(host="localhost", port=6333, check_compatibility=False)

        # OpenAI 클라이언트
        self.openai_client = OpenAI()

        # 🔥 Phase 4: 마지막 임베딩 응답 저장 (토큰 추적용)
        self.last_embedding_response = None

    def search(self, query: str, query_intent: Dict, user_id: str, customer_id: Optional[str] = None, top_k: int = 5) -> List[Dict]:
        """
        쿼리 의도에 따라 적절한 검색 수행

        Args:
            query: 사용자 검색 쿼리
            query_intent: 쿼리 분석 결과 (QueryAnalyzer.analyze() 반환값)
            user_id: 사용자 ID (문서 필터링용)
            customer_id: 고객 ID (특정 고객 문서만 검색, optional)
            top_k: 반환할 최대 결과 수

        Returns:
            검색 결과 리스트 (score 기준 내림차순 정렬)
        """
        query_type = query_intent["query_type"]

        if query_type == "entity":
            # 개체명 쿼리: 메타데이터 검색 우선
            return self._entity_search(query_intent, user_id, customer_id, top_k)

        elif query_type == "concept":
            # 개념 쿼리: 벡터 검색
            return self._vector_search(query, user_id, customer_id, top_k)

        else:  # mixed
            # 혼합 쿼리: 두 방법 병합
            return self._hybrid_search(query, query_intent, user_id, customer_id, top_k)

    def _entity_search(self, query_intent: Dict, user_id: str, customer_id: Optional[str], top_k: int) -> List[Dict]:
        """
        개체명 검색: MongoDB 메타데이터 기반

        검색 필드:
        - upload.originalName (파일명)
        - meta.full_text (전문)
        - meta.tags (AI 생성 태그)
        - meta.summary (AI 생성 요약)
        - ocr.tags (OCR 태그)
        - ocr.summary (OCR 요약)
        """
        entities = query_intent["entities"]

        # ✅ 수정: 오직 entities만 사용 (metadata_keywords는 쿼리 의도이지 검색 키워드가 아님)
        # Entity 쿼리에서 concepts는 "알고 싶은 정보"이지 "찾을 대상"이 아니므로 제외
        search_terms = query_intent.get("metadata_keywords", entities)
        if not search_terms:
            return []

        # 정규식 패턴 생성 (OR 조건)
        regex_pattern = "|".join([re.escape(term) for term in search_terms])

        mongo_filter = {
            "ownerId": user_id,  # 🔥 수정: owner_id → ownerId
            "$or": [
                {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.tags": {"$in": search_terms}},
                {"meta.summary": {"$regex": regex_pattern, "$options": "i"}},
                {"ocr.tags": {"$in": search_terms}},
                {"ocr.summary": {"$regex": regex_pattern, "$options": "i"}}
            ]
        }

        # 🔥 고객별 필터링 추가
        if customer_id:
            from bson import ObjectId
            mongo_filter["customer_relation.customer_id"] = ObjectId(customer_id)

        results = []
        for doc in self.collection.find(mongo_filter).limit(top_k * 2):  # 여유있게 가져오기
            # 매칭 점수 계산 (간단한 TF-IDF 스타일)
            score = 0.0
            # 🔥 수정: None 안전 처리 (doc.get()이 None을 반환할 수 있음)
            upload_data = doc.get('upload') or {}
            meta_data = doc.get('meta') or {}
            ocr_data = doc.get('ocr') or {}

            text = f"{upload_data.get('originalName', '')} {meta_data.get('full_text', '')}"

            for term in search_terms:
                count = text.lower().count(term.lower())
                score += count * 0.1  # 간단한 가중치

            # 파일명 매칭 점수 대폭 상향 (완벽 매칭 우선)
            original_name = upload_data.get("originalName", "")
            matched_terms = [term for term in search_terms if term.lower() in original_name.lower()]

            if len(matched_terms) == len(search_terms):
                # 모든 검색어가 파일명에 포함됨 → 완벽 매칭 (최우선)
                score += 10.0
            elif len(matched_terms) > 0:
                # 일부 검색어만 파일명에 포함됨
                score += 2.0 * len(matched_terms) / len(search_terms)

            # tags 매칭도 높은 점수
            meta_tags = meta_data.get('tags', [])
            ocr_tags = ocr_data.get('tags', [])
            all_tags = (meta_tags if isinstance(meta_tags, list) else []) + \
                       (ocr_tags if isinstance(ocr_tags, list) else [])
            if any(term in all_tags for term in search_terms):
                score += 0.3

            # 미리보기 텍스트 생성 (None 안전 처리)
            preview = (meta_data.get('full_text') or '')[:500] or \
                      (ocr_data.get('full_text') or '')[:500] or \
                      meta_data.get('summary', '') or \
                      ocr_data.get('summary', '')

            results.append({
                "doc_id": str(doc["_id"]),
                "score": score,  # 파일명 완벽 매칭 우선을 위해 제한 제거
                "payload": {
                    "doc_id": str(doc["_id"]),
                    "original_name": original_name,
                    "preview": preview,
                    "mime": upload_data.get('mimeType', ''),
                    "uploaded_at": str(upload_data.get('uploaded_at', ''))
                }
            })

        # 점수 기준 정렬
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _vector_search(self, query: str, user_id: str, customer_id: Optional[str], top_k: int) -> List[Dict]:
        """
        벡터 검색: Qdrant 의미 검색
        """
        # 쿼리 임베딩
        try:
            response = self.openai_client.embeddings.create(
                input=query,
                model="text-embedding-3-small"
            )
            query_vector = response.data[0].embedding
            # 🔥 Phase 4: 임베딩 응답 저장 (토큰 추적용)
            self.last_embedding_response = response
        except Exception as e:
            print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
            self.last_embedding_response = None
            return []

        # Qdrant 검색
        # 🔥 고객별 필터링: 동적으로 필터 조건 생성
        filter_conditions = [models.FieldCondition(key="owner_id", match=models.MatchValue(value=user_id))]
        if customer_id:
            filter_conditions.append(
                models.FieldCondition(key="customer_id", match=models.MatchValue(value=customer_id))
            )

        try:
            search_results = self.qdrant_client.search(
                collection_name="docembed",
                query_vector=query_vector,
                query_filter=models.Filter(must=filter_conditions),
                limit=top_k
            )
        except Exception as e:
            print(f"❌ Qdrant 검색 중 오류 발생: {e}")
            return []

        # 문서별 중복 제거 (최고 점수 청크만 유지)
        doc_map = {}
        for hit in search_results:
            doc_id = hit.payload.get("doc_id")
            if not doc_id:
                continue

            if doc_id not in doc_map or hit.score > doc_map[doc_id]["score"]:
                doc_map[doc_id] = {
                    "doc_id": doc_id,
                    "score": hit.score,
                    "payload": hit.payload
                }

        results = list(doc_map.values())
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _hybrid_search(self, query: str, query_intent: Dict, user_id: str, customer_id: Optional[str], top_k: int) -> List[Dict]:
        """
        하이브리드 검색: 메타데이터 + 벡터 검색 병합

        가중치:
        - 메타데이터 검색: 60%
        - 벡터 검색: 40%
        """
        # 두 방법으로 검색 (더 많이 가져오기)
        entity_results = self._entity_search(query_intent, user_id, customer_id, top_k * 2)
        vector_results = self._vector_search(query, user_id, customer_id, top_k * 2)

        # 문서별로 병합 (최고 점수 유지)
        doc_scores = {}

        # 메타데이터 검색 결과 (가중치 60%)
        for result in entity_results:
            doc_id = result["doc_id"]
            score = result["score"] * 0.6

            if doc_id not in doc_scores or score > doc_scores[doc_id]["score"]:
                doc_scores[doc_id] = {
                    "score": score,
                    "payload": result["payload"],
                    "source": "metadata"
                }

        # 벡터 검색 결과 (가중치 40%)
        for result in vector_results:
            doc_id = result["doc_id"]
            score = result["score"] * 0.4

            if doc_id in doc_scores:
                # 이미 있으면 점수 합산
                doc_scores[doc_id]["score"] += score
                doc_scores[doc_id]["source"] = "hybrid"
            else:
                doc_scores[doc_id] = {
                    "score": score,
                    "payload": result["payload"],
                    "source": "vector"
                }

        # 점수 기준 정렬
        merged_results = [
            {"doc_id": doc_id, **data}
            for doc_id, data in doc_scores.items()
        ]
        merged_results.sort(key=lambda x: x["score"], reverse=True)

        return merged_results[:top_k]


# 사용 예시
if __name__ == '__main__':
    from query_analyzer import QueryAnalyzer

    analyzer = QueryAnalyzer()
    engine = HybridSearchEngine()

    # 테스트 쿼리
    test_query = "곽승철에 대해서"
    user_id = "675a7d1f9b0a2c1c8012fc93"

    print(f"\n🔎 쿼리: '{test_query}'")

    # 1. 쿼리 의도 분석
    query_intent = analyzer.analyze(test_query)
    print(f"📊 쿼리 유형: {query_intent['query_type']}")

    # 2. 하이브리드 검색
    results = engine.search(test_query, query_intent, user_id, top_k=5)

    print(f"\n✅ 검색 결과 {len(results)}개:")
    for i, result in enumerate(results, 1):
        print(f"  {i}. {result['payload'].get('original_name', '?')} (점수: {result['score']:.2f})")
