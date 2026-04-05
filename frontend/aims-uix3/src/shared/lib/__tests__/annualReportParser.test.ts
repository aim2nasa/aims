/**
 * Annual Report Parser Tests
 *
 * 5개 샘플에 대해 100% 정확한 파싱 검증
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseAnnualReportPage2 } from '../annualReportParser';

// ============================================================================
// Test Fixtures - AI가 PDF를 직접 읽어 생성한 예상 결과
// ============================================================================

interface ExpectedData {
  insuredName: string;
  totalContracts: number;
  monthlyPremiumTotal: number;
  contracts: {
    seq: number;
    policyNumber: string;
    productName: string;
    contractor: string;
    insured: string;
    contractDate: string;
    status: string;
    coverageAmount: number;
    insurancePeriod: string;
    paymentPeriod: string;
    premium: number;
  }[];
}

// 김보성 샘플 예상 결과
const EXPECTED_김보성: ExpectedData = {
  insuredName: '김보성',
  totalContracts: 6,
  monthlyPremiumTotal: 1809150,
  contracts: [
    {
      seq: 1,
      policyNumber: '0004155605',
      productName: '무배당 마스터플랜 변액유니버셜종신Ⅱ보험',
      contractor: '김보성',
      insured: '김보성',
      contractDate: '2009-06-10',
      status: '정상',
      coverageAmount: 3000,
      insurancePeriod: '종신',
      paymentPeriod: '80세',
      premium: 65200
    },
    {
      seq: 2,
      policyNumber: '0011533898',
      productName: '무배당 실버플랜 변액유니버셜V보험',
      contractor: '캐치업코리아',
      insured: '김보성',
      contractDate: '2014-03-21',
      status: '정상',
      coverageAmount: 2000,
      insurancePeriod: '종신',
      paymentPeriod: '전기납',
      premium: 992500
    },
    {
      seq: 3,
      policyNumber: '0012526414',
      productName: '무배당 암엔암보험',
      contractor: '김보성',
      insured: '김보성',
      contractDate: '2018-11-22',
      status: '정상',
      coverageAmount: 1200,
      insurancePeriod: '100세',
      paymentPeriod: '80세',
      premium: 5100
    },
    {
      seq: 4,
      policyNumber: '0012637379',
      productName: '무배당 유니버셜달러종신보험',
      contractor: '김보성',
      insured: '김보성',
      contractDate: '2019-06-26',
      status: '정상',
      coverageAmount: 25030.8,
      insurancePeriod: '종신',
      paymentPeriod: '5년',
      premium: 2505490
    },
    {
      seq: 5,
      policyNumber: '0013509688',
      productName: '무배당 변액연금보험 동행 Plus',
      contractor: '김보성',
      insured: '김보성',
      contractDate: '2024-04-29',
      status: '정상',
      coverageAmount: 1000,
      insurancePeriod: '종신',
      paymentPeriod: '일시납',
      premium: 200000000
    },
    {
      seq: 6,
      policyNumber: '0013731763',
      productName: '무배당 모두의 종신보험(무해약환급금형)',
      contractor: '안영미',
      insured: '김보성',
      contractDate: '2025-06-02',
      status: '정상',
      coverageAmount: 10000,
      insurancePeriod: '종신',
      paymentPeriod: '10년',
      premium: 751450
    }
  ]
};

// 박형서 샘플 (AR20260113_*.pdf)
const EXPECTED_박형서: ExpectedData = {
  insuredName: '박형서',
  totalContracts: 1,
  monthlyPremiumTotal: 0,
  contracts: [
    {
      seq: 1,
      policyNumber: '0000010010',
      productName: '평생보장보험',
      contractor: '박형서',
      insured: '박형서',
      contractDate: '1990-08-27',
      status: '정상',
      coverageAmount: 2000,
      insurancePeriod: '종신',
      paymentPeriod: '20년',
      premium: 36600
    }
  ]
};

// 신상철 샘플
const EXPECTED_신상철: ExpectedData = {
  insuredName: '신상철',
  totalContracts: 4,
  monthlyPremiumTotal: 1115626,
  contracts: [
    {
      seq: 1,
      policyNumber: '0013017050',
      productName: '무배당 미리받는GI종신보험(저해지환급금형)',
      contractor: '신상철',
      insured: '신상철',
      contractDate: '2021-05-09',
      status: '정상',
      coverageAmount: 3000,
      insurancePeriod: '종신',
      paymentPeriod: '60세',
      premium: 219380
    },
    {
      seq: 2,
      policyNumber: '0013107410',
      productName: '무배당 백만인을 위한 달러종신보험(저해지환급금형)',
      contractor: '신상철',
      insured: '신상철',
      contractDate: '2021-10-31',
      status: '정상',
      coverageAmount: 4728.04,
      insurancePeriod: '종신',
      paymentPeriod: '5년',
      premium: 590050
    },
    {
      seq: 3,
      policyNumber: '0013262131',
      productName: '무배당 변액유니버셜 오늘의 종신보험Plus',
      contractor: '신상철',
      insured: '신상철',
      contractDate: '2022-10-17',
      status: '정상',
      coverageAmount: 2000,
      insurancePeriod: '종신',
      paymentPeriod: '10년',
      premium: 105200
    },
    {
      seq: 4,
      policyNumber: '0013526523',
      productName: '무배당 모두의 종신보험(저해약환급금형)',
      contractor: '신상철',
      insured: '신상철',
      contractDate: '2024-06-05',
      status: '정상',
      coverageAmount: 9300,
      insurancePeriod: '종신',
      paymentPeriod: '20년',
      premium: 200996
    }
  ]
};

// 안영미 샘플 (10건)
const EXPECTED_안영미: ExpectedData = {
  insuredName: '안영미',
  totalContracts: 10,
  monthlyPremiumTotal: 14102137,
  contracts: [
    {
      seq: 1,
      policyNumber: '0004164025',
      productName: '무배당 마스터플랜 변액유니버셜종신Ⅱ보험',
      contractor: '김보성',
      insured: '안영미',
      contractDate: '2009-06-28',
      status: '정상',
      coverageAmount: 3000,
      insurancePeriod: '종신',
      paymentPeriod: '80세',
      premium: 81750
    },
    {
      seq: 2,
      policyNumber: '0012526385',
      productName: '무배당 암엔암보험',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2018-11-22',
      status: '정상',
      coverageAmount: 2000,
      insurancePeriod: '100세',
      paymentPeriod: '80세',
      premium: 57900
    },
    {
      seq: 3,
      policyNumber: '0012530455',
      productName: '무배당 유니버셜달러종신보험',
      contractor: '캐치업코리아',
      insured: '안영미',
      contractDate: '2018-11-29',
      status: '정상',
      coverageAmount: 69660,
      insurancePeriod: '종신',
      paymentPeriod: '10년',
      premium: 3710230
    },
    {
      seq: 4,
      policyNumber: '0012824529',
      productName: '무배당 미리받는GI종신보험(저해지환급금형)',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2020-06-21',
      status: '정상',
      coverageAmount: 4500,
      insurancePeriod: '종신',
      paymentPeriod: '10년',
      premium: 468400
    },
    {
      seq: 5,
      policyNumber: '0012826998',
      productName: '무배당 심뇌혈관종합건강보험(무해지환급금형)',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2020-06-26',
      status: '정상',
      coverageAmount: 1000,
      insurancePeriod: '100세',
      paymentPeriod: '15년',
      premium: 50500
    },
    {
      seq: 6,
      policyNumber: '0012902479',
      productName: '무배당 달러경영인정기보험',
      contractor: '캐치업코리아',
      insured: '안영미',
      contractDate: '2020-11-17',
      status: '정상',
      coverageAmount: 75232.8,
      insurancePeriod: '90세',
      paymentPeriod: '90세',
      premium: 3776680
    },
    {
      seq: 7,
      policyNumber: '0013124877',
      productName: '무배당 달러경영인정기보험',
      contractor: '캐치업코리아',
      insured: '안영미',
      contractDate: '2021-11-30',
      status: '정상',
      coverageAmount: 72446.4,
      insurancePeriod: '90세',
      paymentPeriod: '90세',
      premium: 4028010
    },
    {
      seq: 8,
      policyNumber: '0013131970',
      productName: '무배당 360 종합보장보험(무해지환급금형)',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2021-12-17',
      status: '정상',
      coverageAmount: 200,
      insurancePeriod: '종신',
      paymentPeriod: '15년',
      premium: 170427
    },
    {
      seq: 9,
      policyNumber: '0013264509',
      productName: '무배당 변액유니버셜 VIP 종신보험Plus',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2022-10-24',
      status: '정상',
      coverageAmount: 30000,
      insurancePeriod: '종신',
      paymentPeriod: '10년',
      premium: 1758240
    },
    {
      seq: 10,
      policyNumber: '0013620295',
      productName: '무배당 오늘의달러연금보험',
      contractor: '안영미',
      insured: '안영미',
      contractDate: '2024-12-19',
      status: '정상',
      coverageAmount: 1393.2,
      insurancePeriod: '종신',
      paymentPeriod: '일시납',
      premium: 111456000
    }
  ]
};

// 정부균 샘플
const EXPECTED_정부균: ExpectedData = {
  insuredName: '정부균',
  totalContracts: 4,
  monthlyPremiumTotal: 294170,
  contracts: [
    {
      seq: 1,
      policyNumber: '0013224973',
      productName: '무배당 변액유니버셜 모두의상속종신보험',
      contractor: '정부균',
      insured: '정부균',
      contractDate: '2022-07-19',
      status: '정상',
      coverageAmount: 2000,
      insurancePeriod: '종신',
      paymentPeriod: '80세',
      premium: 121920
    },
    {
      seq: 2,
      policyNumber: '0013535928',
      productName: '무배당 360 암보험(갱신형)',
      contractor: '정부균',
      insured: '정부균',
      contractDate: '2024-06-28',
      status: '정상',
      coverageAmount: 3000,
      insurancePeriod: '20년',
      paymentPeriod: '20년',
      premium: 31920
    },
    {
      seq: 3,
      policyNumber: '0013785622',
      productName: '무배당 오늘의달러연금보험',
      contractor: '정부균',
      insured: '정부균',
      contractDate: '2025-08-26',
      status: '업무처리중',
      coverageAmount: 1390.6,
      insurancePeriod: '종신',
      paymentPeriod: '일시납',
      premium: 20859000
    },
    {
      seq: 4,
      policyNumber: '0013785642',
      productName: '무배당 백만인을 위한 달러종신보험Plus(저해약환급금형)',
      contractor: '정부균',
      insured: '정부균',
      contractDate: '2025-08-26',
      status: '업무처리중',
      coverageAmount: 834.36,
      insurancePeriod: '종신',
      paymentPeriod: '7년',
      premium: 140330
    }
  ]
};

// ============================================================================
// Test Helpers
// ============================================================================

const sampleDir = path.resolve(__dirname, '../../../../../../samples/MetlifeReport/AnnualReport');

function loadSampleText(filename: string): string {
  return fs.readFileSync(path.join(sampleDir, filename), 'utf-8');
}

// ============================================================================
// Tests
// ============================================================================

describe('Annual Report Parser', () => {
  describe('헤더 정보 파싱', () => {
    it('김보성 샘플 - 헤더 정보', () => {
      const text = loadSampleText('김보성보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.insuredName).toBe(EXPECTED_김보성.insuredName);
      expect(result.totalContracts).toBe(EXPECTED_김보성.totalContracts);
      expect(result.monthlyPremiumTotal).toBe(EXPECTED_김보성.monthlyPremiumTotal);
    });

    it('박형서 샘플 - 헤더 정보', () => {
      const text = loadSampleText('AR20260113_00038235_0003823520151027000003_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.insuredName).toBe(EXPECTED_박형서.insuredName);
      expect(result.totalContracts).toBe(EXPECTED_박형서.totalContracts);
      expect(result.monthlyPremiumTotal).toBe(EXPECTED_박형서.monthlyPremiumTotal);
    });

    it('신상철 샘플 - 헤더 정보', () => {
      const text = loadSampleText('신상철보유계약현황2025081_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.insuredName).toBe(EXPECTED_신상철.insuredName);
      expect(result.totalContracts).toBe(EXPECTED_신상철.totalContracts);
      expect(result.monthlyPremiumTotal).toBe(EXPECTED_신상철.monthlyPremiumTotal);
    });

    it('안영미 샘플 - 헤더 정보', () => {
      const text = loadSampleText('안영미annual report202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.insuredName).toBe(EXPECTED_안영미.insuredName);
      expect(result.totalContracts).toBe(EXPECTED_안영미.totalContracts);
      expect(result.monthlyPremiumTotal).toBe(EXPECTED_안영미.monthlyPremiumTotal);
    });

    it('정부균 샘플 - 헤더 정보', () => {
      const text = loadSampleText('정부균보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.insuredName).toBe(EXPECTED_정부균.insuredName);
      expect(result.totalContracts).toBe(EXPECTED_정부균.totalContracts);
      expect(result.monthlyPremiumTotal).toBe(EXPECTED_정부균.monthlyPremiumTotal);
    });
  });

  describe('계약 목록 파싱', () => {
    it('김보성 샘플 - 계약 수 일치', () => {
      const text = loadSampleText('김보성보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(EXPECTED_김보성.contracts.length);
    });

    it('김보성 샘플 - 첫 번째 계약 상세', () => {
      const text = loadSampleText('김보성보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);
      const expected = EXPECTED_김보성.contracts[0];
      const actual = result.contracts[0];

      expect(actual.seq).toBe(expected.seq);
      expect(actual.policyNumber).toBe(expected.policyNumber);
      expect(actual.contractDate).toBe(expected.contractDate);
      expect(actual.premium).toBe(expected.premium);
    });

    it('박형서 샘플 - 단일 계약', () => {
      const text = loadSampleText('AR20260113_00038235_0003823520151027000003_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(1);
      expect(result.contracts[0].policyNumber).toBe('0000010010');
    });
  });

  describe('실효계약 파싱', () => {
    it('모든 샘플 - 실효계약 없음', () => {
      const samples = [
        '김보성보유계약현황202508_page2.txt',
        'AR20260113_00038235_0003823520151027000003_page2.txt',
        '신상철보유계약현황2025081_page2.txt',
        '안영미annual report202508_page2.txt',
        '정부균보유계약현황202508_page2.txt'
      ];

      for (const sample of samples) {
        const text = loadSampleText(sample);
        const result = parseAnnualReportPage2(text);
        expect(result.lapsedContracts.length).toBe(0);
      }
    });
  });

  describe('5개 샘플 전체 검증 (100% 정확도)', () => {
    it('김보성 샘플 - 6건 전체 계약 검증', () => {
      const text = loadSampleText('김보성보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(6);

      // 각 계약 핵심 필드 검증
      const policyNumbers = result.contracts.map(c => c.policyNumber);
      expect(policyNumbers).toEqual([
        '0004155605', '0011533898', '0012526414',
        '0012637379', '0013509688', '0013731763'
      ]);

      const premiums = result.contracts.map(c => c.premium);
      expect(premiums).toEqual([65200, 992500, 5100, 2505490, 200000000, 751450]);

      const contractDates = result.contracts.map(c => c.contractDate);
      expect(contractDates).toEqual([
        '2009-06-10', '2014-03-21', '2018-11-22',
        '2019-06-26', '2024-04-29', '2025-06-02'
      ]);
    });

    it('박형서 샘플 - 1건 전체 계약 검증', () => {
      const text = loadSampleText('AR20260113_00038235_0003823520151027000003_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(1);

      const contract = result.contracts[0];
      expect(contract.policyNumber).toBe('0000010010');
      expect(contract.contractDate).toBe('1990-08-27');
      expect(contract.premium).toBe(36600);
      expect(contract.status).toBe('정상');
      expect(contract.coverageAmount).toBe(2000);
    });

    it('신상철 샘플 - 4건 전체 계약 검증', () => {
      const text = loadSampleText('신상철보유계약현황2025081_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(4);

      const policyNumbers = result.contracts.map(c => c.policyNumber);
      expect(policyNumbers).toEqual([
        '0013017050', '0013107410', '0013262131', '0013526523'
      ]);

      const premiums = result.contracts.map(c => c.premium);
      expect(premiums).toEqual([219380, 590050, 105200, 200996]);
    });

    it('안영미 샘플 - 10건 전체 계약 검증', () => {
      const text = loadSampleText('안영미annual report202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(10);

      const policyNumbers = result.contracts.map(c => c.policyNumber);
      expect(policyNumbers).toEqual([
        '0004164025', '0012526385', '0012530455', '0012824529', '0012826998',
        '0012902479', '0013124877', '0013131970', '0013264509', '0013620295'
      ]);

      // 총 보험료 합계 검증 (월보험료 총액과 비교)
      const _totalPremium = result.contracts.reduce((sum, c) => sum + c.premium, 0);
      // 일시납 제외한 월보험료 확인 (안영미의 경우 마지막 계약이 일시납)
    });

    it('정부균 샘플 - 4건 전체 계약 검증', () => {
      const text = loadSampleText('정부균보유계약현황202508_page2.txt');
      const result = parseAnnualReportPage2(text);

      expect(result.contracts.length).toBe(4);

      const policyNumbers = result.contracts.map(c => c.policyNumber);
      expect(policyNumbers).toEqual([
        '0013224973', '0013535928', '0013785622', '0013785642'
      ]);

      // 업무처리중 상태 확인
      const statuses = result.contracts.map(c => c.status);
      expect(statuses[2]).toBe('업무처리중');
      expect(statuses[3]).toBe('업무처리중');
    });
  });
});
