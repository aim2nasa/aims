# 컨텍스트 메뉴 (우클릭) 정책

## 개요

AIMS UIX3 앱 전체에서 브라우저 기본 컨텍스트 메뉴(우클릭 메뉴)를 비활성화하여 일관된 UX를 제공합니다.

## 배경

### 문제점
- 일부 화면(내 보관함)에서는 커스텀 컨텍스트 메뉴 제공
- 다른 화면에서는 브라우저 기본 컨텍스트 메뉴 표시
- **일관성 없는 동작으로 사용자 혼란 발생**

### 해결 방안
- 앱 전체에서 브라우저 기본 컨텍스트 메뉴 비활성화
- 입력 필드(input, textarea 등)는 예외 처리 (복사/붙여넣기 기능 필요)

## 구현

### 위치
`frontend/aims-uix3/src/App.tsx`

### 코드
```tsx
// 🍎 전역 컨텍스트 메뉴 비활성화 (입력 필드 예외)
const handleContextMenu = useCallback((e: React.MouseEvent) => {
  const target = e.target as HTMLElement
  const tagName = target.tagName.toLowerCase()

  // 입력 필드는 기본 컨텍스트 메뉴 허용 (복사/붙여넣기 필요)
  const isInputField =
    tagName === 'input' ||
    tagName === 'textarea' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]')

  if (!isInputField) {
    e.preventDefault()
  }
}, [])

// 최상위 div에 적용
<div className="layout-main" onContextMenu={handleContextMenu}>
```

### 예외 처리 대상
| 요소 | 허용 여부 | 이유 |
|------|----------|------|
| `<input>` | ✅ 허용 | 텍스트 복사/붙여넣기 필요 |
| `<textarea>` | ✅ 허용 | 텍스트 복사/붙여넣기 필요 |
| `[contenteditable]` | ✅ 허용 | 리치 텍스트 편집 기능 필요 |
| 그 외 모든 요소 | ❌ 차단 | 일관된 UX 제공 |

## 기존 커스텀 컨텍스트 메뉴

### 내 보관함 (PersonalFilesView)
- **위치**: `src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx`
- **기능**: 파일/폴더 우클릭 시 새 폴더 만들기, 이름 변경, 삭제 등
- **동작**: 전역 차단과 별개로, 해당 컴포넌트 내에서 `e.preventDefault()` + 커스텀 메뉴 표시

### 엑셀 정제 도구 (ExcelRefiner)
- **위치**: `src/components/ContractViews/components/ExcelRefiner.tsx`
- **기능**: 매칭된 상품 셀 우클릭 시 상품 관련 메뉴 표시

## 향후 고려사항

1. **텍스트 복사가 필요한 영역**
   - 에러 메시지, 문서 요약 등에서 복사 기능 필요 시
   - → "복사" 버튼 UI 제공 권장

2. **커스텀 컨텍스트 메뉴 확장**
   - 필요 시 다른 화면에도 커스텀 컨텍스트 메뉴 추가 가능
   - PersonalFilesView 패턴 참고

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-11 | 최초 구현 - 전역 컨텍스트 메뉴 비활성화 |
