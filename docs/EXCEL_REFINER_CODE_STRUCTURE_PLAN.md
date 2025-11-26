# Excel Refiner 코드 구조 개선 계획

## 1. 완료 보고: ContractImportView 포팅

### 1.1 완료된 작업

| 항목 | 상태 | 커밋 |
|------|------|------|
| xlsx 패키지 설치 | ✅ 완료 | `177e7440` |
| types/excel.ts 복사 | ✅ 완료 | `177e7440` |
| utils/excel.ts 복사 | ✅ 완료 | `177e7440` |
| hooks/useValidation.ts 복사 | ✅ 완료 | `177e7440` |
| ExcelRefiner.tsx 생성 | ✅ 완료 | `177e7440` |
| ProductSearchModal.tsx 생성 | ✅ 완료 | `177e7440` |
| ExcelRefiner.css 생성 | ✅ 완료 | `177e7440` |
| ProductSearchModal.css 생성 | ✅ 완료 | `177e7440` |
| tokens.css 색상 변수 추가 | ✅ 완료 | `177e7440` |
| theme.css 테마 변수 추가 | ✅ 완료 | `177e7440` |
| ContractImportView 통합 | ✅ 완료 | `177e7440` |
| CLAUDE.md 준수 검증 | ✅ 통과 | - |

### 1.2 CLAUDE.md 준수 검증 결과

- ✅ CSS 하드코딩 금지: 모든 색상 CSS 변수 사용
- ✅ !important 금지: 사용 없음
- ✅ CSS 변수 중앙 정의: tokens.css/theme.css에서 정의
- ✅ 커밋 메시지 한글: 준수

### 1.3 생성된 파일 (12개, +2,872줄)

```
aims-uix3/src/components/ContractViews/
├── ContractImportView.tsx          # 수정: ExcelRefiner 통합
├── components/
│   ├── ExcelRefiner.tsx            # 신규: 메인 컴포넌트 (1,139줄)
│   ├── ExcelRefiner.css            # 신규: 스타일
│   ├── ProductSearchModal.tsx      # 신규: 상품 검색 모달
│   └── ProductSearchModal.css      # 신규: 모달 스타일
├── types/
│   └── excel.ts                    # 신규: 타입 정의
├── utils/
│   └── excel.ts                    # 신규: 엑셀 유틸리티
└── hooks/
    └── useValidation.ts            # 신규: 검증 로직
```

---

## 2. 문제 분석: 코드 중복

### 2.1 현재 구조

```
frontend/
├── excel-refiner/                   # 독립 프로젝트 (원본)
│   └── src/features/excel-refiner/
│       ├── ExcelRefinerView.tsx     ← 중복
│       ├── ProductSearchModal.tsx   ← 중복
│       ├── utils/excel.ts           ← 중복
│       ├── hooks/useValidation.ts   ← 중복
│       └── types/excel.ts           ← 중복
│
└── aims-uix3/                       # 메인 앱 (복사본)
    └── src/components/ContractViews/
        ├── components/ExcelRefiner.tsx
        ├── utils/excel.ts
        ├── hooks/useValidation.ts
        └── types/excel.ts
```

### 2.2 중복 문제점

- 버그 수정 시 양쪽 모두 수정 필요
- 기능 추가 시 동기화 어려움
- 유지보수 비용 증가

---

## 3. 설계 결정: 2중 검증 구조

### 3.1 사용자 요구사항

> "독립형으로 유지하는 목적은 핵심컴포넌트의 동작을 독립적으로 검증하는데 있다.
> 검증된 핵심컴포넌트는 aims-uix3의 부품으로 사용되어 동작하게 한다."

### 3.2 검증 전략

```
[1] 부품 검증 (excel-refiner) ──────────────────────────┐
    └── 핵심 로직 독립 테스트                             │
    └── UI/UX 빠른 이터레이션                             │
    └── 격리된 환경에서 디버깅                            │
                                                        ↓
[2] 통합 검증 (aims-uix3) ─────────────────────────────┐
    └── 전체 시스템과의 연동                              │
    └── 실제 환경 테스트                                  │
    └── aims-uix3 디자인 시스템 적용                      │
```

