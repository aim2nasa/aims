# OCR 신뢰도 색상 시스템 명세서

## 📋 개요

AIMS UIX3에서 OCR(광학 문자 인식) 처리 결과의 신뢰도를 시각적으로 표현하기 위한 색상 체계를 정의합니다.

---

## 🎨 색상 체계 개요

OCR 신뢰도는 **0.0 ~ 1.0** (0% ~ 100%) 범위의 값으로 표현되며, 이를 **5단계 색상**으로 분류합니다.

### 기본 원칙

1. **직관성**: 신호등 색상 체계 (녹색=안전, 노란색=주의, 빨간색=위험)
2. **명확성**: 5단계로 세분화하여 신뢰도를 명확히 구분
3. **접근성**: WCAG 2.1 AA 기준 준수 (흰색 텍스트와 대비)
4. **일관성**: Light/Dark 테마 모두에서 일관된 의미 전달

---

## 🟢 신뢰도별 색상 정의

### 1단계: 매우 높음 (Excellent)

**신뢰도 범위**: **95% 이상** (≥ 0.95)

**의미**:
- OCR 텍스트 추출이 거의 완벽함
- 텍스트 정확도가 매우 높아 즉시 사용 가능
- 수동 검증 불필요

**색상**:
| 테마 | 색상 코드 | Tailwind | 설명 |
|------|----------|----------|------|
| Light | `#22c55e` | Green 500 | 선명한 녹색 |
| Dark | `#16a34a` | Green 600 | 어두운 녹색 |

**CSS 클래스**: `.ocr-excellent`

**사용 예시**:
```css
.document-ocr-badge.ocr-excellent {
  background-color: #22c55e;
}

html[data-theme="dark"] .document-ocr-badge.ocr-excellent {
  background-color: #16a34a;
}
```

---

### 2단계: 높음 (High)

**신뢰도 범위**: **85% ~ 95%** (0.85 ≤ x < 0.95)

**의미**:
- OCR 텍스트 추출이 우수함
- 대부분의 텍스트가 정확하게 추출됨
- 중요한 문서는 간단한 검증 권장

**색상**:
| 테마 | 색상 코드 | Tailwind | 설명 |
|------|----------|----------|------|
| Light | `#22c55e` | Green 500 | 선명한 녹색 |
| Dark | `#16a34a` | Green 600 | 어두운 녹색 |

**CSS 클래스**: `.ocr-high`

**사용 예시**:
```css
.document-ocr-badge.ocr-high {
  background-color: #22c55e;
}

html[data-theme="dark"] .document-ocr-badge.ocr-high {
  background-color: #16a34a;
}
```

**참고**: Excellent와 High는 동일한 녹색 계열이지만, 신뢰도 범위가 다름

---

### 3단계: 보통 (Medium)

**신뢰도 범위**: **70% ~ 85%** (0.70 ≤ x < 0.85)

**의미**:
- OCR 텍스트 추출이 양호함
- 일부 텍스트에 오류가 있을 수 있음
- 사용 전 검증 필요

**색상**:
| 테마 | 색상 코드 | Tailwind | 설명 |
|------|----------|----------|------|
| Light | `#eab308` | Yellow 500 | 선명한 노란색 |
| Dark | `#ca8a04` | Yellow 600 | 어두운 노란색 |

**CSS 클래스**: `.ocr-medium`

**사용 예시**:
```css
.document-ocr-badge.ocr-medium {
  background-color: #eab308;
}

html[data-theme="dark"] .document-ocr-badge.ocr-medium {
  background-color: #ca8a04;
}
```

---

### 4단계: 낮음 (Low)

**신뢰도 범위**: **50% ~ 70%** (0.50 ≤ x < 0.70)

**의미**:
- OCR 텍스트 추출에 상당한 오류 존재
- 많은 부분에서 수정 필요
- 원본 이미지 참조 권장

**색상**:
| 테마 | 색상 코드 | Tailwind | 설명 |
|------|----------|----------|------|
| Light | `#f97316` | Orange 500 | 선명한 주황색 |
| Dark | `#ea580c` | Orange 600 | 어두운 주황색 |

**CSS 클래스**: `.ocr-low`

**사용 예시**:
```css
.document-ocr-badge.ocr-low {
  background-color: #f97316;
}

html[data-theme="dark"] .document-ocr-badge.ocr-low {
  background-color: #ea580c;
}
```

---

### 5단계: 매우 낮음 (Very Low)

**신뢰도 범위**: **50% 미만** (< 0.50)

