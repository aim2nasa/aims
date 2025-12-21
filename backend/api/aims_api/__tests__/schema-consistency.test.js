/**
 * 스키마 일관성 테스트
 *
 * @aims/shared-schema의 COLLECTIONS 상수를 사용하는지 검증
 * 하드코딩된 컬렉션명이 없어야 함
 */

const fs = require('fs');
const path = require('path');

describe('스키마 일관성', () => {
  // 테스트할 주요 파일들
  const filesToCheck = [
    { name: 'server.js', path: path.join(__dirname, '../server.js') },
    { name: 'customer-relationships-routes.js', path: path.join(__dirname, '../customer-relationships-routes.js') },
  ];

  // 주요 컬렉션명 (COLLECTIONS에 정의된 것들)
  const coreCollections = ['customers', 'contracts', 'files', 'users', 'customer_relationships'];

  describe('@aims/shared-schema import', () => {
    filesToCheck.forEach(({ name, path: filePath }) => {
      it(`${name}에서 @aims/shared-schema를 import해야 함`, () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain("require('@aims/shared-schema')");
      });
    });
  });

  describe('하드코딩된 컬렉션명 검증', () => {
    filesToCheck.forEach(({ name, path: filePath }) => {
      coreCollections.forEach(collectionName => {
        it(`${name}에서 '${collectionName}' 하드코딩이 없어야 함`, () => {
          const content = fs.readFileSync(filePath, 'utf-8');

          // db.collection('collectionName') 패턴 검사
          const hardcodedPattern = new RegExp(`db\\.collection\\(['"]${collectionName}['"]\\)`, 'g');
          const matches = content.match(hardcodedPattern);

          if (matches) {
            console.log(`[${name}] 발견된 하드코딩: ${matches.join(', ')}`);
          }

          expect(matches).toBeNull();
        });
      });
    });
  });

  describe('COLLECTIONS 상수 사용', () => {
    filesToCheck.forEach(({ name, path: filePath }) => {
      it(`${name}에서 COLLECTIONS.CUSTOMERS 사용`, () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('COLLECTIONS.CUSTOMERS');
      });
    });

    it('server.js에서 COLLECTIONS.FILES 사용', () => {
      const content = fs.readFileSync(filesToCheck[0].path, 'utf-8');
      expect(content).toContain('COLLECTIONS.FILES');
    });

    it('server.js에서 COLLECTIONS.CONTRACTS 사용', () => {
      const content = fs.readFileSync(filesToCheck[0].path, 'utf-8');
      expect(content).toContain('COLLECTIONS.CONTRACTS');
    });

    it('customer-relationships-routes.js에서 COLLECTIONS.CUSTOMER_RELATIONSHIPS 사용', () => {
      const content = fs.readFileSync(filesToCheck[1].path, 'utf-8');
      expect(content).toContain('COLLECTIONS.CUSTOMER_RELATIONSHIPS');
    });
  });
});
