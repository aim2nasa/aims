# 🎯 AIMS 프로젝트 최적 테스트 전략

## 📊 현재 상태 분석

### 전체 테스트 현황
- **프론트엔드**: 2,332개 테스트 (87개 파일)
- **백엔드 Node.js**: 42개 테스트 (3개 파일)
- **Python 모듈**: 40개 테스트 (10개 파일)
- **총**: 2,414개 테스트

### 최근 완료 작업
- ✅ UI 컴포넌트 126개 테스트 추가 (ConfirmationDialog, FormField, LoadingSkeleton)
- ✅ Python 모듈 40개 테스트 추가 (docmeta, shared utils)

---

## 🔴 테스트 부족 영역 분석

### 우선순위 1: 커버리지 0% (41개 영역)

#### 모달 컴포넌트 (4개)
- AddressSearchModal (294줄)
- AddressArchiveModal (133줄)
- AnnualReportModal (421줄)
- CustomerRelationshipModal (438줄)

#### 뷰 컴포넌트 (4개)
- AllCustomersView (647줄)
- CustomerDetailView (450줄)
- CustomerRegistrationView (154줄)
- CustomerEditModal (288줄)

#### Document Status 컴포넌트 (4개)
- DocumentStatusStats (145줄)
- DocumentStatusTable (305줄)
- DocumentStatusControls (119줄)
- FullTextModal (194줄)

#### Viewer 컴포넌트 (3개)
- PDFViewer (291줄)
- ImageViewer (242줄)
- DownloadOnlyViewer (90줄)

#### 탭 & 섹션 (6개)
- AnnualReportTab (576줄)
- BasicInfoTab (165줄)
- DocumentsTab (364줄)
- RelationshipsTab (261줄)
- AddressSection (135줄)
- BasicInfoSection (141줄)

#### 기타 컴포넌트 (3개)
- Tabs (108줄)
- NaverMap (877줄)
- ThemeToggle (59줄)

### 우선순위 2: 낮은 커버리지 (<10%)

#### 핵심 비즈니스 로직
- **uploadService** - 12.91% (419줄) ⚠️ 최우선
- **pdfParser** - 3.52% (139줄) ⚠️ 최우선
- **fileHash** - 5.55% (45줄) ⚠️ 최우선
- AnnualReportApi - 6.3% (532줄)
- addressApi - 0% (81줄)

#### UI 컴포넌트
- FileList - 2.64% (438줄)
- ProgressIndicator - 6.61% (170줄)

### 우선순위 3: 중간 커버리지 (<50%)

#### 자주 사용되는 Hooks
- **usePersistedState** - 41.81% (95줄) ⚠️ 추천
- **useDynamicType** - 72.69% (222줄) ⚠️ 추천
- **useHapticFeedback** - 78.26% (292줄) ⚠️ 추천

#### 모달 컴포넌트
- DocumentLinkModal - 45.36%
- DocumentSummaryModal - 33.49%
- DocumentDetailModal - 65.89%
- FullTextModal - 36.54%

#### 기타
- Tooltip - 51.04%
- FileListSection - 40.33%

---

## ✅ 최적안: "핵심 비즈니스 로직 + 자주 사용되는 Hooks"

### 📋 선정 이유

1. **ROI (투자 대비 효과) 최고**
   - 적은 시간 투자로 큰 안정성 확보
   - 버그 발생 시 영향도가 큰 영역

2. **유지보수성 향상**
   - 리팩토링 시 안전망 제공
   - 회귀 테스트 자동화

3. **실용적 범위**
   - 2-3시간 내 완료 가능
   - 60-80개 테스트 추가 목표

---

## 🎯 구체적 테스트 대상

### Phase 1: 핵심 비즈니스 로직 (우선순위 최상)

#### 1. uploadService.ts (12.91% → 80%+)
**위치**: `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/uploadService.ts`

**현재 상태**:
- 419줄 중 87%가 미테스트
- 파일 업로드 핵심 로직

