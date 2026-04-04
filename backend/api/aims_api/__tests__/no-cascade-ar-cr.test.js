/**
 * no-cascade-ar-cr.test.js
 * Regression 테스트: 문서 삭제 시 AR/CR 파싱 데이터가 cascade 삭제되지 않음을 검증
 *
 * 원칙: "사용자가 명시적으로 지운 것만 지운다. Cascade 삭제는 하지 않는다."
 * - 문서(PDF)를 삭제해도 고객의 annual_reports / customer_reviews 배열은 유지
 * - AR/CR 파싱 데이터 삭제는 사용자가 별도로 수행해야 함
 */

const fs = require('fs');
const path = require('path');

describe('문서 삭제 시 AR/CR cascade 삭제 코드가 제거되었는지 검증', () => {
  let routeContent;
  let deleteServiceContent;

  beforeAll(() => {
    routeContent = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'documents-routes.js'),
      'utf-8'
    );
    deleteServiceContent = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'documentDeleteService.js'),
      'utf-8'
    );
  });

  describe('단건 문서 삭제 (DELETE /api/documents/:id)', () => {
    test('AR 파싱 데이터 cascade 삭제 코드가 없어야 함', () => {
      // "Annual Report 파싱 데이터 삭제" 섹션 주석이 없어야 함
      expect(routeContent).not.toMatch(/Annual Report 파싱 데이터 삭제/);
    });

    test('annual_reports $pull 연산이 문서 삭제 라우트에 없어야 함', () => {
      // 문서 삭제 시 annual_reports를 $pull하는 코드가 없어야 함
      // (customers-routes.js에서의 교체 로직과 구분하기 위해 documents-routes.js만 검사)
      expect(routeContent).not.toMatch(/\$pull:\s*\{\s*annual_reports/);
    });

    test('CR 파싱 데이터 cascade 삭제 코드가 없어야 함', () => {
      // "Customer Review 파싱 데이터 삭제" 섹션 주석이 없어야 함
      expect(routeContent).not.toMatch(/Customer Review 파싱 데이터 삭제/);
    });

    test('customer_reviews $pull 연산이 문서 삭제 라우트에 없어야 함', () => {
      // 문서 삭제 시 customer_reviews를 $pull하는 코드가 없어야 함
      expect(routeContent).not.toMatch(/\$pull:\s*\{\s*customer_reviews/);
    });
  });

  describe('일괄 문서 삭제 (DELETE /api/documents)', () => {
    test('일괄 삭제 시 AR cascade 코드가 없어야 함', () => {
      // "AR 삭제" 로그 메시지가 없어야 함 (ar_parse_queue 정리는 별개)
      expect(routeContent).not.toMatch(/\[AR 삭제\]/);
    });

    test('일괄 삭제 시 CR cascade 코드가 없어야 함', () => {
      expect(routeContent).not.toMatch(/\[CR 삭제\]/);
    });
  });

  describe('유지되어야 하는 기능 (documentDeleteService.js)', () => {
    test('AR 파싱 큐(ar_parse_queue) 정리는 유지되어야 함', () => {
      // 문서 삭제 시 ar_parse_queue에서 제거하는 것은 올바른 동작 (큐 정리)
      expect(deleteServiceContent).toMatch(/AR_PARSE_QUEUE/);
    });

    test('문서 자체 삭제(files 컬렉션)는 유지되어야 함', () => {
      expect(deleteServiceContent).toMatch(/deleteOne\(\{ _id: objectId \}\)/);
    });

    test('파일 시스템 삭제(fs.unlink)는 유지되어야 함', () => {
      expect(deleteServiceContent).toMatch(/fs\.unlink\(document\.upload\.destPath\)/);
    });

    test('Qdrant 임베딩 삭제는 유지되어야 함', () => {
      expect(deleteServiceContent).toMatch(/qdrantClient\.delete/);
    });

    test('고객 참조(documents 배열) 정리는 유지되어야 함', () => {
      // 고객의 documents 배열에서 document_id 참조를 제거하는 것은 올바른 동작
      expect(deleteServiceContent).toMatch(/\$pull:\s*\{\s*documents:\s*\{/);
    });

    test('documents-routes.js에서 deleteDocument를 호출해야 함', () => {
      expect(routeContent).toContain('deleteDocument');
      expect(routeContent).toContain("require('../lib/documentDeleteService')");
    });
  });
});
