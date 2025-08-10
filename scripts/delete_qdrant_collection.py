import qdrant_client
from qdrant_client.http.exceptions import UnexpectedResponse

def delete_collection(collection_name: str, host: str = "localhost", port: int = 6333):
    try:
        # 버전 호환성 경고를 무시합니다.
        client = qdrant_client.QdrantClient(host=host, port=port, check_compatibility=False)

        if client.collection_exists(collection_name=collection_name):
            client.delete_collection(collection_name=collection_name)
            print(f"✅ '{collection_name}' 컬렉션이 성공적으로 삭제되었습니다.")
        else:
            print(f"❌ '{collection_name}' 컬렉션이 존재하지 않아 삭제할 수 없습니다.")
    
    except Exception as e:
        print(f"🚨 컬렉션 삭제 중 오류가 발생했습니다: {e}")

if __name__ == "__main__":
    COLLECTION_NAME = "docembed"  # 삭제할 컬렉션 이름을 여기에 입력하세요
    delete_collection(COLLECTION_NAME)
