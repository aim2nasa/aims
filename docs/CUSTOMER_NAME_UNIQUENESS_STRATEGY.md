# 고객명 기반 고유성 보장 전략

## 📌 핵심 원칙

**고객명 = 100% Unique Identifier**

DB 전체(활성/휴면 무관)에서 고객명은 단 하나만 존재한다.

---

## 🎯 문제 정의

### 현재 상황 (Hard Delete)

```
시나리오 1: 고객 삭제 후 재등록
  1. "홍길동" 고객 등록 (ObjectId: abc123)
  2. "홍길동" 고객 삭제 → DB에서 완전히 제거
  3. 다시 "홍길동" 고객 등록 (ObjectId: def456)

문제:
  - ObjectId만 다르고 이름은 동일
  - 사용자는 ObjectId를 모름
  - "홍길동"이 누구인지 혼란
  - 과거 홍길동의 문서가 새 홍길동에게 보일 수 있음 (버그 발생 시)
```

### 근본 원인

**컴퓨터와 사용자의 식별 방식 차이**

| 주체 | 고유 식별자 |
|------|------------|
| 컴퓨터 | ObjectId (`69340e4a219da412d46e4ab9`) |
| 사용자 | 고객명 (`홍길동`) |

→ 사용자는 고객명을 고유 식별자처럼 사용하므로, **고객명의 유일성이 보장되어야 함**

---

## ✅ 해결 방안: Full Unique Index + Soft Delete

### 1. Full Unique Index

```javascript
// MongoDB Unique Index
db.customers.createIndex(
  { name: 1, customer_type: 1 },
  { unique: true }  // DB 전체(활성/휴면 무관)에서 유일
);
```

**보장**:
- 개인 고객 "홍길동"은 DB 전체에서 단 하나만 존재
- 법인 고객 "삼성전자"는 DB 전체에서 단 하나만 존재
- 개인 "홍길동"과 법인 "홍길동"은 다른 customer_type이므로 공존 가능

### 2. Soft Delete (휴면 처리)

```javascript
// 고객 구조
{
  _id: ObjectId,
  name: "홍길동",
  customer_type: "개인",
  status: "active",        // "active" | "inactive"
  deleted_at: null,        // 휴면 처리 시간
  deleted_by: userId,      // 누가 휴면 처리했는지
  // ... 기타 필드
}

// 삭제 로직 변경
// ❌ Before (Hard Delete)
await db.collection('customers').deleteOne({ _id: customerId });

// ✅ After (Soft Delete)
await db.collection('customers').updateOne(
  { _id: customerId },
  {
    $set: {
      status: 'inactive',
      deleted_at: new Date(),
      deleted_by: userId
    }
  }
);
```

---

## 🔄 동작 원리

### Case 1: 신규 고객 등록

```
DB 상태: (비어있음)

등록: "홍길동" (개인)
결과: ✅ 성공

DB:
  홍길동 (status: "active")
```

### Case 2: 중복 고객명 등록 시도 (활성)

```
DB 상태:
  홍길동 (status: "active")

등록: "홍길동" (개인)
결과: ❌ 거부

에러: "이미 '홍길동' 고객이 존재합니다"
```

### Case 3: 고객 휴면 처리

```
DB 상태:
  홍길동 (status: "active")

휴면 처리: 홍길동
결과: ✅ 성공

DB:
  홍길동 (status: "inactive", deleted_at: 2025-12-06)

UI:
  [활성 고객] 목록에서 사라짐
  [휴면 고객] 목록에 나타남
```

### Case 4: 휴면 고객 있을 때 신규 등록 시도

```
DB 상태:
  홍길동 (status: "inactive", deleted_at: 2025-12-06)

등록: "홍길동" (개인)
결과: ❌ 거부

에러:
  "이미 '홍길동' 고객이 존재합니다 (휴면 상태)"

선택지:
  [기존 고객 복원] [다른 이름 사용]
```

### Case 5: 휴면 고객 복원

```
DB 상태:
  홍길동 (status: "inactive", deleted_at: 2025-12-06)

복원: 홍길동
결과: ✅ 성공

DB:
  홍길동 (status: "active", deleted_at: null)

UI:
  [휴면 고객] 목록에서 사라짐
  [활성 고객] 목록에 나타남
```

### Case 6: 다른 이름으로 등록

