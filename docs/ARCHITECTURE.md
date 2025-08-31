# AIMS 시스템 아키텍처 가이드

## 핵심 아키텍처 원칙

### 1. Document/View 아키텍처 (MVC 패턴)

**절대 원칙: View는 데이터를 직접 fetch하지 않는다!**

```
┌─────────────────────────────────┐
│      Document (Model)           │  ← 데이터의 단일 소스 (Single Source of Truth)
│   - 비즈니스 로직              │  ← DB와 통신하는 유일한 계층
│   - 데이터 상태 관리           │
│   - API 통신                   │
└─────────────────────────────────┘
                ↓
┌─────────────────────────────────┐
│      Controller                 │  ← Document와 View 중재
│   - 이벤트 처리                │
│   - 데이터 변환                │
│   - 라우팅                     │
└─────────────────────────────────┘
                ↓
┌─────────────────────────────────┐
│      View (Presentation)        │  ← 순수한 표시 계층
│   - UI 렌더링                  │  ← props로 받은 데이터만 표시
│   - 사용자 인터랙션            │  ← 절대 직접 API 호출 금지!
│   - 스타일링                   │
└─────────────────────────────────┘
```

### 2. 데이터 무결성 원칙

1. **단일 데이터 소스 (Single Source of Truth)**
   - 동일한 데이터는 한 곳에서만 관리
   - 여러 View가 같은 데이터를 필요로 할 때도 중복 fetch 금지
   - 데이터 변경은 Document 계층에서만 발생

2. **데이터 플로우는 단방향**
   - Document → Controller → View
   - View에서 발생한 이벤트는 Controller를 통해 Document로 전달
   - 직접적인 View ↔ Document 통신 금지

### 3. React 컴포넌트 설계 원칙

#### ❌ 잘못된 패턴 (현재 코드의 문제점)
```javascript
// BAD: View가 직접 데이터를 fetch하는 안티패턴
const CustomerRelationshipTreeView = () => {
  const [relationships, setRelationships] = useState([]);
  
  // ❌ View가 직접 API 호출 - 절대 금지!
  const fetchAllData = async () => {
    const response = await fetch('/api/relationships');
    setRelationships(response.data);
  };
  
  useEffect(() => {
    fetchAllData(); // ❌ 컴포넌트가 자체적으로 데이터 관리
  }, []);
};

// BAD: 동일한 데이터를 다른 컴포넌트에서 또 fetch
const CustomerRelationshipDetail = () => {
  const [relationships, setRelationships] = useState([]);
  
  // ❌ 같은 관계 데이터를 또 다시 fetch - 데이터 중복!
  const fetchRelationships = async () => {
    const response = await fetch('/api/relationships');
    setRelationships(response.data);
  };
};
```

#### ✅ 올바른 패턴
```javascript
// GOOD: Document Layer (데이터 관리)
class RelationshipDataManager {
  constructor() {
    this.relationships = [];
    this.listeners = [];
  }
  
  // 데이터는 여기서만 fetch
  async fetchRelationships() {
    const response = await fetch('/api/relationships');
    this.relationships = response.data;
    this.notifyListeners();
  }
  
  // 데이터 변경도 여기서만
  async addRelationship(data) {
    await fetch('/api/relationships', { method: 'POST', body: data });
    await this.fetchRelationships(); // 한 번만 새로고침
  }
  
  getRelationships() {
    return this.relationships;
  }
}

// GOOD: Controller (Context/Provider 패턴)
const RelationshipProvider = ({ children }) => {
  const [relationships, setRelationships] = useState([]);
  const dataManager = useRef(new RelationshipDataManager());
  
  useEffect(() => {
    dataManager.current.fetchRelationships();
  }, []);
  
  return (
    <RelationshipContext.Provider value={{ relationships }}>
      {children}
    </RelationshipContext.Provider>
  );
};

// GOOD: View Layer (순수 표시 컴포넌트)
const CustomerRelationshipTreeView = ({ relationships }) => {
  // ✅ props로 받은 데이터만 표시
  // ✅ 직접 fetch 없음
  return (
    <Tree data={relationships} />
  );
};

const CustomerRelationshipDetail = ({ relationships }) => {
  // ✅ 같은 데이터를 props로 받아서 다르게 표시
  // ✅ 데이터 중복 없음
  return (
    <Table dataSource={relationships} />
  );
};
```

### 4. 상태 관리 계층 구조

```
Application State (전역)
    ├── User Session
    ├── App Configuration
    └── Shared Data (관계, 고객 등)
           ↓
Feature State (기능별)
    ├── Customer Management
    ├── Document Management
    └── Relationship Management
           ↓
Component State (로컬)
    ├── UI State (열림/닫힘, 선택 등)
    ├── Form State
    └── Temporary State
```

### 5. 컴포넌트 책임 분리

| 컴포넌트 유형 | 책임 | 허용 | 금지 |
|------------|-----|------|-----|
| **Container** | 데이터 관리, 비즈니스 로직 | API 호출, 상태 관리 | 직접 스타일링 |
| **Presentational** | UI 표시, 사용자 인터랙션 | props 받기, 이벤트 발생 | API 호출, 비즈니스 로직 |
| **Service** | API 통신, 데이터 변환 | HTTP 요청, 에러 처리 | UI 렌더링 |
| **Utility** | 공통 기능 | 순수 함수, 헬퍼 | 상태 변경, 사이드 이펙트 |

### 6. 파일 구조 규칙

```
frontend/aims-uix1/src/
├── services/           # Document Layer (데이터 관리)
│   ├── CustomerService.js
│   └── RelationshipService.js
├── contexts/          # Controller Layer (상태 관리)
│   ├── CustomerContext.js
│   └── RelationshipContext.js
├── components/        # View Layer
│   ├── containers/   # 데이터 연결 컴포넌트
│   │   └── CustomerManagementContainer.js
│   └── presentational/ # 순수 표시 컴포넌트
│       ├── CustomerRelationshipTreeView.js
│       └── CustomerRelationshipDetail.js
└── utils/            # 유틸리티 함수
```

### 7. 데이터 동기화 규칙

