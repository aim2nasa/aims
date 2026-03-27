import os
import time
try:
    import tiktoken
    _HAS_TIKTOKEN = True
except ImportError:
    _HAS_TIKTOKEN = False
from openai import OpenAI, APIError, RateLimitError, APIConnectionError, AuthenticationError
from typing import List, Dict, Tuple
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks


# 배치 분할 상수
EMBEDDING_MODEL = "text-embedding-3-small"
MAX_TOKENS_PER_BATCH = 500_000  # 배치당 최대 토큰 수 (안전 마진 포함)
MAX_CHUNKS_PER_BATCH = 2048     # 배치당 최대 청크 수

# Backoff 재시도 상수
MAX_RETRIES = 5
INITIAL_BACKOFF_SEC = 1.0
BACKOFF_MULTIPLIER = 2.0


class EmbeddingError(Exception):
    """임베딩 처리 중 발생한 에러를 위한 커스텀 예외"""
    def __init__(self, message: str, error_code: str = "UNKNOWN"):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


def _is_quota_error(error: RateLimitError) -> bool:
    """크레딧 소진(quota) 에러인지 판별 (재시도 불가)"""
    error_str = str(error)
    return 'insufficient_quota' in error_str or 'exceeded your current quota' in error_str


def _count_tokens(texts: List[str]) -> List[int]:
    """각 텍스트의 토큰 수를 계산 (tiktoken 있으면 정확히, 없으면 글자수 기반 추정)"""
    if _HAS_TIKTOKEN:
        enc = tiktoken.encoding_for_model(EMBEDDING_MODEL)
        return [len(enc.encode(t)) for t in texts]
    # fallback: 한글 1자 ≈ 2~3토큰, 영문 1단어 ≈ 1토큰. 안전하게 글자수 * 2로 추정
    return [len(t) * 2 for t in texts]


def _split_into_batches(chunks: List[Dict]) -> List[List[Dict]]:
    """
    청크 리스트를 토큰 합산 기반으로 배치로 분할합니다.
    각 배치는 MAX_TOKENS_PER_BATCH 이하, MAX_CHUNKS_PER_BATCH 이하.
    """
    texts = [c['text'] for c in chunks]
    token_counts = _count_tokens(texts)

    batches = []
    current_batch = []
    current_tokens = 0

    for chunk, tok_count in zip(chunks, token_counts):
        # 현재 배치에 추가하면 한도를 초과하는 경우 새 배치 시작
        if current_batch and (
            current_tokens + tok_count > MAX_TOKENS_PER_BATCH
            or len(current_batch) >= MAX_CHUNKS_PER_BATCH
        ):
            batches.append(current_batch)
            current_batch = []
            current_tokens = 0

        current_batch.append(chunk)
        current_tokens += tok_count

    if current_batch:
        batches.append(current_batch)

    return batches