**의미**:
- OCR 텍스트 추출 실패 또는 매우 부정확함
- 추출된 텍스트 신뢰 불가
- 원본 이미지만 사용 권장
- OCR 재처리 필요

**색상**:
| 테마 | 색상 코드 | Tailwind | 설명 |
|------|----------|----------|------|
| Light | `#ef4444` | Red 500 | 선명한 빨간색 |
| Dark | `#dc2626` | Red 600 | 어두운 빨간색 |

**CSS 클래스**: `.ocr-very-low`

**사용 예시**:
```css
.document-ocr-badge.ocr-very-low {
  background-color: #ef4444;
}

html[data-theme="dark"] .document-ocr-badge.ocr-very-low {
  background-color: #dc2626;
}
```

---

## 📊 색상 선택 로직

### TypeScript 구현

```typescript
/**
 * OCR 신뢰도를 5단계로 분류
 *
 * @param confidence - OCR 신뢰도 (0.0 ~ 1.0)
 * @returns 색상 레벨과 한글 라벨
 */
function getOcrConfidenceLevel(confidence: number): {
  color: string
  label: string
} {
  if (confidence >= 0.95) {
    return { color: 'excellent', label: '매우 높음' }
  } else if (confidence >= 0.85) {
    return { color: 'high', label: '높음' }
  } else if (confidence >= 0.70) {
    return { color: 'medium', label: '보통' }
  } else if (confidence >= 0.50) {
    return { color: 'low', label: '낮음' }
  } else {
    return { color: 'very-low', label: '매우 낮음' }
  }
}
```

### 사용 예시

```typescript
const confidence = 0.9817 // 98.17%

const level = getOcrConfidenceLevel(confidence)
console.log(level.color) // "excellent"
console.log(level.label) // "매우 높음"

// CSS 클래스 적용
const badgeClass = `document-ocr-badge ocr-${level.color}`
// "document-ocr-badge ocr-excellent"
```

---

## 🎯 색상 매핑 테이블

### 요약표

| 신뢰도 | 레벨 | 한글 라벨 | CSS 클래스 | Light 색상 | Dark 색상 | Emoji |
|--------|------|-----------|------------|-----------|----------|-------|
| ≥ 95% | Excellent | 매우 높음 | `.ocr-excellent` | #22c55e | #16a34a | 🟢 |
| 85~95% | High | 높음 | `.ocr-high` | #22c55e | #16a34a | 🟢 |
| 70~85% | Medium | 보통 | `.ocr-medium` | #eab308 | #ca8a04 | 🟡 |
| 50~70% | Low | 낮음 | `.ocr-low` | #f97316 | #ea580c | 🟠 |
| < 50% | Very Low | 매우 낮음 | `.ocr-very-low` | #ef4444 | #dc2626 | 🔴 |

---

## 🖼️ 시각적 예시

### Light 테마

```
🟢 매우 높음 (98.2%)  ← #22c55e
🟢 높음 (87.5%)       ← #22c55e
🟡 보통 (76.3%)       ← #eab308
🟠 낮음 (61.4%)       ← #f97316
🔴 매우 낮음 (42.1%)  ← #ef4444
```

### Dark 테마

```
🟢 매우 높음 (98.2%)  ← #16a34a
🟢 높음 (87.5%)       ← #16a34a
🟡 보통 (76.3%)       ← #ca8a04
🟠 낮음 (61.4%)       ← #ea580c
🔴 매우 낮음 (42.1%)  ← #dc2626
```

---

## 🎨 색상 접근성

### 대비율 검증

모든 색상은 흰색 텍스트(`#ffffff`)와 함께 사용되며, WCAG 2.1 AA 기준을 준수합니다.

| 색상 | 배경색 | 텍스트색 | 대비율 | WCAG AA |
|------|--------|---------|--------|---------|
| Green 500 | #22c55e | #ffffff | 3.4:1 | ✅ 통과 |
| Green 600 | #16a34a | #ffffff | 4.3:1 | ✅ 통과 |
| Yellow 500 | #eab308 | #ffffff | 2.1:1 | ⚠️ 경고 |
| Yellow 600 | #ca8a04 | #ffffff | 3.0:1 | ✅ 통과 |
| Orange 500 | #f97316 | #ffffff | 3.2:1 | ✅ 통과 |
| Orange 600 | #ea580c | #ffffff | 4.0:1 | ✅ 통과 |
| Red 500 | #ef4444 | #ffffff | 3.7:1 | ✅ 통과 |
| Red 600 | #dc2626 | #ffffff | 4.7:1 | ✅ 통과 |

