# 검색어 위치 기능 (Keyword Location Feature)

> 문서 검색에서 키워드가 실제로 어디에 위치하는지 확인하는 기능

## 개요

키워드 검색 결과에서 해당 검색어가 문서 내 어느 위치에 있는지 하이라이트된 텍스트 스니펫으로 보여주는 기능입니다.

- **적용 범위**: 키워드 검색 전용 (AI 검색에서는 미지원)
- **구현 위치**:
  - `DocumentSearchView.tsx` - 문서 검색 페이지
  - `DocumentContentSearchModal.tsx` - 간편 문서 검색 모달

---

## 동작 방식

### 1. 텍스트 스니펫 추출 (`getTextSnippet`)

```
전체 텍스트에서 키워드 주변 컨텍스트만 추출

┌─────────────────────────────────────────────────────────────────┐
│                        전체 full_text                           │
│  ...앞부분 텍스트... [키워드] ...뒷부분 텍스트...                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                    getTextSnippet()
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  ...키워드 앞 100자... [키워드] ...키워드 뒤 200자...             │
│                       (약 300자 스니펫)                          │
└─────────────────────────────────────────────────────────────────┘
```

**추출 기준:**
- **기준점**: 첫 번째 키워드가 등장하는 위치
- **앞쪽**: 키워드 앞 100자
- **뒤쪽**: 키워드 뒤 200자
- **총 길이**: 약 300자 + 키워드 길이

**알고리즘:**
```typescript
const getTextSnippet = (item: SearchResultItem): string => {
  const fullText = item.ocr?.full_text || item.meta?.full_text || ''

  // 키워드 목록 (공백으로 분리)
  const keywords = query.trim().split(/\s+/).filter(k => k.length > 0)

  // 첫 번째 키워드 위치 찾기
  const idx = fullText.toLowerCase().indexOf(keywords[0].toLowerCase())

  if (idx === -1) return fullText.substring(0, 300) + '...'

  // 앞뒤 컨텍스트 추출
  const start = Math.max(0, idx - 100)
  const end = Math.min(fullText.length, idx + keyword.length + 200)

  let snippet = fullText.substring(start, end)

  // 생략 표시 추가
  if (start > 0) snippet = '...' + snippet
  if (end < fullText.length) snippet = snippet + '...'

  return snippet
}
```

### 2. 키워드 하이라이트 (`highlightKeywords`)

추출된 스니펫에서 모든 검색어를 `<mark>` 태그로 감싸 하이라이트 처리합니다.

```
입력: "...보험 계약자 홍길동의 보험 증권..."
검색어: "보험"

출력: "...<mark>보험</mark> 계약자 홍길동의 <mark>보험</mark> 증권..."
```

**특징:**
- 대소문자 구분 없이 매칭
- 여러 키워드 동시 하이라이트 (OR 조건)
- 정규식 특수문자 이스케이프 처리

---

## 텍스트 소스

검색 결과 아이템에서 full_text를 다음 순서로 탐색:

```typescript
const fullText = (item as any).ocr?.full_text ||      // 1순위: OCR 추출 텍스트
                 (item as any).meta?.full_text ||      // 2순위: 메타데이터 텍스트
                 (item as any).text?.full_text ||      // 3순위: 텍스트 필드
                 ''                                     // 없으면 빈 문자열
```

---

## 제한사항

| 제한 | 설명 |
|------|------|
| 첫 번째 위치만 | 여러 키워드가 있어도 첫 번째 키워드의 첫 등장 위치만 기준 |
| 단일 스니펫 | 문서 내 여러 위치에 키워드가 있어도 하나의 스니펫만 표시 |
| 고정 범위 | 앞 100자, 뒤 200자로 고정 (가변적이지 않음) |
| AI 검색 미지원 | 시맨틱 검색은 키워드 매칭이 아니므로 미지원 |

---

## UI 구성

### 문서 검색 페이지 (`DocumentSearchView`)

```
액션 버튼 영역:
┌─────┬─────┬─────┬─────┬─────┐
│ 상세 │ 요약 │ 전체 │ 검색어│ 연결 │  ← 키워드 검색 시에만 표시
│ 보기 │ 보기 │텍스트│ 위치 │     │
└─────┴─────┴─────┴─────┴─────┘
                    ↑
              오렌지색 돋보기 아이콘
```

### 검색어 위치 모달

```
┌──────────────────────────────────────────┐
│ 🔍 검색어 위치                      [X]  │
├──────────────────────────────────────────┤
│ 파일명.pdf          검색어: 보험         │
├──────────────────────────────────────────┤
│                                          │
│ ...앞부분 텍스트 [보험] 계약자 홍길동의  │
│ [보험] 증권 번호는 1234-5678입니다...    │
│                                          │
│        ↑ 노란색 하이라이트               │
└──────────────────────────────────────────┘
```

---

## 스타일

### 하이라이트 스타일 (`.doc-search-highlight`)

**라이트 테마:**
```css
background: #fef08a;  /* 밝은 노란색 */
color: #1a1a1a;       /* 거의 검정 */
padding: 2px 4px;
border-radius: 3px;
font-weight: 600;
box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.3);
```

**다크 테마:**
```css
background: #facc15;  /* 더 진한 노란색 */
color: #0a0a0a;       /* 검정 */
box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.5),
            0 0 8px rgba(250, 204, 21, 0.3);  /* 글로우 효과 */
```

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `DocumentSearchView.tsx` | 문서 검색 페이지 (getTextSnippet, highlightKeywords) |
| `DocumentSearchView.css` | 모달 및 하이라이트 스타일 |
| `DocumentContentSearchModal.tsx` | 간편 문서 검색 모달 (동일 로직) |
| `DocumentContentSearchModal.css` | 간편 검색 하이라이트 스타일 |

---

## 향후 개선 가능 사항

1. **다중 스니펫**: 키워드가 여러 위치에 있으면 각각 스니펫 표시
2. **가변 범위**: 문장/단락 단위로 컨텍스트 추출
3. **네비게이션**: "다음 위치" / "이전 위치" 버튼
4. **전체 텍스트 내 위치 표시**: 스크롤 가능한 전체 텍스트에서 하이라이트 위치로 이동

---

*최종 업데이트: 2025-12-10*
