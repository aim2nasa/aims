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
from bson import ObjectId
from system_logger import send_error_log


# 관계 유형 한글 라벨 (customer-relationships-routes.js RELATIONSHIP_TYPES와 동기화)
RELATIONSHIP_LABELS = {
    "spouse": "배우자", "parent": "부모", "child": "자녀",
    "uncle_aunt": "삼촌/이모", "nephew_niece": "조카", "cousin": "사촌",
    "in_law": "처가/시가", "friend": "친구", "acquaintance": "지인",
    "neighbor": "이웃", "supervisor": "상사", "subordinate": "부하",
    "colleague": "동료", "business_partner": "사업파트너",
    "client": "클라이언트", "service_provider": "서비스제공자",
    "ceo": "대표이사", "executive": "임원", "employee": "직원",
    "shareholder": "주주", "director": "이사", "company": "회사",
    "employer": "고용주"
}


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

    def resolve_customer_from_entities(self, entities: List[str], user_id: str) -> Optional[str]:
        """
        쿼리 엔터티에서 고객명을 찾아 customer_id 자동 매칭.
        customers 컬렉션에서 personal_info.name과 정확히 일치하는 고객을 찾는다.
        """
        if not entities:
            return None
        customers_coll = self.db["customers"]
        for entity in entities:
            customer = customers_coll.find_one({
                "personal_info.name": entity,
                "meta.created_by": user_id,
                "meta.status": "active"
            })
            if customer:
                return str(customer["_id"])
        return None

    def get_customer_relationships(self, customer_id: str, user_id: str) -> Dict:
        """
        고객의 관계 정보 조회 (customer_relationships 컬렉션)

        양방향 조회: from_customer_id = customer_id OR to_customer_id = customer_id
        관련 고객명을 customers 컬렉션에서 batch 조회

        Args:
            customer_id: 기준 고객 ID
            user_id: 사용자 ID (데이터 격리용)

        Returns:
            {
                "customer_name": "곽승철",
                "relationships": [
                    {"name": "김영희", "type": "배우자", "category": "family", "customer_id": "..."},
                    ...
                ],
                "related_customer_ids": ["id1", "id2", ...]
            }
        """
        try:
            cust_obj_id = ObjectId(customer_id)
            rel_coll = self.db["customer_relationships"]
            customers_coll = self.db["customers"]

            # 기준 고객명 조회
            base_customer = customers_coll.find_one(
                {"_id": cust_obj_id},
                {"personal_info.name": 1}
            )
            customer_name = ""
            if base_customer:
                customer_name = (base_customer.get("personal_info") or {}).get("name", "")

            # 양방향 관계 조회
            relationships_raw = list(rel_coll.find({
                "$or": [
                    {"relationship_info.from_customer_id": cust_obj_id},
                    {"relationship_info.to_customer_id": cust_obj_id}
                ],
                "relationship_info.status": "active"
            }))

            if not relationships_raw:
                return {
                    "customer_name": customer_name,
                    "relationships": [],
                    "related_customer_ids": []
                }

            # 관련 고객 ID 수집 (기준 고객 제외)
            related_ids = set()
            for rel in relationships_raw:
                info = rel.get("relationship_info", {})
                from_id = info.get("from_customer_id")
                to_id = info.get("to_customer_id")
                if from_id and str(from_id) != customer_id:
                    related_ids.add(from_id)
                if to_id and str(to_id) != customer_id:
                    related_ids.add(to_id)

            # 관련 고객명 batch 조회
            name_map = {}
            if related_ids:
                related_customers = customers_coll.find(
                    {"_id": {"$in": list(related_ids)}},
                    {"personal_info.name": 1}
                )
                for cust in related_customers:
                    name_map[str(cust["_id"])] = (cust.get("personal_info") or {}).get("name", "알 수 없음")

            # 관계 정보 정리 (양방향 레코드 중복 제거)
            relationships = []
            seen_other_ids = set()  # 동일 상대방 중복 방지
            for rel in relationships_raw:
                info = rel.get("relationship_info", {})
                from_id = str(info.get("from_customer_id", ""))
                to_id = str(info.get("to_customer_id", ""))
                rel_type = info.get("relationship_type", "")
                rel_category = info.get("relationship_category", "")

                # 관계 방향에 따라 상대방 결정 및 라벨 설정
                if from_id == customer_id:
                    other_id = to_id
                    display_type = RELATIONSHIP_LABELS.get(rel_type, rel_type)
                else:
                    other_id = from_id
                    reverse_map = {
                        "parent": "child", "child": "parent",
                        "uncle_aunt": "nephew_niece", "nephew_niece": "uncle_aunt",
                        "supervisor": "subordinate", "subordinate": "supervisor",
                        "client": "service_provider", "service_provider": "client",
                        "ceo": "company", "company": "ceo",
                        "executive": "company", "employee": "employer",
                        "employer": "employee"
                    }
                    reversed_type = reverse_map.get(rel_type, rel_type)
                    display_type = RELATIONSHIP_LABELS.get(reversed_type, reversed_type)

                # 양방향 관계 중복 제거: 같은 상대방은 한 번만
                if other_id in seen_other_ids:
                    continue
                seen_other_ids.add(other_id)

                other_name = name_map.get(other_id, "알 수 없음")
                relationships.append({
                    "name": other_name,
                    "type": display_type,
                    "category": rel_category,
                    "customer_id": other_id
                })

            related_customer_ids = [r["customer_id"] for r in relationships]

            print(f"👨‍👩‍👧‍👦 고객 관계 조회: {customer_name} → {len(relationships)}명 ({', '.join(r['type'] + ':' + r['name'] for r in relationships)})")

            return {
                "customer_name": customer_name,
                "relationships": relationships,
                "related_customer_ids": related_customer_ids
            }

        except Exception as e:
            print(f"⚠️ 고객 관계 조회 실패 (무시하고 진행): {e}")
            send_error_log("aims_rag_api", f"고객 관계 조회 오류: {e}", e)
            return {
                "customer_name": "",
                "relationships": [],
                "related_customer_ids": []
            }

    def search(self, query: str, query_intent: Dict, user_id: str, customer_id: Optional[str] = None, customer_ids: Optional[List[str]] = None, top_k: int = 5) -> List[Dict]:
        """
        쿼리 의도에 따라 적절한 검색 수행

        Args:
            query: 사용자 검색 쿼리
            query_intent: 쿼리 분석 결과 (QueryAnalyzer.analyze() 반환값)
            user_id: 사용자 ID (문서 필터링용)
            customer_id: 고객 ID (단일 고객, 하위 호환)
            customer_ids: 고객 ID 리스트 (복수 고객 — 관계 확장 검색용)
            top_k: 반환할 최대 결과 수

        Returns:
            검색 결과 리스트 (score 기준 내림차순 정렬)
        """
        # customer_ids 우선, 없으면 customer_id를 리스트로 변환
        effective_ids = customer_ids or ([customer_id] if customer_id else None)

        query_type = query_intent["query_type"]

        # 관계 확장 시 항상 하이브리드 검색 강제
        # 이유: entity 검색은 기준 고객명("곽승철") 키워드만 매칭하므로
        # 가족(송유미, 곽지민)의 문서를 찾을 수 없음.
        # 벡터 검색을 병행해야 가족 문서 집합 내 유사도 검색이 가능.
        if customer_ids and len(customer_ids) > 1:
            return self._hybrid_search(query, query_intent, user_id, effective_ids, top_k)

        if query_type == "entity":
            return self._entity_search(query_intent, user_id, effective_ids, top_k)
        elif query_type == "concept":
            return self._vector_search(query, user_id, effective_ids, top_k)
        else:  # mixed
            return self._hybrid_search(query, query_intent, user_id, effective_ids, top_k)

    def _resolve_customer_doc_ids(self, user_id: str, customer_ids: List[str]) -> List[str]:
        """
        고객들의 문서 ID 목록을 MongoDB에서 조회

        Qdrant 벡터 검색 시 doc_id 필터로 사용하여,
        해당 고객들의 문서 집합 안에서만 유사도 검색을 수행한다.
        """
        if len(customer_ids) == 1:
            cust_filter = {"customerId": ObjectId(customer_ids[0])}
        else:
            cust_filter = {"customerId": {"$in": [ObjectId(cid) for cid in customer_ids]}}

        docs = self.collection.find(
            {"ownerId": user_id, **cust_filter},
            {"_id": 1}
        )
        return [str(doc["_id"]) for doc in docs]

    def _entity_search(self, query_intent: Dict, user_id: str, customer_ids: Optional[List[str]], top_k: int) -> List[Dict]:
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
            "ownerId": user_id,
            "$or": [
                {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.tags": {"$in": search_terms}},
                {"meta.summary": {"$regex": regex_pattern, "$options": "i"}},
                {"ocr.tags": {"$in": search_terms}},
                {"ocr.summary": {"$regex": regex_pattern, "$options": "i"}}
            ]
        }

        # 고객별 필터링 (단일 또는 복수 고객 지원)
        if customer_ids:
            if len(customer_ids) == 1:
                mongo_filter["customerId"] = ObjectId(customer_ids[0])
            else:
                mongo_filter["customerId"] = {"$in": [ObjectId(cid) for cid in customer_ids]}

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

        # 점수 기준 정렬 (같은 점수일 경우 doc_id로 일관된 순서 보장)
        results.sort(key=lambda x: (-x["score"], x["doc_id"]))
        return results[:top_k]

    def _vector_search(self, query: str, user_id: str, customer_ids: Optional[List[str]], top_k: int) -> List[Dict]:
        """
        벡터 검색: Qdrant 의미 검색

        고객 필터링 전략:
        - customer_ids 지정 시: MongoDB에서 해당 고객들의 doc_ids를 먼저 조회한 뒤,
          Qdrant에서 그 문서 집합 안에서만 유사도 검색 수행 (관계 확장 검색에 핵심)
        - customer_ids 미지정 시: owner_id만 필터링하여 전체 문서 대상 검색
        """
        # 쿼리 임베딩
        try:
            response = self.openai_client.embeddings.create(
                input=query,
                model="text-embedding-3-small"
            )
            query_vector = response.data[0].embedding
            self.last_embedding_response = response
        except Exception as e:
            print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
            send_error_log("aims_rag_api", f"HybridSearch 쿼리 임베딩 오류: {e}", e)
            self.last_embedding_response = None
            return []

        # Qdrant 필터 구성
        filter_conditions = [models.FieldCondition(key="owner_id", match=models.MatchValue(value=user_id))]

        if customer_ids:
            # 고객 문서 집합을 먼저 확정 → 그 안에서 유사도 검색
            target_doc_ids = self._resolve_customer_doc_ids(user_id, customer_ids)
            if not target_doc_ids:
                print(f"🔍 고객 문서 없음 (고객수: {len(customer_ids)})")
                return []

            filter_conditions.append(
                models.FieldCondition(key="doc_id", match=models.MatchAny(any=target_doc_ids))
            )
            # 문서 수 × 청크 배수 (문서당 여러 청크 존재)
            qdrant_limit = max(top_k, len(target_doc_ids) * 5)
            print(f"🔍 고객 문서 집합: {len(target_doc_ids)}개 문서 내 유사도 검색 (고객수: {len(customer_ids)})")
        else:
            qdrant_limit = top_k

        try:
            search_results = self.qdrant_client.search(
                collection_name="docembed",
                query_vector=query_vector,
                query_filter=models.Filter(must=filter_conditions),
                limit=qdrant_limit
            )
        except Exception as e:
            print(f"❌ Qdrant 검색 중 오류 발생: {e}")
            send_error_log("aims_rag_api", f"HybridSearch Qdrant 검색 오류: {e}", e)
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
        results.sort(key=lambda x: (-x["score"], x["doc_id"]))
        return results[:top_k]

    def _hybrid_search(self, query: str, query_intent: Dict, user_id: str, customer_ids: Optional[List[str]], top_k: int) -> List[Dict]:
        """
        하이브리드 검색: 메타데이터 + 벡터 검색 병합

        가중치:
        - 메타데이터 검색: 60%
        - 벡터 검색: 40%
        """
        # 두 방법으로 검색 (더 많이 가져오기)
        entity_results = self._entity_search(query_intent, user_id, customer_ids, top_k * 2)
        vector_results = self._vector_search(query, user_id, customer_ids, top_k * 2)

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

        # 점수 기준 정렬 (같은 점수일 경우 doc_id로 일관된 순서 보장)
        merged_results = [
            {"doc_id": doc_id, **data}
            for doc_id, data in doc_scores.items()
        ]
        merged_results.sort(key=lambda x: (-x["score"], x["doc_id"]))

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
