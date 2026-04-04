/**
 * MCP 소스 코드 검증 테스트
 *
 * 이 테스트는 실제 MCP 소스 코드를 읽어서 호환성 버그가 없는지 검증합니다.
 * 시뮬레이션이 아닌 실제 코드 분석을 통해 런타임 문제를 사전에 방지합니다.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 소스 파일 읽기
function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('MCP 소스 코드 검증', () => {

  describe('customers.ts 코드 검증', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/customers.ts');
    });

    describe('create_customer 핸들러', () => {
      it('Internal API createCustomer 호출해야 함', () => {
        expect(sourceCode).toContain('createCustomer({');
      });

      it('전화번호에 formatPhoneNumber 적용해야 함', () => {
        expect(sourceCode).toContain('phone: formatPhoneNumber(params.phone)');
      });

      it('userId를 API에 전달해야 함', () => {
        expect(sourceCode).toContain('userId');
      });

      it('customerType을 API에 전달해야 함', () => {
        expect(sourceCode).toContain('customerType: params.customerType');
      });

      it('formatDateTime 사용 금지', () => {
        expect(sourceCode).not.toContain('formatDateTime');
      });
    });

    describe('update_customer 핸들러', () => {
      it('Internal API updateCustomer 호출해야 함', () => {
        expect(sourceCode).toContain('updateCustomer(params.customerId');
      });

      it('전화번호에 formatPhoneNumber 적용해야 함', () => {
        expect(sourceCode).toContain('formatPhoneNumber(params.phone)');
      });

      it('phoneType을 API에 전달해야 함', () => {
        expect(sourceCode).toContain('phoneType: params.phoneType');
      });
    });

    describe('get_customer 핸들러', () => {
      it('응답에서 mobile_phone을 읽어야 함 (phone 아님)', () => {
        // mobilePhone: customer.personal_info?.mobile_phone 패턴 확인
        expect(sourceCode).toContain('mobilePhone: customer.personal_info?.mobile_phone');
        // personal_info?.phone 패턴 금지 (mobile_phone 사용해야 함)
        expect(sourceCode).not.toMatch(/customer\.personal_info\?\.phone[^_]/);
      });
    });

    describe('search_customers 핸들러', () => {
      it('검색 결과에서 mobile_phone을 읽어야 함', () => {
        expect(sourceCode).toContain('phone: c.personal_info?.mobile_phone');
      });

      it('검색 시 mobile_phone 필드로 검색해야 함', () => {
        expect(sourceCode).toContain("'personal_info.mobile_phone': regex");
      });
    });
  });

  describe('memos.ts 코드 검증', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/memos.ts');
    });

    describe('add_customer_memo 핸들러', () => {
      it('Internal API createMemo 호출해야 함', () => {
        expect(sourceCode).toContain('createMemo({');
      });

      it('content를 trim하여 전달해야 함', () => {
        expect(sourceCode).toContain('content: params.content.trim()');
      });

      it('customers.memo 필드에 동기화해야 함', () => {
        // syncCustomerMemoField를 통해 customers.memo 동기화
        expect(sourceCode).toContain('syncCustomerMemoField');
        // Internal API syncCustomerMemo 호출
        expect(sourceCode).toContain('syncCustomerMemo');
      });

      it('타임스탬프 형식으로 동기화 메모를 생성해야 함', () => {
        // [YYYY.MM.DD HH:mm] 형식의 타임스탬프
        expect(sourceCode).toContain('formatDateTime');
        // 동기화 시 타임스탬프 포맷
        expect(sourceCode).toMatch(/\[.*formatDateTime/);
      });
    });

    describe('Internal API 사용', () => {
      it('queryMemos를 사용하여 메모 조회', () => {
        expect(sourceCode).toContain('queryMemos');
      });

      it('syncCustomerMemo를 사용하여 customers.memo 동기화', () => {
        expect(sourceCode).toContain('syncCustomerMemo(');
      });
    });
  });

  describe('금지된 패턴 검증', () => {
    it('customers.ts에 formatDateTime 함수가 없어야 함', () => {
      const sourceCode = readSourceFile('./tools/customers.ts');
      expect(sourceCode).not.toContain('formatDateTime');
      expect(sourceCode).not.toContain('format_date_time');
    });

    it('memos.ts에는 formatDateTime이 있어야 함 (타임스탬프 형식용)', () => {
      const sourceCode = readSourceFile('./tools/memos.ts');
      // memos.ts는 메모 타임스탬프를 위해 formatDateTime 사용
      expect(sourceCode).toContain('formatDateTime');
    });

    it('customers.ts에 날짜 문자열 직접 생성 패턴이 없어야 함', () => {
      const customersCode = readSourceFile('./tools/customers.ts');
      // YYYY.MM.DD 형식 문자열 생성 패턴 금지
      const dateStringPattern = /['"`]\d{4}\.\d{2}\.\d{2}/;
      expect(customersCode).not.toMatch(dateStringPattern);
    });
  });

  describe('Zod 에러 메시지 가공', () => {
    let dbSource: string;
    let customersSource: string;

    beforeAll(() => {
      dbSource = readSourceFile('./db.ts');
      customersSource = readSourceFile('./tools/customers.ts');
    });

    describe('db.ts formatZodError 유틸리티', () => {
      it('formatZodError 함수 정의', () => {
        expect(dbSource).toContain('export function formatZodError');
      });

      it('FIELD_NAME_MAP 한글 매핑 존재', () => {
        expect(dbSource).toContain('FIELD_NAME_MAP');
        expect(dbSource).toContain("name: '이름'");
        expect(dbSource).toContain("customerId: '고객 ID'");
      });

      it('ZodIssue 타입별 처리', () => {
        expect(dbSource).toContain('invalid_type');
        expect(dbSource).toContain('too_small');
        expect(dbSource).toContain('too_big');
        expect(dbSource).toContain('invalid_enum_value');
        expect(dbSource).toContain('invalid_string');
      });

      it('친절한 한글 에러 메시지', () => {
        expect(dbSource).toContain('을(를) 입력해주세요');
        expect(dbSource).toContain('형식이 올바르지 않습니다');
        expect(dbSource).toContain('이(가) 너무');
      });
    });

    describe('customers.ts formatZodError 적용', () => {
      it('formatZodError import', () => {
        expect(customersSource).toContain('formatZodError');
      });

      it('ZodError import', () => {
        expect(customersSource).toContain('ZodError');
      });

      it('catch 블록에서 ZodError 체크', () => {
        expect(customersSource).toContain('error instanceof ZodError');
      });

      it('formatZodError 호출', () => {
        expect(customersSource).toContain('formatZodError(error)');
      });
    });

    describe('에러 로깅', () => {
      it('[MCP] 접두사로 로깅', () => {
        expect(customersSource).toContain("console.error('[MCP]");
      });

      it('각 핸들러별 식별자', () => {
        expect(customersSource).toContain('search_customers 에러');
        expect(customersSource).toContain('get_customer 에러');
        expect(customersSource).toContain('create_customer 에러');
        expect(customersSource).toContain('update_customer 에러');
      });

      it('에러 객체 출력', () => {
        expect(customersSource).toContain(', error)');
      });

      it('에러 로깅 주석', () => {
        expect(customersSource).toContain('// 에러 로깅');
      });
    });
  });

  describe('contracts.ts 코드 검증', () => {
    let contractsSource: string;

    beforeAll(() => {
      contractsSource = readSourceFile('./tools/contracts.ts');
    });

    describe('list_contracts limit 일관성', () => {
      it('스키마 default와 런타임 fallback이 동일해야 함 (50)', () => {
        // 스키마: limit default 50
        expect(contractsSource).toMatch(/limit:\s*z\.number\(\).*\.default\(50\)/);
        // 런타임: fallback도 50이어야 함 (10이면 불일치 버그)
        expect(contractsSource).toContain('params.limit || 50');
        // 런타임에 fallback 10이 없어야 함
        expect(contractsSource).not.toContain('params.limit || 10');
      });

      it('Math.min 상한이 50이어야 함', () => {
        // Math.min(params.limit || 50, 50) 패턴 확인
        expect(contractsSource).toMatch(/Math\.min\(params\.limit \|\| 50,\s*50\)/);
      });
    });
  });

  describe('모든 도구 파일 일관성 검증', () => {
    const toolFiles = [
      { name: 'customers.ts', handlers: ['search_customers', 'get_customer', 'create_customer', 'update_customer'] },
      // delete_customer_memo는 deprecated되어 단순 에러 반환만 함
      { name: 'memos.ts', handlers: ['add_customer_memo', 'list_customer_memos'] },
      { name: 'birthdays.ts', handlers: ['find_birthday_customers'] },
      { name: 'contracts.ts', handlers: ['list_contracts', 'get_contract_details'] },
      { name: 'documents.ts', handlers: ['search_documents', 'get_document', 'list_customer_documents'] },
      { name: 'network.ts', handlers: ['get_customer_network'] },
      { name: 'products.ts', handlers: ['search_products'] }
    ];

    describe('formatZodError 일관성', () => {
      toolFiles.forEach(({ name }) => {
        it(`${name}에서 ZodError import`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain('ZodError');
        });

        it(`${name}에서 formatZodError import`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain('formatZodError');
        });

        it(`${name}에서 error instanceof ZodError 체크`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain('error instanceof ZodError');
        });

        it(`${name}에서 formatZodError(error) 호출`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain('formatZodError(error)');
        });
      });
    });

    describe('[MCP] 에러 로깅 일관성', () => {
      toolFiles.forEach(({ name, handlers }) => {
        handlers.forEach(handler => {
          it(`${name}: ${handler} 에러 로깅`, () => {
            const source = readSourceFile(`./tools/${name}`);
            expect(source).toContain(`[MCP] ${handler} 에러`);
          });
        });
      });
    });

    describe('에러 로깅 패턴 일관성', () => {
      toolFiles.forEach(({ name }) => {
        it(`${name}에서 console.error('[MCP] 패턴`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain("console.error('[MCP]");
        });

        it(`${name}에서 에러 로깅 주석 또는 console.error 패턴`, () => {
          const source = readSourceFile(`./tools/${name}`);
          // 에러 로깅 주석 또는 console.error('[MCP] 패턴 중 하나 이상 존재
          const hasComment = source.includes('// 에러 로깅');
          const hasConsoleError = source.includes("console.error('[MCP]");
          expect(hasComment || hasConsoleError).toBe(true);
        });
      });
    });
  });
});
