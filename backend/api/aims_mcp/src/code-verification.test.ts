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
      it('DB에 mobile_phone 필드로 저장해야 함 (phone 아님)', () => {
        // newCustomer 객체에서 mobile_phone 사용 확인
        expect(sourceCode).toContain('mobile_phone: params.phone');

        // newCustomer 객체 내에서 phone: params.phone 직접 사용 금지
        // (mobile_phone: params.phone 이어야 함)
        const newCustomerMatch = sourceCode.match(/const newCustomer = \{[\s\S]*?insertOne/);
        expect(newCustomerMatch).not.toBeNull();
        if (newCustomerMatch) {
          // newCustomer 객체 내에 "phone:" 패턴이 없어야 함 (mobile_phone은 OK)
          expect(newCustomerMatch[0]).not.toMatch(/\bphone:\s*params\.phone/);
          // mobile_phone은 있어야 함
          expect(newCustomerMatch[0]).toContain('mobile_phone: params.phone');
        }
      });

      it('created_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('created_at: now');
        expect(sourceCode).toContain('const now = new Date()');
        // formatDateTime 사용 금지
        expect(sourceCode).not.toContain('formatDateTime');
      });

      it('updated_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain('updated_at: now');
      });

      it('customer_type 기본값이 개인이어야 함', () => {
        expect(sourceCode).toContain("customer_type: params.customerType || '개인'");
      });

      it('status 기본값이 active여야 함', () => {
        expect(sourceCode).toContain("status: 'active'");
      });
    });

    describe('update_customer 핸들러', () => {
      it('업데이트 시 personal_info.mobile_phone 경로 사용해야 함', () => {
        expect(sourceCode).toContain("updateFields['personal_info.mobile_phone'] = params.phone");
        // personal_info.phone 경로 사용 금지
        expect(sourceCode).not.toContain("updateFields['personal_info.phone']");
      });

      it('업데이트 시 meta.updated_at에 new Date() 사용해야 함', () => {
        expect(sourceCode).toContain("'meta.updated_at': new Date()");
      });
    });

    describe('get_customer 핸들러', () => {
      it('응답에서 mobile_phone을 읽어야 함 (phone 아님)', () => {
        // phone: customer.personal_info?.mobile_phone 패턴 확인
        expect(sourceCode).toContain('phone: customer.personal_info?.mobile_phone');
        // phone: customer.personal_info?.phone 패턴 금지
        expect(sourceCode).not.toMatch(/phone:\s*customer\.personal_info\?\.phone[^_]/);
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
      it('customers.memo 필드에 직접 저장해야 함 (별도 컬렉션 아님)', () => {
        // COLLECTIONS.CUSTOMERS 사용 확인
        expect(sourceCode).toContain('db.collection(COLLECTIONS.CUSTOMERS)');
        // customer_memos 별도 컬렉션 사용 금지
        expect(sourceCode).not.toContain("db.collection('customer_memos')");
        expect(sourceCode).not.toContain('COLLECTIONS.MEMOS');
      });

      it('메모 필드명은 memo 사용해야 함', () => {
        expect(sourceCode).toContain('memo: updatedMemo');
        expect(sourceCode).toContain('customer.memo');
      });

      it('기존 메모에 append하는 로직이 있어야 함', () => {
        expect(sourceCode).toContain('existingMemo');
        expect(sourceCode).toContain('updatedMemo');
        // 기존 메모 + 새 메모 병합
        expect(sourceCode).toMatch(/existingMemo[\s\S]*?newMemoLine/);
      });

      it('타임스탬프 형식으로 메모를 추가해야 함', () => {
        // [YYYY.MM.DD HH:mm] 형식의 타임스탬프
        expect(sourceCode).toContain('formatDateTime');
        expect(sourceCode).toContain('newMemoLine');
      });
    });

    describe('컬렉션명 상수 사용', () => {
      it('customers 컬렉션 접근에 COLLECTIONS.CUSTOMERS 사용', () => {
        // COLLECTIONS import 확인
        expect(sourceCode).toContain('COLLECTIONS');
        // 하드코딩 금지
        expect(sourceCode).not.toMatch(/db\.collection\(['"]customers['"]\)/);
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

    describe('에러 로깅 (디버깅용)', () => {
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

      it('디버깅용 주석', () => {
        expect(customersSource).toContain('에러 로깅 (디버깅용)');
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
      { name: 'expiring.ts', handlers: ['find_expiring_contracts'] },
      { name: 'network.ts', handlers: ['get_customer_network'] },
      { name: 'products.ts', handlers: ['search_products', 'get_product_details'] },
      { name: 'statistics.ts', handlers: ['get_statistics'] }
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

        it(`${name}에서 에러 로깅 주석`, () => {
          const source = readSourceFile(`./tools/${name}`);
          expect(source).toContain('에러 로깅 (디버깅용)');
        });
      });
    });
  });
});
