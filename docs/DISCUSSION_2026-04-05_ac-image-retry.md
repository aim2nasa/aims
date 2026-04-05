# AC 이미지 매칭 실패 자동 재시도

**일시**: 2026-04-05
**프로세스**: Compact Fix

## 이슈

SikuliX FindFailed 발생 시 즉시 프로그램 종료됨. MetLife 웹 페이지의 일시적 렌더링 지연으로 이미지를 못 찾는 경우에도 크래시.

## 원인

- `click(img)`: 래퍼에 재시도 없음, 1회 실패 시 FindFailed → _fatal_crash
- `find(img)`: 래퍼 자체가 없음, SikuliX 원본 직접 호출
- `Region.click(img)`: 전역 래퍼 우회

## 합의된 수정 방향

`click()`/`find()` 래퍼에 `exists(img, 5)` 기반 재시도 로직 추가 (최대 3회).
이미지 대상(str/unicode)일 때만 적용, 좌표/Match 등은 기존과 동일.
Region.click()은 1곳만 있어 인라인 처리.

## 검토한 대안

- 상위 메뉴 복귀 전략: 아이디어로 보류. 복잡도 높고 현재 필요성 미확인.

## 영향 범위

- `click()` 래퍼 수정, `find()` 래퍼 신규, line 1844 인라인 재시도
- 스크립트 전체의 모든 click/find 호출에 자동 적용
