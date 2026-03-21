import re
from langchain.text_splitter import RecursiveCharacterTextSplitter


def preprocess_text(text: str | None) -> str | None:
    """
    임베딩 전 텍스트 노이즈를 규칙 기반으로 제거합니다.
    AI를 사용하지 않으므로 환각 위험이 없습니다.

    처리 항목:
    1. \\r\\n → \\n 정규화
    2. 연속 탭 → 단일 공백 (Excel 노이즈 해소)
    3. 연속 공백(3+) → 단일 공백
    4. 연속 빈 줄(4+) → 3줄로 축소
    5. 반복 라인 제거 (10자+ 동일 라인 4회+ 반복 → 3회까지만 유지)
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

    # 5. 반복 라인 제거 (10자+ 동일 라인이 4회+ 반복 → 3회까지만 유지)
    lines = text.split('\n')
    cleaned_lines = []
    prev_line = None
    repeat_count = 0

    for line in lines:
        stripped = line.strip()
        if stripped == prev_line and len(stripped) >= 10:
            repeat_count += 1
            if repeat_count <= 3:
                cleaned_lines.append(line)
            # 4회 이상은 무시
        else:
            prev_line = stripped
            repeat_count = 1
            cleaned_lines.append(line)

    text = '\n'.join(cleaned_lines)

    return text


def split_text_into_chunks(text: str, meta: dict, chunk_size: int = 1000, chunk_overlap: int = 200):
    """
    전체 텍스트를 작은 청크로 분할하고 메타데이터를 추가합니다.

    P5-2: 청크 크기 1500→1000자, 오버랩 150→200자로 변경
    - 작은 청크 = 더 정밀한 벡터 표현 (임베딩이 청크 전체를 대표하므로)
    - 큰 오버랩 = 문맥 단절 감소

    P5-1: 청크에 메타데이터 프리픽스 추가
    - 임베딩 시 "[문서명] 청크텍스트" 형태로 문서 문맥을 벡터에 인코딩
    - "이 청크가 어떤 문서에서 왔는지" 정보가 벡터에 반영되어 검색 정확도 향상

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

    # P5-1: 메타데이터 프리픽스 구성 (문서명 → 벡터에 문맥 인코딩)
    original_name = meta.get('original_name', '')
    # 파일 확장자 제거하여 프리픽스 생성 (예: "보험계약서_홍길동.pdf" → "보험계약서_홍길동")
    if original_name and '.' in original_name:
        doc_label = original_name.rsplit('.', 1)[0]
    else:
        doc_label = original_name
    metadata_prefix = f"[{doc_label}] " if doc_label else ""

    # 각 청크에 메타데이터 추가
    processed_chunks = []
    for i, chunk in enumerate(chunks):
        # P5-1: 프리픽스를 청크 텍스트 앞에 붙여 임베딩에 문서 문맥 포함
        prefixed_text = metadata_prefix + chunk if metadata_prefix else chunk

        # 기본 메타데이터에 청크별 정보 추가
        chunk_meta = meta.copy()
        chunk_meta.update({
            'chunk_id': f'{meta["doc_id"]}_{i}', # 고유한 청크 ID 생성
            'text': prefixed_text,  # P5-1: 프리픽스 포함 텍스트
            'text_raw': chunk,  # 원본 텍스트 (프리픽스 없음, LLM 컨텍스트용)
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
