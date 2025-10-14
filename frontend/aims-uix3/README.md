# AIMS UIX3 - React + TypeScript + Vite

AIMS (Agent Intelligent Management System) UIX3는 보험 설계사를 위한 지능형 문서 관리 시스템의 프론트엔드입니다.

## 기술 스택

- **React 18** + **TypeScript** - 타입 안전성과 개발 생산성
- **Vite** - 빠른 개발 서버와 최적화된 빌드
- **Tailwind CSS** - 유틸리티 기반 스타일링
- **Ant Design** - 엔터프라이즈급 UI 컴포넌트
- **Playwright** - E2E 테스트 자동화

## 빠른 시작

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build

# 타입 체크
npm run typecheck

# E2E 테스트 실행
npm run test:e2e

# 메뉴 아이콘 색상 회귀 테스트
npx playwright test menu-icon-colors
```

## 개발 지침

### 필수 준수 사항

1. **빌드 무결성 원칙**
   - `npm run build` 실행 시 오류가 발생하지 않아야 합니다
   - 모든 TypeScript 타입 오류를 해결한 후 커밋
   - ESLint 경고를 최소화하고 오류는 반드시 수정
   - 빌드 전 항상 타입 체크 실행: `npm run typecheck`

2. **코드 품질 관리**
   - 커밋 전 반드시 빌드 테스트 수행
   - 미사용 import와 변수 제거
   - 일관된 코딩 스타일 유지

3. **Git 커밋 규칙**
   - 사용자의 명시적 승인 후에만 커밋
   - 작고 집중된 커밋 단위 유지
   - 명확한 커밋 메시지 작성

## 테스트

### E2E 테스트 (Playwright)

```bash
# 모든 E2E 테스트 실행
npx playwright test

# 특정 테스트만 실행
npx playwright test menu-icon-colors

# UI 모드로 실행 (디버깅)
npx playwright test --ui

# 테스트 결과 보고서 보기
npx playwright show-report
```

#### 메뉴 아이콘 색상 회귀 테스트

`tests/menu-icon-colors.spec.ts` - LeftPane 메뉴 아이콘 색상 자동 검증

**테스트 항목:**
- ✅ 고객 관리 섹션 아이콘 색상 (Light/Dark 모드)
- ✅ 문서 관리 섹션 아이콘 색상 (Light/Dark 모드)
- ✅ 메뉴 선택 시 흰색 전환
- ✅ 테마 전환 시 자동 색상 변경
- ✅ 하드코딩 색상 검증

**실행 방법:**
```bash
# 개발 서버 시작 (별도 터미널)
npm run dev

# 테스트 실행 (다른 터미널)
npx playwright test menu-icon-colors
```

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
