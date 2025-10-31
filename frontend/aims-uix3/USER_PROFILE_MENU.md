# User Profile Menu (사용자 프로필 메뉴)

## 개요

헤더 우측의 사용자 아바타를 클릭하면 표시되는 드롭다운 메뉴입니다.
사용자 계정 관리, 설정, 로그아웃 등의 기능을 제공합니다.

## 위치

- **컴포넌트 경로**: `src/components/Header/`
- **상태 관리**: `src/stores/user.ts`

## 기능 구성

### Phase 1: MVP (최소 기능)

#### 1.1 사용자 정보 표시 ✅
- [x] 사용자 이름
- [x] 사용자 아바타 (이니셜/프로필 이미지)
- [x] 이메일 주소 표시

#### 1.2 로그아웃 🔴
- [ ] 로그아웃 버튼
- [ ] 로그아웃 확인 다이얼로그
- [ ] 세션 종료 처리
- [ ] 로그인 페이지로 리다이렉트

#### 1.3 계정 설정 🔴
- [ ] 프로필 정보 편집
  - [ ] 이름 변경
  - [ ] 이메일 변경
  - [ ] 프로필 사진 업로드
- [ ] 비밀번호 변경

### Phase 2: 확장 기능

#### 2.1 설정 링크
- [ ] 테마 설정 (현재 헤더에 있음 → 링크만)
- [ ] 알림 설정
- [ ] 언어 설정

#### 2.2 빠른 접근
- [ ] 내 대시보드 바로가기
- [ ] 내 담당 고객 목록
- [ ] 최근 활동

#### 2.3 도움말
- [ ] 도움말/지원
- [ ] 키보드 단축키 목록
- [ ] 버전 정보

### Phase 3: 고급 기능

#### 3.1 보안
- [ ] 2단계 인증 (2FA)
- [ ] 활성 세션 관리
- [ ] 로그인 기록

#### 3.2 활동 내역
- [ ] 최근 활동 로그
- [ ] 사용 통계
- [ ] 작업 히스토리

## UI/UX 디자인 원칙

### 애플 디자인 철학 준수

**Progressive Disclosure**
- 기본: 사용자 아바타만 표시
- 호버: 클릭 가능함을 암시 (subtle 효과)
- 클릭: 메뉴 표시

**Clarity (명확성)**
- 메뉴 항목은 명확한 아이콘 + 텍스트
- 계층 구조 명확히 표현
- 위험한 액션(로그아웃)은 분리 표시

**Deference (겸손함)**
- 메뉴는 필요할 때만 표시
- 과도한 장식 없이 깔끔하게
- 콘텐츠가 중심

### 메뉴 구조 (권장)

```
┌─────────────────────────────┐
│ 👤 텍스트 설계사             │
│    tester@example.com       │
├─────────────────────────────┤
│ 📊 내 대시보드               │  ← Phase 2
│ 👥 내 담당 고객              │  ← Phase 2
├─────────────────────────────┤
│ ⚙️  계정 설정                │  ← Phase 1
│ 🔔 알림 설정                 │  ← Phase 2
│ 🌓 테마 (현재: 라이트)       │  ← Phase 2 (링크)
├─────────────────────────────┤
│ 📖 도움말                    │  ← Phase 2
│ ⌨️  키보드 단축키            │  ← Phase 2
├─────────────────────────────┤
│ 🚪 로그아웃                  │  ← Phase 1 (위험 액션)
└─────────────────────────────┘
```

## 컴포넌트 구조

### 추천 구조

```
src/components/Header/
├── HeaderView.tsx              (기존)
├── UserProfileMenu/
│   ├── UserProfileMenu.tsx     (메인 메뉴 컴포넌트)
│   ├── UserProfileMenu.css     (스타일)
│   ├── UserProfileMenuItem.tsx (메뉴 아이템)
│   └── UserProfileHeader.tsx   (사용자 정보 헤더)
```

### Props 인터페이스 (예시)

```typescript
interface UserProfileMenuProps {
  /** 메뉴 열림/닫힘 상태 */
  isOpen: boolean;
  /** 메뉴 닫기 핸들러 */
  onClose: () => void;
  /** 사용자 정보 */
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  /** 로그아웃 핸들러 */
  onLogout: () => void;
  /** 설정 페이지로 이동 핸들러 */
  onSettings: () => void;
}
```

