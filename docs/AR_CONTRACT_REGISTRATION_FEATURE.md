# AR 문서 → 보험계약 등록 기능 구현

## 1. 개요

### 1.1 목표
- AR 문서 분석 완료 후 보험계약 정보를 자동/수동으로 등록
- 보험계약 탭에서 AR 기반 계약 정보를 아코디언 형태로 표시

### 1.2 주요 기능
1. **AR 문서 우클릭 메뉴**: "보험계약 등록" 옵션 추가
2. **보험계약 탭 UI 개선**: 아코디언 형태로 AR 요약 표시
3. **자동 등록 로직**: AR 파싱 완료 시 자동 등록 (발행일 기준 중복 체크)

### 1.3 사용자 결정 사항
| 항목 | 결정 |
|------|------|
| 등록 방식 | 자동 + 수동 모두 지원 |
| 중복 처리 | 토스트 알림 후 무시 (3초 자동 삭제) |

---

## 2. 구현 계획

### Phase 1: AR 우클릭 메뉴 추가
**파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx`

#### 메뉴 항목
| 메뉴 | 아이콘 | 조건 | 동작 |
|------|--------|------|------|
| 상세 보기 | doc.text | status === 'completed' | 기존 모달 열기 |
| 보험계약 등록 | plus.circle | status === 'completed' | 계약 등록 API 호출 |
| 재시도 | arrow.clockwise | status === 'error' | 재파싱 요청 |
| 삭제 | trash | 항상 | 삭제 확인 모달 |

### Phase 2: 보험계약 탭 UI 개선 (아코디언)
**파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/ContractsTab.tsx`

#### UI 구조
```
▶ 정부균  2025.08.29  2026.01.13 22:11:16  294,170원  4건
▶ 정부균  2024.01.21  2024.04.13 22:11:16  294,170원  4건

클릭 시:
▼ 정부균  2025.08.29  2026.01.13 22:11:16  294,170원  4건
   ├ 메트라이프  0013224973  무배당 변액유니버셜...  정상  121,920
   ├ 메트라이프  0013535928  무배당 360 암보험...   정상  31,920
   └ ...
```

### Phase 3: 보험계약 등록 API
**파일**: 백엔드 + 프론트엔드 연동

```
POST /api/customers/:customerId/ar-contracts
Body: { ar_report_id: string }
```

### Phase 4: 자동 등록 로직
- AR 파싱 완료 후 자동 등록
- 발행일 기준 중복 체크

---

## 3. 구현 진행 상황

### Phase 1: AR 우클릭 메뉴 추가

#### 상태: ✅ 완료 (2026-01-13)

#### 구현 내용

**1. Import 추가**
```typescript
import { ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui/ContextMenu';
```

**2. 상태 및 훅 추가**
```typescript
const reportContextMenu = useContextMenu<AnnualReport>();
```

**3. 컨텍스트 메뉴 핸들러**
```typescript
const handleReportContextMenu = (e: React.MouseEvent, report: AnnualReport) => {
  reportContextMenu.open(e, report);
};
```

**4. 메뉴 섹션 정의**
```typescript
const reportContextMenuSections: ContextMenuSection[] = useMemo(() => {
  const report = reportContextMenu.targetData;
  if (!report) return [];

  const sections: ContextMenuSection[] = [];

  // 액션 섹션
  const actionItems = [];

  // 상세 보기 (완료 상태만)
  if (report.status === 'completed') {
    actionItems.push({
      id: 'view',
      label: '상세 보기',
      onClick: () => handleViewReport(report),
    });
    actionItems.push({
      id: 'register-contracts',
      label: '보험계약 등록',
      onClick: () => handleRegisterContracts(report),
    });
  }

  // 재시도 (에러 상태만)
  if (report.status === 'error') {
    actionItems.push({
      id: 'retry',
      label: '재시도',
      onClick: (e) => handleRetryParsing(report, e),
    });
  }

  if (actionItems.length > 0) {
    sections.push({ id: 'actions', items: actionItems });
  }

  // 삭제 섹션 (항상)
  sections.push({
    id: 'danger',
    items: [{
      id: 'delete',
      label: '삭제',
      danger: true,
      onClick: () => handleDeleteReport(report),
    }]
  });

  return sections;
}, [reportContextMenu.targetData]);
```

**5. 행에 onContextMenu 추가**
```typescript
<div
  className="annual-report-row ..."
  onClick={() => handleViewReport(report)}
  onContextMenu={(e) => handleReportContextMenu(e, report)}
>
```

