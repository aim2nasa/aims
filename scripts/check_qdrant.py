import qdrant_client
from qdrant_client.http.exceptions import UnexpectedResponse

def get_all_records(collection_name: str, host: str = "localhost", port: int = 6333):
    try:
        # 버전 호환성 경고를 무시합니다.
        client = qdrant_client.QdrantClient(host=host, port=port, check_compatibility=False)
        
        # 컬렉션이 존재하는지 확인합니다.
        # 존재하지 않으면 여기서 예외가 발생합니다.
        client.get_collection(collection_name=collection_name)
        
        # 컬렉션이 존재하면 레코드를 조회합니다.
        records, _ = client.scroll(
            collection_name=collection_name,
            limit=100
        )
        
        print(f"✅ '{collection_name}' 컬렉션에 있는 레코드 {len(records)}개를 조회했습니다.")
        if records:
            for record in records:
                print(record)
        else:
            print("컬렉션에 레코드가 없습니다.")

    except UnexpectedResponse as e:
        # 컬렉션이 존재하지 않을 때 발생하는 특정 오류를 처리합니다.
        if e.status_code == 404:
            print(f"❌ '{collection_name}' 컬렉션이 존재하지 않습니다.")
        else:
            print(f"🚨 예상치 못한 오류가 발생했습니다: {e}")
    except Exception as e:
        print(f"🚨 오류가 발생했습니다: {e}")


if __name__ == "__main__":
    COLLECTION_NAME = "docembed"  # 컬렉션 이름을 여기에 입력하세요
    get_all_records(COLLECTION_NAME)