## 기술 스택

### UI 컴포넌트
- **Popover/Dropdown**: 커스텀 구현 (애플 스타일)
- **Portal**: `createPortal` (모달 격리)
- **Animation**: CSS transitions (AIMS 표준)

### 상태 관리
- **User Store**: Zustand (`src/stores/user.ts`)
- **Local State**: React useState (메뉴 open/close)

### 스타일링
- **CSS Variables**: AIMS 디자인 시스템
- **iOS Styling**: 애플 Human Interface Guidelines
- **Dark Mode**: 자동 지원

## 접근성 (Accessibility)

### 필수 구현 사항

- **키보드 네비게이션**
  - `Tab`: 메뉴 항목 간 이동
  - `Enter/Space`: 항목 선택
  - `Escape`: 메뉴 닫기
  - `Arrow Up/Down`: 항목 간 이동

- **ARIA 속성**
  - `role="menu"`
  - `aria-haspopup="true"`
  - `aria-expanded="true/false"`
  - `aria-label`: 명확한 레이블

- **포커스 관리**
  - 메뉴 열림 시 첫 항목에 포커스
  - 메뉴 닫힘 시 트리거 버튼에 포커스 복귀
  - 포커스 트랩 (메뉴 내부에서만 이동)

- **스크린 리더 지원**
  - 메뉴 상태 변경 알림
  - 각 항목의 역할과 상태 명시

## 보안 고려사항

### 로그아웃
- [ ] CSRF 토큰 검증
- [ ] 세션 무효화 (서버 측)
- [ ] 로컬 스토리지 클리어
- [ ] 민감 정보 메모리에서 제거

### 계정 설정
- [ ] 비밀번호 변경 시 재인증 요구
- [ ] 이메일 변경 시 확인 메일 발송
- [ ] 입력값 검증 (클라이언트 + 서버)

## 참고 자료

### 디자인 가이드라인
- [Apple Human Interface Guidelines - Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- [Material Design - Menus](https://material.io/components/menus)
- [WCAG 2.1 - Menu Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu/)

### 실제 구현 예시
- **Google**: 프로필 사진 → 계정 관리
- **Microsoft**: 프로필 → 내 계정
- **Notion**: 프로필 → Settings & members
- **Slack**: 프로필 → Profile & account

## 구현 우선순위

### 🔴 High Priority (Phase 1 - 2주)
1. 로그아웃 기능
2. 기본 계정 설정 (프로필 정보 편집)
3. 메뉴 UI/UX 구현 (애플 스타일)

### 🟡 Medium Priority (Phase 2 - 4주)
4. 빠른 접근 링크 (대시보드, 고객)
5. 테마/알림 설정 링크
6. 도움말/키보드 단축키

### 🟢 Low Priority (Phase 3 - 추후)
7. 보안 설정 (2FA, 세션 관리)
8. 활동 내역 및 통계
9. 고급 개인화 설정

## 테스트 계획

### Unit Tests
- [ ] 메뉴 열기/닫기 동작
- [ ] 키보드 네비게이션
- [ ] 로그아웃 핸들러 호출
- [ ] 접근성 속성 확인

### Integration Tests
- [ ] 사용자 정보 표시 확인
- [ ] 로그아웃 플로우 (E2E)
- [ ] 설정 페이지 이동
- [ ] 다크 모드 전환

### Manual Tests
- [ ] 다양한 화면 크기에서 테스트
- [ ] 스크린 리더로 테스트
- [ ] 키보드 전용 네비게이션 테스트
- [ ] 모바일 터치 인터랙션

## 버전 히스토리

### v0.1.0 (계획)
- 기본 메뉴 UI
- 로그아웃 기능
- 계정 설정 링크

### v0.2.0 (계획)
- 빠른 접근 링크
- 설정 통합
- 도움말 추가

### v1.0.0 (계획)
- 전체 기능 완성
- 보안 기능 추가
- 프로덕션 준비 완료

---

**문서 작성일**: 2025-10-31
**최종 수정일**: 2025-10-31
**작성자**: Claude Code
**버전**: 0.1.0 (Draft)
