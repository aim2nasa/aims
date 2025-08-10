from qdrant_client import QdrantClient, models

def create_collection(collection_name: str = "docembed"):
    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)
    
    # 1536은 OpenAI 'text-embedding-3-small' 모델의 벡터 차원입니다.
    # Qdrant에 이미 컬렉션이 있으면 삭제하고 새로 생성합니다.
    client.recreate_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
    )
    print(f"컬렉션 '{collection_name}'이(가) 성공적으로 생성(또는 재 생성)되었습니다.")

if __name__ == '__main__':
    create_collection()
