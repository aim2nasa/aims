import os
from openai import OpenAI, APIError, RateLimitError, APIConnectionError
from typing import List, Dict, Tuple
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks


class EmbeddingError(Exception):
    """임베딩 처리 중 발생한 에러를 위한 커스텀 예외"""
    def __init__(self, message: str, error_code: str = "UNKNOWN"):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


def create_embeddings_for_chunks(chunks: List[Dict]) -> Tuple[List[Dict], Dict]:
    """
    텍스트 청크 리스트를 OpenAI 임베딩 모델을 사용하여 벡터로 변환합니다.

    :param chunks: 메타데이터와 텍스트를 포함한 청크 리스트.
    :return: (임베딩 벡터가 추가된 청크 리스트, 토큰 사용량 정보)
    :raises EmbeddingError: API 크레딧 소진 등 치명적 에러 발생 시
    """
    token_usage = {
        "model": "text-embedding-3-small",
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0
    }

    if not chunks:
        return [], token_usage

    client = OpenAI()
    total_prompt_tokens = 0
    quota_error_detected = False

    for chunk in chunks:
        try:
            # OpenAI API 호출
            response = client.embeddings.create(
                input=chunk['text'],
                model="text-embedding-3-small", # 1536차원 모델
                encoding_format="float"
            )

            # 생성된 임베딩 벡터를 청크에 추가
            chunk['embedding'] = response.data[0].embedding

            # 토큰 사용량 집계
            if hasattr(response, 'usage') and response.usage:
                total_prompt_tokens += response.usage.prompt_tokens

            print(f"청크 '{chunk['chunk_id']}'의 임베딩 생성 완료!")
        except RateLimitError as e:
            # OpenAI 크레딧 소진 또는 Rate Limit
            error_str = str(e)
            print(f"청크 '{chunk['chunk_id']}' 임베딩 중 오류 발생: {e}")
            chunk['embedding'] = None

            if 'insufficient_quota' in error_str or 'exceeded your current quota' in error_str:
                quota_error_detected = True
        except APIError as e:
            print(f"청크 '{chunk['chunk_id']}' 임베딩 중 API 오류 발생: {e}")
            chunk['embedding'] = None
        except APIConnectionError as e:
            print(f"청크 '{chunk['chunk_id']}' 임베딩 중 연결 오류 발생: {e}")
            chunk['embedding'] = None
        except Exception as e:
            print(f"청크 '{chunk['chunk_id']}' 임베딩 중 오류 발생: {e}")
            chunk['embedding'] = None

    # 최종 토큰 사용량 정보
    token_usage = {
        "model": "text-embedding-3-small",
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": 0,  # 임베딩은 completion 토큰 없음
        "total_tokens": total_prompt_tokens
    }

    print(f"임베딩 완료: 총 {total_prompt_tokens} 토큰 사용")

    # None 임베딩 필터링 (Qdrant 저장 시 에러 방지)
    valid_chunks = [c for c in chunks if c.get('embedding') is not None]
    failed_count = len(chunks) - len(valid_chunks)

    if failed_count > 0:
        print(f"⚠️ {failed_count}개 청크의 임베딩 생성 실패 (스킵됨)")

    # 크레딧 소진 에러가 감지되었고 모든 청크가 실패한 경우
    if quota_error_detected and len(valid_chunks) == 0:
        raise EmbeddingError(
            "OpenAI API 크레딧이 소진되었습니다. https://platform.openai.com/account/billing 에서 크레딧을 충전해주세요.",
            error_code="OPENAI_QUOTA_EXCEEDED"
        )

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
