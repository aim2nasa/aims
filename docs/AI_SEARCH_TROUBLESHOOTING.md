# AI 검색 시스템 문제 해결 보고서

## 발견된 문제

### Problem 1: Entity 검색시 관련없는 문서 높은 유사도 문제 🔥
- **증상**: 전혀 상관없는 문서가 80% 유사도로 표시됨
- **발견 일시**: 2025-11-13
- **상태**: ✅ 해결됨 (2025-11-13)
- **원인**: Entity search가 concepts도 검색 키워드로 사용하는 구조적 문제
- **해결**: hybrid_search.py에서 entities만 검색 키워드로 사용하도록 수정

### Problem 2: 특정 쿼리 검색 오류
- **증상**: "곽승철은 어떤 일을 하는 사람이니?" 검색 시 "검색 중 오류가 발생했어" 메시지 표시
- **에러 패턴**: `'NoneType' object is not subscriptable`
- **발견 일시**: 2025-11-13
- **쿼리 유형**: entity
- **상태**: ✅ 해결됨 (2025-11-13)
- **원인**: Python dict.get()이 값이 None인 경우 기본값을 무시하고 None 반환
- **해결**: None-safe 패턴 적용 (`doc.get('meta') or {}`)

---

## Problem 2: NoneType 에러 분석

### 서버 로그 패턴
```
📊 쿼리 유형: entity
❌ 하이브리드 검색 중 오류 발생: 'NoneType' object is not subscriptable
INFO: 112.161.226.102:0 - "POST /search HTTP/1.0" 500 Internal Server Error
```

### 관찰된 특징
- entity 쿼리에서만 발생
- 간헐적으로 발생 (일부 entity 쿼리는 성공)
- 동일한 쿼리 반복 시에도 실패

### 근본 원인 분석 ✅

**Python dict.get() 메서드의 동작 방식 문제:**

```python
# dict.get(key, default)의 동작
data = {'field': None}

# 키가 없으면 기본값 반환
data.get('missing', {})  # → {}

# 키가 있지만 값이 None이면 None 반환!
data.get('field', {})  # → None (기본값 무시!)
```

**문제가 발생한 코드 위치:**

1. **hybrid_search.py:99** - _entity_search()
   ```python
   # ❌ 문제: meta가 None이면 None.get() 시도
   text = f"{doc.get('upload', {}).get('originalName', '')} {doc.get('meta', {}).get('full_text', '')}"
   ```

2. **hybrid_search.py:119-122** - preview 생성
   ```python
   # ❌ 문제: full_text가 None이면 None[:500] 시도
   preview = doc.get('meta', {}).get('full_text', '')[:500] or ...
   ```

3. **reranker.py:60** - preview 추출
   ```python
   # ❌ 문제: preview가 None이면 None[:500] 시도
   preview = payload.get('preview', '')[:500]
   ```

**왜 간헐적으로 발생하는가?**
- MongoDB 문서 중 일부는 `upload`, `meta`, `ocr` 필드가 존재하지만 값이 `None`
- 대부분 문서는 정상 값을 가지고 있어서 성공
- None 값을 가진 문서를 검색할 때만 에러 발생

### 해결 방법 ✅

**None-safe 패턴 적용:**

```python
# 수정 전 (위험)
data = doc.get('meta', {})
text = data.get('full_text', '')

# 수정 후 (안전)
data = doc.get('meta') or {}  # None이면 {}로 변환
text = data.get('full_text', '')
```

**적용 파일:**
1. `hybrid_search.py` - _entity_search() 메서드 전체 (라인 100-102, 124-127)
2. `reranker.py` - preview 추출 부분 (라인 60-61)

**수정 내용:**
```python
# hybrid_search.py
upload_data = doc.get('upload') or {}
meta_data = doc.get('meta') or {}
ocr_data = doc.get('ocr') or {}

# reranker.py
payload = result.get('payload') or {}
preview = (payload.get('preview') or '')[:500]
```

### 테스트 결과 ✅

**테스트 날짜**: 2025-11-13
**테스트 쿼리**: "곽승철은 어떤 일을 하는 사람이니?"
**테스트 횟수**: 10회 반복
**결과**: **10/10 성공** (에러 없음)