```
DB 상태:
  홍길동 (status: "inactive")

등록: "홍길동 서울" (개인)
결과: ✅ 성공

DB:
  홍길동 (status: "inactive")
  홍길동 서울 (status: "active")
```

---

## 🎯 핵심 보장 사항

### 1. 고객명 = 완벽한 고유 식별자

```
사용자: "홍길동의 문서를 보여줘"
시스템: DB에서 "홍길동" 검색 → 무조건 한 명만 존재
        → 즉시 식별, 혼란 제로
```

### 2. 히스토리 완전 보존

```
휴면 처리 = 삭제가 아님
  - 모든 데이터 보존
  - 언제든 복원 가능
  - 감사/규제 대응 가능
```

### 3. 실수 복구 가능

```
"아, 잘못 삭제했어요!"
  → [휴면 고객] 탭에서 [복원] 클릭
  → 모든 데이터 그대로 복구
```

### 4. 데이터 무결성

```
원칙: DB 전체에서 고객명당 단 하나의 레코드
결과:
  - 중복 참조 불가능
  - 잘못된 고객 연결 원천 차단
  - 데이터 일관성 보장
```

---

## 💡 장점

### 1. 심플함
- **규칙 하나**: 고객명은 DB 전체에서 유일
- 예외 없음
- 이해하기 쉬움

### 2. 오해 방지
- "홍길동" = 무조건 한 명
- "어느 홍길동?" 같은 질문 발생 불가

### 3. UX 자연스러움
- 사용자는 고객명으로 고객을 인식
- 시스템도 고객명으로 고유 식별
- 인식 방식 일치

### 4. 규제 대응
- 보험업계 특성: 고객 이력 보존 의무
- Soft Delete로 완전한 히스토리 보존
- 감사 추적 가능 (deleted_by, deleted_at)

### 5. 확장성
- 나중에 다른 필드 추가 시에도 원칙 유지
- 복합 유니크 키 가능: (name, customer_type, branch_code)

---

## ⚠️ 트레이드오프

### 동명이인 처리

**문제**:
```
실제 세계:
  - 홍길동(서울) 고객 관리 중
  - 홍길동(부산) 신규 고객 영입

시스템 제약:
  "홍길동" 중복 불가
```

**해결**:
```
방법 1: 지역 추가
  - 홍길동 서울
  - 홍길동 부산

방법 2: 번호 추가
  - 홍길동
  - 홍길동 (2)

방법 3: 생년월일 추가
  - 홍길동 (1990)
  - 홍길동 (1985)
```

**판단**:
- 보험 설계사는 고객을 잘 알고 있음
- 실제로 동명이인이 많지 않음
- 명확한 구분 필요 시 추가 정보 입력
- 이는 실제 세계에서도 동일 (전화할 때도 "어느 홍길동인지" 구분 필요)

---

## 🔧 구현 계획

### Phase 1: DB 변경

#### 1.1 스키마 수정
```javascript
// customers 컬렉션에 필드 추가
{
  status: "active",       // 기본값
  deleted_at: null,       // 휴면 시 Date
  deleted_by: null        // 휴면 시 userId
}
```

#### 1.2 Unique Index 생성
```javascript
// 기존 인덱스 삭제 (있다면)
db.customers.dropIndex("name_1_customer_type_1");

// 새 인덱스 생성
db.customers.createIndex(
  { name: 1, customer_type: 1 },
  {
    unique: true,
    name: "unique_customer_name"
  }
);
```

#### 1.3 기존 데이터 마이그레이션
```javascript
// 모든 기존 고객에 status 필드 추가
db.customers.updateMany(
  { status: { $exists: false } },
  {
    $set: {
      status: "active",
      deleted_at: null,
      deleted_by: null
    }
  }
);
```

### Phase 2: Backend API 수정

#### 2.1 고객 삭제 → 휴면 처리
```javascript
// server.js - DELETE /api/customers/:id
app.delete('/api/customers/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Hard Delete → Soft Delete로 변경
    const result = await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'inactive',
          deleted_at: utcNowDate(),
          deleted_by: userId
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '고객을 찾을 수 없습니다'
      });
    }

    // 연결된 문서/계약도 휴면 처리 (옵션)
    // await cascadeInactivate(id);

    res.json({
      success: true,
      message: '고객이 휴면 처리되었습니다'
    });
  } catch (error) {
    console.error('Customer inactivation error:', error);
    res.status(500).json({
      success: false,
      message: '고객 휴면 처리 실패'
    });
  }
});
```