def _call_embedding_api_with_backoff(client: OpenAI, texts: List[str]):
    """
    OpenAI 임베딩 API를 exponential backoff로 호출합니다.
    - RateLimitError(quota 제외): 최대 MAX_RETRIES회 재시도
    - quota 에러: 즉시 raise (재시도 무의미)
    - 기타 에러: 재시도 없이 즉시 raise

    :return: API 응답 객체
    """
    backoff = INITIAL_BACKOFF_SEC

    for attempt in range(MAX_RETRIES):
        try:
            response = client.embeddings.create(
                input=texts,
                model=EMBEDDING_MODEL,
                encoding_format="float"
            )
            return response
        except AuthenticationError as e:
            raise EmbeddingError(
                f"OpenAI API 인증 실패: {e}",
                error_code="OPENAI_AUTH_ERROR"
            )
        except RateLimitError as e:
            # quota 소진은 재시도 불가
            if _is_quota_error(e):
                raise

            # 마지막 시도면 예외 전파
            if attempt == MAX_RETRIES - 1:
                raise

            print(f"[Backoff] RateLimitError, {backoff:.1f}초 후 재시도 ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(backoff)
            backoff *= BACKOFF_MULTIPLIER

    # 이론상 도달 불가 (위 루프에서 반드시 return 또는 raise)
    raise RuntimeError("Backoff 재시도 로직 오류")


def create_embeddings_for_chunks(chunks: List[Dict]) -> Tuple[List[Dict], Dict]:
    """
    텍스트 청크 리스트를 OpenAI 임베딩 모델을 사용하여 벡터로 변환합니다.
    배치 호출 + exponential backoff 재시도를 적용합니다.

    :param chunks: 메타데이터와 텍스트를 포함한 청크 리스트.
    :return: (임베딩 벡터가 추가된 청크 리스트, 토큰 사용량 정보)
    :raises EmbeddingError: API 크레딧 소진 등 치명적 에러 발생 시
    """
    token_usage = {
        "model": EMBEDDING_MODEL,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0
    }

    if not chunks:
        return [], token_usage

    client = OpenAI()
    total_prompt_tokens = 0
    quota_error_detected = False

    # 토큰 합산 기반 배치 분할
    batches = _split_into_batches(chunks)
    print(f"임베딩 배치 분할: {len(chunks)}개 청크 -> {len(batches)}개 배치")

    for batch_idx, batch in enumerate(batches):
        batch_texts = [c['text'] for c in batch]
        batch_ids = [c['chunk_id'] for c in batch]

        try:
            # 배치 단위 API 호출 (backoff 재시도 포함)
            response = _call_embedding_api_with_backoff(client, batch_texts)

            # 응답에서 임베딩 벡터를 각 청크에 매핑 (index 순서 보장)
            for embedding_data in response.data:
                batch[embedding_data.index]['embedding'] = embedding_data.embedding

            # 토큰 사용량 집계
            if hasattr(response, 'usage') and response.usage:
                total_prompt_tokens += response.usage.prompt_tokens

            print(f"배치 {batch_idx + 1}/{len(batches)} 임베딩 완료 ({len(batch)}개 청크)")

        except RateLimitError as e:
            error_str = str(e)
            print(f"배치 {batch_idx + 1}/{len(batches)} 임베딩 중 RateLimitError: {e}")

            # 배치 내 모든 청크를 None으로 설정
            for c in batch:
                c['embedding'] = None

            if _is_quota_error(e):
                quota_error_detected = True
                # quota 소진 시 나머지 배치도 처리 불가 -> 중단
                for remaining_batch in batches[batch_idx + 1:]:
                    for c in remaining_batch:
                        c['embedding'] = None
                break

        except (APIError, APIConnectionError) as e:
            print(f"배치 {batch_idx + 1}/{len(batches)} 임베딩 중 API 오류: {e}")
            for c in batch:
                c['embedding'] = None

        except Exception as e:
            print(f"배치 {batch_idx + 1}/{len(batches)} 임베딩 중 오류: {e}")
            for c in batch:
                c['embedding'] = None

    # 최종 토큰 사용량 정보
    token_usage = {
        "model": EMBEDDING_MODEL,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": 0,  # 임베딩은 completion 토큰 없음
        "total_tokens": total_prompt_tokens
    }

    print(f"임베딩 완료: 총 {total_prompt_tokens} 토큰 사용")

    # None 임베딩 필터링 (Qdrant 저장 시 에러 방지)
    valid_chunks = [c for c in chunks if c.get('embedding') is not None]
    failed_count = len(chunks) - len(valid_chunks)

    if failed_count > 0:
        print(f"경고: {failed_count}개 청크의 임베딩 생성 실패 (스킵됨)")

    # 크레딧 소진 에러 감지 시 호출자에게 알림 (부분 성공 포함)
    if quota_error_detected:
        if len(valid_chunks) == 0:
            raise EmbeddingError(
                "OpenAI API 크레딧이 소진되었습니다. https://platform.openai.com/account/billing 에서 크레딧을 충전해주세요.",
                error_code="OPENAI_QUOTA_EXCEEDED"
            )
        # 부분 성공: 일부 배치는 성공했지만 quota 소진됨 → 플래그로 전달
        token_usage["quota_exhausted"] = True
        print(f"경고: 크레딧 소진 감지. {len(valid_chunks)}개 청크는 성공, 나머지는 실패")

    return valid_chunks, token_usage

if __name__ == '__main__':
    # 1단계 코드 실행 (MongoDB에서 텍스트 로딩 및 청크 분할)
    test_doc_id = '68942319c401f1f64004e23e'
    doc_data = extract_text_from_mongo(test_doc_id)

    if doc_data:
        # 1단계: 청크 분할
        chunks = split_text_into_chunks(doc_data['text'], doc_data['meta'])

        if chunks:
            # 2단계: 임베딩 생성
            embedded_chunks, token_usage = create_embeddings_for_chunks(chunks)

            if embedded_chunks:
                print("\n--- 생성된 첫 번째 청크와 임베딩 ---")
                # 임베딩 벡터는 너무 길어서 일부만 출력
                print(f"청크 ID: {embedded_chunks[0]['chunk_id']}")
                print(f"임베딩 벡터 (일부): {embedded_chunks[0]['embedding'][:5]}...")
                print(f"벡터 차원: {len(embedded_chunks[0]['embedding'])}")
                print(f"\n--- 토큰 사용량 ---")
                print(f"모델: {token_usage['model']}")
                print(f"총 토큰: {token_usage['total_tokens']}")