**추가할 테스트 (25-30개)**:
```
✓ 파일 검증
  - 파일 크기 제한 체크
  - MIME 타입 검증
  - 파일명 검증
  - 중복 파일 감지

✓ 청크 업로드 로직
  - 청크 크기 계산
  - 청크 순서 보장
  - 병렬 업로드 제어
  - 부분 업로드 재개

✓ 업로드 재시도 메커니즘
  - 네트워크 오류 재시도
  - 타임아웃 처리
  - 최대 재시도 횟수
  - 지수 백오프

✓ 에러 처리
  - 네트워크 에러
  - 서버 에러 (4xx, 5xx)
  - 용량 초과
  - 권한 오류

✓ 진행률 계산
  - 전체 진행률
  - 개별 파일 진행률
  - 속도 계산

✓ 취소 기능
  - 업로드 중단
  - 리소스 정리
  - 부분 업로드 삭제
```

**예상 작업 시간**: 30분

---

#### 2. pdfParser.ts (3.52% → 70%+)
**위치**: `frontend/aims-uix3/src/features/customer/utils/pdfParser.ts`

**현재 상태**:
- 139줄 중 96%가 미테스트
- PDF 파싱 핵심 로직

**추가할 테스트 (15-20개)**:
```
✓ PDF 메타데이터 추출
  - 제목, 작성자, 생성일
  - 페이지 수
  - PDF 버전
  - 파일 크기

✓ 텍스트 추출
  - 일반 텍스트 추출 성공
  - 한글 텍스트 추출
  - 특수문자 처리
  - 빈 페이지 처리

✓ 에러 처리
  - 손상된 PDF
  - 암호화된 PDF
  - 읽기 권한 없는 PDF
  - 형식 오류

✓ 대용량 처리
  - 100페이지 이상
  - 50MB 이상
  - 메모리 관리
  - 타임아웃 처리

✓ 특수 케이스
  - 스캔 PDF (이미지 기반)
  - 폼 필드 포함
  - 주석 포함
  - 북마크 처리
```

**예상 작업 시간**: 30분

---

#### 3. fileHash.ts (5.55% → 80%+)
**위치**: `frontend/aims-uix3/src/features/customer/utils/fileHash.ts`

**현재 상태**:
- 45줄 중 94%가 미테스트
- 파일 중복 검사 핵심

**추가할 테스트 (8-10개)**:
```
✓ SHA-256 해시 계산
  - 작은 파일 (<1MB)
  - 중간 파일 (1-10MB)
  - 대용량 파일 (>10MB)
  - 빈 파일

✓ 중복 파일 감지
  - 완전 동일 파일
  - 파일명만 다른 경우
  - 확장자만 다른 경우

✓ 성능 테스트
  - 해시 계산 속도
  - 메모리 사용량
  - 병렬 처리

✓ 에러 처리
  - 파일 읽기 실패
  - 권한 오류
  - 메모리 부족
```

**예상 작업 시간**: 20분

---

### Phase 2: 자주 사용되는 Hooks (실용성 최고)

#### 4. usePersistedState.ts (41.81% → 85%+)
**위치**: `frontend/aims-uix3/src/hooks/usePersistedState.ts`

**현재 상태**:
- 95줄 중 58%가 미테스트
- localStorage 기반 영구 저장 상태 관리

**추가할 테스트 (12-15개)**:
```
✓ 기본 기능
  - 초기값 설정
  - 상태 업데이트
  - 상태 읽기
  - 상태 삭제

✓ localStorage 연동
  - 저장 성공
  - 불러오기 성공
  - key 충돌 방지
  - 네임스페이스

✓ 직렬화
  - 원시 타입 (string, number, boolean)
  - 객체 직렬화
  - 배열 직렬화
  - null/undefined 처리

✓ 에러 처리
  - localStorage 비활성화
  - 저장 공간 부족
  - JSON 파싱 실패
  - 권한 오류

✓ 동시성
  - 여러 컴포넌트 동시 사용
  - 탭 간 동기화
  - 경쟁 조건 방지

✓ 타입 안정성
  - TypeScript 타입 체크
  - 잘못된 타입 복원
  - 스키마 버전 관리
```

**예상 작업 시간**: 30분

---

#### 5. useDynamicType.js (72.69% → 90%+)
**위치**: `frontend/aims-uix3/src/hooks/useDynamicType.js`

**현재 상태**:
- 222줄 중 27%가 미테스트
- 동적 폰트 크기 조정 (접근성)