#### 2.2 고객 복원 API 구현
```javascript
// server.js - POST /api/customers/:id/restore
app.post('/api/customers/:id/restore', authenticateJWT, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id), status: 'inactive' },
      {
        $set: {
          status: 'active',
          deleted_at: null,
          deleted_by: null
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '복원할 수 없는 고객입니다'
      });
    }

    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      data: customer,
      message: '고객이 복원되었습니다'
    });
  } catch (error) {
    console.error('Customer restore error:', error);
    res.status(500).json({
      success: false,
      message: '고객 복원 실패'
    });
  }
});
```

#### 2.3 고객 등록 시 중복 검증 강화
```javascript
// server.js - POST /api/customers
app.post('/api/customers', authenticateJWT, async (req, res) => {
  const { name, customer_type } = req.body;

  try {
    // 중복 고객 검사 (활성 + 휴면 모두)
    const existing = await db.collection(CUSTOMERS_COLLECTION).findOne({
      name: name.trim(),
      customer_type
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_CUSTOMER_NAME',
        message: `이미 '${name}' 고객이 존재합니다`,
        existing_customer: {
          id: existing._id.toString(),
          status: existing.status,
          deleted_at: existing.deleted_at
        },
        suggestions: existing.status === 'inactive'
          ? ['기존 고객을 복원하시겠습니까?', '다른 이름을 사용하세요']
          : ['다른 이름을 사용하세요']
      });
    }

    // 고객 생성
    const newCustomer = {
      name: name.trim(),
      customer_type,
      status: 'active',
      deleted_at: null,
      deleted_by: null,
      created_at: utcNowDate(),
      // ... 기타 필드
    };

    const result = await db.collection(CUSTOMERS_COLLECTION)
      .insertOne(newCustomer);

    res.json({
      success: true,
      data: { ...newCustomer, _id: result.insertedId }
    });
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_CUSTOMER_NAME',
        message: `이미 '${name}' 고객이 존재합니다`
      });
    }
    console.error('Customer creation error:', error);
    res.status(500).json({
      success: false,
      message: '고객 생성 실패'
    });
  }
});
```

#### 2.4 고객 조회 필터 수정
```javascript
// 모든 조회 쿼리에 status 필터 추가

// 활성 고객만 조회
app.get('/api/customers', async (req, res) => {
  const { status = 'active' } = req.query;

  const customers = await db.collection(CUSTOMERS_COLLECTION)
    .find({ status })
    .toArray();

  res.json({ success: true, data: customers });
});

// 휴면 고객 조회
app.get('/api/customers/inactive', async (req, res) => {
  const customers = await db.collection(CUSTOMERS_COLLECTION)
    .find({ status: 'inactive' })
    .sort({ deleted_at: -1 })
    .toArray();

  res.json({ success: true, data: customers });
});
```

### Phase 3: Frontend 수정

#### 3.1 TypeScript 타입 추가
```typescript
// frontend/aims-uix3/src/entities/customer/model.ts

export interface Customer {
  _id: string;
  name: string;
  customer_type: '개인' | '법인';
  status: 'active' | 'inactive';  // 추가
  deleted_at: string | null;       // 추가
  deleted_by: string | null;       // 추가
  // ... 기타 필드
}
```

#### 3.2 고객 목록에 탭 추가
```typescript
// CustomerListPage.tsx

const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');

return (
  <div>
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tab value="active">활성 고객</Tab>
      <Tab value="inactive">휴면 고객</Tab>
    </Tabs>

    {activeTab === 'active' && <ActiveCustomerList />}
    {activeTab === 'inactive' && <InactiveCustomerList />}
  </div>
);
```

#### 3.3 버튼 텍스트 변경
```typescript
// CustomerDetailPage.tsx

{customer.status === 'active' ? (
  <Button
    variant="destructive"
    onClick={handleInactivate}
  >
    휴면 처리
  </Button>
) : (
  <Button
    variant="primary"
    onClick={handleRestore}
  >
    복원
  </Button>
)}
```

