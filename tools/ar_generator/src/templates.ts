/**
 * AR 템플릿 및 샘플 데이터
 */

import type { Contract, ARGenerateOptions, ARTemplatePreset } from './types.js';

/** 샘플 보험상품 목록 */
const SAMPLE_PRODUCTS = [
  '무배당 미리받는GI종신보험(저해지환급금형)',
  '무배당 백만인을위한달러종신보험(저해지환급금형)',
  '무배당 변액유니버셜 오늘의 종신보험 Plus',
  '무배당 모두의 종신보험(저해약환급금형)',
  '무배당 새희망 정기보험',
  '무배당 암보험(갱신형)',
  '무배당 실손의료비보험(갱신형)',
  '무배당 어린이보험(자녀사랑)',
  '무배당 연금저축보험',
  '무배당 변액연금보험',
];

/** 샘플 고객명 */
const SAMPLE_NAMES = [
  '김철수', '이영희', '박민수', '최지영', '정대호',
  '강수진', '조현우', '윤미래', '장동건', '한소희',
  '오세훈', '신동엽', '임수정', '배용준', '손예진',
];

/** 샘플 FSR 이름 */
const SAMPLE_FSR_NAMES = [
  '송유미', '김재인', '박설계', '이상담', '최보험',
];

/** 랜덤 정수 생성 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 랜덤 요소 선택 */
function randomPick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

/** 랜덤 날짜 생성 (과거 N년 내) */
function randomDate(yearsBack: number = 5): string {
  const now = new Date();
  const pastDate = new Date(
    now.getFullYear() - randomInt(0, yearsBack),
    randomInt(0, 11),
    randomInt(1, 28)
  );
  return pastDate.toISOString().split('T')[0];
}

/** 오늘 날짜 */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** 증권번호 생성 */
function generatePolicyNumber(): string {
  return `001${randomInt(1000000, 9999999)}`;
}

/** 랜덤 계약 생성 */
export function generateRandomContract(
  index: number,
  customerName: string,
  status: '정상' | '실효' | '해지' | '만기' = '정상'
): Contract {
  const 보험료 = randomInt(50000, 800000);
  const 가입금액 = randomInt(1000, 20000);

  return {
    순번: index,
    증권번호: generatePolicyNumber(),
    보험상품: randomPick(SAMPLE_PRODUCTS),
    계약자: customerName,
    피보험자: customerName,
    계약일: randomDate(5),
    계약상태: status,
    '가입금액(만원)': 가입금액,
    보험기간: randomPick(['종신', '80세', '100세', '20년', '30년']),
    납입기간: randomPick(['10년', '15년', '20년', '60세', '65세', '전기납']),
    '보험료(원)': 보험료,
  };
}

/** 프리셋에 따른 AR 옵션 생성 */
export function generateFromPreset(
  preset: ARTemplatePreset,
  overrides?: Partial<ARGenerateOptions>
): ARGenerateOptions {
  const customerName = overrides?.customerName || randomPick(SAMPLE_NAMES);
  const issueDate = overrides?.issueDate || today();
  const fsrName = overrides?.fsrName || randomPick(SAMPLE_FSR_NAMES);

  let contracts: Contract[] = [];
  let lapsedContracts: Contract[] = [];

  switch (preset) {
    case 'basic':
      // 기본: 3-5개 정상 계약
      const basicCount = randomInt(3, 5);
      for (let i = 1; i <= basicCount; i++) {
        contracts.push(generateRandomContract(i, customerName, '정상'));
      }
      break;

    case 'single':
      // 단일 계약
      contracts.push(generateRandomContract(1, customerName, '정상'));
      break;

    case 'many':
      // 다수 계약 (10-15개)
      const manyCount = randomInt(10, 15);
      for (let i = 1; i <= manyCount; i++) {
        contracts.push(generateRandomContract(i, customerName, '정상'));
      }
      break;

    case 'with_lapsed':
      // 정상 3개 + 실효 2개
      for (let i = 1; i <= 3; i++) {
        contracts.push(generateRandomContract(i, customerName, '정상'));
      }
      for (let i = 1; i <= 2; i++) {
        lapsedContracts.push(generateRandomContract(i, customerName, '실효'));
      }
      break;

    case 'all_lapsed':
      // 모든 계약 실효
      for (let i = 1; i <= 4; i++) {
        lapsedContracts.push(generateRandomContract(i, customerName, '실효'));
      }
      break;

    case 'mixed_status':
      // 다양한 상태 혼합
      contracts.push(generateRandomContract(1, customerName, '정상'));
      contracts.push(generateRandomContract(2, customerName, '정상'));
      contracts.push(generateRandomContract(3, customerName, '만기'));
      lapsedContracts.push(generateRandomContract(1, customerName, '실효'));
      lapsedContracts.push(generateRandomContract(2, customerName, '해지'));
      break;

    case 'empty':
      // 계약 없음 (엣지케이스)
      break;
  }

  return {
    customerName,
    issueDate,
    fsrName,
    contracts,
    lapsedContracts: lapsedContracts.length > 0 ? lapsedContracts : undefined,
    ...overrides,
  };
}