**추가할 테스트 (8-10개)**:
```
✓ 폰트 크기 계산
  - 기본 크기
  - 확대 비율 적용
  - 최소/최대 제한
  - 단위 변환 (px, rem, em)

✓ 시스템 설정 반영
  - 시스템 폰트 크기 감지
  - 변경 사항 감지
  - 기본값 적용

✓ 반응형 크기 조정
  - 화면 크기별 조정
  - breakpoint 처리
  - 동적 업데이트

✓ 접근성
  - 200% 확대 지원
  - 텍스트 가독성 유지
  - 레이아웃 깨짐 방지
```

**예상 작업 시간**: 20분

---

#### 6. useHapticFeedback.js (78.26% → 92%+)
**위치**: `frontend/aims-uix3/src/hooks/useHapticFeedback.js`

**현재 상태**:
- 292줄 중 22%가 미테스트
- 햅틱 피드백 (UX 핵심)

**추가할 테스트 (6-8개)**:
```
✓ 햅틱 타입별 실행
  - LIGHT (가벼운 탭)
  - MEDIUM (일반 탭)
  - HEAVY (강한 탭)
  - SUCCESS (성공)
  - WARNING (경고)
  - ERROR (오류)

✓ 지원 여부 감지
  - Vibration API 지원
  - iOS 햅틱 지원
  - Android 햅틱 지원
  - 폴백 처리

✓ 설정 관리
  - 햅틱 활성화/비활성화
  - 사용자 설정 저장
  - 시스템 설정 존중

✓ 에러 처리
  - API 호출 실패
  - 권한 오류
  - 타임아웃
```

**예상 작업 시간**: 20분

---

## 📊 예상 성과

### 투자
- **작업 시간**: 2-3시간
- **추가 테스트**: 60-80개

### 효과
- ✅ 핵심 비즈니스 로직 안정성 확보 (파일 처리 파이프라인)
- ✅ 사용자 경험 핵심 기능 검증 (hooks)
- ✅ 전체 프론트엔드 테스트: 2,332개 → **2,392-2,412개** (+2.6%)
- ✅ 고위험 영역 커버리지 대폭 향상
- ✅ 리팩토링 안전망 구축
- ✅ 회귀 테스트 자동화

### ROI 분석
| 영역 | 코드 줄 수 | 위험도 | 테스트 추가 | 시간 | ROI |
|------|-----------|--------|------------|------|-----|
| uploadService | 419 | 🔴 매우 높음 | 25-30 | 30분 | ⭐⭐⭐⭐⭐ |
| pdfParser | 139 | 🔴 매우 높음 | 15-20 | 30분 | ⭐⭐⭐⭐⭐ |
| fileHash | 45 | 🟡 높음 | 8-10 | 20분 | ⭐⭐⭐⭐ |
| usePersistedState | 95 | 🟡 높음 | 12-15 | 30분 | ⭐⭐⭐⭐ |
| useDynamicType | 222 | 🟢 중간 | 8-10 | 20분 | ⭐⭐⭐ |
| useHapticFeedback | 292 | 🟢 중간 | 6-8 | 20분 | ⭐⭐⭐ |

---

## 🚫 포함하지 않는 이유

### 모달 컴포넌트 (AddressSearchModal, AnnualReportModal 등)
**포함하지 않음**:
- ❌ 복잡도 매우 높음 (각 300-400줄)
- ❌ 외부 의존성 많음 (주소 API, 네이버 지도)
- ❌ 테스트 작성 시간 대비 효과 낮음
- ✅ E2E 테스트가 더 적합

### View 컴포넌트 (AllCustomersView, CustomerDetailView 등)
**포함하지 않음**:
- ❌ 너무 큰 범위 (500-600줄)
- ❌ 통합 테스트 성격 강함
- ❌ 자주 변경되어 유지보수 부담
- ✅ E2E 테스트가 더 적합

### Viewer 컴포넌트 (PDFViewer, ImageViewer, NaverMap)
**포함하지 않음**:
- ❌ 외부 라이브러리 의존성 높음
- ❌ 렌더링 테스트 복잡
- ❌ 실제 파일 필요
- ✅ 통합 테스트가 더 적합

### Document Status 컴포넌트 (Stats, Table, Controls)
**포함하지 않음**:
- ❌ UI 중심 컴포넌트
- ❌ 백엔드 의존성 높음
- ❌ 자주 변경되는 UI
- ✅ 스냅샷 테스트나 E2E가 더 적합

---