1. **단일 새로고침 원칙**
   - 데이터 변경 시 Document Layer에서 한 번만 fetch
   - 모든 View는 자동으로 업데이트됨

2. **이벤트 전파**
   - View → Controller → Document → API
   - API → Document → Controller → View

3. **캐싱 전략**
   - Document Layer에서만 캐싱 관리
   - View는 캐싱 여부를 알 필요 없음

### 8. 안티패턴 체크리스트

❌ **절대 하지 말아야 할 것들:**
- View 컴포넌트에서 직접 API 호출
- 동일한 데이터를 여러 곳에서 fetch
- useEffect에서 직접 데이터 로드
- 컴포넌트 간 직접 데이터 전달
- forwardRef와 imperative handle로 강제 새로고침
- 각 컴포넌트가 자체 데이터 상태 관리

✅ **반드시 해야 할 것들:**
- 데이터는 Service/Context에서 중앙 관리
- View는 props로만 데이터 받기
- 이벤트는 callback으로 상위 전달
- 단일 데이터 소스 유지
- 명확한 책임 분리

## 9. 데이터 무결성 보장 전략

### 트랜잭션 관리
```javascript
// 원자성(Atomicity) 보장 - 모든 작업이 성공하거나 모두 실패
class RelationshipService {
  async createBidirectionalRelationship(customerA, customerB, relationshipType) {
    const session = await startTransaction();
    try {
      // 1. A → B 관계 생성
      const relation1 = await this.createRelation(customerA, customerB, relationshipType, session);
      
      // 2. B → A 역방향 관계 생성
      const relation2 = await this.createRelation(customerB, customerA, 
        this.getReverseType(relationshipType), session);
      
      // 3. 양방향 플래그 설정
      await this.markAsBidirectional([relation1, relation2], session);
      
      await session.commit();
      return { success: true };
    } catch (error) {
      await session.rollback();
      throw new DataIntegrityError('양방향 관계 생성 실패', error);
    }
  }
}
```

### 데이터 일관성 검증
```javascript
// 일관성(Consistency) 검증
class DataValidator {
  // 관계 생성 전 검증
  validateRelationshipCreation(fromCustomer, toCustomer, type) {
    // 1. 순환 참조 방지
    if (fromCustomer._id === toCustomer._id) {
      throw new ValidationError('자기 자신과는 관계를 맺을 수 없습니다');
    }
    
    // 2. 중복 관계 방지
    if (this.hasExistingRelation(fromCustomer, toCustomer, type)) {
      throw new ValidationError('이미 동일한 관계가 존재합니다');
    }
    
    // 3. 비즈니스 규칙 검증
    if (type === 'spouse' && this.hasSpouse(fromCustomer)) {
      throw new ValidationError('배우자는 한 명만 가능합니다');
    }
    
    // 4. 데이터 타입 검증
    if (fromCustomer.type === 'corporate' && type === 'family') {
      throw new ValidationError('법인은 가족 관계를 가질 수 없습니다');
    }
  }
}
```

### 낙관적 잠금 (Optimistic Locking)
```javascript
// 동시성 제어를 위한 버전 관리
class Customer {
  constructor(data) {
    this._id = data._id;
    this._version = data._version || 1;
    this.data = data;
  }
  
  async update(changes) {
    const result = await db.customers.findOneAndUpdate(
      { 
        _id: this._id, 
        _version: this._version  // 버전 체크
      },
      { 
        $set: changes,
        $inc: { _version: 1 }     // 버전 증가
      }
    );
    
    if (!result) {
      throw new ConcurrencyError('데이터가 다른 사용자에 의해 변경되었습니다');
    }
  }
}
```

## 10. 에러 처리 및 복구 전략

### 계층별 에러 처리
```javascript
// Service Layer - 비즈니스 로직 에러
class RelationshipService {
  async deleteRelationship(relationId) {
    try {
      const result = await this.api.delete(`/relationships/${relationId}`);
      return result;
    } catch (error) {
      // 에러 분류 및 적절한 처리
      if (error.code === 'RELATED_DATA_EXISTS') {
        throw new BusinessError('연관된 데이터가 있어 삭제할 수 없습니다', 'WARNING');
      }
      if (error.code === 'NOT_FOUND') {
        throw new BusinessError('관계를 찾을 수 없습니다', 'INFO');
      }
      // 예상치 못한 에러는 상위로 전파
      throw new SystemError('관계 삭제 중 오류 발생', error);
    }
  }
}

// Controller Layer - 에러 변환 및 사용자 통지
class RelationshipController {
  async handleDelete(relationId) {
    try {
      await this.service.deleteRelationship(relationId);
      this.notifySuccess('관계가 삭제되었습니다');
    } catch (error) {
      if (error instanceof BusinessError) {
        this.notifyUser(error.message, error.level);
      } else {
        this.notifyError('시스템 오류가 발생했습니다');
        this.logError(error); // 로깅
        this.reportError(error); // 모니터링 시스템 전송
      }
    }
  }
}

// View Layer - 에러 상태 표시
const RelationshipView = () => {
  const { error, retry } = useRelationship();
  
  if (error) {
    return (
      <ErrorBoundary 
        error={error}
        onRetry={retry}
        fallback={<DefaultErrorView />}
      />
    );
  }
};
```

### 자동 복구 메커니즘
```javascript
class ResilientApiClient {
  constructor() {
    this.retryPolicy = {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 5000,
      retryableErrors: [408, 429, 500, 502, 503, 504]
    };
  }
  
  async request(config) {
    let lastError;
    let backoffMs = 1000;
    
    for (let i = 0; i <= this.retryPolicy.maxRetries; i++) {
      try {
        return await this.executeRequest(config);
      } catch (error) {
        lastError = error;
        
        // 재시도 가능한 에러인지 확인
        if (!this.isRetryable(error) || i === this.retryPolicy.maxRetries) {
          throw error;
        }
        
        // 지수 백오프
        await this.delay(backoffMs);
        backoffMs = Math.min(
          backoffMs * this.retryPolicy.backoffMultiplier,
          this.retryPolicy.maxBackoffMs
        );
      }
    }
    
    throw lastError;
  }
}
```

## 11. 상태 동기화 및 캐싱 전략

