/**
 * 응답 포맷 일관성 테스트
 *
 * 모든 MCP 도구들의 응답이 일관된 형식을 따르는지 검증
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSourceFile(relativePath: string): string {
  const fullPath = join(__dirname, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('응답 포맷 일관성', () => {

  describe('MCP 응답 구조 검증', () => {
    const toolFiles = [
      './tools/customers.ts',
      './tools/memos.ts',
      './tools/contracts.ts',
      './tools/documents.ts',
      './tools/birthdays.ts',
      './tools/products.ts',
    ];

    for (const file of toolFiles) {
      describe(`${file} 응답 구조`, () => {
        let sourceCode: string;

        try {
          sourceCode = readSourceFile(file);
        } catch {
          return;  // 파일이 없으면 스킵
        }

        it('성공 응답: content 배열 사용', () => {
          // 성공 응답 패턴: return { content: [{ type: 'text', text: ... }] }
          expect(sourceCode).toMatch(/return\s*{\s*content:\s*\[/);
        });

        it('에러 응답: isError와 content 사용', () => {
          // 에러 응답 패턴: return { isError: true, content: [{ type: 'text', text: ... }] }
          expect(sourceCode).toMatch(/isError:\s*true/);
        });

        it('content type이 text인지 확인', () => {
          expect(sourceCode).toContain("type: 'text' as const");
        });
      });
    }
  });

  describe('customers.ts 응답 상세 검증', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/customers.ts');
    });

    describe('search_customers 응답', () => {
      it('count 필드 포함', () => {
        expect(sourceCode).toContain('count: customers.length');
      });

      it('totalCount 필드 포함', () => {
        expect(sourceCode).toContain('totalCount');
      });

      it('customers 배열 포함', () => {
        expect(sourceCode).toMatch(/customers:\s*customers\.map/);
      });

      it('각 고객에 id 필드 포함', () => {
        expect(sourceCode).toContain('id: c._id.toString()');
      });

      it('각 고객에 name 필드 포함', () => {
        expect(sourceCode).toContain('name: c.personal_info?.name');
      });

      it('각 고객에 phone 필드 (mobile_phone에서 읽음)', () => {
        expect(sourceCode).toContain('phone: c.personal_info?.mobile_phone');
      });

      it('각 고객에 type 필드 포함', () => {
        expect(sourceCode).toContain('type: c.insurance_info?.customer_type');
      });

      it('각 고객에 status 필드 포함', () => {
        expect(sourceCode).toContain('status: c.meta?.status');
      });
    });

    describe('get_customer 응답', () => {
      it('id 필드 포함', () => {
        expect(sourceCode).toContain('id: customer._id.toString()');
      });

      it('personalInfo 객체 포함', () => {
        expect(sourceCode).toContain('personalInfo:');
      });

      it('insuranceInfo 객체 포함', () => {
        expect(sourceCode).toContain('insuranceInfo:');
      });

      it('meta 객체 포함', () => {
        expect(sourceCode).toContain('meta:');
      });
    });

    describe('create_customer 응답', () => {
      it('success 필드 포함', () => {
        expect(sourceCode).toContain('success: true');
      });

      it('customerId 필드 포함', () => {
        expect(sourceCode).toContain('customerId: result.insertedId.toString()');
      });

      it('name 필드 포함', () => {
        expect(sourceCode).toContain('name: params.name');
      });

      it('customerType 필드 포함', () => {
        expect(sourceCode).toMatch(/customerType:\s*params\.customerType/);
      });

      it('createdAt 필드 포함 (ISO 문자열)', () => {
        expect(sourceCode).toContain('createdAt: now.toISOString()');
      });
    });

    describe('update_customer 응답', () => {
      it('success 필드 포함', () => {
        expect(sourceCode).toContain('success: true');
      });

      it('customerId 필드 포함', () => {
        expect(sourceCode).toContain('customerId: params.customerId');
      });

      it('updatedFields 필드 포함', () => {
        expect(sourceCode).toContain('updatedFields:');
      });

      it('message 필드 포함', () => {
        expect(sourceCode).toContain("message: '고객 정보가 수정되었습니다.'");
      });
    });
  });

  describe('memos.ts 응답 상세 검증 (단일 메모 필드)', () => {
    let sourceCode: string;

    beforeAll(() => {
      sourceCode = readSourceFile('./tools/memos.ts');
    });

    describe('add_customer_memo 응답', () => {
      it('success 필드 포함', () => {
        expect(sourceCode).toContain('success: true');
      });

      it('customerId 필드 포함', () => {
        expect(sourceCode).toContain('customerId: params.customerId');
      });

      it('customerName 필드 포함', () => {
        expect(sourceCode).toContain("customerName: customer.personal_info?.name");
      });

      it('addedContent 필드 포함', () => {
        expect(sourceCode).toContain('addedContent: params.content');
      });

      it('timestamp 필드 포함', () => {
        expect(sourceCode).toContain('timestamp: timestamp');
      });

      it('message 필드 포함', () => {
        expect(sourceCode).toContain("message: '메모가 추가되었습니다.'");
      });
    });

    describe('list_customer_memos 응답', () => {
      it('customerId 필드 포함', () => {
        expect(sourceCode).toContain('customerId: params.customerId');
      });

      it('customerName 필드 포함', () => {
        expect(sourceCode).toContain("customerName: customer.personal_info?.name");
      });

      it('memo 필드 포함 (단일 문자열)', () => {
        expect(sourceCode).toContain('memo: memo');
      });

      it('hasContent 필드 포함', () => {
        expect(sourceCode).toContain('hasContent: memo.length > 0');
      });
    });

    describe('delete_customer_memo 응답', () => {
      it('메모 삭제 성공 메시지', () => {
        expect(sourceCode).toContain('메모가 삭제되었습니다');
      });
    });
  });

  describe('에러 메시지 일관성', () => {
    const toolFiles = [
      './tools/customers.ts',
      './tools/memos.ts',
    ];

    for (const file of toolFiles) {
      describe(`${file} 에러 메시지`, () => {
        let sourceCode: string;

        beforeAll(() => {
          sourceCode = readSourceFile(file);
        });

        it('유효하지 않은 ID 에러 메시지', () => {
          expect(sourceCode).toMatch(/유효하지 않은.*ID/);
        });

        it('찾을 수 없음 에러 메시지', () => {
          expect(sourceCode).toMatch(/찾을 수 없습니다/);
        });

        it('에러 메시지에 error.message 포함', () => {
          expect(sourceCode).toMatch(/error instanceof Error \? error\.message : '알 수 없는 오류'/);
        });
      });
    }
  });

  describe('JSON 직렬화 일관성', () => {
    const toolFiles = [
      './tools/customers.ts',
      './tools/memos.ts',
    ];

    for (const file of toolFiles) {
      describe(`${file} JSON 직렬화`, () => {
        let sourceCode: string;

        beforeAll(() => {
          sourceCode = readSourceFile(file);
        });

        it('JSON.stringify에 null, 2 사용 (pretty print)', () => {
          expect(sourceCode).toMatch(/JSON\.stringify\([^)]+,\s*null,\s*2\)/);
        });
      });
    }
  });

  describe('응답에서 Date 처리', () => {

    it('customers.ts: createdAt 응답에서 toISOString() 사용', () => {
      const customersCode = readSourceFile('./tools/customers.ts');
      expect(customersCode).toContain('createdAt: now.toISOString()');
    });

    it('customers.ts: 목록 응답에서 Date 그대로 반환', () => {
      const customersCode = readSourceFile('./tools/customers.ts');
      expect(customersCode).toContain("createdAt: c.meta?.created_at");
    });

    it('memos.ts: 타임스탬프 형식으로 메모 추가', () => {
      const memosCode = readSourceFile('./tools/memos.ts');
      // memos는 단일 필드에 타임스탬프 형식으로 저장
      expect(memosCode).toContain('formatDateTime');
      expect(memosCode).toContain('timestamp');
    });
  });
});

describe('스키마 정의 일관성', () => {
  const toolFiles = [
    './tools/customers.ts',
    './tools/memos.ts',
  ];

  for (const file of toolFiles) {
    describe(`${file} 스키마`, () => {
      let sourceCode: string;

      beforeAll(() => {
        sourceCode = readSourceFile(file);
      });

      it('Zod 스키마 사용', () => {
        // import { z } 또는 import { z, ZodError } 등 다양한 형태 허용
        expect(sourceCode).toMatch(/import \{ z[^}]* \} from 'zod'/);
      });

      it('스키마 parse 사용', () => {
        expect(sourceCode).toMatch(/Schema\.parse\(args/);
      });

      it('tool 정의에 inputSchema 포함', () => {
        expect(sourceCode).toContain('inputSchema:');
      });

      it('inputSchema에 type: object 포함', () => {
        expect(sourceCode).toContain("type: 'object' as const");
      });

      it('inputSchema에 properties 포함', () => {
        expect(sourceCode).toContain('properties:');
      });
    });
  }
});

describe('필드명 일관성 (카멜케이스 vs 스네이크케이스)', () => {
  const customersCode = readSourceFile('./tools/customers.ts');
  const memosCode = readSourceFile('./tools/memos.ts');

  describe('입력 파라미터: 카멜케이스', () => {
    it('customers.ts: customerId', () => {
      expect(customersCode).toContain('customerId:');
    });

    it('customers.ts: customerType', () => {
      expect(customersCode).toContain('customerType:');
    });

    it('customers.ts: birthDate', () => {
      expect(customersCode).toContain('birthDate:');
    });

    it('memos.ts: customerId', () => {
      expect(memosCode).toContain('customerId:');
    });
  });

  describe('DB 필드: 스네이크케이스', () => {
    it('customers.ts: personal_info', () => {
      expect(customersCode).toContain('personal_info');
    });

    it('customers.ts: mobile_phone', () => {
      expect(customersCode).toContain('mobile_phone');
    });

    it('customers.ts: insurance_info', () => {
      expect(customersCode).toContain('insurance_info');
    });

    it('customers.ts: customer_type', () => {
      expect(customersCode).toContain('customer_type');
    });

    it('customers.ts: created_at', () => {
      expect(customersCode).toContain('created_at');
    });

    it('customers.ts: updated_at', () => {
      expect(customersCode).toContain('updated_at');
    });

    it('memos.ts: meta.created_by', () => {
      expect(memosCode).toContain('meta.created_by');
    });

    it('memos.ts: meta.updated_at', () => {
      expect(memosCode).toContain('meta.updated_at');
    });
  });
});