#### 3.4 중복 고객명 에러 처리
```typescript
// CreateCustomerForm.tsx

try {
  await CustomerService.createCustomer(data);
  onSuccess();
} catch (error) {
  if (error.error === 'DUPLICATE_CUSTOMER_NAME') {
    // 중복 고객명 에러 처리
    const { existing_customer, suggestions } = error;

    if (existing_customer.status === 'inactive') {
      // 휴면 고객 복원 제안
      showConfirmDialog({
        title: '중복된 고객명',
        message: `이미 '${data.name}' 고객이 존재합니다 (휴면 상태)`,
        actions: [
          {
            label: '기존 고객 복원',
            onClick: () => handleRestore(existing_customer.id)
          },
          {
            label: '다른 이름 사용',
            onClick: () => focusNameInput()
          }
        ]
      });
    } else {
      // 활성 고객 중복
      showErrorDialog({
        title: '중복된 고객명',
        message: `이미 '${data.name}' 고객이 존재합니다`,
        hint: '다른 이름을 사용해주세요 (예: 홍길동 서울)'
      });
    }
  } else {
    showError(error.message);
  }
}
```

### Phase 4: 연관 데이터 처리

#### Cascade Inactivate (선택 사항)

**옵션 1: 함께 휴면 처리**
```javascript
async function cascadeInactivate(customerId) {
  // 연결된 문서 휴면 처리
  await db.collection('documents').updateMany(
    { customerId: new ObjectId(customerId) },
    { $set: { status: 'inactive', deleted_at: new Date() } }
  );

  // 연결된 계약 휴면 처리
  await db.collection('contracts').updateMany(
    { customerId: new ObjectId(customerId) },
    { $set: { status: 'inactive', deleted_at: new Date() } }
  );
}
```

**옵션 2: 그대로 유지 (추천)**
```
고객만 휴면 처리, 문서/계약은 유지
→ 히스토리 조회 가능
→ 고객 복원 시 모든 데이터 그대로 연결됨
```

---

## 📊 예상 효과

### 1. 데이터 무결성
```
Before: 같은 이름 고객 여러 개 → 혼란
After:  고객명 = 유일 → 명확
```

### 2. 사용자 경험
```
Before: "홍길동이 두 명인데 어떤 사람이죠?"
After:  "홍길동" 검색 → 무조건 한 명
```

### 3. 히스토리 보존
```
Before: 삭제 시 영구 소실
After:  휴면 처리 → 언제든 복원
```

### 4. 규제 대응
```
감사: "2024년 홍길동 고객 이력 보여주세요"
시스템: 휴면 고객이라도 모든 데이터 조회 가능 ✅
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 신규 고객 등록
```
1. "홍길동" 등록
   ✅ 성공

2. 다시 "홍길동" 등록
   ❌ 거부: "이미 홍길동 고객이 존재합니다"
```

### 시나리오 2: 휴면 처리 후 복원
```
1. "홍길동" 휴면 처리
   ✅ 성공 (status: inactive)

2. "홍길동" 복원
   ✅ 성공 (status: active)

3. 모든 데이터 그대로 유지
   ✅ 확인
```

### 시나리오 3: 휴면 고객 있을 때 신규 등록
```
1. "홍길동" 휴면 처리

2. 신규 "홍길동" 등록 시도
   ❌ 거부: "이미 홍길동 고객이 존재합니다 (휴면 상태)"

3. 제안:
   [기존 고객 복원] [다른 이름 사용]
```

### 시나리오 4: 동명이인 처리
```
1. "홍길동" 등록
   ✅ 성공

2. "홍길동 서울" 등록
   ✅ 성공 (다른 이름이므로 허용)

3. DB:
   - 홍길동 (status: active)
   - 홍길동 서울 (status: active)
```

### 시나리오 5: 개인/법인 구분
```
1. 개인 "홍길동" 등록
   ✅ 성공

2. 법인 "홍길동" 등록
   ✅ 성공 (customer_type이 다르므로 허용)

3. DB:
   - 홍길동 (customer_type: 개인)
   - 홍길동 (customer_type: 법인)