```
=== Test 1 ===  SUCCESS
=== Test 2 ===  SUCCESS
=== Test 3 ===  SUCCESS
...
=== Test 10 === SUCCESS
```

**결론**: None-safe 패턴 적용으로 `'NoneType' object is not subscriptable` 에러 완전히 해결됨

---

---

## Problem 1: Entity 검색시 관련없는 문서 높은 유사도 - 근본 원인 분석 🔥

### 문제 재현

**검색 쿼리**: "곽승철 직업은 뭐지?"

**검색 결과 (잘못된 결과)**:
- 유사도 80%: "캐치업코리아-낙하리_현대해상.pdf" (보험 문서)
- **문제**: 이 문서는 "곽승철"과 **전혀 관련이 없음!**

### 근본 원인 분석 ✅

#### 1. 쿼리 분석 결과 (query_analyzer.py)

```json
{
  "query": "곽승철 직업은 뭐지?",
  "query_type": "entity",
  "entities": ["곽승철"],
  "concepts": ["직업"],
  "metadata_keywords": ["곽승철", "직업"]  // ← 여기가 문제!
}
```

**문제점**:
- `metadata_keywords`에 `"직업"`이 포함됨
- `"직업"`은 **쿼리 의도**(알고 싶은 정보)이지, **검색 키워드**가 아님!
- Entity 검색은 **"곽승철"이라는 사람**을 찾아야 하는데, **"직업"이라는 단어**까지 검색함

#### 2. Entity Search 로직 (hybrid_search.py)

```python
def _entity_search(self, query_intent: Dict, user_id: str, top_k: int):
    entities = query_intent["entities"]  # ["곽승철"]
    metadata_keywords = query_intent["metadata_keywords"]  # ["곽승철", "직업"]

    # ❌ 문제: concepts까지 포함된 metadata_keywords 사용
    search_terms = entities + metadata_keywords  # ["곽승철", "직업"]

    # MongoDB 정규식 패턴 생성
    regex_pattern = "|".join([re.escape(term) for term in search_terms])
    # regex_pattern = "곽승철|직업"  ← OR 조건!

    mongo_filter = {
        "ownerId": user_id,
        "$or": [
            {"upload.originalName": {"$regex": "곽승철|직업", "$options": "i"}},
            {"meta.full_text": {"$regex": "곽승철|직업", "$options": "i"}},
            # ...
        ]
    }
```

**문제 발생 메커니즘**:
1. 정규식 패턴 `"곽승철|직업"`: **"곽승철" OR "직업"** 매칭
2. 보험 문서에는 "곽승철"은 없지만 **"직업"이 8번** 출현
3. 점수 계산: `8번 × 0.1 = 0.8` (80%)

#### 3. 실제 데이터 검증

**MongoDB 문서 내용 확인**:
```bash
# "캐치업코리아-낙하리_현대해상.pdf" 문서 조사
문서 ID: 6915843b44f6eb919ecd478e
"곽승철" 출현 횟수: 0번  ← 관련 없음!
"직업" 출현 횟수: 8번    ← 보험 약관에서 흔한 단어
```

**전체 DB 조사**:
```bash
# "곽승철"을 포함한 문서 검색
결과: 1개 문서만 존재 ("곽승철 이력서.pdf")

# 하지만 검색 결과에는 5개 문서가 반환됨
# → 모두 "직업"이라는 단어 때문에 매칭됨!
```

### 구조적 문제점

**Entity 쿼리의 의미론적 오류**:

| 쿼리 | 의도 | 현재 동작 (❌ 잘못됨) | 올바른 동작 (✅) |
|------|------|---------------------|----------------|
| "곽승철 직업은 뭐지?" | "곽승철"의 직업 정보 찾기 | "곽승철" **OR** "직업" 검색 | "곽승철" **만** 검색 |
| "김보성님의 보험 정보" | "김보성"의 보험 정보 찾기 | "김보성" **OR** "보험" 검색 | "김보성" **만** 검색 |

