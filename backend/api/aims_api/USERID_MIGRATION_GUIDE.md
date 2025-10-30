# server.js userId 필터링 추가 가이드

`server.js` 파일이 2650줄로 매우 크므로, 수정이 필요한 핵심 부분만 정리했습니다.

---

## 🎯 수정 원칙

1. **모든 조회 API**: `query` 객체에 `owner_id: userId` 추가
2. **모든 생성 API**: 저장 시 `owner_id: userId` 자동 추가
3. **userId 추출**: `req.query.userId` 또는 `req.headers['x-user-id']` 사용
4. **필수 검증**: userId가 없으면 400 에러 반환

---

## 📋 수정 대상 엔드포인트

### 1. 문서 관련 API (5개)

| Line | Endpoint | 수정 필요 |
|------|----------|-----------|
| 162 | `GET /api/documents` | ✅ 필수 |
| 430 | `GET /api/documents/status` | ✅ 필수 |
| 574 | `GET /api/documents/:id/status` | ✅ 필수 |
| 678 | `GET /api/documents/statistics` | ✅ 필수 |
| 798 | `GET /api/documents/status/live` | ✅ 필수 |

### 2. 고객 관련 API (7개)

| Line | Endpoint | 수정 필요 |
|------|----------|-----------|
| 1060 | `GET /api/customers` | ✅ 필수 |
| 1284 | `GET /api/customers/:id` | ✅ 필수 |
| 1738 | `GET /api/customers/:id/documents` | ✅ 필수 |
| 2253 | `GET /api/customers/:customerId/annual-reports` | ✅ 필수 |
| 2289 | `GET /api/customers/:customerId/annual-reports/pending` | ✅ 필수 |
| 2339 | `GET /api/customers/:customerId/annual-reports/latest` | ✅ 필수 |
| 2438 | `GET /api/customers/:id/address-history` | ✅ 필수 |

**POST/PUT/DELETE 엔드포인트도 확인 필요**

---

## 🔧 수정 패턴

### 패턴 1: 조회 API (GET)

**수정 전:**
```javascript
app.get('/api/documents', async (req, res) => {
  try {
    let query = {};

    // 검색 조건 추가
    if (search) {
      query = {
        'upload.originalName': { $regex: escapedSearch, $options: 'i' }
      };
    }

    // MongoDB 쿼리
    const documents = await db.collection('files')
      .find(query)
      .toArray();
```

**수정 후:**
```javascript
app.get('/api/documents', async (req, res) => {
  try {
    // ✅ 1. userId 추출 및 검증
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    // ✅ 2. query 객체에 owner_id 추가
    let query = {
      owner_id: userId  // 필수!
    };

    // 검색 조건 추가
    if (search) {
      query['upload.originalName'] = { $regex: escapedSearch, $options: 'i' };
    }

    // MongoDB 쿼리
    const documents = await db.collection('files')
      .find(query)
      .toArray();
```

### 패턴 2: 생성 API (POST)

**수정 전:**
```javascript
app.post('/api/customers', async (req, res) => {
  try {
    const customerData = {
      personal_info: req.body.personal_info,
      meta: {
        created_at: new Date(),
        status: 'active'
      }
    };

    const result = await db.collection('customers').insertOne(customerData);
```

**수정 후:**
```javascript
app.post('/api/customers', async (req, res) => {
  try {
    // ✅ 1. userId 추출 및 검증
    const userId = req.body.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    const customerData = {
      personal_info: req.body.personal_info,
      meta: {
        created_at: new Date(),
        created_by: userId,  // ✅ 추가!
        status: 'active'
      }
    };

    const result = await db.collection('customers').insertOne(customerData);
```

### 패턴 3: 단일 조회 API (GET /:id)

**수정 전:**
```javascript
app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await db.collection('customers').findOne({
      _id: new ObjectId(req.params.id)
    });
```

