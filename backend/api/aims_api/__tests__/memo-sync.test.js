/**
 * 메모 동기화 테스트
 *
 * aims_api에서 메모 CRUD 시 customers.memo 필드가 동기화되는지 검증
 */

const fs = require('fs');
const path = require('path');

describe('메모 동기화 (MCP 호환)', () => {
  const serverCode = fs.readFileSync(
    path.join(__dirname, '../server.js'),
    'utf-8'
  );

  describe('syncCustomerMemoField 함수', () => {
    it('함수가 정의되어 있어야 함', () => {
      expect(serverCode).toContain('async function syncCustomerMemoField(customerId)');
    });

    it('customer_memos 컬렉션에서 메모를 조회해야 함', () => {
      expect(serverCode).toContain("db.collection(CUSTOMER_MEMOS_COLLECTION)");
      expect(serverCode).toContain(".find({ customer_id: customerObjectId })");
    });

    it('시간순으로 정렬해야 함', () => {
      expect(serverCode).toContain(".sort({ created_at: 1 })");
    });

    it('customers.memo 필드를 업데이트해야 함', () => {
      expect(serverCode).toContain("{ $set: { memo: memoText");
    });
  });

  describe('formatMemoDateTime 함수', () => {
    it('함수가 정의되어 있어야 함', () => {
      expect(serverCode).toContain('function formatMemoDateTime(date)');
    });

    it('YYYY.MM.DD HH:mm 형식으로 반환해야 함', () => {
      // 함수 내부에서 포맷 문자열 생성 확인
      expect(serverCode).toContain('`${y}.${m}.${day} ${h}:${min}`');
    });
  });

  describe('메모 API 동기화 호출', () => {
    it('POST /api/customers/:id/memos에서 syncCustomerMemoField 호출', () => {
      // POST 핸들러 내에서 동기화 함수 호출 확인
      const postSection = serverCode.match(
        /app\.post\('\/api\/customers\/:id\/memos'[\s\S]*?catch \(error\)/
      );
      expect(postSection).not.toBeNull();
      expect(postSection[0]).toContain('await syncCustomerMemoField(id)');
    });

    it('PUT /api/customers/:id/memos/:memoId에서 syncCustomerMemoField 호출', () => {
      // PUT 핸들러 내에서 동기화 함수 호출 확인
      const putSection = serverCode.match(
        /app\.put\('\/api\/customers\/:id\/memos\/:memoId'[\s\S]*?catch \(error\)/
      );
      expect(putSection).not.toBeNull();
      expect(putSection[0]).toContain('await syncCustomerMemoField(id)');
    });

    it('DELETE /api/customers/:id/memos/:memoId에서 syncCustomerMemoField 호출', () => {
      // DELETE 핸들러 내에서 동기화 함수 호출 확인
      const deleteSection = serverCode.match(
        /app\.delete\('\/api\/customers\/:id\/memos\/:memoId'[\s\S]*?catch \(error\)/
      );
      expect(deleteSection).not.toBeNull();
      expect(deleteSection[0]).toContain('await syncCustomerMemoField(id)');
    });
  });

  describe('마이그레이션 스크립트', () => {
    it('migrate-memos.js 파일이 존재해야 함', () => {
      const scriptPath = path.join(__dirname, '../scripts/migrate-memos.js');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('마이그레이션 스크립트에 formatMemoDateTime 함수 포함', () => {
      const scriptPath = path.join(__dirname, '../scripts/migrate-memos.js');
      const scriptCode = fs.readFileSync(scriptPath, 'utf-8');
      expect(scriptCode).toContain('function formatMemoDateTime(date)');
    });

    it('마이그레이션 스크립트에 customer_memos 집계 로직 포함', () => {
      const scriptPath = path.join(__dirname, '../scripts/migrate-memos.js');
      const scriptCode = fs.readFileSync(scriptPath, 'utf-8');
      expect(scriptCode).toContain("memosCollection.aggregate");
      expect(scriptCode).toContain("$group");
    });
  });
});
