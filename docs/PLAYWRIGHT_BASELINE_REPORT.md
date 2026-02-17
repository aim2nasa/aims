# CSS 리팩토링 - Playwright Baseline 캡처 작업 (완료)

## 작업 목표
CSS 리팩토링 전 모든 페이지 + 모달의 시각적 baseline 스크린샷 캡처

## 최종 상태: 완료 (커밋 c7a7790b)

### 최종 결과
| 항목 | 값 |
|------|-----|
| 테스트 수 | 28개 (+ 1 setup = 29) |
| 통과 | **29/29 passed** |
| 실행 시간 | **9.2분** (테스트당 ~20초) |
| 커밋 | `c7a7790b` (36 files, +573 -139) |

### 완료된 작업
1. ✅ 로그인 메커니즘 분석 (실제 단축키: Ctrl+Shift+E, API: /api/dev/ensure-user)
2. ✅ `/api/dev/ensure-user`에 email 파라미터 지원 추가 (곽승철 계정)
3. ✅ auth.ts 리팩토링 (API 직접 호출 + localStorage 토큰 주입)
4. ✅ 백엔드 배포 완료
5. ✅ storageState 속도 개선 (테스트당 1.6분 → 20초, 5.6배 개선)
6. ✅ 모달 캡처 테스트 추가 (9개)
7. ✅ 셀렉터 버그 수정 (.customer-item, .modal-backdrop)
8. ✅ 뷰 전환 경합 해결 (addInitScript 방식)
9. ✅ 전체 28개 baseline + 비교 모드 모두 통과
10. ✅ docs/css-refactor-progress.md 업데이트
11. ✅ 커밋 완료

### 해결한 기술적 이슈 (3건)

#### 1. Playwright 로그인 불가
- **문제**: Ctrl+Shift+E 키보드 단축키가 Playwright에서 동작 안 함
- **해결**: `/api/dev/ensure-user` API 직접 호출 + localStorage 토큰 주입
- **파일**: `tests/fixtures/auth.ts`, `backend/api/aims_api/routes/users-routes.js`

#### 2. 테스트 속도 (28분 → 9분)
- **문제**: 매 테스트마다 로그인 반복 (테스트당 1.6분)
- **해결**: storageState 패턴 (1회 로그인 → 전체 재사용)
- **파일**: `tests/auth.setup.ts`, `playwright.config.ts`

#### 3. 뷰 전환 경합 (가장 까다로운 이슈)
- **문제**: `?view=customers-all` URL 파라미터가 작동하지 않음
- **근본 원인**: storageState의 `aims_active_document_view: 'customers'`가 React useState 초기값으로 먼저 적용 → useEffect의 URL 파라미터 처리와 activeDocumentView 변경 effect가 경합
- **증상**: 모든 뷰가 '고객 관리' 대시보드로 렌더링됨
- **해결**: `page.addInitScript()`로 React 초기화 전에 localStorage 직접 설정
- **파일**: `tests/visual/css-refactor-regression.spec.ts`

### 수정/생성된 파일 (8개 소스 + 28개 스냅샷)
| 파일 | 변경 |
|------|------|
| `backend/api/aims_api/routes/users-routes.js` | email 파라미터 추가 |
| `frontend/aims-uix3/tests/fixtures/auth.ts` | API 방식 로그인 |
| `frontend/aims-uix3/tests/auth.setup.ts` | storageState 설정 (NEW) |
| `frontend/aims-uix3/tests/visual/css-refactor-regression.spec.ts` | 28개 테스트 (NEW) |
| `frontend/aims-uix3/playwright.config.ts` | storageState 프로젝트 구조 |
| `frontend/aims-uix3/.gitignore` | tests/.auth/ 추가 |
| `docs/css-refactor-progress.md` | 진행 기록 업데이트 |
| `frontend/aims-uix3/tests/__snapshots__/visual/` | 28개 baseline PNG (NEW) |

### 테스트 구성 (28개)
| # | 범주 | 내용 |
|---|------|------|
| 01-13 | 페이지 | 전체고객, 지역별, 관계별, 문서등록, 문서보기, 탐색기, 문서검색, 계약, 고객일괄, 문서일괄, 계정설정, FAQ, 공지 |
| 14 | 페이지 | 고객 상세 RightPane (고객 클릭 필요) |
| 15-16 | 컴포넌트 | LeftPane 메뉴, Header 영역 |
| 17-19 | 다크모드 | 전체고객, 전체문서, 전체계약 |
| 20-21 | 모달 | 고객 정보 수정, 가족 관계 추가 |
| 22-26 | 도움말 모달 | 지역별, 관계별, 계약, 문서등록, 문서일괄 |
| 27-28 | 다크 모달 | 고객 수정(dark), 지역별 도움말(dark) |

### 다음 단계
- **Phase 0**: CSS lint 스크립트 도입
- **사용법**: `npx playwright test tests/visual/css-refactor-regression.spec.ts` (비교 실행)