### 캐시 무효화 전략
```javascript
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.dependencies = new Map(); // 캐시 간 의존성 관리
  }
  
  // 스마트 캐시 무효화
  invalidate(key) {
    // 1. 직접 무효화
    this.cache.delete(key);
    
    // 2. 의존 캐시 무효화
    const deps = this.dependencies.get(key) || [];
    deps.forEach(depKey => this.invalidate(depKey));
    
    // 3. 구독자 알림
    this.notifySubscribers(key);
  }
  
  // TTL 기반 자동 만료
  set(key, value, ttl = 5 * 60 * 1000) {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
    
    setTimeout(() => this.invalidate(key), ttl);
  }
}
```

### 실시간 동기화
```javascript
class RealtimeSync {
  constructor() {
    this.websocket = null;
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
  }
  
  connect() {
    this.websocket = new WebSocket('wss://api.server.com/sync');
    
    this.websocket.onmessage = (event) => {
      const { type, entity, data } = JSON.parse(event.data);
      
      // 엔티티별 구독자에게 알림
      const handlers = this.subscriptions.get(`${type}:${entity}`) || [];
      handlers.forEach(handler => handler(data));
    };
    
    this.websocket.onerror = () => {
      this.handleReconnect();
    };
  }
  
  // 자동 재연결 with 지수 백오프
  handleReconnect() {
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, backoff);
  }
}
```

## 12. 데이터 검증 파이프라인

### 다층 검증 체계
```javascript
// 1. 클라이언트 사이드 검증 (빠른 피드백)
const ClientValidator = {
  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  
  validatePhone(phone) {
    return /^010-\d{4}-\d{4}$/.test(phone);
  }
};

// 2. API 게이트웨이 검증 (스키마 검증)
const apiGatewayValidation = {
  customer: Joi.object({
    name: Joi.string().required().min(2).max(50),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^010-\d{4}-\d{4}$/),
    birthDate: Joi.date().max('now').required()
  })
};

// 3. 비즈니스 로직 검증 (도메인 규칙)
class BusinessValidator {
  async validateCustomerCreation(data) {
    // 중복 체크
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ValidationError('이미 등록된 이메일입니다');
    }
    
    // 나이 제한 체크
    const age = this.calculateAge(data.birthDate);
    if (age < 19) {
      throw new ValidationError('미성년자는 가입할 수 없습니다');
    }
  }
}

// 4. 데이터베이스 제약 (최종 방어선)
const customerSchema = new Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true  // null 허용하면서 unique
  }
});
```

## 13. 감사 추적 (Audit Trail)

```javascript
class AuditLogger {
  async logChange(entity, operation, userId, changes) {
    const auditEntry = {
      timestamp: new Date(),
      entity,
      entityId: entity._id,
      operation, // CREATE, UPDATE, DELETE
      userId,
      changes: {
        before: changes.before,
        after: changes.after
      },
      ip: this.getClientIp(),
      userAgent: this.getUserAgent()
    };
    
    // 변경 불가능한 로그 저장
    await this.auditDb.insert(auditEntry);
    
    // 중요 작업은 별도 알림
    if (this.isCriticalOperation(operation)) {
      await this.notifyAdmins(auditEntry);
    }
  }
}
```

## 14. 성능 및 확장성

### 데이터 페이징 및 가상 스크롤
```javascript
class DataPaginator {
  async fetchPage(options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = { createdAt: -1 },
      filter = {}
    } = options;
    
    // 커서 기반 페이징 (대용량 데이터에 효율적)
    const cursor = this.decodeCursor(options.cursor);
    
    const query = {
      ...filter,
      ...(cursor && { _id: { $gt: cursor } })
    };
    
    const items = await this.collection
      .find(query)
      .sort(sort)
      .limit(limit + 1) // 다음 페이지 존재 여부 확인
      .toArray();
    
    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    
    return {
      items,
      hasMore,
      nextCursor: hasMore ? this.encodeCursor(items[items.length - 1]._id) : null
    };
  }
}
```

### 배치 처리 및 큐잉
```javascript
class BatchProcessor {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.batchSize = 100;
    this.batchDelay = 1000; // 1초
  }
  
  async add(item) {
    this.queue.push(item);
    
    if (!this.processing) {
      this.scheduleBatch();
    }
  }
  
  async scheduleBatch() {
    this.processing = true;
    
    // 일정 시간 대기 후 배치 처리
    await this.delay(this.batchDelay);
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      await this.processBatch(batch);
    }
    
    this.processing = false;
  }
  
  async processBatch(batch) {
    try {
      await this.api.batchUpdate(batch);
    } catch (error) {
      // 실패한 항목은 재시도 큐로
      this.retryQueue.push(...batch);
    }
  }
}
```

## 15. 보안 고려사항

### 입력 삭제 (Input Sanitization)
```javascript
class SecurityHelper {
  // XSS 방지
  sanitizeHtml(input) {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
      ALLOWED_ATTR: ['href']
    });
  }
  
  // SQL Injection 방지 (파라미터화된 쿼리)
  async findUser(email) {
    return await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email] // 파라미터 바인딩
    );
  }
  
  // CSRF 토큰 검증
  validateCSRFToken(request) {
    const token = request.headers['x-csrf-token'];
    const sessionToken = request.session.csrfToken;
    
    if (!token || token !== sessionToken) {
      throw new SecurityError('Invalid CSRF token');
    }
  }
}
```

### 권한 검증
```javascript
class AuthorizationService {
  // 리소스 접근 권한 체크
  async canAccess(userId, resource, action) {
    const user = await this.getUser(userId);
    const permissions = await this.getUserPermissions(user);
    
    // 역할 기반 접근 제어 (RBAC)
    if (!permissions.includes(`${resource}:${action}`)) {
      throw new ForbiddenError('접근 권한이 없습니다');
    }
    
    // 추가 비즈니스 규칙 체크
    if (resource === 'customer' && action === 'delete') {
      // 관련 데이터가 있는 고객은 삭제 불가
      const hasRelations = await this.hasRelations(resource.id);
      if (hasRelations) {
        throw new BusinessError('관련 데이터가 있어 삭제할 수 없습니다');
      }
    }
  }
}
```

