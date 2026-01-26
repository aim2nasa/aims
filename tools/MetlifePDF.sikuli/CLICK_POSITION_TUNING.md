# MetLife 고객목록 클릭 위치 튜닝 기록

## 최종 설정값 (2026-01-26)

| 페이지 | 파라미터 | 값 | 상태 |
|--------|----------|-----|------|
| P1 (첫 페이지) | `FIRST_ROW_OFFSET` | 38 | OK |
| P2 (스크롤 후) | `FIRST_ROW_OFFSET_SCROLLED` | 28 | OK |
| 공통 | `ROW_HEIGHT` | 33 | - |

## 튜닝 히스토리

### 문제 발견
- P1과 P2에서 헤더-첫행 간격이 다름
- 동일한 offset 사용 시 P2에서 클릭 위치 드리프트 발생

### 튜닝 과정
1. 초기: `FIRST_ROW_OFFSET = 40`, `FIRST_ROW_OFFSET_SCROLLED = 37`
2. 1차 수정: `FIRST_ROW_OFFSET = 38`, `FIRST_ROW_OFFSET_SCROLLED = 30`
3. 최종: `FIRST_ROW_OFFSET = 38`, `FIRST_ROW_OFFSET_SCROLLED = 28`

### 검증 방법
- `DIAGNOSTIC_MODE = True` 설정으로 클릭 전 스크린샷 저장
- 빨간 십자선+원으로 클릭 위치 시각화
- 스크린샷 경로: `D:\captures\metlife_ocr\diagnostic\`

## 클릭 위치 계산 공식

```python
def get_row_y(header_y, row_index, is_scrolled=False):
    offset = FIRST_ROW_OFFSET_SCROLLED if is_scrolled else FIRST_ROW_OFFSET
    return header_y + offset + (ROW_HEIGHT * row_index)
```

- `header_y`: 고객명 헤더 Y좌표 (이미지 인식)
- `row_index`: 0-based 행 인덱스
- `is_scrolled`: `scroll_page > 1`이면 True

## 튜닝 가이드

| 증상 | 조치 |
|------|------|
| 클릭이 위로 밀림 | offset 값 증가 (+1~2) |
| 클릭이 아래로 밀림 | offset 값 감소 (-1~2) |

## 향후 개선 방안

Arrow Down 키보드 네비게이션 방식 검토:
- 장점: offset 튜닝 불필요, 안정적
- 확인 사항: 상세 화면 닫고 목록 복귀 시 선택 상태 유지됨, Arrow Down 동작함
- 제약: Enter 키 미지원 (클릭 필요)
