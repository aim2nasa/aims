import re
from langchain.text_splitter import RecursiveCharacterTextSplitter


def preprocess_text(text: str) -> str:
    """
    임베딩 전 텍스트 노이즈를 규칙 기반으로 제거합니다.
    AI를 사용하지 않으므로 환각 위험이 없습니다.

    처리 항목:
    1. \\r\\n → \\n 정규화
    2. 연속 탭 → 단일 공백 (Excel 노이즈 해소)
    3. 연속 공백(3+) → 단일 공백
    4. 연속 빈 줄(4+) → 3줄로 축소
    5. 반복 라인 제거 (10자+ 동일 라인 4회+ 반복 → 2회까지만 유지)
    """
    if not text:
        return text

    # 1. \r\n → \n 정규화
    text = text.replace('\r\n', '\n')

    # 2. 연속 탭 → 단일 공백
    text = re.sub(r'\t+', ' ', text)

    # 3. 연속 공백(3+) → 단일 공백 (줄바꿈은 보존)
    text = re.sub(r'[^\S\n]{3,}', ' ', text)

    # 4. 연속 빈 줄(4+) → 3줄로 축소
    text = re.sub(r'\n{4,}', '\n\n\n', text)

    # 5. 반복 라인 제거 (10자+ 동일 라인이 4회+ 반복 → 2회까지만 유지)
    lines = text.split('\n')
    cleaned_lines = []
    prev_line = None
    repeat_count = 0

    for line in lines:
        stripped = line.strip()
        if stripped == prev_line and len(stripped) >= 10:
            repeat_count += 1
            if repeat_count <= 2:
                cleaned_lines.append(line)
            # 3회 이상은 무시
        else:
            prev_line = stripped
            repeat_count = 1
            cleaned_lines.append(line)

    text = '\n'.join(cleaned_lines)

    return text


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

    # 텍스트 전처리: 노이즈 제거 (탭, 연속 공백, 반복 라인 등)
    text = preprocess_text(text)

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
