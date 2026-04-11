/**
 * Issue #65 회귀 테스트 — AnnualReportTab.transform.mapRawContract /
 * transformRawAnnualReport 가 백엔드 영문 키(contract_number, product_name, ...)를
 * 읽어서 AnnualReport.contracts 를 올바르게 구성하는지 검증.
 *
 * #58 에서 DB 와 API 를 영문 키로 통일했으나 AnnualReportTab 의 mapContract 가
 * 여전히 한글 키만 매핑하여 AR 모달이 비어 보이던 버그를 고정한다.
 */
import { describe, it, expect } from 'vitest';
import {
  mapRawContract,
  transformRawAnnualReport,
  type RawAnnualReportContract,
  type RawAnnualReportData,
} from '../AnnualReportTab.transform';

describe('AnnualReportTab.transform — English keys (issue #65)', () => {
  it('영문 키로 반환된 계약을 그대로 매핑한다', () => {
    const raw: RawAnnualReportContract = {
      seq: 1,
      contract_number: '0013685117',
      product_name: '무배당 360 종합보장보험',
      contractor_name: '이율',
      insured_name: '이율',
      contract_date: '2025-03-23',
      status: '정상',
      coverage_amount: 200,
      insurance_period: '종신',
      premium_payment_period: '30년',
      monthly_premium: 32308,
    };

    const result = mapRawContract(raw, 'MetLife');

    expect(result.contract_number).toBe('0013685117');
    expect(result.product_name).toBe('무배당 360 종합보장보험');
    expect(result.contractor_name).toBe('이율');
    expect(result.insured_name).toBe('이율');
    expect(result.contract_date).toBe('2025-03-23');
    expect(result.status).toBe('정상');
    expect(result.coverage_amount).toBe(200); // 만원 단위 유지
    expect(result.insurance_period).toBe('종신');
    expect(result.premium_payment_period).toBe('30년');
    expect(result.monthly_premium).toBe(32308);
    expect(result.insurance_company).toBe('MetLife');
  });

  it('한글 키 레거시 데이터도 매핑한다 (fallback)', () => {
    const raw: RawAnnualReportContract = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({} as any),
      '증권번호': 'LEGACY-001',
      '보험상품': '종신보험',
      '계약자': '김철수',
      '피보험자': '김영희',
      '계약일': '2020-01-15',
      '계약상태': '유지',
      '가입금액(만원)': 1000,
      '보험기간': '종신',
      '납입기간': '20년',
      '보험료(원)': 50000,
    };

    const result = mapRawContract(raw, 'MetLife');

    expect(result.contract_number).toBe('LEGACY-001');
    expect(result.product_name).toBe('종신보험');
    expect(result.contractor_name).toBe('김철수');
    expect(result.insured_name).toBe('김영희');
    expect(result.coverage_amount).toBe(1000);
    expect(result.monthly_premium).toBe(50000);
  });

  it('영문 키가 우선하고 한글 키는 fallback 이다', () => {
    const raw: RawAnnualReportContract = {
      contract_number: 'EN-001',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ '증권번호': 'KO-999' } as any),
    };
    const result = mapRawContract(raw, 'MetLife');
    expect(result.contract_number).toBe('EN-001');
  });

  it('필드가 누락되면 빈 문자열/0 을 반환한다', () => {
    const result = mapRawContract({}, 'MetLife');
    expect(result.contract_number).toBe('');
    expect(result.product_name).toBe('');
    expect(result.contractor_name).toBe('');
    expect(result.insured_name).toBe('');
    expect(result.status).toBe('');
    expect(result.contract_date).toBe('');
    expect(result.insurance_period).toBe('');
    expect(result.premium_payment_period).toBe('');
    expect(result.coverage_amount).toBe(0);
    expect(result.monthly_premium).toBe(0);
    expect(result.insurance_company).toBe('MetLife');
  });

  it('report.insurer_name 을 fallback 보험사로 사용한다', () => {
    const raw: RawAnnualReportContract = { contract_number: 'A' };
    expect(mapRawContract(raw, 'MetLife').insurance_company).toBe('MetLife');
    expect(mapRawContract(raw, '삼성생명').insurance_company).toBe('삼성생명');
  });

  it('monthly_premium 이 0 인 경우에도 0 을 반환한다 (?? 연산자)', () => {
    const raw: RawAnnualReportContract = {
      contract_number: 'A',
      monthly_premium: 0,
    };
    const result = mapRawContract(raw, 'MetLife');
    expect(result.monthly_premium).toBe(0);
  });

  it('transformRawAnnualReport 가 contracts 와 lapsed_contracts 모두 매핑한다', () => {
    const raw: RawAnnualReportData = {
      file_id: 'file-1',
      customer_name: '이율',
      issue_date: '2025-08-28',
      insurer_name: 'MetLife',
      total_monthly_premium: 246002,
      total_contracts: 3,
      contracts: [
        {
          contract_number: '0013685117',
          product_name: '무배당 360 종합보장보험',
          contractor_name: '이율',
          insured_name: '이율',
          contract_date: '2025-03-23',
          status: '정상',
          coverage_amount: 200,
          insurance_period: '종신',
          premium_payment_period: '30년',
          monthly_premium: 32308,
        },
      ],
      lapsed_contracts: [
        {
          contract_number: 'LAPSED-1',
          product_name: '실효계약',
          monthly_premium: 1000,
        },
      ],
      status: 'completed',
    };

    const result = transformRawAnnualReport(raw);

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].contract_number).toBe('0013685117');
    expect(result.contracts[0].product_name).toBe('무배당 360 종합보장보험');
    expect(result.contracts[0].coverage_amount).toBe(200);
    expect(result.contracts[0].insurance_company).toBe('MetLife');

    expect(result.lapsed_contracts).toHaveLength(1);
    expect(result.lapsed_contracts![0].contract_number).toBe('LAPSED-1');

    expect(result.customer_name).toBe('이율');
    expect(result.total_monthly_premium).toBe(246002);
    expect(result.report_id).toBe('file-1');
  });

  it('insurer_name 이 없으면 기본 "메트라이프" fallback 을 사용한다', () => {
    const raw: RawAnnualReportData = {
      file_id: 'f',
      contracts: [{ contract_number: 'A' }],
    };
    const result = transformRawAnnualReport(raw);
    expect(result.contracts[0].insurance_company).toBe('메트라이프');
  });
});
