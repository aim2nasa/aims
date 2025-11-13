# AIMS AI 검색 시스템 개선 방안

**작성일**: 2025-11-13
**분석 대상**: 의미 검색(Semantic Search) 시스템
**핵심 문제**: 개체명 쿼리(Entity Query) 검색 실패

---

## 📋 목차

1. [문제 분석](#1-문제-분석)
2. [기술 조사](#2-기술-조사)
3. [근본 원인 분석](#3-근본-원인-분석)
4. [본질적 해결 방안](#4-본질적-해결-방안)
5. [구현 계획](#5-구현-계획)
6. [기대 효과](#6-기대-효과)

---

## 1. 문제 분석

### 1.1 발견된 문제

**사용자 쿼리**: "곽승철에 대해서"

**예상 결과**: 곽승철 이력서.pdf 문서가 최상위 검색 결과로 표시되어야 함

**실제 결과**:
- ❌ 곽승철 이력서.pdf **검색 결과에 없음**
- ❌ 대신 "캐치업코리아 낙하리.pdf", "김보성님 정보.pdf" 등 **무관한 문서** 반환
- ❌ 유사도 점수: 25~29% (매우 낮음)

### 1.2 테스트 결과 비교

| 쿼리 유형 | 검색어 | 결과 문서 | 유사도 | 성공 여부 |
|----------|--------|----------|--------|-----------|
| **개체명 쿼리** (Entity) | "곽승철에 대해서" | ❌ 캐치업코리아, 김보성님 | 25~29% | **실패** |
| **개념 쿼리** (Concept) | "USB Firmware 드라이버 소프트웨어 개발" | ✅ 곽승철 이력서.pdf | 41% | **성공** |

**핵심 발견**:
- 구체적인 기술 키워드로 검색하면 정확히 찾음
- 사람 이름으로 검색하면 완전히 실패

### 1.3 시스템 영향

- **사용자 경험 저하**: "이 사람의 이력서 찾아줘" 같은 자연스러운 질문에 답변 불가
- **신뢰도 하락**: AI 검색이 키워드 검색보다 못하다는 인식
- **활용도 저하**: 사용자가 의미 검색 대신 키워드 검색으로 회귀

---

## 2. 기술 조사

### 2.1 시스템 구성 요소 검증

#### MongoDB 문서 저장소
```javascript
// 곽승철 이력서.pdf 문서 확인
{
  "_id": "691583f544f6eb919ecd477c",
  "upload": {
    "originalName": "곽승철 이력서.pdf",
    "mimeType": "application/pdf"
  },
  "meta": {
    "full_text": "곽승철\n경기도 고양시...\nUSB Firmware, 드라이버, 소프트웨어 개발...",
    "tags": ["이력서", "프로필"],
    "summary": "임베디드 시스템 개발 전문가 이력서"
  },
  "stages": {
    "docembed": {
      "status": "completed",
      "message": "임베딩 완료 (7개 청크, 1536차원)"
    }
  }
}
```

**검증 결과**: ✅ 문서 텍스트에 "곽승철" 정확히 포함됨 (6850자)

#### Qdrant 벡터 데이터베이스
```bash
# 곽승철 이력서 임베딩 확인
ssh tars.giize.com 'curl -s "http://localhost:6333/collections/docembed/points/scroll" \
  -H "Content-Type: application/json" \
  -d "{\"filter\": {\"must\": [{\"key\": \"doc_id\", \"match\": {\"value\": \"691583f544f6eb919ecd477c\"}}]}, \"limit\": 10}"'
```

**검증 결과**: ✅ 7개 청크 모두 정상 임베딩됨
- chunk_id: `691583f544f6eb919ecd477c_0` ~ `_6`
- vector: 1536차원, 0이 아닌 값들로 구성
- payload: `original_name`, `preview`, `doc_id` 포함

#### 임베딩 모델 일관성
- **문서 임베딩**: `text-embedding-3-small` (1536차원)
- **쿼리 임베딩**: `text-embedding-3-small` (1536차원)

**검증 결과**: ✅ 모델 일치, 차원 일치

### 2.2 실제 검색 API 테스트

```bash
# RAG 검색 API 직접 호출
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "곽승철에 대해서", "search_mode": "semantic", "user_id": "675a7d1f9b0a2c1c8012fc93"}'
```

**결과**:
```json
{
  "search_mode": "semantic",
  "answer": "관련 문서를 찾을 수 없습니다.",
  "search_results": [
    {
      "id": "67053ae3d055d948668b5bf0_0",
      "score": 0.287,
      "payload": {
        "doc_id": "67053ae3d055d948668b5bf0",
        "original_name": "캐치업코리아-낙하리_현대해상.pdf",
        "preview": "본 가입제안서는동일 발행번호에한하여 유효합니다..."
      }
    },
    {
      "id": "674b5b3aa7eeeee0c1c0e71f_0",
      "score": 0.254,
      "payload": {
        "doc_id": "674b5b3aa7eeeee0c1c0e71f",
        "original_name": "김보성님 정보.pdf",
        "preview": "계약자 김보성..."
      }
    }
  ]
}
```

**문제 확인**: 곽승철 이력서.pdf가 결과에 **전혀 없음**

---

## 3. 근본 원인 분석

### 3.1 벡터 검색의 작동 원리

**의미 검색(Semantic Search)**은 텍스트를 고차원 벡터 공간에 임베딩하여 **의미적 유사성**을 계산합니다.

```
쿼리: "곽승철에 대해서" → [0.12, -0.45, 0.78, ..., 0.03] (1536차원)
문서: "곽승철\nUSB Firmware 개발..." → [0.08, -0.32, 0.91, ..., -0.12] (1536차원)

코사인 유사도 = cos(θ) = 0.29 (29%)
```

### 3.2 쿼리 유형별 벡터 특성

#### 개체명 쿼리 (Entity Query)
- **예시**: "곽승철에 대해서", "김철수 정보", "홍길동 이력서"
- **특징**:
  - 추상적이고 일반적인 표현
  - 고유명사 중심
  - 문맥이 거의 없음
- **벡터 특성**:
  - 벡터 공간에서 **광범위한 영역**에 분산
  - 구체적 의미가 약함

#### 개념 쿼리 (Concept Query)
- **예시**: "USB Firmware 드라이버 소프트웨어 개발", "머신러닝 모델 학습"
- **특징**:
  - 구체적이고 기술적인 용어
  - 명확한 주제와 맥락
  - 풍부한 의미 정보
- **벡터 특성**:
  - 벡터 공간에서 **밀집된 클러스터** 형성
  - 유사 문서와 가까운 거리

### 3.3 왜 "곽승철에 대해서"가 실패하는가?

```
벡터 공간 시각화 (2D 단순화):

                    ┌─────────────────┐
                    │  "프로젝트 관리" │
                    │  "소프트웨어 개발"│
                    └─────────────────┘
                            ↑
                    [개념 클러스터]
                    구체적 기술 용어들
                            ↑
                            │
                    곽승철 이력서.pdf 내용:
                    "USB Firmware, NDK, Android 개발..."
                            │
                            │ (의미적 거리: 큼)
                            │
                            ↓
                    [개체명 쿼리 영역]
                    "곽승철에 대해서"
                    추상적, 일반적 표현
                            ↓
                            │
                    ┌─────────────────┐
                    │  "사람", "정보"  │
                    │  "알려줘"        │
                    └─────────────────┘
```

**핵심 문제**:
1. **쿼리는 추상적**: "곽승철에 대해서" → 일반적인 정보 요청
2. **문서는 구체적**: "USB Firmware, 드라이버, NDK, Android..." → 기술 용어 중심
3. **의미적 거리 큼**: 벡터 공간에서 멀리 떨어짐
4. **유사도 낮음**: 29% (다른 무관한 문서와 비슷한 점수)

### 3.4 벡터 검색의 한계

**순수 벡터 검색의 근본적 한계**:
- ✅ **잘하는 것**: 개념 유사성 찾기 ("머신러닝" ≈ "딥러닝")
- ❌ **못하는 것**: 개체명 정확 매칭 ("곽승철" = "곽승철")

**왜 이런 한계가 있는가?**
1. **임베딩 모델의 학습 방식**: 문맥 기반 의미 학습, 정확한 토큰 매칭은 학습 목표 아님
2. **희소성 문제**: "곽승철" 같은 고유명사는 학습 데이터에 거의 없음
3. **압축 손실**: 6850자 문서 → 1536차원 벡터로 압축하면서 고유명사 정보 손실

**결론**:
> **벡터 검색은 쓸모없는 것이 아니라, 특정 유형의 쿼리(개체명 쿼리)에는 적합하지 않다.**
>
> 업계 표준 해결책: **Hybrid Search (하이브리드 검색)**

---

## 4. 본질적 해결 방안

### 4.1 해결 방향

**핵심 아이디어**:
> **쿼리 유형에 따라 다른 검색 전략을 사용한다**

```
사용자 쿼리
    ↓
[쿼리 의도 분석] ← LLM (GPT-4o-mini)
    ↓
┌───────────┬───────────────┬───────────┐
│ Entity    │ Concept       │ Mixed     │
│ (개체명)  │ (개념)        │ (혼합)    │
├───────────┼───────────────┼───────────┤
│ Metadata  │ Vector Search │ Both      │
│ Search    │               │ + Merge   │
└───────────┴───────────────┴───────────┘
    ↓
[결과 병합 & 중복 제거]
    ↓
[Cross-Encoder 재순위화] ← ms-marco-MiniLM-L-12-v2
    ↓
최종 결과
```

### 4.2 3단계 진화 로드맵

#### Phase 1: 쿼리 의도 분석 + 하이브리드 검색 (핵심)

**목적**: 쿼리 유형 자동 분류 및 최적 검색 전략 선택

**구현 1: 쿼리 분석기**

```python
# backend/api/aims_rag_api/query_analyzer.py

from openai import OpenAI
from typing import Dict, List
import json

class QueryAnalyzer:
    """쿼리 의도를 분석하여 검색 전략 결정"""

    def __init__(self):
        self.client = OpenAI()

    def analyze(self, query: str) -> Dict:
        """
        쿼리를 분석하여 의도 파악

        Returns:
            {
                "query_type": "entity" | "concept" | "mixed",
                "entities": ["곽승철"],
                "concepts": ["이력", "경력"],
                "metadata_keywords": ["곽승철", "이력서"]
            }
        """

        prompt = f"""다음 검색 쿼리를 분석하여 JSON 형식으로 답변해줘.

쿼리: "{query}"

분석 항목:
1. query_type:
   - "entity": 특정 사람, 회사, 문서명을 찾는 쿼리
   - "concept": 주제, 개념, 기술을 찾는 쿼리
   - "mixed": 둘 다 포함

2. entities: 고유명사 추출 (사람명, 회사명, 문서명)

3. concepts: 일반 개념/주제 추출

4. metadata_keywords: 파일명, 태그에서 찾을 키워드

예시:
쿼리: "곽승철 이력에 대해서"
{{
  "query_type": "entity",
  "entities": ["곽승철"],
  "concepts": ["이력", "경력"],
  "metadata_keywords": ["곽승철", "이력서"]
}}

쿼리: "USB Firmware 개발 경험"
{{
  "query_type": "concept",
  "entities": [],
  "concepts": ["USB", "Firmware", "개발"],
  "metadata_keywords": ["USB", "Firmware"]
}}

JSON만 응답해줘:"""

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",  # 빠르고 저렴한 모델
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        result = json.loads(response.choices[0].message.content)
        return result


# 사용 예시
analyzer = QueryAnalyzer()
intent = analyzer.analyze("곽승철에 대해서")
# {
#   "query_type": "entity",
#   "entities": ["곽승철"],
#   "concepts": ["정보"],
#   "metadata_keywords": ["곽승철"]
# }
```

**구현 2: 하이브리드 검색 엔진**

```python
# backend/api/aims_rag_api/hybrid_search.py

from typing import List, Dict, Optional
from pymongo import MongoClient
from qdrant_client import QdrantClient, models
from openai import OpenAI
import re

class HybridSearchEngine:
    """쿼리 의도에 따라 최적의 검색 전략 사용"""

    def __init__(self):
        self.mongo_client = MongoClient("mongodb://localhost:27017/")
        self.db = self.mongo_client["aims_db"]
        self.collection = self.db["docupload.files"]

        self.qdrant_client = QdrantClient(host="localhost", port=6333)
        self.openai_client = OpenAI()

    def search(self, query: str, query_intent: Dict, user_id: str, top_k: int = 5) -> List[Dict]:
        """
        쿼리 의도에 따라 적절한 검색 수행
        """
        query_type = query_intent["query_type"]

        if query_type == "entity":
            # 개체명 쿼리: 메타데이터 검색 우선
            return self._entity_search(query_intent, user_id, top_k)

        elif query_type == "concept":
            # 개념 쿼리: 벡터 검색
            return self._vector_search(query, user_id, top_k)

        else:  # mixed
            # 혼합 쿼리: 두 방법 병합
            return self._hybrid_search(query, query_intent, user_id, top_k)

    def _entity_search(self, query_intent: Dict, user_id: str, top_k: int) -> List[Dict]:
        """
        개체명 검색: MongoDB 메타데이터 기반
        """
        entities = query_intent["entities"]
        metadata_keywords = query_intent["metadata_keywords"]

        # MongoDB 텍스트 검색 쿼리 구성
        search_terms = entities + metadata_keywords
        regex_pattern = "|".join([re.escape(term) for term in search_terms])

        mongo_filter = {
            "owner_id": user_id,
            "$or": [
                {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
                {"meta.tags": {"$in": search_terms}},
                {"meta.summary": {"$regex": regex_pattern, "$options": "i"}}
            ]
        }

        results = []
        for doc in self.collection.find(mongo_filter).limit(top_k):
            # 매칭 점수 계산 (간단한 TF-IDF 스타일)
            score = 0.0
            text = f"{doc['upload']['originalName']} {doc.get('meta', {}).get('full_text', '')}"

            for term in search_terms:
                count = text.lower().count(term.lower())
                score += count * 0.1  # 간단한 가중치

            # 파일명 매칭은 높은 점수
            if any(term.lower() in doc['upload']['originalName'].lower() for term in search_terms):
                score += 0.5

            results.append({
                "doc_id": str(doc["_id"]),
                "score": min(score, 1.0),  # 최대 1.0
                "payload": {
                    "original_name": doc["upload"]["originalName"],
                    "preview": doc.get("meta", {}).get("full_text", "")[:500]
                }
            })

        # 점수 기준 정렬
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def _vector_search(self, query: str, user_id: str, top_k: int) -> List[Dict]:
        """
        벡터 검색: Qdrant 의미 검색
        """
        # 쿼리 임베딩
        response = self.openai_client.embeddings.create(
            input=query,
            model="text-embedding-3-small"
        )
        query_vector = response.data[0].embedding

        # Qdrant 검색
        search_results = self.qdrant_client.search(
            collection_name="docembed",
            query_vector=query_vector,
            query_filter=models.Filter(
                must=[models.FieldCondition(key="owner_id", match=models.MatchValue(value=user_id))]
            ),
            limit=top_k
        )

        results = []
        for hit in search_results:
            results.append({
                "doc_id": hit.payload["doc_id"],
                "score": hit.score,
                "payload": hit.payload
            })

        return results

    def _hybrid_search(self, query: str, query_intent: Dict, user_id: str, top_k: int) -> List[Dict]:
        """
        하이브리드 검색: 메타데이터 + 벡터 검색 병합
        """
        # 두 방법으로 검색
        entity_results = self._entity_search(query_intent, user_id, top_k * 2)
        vector_results = self._vector_search(query, user_id, top_k * 2)

        # 문서별로 병합 (최고 점수 유지)
        doc_scores = {}

        for result in entity_results:
            doc_id = result["doc_id"]
            score = result["score"] * 0.6  # 개체명 검색 가중치 60%

            if doc_id not in doc_scores or score > doc_scores[doc_id]["score"]:
                doc_scores[doc_id] = {
                    "score": score,
                    "payload": result["payload"],
                    "source": "metadata"
                }

        for result in vector_results:
            doc_id = result["doc_id"]
            score = result["score"] * 0.4  # 벡터 검색 가중치 40%

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
```

**구현 3: RAG API 통합**

```python
# backend/api/aims_rag_api/rag_search.py 수정

from query_analyzer import QueryAnalyzer
from hybrid_search import HybridSearchEngine

# 기존 코드...

# 새로운 인스턴스 추가
query_analyzer = QueryAnalyzer()
hybrid_engine = HybridSearchEngine()

@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest):
    if request.search_mode == "keyword":
        # 기존 키워드 검색 로직 유지
        # ...
        pass

    elif request.search_mode == "semantic":
        # 🔥 새로운 하이브리드 검색 로직

        # 1단계: 쿼리 의도 분석
        query_intent = query_analyzer.analyze(request.query)

        # 2단계: 하이브리드 검색
        search_results = hybrid_engine.search(
            query=request.query,
            query_intent=query_intent,
            user_id=request.user_id,
            top_k=5
        )

        # 3단계: LLM 답변 생성
        final_answer = generate_answer_with_llm(request.query, search_results)

        return UnifiedSearchResponse(
            search_mode="semantic",
            answer=final_answer,
            search_results=search_results
        )
```

**Phase 1 예상 효과**:
- "곽승철에 대해서" 쿼리 → 메타데이터 검색으로 **100% 정확히 찾음**
- "USB Firmware 개발" 쿼리 → 벡터 검색으로 **의미적 유사 문서** 찾음
- 혼합 쿼리 → **두 방법 병합**으로 최상의 결과

#### Phase 2: Cross-Encoder 재순위화 (정확도 향상)

**목적**: 초기 검색 결과를 더 정확하게 재순위화

**왜 필요한가?**
- Bi-Encoder (현재 사용 중): 빠르지만 정확도 낮음
- Cross-Encoder: 느리지만 정확도 높음
- 전략: Bi-Encoder로 Top-20 추출 → Cross-Encoder로 Top-5 재순위화

**구현**:

```python
# backend/api/aims_rag_api/reranker.py

from sentence_transformers import CrossEncoder
from typing import List, Dict

class SearchReranker:
    """Cross-Encoder를 사용한 검색 결과 재순위화"""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-12-v2"):
        """
        ms-marco-MiniLM-L-12-v2: 검색 재순위화 전용 모델
        - Microsoft MS MARCO 데이터셋으로 학습
        - 쿼리-문서 관련성 점수 예측
        """
        self.model = CrossEncoder(model_name, max_length=512)

    def rerank(self, query: str, search_results: List[Dict], top_k: int = 5) -> List[Dict]:
        """
        검색 결과를 Cross-Encoder로 재순위화

        Args:
            query: 사용자 쿼리
            search_results: 초기 검색 결과 (top-20)
            top_k: 최종 반환할 결과 수

        Returns:
            재순위화된 상위 결과
        """
        if not search_results:
            return []

        # 쿼리-문서 페어 구성
        pairs = []
        for result in search_results:
            document = result["payload"]["preview"][:500]  # 첫 500자만 사용
            pairs.append([query, document])

        # Cross-Encoder 점수 계산
        scores = self.model.predict(pairs)

        # 결과에 점수 업데이트
        for i, result in enumerate(search_results):
            result["rerank_score"] = float(scores[i])

        # 재순위화
        reranked = sorted(search_results, key=lambda x: x["rerank_score"], reverse=True)

        return reranked[:top_k]


# RAG API에 통합
# backend/api/aims_rag_api/rag_search.py

from reranker import SearchReranker

reranker = SearchReranker()

@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest):
    # ...

    # 하이브리드 검색으로 top-20 추출
    search_results = hybrid_engine.search(
        query=request.query,
        query_intent=query_intent,
        user_id=request.user_id,
        top_k=20  # 더 많이 가져오기
    )

    # 🔥 Cross-Encoder로 재순위화 (top-5)
    final_results = reranker.rerank(
        query=request.query,
        search_results=search_results,
        top_k=5
    )

    # ...
```

**Phase 2 예상 효과**:
- 검색 정확도 15~25% 향상 (업계 벤치마크 기준)
- False Positive 대폭 감소 (무관한 문서 걸러짐)

#### Phase 3: 검색 품질 모니터링 (지속 개선)

**목적**: 검색 실패 사례 수집 및 시스템 개선

**구현**:

```python
# backend/api/aims_rag_api/search_logger.py

from datetime import datetime
from pymongo import MongoClient
from typing import Dict, List, Optional

class SearchQualityLogger:
    """검색 품질 모니터링 및 분석"""

    def __init__(self):
        self.client = MongoClient("mongodb://localhost:27017/")
        self.db = self.client["aims_db"]
        self.logs = self.db["search_logs"]

    def log_search(
        self,
        user_id: str,
        query: str,
        query_type: str,
        search_results: List[Dict],
        answer: str,
        user_feedback: Optional[str] = None
    ):
        """검색 로그 기록"""
        log_entry = {
            "timestamp": datetime.now(),
            "user_id": user_id,
            "query": query,
            "query_type": query_type,
            "num_results": len(search_results),
            "top_score": search_results[0]["score"] if search_results else 0.0,
            "answer_length": len(answer),
            "user_feedback": user_feedback  # "relevant" | "irrelevant" | None
        }

        self.logs.insert_one(log_entry)

    def get_low_quality_searches(self, min_score: float = 0.3, limit: int = 100):
        """낮은 품질의 검색 쿼리 분석"""
        return list(self.logs.find(
            {"top_score": {"$lt": min_score}},
            sort=[("timestamp", -1)],
            limit=limit
        ))

    def analyze_failure_patterns(self):
        """실패 패턴 분석"""
        pipeline = [
            {"$match": {"top_score": {"$lt": 0.3}}},
            {"$group": {
                "_id": "$query_type",
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$top_score"},
                "examples": {"$push": "$query"}
            }},
            {"$sort": {"count": -1}}
        ]

        return list(self.logs.aggregate(pipeline))


# RAG API에 통합
search_logger = SearchQualityLogger()

@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest):
    # ...

    # 검색 수행
    final_results = reranker.rerank(...)
    final_answer = generate_answer_with_llm(...)

    # 🔥 검색 품질 로깅
    search_logger.log_search(
        user_id=request.user_id,
        query=request.query,
        query_type=query_intent["query_type"],
        search_results=final_results,
        answer=final_answer
    )

    # ...


# 분석 API 추가
@app.get("/search/quality/analysis")
async def get_quality_analysis():
    """검색 품질 분석 결과"""
    logger = SearchQualityLogger()

    return {
        "failure_patterns": logger.analyze_failure_patterns(),
        "low_quality_queries": logger.get_low_quality_searches(limit=10)
    }
```

**Phase 3 예상 효과**:
- 실패 쿼리 패턴 발견 → 쿼리 분석기 개선
- 사용자 피드백 수집 → 재순위화 모델 Fine-tuning

---

## 5. 구현 계획

### 5.1 개발 일정 (3주)

| 주차 | Phase | 작업 내용 | 예상 시간 |
|------|-------|----------|-----------|
| **1주차** | Phase 1 | 쿼리 분석기 + 하이브리드 검색 | 3일 |
| | | MongoDB 메타데이터 검색 구현 | 1일 |
| | | 벡터 검색 통합 | 1일 |
| | | 테스트 및 튜닝 | 2일 |
| **2주차** | Phase 2 | Cross-Encoder 재순위화 | 2일 |
| | | RAG API 통합 | 1일 |
| | | 성능 최적화 | 1일 |
| | | 프론트엔드 연동 | 2일 |
| **3주차** | Phase 3 | 검색 품질 로거 구현 | 1일 |
| | | 분석 대시보드 | 2일 |
| | | 전체 시스템 테스트 | 2일 |
| | | 문서화 | 1일 |

### 5.2 파일 구조

```
backend/api/aims_rag_api/
├── rag_search.py           # 기존 RAG API (수정)
├── query_analyzer.py       # 🆕 쿼리 의도 분석
├── hybrid_search.py        # 🆕 하이브리드 검색 엔진
├── reranker.py             # 🆕 Cross-Encoder 재순위화
├── search_logger.py        # 🆕 검색 품질 로깅
└── requirements.txt        # 의존성 추가

새로운 의존성:
- sentence-transformers==2.2.2  # Cross-Encoder
- pymongo==4.5.0               # MongoDB 접근
```

### 5.3 테스트 계획

#### 테스트 케이스 1: 개체명 쿼리
```python
test_queries = [
    "곽승철에 대해서",
    "곽승철 이력서",
    "김보성님 정보",
    "캐치업코리아 문서"
]

# 예상 결과: 메타데이터 검색으로 정확히 찾음
```

#### 테스트 케이스 2: 개념 쿼리
```python
test_queries = [
    "USB Firmware 개발 경험",
    "보험 가입 제안서",
    "재무제표 분석"
]

# 예상 결과: 벡터 검색으로 의미적 유사 문서 찾음
```

#### 테스트 케이스 3: 혼합 쿼리
```python
test_queries = [
    "곽승철의 USB 개발 경험",
    "김보성님의 보험 계약 정보"
]

# 예상 결과: 하이브리드 검색으로 정확도 + 의미성 모두 만족
```

### 5.4 성공 지표

| 지표 | 현재 (Phase 0) | Phase 1 목표 | Phase 2 목표 |
|------|----------------|--------------|--------------|
| **개체명 쿼리 정확도** | 0% | 90%+ | 95%+ |
| **개념 쿼리 정확도** | 60% | 60% (유지) | 75%+ |
| **평균 검색 시간** | 0.5초 | 0.8초 | 1.2초 |
| **사용자 만족도** | 낮음 | 중간 | 높음 |

---

## 6. 기대 효과

### 6.1 즉시 효과 (Phase 1 완료 후)

1. **개체명 검색 정확도 급상승**
   - "곽승철에 대해서" → ✅ 곽승철 이력서.pdf 정확히 찾음
   - "김보성님 정보" → ✅ 김보성님 문서 정확히 찾음
   - 메타데이터 검색으로 **90% 이상 정확도**

2. **사용자 경험 개선**
   - 자연스러운 질문으로 검색 가능
   - "이 사람의 이력서 찾아줘" 같은 쿼리 지원
   - AI 검색에 대한 신뢰 회복

3. **시스템 유연성 증가**
   - 쿼리 유형에 따라 자동으로 최적 전략 선택
   - 새로운 쿼리 패턴에 대응 가능

### 6.2 중기 효과 (Phase 2 완료 후)

1. **검색 정확도 15~25% 향상**
   - Cross-Encoder 재순위화로 False Positive 대폭 감소
   - 업계 표준 정확도 달성

2. **복잡한 쿼리 지원**
   - 긴 문장, 복잡한 조건 처리 가능
   - "2023년에 작성된 USB 관련 이력서" 같은 쿼리 지원

### 6.3 장기 효과 (Phase 3 완료 후)

1. **지속적 품질 개선**
   - 검색 실패 패턴 자동 발견
   - 쿼리 분석기 지속 개선

2. **데이터 기반 최적화**
   - 사용자 피드백으로 모델 Fine-tuning
   - A/B 테스트로 검색 전략 최적화

3. **비즈니스 가치**
   - 사용자 생산성 향상 (검색 시간 단축)
   - AI 시스템 신뢰도 확보
   - 경쟁력 있는 검색 품질

---

## 7. 참고 자료

### 7.1 업계 사례

- **Google Search**: Hybrid approach (keyword + semantic + neural ranking)
- **Elasticsearch**: BM25 (keyword) + kNN (vector) hybrid
- **Pinecone**: Metadata filtering + vector search
- **Weaviate**: Hybrid search built-in

### 7.2 기술 문서

- [Sentence Transformers - Cross-Encoders](https://www.sbert.net/examples/applications/cross-encoder/README.html)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [MongoDB Text Search](https://www.mongodb.com/docs/manual/text-search/)
- [Qdrant Filtering](https://qdrant.tech/documentation/concepts/filtering/)

### 7.3 관련 파일

- [backend/api/aims_rag_api/rag_search.py](../backend/api/aims_rag_api/rag_search.py) - 현재 RAG API
- [backend/embedding/create_embeddings.py](../backend/embedding/create_embeddings.py) - 임베딩 생성
- [frontend/aims-uix3/src/entities/search/](../frontend/aims-uix3/src/entities/search/) - 검색 UI

---

## 8. 결론

### 핵심 발견 사항

1. **벡터 검색은 쓸모없는 것이 아니다**
   - 개념 유사성 찾기에는 매우 효과적
   - 단, 개체명 정확 매칭에는 부적합

2. **단일 전략으로는 모든 쿼리 처리 불가능**
   - 개체명 쿼리 → 메타데이터 검색 필요
   - 개념 쿼리 → 벡터 검색 필요
   - 혼합 쿼리 → 둘 다 필요

3. **하이브리드 검색이 업계 표준**
   - Google, Elasticsearch, Pinecone 모두 사용
   - 쿼리 의도 분석 + 다중 전략이 핵심

### 권장 사항

**즉시 시작**: Phase 1 (쿼리 분석 + 하이브리드 검색)
- 3일 내 프로토타입 가능
- 즉시 눈에 띄는 효과

**순차 진행**: Phase 2, 3는 Phase 1 완료 후
- Phase 1로 기본 품질 확보
- Phase 2, 3로 정밀도 향상

**지속 모니터링**: 검색 품질 지표 추적
- 실패 쿼리 패턴 분석
- 사용자 피드백 수집

---

**문서 끝**