/** 특정 고객 데이터로 AR 옵션 생성 */
export function generateCustomAR(
  customerName: string,
  contracts: Partial<Contract>[],
  options?: {
    issueDate?: string;
    fsrName?: string;
    lapsedContracts?: Partial<Contract>[];
  }
): ARGenerateOptions {
  const fullContracts = contracts.map((c, i) => ({
    순번: i + 1,
    증권번호: c.증권번호 || generatePolicyNumber(),
    보험상품: c.보험상품 || randomPick(SAMPLE_PRODUCTS),
    계약자: c.계약자 || customerName,
    피보험자: c.피보험자 || customerName,
    계약일: c.계약일 || randomDate(5),
    계약상태: c.계약상태 || '정상',
    '가입금액(만원)': c['가입금액(만원)'] || randomInt(1000, 10000),
    보험기간: c.보험기간 || '종신',
    납입기간: c.납입기간 || '20년',
    '보험료(원)': c['보험료(원)'] || randomInt(100000, 500000),
  } as Contract));

  return {
    customerName,
    issueDate: options?.issueDate || today(),
    fsrName: options?.fsrName || randomPick(SAMPLE_FSR_NAMES),
    contracts: fullContracts,
    lapsedContracts: options?.lapsedContracts?.map((c, i) => ({
      순번: i + 1,
      증권번호: c.증권번호 || generatePolicyNumber(),
      보험상품: c.보험상품 || randomPick(SAMPLE_PRODUCTS),
      계약자: c.계약자 || customerName,
      피보험자: c.피보험자 || customerName,
      계약일: c.계약일 || randomDate(5),
      계약상태: c.계약상태 || '실효',
      '가입금액(만원)': c['가입금액(만원)'] || randomInt(1000, 10000),
      보험기간: c.보험기간 || '종신',
      납입기간: c.납입기간 || '20년',
      '보험료(원)': c['보험료(원)'] || randomInt(100000, 500000),
    } as Contract)),
  };
}

/** 홍길동 고객 기본 템플릿 */
export const HONG_GIL_DONG_TEMPLATE: ARGenerateOptions = {
  customerName: '홍길동',
  issueDate: today(),
  fsrName: '송유미',
  contracts: [
    {
      순번: 1,
      증권번호: '0013017050',
      보험상품: '무배당 미리받는GI종신보험(저해지환급금형)',
      계약자: '홍길동',
      피보험자: '홍길동',
      계약일: '2021-05-09',
      계약상태: '정상',
      '가입금액(만원)': 3000,
      보험기간: '종신',
      납입기간: '60세',
      '보험료(원)': 219380,
    },
    {
      순번: 2,
      증권번호: '0013107410',
      보험상품: '무배당 백만인을위한달러종신보험(저해지환급금형)',
      계약자: '홍길동',
      피보험자: '홍길동',
      계약일: '2021-10-31',
      계약상태: '정상',
      '가입금액(만원)': 4728,
      보험기간: '종신',
      납입기간: '5년',
      '보험료(원)': 590050,
    },
    {
      순번: 3,
      증권번호: '0013262131',
      보험상품: '무배당 변액유니버셜 오늘의 종신보험 Plus',
      계약자: '홍길동',
      피보험자: '홍길동',
      계약일: '2022-10-17',
      계약상태: '정상',
      '가입금액(만원)': 2000,
      보험기간: '종신',
      납입기간: '10년',
      '보험료(원)': 105200,
    },
    {
      순번: 4,
      증권번호: '0013526523',
      보험상품: '무배당 모두의 종신보험(저해약환급금형)',
      계약자: '홍길동',
      피보험자: '홍길동',
      계약일: '2024-06-05',
      계약상태: '정상',
      '가입금액(만원)': 9300,
      보험기간: '종신',
      납입기간: '20년',
      '보험료(원)': 200996,
    },
  ],
};