## 실제 적용 예시: 고객 관계 관리

### 현재 문제점
- `CustomerRelationshipTreeView`가 자체적으로 fetchAllData()
- `CustomerRelationshipDetail`이 자체적으로 fetchRelationships()
- 같은 관계 데이터를 두 번 가져옴
- 한 쪽을 업데이트하면 다른 쪽은 수동으로 새로고침 필요

### 올바른 구조
```
RelationshipService (Document)
    ↓ 한 번만 fetch
RelationshipProvider (Controller)
    ↓ 데이터 배포
├── CustomerRelationshipTreeView (View) - 트리 형태로 표시
└── CustomerRelationshipDetail (View) - 테이블 형태로 표시
```

## 16. 확장성 및 마이크로서비스 아키텍처

### 수평 확장 전략
```javascript
// API Gateway 패턴 - 마이크로서비스 라우팅
class APIGateway {
  constructor() {
    this.services = {
      customers: 'http://customer-service:3001',
      relationships: 'http://relationship-service:3002',
      documents: 'http://document-service:3003',
      auth: 'http://auth-service:3004'
    };
    this.loadBalancer = new LoadBalancer();
  }
  
  async route(request) {
    const { service, path, method, data } = request;
    
    // 서비스별 로드 밸런싱
    const serviceUrl = await this.loadBalancer.getHealthyInstance(service);
    
    // Circuit Breaker 패턴 적용
    return await this.circuitBreaker.execute(
      () => this.makeRequest(serviceUrl, path, method, data)
    );
  }
}

// Event-Driven Architecture - 서비스 간 통신
class EventBus {
  async publish(event, data) {
    const subscribers = this.getSubscribers(event);
    
    // 비동기 병렬 처리
    const promises = subscribers.map(async (subscriber) => {
      try {
        await subscriber.handle(event, data);
      } catch (error) {
        // Dead Letter Queue로 전송
        await this.deadLetterQueue.add({
          event, data, subscriber: subscriber.name, error
        });
      }
    });
    
    await Promise.allSettled(promises);
  }
}

// 예: 관계 생성 시 이벤트 발행
// relationship-service에서 발행
await eventBus.publish('RelationshipCreated', {
  customerId: relation.customerId,
  relationId: relation._id,
  type: relation.type
});

// customer-service에서 구독
eventBus.subscribe('RelationshipCreated', async (data) => {
  await this.updateCustomerRelationCount(data.customerId);
});
```

### Database Sharding 전략
```javascript
class ShardManager {
  constructor() {
    this.shards = {
      shard1: { range: [0, 333333], connection: 'mongodb://shard1:27017' },
      shard2: { range: [333334, 666666], connection: 'mongodb://shard2:27017' },
      shard3: { range: [666667, 999999], connection: 'mongodb://shard3:27017' }
    };
  }
  
  // 고객 ID 기반 샤딩
  getShardByCustomerId(customerId) {
    const hash = this.hashCustomerId(customerId);
    return this.shards.find(shard => 
      hash >= shard.range[0] && hash <= shard.range[1]
    );
  }
  
  // Cross-shard 조인 쿼리
  async findRelationshipsAcrossShards(customerIds) {
    const queries = customerIds.map(id => {
      const shard = this.getShardByCustomerId(id);
      return shard.connection.relationships.find({ customerId: id });
    });
    
    const results = await Promise.all(queries);
    return results.flat();
  }
}
```

### 캐싱 계층 구조
```javascript
class MultiLevelCache {
  constructor() {
    this.l1Cache = new Map(); // 메모리 캐시 (최고 속도)
    this.l2Cache = new Redis(); // Redis 캐시 (중간 속도)
    this.l3Cache = new CDN(); // CDN 캐시 (낮은 속도, 높은 용량)
  }
  
  async get(key) {
    // L1 캐시 확인
    if (this.l1Cache.has(key)) {
      return this.l1Cache.get(key);
    }
    
    // L2 캐시 확인
    const l2Result = await this.l2Cache.get(key);
    if (l2Result) {
      this.l1Cache.set(key, l2Result); // L1으로 승격
      return l2Result;
    }
    
    // L3 캐시 확인
    const l3Result = await this.l3Cache.get(key);
    if (l3Result) {
      await this.l2Cache.set(key, l3Result); // L2로 승격
      this.l1Cache.set(key, l3Result); // L1으로도 설정
      return l3Result;
    }
    
    return null;
  }
}
```

## 17. 고급 보안 아키텍처

### Zero Trust 보안 모델
```javascript
class ZeroTrustValidator {
  async validateRequest(request) {
    // 1. 사용자 인증 검증
    const user = await this.authenticateUser(request.token);
    if (!user) throw new AuthenticationError('Invalid user');
    
    // 2. 디바이스 신뢰성 검증
    const device = await this.validateDevice(request.deviceFingerprint);
    if (!device.trusted) throw new SecurityError('Untrusted device');
    
    // 3. 네트워크 위치 검증
    const location = await this.validateLocation(request.ip);
    if (location.risk === 'HIGH') throw new SecurityError('High-risk location');
    
    // 4. 행동 분석
    const behavior = await this.analyzeBehavior(user.id, request);
    if (behavior.anomaly) throw new SecurityError('Anomalous behavior detected');
    
    // 5. 리소스별 권한 검증
    await this.validateResourcePermission(user, request.resource, request.action);
    
    return { user, device, validated: true };
  }
}

// API 요청마다 Zero Trust 검증
app.use(async (req, res, next) => {
  try {
    const validation = await zeroTrustValidator.validateRequest(req);
    req.securityContext = validation;
    next();
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});
```

### 데이터 암호화 전략
```javascript
class EncryptionService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.keyRotationSchedule = 90 * 24 * 60 * 60 * 1000; // 90일
  }
  
  // 필드별 암호화 (PII 데이터)
  encryptPII(data) {
    const encryptedFields = {};
    const piiFields = ['name', 'email', 'phone', 'ssn', 'address'];
    
    for (const field of piiFields) {
      if (data[field]) {
        encryptedFields[field] = this.encrypt(data[field]);
      }
    }
    
    return { ...data, ...encryptedFields };
  }
  
  // 투명한 데이터베이스 암호화
  async save(collection, document) {
    const encrypted = this.encryptSensitiveFields(document);
    return await collection.insertOne(encrypted);
  }
  
  async find(collection, query) {
    const results = await collection.find(query).toArray();
    return results.map(doc => this.decryptSensitiveFields(doc));
  }
}
```