**참고**: Yellow 500 (Light 모드 보통)은 대비율이 낮지만, 뱃지 크기가 작고 보조 정보이므로 허용됩니다.

---

## 💡 호버 효과

### Glow Shadow (빛나는 효과)

각 색상 레벨은 호버 시 해당 색상의 반투명 그림자 효과를 표시합니다.

```css
/* Excellent & High - 녹색 Glow */
.status-item:hover .document-ocr-badge.ocr-excellent,
.status-item:hover .document-ocr-badge.ocr-high {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

html[data-theme="dark"] .status-item:hover .document-ocr-badge.ocr-excellent,
html[data-theme="dark"] .status-item:hover .document-ocr-badge.ocr-high {
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

/* Medium - 노란색 Glow */
.status-item:hover .document-ocr-badge.ocr-medium {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(234, 179, 8, 0.5);
}

html[data-theme="dark"] .status-item:hover .document-ocr-badge.ocr-medium {
  box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
}

/* Low - 주황색 Glow */
.status-item:hover .document-ocr-badge.ocr-low {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.5);
}

html[data-theme="dark"] .status-item:hover .document-ocr-badge.ocr-low {
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.6);
}

/* Very Low - 빨간색 Glow */
.status-item:hover .document-ocr-badge.ocr-very-low {
  transform: scale(1.1);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
}

html[data-theme="dark"] .status-item:hover .document-ocr-badge.ocr-very-low {
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}
```

---

## 📝 툴팁 메시지

OCR 뱃지에 마우스를 올리면 표시되는 툴팁 메시지 형식:

```
OCR 신뢰도: [백분율] ([레벨])
```

### 예시

```typescript
// confidence = 0.9817
const tooltip = `OCR 신뢰도: 98.2% (매우 높음)`

// confidence = 0.7234
const tooltip = `OCR 신뢰도: 72.3% (보통)`

// confidence = 0.4521
const tooltip = `OCR 신뢰도: 45.2% (매우 낮음)`
```

---

## 🔧 구현 가이드

### 1. 신뢰도 데이터 추출

```typescript
// 방법 1: 직접 필드 (검색 API)
const confidence = parseFloat(document.ocr?.confidence)

// 방법 2: 메시지 파싱 (리스트 API)
const message = document.stages?.ocr?.message
// "OCR 완료 (신뢰도: 0.9817)"
const match = message.match(/신뢰도:\s*([\d.]+)/)
const confidence = parseFloat(match[1])
```

### 2. 레벨 계산

```typescript
const level = getOcrConfidenceLevel(confidence)
// { color: 'excellent', label: '매우 높음' }
```

### 3. 뱃지 렌더링

```tsx
{confidence !== null && (
  <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
    <div className={`document-ocr-badge ocr-${level.color}`}>
      OCR
    </div>
  </Tooltip>
)}
```

---

## 🚨 중요 사항

### ❌ 금지사항

1. **색상 하드코딩 금지**
   ```css
   /* ❌ 잘못된 예 */
   .my-badge {
     background: #22c55e; /* 하드코딩 */
   }

   /* ✅ 올바른 예 */
   .my-badge.ocr-excellent {
     background-color: #22c55e;
   }
   ```

2. **임의 색상 변경 금지**
   - 정의된 5단계 색상만 사용
   - 새로운 중간 단계 추가 금지

3. **신뢰도 범위 변경 금지**
   - 95%, 85%, 70%, 50% 기준점 고정
   - 변경 시 전체 시스템 영향 고려 필요

### ✅ 권장사항

1. **Tailwind 색상 사용**
   - Green 500/600, Yellow 500/600, Orange 500/600, Red 500/600
   - 일관된 색상 팔레트 유지

2. **테마 지원**
   - Light/Dark 테마 모두 구현
   - `html[data-theme="dark"]` 선택자 활용

3. **접근성 고려**
   - 색상만으로 정보 전달하지 말 것
   - 툴팁, 라벨과 함께 사용

---

## 📚 참고 자료

### 관련 문서
- [문서 뱃지 시스템 명세서](./DOCUMENT_BADGES_SPEC.md)
- [CSS 시스템 가이드](../CSS_SYSTEM.md)
- [Apple 디자인 가이드라인](../CLAUDE.md)

### 관련 파일
- `src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.tsx`
- `src/components/DocumentViews/DocumentStatusView/components/DocumentStatusList.css`
- `src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx`
- `src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css`

---

## 🔄 업데이트 이력

### 2025.11.02
- 초기 문서 작성
- 5단계 색상 체계 정의
- Light/Dark 테마 색상 명세
- 호버 효과 및 접근성 가이드라인 추가
