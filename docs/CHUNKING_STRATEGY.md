# AIMS 청킹 전략 (Chunking Strategy)

> 최종 업데이트: 2026-03-21
> Alex/Gini 교차 리뷰 반영

## 1. 개요

AIMS는 보험 문서의 텍스트를 벡터 임베딩하여 Qdrant에 저장하고, RAG 기반 검색에 활용한다.
이 문서는 텍스트 추출 → 전처리 → 청킹 → 임베딩 → 저장까지의 청킹 관련 흐름을 기술한다.

> 오케스트레이션 계층(크레딧 체크, self-healing, 후처리 등)은 이 문서의 범위 밖이다.
> 전체 파이프라인 운영에 대해서는 `full_pipeline.py` 코드를 참조.

---

## 2. 파이프라인 흐름

```
MongoDB (files 컬렉션)
    │
    ▼
[1] 텍스트 추출 (full_pipeline.py 내부에서 직접 처리)
    │  full_text 우선순위: meta > ocr > text
    │  ※ extract_text_from_mongo.py는 독립 유틸리티 (파이프라인 미사용)
    │
    ▼
[2] 전처리 + 청킹 (split_text_into_chunks.py)
    │  노이즈 제거 → RecursiveCharacterTextSplitter → 메타데이터 프리픽스
    │
    ▼
[3] 임베딩 (create_embeddings.py)
    │  OpenAI text-embedding-3-small (1536차원)
    │
    ▼
[4] 벡터 저장 (save_to_qdrant.py)
    │  Qdrant "docembed" 컬렉션, 결정적 UUID
    │
    ▼
[5] 상태 업데이트 + 후처리 (full_pipeline.py)
       MongoDB docembed.status = done
       + 토큰 사용량 로깅, displayName 생성, 바이러스 스캔 트리거
```

**실행 방식**: 크론 1분 주기 (`full_pipeline.py`)

---

## 3. 텍스트 추출

`full_pipeline.py`가 MongoDB 조회 결과에서 직접 텍스트를 추출한다.

### full_text 우선순위

| 순위 | 필드 | 설명 |
|------|------|------|
| 1 | `meta.full_text` | PyMuPDF 등으로 직접 추출한 텍스트 |
| 2 | `ocr.full_text` | Upstage OCR 등으로 추출한 텍스트 |
| 3 | `text.full_text` | 레거시 필드 |

> **참고**: `extract_text_from_mongo.py`는 1~2순위만 지원하며 독립 실행/테스트 용도로만 사용.
> 3순위 `text.full_text`는 `full_pipeline.py`에서만 처리된다.

빈 텍스트(공백/줄바꿈만)는 스킵 처리(`docembed.status = skipped`).

### 청킹에 전달되는 메타데이터

`full_pipeline.py`에서 `split_text_into_chunks()`에 전달하는 메타:

```python
{
    'doc_id': str,           # MongoDB ObjectId
    'original_name': str,    # 업로드 시 원본 파일명
    'uploaded_at': str,      # 업로드 시각
    'mime': str,             # MIME 타입
    'text_source': str,      # 'meta' | 'ocr' | 'text'
    'owner_id': str,         # 문서 소유자 (설계사) ID
}
```

> **알려진 이슈**: `customer_id`가 현재 전달되지 않아 Qdrant 페이로드에 고객 ID가 저장되지 않는다.
> `extract_text_from_mongo.py`에는 `customer_id` 추출 로직이 있으나 파이프라인에서 미사용.

---

## 4. 전처리 (Preprocessing)

**소스 파일**: `backend/embedding/split_text_into_chunks.py` → `preprocess_text()`

청킹 전 규칙 기반 노이즈 제거 (AI 미사용, 환각 위험 없음):

| 단계 | 처리 내용 | 규칙 |
|------|-----------|------|
| 1 | 줄바꿈 정규화 | `\r\n` → `\n` |
| 2 | 탭 정리 | 연속 탭 → 단일 공백 |
| 3 | 공백 정리 | 연속 공백 3개+ → 단일 공백 (줄바꿈 보존) |
| 4 | 빈 줄 축소 | 연속 빈 줄 4개+ → 3줄로 |
| 5 | 반복 라인 제거 | 10자+ 동일 라인 4회+ 반복 → 3회까지만 유지 (`repeat_count <= 3`) |

---

## 5. 청킹 (Chunking)

**소스 파일**: `backend/embedding/split_text_into_chunks.py` → `split_text_into_chunks()`

### 5.1 분할기

- **라이브러리**: LangChain `RecursiveCharacterTextSplitter`
- 재귀적으로 `\n\n` → `\n` → ` ` → `""` 순서로 분할 시도 (문맥 보존 우선)

### 5.2 파라미터

| 파라미터 | 현재 값 | 이전 값 | 변경 이유 |
|----------|---------|---------|-----------|
| `chunk_size` | **1,000자** | 1,500자 | 작은 청크 = 임베딩이 청크 전체를 더 정밀하게 대표 |
| `chunk_overlap` | **200자** | 150자 | 큰 오버랩 = 청크 경계에서 문맥 단절 감소 |
| `length_function` | `len` | - | 문자 수 기준 (토큰 기준 아님) |

### 5.3 메타데이터 프리픽스

각 청크 텍스트 앞에 문서명을 프리픽스로 추가하여, 임베딩 벡터에 "이 청크가 어떤 문서에서 왔는지" 문맥을 인코딩한다.

```
원본:    "이 계약의 보험료는 월 50,000원입니다."
프리픽스: "[보험계약서] 이 계약의 보험료는 월 50,000원입니다."
```

- 파일 확장자는 제거 (`보험계약서.pdf` → `보험계약서`)
- 원본 텍스트(`text_raw`)도 별도 보존 (LLM 컨텍스트 용도)