### 보안 모니터링 및 대응
```javascript
class SecurityMonitor {
  constructor() {
    this.alertThresholds = {
      failedLogins: 5,
      suspiciousQueries: 10,
      dataExfiltration: 1000 // records
    };
  }
  
  async detectAnomalies() {
    // 실시간 로그 분석
    const logStream = await this.getLogStream();
    
    logStream.on('data', async (logEntry) => {
      // 패턴 매칭으로 위협 탐지
      const threat = await this.analyzeThreat(logEntry);
      
      if (threat.severity === 'CRITICAL') {
        await this.triggerEmergencyResponse(threat);
      } else if (threat.severity === 'HIGH') {
        await this.alertSecurityTeam(threat);
      }
    });
  }
  
  async triggerEmergencyResponse(threat) {
    // 자동 대응 조치
    await Promise.all([
      this.blockSuspiciousIPs(threat.sourceIPs),
      this.suspendCompromisedAccounts(threat.userIds),
      this.enableRateLimiting(threat.endpoints),
      this.notifySOCTeam(threat)
    ]);
  }
}
```

## 18. 모바일 First 아키텍처 설계

### Progressive Web App (PWA) 전략
```javascript
// Service Worker for offline capability
class PWAServiceWorker {
  constructor() {
    this.cacheName = 'aims-v2.0.0';
    this.criticalResources = [
      '/',
      '/static/css/main.css',
      '/static/js/main.js',
      '/api/customer/offline-data'
    ];
  }
  
  async install() {
    const cache = await caches.open(this.cacheName);
    return await cache.addAll(this.criticalResources);
  }
  
  async fetch(request) {
    // Network First for API calls
    if (request.url.includes('/api/')) {
      try {
        const response = await fetch(request);
        
        // 성공하면 캐시 업데이트
        if (response.ok) {
          const cache = await caches.open(this.cacheName);
          cache.put(request, response.clone());
        }
        
        return response;
      } catch (error) {
        // 네트워크 실패 시 캐시에서 반환
        return await caches.match(request);
      }
    }
    
    // Cache First for static resources
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetch(request);
  }
}

// Background Sync for offline actions
class OfflineQueue {
  constructor() {
    this.queue = new IndexedDB('offline-queue');
  }
  
  async add(action) {
    await this.queue.put({
      id: crypto.randomUUID(),
      action,
      timestamp: Date.now(),
      retryCount: 0
    });
    
    // 네트워크 복구 시 자동 실행
    if (navigator.onLine) {
      await this.processQueue();
    }
  }
  
  async processQueue() {
    const actions = await this.queue.getAll();
    
    for (const item of actions) {
      try {
        await this.executeAction(item.action);
        await this.queue.delete(item.id);
      } catch (error) {
        // 재시도 로직
        if (item.retryCount < 3) {
          await this.queue.update(item.id, { 
            retryCount: item.retryCount + 1 
          });
        }
      }
    }
  }
}
```

### 반응형 및 적응형 디자인
```javascript
// Device-aware component rendering
class ResponsiveRenderer {
  constructor() {
    this.breakpoints = {
      mobile: '(max-width: 768px)',
      tablet: '(min-width: 769px) and (max-width: 1024px)',
      desktop: '(min-width: 1025px)',
      touch: '(pointer: coarse)',
      hover: '(hover: hover)'
    };
  }
  
  useResponsiveComponent(componentMap) {
    const [device, setDevice] = useState(this.getDeviceType());
    
    useEffect(() => {
      const queries = Object.entries(this.breakpoints).map(([key, query]) => {
        const mq = window.matchMedia(query);
        mq.addEventListener('change', () => setDevice(this.getDeviceType()));
        return mq;
      });
      
      return () => queries.forEach(mq => mq.removeEventListener('change', () => {}));
    }, []);
    
    return componentMap[device] || componentMap.default;
  }
}

// 예시: 디바이스별 고객 관계 뷰
const CustomerRelationshipView = () => {
  const ResponsiveComponent = useResponsiveComponent({
    mobile: MobileRelationshipCards,
    tablet: TabletRelationshipGrid,
    desktop: DesktopRelationshipTable,
    default: DesktopRelationshipTable
  });
  
  return <ResponsiveComponent />;
};
```

### 네이티브 앱 통합 전략
```javascript
// React Native 코드 공유
// shared/services/CustomerService.js (공통 비즈니스 로직)
export class CustomerService {
  constructor(apiClient) {
    this.api = apiClient; // Web: axios, Mobile: react-native specific
  }
  
  async getCustomers(params) {
    // 플랫폼 독립적 비즈니스 로직
    const response = await this.api.get('/customers', { params });
    return this.transformCustomerData(response.data);
  }
}

// Platform-specific implementations
// web/services/WebApiClient.js
export class WebApiClient {
  async get(url, config) {
    return await axios.get(url, config);
  }
}

// mobile/services/MobileApiClient.js
export class MobileApiClient {
  async get(url, config) {
    return await fetch(url, {
      method: 'GET',
      ...config
    }).then(r => r.json());
  }
}
```

### 성능 최적화 전략
```javascript
// 지연 로딩 및 코드 분할
const LazyCustomerManagement = React.lazy(() => 
  import('./CustomerManagement').then(module => ({
    default: module.CustomerManagement
  }))
);

// 이미지 최적화
class AdaptiveImageLoader {
  getOptimizedImageUrl(originalUrl, devicePixelRatio, screenWidth) {
    const baseUrl = originalUrl.split('.')[0];
    const extension = originalUrl.split('.').pop();
    
    // 디바이스 특성에 맞는 이미지 선택
    let size = 'medium';
    let format = 'webp';
    
    if (screenWidth < 768) size = 'small';
    else if (screenWidth > 1920) size = 'large';
    
    if (devicePixelRatio > 2) size += '@2x';
    
    // 브라우저 지원에 따른 포맷 선택
    if (!this.supportsWebP()) format = 'jpg';
    
    return `${baseUrl}_${size}.${format}`;
  }
}

// 메모리 관리
class MemoryManager {
  constructor() {
    this.componentCache = new Map();
    this.maxCacheSize = 50;
  }
  
  // 컴포넌트 언마운트 시 자동 정리
  useComponentCleanup(componentId, dependencies) {
    useEffect(() => {
      return () => {
        // 메모리 해제
        this.componentCache.delete(componentId);
        
        // 의존성 정리
        dependencies.forEach(dep => dep.cleanup?.());
      };
    }, []);
  }
}
```

