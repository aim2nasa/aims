# User Profile Menu 기능 명세

## 📋 개요

YouTube 스타일의 사용자 프로필 메뉴를 Apple 디자인 철학으로 재해석한 AIMS 프로필 메뉴

**참고 디자인**: YouTube, Google, Daum 메일
**디자인 철학**: Apple HIG (Human Interface Guidelines)
**핵심 원칙**: Progressive Disclosure, Clarity, Deference

---

## 🎯 핵심 기능

### Phase 1: 기본 구조 (완료)
- ✅ 사용자 프로필 아바타 (우측 상단)
- ✅ 드롭다운 메뉴 (Portal 기반)
- ✅ 사용자 정보 헤더
- ✅ 기본 메뉴 아이템 (계정 설정, 로그아웃)

### Phase 2: YouTube 스타일 메뉴 확장 (진행 중)

#### 2.1 사용자 정보 섹션
```
┌─────────────────────────────┐
│  [아바타]  사용자 이름       │
│            이메일 주소       │
│                              │
│  [ 내 채널 보기 ]  ──────────┤ ← Phase 3
└─────────────────────────────┘
```

#### 2.2 메뉴 아이템 구성

**그룹 1: 계정 관리**
- 🔄 계정 전환 (Switch account) - 개발자 모드에서만 표시
- ⚙️ 계정 설정 (Account settings)

**그룹 2: 설정**
- 🎨 테마: 라이트/다크 모드 전환
- 🌍 언어: 한국어/English (Phase 3)

**그룹 3: 기타**
- ❓ 도움말 (Phase 3)
- 💬 의견 보내기 (Phase 3)

**그룹 4: 시스템**
- 🚪 로그아웃

---

## 🎨 디자인 스펙

### 메뉴 크기
- **너비**: 280px - 320px
- **최대 높이**: 600px (스크롤 가능)

### 레이아웃
```
┌────────────────────────────┐
│ [사용자 정보 헤더]          │ ← 고정
├────────────────────────────┤
│ 📋 메뉴 그룹 1             │
├────────────────────────────┤
│ 📋 메뉴 그룹 2             │
├────────────────────────────┤
│ 📋 메뉴 그룹 3             │
├────────────────────────────┤
│ 🚪 로그아웃 (위험 액션)    │
└────────────────────────────┘
```

### 색상 시스템 (CSS 변수)
- 배경: `var(--color-bg-primary)`
- 호버: `var(--color-bg-hover)`
- 텍스트: `var(--color-text-primary)`
- 위험 액션: `var(--color-danger)`
- 구분선: `var(--color-border)`

### 애니메이션
- **진입**: Fade in + Scale up (0.95 → 1.0)
- **지속시간**: `var(--duration-normal)` (300ms)
- **이징**: `var(--easing-ease-out)`

---

## 🔧 기술 스펙

### 컴포넌트 구조
```
UserProfileMenu/
├── UserProfileMenu.tsx         # 메인 컨테이너
├── UserProfileMenu.css
├── UserProfileHeader.tsx       # 사용자 정보
├── UserProfileHeader.css
├── UserProfileMenuItem.tsx     # 메뉴 아이템
├── UserProfileMenuItem.css
├── UserProfileDivider.tsx      # 구분선
└── index.ts                    # Export
```

### Props 인터페이스
```typescript
interface UserProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  anchorElement: HTMLElement | null;
}
```

### 상태 관리
- **메뉴 열림/닫힘**: `useState<boolean>`
- **사용자 정보**: `useUserStore()` (Zustand)
- **테마**: `useThemeStore()` (Zustand)
- **개발자 모드**: `useDevModeStore()` (Zustand)

---

## ♿ 접근성 (WCAG 2.1 AA)

### 키보드 네비게이션
- `Tab` / `Shift+Tab`: 메뉴 아이템 간 이동
- `Enter` / `Space`: 아이템 선택
- `Escape`: 메뉴 닫기
- `Arrow Up/Down`: 메뉴 아이템 탐색 (Phase 3)

### ARIA 속성
```html
<div role="menu" aria-label="사용자 프로필 메뉴">
  <div role="banner">사용자 정보</div>
  <button role="menuitem">계정 설정</button>
  <div role="separator">구분선</div>
  <button role="menuitem">로그아웃</button>
</div>
```

### 포커스 관리
- 메뉴 열릴 때: 첫 번째 아이템에 포커스
- 메뉴 닫힐 때: 트리거 버튼에 포커스 복귀
- 포커스 트랩: 메뉴 내부에서만 Tab 이동

---

## 📱 반응형

### Desktop (> 768px)
- 메뉴 너비: 320px
- 아이콘 크기: 16px (SFSymbol CALLOUT)

### Tablet/Mobile (≤ 768px)
- 메뉴 너비: 280px
- 최대 너비: `calc(100vw - 32px)`
- 아이콘 크기: 동일 (16px)

---

## 🧪 테스트 시나리오

### 기능 테스트
- [x] 아바타 클릭 시 메뉴 열림
- [x] 외부 클릭 시 메뉴 닫힘
- [x] ESC 키로 메뉴 닫힘
- [ ] 테마 토글 동작
- [ ] 계정 전환 동작 (개발자 모드)
- [ ] 로그아웃 확인 다이얼로그

### 접근성 테스트
- [x] 키보드만으로 모든 기능 접근 가능
- [x] 스크린 리더 호환성
- [ ] 포커스 트랩 동작
- [ ] 고대비 모드 지원

### 반응형 테스트
- [ ] Desktop: 메뉴 위치 및 크기
- [ ] Tablet: 메뉴 위치 및 크기
- [ ] Mobile: 메뉴 위치 및 크기

---

## 📦 Phase별 구현 계획

### Phase 1: 기본 구조 ✅
- 사용자 정보 헤더
- 계정 설정 메뉴
- 로그아웃 메뉴
- Portal 기반 렌더링

### Phase 2: YouTube 스타일 확장 🔄
- 테마 토글 메뉴 아이템 추가
- 계정 전환 메뉴 아이템 (개발자 모드)
- 구분선으로 그룹 분리
- 아이콘 개선 (SF Symbols)

### Phase 3: 고급 기능 📋
- 프로필 편집 모달
- 언어 선택 메뉴
- 도움말 링크
- 의견 보내기 기능
- Arrow 키 네비게이션

---

## 🚀 성능 최적화

### React 최적화
- `memo()`: 불필요한 리렌더링 방지
- Portal: 격리된 렌더링
- Lazy loading: 메뉴 열릴 때만 렌더링

### CSS 최적화
- `will-change: transform, opacity`
- GPU 가속: `transform: translateZ(0)`
- Backdrop filter: 블러 효과 (선택적)

---

## 📝 참고 자료

- [Apple HIG - Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- [YouTube 디자인 시스템](https://www.youtube.com)
- [WCAG 2.1 Menu Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu/)

---

## 📅 업데이트 로그

- **2025-11-01**: Phase 1 완료, Phase 2 시작
- **2025-11-01**: 기능 명세 문서 작성
