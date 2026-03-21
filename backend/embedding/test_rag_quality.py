"""
RAG 검색 품질 테스트 스크립트

보험 관련 질문을 Qdrant에 검색하여 상위 청크의 관련성을 확인한다.
각 질문마다 score, document_type, original_name, text_raw를 출력.

사용법:
    cd ~/aims/backend/embedding
    source ~/aims/.env.shared
    ~/aims/venv/bin/python test_rag_quality.py
"""
import os
from openai import OpenAI
from qdrant_client import QdrantClient, models

# ── 설정 ──
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION = "docembed"
EMBED_MODEL = "text-embedding-3-small"
TOP_K = 3
TEXT_PREVIEW_LEN = 200  # text_raw 미리보기 길이

# ── 테스트 질문 ──
TEST_QUERIES = [
    "사망보험금 수익자 변경 방법",
    "입원일당 청구 조건",
    "자동차보험 대인배상 한도",
    "암 진단비 지급 기준",
    "건강검진 결과 해석",
    "법인 사업자등록증 변경",
    "퇴직연금 부담금 납입 확인",
    "보장분석 보고서 비교",
]


def embed_query(client: OpenAI, text: str) -> list:
    """질문 텍스트를 임베딩 벡터로 변환"""
    response = client.embeddings.create(
        input=text,
        model=EMBED_MODEL,
        encoding_format="float"
    )
    return response.data[0].embedding


def search_qdrant(qdrant: QdrantClient, vector: list, top_k: int = TOP_K) -> list:
    """Qdrant에서 유사도 검색 (필터 없음 — 전체 문서 대상)"""
    return qdrant.search(
        collection_name=COLLECTION,
        query_vector=vector,
        limit=top_k,
        with_payload=True
    )


def run():
    openai_client = OpenAI()
    qdrant = QdrantClient(url=QDRANT_URL, check_compatibility=False)

    # 컬렉션 상태 확인
    try:
        info = qdrant.get_collection(COLLECTION)
        print(f"[Qdrant] 컬렉션: {COLLECTION}, 포인트: {info.points_count}개, 차원: {info.config.params.vectors.size}")
    except Exception as e:
        print(f"[ERROR] Qdrant 컬렉션 조회 실패: {e}")
        return

    print(f"[테스트] 질문 {len(TEST_QUERIES)}개, 각 상위 {TOP_K}개 청크 출력\n")
    print("=" * 80)

    total_tokens = 0

    for qi, query in enumerate(TEST_QUERIES, 1):
        print(f"\n{'─'*80}")
        print(f"Q{qi}. {query}")
        print(f"{'─'*80}")

        # 임베딩
        vector = embed_query(openai_client, query)
        total_tokens += len(query)  # 대략적 토큰 추정

        # 검색
        results = search_qdrant(qdrant, vector)

        if not results:
            print("  (검색 결과 없음)")
            continue

        for ri, hit in enumerate(results, 1):
            payload = hit.payload or {}
            score = hit.score
            doc_type = payload.get('document_type', '-')
            is_ar = payload.get('is_annual_report', False)
            is_crs = payload.get('is_customer_review', False)
            original_name = payload.get('original_name', '(unknown)')
            text_raw = payload.get('text_raw', payload.get('preview', ''))

            # AR/CRS 플래그 표시
            type_display = doc_type
            if is_ar:
                type_display = 'annual_report (AR)'
            elif is_crs:
                type_display = 'customer_review (CRS)'

            # text_raw 미리보기
            preview = text_raw[:TEXT_PREVIEW_LEN].replace('\n', ' ')
            if len(text_raw) > TEXT_PREVIEW_LEN:
                preview += "..."

            print(f"\n  [{ri}] score={score:.4f}  type={type_display}")
            print(f"      file: {original_name}")
            print(f"      text: {preview}")

    print(f"\n{'='*80}")
    print(f"[완료] {len(TEST_QUERIES)}개 질문 검색 완료")


if __name__ == '__main__':
    run()