## 19. 미래 기술 대응 전략

### AI/ML 통합 준비
```javascript
class AIIntegrationLayer {
  constructor() {
    this.mlEndpoints = {
      prediction: '/ai/predict-churn',
      recommendation: '/ai/recommend-products',
      sentiment: '/ai/analyze-sentiment'
    };
  }
  
  // 예측 분석 통합
  async getPredictiveInsights(customerId) {
    const customerData = await this.getCustomerProfile(customerId);
    
    const [churnPrediction, recommendations] = await Promise.all([
      this.callAI('prediction', { customer: customerData }),
      this.callAI('recommendation', { customer: customerData })
    ]);
    
    return {
      churnRisk: churnPrediction.probability,
      recommendedActions: recommendations.actions,
      confidence: churnPrediction.confidence
    };
  }
  
  // 자연어 처리 통합
  async processCustomerFeedback(text) {
    const sentiment = await this.callAI('sentiment', { text });
    
    return {
      sentiment: sentiment.label,
      score: sentiment.score,
      keywords: sentiment.keywords,
      actionItems: this.generateActionItems(sentiment)
    };
  }
}
```

### 블록체인 통합 (선택사항)
```javascript
class BlockchainAuditLog {
  constructor() {
    this.web3 = new Web3(process.env.BLOCKCHAIN_RPC_URL);
    this.contract = new this.web3.eth.Contract(ABI, CONTRACT_ADDRESS);
  }
  
  // 중요 거래의 불변 기록
  async recordTransaction(transaction) {
    const hash = this.createTransactionHash(transaction);
    
    await this.contract.methods.recordAuditEntry(
      hash,
      transaction.timestamp,
      transaction.userId,
      transaction.action
    ).send({ from: process.env.ADMIN_WALLET });
    
    return hash;
  }
  
  // 무결성 검증
  async verifyTransactionIntegrity(transactionId) {
    const dbRecord = await this.database.findById(transactionId);
    const blockchainRecord = await this.contract.methods
      .getAuditEntry(transactionId).call();
    
    return dbRecord.hash === blockchainRecord.hash;
  }
}
```

### 실시간 협업 기능
```javascript
class CollaborationEngine {
  constructor() {
    this.websocket = null;
    this.activeUsers = new Map();
  }
  
  // 실시간 공동 편집
  async enableRealTimeEditing(documentId) {
    const yDoc = new Y.Doc();
    const provider = new WebsocketProvider(
      `wss://collab.server.com/${documentId}`,
      documentId,
      yDoc
    );
    
    // 변경사항 실시간 동기화
    yDoc.on('update', (update) => {
      this.broadcastUpdate(documentId, update);
    });
    
    return yDoc;
  }
  
  // 사용자 프레즌스 관리
  async trackUserPresence(userId, documentId) {
    const presence = {
      userId,
      documentId,
      cursor: null,
      lastSeen: Date.now()
    };
    
    this.activeUsers.set(userId, presence);
    this.broadcastPresence(documentId);
    
    // 5분간 비활성 시 자동 제거
    setTimeout(() => {
      this.activeUsers.delete(userId);
      this.broadcastPresence(documentId);
    }, 5 * 60 * 1000);
  }
}
```

## 마이그레이션 및 진화 로드맵

### Phase 1: Foundation (현재 → 3개월)
- Service Layer 생성 및 중복 제거
- 에러 처리 표준화
- 기본 보안 강화

### Phase 2: Architecture Modernization (3-6개월)
- Context/Provider 구현
- 캐싱 메커니즘 도입
- 성능 최적화

### Phase 3: Scalability (6-9개월)
- 마이크로서비스 분리
- 데이터베이스 샤딩
- API Gateway 도입

### Phase 4: Mobile Expansion (9-12개월)
- PWA 구현
- React Native 앱 개발
- 오프라인 기능 추가

### Phase 5: Advanced Features (12-18개월)
- AI/ML 통합
- 실시간 협업 기능
- 고급 분석 대시보드

### Phase 6: Future Technologies (18개월+)
- 블록체인 통합 (선택)
- IoT 디바이스 연동
- AR/VR 인터페이스

## 20. 멀티플랫폼 지원 전략 (iOS, iPadOS, Android)

### 플랫폼 통합 아키텍처
```javascript
// 플랫폼별 특화 구현
const PlatformStrategy = {
  iOS: {
    components: 'ios-components',
    navigation: 'react-navigation-native-stack',
    storage: '@react-native-async-storage/async-storage',
    permissions: 'react-native-permissions',
    biometrics: 'react-native-touch-id'
  },
  
  iPadOS: {
    components: 'ipad-optimized-components',
    navigation: 'react-navigation-split-screen',
    multitasking: 'react-native-multitasking',
    pencilSupport: 'react-native-apple-pencil'
  },
  
  Android: {
    components: 'material-design-components',
    navigation: 'react-navigation-drawer',
    storage: '@react-native-async-storage/async-storage',
    permissions: 'react-native-permissions',
    biometrics: 'react-native-fingerprint-scanner'
  }
};

// 플랫폼 감지 및 적응
class PlatformAdapter {
  constructor() {
    this.platform = Platform.OS;
    this.isTablet = DeviceInfo.isTablet();
    this.screenSize = Dimensions.get('screen');
  }
  
