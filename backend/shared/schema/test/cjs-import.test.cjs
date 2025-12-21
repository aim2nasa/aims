/**
 * CommonJS Import 테스트
 *
 * aims_api (CommonJS 기반)에서 @aims/shared-schema를 사용할 수 있는지 검증
 */

const assert = require('assert');

// @aims/shared-schema를 require()로 import
const { COLLECTIONS, CUSTOMER_FIELDS, CUSTOMER_TYPES, CUSTOMER_STATUS } = require('../dist/cjs/index.js');

// 테스트
console.log('=== CommonJS Import Test ===');

// 1. COLLECTIONS 상수 검증
assert.strictEqual(COLLECTIONS.CUSTOMERS, 'customers', 'COLLECTIONS.CUSTOMERS should be "customers"');
assert.strictEqual(COLLECTIONS.FILES, 'files', 'COLLECTIONS.FILES should be "files"');
assert.strictEqual(COLLECTIONS.CONTRACTS, 'contracts', 'COLLECTIONS.CONTRACTS should be "contracts"');
assert.strictEqual(COLLECTIONS.USERS, 'users', 'COLLECTIONS.USERS should be "users"');
console.log('COLLECTIONS:', Object.keys(COLLECTIONS).length, 'items');

// 2. CUSTOMER_FIELDS 상수 검증
assert.strictEqual(CUSTOMER_FIELDS.MEMO, 'memo', 'CUSTOMER_FIELDS.MEMO should be "memo"');
assert.strictEqual(CUSTOMER_FIELDS.PERSONAL_INFO.NAME, 'personal_info.name', 'CUSTOMER_FIELDS.PERSONAL_INFO.NAME check');
assert.strictEqual(CUSTOMER_FIELDS.META.CREATED_BY, 'meta.created_by', 'CUSTOMER_FIELDS.META.CREATED_BY check');
console.log('CUSTOMER_FIELDS loaded successfully');

// 3. CUSTOMER_TYPES 상수 검증
assert.strictEqual(CUSTOMER_TYPES.INDIVIDUAL, '개인', 'CUSTOMER_TYPES.INDIVIDUAL should be "개인"');
assert.strictEqual(CUSTOMER_TYPES.CORPORATE, '법인', 'CUSTOMER_TYPES.CORPORATE should be "법인"');
console.log('CUSTOMER_TYPES loaded successfully');

// 4. CUSTOMER_STATUS 상수 검증
assert.strictEqual(CUSTOMER_STATUS.ACTIVE, 'active', 'CUSTOMER_STATUS.ACTIVE should be "active"');
assert.strictEqual(CUSTOMER_STATUS.DORMANT, 'dormant', 'CUSTOMER_STATUS.DORMANT should be "dormant"');
console.log('CUSTOMER_STATUS loaded successfully');

console.log('=== All CommonJS tests passed! ===');
