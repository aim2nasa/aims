# Annual Report 프론트엔드 구현 계획

> 작성일: 2025-10-16
> 백엔드 구현: [ANNUAL_REPORT_BACKEND_IMPLEMENTATION.md](./ANNUAL_REPORT_BACKEND_IMPLEMENTATION.md)
> 명세서: [ANNUAL_REPORT_FEATURE_SPEC.md](./ANNUAL_REPORT_FEATURE_SPEC.md)
> 상태: 📝 계획 단계

---

## 📋 목차

1. [전체 목표](#-전체-목표)
2. [구현 단계](#-구현-단계-3단계)
3. [처리 흐름](#-처리-흐름)
4. [UI/UX 설계](#-uiux-설계)
5. [기술 스택](#-기술-스택)
6. [파일 구조](#-파일-구조)
7. [검증 기준](#-검증-기준)

---

## 🎯 전체 목표

백엔드 API (`/check`, `/parse`)와 연동하여 Annual Report 자동 업로드 및 파싱 시스템을 프론트엔드에 구현합니다.

### 핵심 기능

1. **자동 감지**: PDF 업로드 시 Annual Report 자동 판단
2. **고객 식별**: 1페이지 메타데이터로 고객 자동 찾기
3. **동명이인 처리**: 여러 고객 중 선택 모달
4. **신규 고객 생성**: 고객 없을 시 즉시 생성
5. **자동 파싱**: 백그라운드에서 계약 데이터 파싱
6. **결과 표시**: Annual Report 탭에서 데이터 시각화

---

## 🚀 구현 단계 (3단계)

### Phase 1: 기반 API 및 타입 정의

**커밋명**: `feat: Annual Report API 클라이언트 및 타입 정의`

#### 작업 내용

##### 1. API 클라이언트 확장

**파일**: `src/features/customer/api/annualReportApi.ts`

```typescript
// 신규 함수 추가

/**
 * Annual Report 체크 API (백엔드 /check)
 * - PDF가 Annual Report인지 판단
 * - 1페이지 메타데이터 추출 (AI 불사용)
 */
export async function checkAnnualReport(file: File): Promise<CheckAnnualReportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://tars.giize.com:8081/annual-report/check', {
    method: 'POST',
    body: formData,
  });

  return await response.json();
}

/**
 * Annual Report 파싱 API (백엔드 /parse)
 * - 2~N페이지 AI 파싱
 * - customer_id 필수
 */
export async function parseAnnualReport(
  file: File,
  customerId: string
): Promise<ParseAnnualReportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('customer_id', customerId);

  const response = await fetch('http://tars.giize.com:8081/annual-report/parse', {
    method: 'POST',
    body: formData,
  });

  return await response.json();
}

/**
 * 고객명으로 고객 검색
 */
export async function searchCustomersByName(name: string): Promise<Customer[]> {
  const response = await fetch(
    `http://tars.giize.com:3010/api/customers?search=${encodeURIComponent(name)}`
  );
  const data = await response.json();
  return data.customers || [];
}
```

##### 2. TypeScript 타입 정의

**파일**: `src/features/customer/api/annualReportApi.ts`

```typescript
// 백엔드 CheckResponse와 일치
export interface CheckAnnualReportResponse {
  is_annual_report: boolean;
  confidence: number;
  metadata: {
    customer_name: string;
    report_title: string;
    issue_date: string; // YYYY-MM-DD
    fsr_name: string;
  } | null;
}

// 백엔드 ParseResponse와 일치
export interface ParseAnnualReportResponse {
  success: boolean;
  message: string;
  job_id?: string;
  file_id?: string;
}

// 고객 식별 결과
export interface CustomerIdentificationResult {
  scenario: 'single' | 'multiple' | 'none';
  customers: Customer[];
  metadata: CheckAnnualReportResponse['metadata'];
}
```

#### 변경 파일

- ✏️ `src/features/customer/api/annualReportApi.ts` (확장)

---

### Phase 2: 문서 업로드 시 Annual Report 자동 감지

**커밋명**: `feat: 문서 업로드 시 Annual Report 자동 감지 및 고객 식별`

#### 작업 내용

##### 1. DocumentRegistrationView 수정

**파일**: `src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx`

**수정 포인트:**

```typescript
// 업로드 완료 후 자동 감지 로직 추가
const handleUploadComplete = async (uploadedFile: UploadFile) => {
  // 기존 로직...

  // Annual Report 자동 감지 (PDF만)
  if (uploadedFile.file.type === 'application/pdf') {
    try {
      const checkResult = await checkAnnualReport(uploadedFile.file);

      if (checkResult.is_annual_report && checkResult.metadata) {
        // 고객 식별 시작
        const identificationResult = await identifyCustomer(checkResult.metadata);

        // 고객 식별 모달 표시
        setCustomerIdentificationState({
          isOpen: true,
          result: identificationResult,
          file: uploadedFile.file,
        });
      }
    } catch (error) {
      console.error('Annual Report 체크 실패:', error);
      // 조용히 실패 (기존 문서 업로드는 성공)
    }
  }
};

// 고객 식별 로직
const identifyCustomer = async (
  metadata: CheckAnnualReportResponse['metadata']
): Promise<CustomerIdentificationResult> => {
  if (!metadata?.customer_name) {
    return { scenario: 'none', customers: [], metadata };
  }

  const customers = await searchCustomersByName(metadata.customer_name);

  if (customers.length === 0) {
    return { scenario: 'none', customers: [], metadata };
  } else if (customers.length === 1) {
    return { scenario: 'single', customers, metadata };
  } else {
    return { scenario: 'multiple', customers, metadata };
  }
};
```

##### 2. 고객 식별 모달 컴포넌트 생성

**파일**: `src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.tsx`

**컴포넌트 구조:**

```typescript
interface CustomerIdentificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: CustomerIdentificationResult;
  file: File;
  onConfirm: (customerId: string) => void;
  onCreateNew: () => void;
}

export const CustomerIdentificationModal: React.FC<CustomerIdentificationModalProps> = ({
  isOpen,
  onClose,
  result,
  file,
  onConfirm,
  onCreateNew,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // 시나리오별 렌더링
  const renderContent = () => {
    switch (result.scenario) {
      case 'single':
        return renderSingleCustomer();
      case 'multiple':
        return renderMultipleCustomers();
      case 'none':
        return renderNoCustomer();
    }
  };

  // 고객 1명: 자동 선택 UI
  const renderSingleCustomer = () => (
    <div className="customer-identification-modal__single">
      <div className="customer-identification-modal__icon">✅</div>
      <h3>고객을 찾았습니다</h3>
      <div className="customer-identification-modal__customer-card">
        <div className="customer-identification-modal__customer-name">
          {result.customers[0].personal_info?.name}
        </div>
        <div className="customer-identification-modal__customer-contact">
          {result.customers[0].contact_info?.mobile}
        </div>
      </div>
      <p className="customer-identification-modal__description">
        이 고객의 Annual Report로 등록됩니다.
      </p>
      <div className="customer-identification-modal__actions">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          onClick={() => onConfirm(result.customers[0]._id)}
        >
          확인
        </Button>
      </div>
    </div>
  );

  // 동명이인: 선택 모달
  const renderMultipleCustomers = () => (
    <div className="customer-identification-modal__multiple">
      <div className="customer-identification-modal__icon">👥</div>
      <h3>"{result.metadata?.customer_name}" 고객이 {result.customers.length}명 있습니다</h3>
      <p className="customer-identification-modal__description">
        어느 고객의 Annual Report입니까?
      </p>

      <div className="customer-identification-modal__customer-list">
        {result.customers.map((customer) => (
          <label
            key={customer._id}
            className="customer-identification-modal__customer-option"
          >
            <input
              type="radio"
              name="customer"
              value={customer._id}
              checked={selectedCustomerId === customer._id}
              onChange={() => setSelectedCustomerId(customer._id)}
            />
            <div className="customer-identification-modal__customer-info">
              <div className="customer-identification-modal__customer-name">
                {customer.personal_info?.name}
              </div>
              <div className="customer-identification-modal__customer-contact">
                {customer.contact_info?.mobile || '연락처 없음'}
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className="customer-identification-modal__actions">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          onClick={() => selectedCustomerId && onConfirm(selectedCustomerId)}
          disabled={!selectedCustomerId}
        >
          선택
        </Button>
      </div>
    </div>
  );

  // 고객 없음: 신규 생성 모달
  const renderNoCustomer = () => (
    <div className="customer-identification-modal__none">
      <div className="customer-identification-modal__icon">👤</div>
      <h3>고객을 찾을 수 없습니다</h3>
      <p className="customer-identification-modal__description">
        "{result.metadata?.customer_name}" 이름의 고객이 없습니다.
      </p>
      <div className="customer-identification-modal__suggestion">
        <p>신규 고객으로 등록하시겠습니까?</p>
        <ul className="customer-identification-modal__extracted-info">
          <li>이름: {result.metadata?.customer_name}</li>
          <li>발행일: {result.metadata?.issue_date}</li>
          {result.metadata?.fsr_name && (
            <li>담당자: {result.metadata.fsr_name}</li>
          )}
        </ul>
      </div>
      <div className="customer-identification-modal__actions">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          onClick={handleCreateNewCustomer}
          isLoading={isCreatingCustomer}
        >
          신규 고객 생성
        </Button>
      </div>
    </div>
  );

  // 신규 고객 생성 및 파싱 요청
  const handleCreateNewCustomer = async () => {
    setIsCreatingCustomer(true);

    try {
      // 1. 신규 고객 생성
      const newCustomer = await createCustomer({
        personal_info: {
          name: result.metadata?.customer_name || '',
        },
      });

      // 2. 파싱 요청
      await onConfirm(newCustomer._id);
    } catch (error) {
      console.error('신규 고객 생성 실패:', error);
      alert('고객 생성에 실패했습니다.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {renderContent()}
    </Modal>
  );
};
```

##### 3. 파싱 요청 로직

**DocumentRegistrationView에 추가:**

```typescript
// 고객 식별 완료 후 호출
const handleCustomerIdentified = async (customerId: string) => {
  try {
    // 파싱 요청
    const parseResult = await parseAnnualReport(
      customerIdentificationState.file,
      customerId
    );

    if (parseResult.success) {
      // 성공 메시지
      showToast({
        type: 'success',
        message: 'Annual Report 파싱이 시작되었습니다. (약 25초 소요)',
      });

      // 진행 상태 표시 (선택 사항)
      setParsingStatus({
        isActive: true,
        fileId: parseResult.file_id,
        startTime: Date.now(),
      });
    }
  } catch (error) {
    console.error('Annual Report 파싱 실패:', error);
    showToast({
      type: 'error',
      message: 'Annual Report 파싱에 실패했습니다.',
    });
  } finally {
    // 모달 닫기
    setCustomerIdentificationState({ isOpen: false, result: null, file: null });
  }
};
```

#### 변경/생성 파일

- ✏️ `src/components/DocumentViews/DocumentRegistrationView/DocumentRegistrationView.tsx`
- ➕ `src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.tsx`
- ➕ `src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.css`
- ➕ `src/features/customer/components/CustomerIdentificationModal/index.ts`

---

### Phase 3: Annual Report 탭 UI 완성

**커밋명**: `feat: Annual Report 탭 UI 완성 및 상세 모달 구현`

#### 작업 내용

##### 1. AnnualReportTab 개선

**파일**: `src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx`

**기존 문제:**
- 현재는 플레이스홀더 상태
- 실제 데이터 구조와 연동 필요

**개선 사항:**

```typescript
// 최신 Annual Report 로드
useEffect(() => {
  loadLatestReport();
}, [customer._id]);

const loadLatestReport = async () => {
  setIsLoading(true);
  setError(null);

  try {
    // 백엔드에서 최신 Annual Report 조회
    const response = await AnnualReportApi.getLatestAnnualReport(customer._id);

    if (response.success && response.data) {
      setLatestReport(response.data.report);
    } else {
      setError(response.error || 'Annual Report 조회에 실패했습니다.');
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Annual Report 조회 중 오류가 발생했습니다.');
  } finally {
    setIsLoading(false);
  }
};

// 요약 정보 표시
const renderSummary = () => (
  <div className="annual-report-tab__summary">
    <h3 className="annual-report-tab__summary-title">최신 Annual Report</h3>

    {/* 발행일 */}
    <div className="annual-report-tab__info-row">
      <span className="annual-report-tab__info-label">발행일</span>
      <span className="annual-report-tab__info-value">
        {formatDate(latestReport.issue_date)}
      </span>
    </div>

    {/* Report 제목 */}
    {latestReport.report_title && (
      <div className="annual-report-tab__info-row">
        <span className="annual-report-tab__info-label">제목</span>
        <span className="annual-report-tab__info-value">
          {latestReport.report_title}
        </span>
      </div>
    )}

    {/* FSR 이름 */}
    {latestReport.fsr_name && (
      <div className="annual-report-tab__info-row">
        <span className="annual-report-tab__info-label">담당자</span>
        <span className="annual-report-tab__info-value">
          {latestReport.fsr_name}
        </span>
      </div>
    )}

    {/* 통계 */}
    <div className="annual-report-tab__stats">
      <div className="annual-report-tab__stat-item">
        <span className="annual-report-tab__stat-label">총 계약 건수</span>
        <span className="annual-report-tab__stat-value">
          {latestReport.total_contracts}건
        </span>
      </div>
      <div className="annual-report-tab__stat-item">
        <span className="annual-report-tab__stat-label">총 월 보험료</span>
        <span className="annual-report-tab__stat-value annual-report-tab__stat-value--premium">
          {formatCurrency(latestReport.total_monthly_premium)}
        </span>
      </div>
    </div>

    {/* 상세 보기 버튼 */}
    <div className="annual-report-tab__actions">
      <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)}>
        상세 보기
      </Button>
      <Button variant="secondary" size="md" onClick={loadLatestReport}>
        새로고침
      </Button>
    </div>

    {/* 계약 미리보기 (처음 3개만) */}
    {renderContractPreview()}
  </div>
);

// 계약 미리보기
const renderContractPreview = () => {
  if (!latestReport.contracts || latestReport.contracts.length === 0) {
    return null;
  }

  return (
    <div className="annual-report-tab__preview">
      <h4 className="annual-report-tab__preview-title">계약 미리보기</h4>
      {latestReport.contracts.slice(0, 3).map((contract, index) => (
        <div key={index} className="annual-report-tab__contract-preview">
          <div className="annual-report-tab__contract-number">
            증권번호: {contract['증권번호']}
          </div>
          <div className="annual-report-tab__contract-name">
            {contract['증권명']}
          </div>
          <div className="annual-report-tab__contract-details">
            <span>월 {formatCurrency(contract['보험료(원)'])}</span>
            <span>·</span>
            <span>계약일: {contract['계약일']}</span>
          </div>
        </div>
      ))}
      {latestReport.contracts.length > 3 && (
        <div className="annual-report-tab__preview-more">
          외 {latestReport.contracts.length - 3}건 더 보기...
        </div>
      )}
    </div>
  );
};
```

##### 2. AnnualReportModal 구현

**파일**: `src/features/customer/components/AnnualReportModal/AnnualReportModal.tsx`

**모달 구조:**

```typescript
interface AnnualReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AnnualReport | null;
  isLoading: boolean;
  error: string | null;
  customerName: string;
}

export const AnnualReportModal: React.FC<AnnualReportModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
  customerName,
}) => {
  const [activeTab, setActiveTab] = useState<'contracts' | 'lapsed'>('contracts');

  // 로딩 상태
  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="large">
        <div className="annual-report-modal__loading">
          <Spinner />
          <p>Annual Report를 불러오는 중...</p>
        </div>
      </Modal>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <div className="annual-report-modal__error">
          <div className="annual-report-modal__error-icon">⚠️</div>
          <p>{error}</p>
        </div>
      </Modal>
    );
  }

  // 데이터 없음
  if (!report) {
    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <div className="annual-report-modal__empty">
          <p>Annual Report가 없습니다.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className="annual-report-modal">
        {/* 헤더 */}
        <div className="annual-report-modal__header">
          <h2 className="annual-report-modal__title">
            {customerName}님의 Annual Report
          </h2>
          <div className="annual-report-modal__meta">
            <span>발행일: {formatDate(report.issue_date)}</span>
            {report.fsr_name && <span>담당자: {report.fsr_name}</span>}
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="annual-report-modal__summary">
          <div className="annual-report-modal__stat">
            <span className="annual-report-modal__stat-label">총 계약</span>
            <span className="annual-report-modal__stat-value">
              {report.total_contracts}건
            </span>
          </div>
          <div className="annual-report-modal__stat">
            <span className="annual-report-modal__stat-label">월 보험료</span>
            <span className="annual-report-modal__stat-value">
              {formatCurrency(report.total_monthly_premium)}
            </span>
          </div>
        </div>

        {/* 탭 */}
        <Tabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { id: 'contracts', label: `보유계약 (${report.contracts.length})` },
            { id: 'lapsed', label: `실효계약 (${report.lapsed_contracts?.length || 0})` },
          ]}
        />

        {/* 계약 테이블 */}
        {activeTab === 'contracts' && renderContractsTable(report.contracts)}
        {activeTab === 'lapsed' && renderLapsedContractsTable(report.lapsed_contracts)}
      </div>
    </Modal>
  );
};

// 보유계약 테이블
const renderContractsTable = (contracts: Contract[]) => (
  <div className="annual-report-modal__table-container">
    <table className="annual-report-modal__table">
      <thead>
        <tr>
          <th>순번</th>
          <th>증권번호</th>
          <th>증권명</th>
          <th>보험료(원)</th>
          <th>계약일</th>
          <th>만기일</th>
          <th>납입주기</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((contract, index) => (
          <tr key={index}>
            <td>{contract['순번']}</td>
            <td>{contract['증권번호']}</td>
            <td>{contract['증권명']}</td>
            <td className="annual-report-modal__currency">
              {formatCurrency(contract['보험료(원)'])}
            </td>
            <td>{contract['계약일']}</td>
            <td>{contract['만기일']}</td>
            <td>{contract['납입주기']}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// 실효계약 테이블
const renderLapsedContractsTable = (lapsedContracts?: LapsedContract[]) => {
  if (!lapsedContracts || lapsedContracts.length === 0) {
    return (
      <div className="annual-report-modal__empty-state">
        <p>부활가능 실효계약이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="annual-report-modal__table-container">
      <table className="annual-report-modal__table">
        <thead>
          <tr>
            <th>순번</th>
            <th>증권번호</th>
            <th>증권명</th>
            <th>실효일</th>
            <th>부활가능일</th>
          </tr>
        </thead>
        <tbody>
          {lapsedContracts.map((contract, index) => (
            <tr key={index}>
              <td>{contract['순번']}</td>
              <td>{contract['증권번호']}</td>
              <td>{contract['증권명']}</td>
              <td>{contract['실효일']}</td>
              <td>{contract['부활가능일']}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

##### 3. CSS 스타일링

**파일**: `src/features/customer/components/AnnualReportModal/AnnualReportModal.css`

**애플 디자인 원칙:**

```css
/* 모달 기본 스타일 */
.annual-report-modal {
  background: var(--color-bg-primary);
  border-radius: 12px;
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
}

/* 헤더 */
.annual-report-modal__header {
  border-bottom: 1px solid var(--color-border-subtle);
  padding-bottom: 16px;
  margin-bottom: 20px;
}

.annual-report-modal__title {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.annual-report-modal__meta {
  font-size: 14px;
  color: var(--color-text-secondary);
  display: flex;
  gap: 16px;
}

/* 요약 통계 */
.annual-report-modal__summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.annual-report-modal__stat {
  background: var(--color-bg-secondary);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.annual-report-modal__stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.annual-report-modal__stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* 테이블 */
.annual-report-modal__table-container {
  overflow-x: auto;
  margin-top: 16px;
}

.annual-report-modal__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.annual-report-modal__table thead {
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.annual-report-modal__table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border-subtle);
}

.annual-report-modal__table td {
  padding: 12px 16px;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-subtle);
}

.annual-report-modal__table tbody tr:last-child td {
  border-bottom: none;
}

.annual-report-modal__table tbody tr:hover {
  background: var(--color-bg-hover);
}

.annual-report-modal__currency {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 빈 상태 */
.annual-report-modal__empty-state {
  text-align: center;
  padding: 48px;
  color: var(--color-text-secondary);
}

/* Progressive Disclosure: 기본은 subtle */
.annual-report-modal {
  transition: all 0.2s ease;
}

.annual-report-modal:hover {
  /* 호버 시에만 약간 강조 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

#### 변경/생성 파일

- ✏️ `src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx`
- ✏️ `src/features/customer/views/CustomerDetailView/tabs/AnnualReportTab.css`
- ➕ `src/features/customer/components/AnnualReportModal/AnnualReportModal.tsx`
- ➕ `src/features/customer/components/AnnualReportModal/AnnualReportModal.css`
- ➕ `src/features/customer/components/AnnualReportModal/index.ts`

---

## 🔄 처리 흐름

### 전체 시퀀스

```
사용자: PDF 업로드 (DocumentRegistrationView)
  ↓
[기존 업로드 처리]
  ↓
업로드 완료 → handleUploadComplete()
  ↓
PDF 파일? → Yes → checkAnnualReport(file) [POST /check]
           → No  → 종료
  ↓
Annual Report? → No  → 종료 (기존 문서)
               → Yes → 고객 식별 시작
  ↓
metadata.customer_name 추출
  ↓
searchCustomersByName(name) [DB 검색]
  ↓
┌──────────────────────────────────────┐
│ 시나리오 1: 고객 1명                 │
│ → 자동 선택 UI                       │
│ → 사용자 확인만 필요                 │
├──────────────────────────────────────┤
│ 시나리오 2: 동명이인 (2명 이상)      │
│ → 선택 모달 표시                     │
│ → 라디오 버튼으로 선택               │
├──────────────────────────────────────┤
│ 시나리오 3: 고객 없음                │
│ → 신규 생성 모달                     │
│ → createCustomer() 실행              │
└──────────────────────────────────────┘
  ↓
customer_id 결정
  ↓
parseAnnualReport(file, customerId) [POST /parse]
  ↓
백그라운드 파싱 시작 (약 25초)
  ↓
성공 토스트 표시: "Annual Report 파싱이 시작되었습니다."
  ↓
[사용자는 다른 작업 가능]
  ↓
25초 후 파싱 완료
  ↓
Annual Report 탭 업데이트 (자동 새로고침)
```

### 고객 식별 상세 흐름

```
CustomerIdentificationModal
  ↓
┌─────────────────────────────────────────┐
│ scenario: 'single'                      │
├─────────────────────────────────────────┤
│ ✅ 고객을 찾았습니다                    │
│                                         │
│ [ 안영미 ]                              │
│   010-1234-5678                         │
│                                         │
│ 이 고객의 Annual Report로 등록됩니다.   │
│                                         │
│          [취소]    [확인]               │
└─────────────────────────────────────────┘
  ↓ 확인 클릭
parseAnnualReport(file, customer._id)


┌─────────────────────────────────────────┐
│ scenario: 'multiple'                    │
├─────────────────────────────────────────┤
│ 👥 "안영미" 고객이 2명 있습니다         │
│                                         │
│ 어느 고객의 Annual Report입니까?        │
│                                         │
│ ○ 안영미 (010-1234-5678)                │
│ ● 안영미 (010-9876-5432)                │
│                                         │
│          [취소]    [선택]               │
└─────────────────────────────────────────┘
  ↓ 선택 클릭
parseAnnualReport(file, selectedCustomerId)


┌─────────────────────────────────────────┐
│ scenario: 'none'                        │
├─────────────────────────────────────────┤
│ 👤 고객을 찾을 수 없습니다              │
│                                         │
│ "안영미" 이름의 고객이 없습니다.        │
│                                         │
│ 신규 고객으로 등록하시겠습니까?         │
│                                         │
│ 추출된 정보:                            │
│ - 이름: 안영미                          │
│ - 발행일: 2025-08-27                    │
│ - 담당자: 홍길동                        │
│                                         │
│          [취소]    [신규 고객 생성]     │
└─────────────────────────────────────────┘
  ↓ 신규 고객 생성 클릭
createCustomer({ name: "안영미" })
  ↓
parseAnnualReport(file, newCustomer._id)
```

---

## 🎨 UI/UX 설계

### 애플 디자인 철학 준수

#### 1. Progressive Disclosure

**원칙**: "필요할 때만 보여준다"

```
기본 상태:
- 서브틀한 색상
- minimal UI

사용자 인터랙션 시:
- 필요한 정보만 단계적 표시
- 부드러운 애니메이션
```

#### 2. Subtle Interaction

**원칙**: "조용하고 자연스럽게"

```css
/* 기본 상태: 거의 보이지 않음 */
.customer-identification-modal {
  opacity: 0;
  transform: scale(0.95);
  transition: all 0.2s ease;
}

/* 활성 상태: 부드럽게 나타남 */
.customer-identification-modal.is-open {
  opacity: 1;
  transform: scale(1);
}

/* 호버 상태: 미세한 변화 */
.customer-option:hover {
  background: var(--color-bg-hover);
  transform: translateX(2px);
}
```

#### 3. Depth (깊이감)

**계층 구조:**

```
Level 1: DocumentRegistrationView (base)
  ↓
Level 2: CustomerIdentificationModal (overlay)
  ↓
Level 3: AnnualReportModal (detail)
```

#### 4. WCAG AA 색상 대비

**필수 준수:**

```css
/* 텍스트 대비 4.5:1 이상 */
--color-text-primary: #1a1a1a;   /* Light: 14.9:1 */
--color-text-secondary: #6b7280; /* Light: 4.7:1 */

/* Dark 모드 */
--color-text-primary: #f9fafb;   /* Dark: 15.1:1 */
--color-text-secondary: #d1d5db; /* Dark: 8.9:1 */
```

### 모달 디자인 상세

#### CustomerIdentificationModal

**크기**: 중간 (480px width)
**위치**: 화면 중앙
**애니메이션**: fade + scale

```
┌────────────────────────────────────────────┐
│  [X]                                       │
│                                            │
│            [아이콘]                        │
│                                            │
│         타이틀 (20px, 600)                 │
│                                            │
│      설명 텍스트 (14px, 400)               │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │  [컨텐츠 영역]                       │ │
│  │  - 고객 카드 또는                    │ │
│  │  - 라디오 버튼 리스트 또는           │ │
│  │  - 추출된 정보 표시                  │ │
│  └──────────────────────────────────────┘ │
│                                            │
│              [취소]  [확인/선택]           │
│                                            │
└────────────────────────────────────────────┘
```

#### AnnualReportModal

**크기**: 대형 (1200px width)
**위치**: 화면 중앙
**애니메이션**: slide up + fade

```
┌──────────────────────────────────────────────────────┐
│  [X] Annual Report - 안영미                          │
│  발행일: 2025-08-27  담당자: 홍길동                  │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐                        │
│  │ 총 계약  │  │ 월보험료 │                        │
│  │  5 건    │  │ 250,000원│                        │
│  └──────────┘  └──────────┘                        │
├──────────────────────────────────────────────────────┤
│  [ 보유계약 (5) ]  [ 실효계약 (0) ]                │
├──────────────────────────────────────────────────────┤
│  순번 │ 증권번호 │ 증권명        │ 보험료 │ ...    │
│  ──────────────────────────────────────────────────│
│   1  │ 1234567  │ 실버건강보험  │ 50,000 │ ...    │
│   2  │ 2345678  │ 암보험        │ 80,000 │ ...    │
│   3  │ 3456789  │ 종신보험      │120,000 │ ...    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 🛠 기술 스택

### 프론트엔드

- **React** 18.3+
- **TypeScript** 5.5+
- **CSS Modules** (애플 스타일 시스템)
- **Fetch API** (백엔드 통신)
- **Zustand** (전역 상태 관리, 필요시)

### 백엔드 API

- **POST** `/annual-report/check` - Annual Report 판단 및 메타데이터 추출
- **POST** `/annual-report/parse` - 계약 데이터 파싱 (백그라운드)
- **GET** `/api/customers?search={name}` - 고객명으로 검색
- **POST** `/api/customers` - 신규 고객 생성
- **GET** `/api/customers/{id}/annual-reports` - Annual Report 조회

### 디자인 시스템

- **CSS 변수** 기반 테마
- **Light/Dark** 모드 지원
- **WCAG AA** 접근성 준수
- **Apple HIG** 디자인 가이드라인

---

## 📂 파일 구조

```
frontend/aims-uix3/src/
├── features/customer/
│   ├── api/
│   │   └── annualReportApi.ts                    [✏️ 확장]
│   │       - checkAnnualReport()                 [➕ 신규]
│   │       - parseAnnualReport()                 [➕ 신규]
│   │       - searchCustomersByName()             [➕ 신규]
│   │       - CheckAnnualReportResponse           [➕ 타입]
│   │       - ParseAnnualReportResponse           [➕ 타입]
│   │       - CustomerIdentificationResult        [➕ 타입]
│   │
│   ├── components/
│   │   ├── CustomerIdentificationModal/          [➕ 신규 디렉토리]
│   │   │   ├── CustomerIdentificationModal.tsx   [➕ 신규]
│   │   │   ├── CustomerIdentificationModal.css   [➕ 신규]
│   │   │   └── index.ts                          [➕ 신규]
│   │   │
│   │   └── AnnualReportModal/                    [➕ 신규 디렉토리]
│   │       ├── AnnualReportModal.tsx             [➕ 신규]
│   │       ├── AnnualReportModal.css             [➕ 신규]
│   │       └── index.ts                          [➕ 신규]
│   │
│   └── views/CustomerDetailView/
│       └── tabs/
│           ├── AnnualReportTab.tsx               [✏️ 개선]
│           └── AnnualReportTab.css               [✏️ 개선]
│
└── components/DocumentViews/
    └── DocumentRegistrationView/
        └── DocumentRegistrationView.tsx          [✏️ 수정]
```

### 변경/생성 파일 요약

#### Phase 1 (1개 파일)
- ✏️ `annualReportApi.ts` - API 함수 3개 + 타입 3개 추가

#### Phase 2 (4개 파일)
- ✏️ `DocumentRegistrationView.tsx` - 자동 감지 로직 추가
- ➕ `CustomerIdentificationModal.tsx` - 고객 식별 모달
- ➕ `CustomerIdentificationModal.css` - 모달 스타일
- ➕ `CustomerIdentificationModal/index.ts` - export

#### Phase 3 (6개 파일)
- ✏️ `AnnualReportTab.tsx` - 실제 데이터 연동
- ✏️ `AnnualReportTab.css` - 스타일 개선
- ➕ `AnnualReportModal.tsx` - 상세 모달
- ➕ `AnnualReportModal.css` - 모달 스타일
- ➕ `AnnualReportModal/index.ts` - export

**총 11개 파일** (수정 3개, 신규 8개)

---

## ✅ 검증 기준

### 기능 검증

- [ ] **Phase 1: API 연동**
  - [ ] `/check` API 호출 성공
  - [ ] `/parse` API 호출 성공
  - [ ] 고객 검색 API 동작
  - [ ] TypeScript 타입 오류 없음

- [ ] **Phase 2: 자동 감지**
  - [ ] PDF 업로드 시 자동 감지 동작
  - [ ] Annual Report 아닌 파일 무시
  - [ ] 고객 1명 시나리오 동작
  - [ ] 동명이인 시나리오 동작
  - [ ] 고객 없음 시나리오 동작
  - [ ] 신규 고객 생성 동작
  - [ ] 파싱 요청 성공

- [ ] **Phase 3: UI 완성**
  - [ ] Annual Report 탭 데이터 표시
  - [ ] 상세 모달 열림/닫힘
  - [ ] 계약 테이블 표시
  - [ ] 실효계약 탭 동작
  - [ ] 새로고침 동작

### 디자인 검증

- [ ] **애플 디자인 철학**
  - [ ] Progressive Disclosure 적용
  - [ ] Subtle Interaction 구현
  - [ ] Depth 계층 구조
  - [ ] 부드러운 애니메이션

- [ ] **접근성**
  - [ ] WCAG AA 색상 대비 (4.5:1)
  - [ ] 키보드 네비게이션
  - [ ] 포커스 인디케이터
  - [ ] Screen reader 지원

- [ ] **반응형**
  - [ ] 모달 크기 적절
  - [ ] 테이블 가로 스크롤
  - [ ] 모바일 대응 (선택 사항)

### 성능 검증

- [ ] 업로드 중 UI 블로킹 없음
- [ ] 백그라운드 파싱 중 다른 작업 가능
- [ ] 모달 애니메이션 60fps
- [ ] 테이블 렌더링 최적화

### 에러 처리

- [ ] `/check` API 실패 시 조용히 처리
- [ ] `/parse` API 실패 시 사용자 알림
- [ ] 고객 생성 실패 시 재시도 가능
- [ ] 네트워크 에러 처리

---

## 📝 커밋 메시지 형식

```
Phase 1:
feat: Annual Report API 클라이언트 및 타입 정의

- checkAnnualReport() 함수 추가 (POST /check)
- parseAnnualReport() 함수 추가 (POST /parse)
- searchCustomersByName() 함수 추가
- CheckAnnualReportResponse 타입 정의
- ParseAnnualReportResponse 타입 정의
- CustomerIdentificationResult 타입 정의

백엔드 API와 완전히 일치하는 타입 시스템 구축

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>


Phase 2:
feat: 문서 업로드 시 Annual Report 자동 감지 및 고객 식별

- DocumentRegistrationView: 업로드 후 자동 /check API 호출
- CustomerIdentificationModal 컴포넌트 추가
  - 고객 1명: 자동 선택 UI
  - 동명이인: 라디오 버튼 선택 모달
  - 고객 없음: 신규 생성 모달
- 고객 식별 완료 후 /parse API 자동 호출
- 백그라운드 파싱 상태 토스트 표시

명세서 고객 식별 로직 완전 구현

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>


Phase 3:
feat: Annual Report 탭 UI 완성 및 상세 모달 구현

- AnnualReportTab: 실제 데이터 표시
  - 최신 Annual Report 요약
  - 계약 미리보기 (최대 3건)
  - 통계 정보 (계약 건수, 월 보험료)
- AnnualReportModal: 상세 정보 모달
  - 보유계약 테이블 (전체 목록)
  - 실효계약 탭
  - 애플 스타일 테이블 디자인
- Progressive Disclosure 적용
- WCAG AA 색상 대비 준수

애플 디자인 철학 완벽 구현

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 🚀 다음 작업

### Phase 1 시작
1. `annualReportApi.ts` 파일 읽기
2. API 함수 3개 추가
3. TypeScript 타입 3개 정의
4. 테스트 (curl로 백엔드 연동 확인)
5. 커밋

### Phase 2 시작
1. `DocumentRegistrationView.tsx` 수정
2. `CustomerIdentificationModal` 컴포넌트 생성
3. 고객 식별 로직 구현
4. 파싱 요청 로직 추가
5. 테스트 (실제 PDF 업로드)
6. 커밋

### Phase 3 시작
1. `AnnualReportTab.tsx` 개선
2. `AnnualReportModal` 컴포넌트 생성
3. 테이블 UI 구현
4. CSS 스타일링 완성
5. 테스트 (탭 전환, 모달 열기)
6. 커밋

---

## 📌 주의사항

### 백엔드 의존성

- 백엔드 API가 정상 동작해야 프론트엔드 테스트 가능
- `/check` API: 빠른 응답 (1~2초)
- `/parse` API: 백그라운드 처리 (25초)

### 테스트 데이터

- 샘플 PDF: `~/aims/samples/pdf/annual_report_sample.pdf`
- 테스트 고객: DB에 "안영미" 고객 필요
- 동명이인 테스트: 같은 이름의 고객 2명 이상 필요

### 디자인 일관성

- 기존 AIMS UIX3 스타일 시스템 준수
- CSS 변수 사용 필수
- 하드코딩된 색상 금지

---

**준비 완료! Phase 1부터 시작합니다.**
