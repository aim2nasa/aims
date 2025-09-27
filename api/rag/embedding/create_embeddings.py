import os
from openai import OpenAI
from typing import List, Dict
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks

def create_embeddings_for_chunks(chunks: List[Dict]) -> List[Dict]:
    """
    텍스트 청크 리스트를 OpenAI 임베딩 모델을 사용하여 벡터로 변환합니다.

    :param chunks: 메타데이터와 텍스트를 포함한 청크 리스트.
    :return: 임베딩 벡터가 추가된 청크 리스트.
    """
    if not chunks:
        return []

    client = OpenAI()

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
            print(f"청크 '{chunk['chunk_id']}'의 임베딩 생성 완료!")
        except Exception as e:
            print(f"청크 '{chunk['chunk_id']}' 임베딩 중 오류 발생: {e}")
            chunk['embedding'] = None
    
    return chunks

if __name__ == '__main__':
    # 1단계 코드 실행 (MongoDB에서 텍스트 로딩 및 청크 분할)
    test_doc_id = '68942319c401f1f64004e23e'
    doc_data = extract_text_from_mongo(test_doc_id)

    if doc_data:
        # 1단계: 청크 분할
        chunks = split_text_into_chunks(doc_data['text'], doc_data['meta'])
        
        if chunks:
            # 2단계: 임베딩 생성
            embedded_chunks = create_embeddings_for_chunks(chunks)
            
            if embedded_chunks:
                print("\n--- 생성된 첫 번째 청크와 임베딩 ---")
                # 임베딩 벡터는 너무 길어서 일부만 출력
                print(f"청크 ID: {embedded_chunks[0]['chunk_id']}")
                print(f"임베딩 벡터 (일부): {embedded_chunks[0]['embedding'][:5]}...")
                print(f"벡터 차원: {len(embedded_chunks[0]['embedding'])}")
