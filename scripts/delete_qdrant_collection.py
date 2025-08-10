import qdrant_client

def delete_collection(collection_name: str, host: str = "localhost", port: int = 6333):
    client = qdrant_client.QdrantClient(host=host, port=port)
    
    # 컬렉션을 삭제합니다.
    client.delete_collection(collection_name=collection_name)
    
    print(f"'{collection_name}' 컬렉션이 삭제되었습니다.")

if __name__ == "__main__":
    COLLECTION_NAME = "docembed"  # 삭제할 컬렉션 이름을 여기에 입력하세요
    delete_collection(COLLECTION_NAME)
