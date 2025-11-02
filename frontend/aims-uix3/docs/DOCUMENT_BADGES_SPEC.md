# 문서 뱃지 시스템 명세서

## 📋 개요

AIMS UIX3의 문서 아이콘에 표시되는 뱃지 시스템 규칙을 정의합니다.

## 🎯 뱃지 종류

### 1. AR 뱃지 (Annual Report)

**표시 조건:**
- `document.is_annual_report === true`인 문서

**표시 위치:**
- 아이콘 하단 **중앙**

**스타일:**
- 텍스트: `AR`
- 색상: 파란색 (Primary)
  - Light 모드: `var(--color-primary-500)` (#3b82f6)
  - Dark 모드: `var(--color-primary-400)` (#60a5fa)
- 크기: `font-size: 7px`
- 배치: `left: 50%; transform: translateX(-50%);`

**의미:**
- 연간 보고서(Annual Report) 문서임을 표시
- 고객과 자동으로 연결되는 특수 문서

---

### 2. OCR 뱃지 (OCR Processing)

**표시 조건:**
- OCR 처리가 완료된 문서
- `document.ocr?.confidence` 또는 `document.stages?.ocr?.message`에서 신뢰도 추출 가능

**표시 위치:**
- 아이콘 하단 **왼쪽**

**스타일:**
- 텍스트: `OCR`
- 색상: **신뢰도에 따라 5단계**
- 크기: `font-size: 7px`
- 배치: `left: -2px; bottom: -2px;`

**신뢰도별 색상:**

| 신뢰도 범위 | 색상 | 레벨 | Light 색상 | Dark 색상 |
|------------|------|------|-----------|-----------|
| ≥ 95% | 🟢 Green | excellent | #22c55e | #16a34a |
| ≥ 85% | 🟢 Green | high | #22c55e | #16a34a |
| ≥ 70% | 🟡 Yellow | medium | #eab308 | #ca8a04 |
| ≥ 50% | 🟠 Orange | low | #f97316 | #ea580c |
| < 50% | 🔴 Red | very-low | #ef4444 | #dc2626 |

**의미:**
- OCR(광학 문자 인식) 처리가 완료된 문서
- 색상으로 OCR 신뢰도를 즉시 파악 가능
- 높은 신뢰도 = 텍스트 추출 품질이 높음

---

## 🔧 구현 세부사항

### 데이터 소스

#### AR 뱃지
```typescript
// 조건 체크
if (document.is_annual_report) {
  // AR 뱃지 표시
}
```

#### OCR 뱃지
```typescript
// 방법 1: 검색 API (document.ocr?.confidence)
const confidence = parseFloat(document.ocr?.confidence)

// 방법 2: 리스트 API (document.stages?.ocr?.message 파싱)
// 예: "OCR 완료 (신뢰도: 0.9817)"
const match = document.stages?.ocr?.message.match(/신뢰도:\s*([\d.]+)/)
const confidence = parseFloat(match[1])

// 신뢰도 레벨 계산
function getOcrConfidenceLevel(confidence: number) {
  if (confidence >= 0.95) return { color: 'excellent', label: '매우 높음' }
  if (confidence >= 0.85) return { color: 'high', label: '높음' }
  if (confidence >= 0.70) return { color: 'medium', label: '보통' }
  if (confidence >= 0.50) return { color: 'low', label: '낮음' }
  return { color: 'very-low', label: '매우 낮음' }
}
```

### CSS 구조

#### 아이콘 래퍼 (필수)
```css
.document-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

#### AR 뱃지
```css
.document-ar-badge {
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 7px;
  font-weight: 700;
  /* ... 기타 스타일 */
}
```

#### OCR 뱃지
```css
.document-ocr-badge {
  position: absolute;
  bottom: -2px;
  left: -2px;
  font-size: 7px;
  font-weight: 700;
  /* ... 기타 스타일 */
}

/* 신뢰도별 색상 */
.document-ocr-badge.ocr-excellent { background-color: #22c55e; }
.document-ocr-badge.ocr-high { background-color: #22c55e; }
.document-ocr-badge.ocr-medium { background-color: #eab308; }
.document-ocr-badge.ocr-low { background-color: #f97316; }
.document-ocr-badge.ocr-very-low { background-color: #ef4444; }
```

---

## 📍 적용 위치

### 1. 문서 라이브러리 (DocumentLibraryView)
- 컴포넌트: `DocumentStatusList.tsx`
- CSS: `DocumentStatusList.css`

### 2. 문서 검색 (DocumentSearchView)
- 컴포넌트: `DocumentSearchView.tsx`
- CSS: `DocumentSearchView.css`

---

## 🎨 시각적 배치

```
┌────────────────────┐
│                    │
│   📄 아이콘        │
│                    │
└────────────────────┘
      OCR      AR
      (왼쪽)   (중앙)
```

**예시:**
- **AR 문서만**: 중앙에 파란색 AR 뱃지
- **OCR 문서만**: 왼쪽에 신뢰도별 색상 OCR 뱃지
- **AR + OCR 문서**: 왼쪽에 OCR, 중앙에 AR (둘 다 표시)

---

## 🔍 툴팁

### AR 뱃지
```tsx
<Tooltip content="Annual Report">
  <div className="document-ar-badge">AR</div>
</Tooltip>
```

### OCR 뱃지
```tsx
<Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
  <div className={`document-ocr-badge ocr-${level.color}`}>OCR</div>
</Tooltip>
```

예시 툴팁:
- `OCR 신뢰도: 98.2% (매우 높음)`
- `OCR 신뢰도: 73.4% (보통)`

---

## ⚡ 인터랙션

### 호버 효과
```css
/* AR 뱃지 */
.status-item:hover .document-ar-badge,
.search-result-row:hover .document-ar-badge {
  transform: translateX(-50%) scale(1.1);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
}

/* OCR 뱃지 */
.status-item:hover .document-ocr-badge,
.search-result-row:hover .document-ocr-badge {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5); /* 색상은 신뢰도별 */
}
```

---

## 📐 디자인 원칙

1. **최소 크기**: `font-size: 7px` (아이콘을 가리지 않도록)
2. **절대 위치**: `position: absolute`로 아이콘 밖으로 배치
3. **중앙 정렬**: AR은 `left: 50%` + `translateX(-50%)`
4. **일관성**: 모든 뱃지의 크기, 패딩, border-radius 통일
5. **접근성**: 툴팁으로 상세 정보 제공

---

## 🚀 체크리스트

뱃지 구현 시 확인 사항:

- [ ] `.document-icon-wrapper`가 24x24px 고정 크기
- [ ] AR 뱃지가 중앙 정렬 (`left: 50%`, `translateX(-50%)`)
- [ ] OCR 뱃지가 왼쪽 정렬 (`left: -2px`)
- [ ] 두 뱃지 모두 `font-size: 7px`
- [ ] 호버 시 `transform` 조합 정확 (AR: `translateX(-50%) scale(1.1)`)
- [ ] 신뢰도별 5단계 색상 정확히 적용
- [ ] Light/Dark 테마 모두 지원
- [ ] 툴팁 표시 확인
- [ ] AR과 OCR 뱃지 동시 표시 가능

---

## 📚 관련 파일

### 컴포넌트
- `src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.tsx`
- `src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx`

### 스타일
- `src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.css`
- `src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css`

### 유틸리티
- `src/services/SearchService.ts` - `getOCRConfidence()`

---

## 🔄 업데이트 이력

- **2025.11.02**: 초기 문서 작성
  - AR 뱃지 중앙 정렬
  - OCR 뱃지 신뢰도별 5단계 색상
  - 두 뱃지 크기 통일 (7px)