```

---

## 📅 릴리스 계획

### Phase 1: DB 변경 (개발 환경)
- [ ] 스키마 수정
- [ ] Unique Index 생성
- [ ] 기존 데이터 마이그레이션
- [ ] 테스트

### Phase 2: Backend API (개발 환경)
- [ ] Soft Delete 구현
- [ ] 복원 API 구현
- [ ] 중복 검증 강화
- [ ] 테스트

### Phase 3: Frontend (개발 환경)
- [ ] 타입 수정
- [ ] UI 변경 (탭, 버튼)
- [ ] 에러 처리
- [ ] 테스트

### Phase 4: 통합 테스트
- [ ] 전체 시나리오 테스트
- [ ] 버그 수정

### Phase 5: 프로덕션 배포
- [ ] DB 백업
- [ ] 배포
- [ ] 모니터링

---

## 🔑 핵심 요약

1. **고객명 = 100% Unique Identifier**
   - DB 전체에서 단 하나만 존재

2. **Soft Delete = 휴면 처리**
   - 실제 삭제 안 함
   - 히스토리 완전 보존

3. **심플하고 명확**
   - 규칙 하나: 고객명 유일
   - 오해 없음

4. **자연스러운 UX**
   - 사용자 인식 = 시스템 인식
   - 일관성 보장

---

## 📚 참고 문서

- [CUSTOMER_RELATION_MIGRATION_COMPLETE.md](./CUSTOMER_RELATION_MIGRATION_COMPLETE.md) - 문서-고객 연결 통일
- [CLAUDE.md](../CLAUDE.md) - 개발 가이드라인

---

## 🔐 개발자 모드 및 권한 분리 전략

### 핵심 원칙

**Hard Delete와 Soft Delete의 명확한 분리**

```
Soft Delete (휴면 처리):
  - 일반 사용자에게 제공
  - 기본 삭제 방식
  - 데이터 보존
  - 복원 가능

Hard Delete (완전 삭제):
  - 개발 모드에서만 접근 가능
  - 현재: 개발 환경에서 자유롭게 사용
  - 추후: 프로덕션에서 관리자 비밀번호 필요
  - 데이터 영구 삭제
```

---

### 환경별 동작 방식

#### 개발 환경 (현재)

```typescript
// import.meta.env.DEV = true

고객 상세 페이지 UI:
  [고객 삭제 (완전)] ← Hard Delete (항상 표시)
  [휴면 처리]        ← Soft Delete (신규 추가)

특징:
  - 두 버튼 모두 표시
  - 비밀번호 체크 없음
  - 빠른 개발/테스트 가능
  - Hard Delete로 테스트 데이터 빠르게 정리
  - Soft Delete로 프로덕션 동작 시뮬레이션
```

#### 프로덕션 환경 (추후)

```typescript
// import.meta.env.DEV = false

기본 상태 (개발자 모드 비활성):
  고객 상세 페이지 UI:
    [휴면 처리] ← Soft Delete만 표시

개발자 모드 활성 (관리자 비밀번호 입력 후):
  고객 상세 페이지 UI:
    [고객 삭제 (완전)] ← Hard Delete 표시됨
    [휴면 처리]        ← Soft Delete

  유효 시간:
    - 1시간 후 자동 만료
    - 또는 세션 종료 시 만료
```

---

### UI 구조

#### 고객 상세 페이지

```tsx
// CustomerDetailPage.tsx

export function CustomerDetailPage() {
  const { customer } = useCustomer();
  const isDev = import.meta.env.DEV;
  const isDevMode = useDevMode(); // 개발자 모드 상태

  return (
    <div className="customer-actions">
      {/* 개발 환경: Hard Delete 버튼 항상 표시 */}
      {isDev && (
        <Button
          variant="destructive"
          onClick={handleHardDelete}
        >
          고객 삭제 (완전)
        </Button>
      )}

      {/* 모든 환경: Soft Delete 버튼 */}
      {customer.status === 'active' ? (
        <Button
          variant="secondary"
          onClick={handleSoftDelete}
        >
          휴면 처리
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={handleRestore}
        >
          복원
        </Button>
      )}

      {/* 프로덕션 + 개발자 모드: Hard Delete 버튼 */}
      {!isDev && isDevMode && (
        <Button
          variant="destructive"
          onClick={handleHardDelete}
        >
          ⚠️ 고객 삭제 (완전)
        </Button>
      )}
    </div>
  );
}
```

#### 개발자 모드 진입 UI

```tsx
// Navbar.tsx 또는 SettingsPage.tsx