### 3.3 설계 원칙

| 구분 | 공유 (1곳) | 개별 (2곳) |
|------|-----------|-----------|
| **로직** | utils, hooks, types | - |
| **UI** | - | 각 디자인 시스템에 맞게 |

**핵심**: 로직 수정 → 1곳만 수정 → 양쪽 자동 반영

---

## 4. 개선 계획: Monorepo 공유 패키지

### 4.1 목표 구조

```
frontend/
├── packages/
│   └── excel-refiner-core/          # 공유 로직 (단일 소스)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts             # 공개 API
│           ├── types/excel.ts       # 타입 정의
│           ├── utils/excel.ts       # 파싱/내보내기
│           └── hooks/useValidation.ts # 검증 로직
│
├── excel-refiner/                   # 부품 검증용 (독립형)
│   ├── package.json                 # deps: @aims/excel-refiner-core
│   └── src/
│       └── ExcelRefinerView.tsx     # 자체 UI
│
└── aims-uix3/                       # 통합 검증용
    ├── package.json                 # deps: @aims/excel-refiner-core
    └── src/components/ContractViews/
        ├── components/ExcelRefiner.tsx  # aims-uix3 UI
        └── components/ProductSearchModal.tsx
```

### 4.2 구현 단계

#### Phase 1: 공유 패키지 생성

1. `frontend/packages/excel-refiner-core/` 디렉토리 생성
2. package.json 작성
3. tsconfig.json 작성
4. aims-uix3에서 로직 파일 이동:
   - `types/excel.ts`
   - `utils/excel.ts`
   - `hooks/useValidation.ts`
5. `index.ts` 작성 (공개 API)

#### Phase 2: Workspace 설정

1. `frontend/package.json` 생성 (root)
   ```json
   {
     "private": true,
     "workspaces": [
       "packages/*",
       "excel-refiner",
       "aims-uix3"
     ]
   }
   ```

2. 각 프로젝트 package.json에 의존성 추가
   ```json
   {
     "dependencies": {
       "@aims/excel-refiner-core": "workspace:*"
     }
   }
   ```

#### Phase 3: Import 경로 업데이트

1. **aims-uix3/ExcelRefiner.tsx**
   ```tsx
   // Before
   import { parseExcel, validateColumn } from '../utils/excel'
   import type { SheetData } from '../types/excel'

   // After
   import { parseExcel, validateColumn, type SheetData } from '@aims/excel-refiner-core'
   ```

2. **excel-refiner/ExcelRefinerView.tsx**
   ```tsx
   // Before
   import { parseExcel } from './utils/excel'

   // After
   import { parseExcel } from '@aims/excel-refiner-core'
   ```

#### Phase 4: 중복 파일 제거

1. `aims-uix3/src/components/ContractViews/types/` 삭제
2. `aims-uix3/src/components/ContractViews/utils/` 삭제
3. `aims-uix3/src/components/ContractViews/hooks/` 삭제
4. `excel-refiner/src/features/excel-refiner/types/` 삭제
5. `excel-refiner/src/features/excel-refiner/utils/` 삭제
6. `excel-refiner/src/features/excel-refiner/hooks/` 삭제

#### Phase 5: 검증

1. `npm install` (workspace 설정)
2. `excel-refiner` 빌드 및 테스트
3. `aims-uix3` 빌드 및 테스트
4. 양쪽 모두 정상 동작 확인

### 4.3 공유 패키지 상세

**packages/excel-refiner-core/package.json**
```json
{
  "name": "@aims/excel-refiner-core",
  "version": "1.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

**packages/excel-refiner-core/src/index.ts**
```typescript
// Types
export type {
  CellValue,
  SheetData,
  ValidationResult,
  ProductMatchResult,
  InsuranceProduct
} from './types/excel'

// Utils
export {
  parseExcel,
  exportExcel,
  isValidExcelFile,
  getRefinedFileName,
  cellToString
} from './utils/excel'