### 5.4 청크 데이터 구조

```python
{
    'chunk_id': '{doc_id}_{index}',    # 고유 ID (예: "abc123_0")
    'text': str,                        # 프리픽스 포함 텍스트 (임베딩 입력)
    'text_raw': str,                    # 원본 텍스트 (프리픽스 없음, LLM 컨텍스트용)
    'offset': int,                      # 원문에서의 시작 위치 (text.find() 기반)
    'size': int,                        # 원본 청크 문자 수
    # + 메타데이터 필드 (doc_id, original_name, owner_id 등)
}
```

> **알려진 한계**: `offset`은 `text.find(chunk)`로 계산하므로, 동일 텍스트가 여러 번 등장하면
> 항상 첫 번째 위치를 반환한다.

---

## 6. 임베딩 (Embedding)

**소스 파일**: `backend/embedding/create_embeddings.py`

| 항목 | 값 |
|------|-----|
| 모델 | `text-embedding-3-small` |
| 차원 | 1,536 |
| 호출 방식 | 청크 단위 개별 API 호출 (배치 아님) |
| 인코딩 포맷 | `float` |

### 에러 처리

- **크레딧 소진**: `RateLimitError`에서 `insufficient_quota` 감지 시 플래그 설정.
  모든 청크 순회 완료 후, **전체 청크가 실패한 경우에만** `EmbeddingError` 발생 → 파이프라인 중단.
  일부 청크만 실패하면 유효 청크만 저장하고 계속 진행.
- **기타 API 에러** (`APIError`, `APIConnectionError`): 해당 청크 `embedding = None` → 스킵
- 실패 청크 필터링 후 유효 청크만 Qdrant에 저장

---

## 7. 벡터 저장 (Qdrant)

**소스 파일**: `backend/embedding/save_to_qdrant.py`

### 7.1 저장 대상

- **컬렉션**: `docembed`
- **벡터 DB**: Qdrant (`http://localhost:6333`)

### 7.2 중복 방지

1. **저장 전 기존 청크 삭제**: `doc_id` 기반 필터로 해당 문서의 모든 포인트 삭제
2. **결정적 UUID**: `chunk_id` → `uuid5(NAMESPACE_DNS, "aims.docembed.{chunk_id}")` — 동일 청크는 항상 동일 ID

### 7.3 페이로드 구조

`text`와 `embedding`을 제외한 청크의 모든 필드가 페이로드로 저장된다.

```python
{
    'chunk_id': str,       # 원본 chunk_id
    'preview': str,        # 프리픽스 포함 텍스트 (chunk['text']에서 복사)
    'text_raw': str,       # 원본 텍스트 (프리픽스 없음, LLM 컨텍스트용)
    'doc_id': str,
    'original_name': str,
    'owner_id': str,
    'offset': int,
    'size': int,
    'uploaded_at': str,
    'mime': str,
    'text_source': str,
    # ... 기타 메타데이터
}
```

---

## 8. xPipe 파이프라인 (참고)

**소스 파일**: `backend/api/document_pipeline/xpipe/stages/embed.py`

xPipe의 embed 스테이지는 현재 기존 파이프라인과 완전히 다른 간이 구현:

| 항목 | 기존 파이프라인 | xPipe |
|------|----------------|-------|
| 청킹 | RecursiveCharacterTextSplitter, 1000자/200 overlap | 청킹 없음 |
| chunk_size | 1,000자 | 500자 (count 산정용) |
| 임베딩 | 청크별 개별 호출 | 텍스트 앞 8,000자만 단일 임베딩 |
| 메타 프리픽스 | 문서명 프리픽스 | 없음 |
| 저장 | Qdrant upsert | stub 모드 기본 |

> xPipe가 실제 임베딩을 수행하게 될 때, 기존 파이프라인의 청킹 로직 재사용이 필요하다.

---

## 9. 알려진 한계 및 개선 포인트

| # | 항목 | 설명 |
|---|------|------|
| 1 | 개별 API 호출 | 배치 임베딩 미사용. 다수 청크 시 레이턴시 증가 |
| 2 | offset 부정확 | `text.find()` 사용으로 중복 텍스트 시 첫 위치만 반환 |
| 3 | 문자 수 기준 | 토큰 기준(`tiktoken`) 분할이 아닌 문자 수 기준. 영문 혼재 시 비효율 |
| 4 | 문서 유형 무차별 | 약관/AR/CRS/청구서 등 모든 문서에 동일 파라미터 적용 |
| 5 | customer_id 미전달 | `full_pipeline.py`에서 meta에 `customer_id` 누락 (코드 버그) |
| 6 | xPipe 불일치 | xPipe embed 스테이지가 기존 청킹 로직과 완전 별도 |

---

## 10. 관련 파일 목록

| 파일 | 역할 |
|------|------|
| `backend/embedding/full_pipeline.py` | 전체 오케스트레이션 (크론 1분, 텍스트 추출 포함) |
| `backend/embedding/split_text_into_chunks.py` | 전처리 + 청킹 |
| `backend/embedding/create_embeddings.py` | OpenAI 임베딩 API 호출 |
| `backend/embedding/save_to_qdrant.py` | Qdrant 벡터 저장 |
| `backend/embedding/extract_text_from_mongo.py` | 독립 유틸리티 (텍스트 추출, 파이프라인 미사용) |
| `backend/embedding/process_credit_pending.py` | credit_pending 재처리 (월별 크론) |
| `backend/embedding/run_pipeline.sh` | 파이프라인 실행 셸 스크립트 |
| `backend/api/document_pipeline/xpipe/stages/embed.py` | xPipe embed 스테이지 (간이) |
