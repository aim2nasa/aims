from qdrant_client import QdrantClient, models

def create_collection(collection_name: str = "docembed"):
    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)

    if client.collection_exists(collection_name=collection_name):
        print(f"컬렉션 '{collection_name}'이(가) 이미 존재하여 삭제합니다.")
        client.delete_collection(collection_name=collection_name)
    
    # 새로운 컬렉션을 생성합니다.
    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
    )
    print(f"컬렉션 '{collection_name}'이(가) 성공적으로 생성되었습니다.")

if __name__ == '__main__':
    create_collection()
