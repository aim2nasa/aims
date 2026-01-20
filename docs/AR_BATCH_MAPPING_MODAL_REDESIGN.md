# AR 파일 일괄 매핑 모달 재설계

## 목표

1. **엑셀 스타일 테이블 UI** - 고객 일괄등록(ExcelRefiner)과 일관된 UX
2. **대량 파일 처리 성능 최적화** - 수백 개 이상 파일 처리
3. **테이블이 모달 전체 높이 차지** - 빈 공간 없이 데이터 밀도 최대화

## 현재 문제

테이블 컨테이너가 flex-grow하지 않아 모달 내 빈 공간 발생

## 콘솔 테스트 (작동 확인용)

```javascript
document.querySelector('.draggable-modal__content').style.cssText = 'flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding: 8px;';
document.querySelector('.batch-ar-modal__content').style.cssText = 'display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; height: 100%; overflow: hidden;';
document.querySelector('.ar-file-table').style.cssText = 'display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; height: 100%;';
document.querySelector('.ar-file-table__table-container').style.cssText = 'flex: 1 1 0; min-height: 0; overflow: auto; border: 2px solid red;';
```

## 설계 결정

| 항목 | 현재 | 변경 | 이유 |
|------|------|------|------|
| 테이블 구조 | div+flexbox | native `<table>` | ExcelRefiner 일관성 |
| 셀 패딩 | 8px 12px | 4px 8px | 데이터 밀도 증가 |
| 기본 페이지 크기 | 10개 | 50개 | 더 많은 데이터 표시 |
| 컬럼 너비 | 고정 | 조정 가능 | 유연성 |

## 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `ArFileTable.tsx` | native table + 인라인 flex 스타일 |
| `ArFileTable.css` | 컴팩트 스타일 |
| `BatchArMappingModal.tsx` | 모달 크기 조정 |
| `DraggableModal.tsx` | content flex 스타일 |
| `DraggableModal.css` | flex: 1 1 0 |
