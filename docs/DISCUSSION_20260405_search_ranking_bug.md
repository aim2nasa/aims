# 토의 보고서: 키워드 검색 정렬 + 검색어 위치 미표시 버그

> 날짜: 2026-04-05
> 이슈: "비행기" 키워드 검색 시 무관 문서가 1등으로 표시, 검색어 위치/전문보기 미동작

## 근본 원인

`smart_search.py`의 `_KEYWORD_SEARCH_PROJECTION`이 `full_text`를 제외하고 프론트엔드에 전달.

```python
_KEYWORD_SEARCH_PROJECTION = {
    "ocr.full_text": 0,    # ← 근본 원인
    "meta.full_text": 0,
    "text.full_text": 0,
    ...
}
```

MongoDB는 `full_text`에서 "경비행기"를 매칭하여 문서를 반환하지만,
projection으로 `full_text`를 제거한 채 프론트엔드에 전달.

## 세 가지 증상 (모두 같은 원인)

| 증상 | 원인 |
|------|------|
| 무관 문서가 먼저 정렬 | `_compute_relevance_score`가 projection 후 필드만 확인 → full_text 매칭 문서는 점수 0 |
| "본문 텍스트 없음" 표시 | 프론트 `getAllKeywordMatches`가 `item.ocr.full_text`를 읽지만 비어있음 |
| 전문보기 비활성화 | `disabled={!item.meta?.full_text && !item.ocr?.full_text}` — full_text 없으므로 disabled |

## 해결 방향 (합의)

백엔드 페이지네이션 도입:
1. projection으로 full_text 제외하고 전체 결과 가져옴
2. 점수 계산 + 정렬
3. 해당 페이지의 문서 ID만 추출
4. 해당 문서들만 full_text 포함 재조회
5. 총 건수를 함께 반환하여 프론트 페이지네이션 유지

## DB 확인 사실

김보성 청약서(69c77f9c4931cf818e4fe051):
- `ocr.full_text`에 "⑪ 헬기 및 경비행기조정" 반복 등장
- "비행기" 키워드에 정상 매칭 (부분 문자열)
- 검색 자체는 정상, 정렬과 표시만 문제
