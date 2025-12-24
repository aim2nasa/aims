/**
 * AIMS MCP e2e 테스트용 Fixtures 로더
 *
 * 사용법:
 * ```typescript
 * import { fixtures, loadCustomers, loadContracts, getFilePath } from '../fixtures';
 *
 * const customers = loadCustomers();
 * const filePath = getFilePath('sample_insurance_certificate.pdf');
 * ```
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

export interface CustomerFixture {
  id: string;
  personal_info: {
    name: string;
    mobile_phone?: string;
    email?: string;
    birth_date?: string;
    address?: {
      address1?: string;
      address2?: string;
      zip?: string;
    };
  };
  insurance_info: {
    customer_type: '개인' | '법인';
    business_number?: string;
    representative?: string;
  };
  memo?: string;
}

export interface ContractFixture {
  id: string;
  customer_ref: string;
  policy_number: string;
  product_name: string;
  insurer_name: string;
  status: string;
  contract_date: string;
  payment_period: string;
  expiry_date?: string;
  expiry_date_relative_days?: number;
  premium: number;
  payment_method?: string;
  payment_status?: string;
  insured_name?: string;
  insured_birth_date?: string;
  beneficiary_name?: string;
  coverage_amount?: number;
  riders?: Array<{ name: string; coverage: number }>;
  vehicle_info?: {
    model: string;
    year: number;
    plate: string;
  };
  group_info?: {
    employee_count: number;
    coverage_per_person: number;
  };
}

export interface RelationshipFixture {
  id: string;
  from_customer_ref: string;
  to_customer_ref: string;
  relationship_type: string;
  relationship_category: 'family' | 'social' | 'professional';
  is_bidirectional: boolean;
  notes?: string;
}

export interface DocumentFixture {
  id: string;
  customer_ref: string;
  file_ref: string;
  original_name: string;
  mime_type: string;
  is_annual_report: boolean;
  ar_parsing_status?: string;
  tags: string[];
  summary: string;
}

export interface FixtureData {
  customers: CustomerFixture[];
  contracts: ContractFixture[];
  relationships: RelationshipFixture[];
  documents: DocumentFixture[];
}

// ============================================================================
// Fixture Loaders
// ============================================================================

function loadJson<T>(relativePath: string): T {
  const fullPath = join(__dirname, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Fixture file not found: ${fullPath}`);
  }
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 고객 fixtures 로드
 */
export function loadCustomers(): CustomerFixture[] {
  const data = loadJson<{ customers: CustomerFixture[] }>('customers/index.json');
  return data.customers;
}

/**
 * 계약 fixtures 로드
 * @param resolveRelativeDates - true면 expiry_date_relative_days를 실제 날짜로 변환
 */
export function loadContracts(resolveRelativeDates = true): ContractFixture[] {
  const data = loadJson<{ contracts: ContractFixture[] }>('contracts/index.json');

  if (resolveRelativeDates) {
    return data.contracts.map(contract => {
      if (contract.expiry_date_relative_days !== undefined) {
        const date = new Date();
        date.setDate(date.getDate() + contract.expiry_date_relative_days);
        return {
          ...contract,
          expiry_date: date.toISOString().split('T')[0],
        };
      }
      return contract;
    });
  }

  return data.contracts;
}

/**
 * 관계 fixtures 로드
 */
export function loadRelationships(): RelationshipFixture[] {
  const data = loadJson<{ relationships: RelationshipFixture[] }>('relationships/index.json');
  return data.relationships;
}

/**
 * 문서 fixtures 로드
 */
export function loadDocuments(): DocumentFixture[] {
  const data = loadJson<{ documents: DocumentFixture[] }>('documents/index.json');
  return data.documents;
}

/**
 * 모든 fixtures 로드
 */
export function loadAllFixtures(): FixtureData {
  return {
    customers: loadCustomers(),
    contracts: loadContracts(),
    relationships: loadRelationships(),
    documents: loadDocuments(),
  };
}

// ============================================================================
// File Helpers
// ============================================================================

/**
 * 샘플 파일의 절대 경로 반환
 */
export function getFilePath(filename: string): string {
  const filePath = join(__dirname, 'files', filename);
  if (!existsSync(filePath)) {
    throw new Error(`Sample file not found: ${filePath}`);
  }
  return filePath;
}

