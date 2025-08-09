from langchain.text_splitter import RecursiveCharacterTextSplitter

def split_text_into_chunks(text: str, meta: dict, chunk_size: int = 1500, chunk_overlap: int = 150):
    """
    전체 텍스트를 작은 청크로 분할하고 메타데이터를 추가합니다.

    :param text: 분할할 전체 텍스트.
    :param meta: 문서의 메타데이터 딕셔너리.
    :param chunk_size: 청크의 최대 크기.
    :param chunk_overlap: 청크 간의 중복 크기.
    :return: 메타데이터가 포함된 청크들의 리스트.
    """
    if not text:
        return []

    # 텍스트 분할기(Text Splitter) 초기화
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len
    )

    # 텍스트를 청크로 분할
    chunks = text_splitter.split_text(text)

    # 각 청크에 메타데이터 추가
    processed_chunks = []
    for i, chunk in enumerate(chunks):
        # 기본 메타데이터에 청크별 정보 추가
        chunk_meta = meta.copy()
        chunk_meta.update({
            'chunk_id': f'{meta["doc_id"]}_{i}', # 고유한 청크 ID 생성
            'text': chunk,
            'offset': text.find(chunk), # 텍스트 내 청크의 시작 위치
            'size': len(chunk)
        })
        processed_chunks.append(chunk_meta)

    print(f"총 {len(processed_chunks)}개의 청크가 생성되었습니다.")
    return processed_chunks

if __name__ == '__main__':
    # 테스트용 가짜 데이터 (실제로는 'extract_text_from_mongo.py'에서 반환받음)
    from extract_text_from_mongo import extract_text_from_mongo
    
    test_doc_id = '68942319c401f1f64004e23e'
    doc_data = extract_text_from_mongo(test_doc_id)
    
    if doc_data:
        # 텍스트와 메타데이터를 사용해 청크 분할
        chunks = split_text_into_chunks(doc_data['text'], doc_data['meta'])
        
        if chunks:
            print("\n--- 생성된 첫 번째 청크와 메타데이터 ---")
            print(chunks[0])
            print("...")
            print("\n--- 생성된 마지막 청크와 메타데이터 ---")
            print(chunks[-1])
