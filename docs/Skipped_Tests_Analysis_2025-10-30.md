# AIMS-UIX3 스킵된 테스트 분석 및 해결 방안

**작성일**: 2025-10-30
**테스트 실행 결과**: 2,545개 통과 | 20개 스킵 (총 2,565개)

---

## 📊 요약

| 분류 | 파일 | 테스트 수 | 이유 | 우선순위 |
|------|------|-----------|------|----------|
| PDF 파싱 | pdfParser.test.ts | 11개 | File.arrayBuffer() 모킹 불가 | 낮음 |
| 자동 새로고침 | DocumentLibraryView.auto-refresh.test.tsx | ~5개 | 미구현 기능 | 검토 필요 |
| Offset 초기화 | DocumentLibraryView.offset-reset.test.tsx | ~4개 | 미구현 기능 | 검토 필요 |

---

## 1️⃣ pdfParser.test.ts - 11개 테스트 스킵

### 📍 위치
```
frontend/aims-uix3/src/features/customer/utils/__tests__/pdfParser.test.ts
```

### 🔍 스킵 이유
```typescript
// File.arrayBuffer() 모킹 이슈로 인해 skip
```

**기술적 배경**:
- `File.arrayBuffer()`는 브라우저 Web API
- 테스트 환경(Node.js/Vitest)에서 제대로 모킹하기 어려움
- PDF 파싱은 실제 브라우저 환경이 필요

### 📋 스킵된 테스트 목록

#### Annual Report 판단 (6개)
1. `it.skip('정상적인 Annual Report PDF를 인식해야 함')` (라인 59)
2. `it.skip('필수 키워드가 없으면 Annual Report로 판단하지 않아야 함')` (라인 87)
3. `it.skip('필수 키워드만 있고 선택 키워드가 없으면 Annual Report로 판단하지 않아야 함')` (라인 108)
4. `it.skip('한글 고객명을 올바르게 추출해야 함')` (라인 127)
5. `it.skip('다양한 날짜 형식을 파싱해야 함')` (라인 147)
6. `it.skip('선택 키워드 중 하나만 있어도 인식해야 함')` (라인 175)

#### 메타데이터 추출 (5개)
7. `it.skip('고객명이 없으면 빈 문자열을 반환해야 함')` (라인 280)
8. `it.skip('여러 고객명 패턴 중 첫 번째만 추출해야 함')` (라인 342)
9. `it.skip('2자~4자 한글 이름만 추출해야 함')` (라인 363)
10. `it.skip('공백으로 텍스트를 연결해야 함')` (라인 414)
11. `it.skip('특수문자가 포함된 경우에도 처리해야 함')` (라인 456)

### 💡 해결 방안

#### Option A: 실제 파일로 테스트 (권장 ⭐)
```typescript
import fs from 'fs';
import path from 'path';

it('정상적인 Annual Report PDF를 인식해야 함', async () => {
  // 샘플 PDF를 Buffer로 읽기
  const pdfPath = path.join(__dirname, 'samples', 'annual-report.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);

  // pdfjs-dist는 Buffer를 직접 받을 수 있음
  const result = await parseAnnualReportPDF(pdfBuffer);

  expect(result.isAnnualReport).toBe(true);
  expect(result.customerName).toBe('안영미');
});
```

**필요 작업**:
1. `frontend/aims-uix3/src/features/customer/utils/__tests__/samples/` 디렉토리 생성
2. 테스트용 Annual Report PDF 샘플 파일 추가
3. `parseAnnualReportPDF` 함수가 Buffer를 받도록 수정 (또는 오버로드 추가)

#### Option B: happy-dom 사용
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'happy-dom', // jsdom 대신 사용
    // 또는 특정 파일만
    environmentMatchGlobs: [
      ['**/*.pdf.test.ts', 'happy-dom']
    ]
  }
});
```

#### Option C: 모킹 개선
```typescript
import { vi } from 'vitest';