// Hooks
export {
  validateColumn,
  validatePolicyNumbers,
  validateCustomerName,
  validateContractDate,
  validateProductNames,
  getValidationType,
  getRowStatus,
  getProblematicRows,
  fetchInsuranceProducts
} from './hooks/useValidation'
```

---

## 5. 예상 결과

### 5.1 코드 변경량

| 영역 | Before | After | 감소 |
|------|--------|-------|------|
| 로직 파일 | 2곳 (중복) | 1곳 (공유) | -533줄 |
| UI 파일 | 2곳 (개별) | 2곳 (개별) | 0 |

### 5.2 유지보수 개선

- ✅ 로직 버그 수정: 1곳만 수정
- ✅ 기능 추가: 1곳만 수정
- ✅ 타입 변경: 1곳만 수정
- ✅ UI는 각 환경에 맞게 개별 유지

### 5.3 테스트 흐름

```
[개발] 공유 패키지 수정
         ↓
[검증1] excel-refiner에서 부품 검증
         ↓
[검증2] aims-uix3에서 통합 검증
         ↓
[배포] 검증 완료 후 배포
```

---

## 6. 작업 체크리스트

- [x] Phase 1: 공유 패키지 생성
  - [x] 디렉토리 구조 생성
  - [x] package.json 작성
  - [x] tsconfig.json 작성
  - [x] 로직 파일 이동
  - [x] index.ts 작성

- [x] Phase 2: Workspace 설정
  - [x] root package.json 생성
  - [x] 각 프로젝트 의존성 추가

- [x] Phase 3: Import 경로 업데이트
  - [x] aims-uix3 import 수정
  - [x] excel-refiner import 수정

- [x] Phase 4: 중복 파일 제거
  - [x] aims-uix3 로직 파일 삭제
  - [x] excel-refiner 로직 파일 삭제

- [x] Phase 5: 검증
  - [x] npm install
  - [x] excel-refiner 빌드/테스트 ✅
  - [x] aims-uix3 빌드/테스트 ✅
  - [ ] CLAUDE.md 준수 확인
  - [ ] 커밋

---

## 7. 구현 완료 보고

### 7.1 생성된 파일

```
frontend/
├── package.json                              # root workspace 설정
└── packages/
    └── excel-refiner-core/                   # 공유 패키지
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts                      # 공개 API
            ├── types/excel.ts                # 타입 정의
            ├── utils/excel.ts                # 엑셀 유틸리티
            └── hooks/useValidation.ts        # 검증 로직
```

### 7.2 삭제된 파일

```
aims-uix3/src/components/ContractViews/
├── types/excel.ts                            # 삭제됨
├── utils/excel.ts                            # 삭제됨
└── hooks/useValidation.ts                    # 삭제됨

excel-refiner/src/features/excel-refiner/
├── types/excel.ts                            # 삭제됨
├── utils/excel.ts                            # 삭제됨
└── hooks/useValidation.ts                    # 삭제됨
```

### 7.3 수정된 파일

| 파일 | 변경 내용 |
|------|---------|
| aims-uix3/package.json | @aims/excel-refiner-core 의존성 추가 |
| excel-refiner/package.json | @aims/excel-refiner-core 의존성 추가 |
| aims-uix3/.../ExcelRefiner.tsx | import 경로를 @aims/excel-refiner-core로 변경 |
| aims-uix3/.../ProductSearchModal.tsx | import 경로를 @aims/excel-refiner-core로 변경 |
| excel-refiner/.../ExcelRefinerView.tsx | import 경로를 @aims/excel-refiner-core로 변경 |
| excel-refiner/.../ProductSearchModal.tsx | import 경로를 @aims/excel-refiner-core로 변경 |

### 7.4 빌드 검증 결과

- ✅ aims-uix3: 빌드 성공 (2.73s)
- ✅ excel-refiner: 빌드 성공 (954ms)

### 7.5 코드 감소 효과

- 중복 제거: 6개 파일 → 공유 패키지 3개 파일
- 로직 유지보수: 2곳 → 1곳 (50% 감소)
