# @aims/shared-schema

AIMS 백엔드 서비스들이 공유하는 MongoDB 스키마 정의

## 왜 필요한가?

```
┌─────────────┐
│   aims_mcp  │──────┐
└─────────────┘      │
                     ▼
              ┌─────────────┐
              │   MongoDB   │  ← 같은 DB를 직접 접근
              └─────────────┘
                     ▲
┌─────────────┐      │
│   aims_api  │──────┘
└─────────────┘
```

두 서비스가 같은 MongoDB를 직접 접근하므로, 스키마 일관성이 필수입니다.

## 설치

```bash
# aims_api (CommonJS)
npm install @aims/shared-schema

# aims_mcp (ESM)
npm install @aims/shared-schema
```

package.json:
```json
{
  "dependencies": {
    "@aims/shared-schema": "file:../../shared/schema"
  }
}
```

## 사용법

### CommonJS (aims_api)
```javascript
const { COLLECTIONS, CUSTOMER_FIELDS, CUSTOMER_STATUS } = require('@aims/shared-schema');

// 컬렉션 접근
db.collection(COLLECTIONS.CUSTOMERS)
db.collection(COLLECTIONS.CONTRACTS)
db.collection(COLLECTIONS.FILES)

// 필드명 사용
customer[CUSTOMER_FIELDS.MEMO]
customer[CUSTOMER_FIELDS.STATUS]
```

### ESM (aims_mcp)
```typescript
import { COLLECTIONS, CUSTOMER_FIELDS, CUSTOMER_STATUS } from '@aims/shared-schema';

// 동일하게 사용
db.collection(COLLECTIONS.CUSTOMERS)
```

## 제공하는 상수

### COLLECTIONS
```typescript
COLLECTIONS.CUSTOMERS            // 'customers'
COLLECTIONS.CONTRACTS            // 'contracts'
COLLECTIONS.FILES                // 'files'
COLLECTIONS.USERS                // 'users'
COLLECTIONS.CUSTOMER_MEMOS       // 'customer_memos'
COLLECTIONS.CUSTOMER_RELATIONSHIPS // 'customer_relationships'
COLLECTIONS.INSURANCE_PRODUCTS   // 'insurance_products'
```

### CUSTOMER_FIELDS
```typescript
CUSTOMER_FIELDS.MEMO             // 'memo'
CUSTOMER_FIELDS.STATUS           // 'status'
CUSTOMER_FIELDS.TYPE             // 'type'
CUSTOMER_FIELDS.PERSONAL_INFO    // 'personal_info'
CUSTOMER_FIELDS.META             // 'meta'
```

### CUSTOMER_STATUS
```typescript
CUSTOMER_STATUS.ACTIVE           // 'active'
CUSTOMER_STATUS.DORMANT          // 'dormant'
```

## 빌드

```bash
cd backend/shared/schema
npm install
npm run build
npm test
```

## 새 상수 추가하기

1. `collections.ts` 또는 `customers.ts` 수정
2. `index.ts`에서 export 확인
3. `npm run build`
4. aims_api, aims_mcp 재배포

## 주의사항

- 하드코딩 금지: `db.collection('customers')` ❌
- 상수 사용: `db.collection(COLLECTIONS.CUSTOMERS)` ✅
- 스키마 변경 시 양쪽 서비스 재배포 필요
