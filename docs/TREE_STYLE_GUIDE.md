# 트리 UI 스타일 가이드

## ✅ 최종 선택: Style 8 - Windows 11 Fluent Design (WINNER!)

### 현재 적용 상태
- **파일**:
  - `CustomerRelationshipView.css`
  - `RegionalTreeView.css`
- **스타일**: Windows 11 Fluent Design System
- **적용일**: 2025-11-02

### 핵심 특징

1. **Acrylic 배경 효과**
   - 서브틀한 그라데이션 배경
   - Light: `linear-gradient(to bottom, rgba(0, 0, 0, 0.01), rgba(0, 0, 0, 0.03))`
   - Dark: `linear-gradient(to bottom, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.04))`

2. **3px 액센트 바**
   - 호버 시 왼쪽에 3px 파란색 세로 바 표시 (opacity: 0.3)
   - 선택된 항목은 opacity: 1
   - 부드러운 라운드 코너 (4px 0 0 4px)

3. **미세한 그림자와 레이어**
   - 버튼: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`
   - 호버: `box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)`
   - 배지: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`

4. **Cubic-bezier 애니메이션**
   - `transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1)`
   - 버튼 클릭 시 `transform: scale(0.95)`
   - 부드럽고 반응성 좋은 인터랙션

5. **Segoe UI 폰트 느낌**
   - 라벨: 13px, weight: 400
   - 배지: 11px, weight: 600, border-radius: 12px
   - Letter-spacing: -0.01em

6. **Windows 11 스크롤바**
   - Width: 12px
   - Border-radius: 6px
   - Border: 3px solid transparent
   - Background-clip: content-box

### CSS 변수

```css
.regional-tree-view,
.customer-relationship-view {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;

  /* Light Theme */
  --color-border: rgba(0, 0, 0, 0.08);
  --color-text-primary: rgba(0, 0, 0, 0.9);
  --color-text-secondary: rgba(0, 0, 0, 0.6);
  --color-hover-bg: rgba(0, 0, 0, 0.04);
  --color-pressed-bg: rgba(0, 0, 0, 0.06);
  --color-accent: #0078d4;
  --color-accent-light: rgba(0, 120, 212, 0.1);
}

html[data-theme="dark"] .regional-tree-view,
html[data-theme="dark"] .customer-relationship-view {
  /* Dark Theme */
  --color-border: rgba(255, 255, 255, 0.1);
  --color-text-primary: rgba(255, 255, 255, 0.9);
  --color-text-secondary: rgba(255, 255, 255, 0.6);
  --color-hover-bg: rgba(255, 255, 255, 0.05);
  --color-pressed-bg: rgba(255, 255, 255, 0.08);
  --color-accent: #60cdff;
  --color-accent-light: rgba(96, 205, 255, 0.15);
}
```

### 주요 스타일 패턴

#### 트리 노드
```css
.tree-node {
  padding: 6px 10px;
  border-radius: 4px;
  gap: 10px;
  position: relative;
}

.tree-node::before {
  content: '';
  position: absolute;
  left: 0;
  width: 3px;
  background: var(--color-accent);
  opacity: 0;
  transition: opacity 0.1s ease;
  border-radius: 4px 0 0 4px;
}

.tree-node:hover::before {
  opacity: 0.3;
}
```

#### 고객 아이템 (중요: 들여쓰기 적용!)
```css
.tree-customer-item {
  padding: 6px 10px;
  padding-left: 30px; /* ← 폴더 내 항목 들여쓰기 */
  border-radius: 4px;
}
```

#### 배지
```css
.tree-node-badge {
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

### 중요한 버그 픽스

1. **지도 높이 제약 문제 해결**
   ```css
   .regional-tree-view {
     height: 100%;
     display: flex;
     flex-direction: column;
   }

   .regional-tree-content {
     flex: 1;
     min-height: 0; /* ← 중요! */
   }
   ```

2. **고객 항목 들여쓰기 문제 해결**
   ```css
   .tree-customer-item {
     padding-left: 30px; /* ← 폴더보다 더 들여쓰기 */
   }
   ```

### 테스트된 다른 후보들 (삭제됨)

| 번호 | 스타일 | 평가 |
|------|--------|------|
| 1 | iOS Files (Ultra Minimal) | 너무 심플함 |
| 2 | Notion Block | 카드 기반, 무거움 |
| 3 | Linear Gradient | 보라-핑크 그라데이션 |
| 4 | Arc Neon | **"WAY TOO MUCH!"** - 너무 강렬함 |
| 5 | Ultra Minimal (Muji) | 아이콘 너무 안 보임 (opacity 0.3) |
| 6 | Balanced Minimal | 아이콘 개선 (opacity 0.6) |
| 7 | macOS Finder | 부드러운 스타일 |
| 8 | **Windows 11 Fluent** | ✅ **최종 선택!** |

### 디자인 철학

> "Windows 11 Fluent Design System의 핵심은 **Acrylic 배경**, **미세한 그림자**, **레이어드 디자인**입니다. 사용자는 요소를 명확하게 인식하면서도 과하지 않은 우아함을 느낄 수 있습니다."

- ✅ 명확한 시각적 피드백 (3px 액센트 바)
- ✅ 부드러운 애니메이션 (cubic-bezier)
- ✅ 일관된 디자인 시스템 (CSS 변수)
- ✅ Light/Dark 테마 완벽 지원
- ✅ 접근성 고려 (충분한 대비, 명확한 호버 상태)

### 유지보수 가이드

1. **색상 수정 시**
   - CSS 변수만 수정하면 전체 테마 변경 가능
   - `--color-accent` 변경 시 모든 강조 요소 일괄 변경

2. **간격 조정 시**
   - `--spacing-*` 변수 활용
   - 일관성 유지

3. **애니메이션 조정 시**
   - `cubic-bezier(0.4, 0, 0.2, 1)` 유지 권장
   - Duration은 0.1s~0.2s 범위 권장

4. **새 요소 추가 시**
   - 기존 패턴 따라 `::before` 액센트 바 적용
   - 호버 시 `background-color: var(--color-hover-bg)` 사용
   - 박스 그림자는 최소한으로

### 참고 자료

- [Windows 11 Fluent Design](https://fluent2.microsoft.design/)
- [Acrylic Material](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)