**핵심**:
- Entity 쿼리에서 `entities`는 **찾을 대상**
- `concepts`는 **알고 싶은 정보**
- 검색은 **오직 entities만** 사용해야 함!
- **"곽승철의 직업"** ≠ **"곽승철 OR 직업"**

### 해결 방법 🔧

**hybrid_search.py 수정 (라인 72-77)**:

```python
def _entity_search(self, query_intent: Dict, user_id: str, top_k: int):
    entities = query_intent["entities"]

    # ✅ 수정: 오직 entities만 사용 (metadata_keywords 무시)
    search_terms = entities  # ["곽승철"]만 사용

    if not search_terms:
        return []

    # 이제 regex_pattern = "곽승철" (OR 조건 제거)
    regex_pattern = "|".join([re.escape(term) for term in search_terms])
```

**수정 후 기대 결과**:
- "곽승철"을 포함한 문서만 검색
- "직업"만 있는 보험 문서는 제외됨
- 검색 결과: "곽승철 이력서.pdf" 1개 (정확!)

### 테스트 결과 ✅

**테스트 날짜**: 2025-11-13
**테스트 쿼리**: 다양한 Entity 쿼리 패턴

#### Test 1: "곽승철 직업은 뭐지?"
```
수정 전: 5개 문서 (노이즈 4개 포함)
  - "캐치업코리아-낙하리_현대해상.pdf" (80% - 잘못됨!)
  - "직업" 키워드로 매칭된 관련없는 보험 문서들

수정 후: 1개 문서 (정확!)
  1. 곽승철 이력서.pdf (99.9%)
```

#### Test 2: "김보성님의 보험 정보는?"
```
수정 전: "김보성 OR 보험" 검색 → 보험 관련 모든 문서 반환
수정 후: "김보성"만 검색 → 김보성 관련 문서만 정확히 반환
  1. [비용+준비서류 안내]_(주)캐치업코리아_250318.pdf (김보성 대표)
  2. 캐치업코리아-자필서류-20240813.pdf (김보성 서명)
  3. 캐치업청약서 (1).pdf (김보성 관련)
```

#### Test 3: "캐치업코리아 재무제표 보여줘"
```
수정 전: "캐치업코리아 OR 재무제표" 검색 → 모든 재무제표 문서 반환
수정 후: "캐치업코리아"만 검색 → 캐치업코리아 관련 문서만 정확히 반환
  1. [비용+준비서류 안내]_(주)캐치업코리아_250318.pdf
  2. 캐치업코리아-낙하리_현대해상.pdf
  3. 캐치업청약서 (1).pdf
```

### 성과 요약

| 항목 | 수정 전 | 수정 후 | 개선 |
|------|---------|---------|------|
| 검색 정확도 | 20% (5개 중 1개 정확) | 100% (1개 중 1개 정확) | **+80%** |
| 노이즈 문서 | 4개 (부적절한 매칭) | 0개 | **-100%** |
| 사용자 경험 | ❌ 혼란스러움 | ✅ 명확함 | **크게 개선** |

**결론**: Entity 검색에서 entities만 사용하도록 수정하여 검색 정확도를 20%에서 100%로 향상시킴 ✅

---

## 추가 개선 사항

### Sigmoid 정규화 추가 (Cross-Encoder 점수 변환)

**배경**:
- Cross-Encoder 모델은 -10 ~ 10 범위의 점수를 반환
- 프론트엔드는 0 ~ 1 범위의 점수를 기대
- 점수 정규화 없이 8.11 같은 값이 그대로 전달되면 811% 표시 가능

**해결 (reranker.py 라인 70-78)**:
```python
# Sigmoid 함수로 점수 정규화
raw_score = float(scores[i])
normalized_score = 1.0 / (1.0 + math.exp(-raw_score))

result["rerank_score"] = normalized_score  # 0~1 범위
result["original_score"] = result.get("score", 0.0)
```

**효과**:
- Cross-Encoder 점수가 0~1 범위로 정규화됨
- 프론트엔드에서 정상적인 백분율 표시 (예: 99.92%)
- 음수 점수(관련성 낮음)와 양수 점수(관련성 높음)를 자연스럽게 변환

**상태**: ✅ 완료 (2025-11-13)

---

## 상세 분석