export function Navbar() {
  const isDev = import.meta.env.DEV;
  const isDevMode = useDevMode();
  const [showDevDialog, setShowDevDialog] = useState(false);

  // 프로덕션 환경에서만 표시
  if (isDev) return null;

  return (
    <nav>
      {isDevMode ? (
        <Button
          variant="ghost"
          onClick={exitDevMode}
        >
          🔓 개발자 모드 (활성) - 종료
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setShowDevDialog(true)}
        >
          🔒 개발자 모드
        </Button>
      )}

      {showDevDialog && (
        <DevModeDialog onClose={() => setShowDevDialog(false)} />
      )}
    </nav>
  );
}
```

---

### API 설계

#### 통합 삭제 API

```javascript
// server.js - DELETE /api/customers/:id

app.delete('/api/customers/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { permanent = false } = req.query; // ?permanent=true

  try {
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: '고객을 찾을 수 없습니다'
      });
    }

    // === Hard Delete 요청 ===
    if (permanent === 'true') {
      // 프로덕션에서는 개발자 모드 검증 필요
      if (process.env.NODE_ENV === 'production') {
        // 개발자 모드 토큰 검증 로직
        // (프론트엔드에서 이미 검증된 상태)
      }

      // 감사 로그
      await db.collection('audit_logs').insertOne({
        action: 'HARD_DELETE_CUSTOMER',
        target_id: id,
        target_name: customer.name,
        user_id: userId,
        environment: process.env.NODE_ENV,
        timestamp: utcNowDate()
      });

      // === 기존 Hard Delete 로직 ===
      // 1. 연결된 문서 완전 삭제 (파일 + DB + Qdrant)
      // 2. 관계 삭제
      // 3. 계약 삭제
      // 4. 고객 삭제

      res.json({
        success: true,
        message: '고객이 완전히 삭제되었습니다'
      });
    } else {
      // === Soft Delete (휴면 처리) ===
      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: 'inactive',
            deleted_at: utcNowDate(),
            deleted_by: userId
          }
        }
      );

      res.json({
        success: true,
        message: '고객이 휴면 처리되었습니다'
      });
    }
  } catch (error) {
    console.error('Customer deletion error:', error);
    res.status(500).json({
      success: false,
      message: '삭제 실패'
    });
  }
});
```

#### 관리자 비밀번호 검증 API (프로덕션용)

```javascript
// server.js - POST /api/dev/verify-admin

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'aims_admin_2025';

app.post('/api/dev/verify-admin', async (req, res) => {
  const { password } = req.body;

  // 프로덕션 환경에서만 비밀번호 체크
  if (process.env.NODE_ENV === 'production') {
    if (password !== ADMIN_PASSWORD) {
      // 감사 로그: 실패한 시도
      await db.collection('audit_logs').insertOne({
        action: 'DEV_MODE_ATTEMPT_FAILED',
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        timestamp: utcNowDate()
      });

      return res.status(401).json({
        success: false,
        message: '비밀번호가 올바르지 않습니다'
      });
    }

    // 성공한 시도 기록
    await db.collection('audit_logs').insertOne({
      action: 'DEV_MODE_ACTIVATED',
      ip_address: req.ip,
      timestamp: utcNowDate()
    });
  }

  res.json({
    success: true,
    message: '개발자 모드가 활성화되었습니다'
  });
});
```

---

### 개발자 모드 상태 관리

```typescript
// stores/devModeStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DevModeState {
  isDevMode: boolean;
  devModeExpiry: number | null;

  enterDevMode: (password: string) => Promise<boolean>;
  exitDevMode: () => void;
  checkDevMode: () => boolean;
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set, get) => ({
      isDevMode: false,
      devModeExpiry: null,

      enterDevMode: async (password: string) => {
        try {
          const response = await api.post('/api/dev/verify-admin', {
            password
          });

          if (response.success) {
            // 1시간 동안 유효
            const expiry = Date.now() + (60 * 60 * 1000);

            set({
              isDevMode: true,
              devModeExpiry: expiry
            });

            return true;
          }
          return false;
        } catch (error) {
          return false;
        }
      },

      exitDevMode: () => {
        set({
          isDevMode: false,
          devModeExpiry: null
        });
      },

      checkDevMode: () => {
        const state = get();

        // 만료 체크
        if (state.devModeExpiry && Date.now() > state.devModeExpiry) {
          get().exitDevMode();
          return false;
        }

        return state.isDevMode;
      }
    }),
    {
      name: 'dev-mode-storage'
    }
  )
);

