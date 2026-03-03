# RAG 검색 - 고객 관계 정보 통합

> **작업일**: 2026-03-04
> **상태**: 완료
> **변경 파일**: `backend/api/aims_rag_api/hybrid_search.py`, `backend/api/aims_rag_api/rag_search.py`

---

## 1. 배경 및 문제점

### 문제 현상
상세 문서검색에서 "곽승철 가족 알려줘" 질문 시:
- AI 답변: "곽승철 고객님의 가족에 대한 구체적인 정보는 제공되지 않습니다"
- 검색 결과: 곽승철의 보험 문서만 반환 (가족 정보 없음)

### 원인 분석
```
현재 검색 흐름:
1. QueryAnalyzer: "곽승철" 엔터티 추출, "가족" 개념 추출
2. resolve_customer_from_entities(): 곽승철 → customer_id 매칭 ✅
3. HybridSearch: 곽승철의 문서에서만 검색
4. LLM: 문서 preview 텍스트만 컨텍스트로 받음
5. LLM 답변: 문서에 가족 정보 없으므로 "없습니다" ❌
```

### 핵심 원인
- `customer_relationships` 컬렉션에 가족 관계 데이터가 존재하지만
- RAG 검색 파이프라인이 이 데이터를 전혀 참조하지 않음
- LLM 컨텍스트에 문서 내용만 포함되고, 고객 관계 정보는 누락

---

## 2. 설계

### 목표
- 고객명 매칭 시 항상 `customer_relationships`에서 관계 정보 조회
- LLM 컨텍스트에 관계 정보 주입 → "곽승철의 배우자는 김OO입니다" 답변 가능
- 가족 구성원의 문서까지 검색 범위 확장 → "가족 보험 현황" 답변 가능

### 아키텍처 변경
```
[변경 전]
QueryAnalyzer → customer_id 매칭 → 해당 고객 문서만 검색 → LLM (문서만)

[변경 후]
QueryAnalyzer → customer_id 매칭
  ├→ customer_relationships 조회 → 관계 정보 + 관련 고객 ID 목록
  ├→ 검색 범위: 해당 고객 + 가족 구성원 문서 모두 포함
  └→ LLM (문서 + 고객 관계 정보)
```

### 변경 파일 목록
| 파일 | 변경 내용 |
|------|----------|
| `hybrid_search.py` | `get_customer_relationships()` 메서드 추가, `customer_id` → `customer_ids` 리스트 지원 |
| `rag_search.py` | `generate_answer_with_llm()` 관계 컨텍스트 파라미터 추가, `search_endpoint` 관계 조회 연동 |

### 성능 영향
- MongoDB 추가 쿼리: customer_relationships 1회 + customers batch 1회 (총 2회)
- 관계 수가 적으므로 (가족 10명 이내) 성능 영향 미미
- 검색 확장 시 customer_ids 증가 → Qdrant 후처리 필터 범위만 소폭 확대

---

## 3. 구현

### 3-1. hybrid_search.py 변경

#### 관계 라벨 매핑 상수 추가
```python
RELATIONSHIP_LABELS = {
    "spouse": "배우자", "parent": "부모", "child": "자녀",
    "uncle_aunt": "삼촌/이모", "nephew_niece": "조카", "cousin": "사촌",
    "in_law": "처가/시가", "friend": "친구", "acquaintance": "지인",
    "neighbor": "이웃", "supervisor": "상사", "subordinate": "부하",
    "colleague": "동료", "business_partner": "사업파트너",
    "ceo": "대표이사", "executive": "임원", "employee": "직원",
    "shareholder": "주주", "director": "이사"
}
```

#### get_customer_relationships() 메서드
- customer_id로 양방향 조회 (from_customer_id OR to_customer_id)
- 관련 고객명을 customers 컬렉션에서 batch 조회
- 관계 방향에 따라 적절한 라벨 적용 (예: parent↔child 역방향)

#### 검색 확장 (customer_ids 리스트 지원)
- `search()`, `_entity_search()`, `_vector_search()`, `_hybrid_search()` 시그니처 변경
- `customer_id: Optional[str]` → `customer_ids: Optional[List[str]]`
- MongoDB 필터: `{"$in": [ObjectId(id) for id in customer_ids]}`

### 3-2. rag_search.py 변경

#### generate_answer_with_llm() 수정
- `relationship_context` 파라미터 추가
- 시스템 프롬프트: 관계 정보 참고 안내 문구 추가
- 사용자 프롬프트: 관계 정보를 문서 컨텍스트 앞에 배치

#### search_endpoint semantic 분기 수정
- customer_id 매칭 후 → `get_customer_relationships()` 호출
- relationship_context 문자열 생성
- 검색 시 customer_ids (본인 + 가족) 전달
- LLM 호출 시 relationship_context 전달