  getOptimizedComponent(componentType) {
    const { platform } = this;
    const isTablet = this.isTablet;
    
    if (platform === 'ios' && isTablet) {
      return this.getIPadComponent(componentType);
    } else if (platform === 'ios') {
      return this.getIPhoneComponent(componentType);
    } else if (platform === 'android' && isTablet) {
      return this.getAndroidTabletComponent(componentType);
    } else {
      return this.getAndroidPhoneComponent(componentType);
    }
  }
  
  // iPad 특화 컴포넌트 (Split View, Slide Over 지원)
  getIPadComponent(type) {
    switch (type) {
      case 'CustomerManagement':
        return IPadCustomerManagementSplitView;
      case 'RelationshipView':
        return IPadRelationshipSlideOver;
      default:
        return this.getIPhoneComponent(type);
    }
  }
}
```

### iOS/iPadOS 특화 기능
```javascript
// iPhone/iPad 네이티브 기능 통합
class iOSIntegration {
  constructor() {
    this.isIPad = DeviceInfo.isTablet() && Platform.OS === 'ios';
  }
  
  // Apple Pencil 지원 (iPad)
  async setupApplePencilSupport() {
    if (!this.isIPad) return;
    
    const pencilEvents = new ApplePencilManager();
    
    pencilEvents.onPencilTouch = (event) => {
      // 고객 관계 다이어그램 그리기
      this.handleCustomerRelationshipDrawing(event);
    };
    
    pencilEvents.onDoubleTap = () => {
      // 도구 전환 (예: 관계 추가/삭제 모드)
      this.toggleRelationshipEditMode();
    };
  }
  
  // Split View 및 Multitasking (iPad)
  setupSplitViewSupport() {
    if (!this.isIPad) return;
    
    const splitView = new SplitViewController({
      primaryView: CustomerListViewController,
      secondaryView: CustomerDetailViewController,
      splitRatio: 0.4
    });
    
    // 멀티태스킹 상태 감지
    AppState.addEventListener('change', (state) => {
      if (state === 'multitasking') {
        this.optimizeForSplitScreen();
      }
    });
  }
  
  // iOS 독특한 사용자 경험
  setupiOSSpecificUX() {
    // Haptic Feedback
    const haptics = new HapticFeedback();
    
    // 관계 생성 시 햅틱 피드백
    this.onRelationshipCreated = () => {
      haptics.trigger('success');
    };
    
    // 3D Touch / Force Touch 지원
    if (DeviceInfo.hasForceTouch()) {
      this.setup3DTouch();
    }
    
    // iOS 14+ 위젯 지원
    if (parseFloat(DeviceInfo.getSystemVersion()) >= 14) {
      this.setupHomeScreenWidgets();
    }
  }
  
  // Shortcuts App 통합
  setupSiriShortcuts() {
    const shortcuts = new SiriShortcutsManager();
    
    shortcuts.donate({
      identifier: 'com.aims.add-customer',
      title: '새 고객 추가',
      description: 'AIMS에서 새로운 고객을 추가합니다',
      keywords: ['고객', '추가', '보험'],
      eligibleForSearch: true,
      eligibleForPrediction: true
    });
  }
}
```

### Android 특화 기능
```javascript
// Android 네이티브 기능 통합
class AndroidIntegration {
  constructor() {
    this.isTablet = DeviceInfo.isTablet() && Platform.OS === 'android';
    this.apiLevel = DeviceInfo.getApiLevel();
  }
  
  // Material Design 3 적용
  setupMaterialDesign3() {
    const materialTheme = new MaterialTheme({
      colorScheme: 'dynamic', // Android 12+ Dynamic Color
      typography: 'roboto',
      shapes: 'rounded',
      motion: 'emphasized'
    });
    
    // 다크 모드 시스템 연동
    const colorScheme = Appearance.getColorScheme();
    materialTheme.setDarkMode(colorScheme === 'dark');
  }
  
  // Android Auto 지원
  setupAndroidAuto() {
    const autoSupport = new AndroidAutoSupport();
    
    // 운전 중 안전한 고객 정보 접근
    autoSupport.registerVoiceCommands({
      'show customer info': this.showCustomerInfoVoice,
      'add appointment': this.addAppointmentVoice
    });
  }
  
  // Edge-to-Edge 지원 (Android 10+)
  setupEdgeToEdge() {
    if (this.apiLevel >= 29) {
      StatusBar.setTranslucent(true);
      
      const insets = useSafeAreaInsets();
      
      // 시스템 바 영역까지 활용한 몰입형 경험
      this.applyEdgeToEdgeLayout(insets);
    }
  }
  
  // 백그라운드 작업 최적화 (Doze Mode 대응)
  setupBackgroundOptimization() {
    const backgroundSync = new BackgroundSyncManager();
    
    // 배터리 최적화 예외 요청
    backgroundSync.requestBatteryOptimizationExemption();
    
    // 주기적 동기화 (WorkManager 활용)
    backgroundSync.schedulePeriodicSync({
      interval: 4 * 60 * 60 * 1000, // 4시간
      task: this.syncCustomerData,
      constraints: {
        requiredNetworkType: 'CONNECTED',
        requiresBatteryNotLow: true
      }
    });
  }
}
```

### 크로스 플랫폼 상태 동기화
```javascript
// 플랫폼 간 데이터 동기화
class CrossPlatformSyncManager {
  constructor() {
    this.platforms = ['web', 'ios', 'android'];
    this.syncStrategies = new Map();
  }
  
  // 실시간 동기화 (WebSocket + Push Notification)
  async setupRealtimeSync() {
    // 웹소켓 연결 (모든 플랫폼 공통)
    const wsClient = new WebSocketClient();
    
    // 플랫폼별 푸시 알림
    if (Platform.OS === 'ios') {
      this.setupAPNs();
    } else if (Platform.OS === 'android') {
      this.setupFCM();
    } else {
      this.setupWebPush();
    }
    
    // 교차 플랫폼 이벤트 동기화
    wsClient.on('customer_updated', (data) => {
      this.syncAcrossPlatforms('customer_updated', data);
    });
  }
  
  // 충돌 해결 전략
  async resolveConflicts(localData, remoteData) {
    // 버전 기반 충돌 해결
    if (localData.version > remoteData.version) {
      return await this.mergeWithServerPriority(localData, remoteData);
    } else if (localData.version < remoteData.version) {
      return remoteData;
    } else {
      // 동일 버전인 경우 타임스탬프 기준
      return localData.updatedAt > remoteData.updatedAt ? localData : remoteData;
    }
  }
  