// Hook
export function useDevMode() {
  const { isDevMode, checkDevMode } = useDevModeStore();

  useEffect(() => {
    checkDevMode();
  }, []);

  return isDevMode && checkDevMode();
}
```

---

### Frontend Service 수정

```typescript
// customerService.ts

export class CustomerService {
  /**
   * 고객 삭제 (Soft Delete - 휴면 처리)
   */
  static async deleteCustomer(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    // Soft Delete (기본)
    await api.delete(ENDPOINTS.CUSTOMER(id));

    // 이벤트 발생
    window.dispatchEvent(new CustomEvent('customerChanged'));
    window.dispatchEvent(new CustomEvent('contractChanged'));
    window.dispatchEvent(new CustomEvent('documentChanged'));
  }

  /**
   * 고객 완전 삭제 (Hard Delete - 개발 모드 전용)
   */
  static async permanentDeleteCustomer(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    // Hard Delete
    await api.delete(`${ENDPOINTS.CUSTOMER(id)}?permanent=true`);

    // 이벤트 발생
    window.dispatchEvent(new CustomEvent('customerChanged'));
    window.dispatchEvent(new CustomEvent('contractChanged'));
    window.dispatchEvent(new CustomEvent('documentChanged'));
  }

  /**
   * 고객 복원
   */
  static async restoreCustomer(id: string): Promise<Customer> {
    if (!id.trim()) {
      throw new Error('고객 ID가 필요합니다');
    }

    const response = await api.post<{ success: boolean; data: unknown }>(
      `${ENDPOINTS.CUSTOMER(id)}/restore`,
      {}
    );

    if (!response.success || !response.data) {
      throw new Error('고객을 복원할 수 없습니다');
    }

    return CustomerUtils.validate(response.data);
  }
}
```

---

### 보안 고려사항

#### 1. 관리자 비밀번호 관리

```bash
# .env (프로덕션)
ADMIN_PASSWORD=strong_random_password_2025!@#$

# 주의사항:
# - 충분히 복잡한 비밀번호 사용 (20자 이상 권장)
# - 정기적으로 변경 (3개월마다)
# - .gitignore에 추가 (Git에 절대 커밋 금지)
# - 환경변수로만 관리
```

#### 2. 개발자 모드 만료 시간

```typescript
// 1시간 후 자동 만료
const expiry = Date.now() + (60 * 60 * 1000);

// 또는 세션 종료 시 즉시 만료 (더 안전)
window.addEventListener('beforeunload', () => {
  useDevModeStore.getState().exitDevMode();
});
```

#### 3. 감사 로그

```javascript
// 모든 중요 작업 기록
audit_logs 컬렉션:
{
  action: 'DEV_MODE_ACTIVATED' | 'DEV_MODE_ATTEMPT_FAILED' | 'HARD_DELETE_CUSTOMER',
  user_id: userId,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  target_id: customerId,
  target_name: customerName,
  timestamp: Date
}
```

---

### 비교표: Hard Delete vs Soft Delete

| 항목 | Hard Delete (완전 삭제) | Soft Delete (휴면 처리) |
|------|------------------------|------------------------|
| **접근** | 개발 모드만 | 모든 사용자 |
| **개발 환경** | 항상 표시 | 항상 표시 (신규) |
| **프로덕션 환경** | 관리자 비밀번호 필요 | 기본 표시 |
| **데이터** | DB에서 완전 제거 | status: 'inactive' |
| **파일** | 물리적 삭제 | 유지 |
| **Qdrant** | 임베딩 삭제 | 유지 |
| **복원** | 불가능 | 가능 |
| **용도** | 테스트 데이터 정리, GDPR 요청 | 일반 고객 관리 |
| **감사 로그** | 상세 기록 | 기본 기록 |
| **API** | `DELETE /api/customers/:id?permanent=true` | `DELETE /api/customers/:id` |
| **버튼 텍스트** | "고객 삭제 (완전)" | "휴면 처리" |

---

### 구현 우선순위

#### Phase 1: 즉시 구현 (개발 편의성)

```
1. UI에 Soft Delete 버튼 추가
   - "휴면 처리" 버튼
   - 기존 Hard Delete 버튼 유지