---

## 4. 구현 로그

### Phase 1: hybrid_search.py 수정
- [x] RELATIONSHIP_LABELS 상수 추가 (22개 관계 유형 한글 라벨)
- [x] `get_customer_relationships()` 메서드 구현
  - 양방향 조회 (from/to 모두)
  - 역방향 라벨 자동 변환 (parent↔child 등)
  - 양방향 레코드 중복 제거 (`seen_other_ids` set)
  - 관련 고객명 batch 조회
- [x] `customer_ids: Optional[List[str]]` 리스트 지원으로 시그니처 변경
  - `search()`, `_entity_search()`, `_vector_search()`, `_hybrid_search()` 모두 변경
  - MongoDB 필터: `$in` 연산자로 복수 고객 지원
- [x] `from bson import ObjectId` 모듈 레벨 import로 통합 (로컬 import 제거)

### Phase 2: rag_search.py 수정
- [x] `generate_answer_with_llm()` 수정
  - `relationship_context: Optional[str]` 파라미터 추가
  - 시스템 프롬프트: "보험 설계사를 지원하는 AI 어시스턴트" + "고객 관계 정보 참고" 안내
  - 관계 정보를 문서 컨텍스트 앞에 배치
  - `search_results`와 `relationship_context` 모두 없을 때만 "문서 없음" 반환
- [x] `search_endpoint` semantic 분기 수정
  - customer_id 매칭 후 → `get_customer_relationships()` 비동기 호출
  - `relationship_context` 문자열 생성 (관계 있을 때만)
  - `search_customer_ids` 리스트 구성 (본인 + 관련 고객)
  - `timing["relationship_lookup_time"]` 성능 추적 추가
  - LLM 호출 시 `relationship_context` 전달

### Phase 3: 테스트 수정
- [x] `test_hybrid_search.py` 테스트 수정: `customer_id` → `customer_ids` 리스트로 변경

### Phase 4: 버그 수정
- [x] 양방향 관계 중복 제거: 양방향 저장으로 인해 같은 상대방이 2번 나오는 문제 해결
  - `seen_other_ids` set으로 동일 상대방 1회만 포함

---

## 5. 테스트 결과

### 테스트 1: "곽승철 가족 알려줘"
```
🔍 고객명 자동 매칭: ['곽승철'] → customer_id=698edd1a559fc6d089997d61
👨‍👩‍👧‍👦 고객 관계 조회: 곽승철 → 2명 (자녀:곽지민, 배우자:송유미)
🔍 고객 필터 확장: 3명 (본인 + 관계 2명)
✅ 재순위화 완료: 전체 8개 중 5개 반환

AI 답변: "곽승철 고객님의 가족에 대해 알려드리면, 배우자는 송유미씨이고, 자녀는 곽지민씨입니다."
```
**결과: PASS** - 관계 정보 정확히 답변, 가족 문서까지 검색 범위 확장

### 테스트 2: "김보성 보험 현황" (관계 있는 다른 고객)
```
🔍 고객명 자동 매칭: ['김보성'] → customer_id=698edd1a559fc6d089997d6f
👨‍👩‍👧‍👦 고객 관계 조회: 김보성 → 2명 (배우자:안영미, 회사:캐치업코리아)
🔍 고객 필터 확장: 3명 (본인 + 관계 2명)
🔍 고객 필터링 후: 6개 문서 (원본: 296개, 고객수: 3)

AI 답변: "김보성 고객님께서 현재 보유하고 계신 보험 현황... 배우자인 안영미님과 관련된 보험 계약이 있으며..."
```
**결과: PASS** - 배우자+법인 관계 모두 인식, 관련 문서 검색

### 테스트 3: 잘못된 user_id (고객명 매칭 실패 케이스)
```
📊 쿼리 유형: entity
🔍 고객 필터: 전체

AI 답변: "관련 문서를 찾을 수 없습니다."
```
**결과: PASS** - 고객 매칭 실패 시 기존 동작 유지 (검색 전체로 fallback)

---

## 6. 배포 결과

- **배포 시간**: 2026-03-04 02:52 KST (v0.1.11)
- **배포 방법**: `deploy_aims_rag_api.sh` (Docker 재빌드)
- **배포 후 헬스체크**: 정상 (`/health` → "healthy")
- **실환경 검증**: API 직접 호출 3건 모두 PASS

### LLM 컨텍스트 예시 (실제 전달된 데이터)
```
--- 고객 관계 정보 ---
곽승철의 관계:
- 자녀: 곽지민
- 배우자: 송유미

--- 문서 조각 1 (출처: AR20260130_00038235_...pdf) ---
이 문서는 메트라이프생명보험의 고객을 위한 연간 리뷰 보고서로...
```