**6. ContextMenu 컴포넌트 렌더링**
```typescript
<ContextMenu
  visible={reportContextMenu.isOpen}
  position={reportContextMenu.position}
  sections={reportContextMenuSections}
  onClose={reportContextMenu.close}
/>
```

#### 구현 결과
- 빌드 성공 ✅
- 변경 파일: `AnnualReportTab.tsx`
- 추가된 기능:
  - AR 행 우클릭 시 컨텍스트 메뉴 표시
  - "상세 보기" 메뉴 (완료 상태만)
  - "보험계약 등록" 메뉴 (완료 상태만, Phase 3에서 실제 기능 구현)
  - "재시도" 메뉴 (에러 상태만)
  - "삭제" 메뉴 (모든 상태)

---

### Phase 2: 보험계약 탭 UI (아코디언)
#### 상태: ✅ 완료 (2026-01-13)

#### 구현 내용
- ContractsTab에 AR 아코디언 섹션 추가
- AR 요약 행 (고객명, 발행일, 분석일, 월납보험료, 계약건수)
- 클릭 시 계약 상세 목록 펼침/접힘
- 계약 상세 (보험사, 증권번호, 상품명, 계약상태, 보험료)

---

### Phase 3: 보험계약 등록 API
#### 상태: ✅ 완료 (2026-01-13)

#### 구현 내용

**1. 백엔드 API 추가** (`routes/query.py`)
```python
POST /customers/{customer_id}/ar-contracts
Body: { issue_date: string, customer_name?: string }

Response: {
  success: boolean,
  message: string,
  registered_at: string,  # 등록 시간 (ISO 8601)
  duplicate: boolean      # 이미 등록된 경우 true
}
```

**2. 프론트엔드 API 클라이언트** (`annualReportApi.ts`)
```typescript
AnnualReportApi.registerARContracts(customerId, issueDate, customerName?)
```

**3. AR 탭 핸들러 연결** (`AnnualReportTab.tsx`)
- `handleRegisterContracts`: 확인 모달 → API 호출 → 토스트 알림
- 중복 등록 시 "이미 등록된 Annual Report입니다" 토스트 (3초)
- 성공 시 "보험계약이 등록되었습니다" 토스트 (3초)

---

### Phase 4: 자동 등록 로직
#### 상태: ✅ 완료 (2026-01-13)

#### 구현 내용
- AR 파싱 완료 시 자동으로 `registered_at` 필드 설정
- `db_writer.py`의 `save_annual_report()` 함수에서 구현
- 모든 새로운 AR 문서는 파싱 완료 즉시 보험계약 탭에 표시됨

#### 코드 변경
**파일**: `backend/api/annual_report_api/services/db_writer.py`
```python
annual_report = {
    # ... 기존 필드들 ...

    # 🍎 Phase 4: 자동 등록 - 파싱 완료 시 자동으로 보험계약 탭에 등록
    "registered_at": utc_now_iso(),
}
```

#### 동작 방식
1. AR 문서 업로드 → 파싱 시작
2. 파싱 완료 → `save_annual_report()` 호출
3. `registered_at` 필드 자동 설정 → 보험계약 탭에 즉시 표시
4. 중복 체크: 같은 customer_name + issue_date는 저장 거부

---

## 4. 테스트 체크리스트

- [x] AR 문서 행 우클릭 → 컨텍스트 메뉴 표시
- [x] "상세 보기" 클릭 → 기존 모달 열기
- [x] "보험계약 등록" 클릭 → API 호출 및 토스트 알림
- [x] "재시도" 클릭 → AR 파싱 재시도
- [x] "삭제" 클릭 → 삭제 확인 모달
- [x] 계약 탭에서 AR 요약 행 클릭 → 아코디언 펼침/접힘
- [x] 같은 발행일 AR 중복 등록 시도 → 토스트 알림
- [x] 새 AR 업로드 시 자동 등록 → 계약 탭에 즉시 표시

---

## 5. 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `AnnualReportTab.tsx` | 컨텍스트 메뉴 + 보험계약 등록 API 호출 |
| `ContractsTab.tsx` | 아코디언 UI 추가 |
| `ContractsTab.css` | 아코디언 스타일 추가 |
| `annualReportApi.ts` | `registerARContracts` API 추가 |
| `routes/query.py` | AR 보험계약 등록 엔드포인트 추가 |
| `db_writer.py` | 자동 등록 로직 (`registered_at` 필드 추가) |

---

## 6. 참고

- 관련 계획 파일: `C:\Users\rossi\.claude\plans\joyful-crunching-muffin.md`
- 기존 ContextMenu 패턴: `DocumentsTab.tsx` 참조
