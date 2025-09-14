# Aims-uix3 · Claude Code 지침  
## aims-uix3 · React + Vite 지침 (엔터프라이즈급 프론트엔드)

> rev: 2025-09-14.1 (문서 버전 관리용, 파일명에는 버전 미표시)  
> 목적: aims-uix1/2의 시행착오를 반영해 **재사용성/테스트/확장성** 중심으로, Claude Code가 스스로 설계·구현·리팩토링을 일관되게 수행하도록 하는 **마스터 지침**.

---

$1- **명명**: 본 프로젝트는 **React(런타임)** + **Vite(툴체인)** 기반으로 문서 전반에 명시한다. $2PR 품질 체크 통과(타입·린트·테스트·빌드·E2E 스모크), 스토리북 문서, 접근성·성능 기준 충족, 변경기록.

---

## 1. 목표와 비기능 요구

1. **재사용성**: 디자인 토큰·기초 UI·복합 UI 계층화. 동일 패턴은 한 번만.
2. **테스트 용이성**: 훅/유틸 단위테스트, 컴포넌트 상호작용 테스트, 핵심 유저흐름 E2E.
3. **확장성**: 기능 단위 폴더, API/상태/라우팅의 경계 명확화. 코드스플리팅.
4. **성능**: 초기로드 TTI 목표, 번들 예산, 이미지/리스트 최적화.
5. **접근성(a11y)**: 키보드 내비게이션, 명확 대비, 스크린리더 친화.
6. **보안**: XSS·CSP, 비밀키 취급, 의존성 감사.

---

## 2. 프로젝트 스캐폴드(표준)

```bash
# Vite + React + TS
npm create vite@latest aims-uix3 -- --template react-ts
cd aims-uix3

npm i @tanstack/react-query zod zustand react-router-dom
npm i -D vitest @testing-library/react @testing-library/user-event jsdom   eslint prettier husky lint-staged playwright @playwright/test   typescript vite-tsconfig-paths @types/node @testing-library/jest-dom

# 스토리북(Optional)
npx storybook@latest init --builder @storybook/builder-vite
```

`tsconfig.json`에 경로 별칭:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/app/*": ["src/app/*"],
      "@/shared/*": ["src/shared/*"],
      "@/entities/*": ["src/entities/*"],
      "@/features/*": ["src/features/*"],
      "@/widgets/*": ["src/widgets/*"],
      "@/pages/*": ["src/pages/*"]
    }
  }
}
```

---

## 3. 폴더 구조(Feature-Sliced 기반)

```text
src/
  app/
    router.tsx
    queryClient.ts
  shared/
    design/
      tokens.css
      theme.css
    ui/
    lib/
    config/
    hooks/
  entities/
    customer/
      model.ts
      api.ts
      index.ts
  features/
    customer-search/
      ui/CustomerSearchBox.tsx
      model/useCustomerSearch.ts
  widgets/
  pages/
    customers/
      index.tsx
  index.css
  main.tsx
```

---

## 4. UI 안정성 계약(UIC)
- 버전 주석 유지 (`@since`, `@deprecated`)  
- 조합 우선 (컴포지션, render props)  
- 토큰 강제 (HEX/px 금지)  
- 접근성 계약 (Radix 수준 키보드/ARIA)  
- 외부 UI는 `shared/ui` 래퍼 경유  
- 테마는 토큰 레벨에서만 변경  
- Storybook에 변경 전/후 스토리 + 마이그레이션 노트  

---

## 5. CSS 전략
- ESLint로 `style=` 금지  
- 색상은 `var(--color-*)` 또는 Tailwind theme  
- 계층: 전역 → 컴포넌트 → 페이지 오버라이드 최소화  

---

## 6. 상태 관리 구획
- 로컬 상태: useState  
- 서버 상태: TanStack Query  
- 글로벌 파생상태: Zustand  

---

## 7. 데이터 계약 & 검증(Zod)
API 응답은 Zod로 파싱 후 사용.  

---

## 8. API 클라이언트
Fetch 래퍼로 타임아웃/에러 표준화.  

---

## 9. 라우팅 & 코드스플리팅
lazy() 로딩 + Suspense + Skeleton.  

---

## 10. 오류 처리 & UX 상태
ErrorBoundary, `<Empty/> <Loading/> <ErrorView/>`.  

---

## 11. 테스트 전략
Unit(Vitest), Component(RTL), E2E(Playwright).  

---

## 12. 성능 예산 & 측정
JS <180KB gzip, LCP<2.5s, CLS<0.1, TBT<200ms.  

---

## 13. 접근성 & 국제화
role/aria, 대비≥4.5:1, i18n 키 기반.  

---

## 14. 보안
CSP, dangerouslySetInnerHTML 금지, 민감정보 금지.  

---

## 15. 로깅·모니터링
Sentry, Web Vitals 수집.  

---

## 16. CI/CD 품질 게이트
PR마다 타입/린트/테스트/빌드/E2E.  
비주얼 회귀: Playwright 스냅샷, 차이율>0.1% 차단.  

---

## 17. Git/PR/리뷰 규칙
작은 커밋, 한국어 메시지.  
UI 리뷰: 토큰/접근성/반응형/포커스/대비/상태/shadcn 직접 import 금지.  

---

## 18. 문서화·스토리북
모든 컴포넌트 Storybook, ADR 기록.  

---

## 19. 피처 플래그
점진 노출, 롤백 가능.  

---

## 20. 마이그레이션
인벤토리 → UI 정리 → 폴더 재배치 → Zod → Query/Zustand → 라우팅 → 테스트 → CI → Storybook → 성능/a11y.  

---

## 21~23. Claude Code 프롬프트
시스템 프롬프트 / 작업 프롬프트 / 리뷰 프롬프트.  

---

## 24. 갭 채우기 절차
src_tree, deps, depcheck, colors, 업로드, 지침 갱신.  

---

## 25. 체크리스트
요약 항목.  

---

## 26. 부록
예시 코드 (cfg.ts, api.ts, hook, router, ErrorBoundary).  

---

## 27. 레이아웃 시스템 v2
12-column Grid, max 1200px, breakpoints sm~2xl, spacing 4px 배수, motion 150/250/400ms.  

---

## 27.1 기본 화면 디자인 구조
AppShell(Header/Sidebar/Main/Footer).  
레이아웃 지침: Grid/Flex, 모바일 Drawer.  
템플릿: 대시보드/폼/목록+상세.  
상태: Skeleton, Empty, ErrorView.  
미학: 여백16px, 타이포 일관, 모션 150–250ms.  

---

## 28. UX 측정·실험
이벤트 표준, Web Vitals, A/B 플래그.  

---

## 29. 금지 목록
임의 색상/px, 인라인 스타일, 전용 테마, props 폭증, 접근성 위배, 스피너만.  

---

## 30. 체크리스트 (UI 확장 안정성)
[ ] 새 컴포넌트: 토큰/접근성/스토리/테스트  
[ ] 변경: 마이그레이션 노트  
[ ] 레이아웃 점검  
[ ] 성능/측정 확인  
[ ] PR 리뷰 통과  