/**
 * 샘플 파일의 Buffer 반환
 */
export function getFileBuffer(filename: string): Buffer {
  return readFileSync(getFilePath(filename));
}

/**
 * 사용 가능한 샘플 파일 목록
 */
export function listSampleFiles(): string[] {
  const filesDir = join(__dirname, 'files');
  return readdirSync(filesDir).filter(f => !f.endsWith('.txt'));
}

// ============================================================================
// Test Data Builders
// ============================================================================

/**
 * 고객 ID로 고객 찾기
 */
export function findCustomer(id: string): CustomerFixture | undefined {
  return loadCustomers().find(c => c.id === id);
}

/**
 * 고객의 계약 목록 가져오기
 */
export function getContractsForCustomer(customerRef: string): ContractFixture[] {
  return loadContracts().filter(c => c.customer_ref === customerRef);
}

/**
 * 고객의 문서 목록 가져오기
 */
export function getDocumentsForCustomer(customerRef: string): DocumentFixture[] {
  return loadDocuments().filter(d => d.customer_ref === customerRef);
}

/**
 * 고객의 관계 목록 가져오기
 */
export function getRelationshipsForCustomer(customerRef: string): RelationshipFixture[] {
  return loadRelationships().filter(
    r => r.from_customer_ref === customerRef || r.to_customer_ref === customerRef
  );
}

/**
 * 만기 임박 계약 가져오기 (N일 이내)
 */
export function getExpiringContracts(withinDays: number): ContractFixture[] {
  const contracts = loadContracts(true);
  const now = new Date();

  return contracts.filter(c => {
    if (!c.expiry_date) return false;
    const expiryDate = new Date(c.expiry_date);
    const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= withinDays;
  });
}

/**
 * 특정 월에 생일인 고객 가져오기
 */
export function getCustomersByBirthMonth(month: number): CustomerFixture[] {
  return loadCustomers().filter(c => {
    if (!c.personal_info.birth_date) return false;
    const birthMonth = new Date(c.personal_info.birth_date).getMonth() + 1;
    return birthMonth === month;
  });
}

// ============================================================================
// Test Scenario Presets
// ============================================================================

/**
 * 가족 관계 테스트 시나리오
 * 홍길동 - 김영희 (배우자) - 홍민수 (자녀)
 */
export function getFamilyScenario() {
  const hong = findCustomer('customer_hong')!;
  const kim = findCustomer('customer_kim')!;
  const minsu = findCustomer('customer_hongminsu')!;

  return {
    father: hong,
    mother: kim,
    child: minsu,
    relationships: loadRelationships().filter(r =>
      ['customer_hong', 'customer_kim', 'customer_hongminsu'].includes(r.from_customer_ref) &&
      ['customer_hong', 'customer_kim', 'customer_hongminsu'].includes(r.to_customer_ref)
    ),
  };
}

/**
 * 법인 고객 시나리오
 */
export function getCorporateScenario() {
  const corp = findCustomer('customer_corp_test')!;
  const contracts = getContractsForCustomer('customer_corp_test');
  const documents = getDocumentsForCustomer('customer_corp_test');

  return { customer: corp, contracts, documents };
}

/**
 * Annual Report 테스트 시나리오
 */
export function getAnnualReportScenario() {
  const documents = loadDocuments().filter(d => d.is_annual_report);
  const completedAR = documents.filter(d => d.ar_parsing_status === 'completed');
  const pendingAR = documents.filter(d => d.ar_parsing_status === 'pending');

  return { allARs: documents, completed: completedAR, pending: pendingAR };
}

// ============================================================================
// Export Default
// ============================================================================

export const fixtures = {
  loadCustomers,
  loadContracts,
  loadRelationships,
  loadDocuments,
  loadAllFixtures,
  getFilePath,
  getFileBuffer,
  findCustomer,
  getContractsForCustomer,
  getDocumentsForCustomer,
  getRelationshipsForCustomer,
  getExpiringContracts,
  getCustomersByBirthMonth,
  getFamilyScenario,
  getCorporateScenario,
  getAnnualReportScenario,
};

export default fixtures;
