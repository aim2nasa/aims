# MetLife 고객목록 클릭 위치 튜닝 기록

## 네비게이션 모드

| 모드 | 설정 | 설명 |
|------|------|------|
| **Offset** | `USE_ARROW_NAV = False` | 픽셀 좌표 계산 방식 (기본값) |
| **Arrow Down** | `USE_ARROW_NAV = True` | 키보드 네비게이션 + 상대 이동 |

### Arrow Down 모드 동작 원리
1. **첫 행**: offset으로 Y좌표 계산 → 고객명 클릭 (선택 상태 진입)
2. **상세 화면**: 닫기 → 목록 복귀 (선택 상태 유지됨)
3. **다음 행**: `Key.DOWN` → 선택 이동 → `previous_y + ROW_HEIGHT` 위치 클릭

**장점:**
- 첫 행만 offset 의존, 이후는 ROW_HEIGHT만 의존
- P1/P2 offset 차이 문제 해소 (첫 행만 정확하면 됨)
- 환경 변화에 강함

**제약:**
- Enter 키 미지원 → 클릭 필요

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

### Offset 방식
```python
def get_row_y(header_y, row_index, is_scrolled=False):
    offset = FIRST_ROW_OFFSET_SCROLLED if is_scrolled else FIRST_ROW_OFFSET
    return header_y + offset + (ROW_HEIGHT * row_index)
```

### Arrow Down 방식
```python
if i == 0:
    # 첫 행: offset으로 계산
    current_y = get_row_y(base_y, row_index, is_scrolled)
else:
    # 다음 행: Arrow Down + ROW_HEIGHT
    type(Key.DOWN)
    current_y += ROW_HEIGHT
click(Location(fixed_x, current_y))
```

## 튜닝 가이드 (Offset 방식)

| 증상 | 조치 |
|------|------|
| 클릭이 위로 밀림 | offset 값 증가 (+1~2) |
| 클릭이 아래로 밀림 | offset 값 감소 (-1~2) |

## 환경 조건

안정적인 동작을 위한 권장 환경:
- 해상도: 1920x1080
- 브라우저: 전체화면
- 줌: 100%

## 테스트 기록

### 2026-01-27 00:05 (Offset 방식)

| 페이지 | 대상 고객 | 클릭 위치 | 결과 |
|--------|----------|----------|------|
| P1 (R00) | 나루에스앤에프 | 행 중앙 | ✅ OK |
| P2 (R04) | 남지연 | 행 중앙 | ✅ OK |

- 모드: Offset (기본)
- P1 offset: 38, P2 offset: 28
- 전체 26명 처리 완료 (P1: 15명, P2: 11명)
- 스크린샷: `D:\captures\metlife_ocr\diagnostic\click_001~026_*.png`

### 2026-01-27 00:15 (Arrow Down 방식)

| 페이지 | 대상 고객 | 클릭 위치 | 결과 |
|--------|----------|----------|------|
| P1 | ㄴ 초성 전체 | 정상 | ✅ OK |
| P2 | ㄴ 초성 전체 | 정상 | ✅ OK |

- 모드: Arrow Down (`--arrow-nav`)
- 첫 행만 offset, 이후 Key.DOWN + ROW_HEIGHT
- 전체 26명 처리 완료 (오류 없음)

## 방식 비교

| 항목 | Offset 방식 | Arrow Down 방식 |
|------|-------------|-----------------|
| **테스트 상태** | ✅ 검증됨 | ✅ 검증됨 |
| **offset 의존성** | 매 행마다 계산 | 첫 행만 |
| **P1/P2 차이** | 별도 offset 필요 (38/28) | 첫 행만 맞으면 됨 |
| **오류 누적** | ROW_HEIGHT 오차 누적 | 동일하나 영향 적음 (Key.DOWN이 선택) |
| **환경 변화 대응** | 재튜닝 필요 | 상대적으로 강함 |
| **권장** | 기존 호환 | ✅ 신규 권장 |

**결론:** Arrow Down 방식이 더 안정적
- **이유**: Key.DOWN이 시스템 레벨에서 정확히 다음 행을 선택함. 클릭은 단지 선택된 행을 활성화하는 역할이므로 클릭 위치 정확도 요구가 낮음.
- **Offset 유지 이유**: 기존 튜닝된 값이 있고, 1920x1080 고정 환경에서 검증됨. 기본값으로 유지하되 Arrow Down으로 전환 권장.

### 명령줄 옵션

```bash
# Offset 방식 (기본)
java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄴ

# Arrow Down 방식
java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄴ --arrow-nav

# 클릭 비활성화 (OCR만)
java -jar sikulixide.jar -r MetlifeCustomerList.py -- ㄴ --no-click
```
