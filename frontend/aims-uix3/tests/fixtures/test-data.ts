/**
 * 테스트 데이터 팩토리
 */

/**
 * 가상 설계사 데이터
 */
export interface TestAgent {
  id: string;
  name: string;
  email: string;
}

/**
 * 가상 고객 데이터
 */
export interface TestCustomer {
  name: string;
  customerType: '개인' | '법인';
  mobilePhone: string;
  email: string;
  birthDate?: string;
  postalCode?: string;
  address1?: string;
  address2?: string;
}

/**
 * 테스트용 설계사 목록
 */
export const TEST_AGENTS: TestAgent[] = [
  { id: 'agent-001', name: '김설계', email: 'kim@test.com' },
  { id: 'agent-002', name: '이설계', email: 'lee@test.com' },
  { id: 'agent-003', name: '박설계', email: 'park@test.com' },
];

/**
 * 랜덤 4자리 숫자 생성
 */
function randomDigits(length: number): string {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, '0');
}

/**
 * 고객 데이터 생성
 */
export function generateCustomer(prefix: string, index: number): TestCustomer {
  const timestamp = Date.now();
  const isPersonal = index % 2 === 0;

  return {
    name: `${prefix}_고객${index}_${timestamp}`,
    customerType: isPersonal ? '개인' : '법인',
    mobilePhone: `010-${randomDigits(4)}-${randomDigits(4)}`,
    email: `${prefix.toLowerCase()}${index}@test.com`,
    birthDate: isPersonal ? '1985-03-15' : undefined,
    postalCode: randomDigits(5),
    address1: `서울시 강남구 테스트로 ${index + 1}`,
    address2: `${100 + index}호`,
  };
}

/**
 * 여러 고객 데이터 생성
 */
export function generateCustomers(prefix: string, count: number): TestCustomer[] {
  return Array.from({ length: count }, (_, i) => generateCustomer(prefix, i + 1));
}