// File.prototype.arrayBuffer 모킹
global.File.prototype.arrayBuffer = vi.fn().mockResolvedValue(
  new ArrayBuffer(/* PDF 바이너리 */)
);
```

#### Option D: 현재 상태 유지 (당장은 이것 추천)
- 실제 기능은 작동 중
- 텍스트 파싱 로직 테스트는 다른 테스트로 커버됨
- 실사용에 문제 없으면 스킵 유지

### ✅ 검증 체크리스트

실제 기능이 정상 작동하는지 확인:
- [ ] Annual Report PDF 업로드 시 "Annual Report"로 인식되는가?
- [ ] 고객명이 올바르게 추출되는가? (예: "안영미", "김철수")
- [ ] 날짜가 올바르게 파싱되는가? (예: "2025년 1월 5일" → "2025-01-05")
- [ ] 일반 PDF는 Annual Report로 잘못 인식되지 않는가?

→ **모두 정상이면 스킵 유지해도 OK**

---

## 2️⃣ DocumentLibraryView.auto-refresh.test.tsx

### 📍 위치
```
frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/__tests__/
DocumentLibraryView.auto-refresh.test.tsx
```

### 🔍 스킵 이유
```typescript
// DocumentLibraryView가 visible prop 변경 시 loadDocuments를 호출하는 기능이 필요하면
// 컴포넌트에 useEffect를 추가해야 합니다.
describe.skip('DocumentLibraryView - View 전환 시 자동 새로고침 (63d8f28)', () => {
```

**의미**:
- 기능이 **아직 구현되지 않음**
- 테스트를 먼저 작성함 (TDD - Test-Driven Development)
- 필요 시 기능 구현 후 테스트 활성화 예정

### 🎯 기능 설명

**원하는 동작**:
```
사용자가 View를 전환할 때 (예: 고객 A → 고객 B)
→ DocumentLibraryView의 visible prop이 변경됨
→ 자동으로 loadDocuments() 호출
→ 문서 목록 새로고침
```

**현재 동작**:
```
View 전환 시 자동 새로고침 안 됨
→ 사용자가 수동으로 새로고침 버튼 클릭 필요
```

### 💡 해결 방안

#### Option A: 기능 구현 + 테스트 활성화

**1단계**: DocumentLibraryView.tsx에 useEffect 추가
```typescript
// DocumentLibraryView.tsx
import { useEffect } from 'react';

const DocumentLibraryView = ({ visible, ...props }) => {
  useEffect(() => {
    if (visible) {
      // View가 보일 때마다 자동 새로고침
      loadDocuments();
    }
  }, [visible]);

  // ... 나머지 코드
};
```

**2단계**: 테스트 활성화
```typescript
// describe.skip → describe로 변경
describe('DocumentLibraryView - View 전환 시 자동 새로고침', () => {
  // 테스트 실행됨
});
```

#### Option B: 기능 불필요 판단 → 테스트 파일 삭제

**판단 기준**:
- 현재 사용자 경험에 문제가 없다면?
- 수동 새로고침으로 충분하다면?
- 불필요한 자동 새로고침이 오히려 성능 저하를 일으킨다면?

→ **테스트 파일 자체를 삭제하는 것이 더 나은 선택**

### ❓ 결정이 필요한 질문

**Document Library View 전환 시 자동 새로고침이 필요한가?**

```
시나리오 1: 고객 목록에서 고객 A 선택 → 문서 목록 표시
         고객 B 선택 → 자동으로 새 문서 목록 로드?

시나리오 2: AllDocuments View → CustomerRelationship View 전환
         → 자동으로 문서 목록 새로고침?
```

**YES (필요함)**:
- → Option A 실행 (기능 구현 + 테스트 활성화)
- UX 개선에 도움됨
- 사용자가 새로고침 버튼 클릭 불필요

**NO (불필요함)**:
- → Option B 실행 (테스트 파일 삭제)
- 불필요한 코드 제거
- 성능 부담 감소

---

## 3️⃣ DocumentLibraryView.offset-reset.test.tsx

### 📍 위치
```
frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/__tests__/
DocumentLibraryView.offset-reset.test.tsx
```

### 🔍 스킵 이유
```typescript
// DocumentLibraryView가 visible prop 변경 시 offset을 초기화하는 기능이 필요하면
// 컴포넌트에 useEffect를 추가해야 합니다.
describe.skip('DocumentLibraryView - offset 초기화 회귀 테스트', () => {
```

### 🎯 기능 설명

**원하는 동작**:
```
사용자가 View를 전환할 때
→ 페이지네이션 offset을 0으로 초기화
→ 항상 첫 페이지부터 표시
```

**현재 동작**:
```
View 전환 시 이전 offset 유지됨
→ 3페이지를 보다가 다른 View로 전환
→ 돌아오면 여전히 3페이지부터 시작
```

### 💡 해결 방안

#### Option A: 기능 구현 + 테스트 활성화

**1단계**: DocumentLibraryView.tsx에 useEffect 추가
```typescript
const DocumentLibraryView = ({ visible, ...props }) => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (visible) {
      // View가 보일 때마다 offset 초기화
      setOffset(0);
    }
  }, [visible]);

  // ... 나머지 코드
};
```

**2단계**: 테스트 활성화
```typescript
// describe.skip → describe로 변경
describe('DocumentLibraryView - offset 초기화 회귀 테스트', () => {
  // 테스트 실행됨
});
```

#### Option B: 기능 불필요 판단 → 테스트 파일 삭제

**판단 기준**:
- 이전 페이지 위치를 기억하는 것이 오히려 좋은 UX일 수도 있음
- 사용자가 3페이지를 보다가 잠깐 다른 View 갔다 오면?
  - 다시 3페이지부터 보는 것이 편할 수도 있음
  - 처음(1페이지)부터 다시 보는 것이 나을 수도 있음

### ❓ 결정이 필요한 질문

**View 전환 시 페이지 위치를 초기화해야 하는가?**

```
시나리오: 고객 A의 문서 목록 3페이지를 보고 있음
       → 고객 B로 전환
       → 다시 고객 A로 돌아옴
       → 어디서부터 보여줘야 할까?
```

**Option 1 (초기화)**: 1페이지부터 다시 시작
- 장점: 항상 일관된 시작점
- 단점: 이전 위치를 잃어버림

**Option 2 (유지)**: 3페이지부터 계속
- 장점: 이전 작업 위치 기억
- 단점: 혼란스러울 수 있음

---

## 📋 실행 액션 플랜

### 즉시 조치 (우선순위 높음)

#### 1. DocumentLibraryView 테스트 관련 결정
```bash
# 실제 사용 경험 확인
1. Document Library View 전환 시 동작 확인
2. 자동 새로고침이 필요한지 판단
3. offset 초기화가 필요한지 판단
```

**결정 후 조치**:
- **필요함** → 기능 구현 + 테스트 활성화
- **불필요** → 테스트 파일 삭제
  ```bash
  rm frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/__tests__/DocumentLibraryView.auto-refresh.test.tsx
  rm frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/__tests__/DocumentLibraryView.offset-reset.test.tsx
  ```

#### 2. pdfParser 테스트 검증
```bash
# 실제 기능 동작 확인
1. Annual Report PDF 업로드 테스트
2. 고객명, 날짜 추출 확인
3. 정상 작동하면 스킵 유지
```

### 장기 조치 (선택 사항)

#### 3. pdfParser 테스트 개선 (E2E 대안)
- 샘플 PDF 파일 준비
- Buffer 기반 테스트로 전환
- 모킹 전략 재검토

---

## 🎯 최종 권장사항

### pdfParser (11개 스킵)
```
현재 상태: 스킵 유지 ✅
이유:
  ✓ 실제 기능은 작동 중
  ✓ 모킹 문제 해결에 시간 투자 > 실익
  ✓ 텍스트 파싱 로직은 다른 테스트로 커버됨

조치: 없음 (실사용 문제 발생 시만 재검토)
```

### DocumentLibraryView (9개 스킵)
```
현재 상태: 결정 필요 ❓
이유:
  ? 자동 새로고침이 정말 필요한가?
  ? offset 초기화가 정말 필요한가?
  ? 아니면 현재 동작이 더 나은가?

조치:
  1. 실제 사용 경험 평가
  2. 필요하면 구현 + 테스트 활성화
  3. 불필요하면 테스트 파일 삭제
```

---

## 📝 결정 기록 템플릿

나중에 결정을 내릴 때 아래 템플릿을 작성하여 이 문서에 추가:

```markdown
## 결정 기록 (Decision Log)

### 날짜: YYYY-MM-DD

#### DocumentLibraryView 자동 새로고침
- **결정**: [구현함 / 구현 안 함]
- **이유**:
- **조치**:
- **커밋**: [커밋 해시]

#### DocumentLibraryView offset 초기화
- **결정**: [구현함 / 구현 안 함]
- **이유**:
- **조치**:
- **커밋**: [커밋 해시]

#### pdfParser 테스트
- **결정**: [스킵 유지 / 개선함]
- **이유**:
- **조치**:
- **커밋**: [커밋 해시]
```

---

## 🔗 참고 자료

- **테스트 결과 스크린샷**: 2025-10-30 실행 결과
- **관련 문서**: [AIMS_Quality_Assessment_2025-10-30.md](./AIMS_Quality_Assessment_2025-10-30.md)
- **코드 위치**:
  - pdfParser: `frontend/aims-uix3/src/features/customer/utils/__tests__/pdfParser.test.ts`
  - DocumentLibraryView 테스트: `frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/__tests__/`

---

**작성자**: Claude Code
**최종 수정**: 2025-10-30
