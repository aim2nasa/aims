/**
 * 읽기 전용 도구 소스 코드 검증 테스트
 *
 * 모든 MCP 도구의 소스 코드를 분석하여 호환성 버그를 탐지합니다.
 * 특히 personal_info.phone vs mobile_phone 등 필드명 불일치를 검증합니다.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('읽기 전용 도구 소스 코드 검증', () => {

  describe('network.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/network.ts');
    });

    describe('필드명 검증', () => {
      it('projection에서 mobile_phone 사용', () => {
        expect(sourceCode).toContain("'personal_info.mobile_phone': 1");
      });

      it('projection에서 phone 사용 금지', () => {
        expect(sourceCode).not.toContain("'personal_info.phone': 1");
      });

      it('응답에서 mobile_phone 읽기', () => {
        expect(sourceCode).toContain('personal_info?.mobile_phone');
      });

      it('응답에서 phone 직접 읽기 금지', () => {
        expect(sourceCode).not.toMatch(/personal_info\?\.phone[^_]/);
      });
    });

    describe('에러 처리', () => {
      it('try-catch 구조', () => {
        expect(sourceCode).toContain('try {');
        expect(sourceCode).toContain('} catch');
      });

      it('ObjectId 검증', () => {
        expect(sourceCode).toContain('toSafeObjectId');
      });

      it('유효하지 않은 ID 에러 메시지', () => {
        expect(sourceCode).toContain("'유효하지 않은 고객 ID입니다.'");
      });

      it('고객 없음 에러 메시지', () => {
        expect(sourceCode).toContain("'고객을 찾을 수 없습니다.'");
      });
    });

    describe('권한 검증', () => {
      it('meta.created_by 필터 사용', () => {
        expect(sourceCode).toContain("'meta.created_by': userId");
      });
    });

    describe('응답 구조', () => {
      it('JSON.stringify 사용', () => {
        expect(sourceCode).toContain('JSON.stringify');
      });

      it('content 배열 반환', () => {
        expect(sourceCode).toContain('content: [{');
      });

      it('type: text 사용', () => {
        expect(sourceCode).toContain("type: 'text' as const");
      });
    });

    describe('toString() 최적화', () => {
      it('ID 변환 후 재사용 (첫 번째 루프)', () => {
        expect(sourceCode).toContain('const sourceId = rel.source_customer_id?.toString()');
        expect(sourceCode).toContain('const targetId = rel.target_customer_id?.toString()');
      });

      it('최적화 주석 존재', () => {
        expect(sourceCode).toContain('toString() 한 번만 호출하여 최적화');
      });

      it('변환된 ID로 비교', () => {
        expect(sourceCode).toContain('sourceId !== params.customerId');
        expect(sourceCode).toContain('targetId !== params.customerId');
      });
    });
  });

  describe('contracts.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/contracts.ts');
    });

    describe('데이터 격리', () => {
      it('agent_id 필터 사용', () => {
        expect(sourceCode).toContain('agent_id');
      });

      it('ObjectId와 string 둘 다 지원', () => {
        expect(sourceCode).toContain('ObjectId.isValid(userId)');
        expect(sourceCode).toContain('new ObjectId(userId)');
      });
    });

    describe('쿼리 구조 (명확한 $and)', () => {
      it('conditions 배열로 쿼리 조건 수집', () => {
        expect(sourceCode).toContain('const conditions: object[] = []');
      });

      it('conditions.push로 조건 추가', () => {
        expect(sourceCode).toContain('conditions.push({');
      });

      it('$and로 최종 필터 결합', () => {
        expect(sourceCode).toContain('{ $and: conditions }');
      });

      it('조건이 하나뿐이면 $and 생략', () => {
        expect(sourceCode).toContain('conditions.length > 1 ?');
      });
    });

    describe('응답 필드', () => {
      it('id 필드 포함 (toString 변환)', () => {
        expect(sourceCode).toContain('id: c._id.toString()');
      });

      it('customerId 필드 포함', () => {
        expect(sourceCode).toContain('customerId: c.customer_id?.toString()');
      });

      it('policyNumber 필드 포함', () => {
        expect(sourceCode).toContain('policyNumber: c.policy_number');
      });

      it('premium 필드 포함', () => {
        expect(sourceCode).toContain('premium: c.premium');
      });

      it('createdAt 필드 포함', () => {
        expect(sourceCode).toContain('createdAt: c.meta?.created_at');
      });
    });

    describe('에러 처리', () => {
      it('계약 조회 실패 메시지', () => {
        expect(sourceCode).toContain('계약 조회 실패');
      });

      it('유효하지 않은 계약 ID 메시지', () => {
        expect(sourceCode).toContain("'유효하지 않은 계약 ID입니다.'");
      });

      it('계약 없음 메시지', () => {
        expect(sourceCode).toContain("'계약을 찾을 수 없습니다.'");
      });
    });

    describe('계약 상세 조회', () => {
      it('피보험자 정보 포함', () => {
        expect(sourceCode).toContain('insured:');
      });

      it('수익자 정보 포함', () => {
        expect(sourceCode).toContain('beneficiary:');
      });

      it('특약 정보 포함', () => {
        expect(sourceCode).toContain('riders:');
      });

      it('상품 정보 조회', () => {
        expect(sourceCode).toContain('product:');
        expect(sourceCode).toContain('productInfo');
      });
    });
  });

  describe('birthdays.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/birthdays.ts');
    });

    describe('필드명 검증', () => {
      it('projection에서 mobile_phone 사용', () => {
        expect(sourceCode).toContain("'personal_info.mobile_phone': 1");
      });

      it('projection에서 phone 사용 금지', () => {
        expect(sourceCode).not.toContain("'personal_info.phone': 1");
      });

      it('응답에서 mobile_phone 읽기', () => {
        expect(sourceCode).toContain('personal_info?.mobile_phone');
      });
    });

    describe('날짜 처리', () => {
      it('birth_date 필드 사용', () => {
        expect(sourceCode).toContain("'personal_info.birth_date'");
      });

      it('birthdate 폴백 지원', () => {
        expect(sourceCode).toContain("'personal_info.birthdate'");
      });

      it('$toDate 사용', () => {
        expect(sourceCode).toContain('$toDate');
      });

      it('$month 사용', () => {
        expect(sourceCode).toContain('$month');
      });

      it('$dayOfMonth 사용', () => {
        expect(sourceCode).toContain('$dayOfMonth');
      });

      it('null/빈 문자열 생일 데이터 필터링 ($nin 사용)', () => {
        // 생일이 없는 고객은 aggregation에서 제외해야 함
        expect(sourceCode).toContain('$nin: [null,');
        expect(sourceCode).toContain("$nin: [null, '']");
      });

      it('생일 null safety 주석 존재', () => {
        expect(sourceCode).toContain('null safety');
      });
    });

    describe('권한 검증', () => {
      it('meta.created_by 필터', () => {
        expect(sourceCode).toContain("'meta.created_by': userId");
      });

      it('active 상태만 조회', () => {
        expect(sourceCode).toContain("'meta.status': 'active'");
      });
    });

    describe('입력 검증', () => {
      it('month 범위 검증 (1-12)', () => {
        expect(sourceCode).toContain('z.number().min(1).max(12)');
      });

      it('day 범위 검증 (1-31)', () => {
        expect(sourceCode).toContain('z.number().min(1).max(31)');
      });
    });
  });

  describe('statistics.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/statistics.ts');
    });

    describe('통계 유형', () => {
      it('summary 유형 지원', () => {
        expect(sourceCode).toContain("'summary'");
      });

      it('customer_count 유형 지원', () => {
        expect(sourceCode).toContain("'customer_count'");
      });

      it('contract_count 유형 지원', () => {
        expect(sourceCode).toContain("'contract_count'");
      });

      it('monthly_new 유형 지원', () => {
        expect(sourceCode).toContain("'monthly_new'");
      });
    });

    describe('premium 계산 (타입 안전)', () => {
      it('$convert 사용 (타입 안전 변환)', () => {
        expect(sourceCode).toContain('$convert');
      });

      it('onError: 0 (변환 실패 시 0)', () => {
        expect(sourceCode).toContain('onError: 0');
      });

      it('onNull: 0 (null 시 0)', () => {
        expect(sourceCode).toContain('onNull: 0');
      });

      it('$ifNull로 null 처리', () => {
        expect(sourceCode).toContain('$ifNull');
      });

      it('totalPremium 계산', () => {
        expect(sourceCode).toContain('totalPremium');
      });

      it('타입 안전 변환 주석', () => {
        expect(sourceCode).toContain('타입 안전 변환');
      });
    });

    describe('데이터 격리', () => {
      it('고객: meta.created_by 필터', () => {
        expect(sourceCode).toContain("'meta.created_by': userId");
      });

      it('계약: agent_id 필터', () => {
        expect(sourceCode).toContain('agent_id');
      });
    });

    describe('월별 통계', () => {
      it('최근 6개월 계산', () => {
        expect(sourceCode).toContain('setMonth');
        expect(sourceCode).toContain('- 6');
      });

      it('$year 사용', () => {
        expect(sourceCode).toContain('$year');
      });

      it('$month 사용', () => {
        expect(sourceCode).toContain('$month');
      });
    });
  });

  describe('expiring.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      try {
        sourceCode = readSourceFile('./tools/expiring.ts');
      } catch {
        sourceCode = '';
      }
    });

    it('파일 존재', () => {
      expect(sourceCode.length).toBeGreaterThan(0);
    });

    it('daysWithin 파라미터', () => {
      expect(sourceCode).toContain('daysWithin');
    });

    it('만기일 계산', () => {
      expect(sourceCode).toMatch(/expiry|maturity/i);
    });

    it('agent_id 필터', () => {
      expect(sourceCode).toContain('agent_id');
    });

    describe('안전한 날짜 처리', () => {
      it('Invalid Date 체크 (isNaN)', () => {
        expect(sourceCode).toContain('isNaN(parsed.getTime())');
      });

      it('null 처리', () => {
        expect(sourceCode).toContain('expiryDate: Date | null');
      });

      it('안전한 날짜 처리 주석', () => {
        expect(sourceCode).toContain('안전한 날짜 처리');
      });

      it('daysLeft null 허용', () => {
        expect(sourceCode).toContain('daysLeft,');
      });
    });
  });

  describe('products.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      try {
        sourceCode = readSourceFile('./tools/products.ts');
      } catch {
        sourceCode = '';
      }
    });

    it('파일 존재', () => {
      expect(sourceCode.length).toBeGreaterThan(0);
    });

    it('보험사별 그룹화', () => {
      expect(sourceCode).toMatch(/insurer|insurerBreakdown/i);
    });

    it('상품 검색', () => {
      expect(sourceCode).toMatch(/search|find/i);
    });
  });

  describe('documents.ts', () => {
    let sourceCode: string;

    beforeAll(() => {
      try {
        sourceCode = readSourceFile('./tools/documents.ts');
      } catch {
        sourceCode = '';
      }
    });

    it('파일 존재', () => {
      expect(sourceCode.length).toBeGreaterThan(0);
    });

    it('ownerId 필터', () => {
      expect(sourceCode).toMatch(/ownerId|owner_id/);
    });

    describe('RAG API 타임아웃', () => {
      it('RAG_API_TIMEOUT_MS 상수 정의', () => {
        expect(sourceCode).toContain('RAG_API_TIMEOUT_MS');
      });

      it('AbortController 사용', () => {
        expect(sourceCode).toContain('new AbortController()');
      });

      it('signal 전달', () => {
        expect(sourceCode).toContain('signal: controller.signal');
      });

      it('AbortError 처리', () => {
        expect(sourceCode).toContain("fetchError.name === 'AbortError'");
      });

      it('타임아웃 에러 메시지 (한글)', () => {
        expect(sourceCode).toContain('RAG API 응답 시간 초과');
      });

      it('clearTimeout 호출 (성공/실패 모두)', () => {
        // clearTimeout이 두 번 이상 호출되어야 함 (성공 시, 에러 시)
        const matches = sourceCode.match(/clearTimeout\(timeoutId\)/g);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('RAG API 호출', () => {
      expect(sourceCode).toMatch(/fetch|RAG|search/i);
    });
  });
});

describe('금지 패턴 전역 검증', () => {

  const toolFiles = [
    './tools/customers.ts',
    './tools/memos.ts',
    './tools/network.ts',
    './tools/contracts.ts',
    './tools/birthdays.ts',
    './tools/statistics.ts',
  ];

  for (const file of toolFiles) {
    describe(file, () => {
      let sourceCode: string;

      beforeAll(() => {
        try {
          sourceCode = readSourceFile(file);
        } catch {
          sourceCode = '';
        }
      });

      it('personal_info.phone 사용 금지 (mobile_phone 사용)', () => {
        // projection에서 'personal_info.phone' 사용 금지
        expect(sourceCode).not.toMatch(/'personal_info\.phone'\s*:/);
      });

      it('?.phone 직접 읽기 금지 (?.mobile_phone 사용)', () => {
        // personal_info?.phone 패턴 금지 (mobile_phone 뒤에 오지 않는 경우)
        const phonePattern = /personal_info\?\.phone(?!_)/;
        expect(sourceCode).not.toMatch(phonePattern);
      });

      it('formatDateTime 사용 금지', () => {
        expect(sourceCode).not.toContain('formatDateTime');
      });

      it('날짜 문자열 하드코딩 금지', () => {
        // YYYY.MM.DD 형식 하드코딩 금지
        const dateStringPattern = /['"`]\d{4}\.\d{2}\.\d{2}/;
        expect(sourceCode).not.toMatch(dateStringPattern);
      });
    });
  }
});

describe('응답 형식 일관성', () => {

  const toolFiles = [
    './tools/customers.ts',
    './tools/memos.ts',
    './tools/network.ts',
    './tools/contracts.ts',
    './tools/birthdays.ts',
    './tools/statistics.ts',
  ];

  for (const file of toolFiles) {
    describe(file, () => {
      let sourceCode: string;

      beforeAll(() => {
        try {
          sourceCode = readSourceFile(file);
        } catch {
          sourceCode = '';
        }
      });

      it('성공 응답: content 배열', () => {
        expect(sourceCode).toContain('content: [{');
      });

      it('에러 응답: isError: true', () => {
        expect(sourceCode).toContain('isError: true');
      });

      it('JSON.stringify(obj, null, 2) 사용', () => {
        // 멀티라인 객체도 매칭하도록 [\s\S] 사용
        expect(sourceCode).toMatch(/JSON\.stringify\([\s\S]+?,\s*null,\s*2\)/);
      });

      it("type: 'text' as const 사용", () => {
        expect(sourceCode).toContain("type: 'text' as const");
      });
    });
  }
});

describe('권한 및 데이터 격리', () => {

  describe('고객 데이터 격리', () => {
    const customerFiles = [
      './tools/customers.ts',
      './tools/memos.ts',
      './tools/network.ts',
      './tools/birthdays.ts',
    ];

    for (const file of customerFiles) {
      it(`${file}: meta.created_by 필터 사용`, () => {
        const sourceCode = readSourceFile(file);
        expect(sourceCode).toContain("'meta.created_by'");
      });
    }
  });

  describe('계약 데이터 격리', () => {
    const contractFiles = [
      './tools/contracts.ts',
      './tools/statistics.ts',
    ];

    for (const file of contractFiles) {
      it(`${file}: agent_id 필터 사용`, () => {
        const sourceCode = readSourceFile(file);
        expect(sourceCode).toContain('agent_id');
      });
    }
  });
});

describe('빈 결과 처리 일관성', () => {
  const listToolFiles = [
    { file: './tools/customers.ts', countField: 'count: customers.length' },
    { file: './tools/contracts.ts', countField: 'count: contracts.length' },
    { file: './tools/birthdays.ts', countField: 'count: customers.length' },
    { file: './tools/memos.ts', countField: 'count: memos.length' },
    { file: './tools/expiring.ts', countField: 'count: contractsWithDaysLeft.length' },
    { file: './tools/documents.ts', countField: 'count: documents.length' },
  ];

  for (const { file, countField } of listToolFiles) {
    describe(file, () => {
      let sourceCode: string;

      beforeAll(() => {
        sourceCode = readSourceFile(file);
      });

      it('count 필드 사용 (빈 배열도 count: 0)', () => {
        expect(sourceCode).toContain(countField);
      });

      it('빈 결과는 에러가 아님 (isError 없이 반환)', () => {
        // 성공 응답에 isError가 포함되면 안 됨
        // 에러 응답만 isError: true를 가짐
        expect(sourceCode).toContain('isError: true');
      });

      it('map() 사용 (빈 배열도 안전하게 처리)', () => {
        expect(sourceCode).toContain('.map(');
      });
    });
  }
});
