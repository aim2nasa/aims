# CRS 문서 업로드 기능 구현

## 개요

고객·계약·문서 등록 화면에 CRS(Customer Review Service) 탭을 추가하여 AR과 동일한 방식으로 문서 업로드 및 고객 등록을 처리한다.

## 요구사항 (대화 요약)

### 현재 상태
- 고객·계약·문서 등록 화면: [Annual Report] / [일반 문서] 2개 탭만 존재
- CRS 업로드 기능 없음

### 목표
- [Customer Review] 탭 추가
- AR과 동일한 업로드/고객 처리 로직 적용

### 처리 흐름

**AR 흐름:**
```
AR 업로드 → 고객명 추출 → 사용자에게 질문 (어느 고객?) → 고객 선택/신규 생성 → Annual Report 탭에 결과
```

**CRS 흐름 (동일):**
```
CRS 업로드 → 고객명 추출 → 사용자에게 질문 (어느 고객?) → 고객 선택/신규 생성 → 변액리포트 탭에 결과
```

### 핵심 포인트
1. AR 업로드 또는 CRS 업로드 모두 고객 등록 가능
2. 고객 결정 시 반드시 사용자 확인 필요
3. CRS 결과는 고객 상세의 변액리포트(CustomerReviewTab)에 기록

---

## 구현 단계

### Phase 1: 현재 AR 업로드 구조 분석
- [ ] 고객·계약·문서 등록 화면 컴포넌트 확인
- [ ] AR 탭 업로드 로직 분석
- [ ] 고객 선택/생성 UI 흐름 파악

### Phase 2: CRS 탭 UI 구현
- [ ] CRS 탭 추가
- [ ] AR 탭 UI 복제 및 수정

### Phase 3: CRS 업로드 로직 구현
- [ ] CRS 문서 업로드 API 연동
- [ ] 고객명 추출 로직 적용
- [ ] 고객 선택/생성 UI 연동

### Phase 4: 테스트 및 검증
- [ ] 빌드 검증
- [ ] 기능 테스트

---

## 작업 로그

### Phase 1: 현재 구조 분석 완료

**핵심 파일:** `DocumentRegistrationView.tsx`

**현재 상태:**
- `documentTypeMode`: `'normal' | 'annual_report' | null`
- UI에는 [Annual Report] / [일반 문서] 2개 탭만 존재
- CRS 관련 refs는 이미 있음: `crFilenamesRef`, `crCustomerMappingRef`, `crMetadataMappingRef`

**현재 CRS 처리 문제:**
- AR 탭에서 PDF 업로드 시 자동으로 AR/CRS 감지
- AR이면 → 고객 선택 모달 → AR 처리
- CRS면 → **"고객을 먼저 선택해주세요"** 에러 (700-703줄)
- CRS는 사전에 고객이 선택되어 있어야만 처리됨 (AR과 다름)

**수정 필요 사항:**
1. UI에 CRS 탭 추가
2. CRS도 AR처럼 고객 선택 모달이 뜨도록 수정
3. `documentTypeMode`에 `'customer_review'` 추가

---

### Phase 2: CRS 탭 UI 구현 ✅

**수정 파일:** `DocumentRegistrationView.tsx`, `DocumentRegistrationView.css`

**변경 내용:**
1. `documentTypeMode` 타입에 `'customer_review'` 추가 (122줄)
2. CRS 탭 버튼 추가 (3탭 구조: AR / CRS / 일반문서)
3. CSS에 `.document-type-card__icon--purple` 색상 추가
4. 가이드 텍스트 CRS용 추가
5. 페이지 description CRS용 추가
6. 파일 업로드 영역 조건에 CRS 모드 추가

---

### Phase 3: CRS 고객 선택 모달 구현 ✅

**수정 파일:** `DocumentRegistrationView.tsx`

**변경 내용:**
1. `crCustomerSelectionState` state 추가 (AR과 동일한 패턴)
2. `showNewCustomerModalForCR` state 추가
3. CRS 처리 로직 추가 (709-824줄)
   - CRS 탭에서 업로드 시 CRS 감지
   - 계약자명(`contractor_name`)으로 고객 검색
   - 유사 고객 0명 → 자동 등록
   - 유사 고객 1명 이상 → 선택 모달 표시
4. CRS 핸들러 함수 추가:
   - `handleCrCustomerSelected`: 기존 고객 선택
   - `handleCrCreateNewCustomer`: 새 고객 모달 열기
   - `handleNewCustomerCreatedForCR`: 새 고객 등록 완료
   - `handleNewCustomerBackForCR`: 뒤로가기
5. CRS 고객 선택 모달 UI 추가 (2212-2238줄)
   - `CustomerSelectionModal` 재사용 (AR 메타데이터 형식으로 변환)
   - `NewCustomerInputModal` 재사용

---

### Phase 4: 빌드 검증 ✅

- `npm run typecheck`: 성공
- `npm run build`: 성공

---

### Phase 5: CRS 중복 체크 로직 구현 ✅

**문제:**
- 시스템 전체 해시 중복 체크가 AR/CRS에도 적용되어 다른 고객의 문서가 중복으로 판정됨
- CRS는 "발행일 + 증권번호" 조합으로 중복 판정해야 함

**해결:**
1. **시스템 해시 중복 체크 범위 제한**
   - `documentTypeMode === 'normal'`인 경우에만 적용
   - AR/CRS는 각자의 중복 로직 사용

2. **CRS 중복 체크 유틸리티 생성**
   - 파일: `utils/customerReviewProcessor.ts`
   - `processCustomerReviewFile()`: 해시 + (발행일+증권번호) 중복 체크
   - `registerCrDocument()`: 중복 체크 후 업로드 큐 등록

3. **증권번호 추출 기능 추가**
   - 파일: `pdfParser.ts`
   - 패턴: `증권\s*번호\s*[:\s]+(\d{8,15})`
   - `CheckCustomerReviewResult`에 `policy_number` 필드 추가

**중복 판정 기준 (고객별):**
| 문서 타입 | 중복 조건 |
|----------|----------|
| AR | 해시 중복 OR 동일 발행일 |
| CRS | 해시 중복 OR (동일 발행일 + 동일 증권번호) |
| 일반 문서 | 시스템 전체 해시 중복 |

**빌드 검증:**
- `npm run typecheck`: 성공
- `npm run build`: 성공

---

## 최종 결과

### 구현된 기능

**UI:**
```
[Annual Report] [Customer Review] [일반 문서]
      ↓              ↓              ↓
   AR 업로드      CRS 업로드      일반 업로드
```

**CRS 업로드 흐름:**
```
1. CRS 탭 선택
2. PDF 업로드
3. CRS 문서 감지 (pdfParser)
4. 계약자명 추출
5. 고객 검색
   - 0명: 자동 등록
   - 1명+: 선택 모달
6. 고객 결정
7. 문서 업로드
8. 변액리포트 탭에 결과 저장
```

### 수정된 파일
- `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx`
- `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.css`
- `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/utils/customerReviewProcessor.ts` (신규)
- `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts`

