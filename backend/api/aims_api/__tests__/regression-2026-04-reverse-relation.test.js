/**
 * [소급 회귀] 역방향 관계 _id 중복 버그 (e973f128)
 *
 * 이전 동작: 역방향 관계 생성 시 원본 관계의 _id를 그대로 복사 → MongoDB duplicate key error
 * 수정 후:   역방향 관계 생성 시 _id를 구조분해로 제거 → MongoDB가 새 _id 자동 생성
 *
 * 이 테스트는 internal-routes.js 소스 코드를 검증하여
 * 역방향 관계 생성 로직에서 _id가 올바르게 제거되는지 확인합니다.
 */

const fs = require('fs');
const path = require('path');

describe('[회귀] 역방향 관계 _id 중복 버그 (e973f128)', () => {
  let sourceCode;
  let reverseRelationBlock;

  beforeAll(() => {
    const filePath = path.resolve(__dirname, '../routes/internal-routes.js');
    sourceCode = fs.readFileSync(filePath, 'utf-8');

    // 역방향 관계 생성 블록 추출 (POST /internal/relationships 라우트)
    const routeStart = sourceCode.indexOf("router.post('/internal/relationships'");
    const routeEnd = sourceCode.indexOf("router.", routeStart + 1);
    reverseRelationBlock = sourceCode.substring(routeStart, routeEnd > -1 ? routeEnd : routeStart + 5000);
  });

  it('역방향 관계 생성 시 원본 _id를 구조분해로 제거해야 함', () => {
    // { _id: _, ...rest } 패턴으로 _id를 제거하는지 확인
    expect(reverseRelationBlock).toMatch(
      /\{\s*_id\s*:\s*_\s*,\s*\.\.\.(\w+)\s*\}/
    );
  });

  it('역방향 관계 데이터에 명시적 _id 할당이 없어야 함 (MongoDB 자동 생성)', () => {
    // reverseRelationshipData 변수에 _id를 직접 설정하는 코드가 없어야 함
    const reverseDataStart = reverseRelationBlock.indexOf('reverseRelationshipData');
    if (reverseDataStart === -1) {
      throw new Error('reverseRelationshipData 변수를 찾을 수 없습니다');
    }
    const reverseDataBlock = reverseRelationBlock.substring(reverseDataStart, reverseDataStart + 1000);

    // _id: new ObjectId() 같은 명시적 할당이 없어야 함 (MongoDB가 자동 생성)
    expect(reverseDataBlock).not.toMatch(/_id\s*:\s*new\s+ObjectId/);
  });

  it('역방향 관계의 from/to customer_id가 원본과 반대여야 함', () => {
    // 역방향에서 from_customer_id: toObjectId, to_customer_id: fromObjectId 패턴 확인
    const reverseStart = reverseRelationBlock.indexOf('reverseRelationshipData');
    if (reverseStart === -1) {
      throw new Error('reverseRelationshipData 변수를 찾을 수 없습니다');
    }
    const block = reverseRelationBlock.substring(reverseStart, reverseStart + 1000);

    expect(block).toContain('from_customer_id: toObjectId');
    expect(block).toContain('to_customer_id: fromObjectId');
  });

  it('역방향 관계의 relationship_type이 reverse 타입이어야 함', () => {
    const reverseStart = reverseRelationBlock.indexOf('reverseRelationshipData');
    if (reverseStart === -1) {
      throw new Error('reverseRelationshipData 변수를 찾을 수 없습니다');
    }
    const block = reverseRelationBlock.substring(reverseStart, reverseStart + 1000);

    // typeConfig.reverse를 사용하는지 확인
    expect(block).toContain('typeConfig.reverse');
  });

  it('기존 역방향 관계가 있으면 중복 생성하지 않아야 함', () => {
    // existingReverseRelation 체크가 있는지 확인
    expect(reverseRelationBlock).toContain('existingReverseRelation');

    // from_customer_id: toObjectId, to_customer_id: fromObjectId로 조회하는지 확인
    const checkStart = reverseRelationBlock.indexOf('existingReverseRelation');
    const checkBlock = reverseRelationBlock.substring(checkStart, checkStart + 500);

    expect(checkBlock).toContain('from_customer_id');
    expect(checkBlock).toContain('to_customer_id');
  });
});