**수정 후:**
```javascript
app.get('/api/customers/:id', async (req, res) => {
  try {
    // ✅ 1. userId 추출 및 검증
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    // ✅ 2. query에 owner_id 추가
    const customer = await db.collection('customers').findOne({
      _id: new ObjectId(req.params.id),
      'meta.created_by': userId  // ✅ 추가!
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found or access denied'
      });
    }
```

---

## 🚨 중요한 수정 사항

### 1. Line 162: `/api/documents` (가장 중요!)

**위치**: Line 237 (`let query = {}` 다음)

```javascript
// 수정 전
let query = {};

// 검색 조건 추가
if (search) {
  // ...
}

// 수정 후
// ✅ userId 추출 (최상단에 추가)
const userId = req.query.userId || req.headers['x-user-id'];
if (!userId) {
  return res.status(400).json({ success: false, error: 'userId required' });
}

let query = {
  owner_id: userId  // ✅ 필수!
};

// 검색 조건 추가
if (search) {
  query['upload.originalName'] = { $regex: escapedSearch, $options: 'i' };
}
```

### 2. Line 1060: `/api/customers`

**위치**: Line 1073 (`let filter = {}` 다음)

```javascript
// 수정 전
let filter = {};

// 기본 검색
if (search) {
  // ...
}

// 수정 후
// ✅ userId 추출 (최상단에 추가)
const userId = req.query.userId || req.headers['x-user-id'];
if (!userId) {
  return res.status(400).json({ success: false, error: 'userId required' });
}

let filter = {
  'meta.created_by': userId  // ✅ 필수!
};

// 기본 검색
if (search) {
  // 기존 코드 유지
}
```

---

## 📝 수정 체크리스트

### Phase 1: 조회 API (GET)

- [ ] Line 162: `GET /api/documents`
- [ ] Line 430: `GET /api/documents/status`
- [ ] Line 574: `GET /api/documents/:id/status`
- [ ] Line 678: `GET /api/documents/statistics`
- [ ] Line 798: `GET /api/documents/status/live`
- [ ] Line 1060: `GET /api/customers`
- [ ] Line 1284: `GET /api/customers/:id`
- [ ] Line 1738: `GET /api/customers/:id/documents`
- [ ] Line 2253: `GET /api/customers/:customerId/annual-reports`
- [ ] Line 2289: `GET /api/customers/:customerId/annual-reports/pending`
- [ ] Line 2339: `GET /api/customers/:customerId/annual-reports/latest`
- [ ] Line 2438: `GET /api/customers/:id/address-history`

### Phase 2: 생성 API (POST)

생성 API를 찾아서 수정:
```bash
grep -n "app.post.*\/api\/(customers|documents)" server.js
```

- [ ] `POST /api/customers` - `meta.created_by` 추가
- [ ] 기타 POST 엔드포인트 확인

### Phase 3: 수정/삭제 API (PUT/DELETE)

- [ ] `PUT /api/customers/:id` - userId 검증
- [ ] `DELETE /api/customers/:id` - userId 검증
- [ ] `DELETE /api/documents/:id` - userId 검증

---

## 🧪 테스트 방법

### 1. userId 없이 호출 (실패해야 함)

```bash
curl http://tars.giize.com:3010/api/documents
# 예상: {"success": false, "error": "userId required"}
```

### 2. userId와 함께 호출 (성공)

```bash
curl "http://tars.giize.com:3010/api/documents?userId=tester"
# 예상: {"success": true, "data": {...}}
```

### 3. 다른 사용자로 호출 (빈 결과)

```bash
curl "http://tars.giize.com:3010/api/documents?userId=other_user"
# 예상: {"success": true, "data": {"documents": []}}
```

---

## 🔍 수정 후 확인 사항

1. **컴파일 오류 없음**
2. **서버 재시작 성공**
3. **userId 없이 호출 시 400 에러**
4. **userId와 함께 호출 시 정상 동작**
5. **기존 기능 모두 정상 동작**

---

**작성일**: 2025-10-30
**다음 단계**: 실제 server.js 파일 수정 및 테스트