2. Backend Soft Delete API 구현
   - status: 'inactive' 설정
   - deleted_at, deleted_by 기록

3. 복원 API 구현
   - POST /api/customers/:id/restore
   - status: 'active'로 변경

4. Frontend Service 수정
   - deleteCustomer() - Soft Delete
   - permanentDeleteCustomer() - Hard Delete
   - restoreCustomer() - 복원
```

#### Phase 2: 나중 구현 (프로덕션 준비)

```
1. 개발자 모드 UI/Store 구현
   - DevModeDialog 컴포넌트
   - useDevModeStore 상태 관리

2. 관리자 비밀번호 검증 API
   - POST /api/dev/verify-admin

3. 환경별 버튼 표시 로직
   - 개발: 두 버튼 모두
   - 프로덕션: Soft Delete만 (기본)
   - 프로덕션 + 개발자 모드: 두 버튼 모두

4. 감사 로그 강화
   - 모든 Hard Delete 기록
   - 개발자 모드 진입/실패 기록
```

---

### 장점

#### 1. 점진적 전환
```
현재 (개발):
  - 기존 Hard Delete 유지 → 호환성
  - 새로운 Soft Delete 추가 → 프로덕션 준비
  - 두 방식 동시 테스트 가능

추후 (프로덕션):
  - Soft Delete가 기본 → 안전
  - Hard Delete는 보호됨 → 오용 방지
```

#### 2. 개발 편의성
```
테스트 데이터 정리:
  - Hard Delete로 빠르게 삭제
  - DB 초기화 필요 없음

프로덕션 시뮬레이션:
  - Soft Delete로 실제 동작 테스트
  - 복원 기능 검증
```

#### 3. 프로덕션 안전성
```
일반 사용자:
  - Soft Delete만 사용 → 실수 방지
  - 언제든 복원 가능 → 안심

관리자:
  - 비밀번호 입력 → 개발자 모드
  - Hard Delete 접근 → 긴급 대응
  - 감사 로그 기록 → 책임 명확
```

#### 4. 유연성
```
개발 단계:
  - 빠른 테스트/정리 (Hard Delete)
  - 실제 동작 검증 (Soft Delete)

프로덕션:
  - 일반 운영 (Soft Delete)
  - 긴급 상황 대응 (Hard Delete with 관리자 승인)
  - GDPR 삭제 요청 처리
```

---

## 🎯 최종 전략 요약

### 핵심 원칙

1. **고객명 = 100% Unique Identifier** (DB 전체)
2. **Soft Delete = 기본 삭제 방식** (일반 사용자)
3. **Hard Delete = 개발 모드 전용** (현재: 자유, 추후: 관리자 비밀번호)

### 구현 단계

```
현재 (개발):
  UI: [고객 삭제 (완전)] [휴면 처리]
  → 두 버튼 모두 표시
  → 빠른 개발/테스트

추후 (프로덕션):
  기본: [휴면 처리]
  개발자 모드: [고객 삭제 (완전)] [휴면 처리]
  → 안전성 + 유연성
```

### 즉시 시작 가능

- ✅ Soft Delete 버튼 추가 (UI)
- ✅ Soft Delete API 구현 (Backend)
- ✅ 복원 기능 구현 (Backend + Frontend)
- ✅ 기존 Hard Delete 유지

---

## ✅ 구현 완료 (2025-12-07)

### 전략 → 구현 변경사항

| 전략 | 실제 구현 |
|------|----------|
| "복원" | **"휴면 해제"** (더 명확한 용어) |
| `import.meta.env.DEV` | **`useDevModeStore().isDevMode`** (Ctrl+Alt+D로 활성화) |
| "영구 삭제 (개발용)" | **"영구 삭제"** (간소화) |

### 추가 구현 기능
- ✅ 휴면 처리/해제 후 자동으로 '활성' 필터로 전환
- ✅ 서버 응답 데이터 사용으로 즉시 UI 업데이트
- ✅ 활성/휴면 개인/법인별 카운트 표시

### 참조
- [CUSTOMER_SOFT_DELETE_IMPLEMENTATION_PROGRESS.md](./CUSTOMER_SOFT_DELETE_IMPLEMENTATION_PROGRESS.md)

---

**문서 작성일**: 2025-12-06
**최종 수정일**: 2025-12-07
**작성자**: Claude Code
**상태**: ✅ **구현 완료**
