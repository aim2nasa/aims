from pymongo import MongoClient
from bson.objectid import ObjectId

def extract_text_from_mongo(doc_id: str, mongo_uri: str = 'mongodb://localhost:27017/', db_name: str = 'docupload', collection_name: str = 'files'):
    """
    MongoDB에서 특정 문서의 전체 텍스트를 추출합니다.

    :param doc_id: 추출할 문서의 ObjectId 문자열.
    :param mongo_uri: MongoDB 연결 URI.
    :param db_name: 데이터베이스 이름.
    :param collection_name: 컬렉션 이름.
    :return: 문서의 전체 텍스트(full_text)와 메타데이터(meta)를 담은 딕셔너리.
    """
    try:
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        # ObjectId로 변환하여 문서 조회
        document = collection.find_one({'_id': ObjectId(doc_id)})

        if document:
            # 1. meta.full_text 우선 확인
            if 'meta' in document and 'full_text' in document['meta']:
                full_text = document['meta']['full_text']
                text_source = 'meta'
            # 2. ocr.full_text 대안 확인
            elif 'ocr' in document and 'full_text' in document['ocr']:
                full_text = document['ocr']['full_text']
                text_source = 'ocr'
            else:
                print(f"문서 ID '{doc_id}'에 full_text가 없습니다.")
                return None

            # 새로운 스키마에 맞는 메타데이터 추출
            meta = {
                'doc_id': str(document['_id']),
                'original_name': document.get('upload', {}).get('originalName'),
                'uploaded_at': document.get('upload', {}).get('uploaded_at'),
                'mime': document.get('meta', {}).get('mime'),
                'text_source': text_source,
                'owner_id': document.get('upload', {}).get('uploadedBy'),  # 🔥 문서 소유자 ID 추가
                'customer_id': document.get('customer_relation', {}).get('customer_id')  # 🔥 고객 ID 추가 (없으면 None)
            }
            print(f"문서 ID '{doc_id}'의 텍스트 로딩 완료! (출처: {text_source})")
            return {'text': full_text, 'meta': meta}
        else:
            print(f"문서 ID '{doc_id}'를 찾을 수 없습니다.")
            return None

    except Exception as e:
        print(f"MongoDB에서 데이터를 가져오는 중 오류 발생: {e}")
        return None

if __name__ == '__main__':
    # 사용 예시 (제공해주신 데이터의 _id 사용)
    test_doc_id = '68942319c401f1f64004e23e'
    result = extract_text_from_mongo(test_doc_id)

    if result:
        print("\n--- 추출된 텍스트와 메타데이터 ---")
        print(f"메타데이터: {result['meta']}")
        print(f"텍스트 미리보기: {result['text'][:200]}...") # 처음 200자만 출력