## 🎯 실행 계획

### 1단계: uploadService 테스트 (30분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/__tests__/uploadService.test.ts

# 테스트 내용
- 파일 검증 (크기, 타입, 중복)
- 청크 업로드 로직
- 업로드 재시도 메커니즘
- 에러 처리 (네트워크, 서버)
- 진행률 계산
- 취소 기능
```

### 2단계: pdfParser 테스트 (30분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/features/customer/utils/__tests__/pdfParser.test.ts

# 테스트 내용
- PDF 메타데이터 추출
- 텍스트 추출 (성공/실패)
- 손상된 PDF 처리
- 암호화된 PDF 처리
- 대용량 PDF 처리
- 한글 PDF 처리
```

### 3단계: fileHash 테스트 (20분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/features/customer/utils/__tests__/fileHash.test.ts

# 테스트 내용
- SHA-256 해시 계산
- 대용량 파일 처리
- 중복 파일 감지
- 에러 처리
```

### 4단계: usePersistedState 테스트 (30분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/hooks/__tests__/usePersistedState.test.ts

# 테스트 내용
- 초기값 설정
- localStorage 읽기/쓰기
- JSON 직렬화/역직렬화
- 저장 실패 시 폴백
- 여러 컴포넌트 동시 사용
- 타입 안정성
```

### 5단계: useDynamicType 테스트 (20분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/hooks/__tests__/useDynamicType.test.ts

# 테스트 내용
- 폰트 크기 계산
- 시스템 설정 반영
- 반응형 크기 조정
- 최소/최대 크기 제한
```

### 6단계: useHapticFeedback 테스트 (20분)
```bash
# 테스트 파일 생성
frontend/aims-uix3/src/hooks/__tests__/useHapticFeedback.test.ts

# 테스트 내용
- 햅틱 타입별 실행
- 지원 여부 감지
- 에러 처리
- 설정 토글
```

**총 예상 시간**: 2.5시간

---

## 💡 대안: 단계적 접근

시간이 부족하다면 **Phase 1만 먼저** 진행:

### Phase 1만 진행 (추천 최소)
- uploadService + pdfParser + fileHash
- **약 50개 테스트, 1.5시간**
- 파일 처리 파이프라인의 핵심 안정성 확보
- 즉각적인 비즈니스 가치 제공

### Phase 1 + Phase 2 (완전 추천)
- 위 6개 모두
- **약 70개 테스트, 2.5시간**
- 핵심 로직 + 자주 사용되는 hooks
- 최대 ROI

---

## 📈 장기 전략

### 다음 단계 (이후 작업)
1. **FileList & ProgressIndicator** (UI 컴포넌트)
   - 문서 등록의 핵심 UI
   - 40-50개 테스트, 1.5시간

2. **Tooltip 완성** (51% → 90%)
   - 앱 전반에 사용되는 공통 컴포넌트
   - 15-20개 테스트, 40분

3. **DocumentLinkModal 개선** (45% → 80%)
   - 문서 연결 핵심 기능
   - 20-25개 테스트, 1시간

### E2E 테스트로 전환 (권장)
다음 영역은 E2E 테스트로 커버:
- 모달 컴포넌트 (사용자 플로우 테스트)
- 전체 View 컴포넌트 (통합 시나리오)
- Viewer 컴포넌트 (실제 파일 렌더링)
- NaverMap (지도 인터랙션)

---

## ✅ 체크리스트

완료 시 확인:
- [ ] uploadService 테스트 25-30개 추가
- [ ] pdfParser 테스트 15-20개 추가
- [ ] fileHash 테스트 8-10개 추가
- [ ] usePersistedState 테스트 12-15개 추가
- [ ] useDynamicType 테스트 8-10개 추가
- [ ] useHapticFeedback 테스트 6-8개 추가
- [ ] 모든 테스트 통과 확인
- [ ] 커버리지 목표 달성 확인
- [ ] 커밋 및 문서화

---

## 📝 결론

이 전략은:
- ✅ **실용적**: 2-3시간 내 완료 가능
- ✅ **효과적**: 고위험 영역 집중 공략
- ✅ **유지보수**: 지속적인 가치 제공
- ✅ **확장 가능**: 단계적 개선 가능

**권장 사항**: Phase 1부터 시작하여 점진적으로 확장하는 것을 추천합니다.