  // 오프라인 지원
  async handleOfflineMode() {
    const offlineStorage = Platform.select({
      ios: new iOSOfflineStorage(),
      android: new AndroidOfflineStorage(),
      web: new WebOfflineStorage()
    });
    
    // 플랫폼별 최적화된 저장소 사용
    await offlineStorage.init();
    
    // 네트워크 복구 시 자동 동기화
    NetInfo.addEventListener(state => {
      if (state.isConnected) {
        this.syncOfflineChanges();
      }
    });
  }
}
```

### 플랫폼별 성능 최적화
```javascript
// 플랫폼 특화 성능 최적화
class PlatformPerformanceOptimizer {
  constructor() {
    this.platform = Platform.OS;
    this.deviceSpec = this.getDeviceSpecs();
  }
  
  // iOS 최적화
  optimizeForIOS() {
    // Metal GPU 가속 활용
    if (this.deviceSpec.hasMetalSupport) {
      this.enableMetalRendering();
    }
    
    // Core Animation 최적화
    InteractionManager.runAfterInteractions(() => {
      this.preloadCriticalComponents();
    });
    
    // iOS 메모리 관리
    AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        this.releaseNonCriticalMemory();
      }
    });
  }
  
  // Android 최적화
  optimizeForAndroid() {
    // Vulkan API 활용 (Android 7.0+)
    if (this.apiLevel >= 24 && this.deviceSpec.hasVulkanSupport) {
      this.enableVulkanRendering();
    }
    
    // ART 런타임 최적화
    if (this.deviceSpec.isLowEndDevice) {
      this.enableLowEndModeOptimizations();
    }
    
    // Android R+ 메모리 압박 감지
    if (this.apiLevel >= 30) {
      this.setupMemoryPressureCallback();
    }
  }
  
  // 디바이스별 적응형 렌더링
  getAdaptiveRenderingStrategy() {
    const { ram, cpu, gpu } = this.deviceSpec;
    
    if (ram < 3) {
      return 'minimal'; // 최소한의 애니메이션, 간소화된 UI
    } else if (ram < 6) {
      return 'balanced'; // 균형잡힌 성능과 시각효과
    } else {
      return 'enhanced'; // 모든 시각효과와 애니메이션 활성화
    }
  }
}
```

### 플랫폼별 보안 강화
```javascript
// 플랫폼 네이티브 보안 기능 활용
class PlatformSecurityManager {
  constructor() {
    this.platform = Platform.OS;
  }
  
  // iOS 보안 기능
  async setupiOSSecurity() {
    // Keychain Services
    const keychain = new KeychainManager();
    await keychain.setInternetCredentials('aims-server', 'user', 'password');
    
    // Face ID / Touch ID
    const biometrics = new BiometricsManager();
    if (await biometrics.isSensorAvailable()) {
      this.setupBiometricAuthentication(biometrics);
    }
    
    // App Transport Security (ATS)
    this.enforceHTTPS();
    
    // Jailbreak 탐지
    const security = new iOSSecurityChecker();
    if (await security.isJailbroken()) {
      this.handleCompromisedDevice();
    }
  }
  
  // Android 보안 기능
  async setupAndroidSecurity() {
    // Android Keystore
    const keystore = new AndroidKeystore();
    await keystore.generateKey('aims-encryption-key', {
      requiresAuth: true,
      invalidatedByBiometricEnrollment: true
    });
    
    // SafetyNet Attestation
    const safetyNet = new SafetyNetClient();
    const attestation = await safetyNet.attest();
    
    if (!attestation.isDeviceIntegrityOk) {
      this.handleCompromisedDevice();
    }
    
    // Root 탐지
    const rootChecker = new RootChecker();
    if (await rootChecker.isRooted()) {
      this.handleCompromisedDevice();
    }
    
    // Certificate Pinning
    this.setupCertificatePinning();
  }
  
  // 공통 보안 정책
  enforceSecurityPolicies() {
    // 스크린샷 방지 (민감한 화면)
    if (this.isCustomerDetailScreen()) {
      ScreenshotDetector.preventScreenshots();
    }
    
    // 앱 백그라운드 시 보안 오버레이
    AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        this.showSecurityOverlay();
      } else {
        this.hideSecurityOverlay();
      }
    });
  }
}
```

### 업데이트된 마이그레이션 로드맵
```
Phase 1: Foundation (현재 → 3개월)
- Service Layer 생성 및 중복 제거
- 에러 처리 표준화
- 기본 보안 강화

Phase 2: Architecture Modernization (3-6개월)
- Context/Provider 구현
- 캐싱 메커니즘 도입
- 성능 최적화

Phase 3: Scalability (6-9개월)
- 마이크로서비스 분리
- 데이터베이스 샤딩
- API Gateway 도입

Phase 4: Mobile Foundation (9-12개월)
- PWA 구현 (웹 기반 모바일 경험)
- React Native 기본 구조 설정
- 크로스 플랫폼 코드 공유 체계

Phase 5: iOS 앱 개발 (12-15개월)
- iPhone 전용 앱 개발
- iPad 최적화 (Split View, Apple Pencil)
- App Store 출시

Phase 6: Android 앱 개발 (15-18개월)
- Android 스마트폰 앱 개발
- Android 태블릿 최적화
- Google Play Store 출시

Phase 7: Advanced Mobile Features (18-24개월)
- 생체 인증 통합
- 오프라인 동기화 완성
- 플랫폼별 네이티브 기능 활용

Phase 8: Future Technologies (24개월+)
- AI/ML 통합 (모바일 특화)
- AR/VR 기능 (ARKit, ARCore)
- 실시간 협업 (모바일 환경)
```

---

**작성일**: 2025-08-31
**작성자**: Claude & User
**버전**: 2.0.0

**중요**: 이 아키텍처 가이드는 AIMS 프로젝트의 모든 프론트엔드 개발에 적용되어야 합니다. 
데이터 무결성과 시스템 신뢰성은 비즈니스 성공의 핵심입니다.