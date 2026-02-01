from qdrant_client import QdrantClient, models

COLLECTION_NAME = "docembed"
VECTOR_SIZE = 1536
DISTANCE = models.Distance.COSINE


def ensure_collection(collection_name: str = COLLECTION_NAME):
    """컬렉션이 없으면 생성. 이미 있으면 유지 (데이터 보존)."""
    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)

    if client.collection_exists(collection_name=collection_name):
        info = client.get_collection(collection_name=collection_name)
        print(f"컬렉션 '{collection_name}'이(가) 이미 존재합니다. (포인트: {info.points_count}개)")
        return

    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=DISTANCE),
    )
    print(f"컬렉션 '{collection_name}'이(가) 성공적으로 생성되었습니다.")


def recreate_collection(collection_name: str = COLLECTION_NAME):
    """컬렉션을 삭제 후 재생성. 모든 벡터 데이터가 소멸됩니다!"""
    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)

    if client.collection_exists(collection_name=collection_name):
        info = client.get_collection(collection_name=collection_name)
        count = info.points_count
        confirm = input(f"⚠️  컬렉션 '{collection_name}'에 {count}개 포인트가 있습니다. 정말 삭제하시겠습니까? (yes/no): ")
        if confirm.strip().lower() != 'yes':
            print("취소되었습니다.")
            return
        client.delete_collection(collection_name=collection_name)
        print(f"컬렉션 '{collection_name}' 삭제 완료.")

    client.create_collection(
        collection_name=collection_name,
        vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=DISTANCE),
    )
    print(f"컬렉션 '{collection_name}'이(가) 성공적으로 생성되었습니다.")


if __name__ == '__main__':
    import sys
    if '--force-recreate' in sys.argv:
        recreate_collection()
    else:
        ensure_collection()
