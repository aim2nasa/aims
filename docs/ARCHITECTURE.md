# AIMS 시스템 아키텍처 가이드

## 핵심 아키텍처 원칙

### 1. Document/View 아키텍처 (MVC 패턴)

**절대 원칙: View는 데이터를 직접 fetch하지 않는다!**

```
Document (Model) → Controller → View (Presentation)
   ↓ 데이터 관리        ↓ 중재         ↓ UI 표시
```

### 2. 데이터 무결성 원칙

1. **단일 데이터 소스** - 동일 데이터는 한 곳에서만 관리
2. **단방향 데이터 플로우** - Document → Controller → View
3. **중복 fetch 금지** - 여러 View가 같은 데이터 필요시에도 한 번만 가져오기

### 3. React 컴포넌트 설계

#### ❌ 안티패턴
```javascript
// BAD: View가 직접 API 호출
const CustomerView = () => {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/customers').then(r => setData(r.data)); // ❌
  }, []);
};
```

#### ✅ 올바른 패턴
```javascript
// Document Layer
class DataManager {
  async fetchData() {
    const response = await fetch('/api/customers');
    this.data = response.data;
    this.notifyListeners();
  }
}

// Controller (Context/Provider)
const DataProvider = ({ children }) => {
  const [data, setData] = useState([]);
  const manager = useRef(new DataManager());

  useEffect(() => {
    manager.current.fetchData();
  }, []);

  return <Context.Provider value={{ data }}>{children}</Context.Provider>;
};

// View (props로만 데이터 받음)
const CustomerView = ({ data }) => <Table data={data} />;
```

## 4. 컴포넌트 책임 분리

| 유형 | 책임 | 허용 | 금지 |
|------|------|------|------|
| **Container** | 데이터/로직 관리 | API 호출, 상태 관리 | 직접 스타일링 |
| **Presentational** | UI 표시 | props 받기, 이벤트 발생 | API 호출, 비즈니스 로직 |
| **Service** | API 통신 | HTTP 요청, 에러 처리 | UI 렌더링 |

## 5. 파일 구조

```
src/
├── services/     # Document Layer (데이터 관리)
├── contexts/     # Controller Layer (상태 관리)
├── components/   # View Layer
│   ├── containers/     # 데이터 연결 컴포넌트
│   └── presentational/ # 순수 표시 컴포넌트
└── utils/        # 유틸리티
```

## 6. 안티패턴 체크리스트

❌ **금지**:
- View 컴포넌트에서 직접 API 호출
- 동일한 데이터를 여러 곳에서 fetch
- useEffect에서 직접 데이터 로드
- 각 컴포넌트가 자체 데이터 상태 관리

✅ **필수**:
- 데이터는 Service/Context에서 중앙 관리
- View는 props로만 데이터 받기
- 단일 데이터 소스 유지

## 7. 데이터 무결성 보장

### 트랜잭션 관리 (원자성)
```javascript
async createBidirectionalRelationship(a, b, type) {
  const session = await startTransaction();
  try {
    await this.createRelation(a, b, type, session);
    await this.createRelation(b, a, getReverseType(type), session);
    await session.commit();
  } catch (error) {
    await session.rollback();
    throw new DataIntegrityError('관계 생성 실패', error);
  }
}
```

### 데이터 검증
```javascript
validateRelationshipCreation(from, to, type) {
  if (from._id === to._id) throw new Error('자기 자신과 관계 불가');
  if (this.hasExistingRelation(from, to, type)) throw new Error('중복 관계');
  if (type === 'spouse' && this.hasSpouse(from)) throw new Error('배우자 1명만 가능');
}
```

### 낙관적 잠금 (동시성 제어)
```javascript
async update(changes) {
  const result = await db.findOneAndUpdate(
    { _id: this._id, _version: this._version },
    { $set: changes, $inc: { _version: 1 } }
  );
  if (!result) throw new ConcurrencyError('다른 사용자가 데이터 변경');
}
```

## 8. 에러 처리 전략

### 계층별 에러 처리
```javascript
// Service Layer - 비즈니스 에러
try {
  return await api.delete(`/relationships/${id}`);
} catch (error) {
  if (error.code === 'RELATED_DATA_EXISTS')
    throw new BusinessError('연관 데이터 있음', 'WARNING');
  throw new SystemError('시스템 오류', error);
}

// Controller Layer - 사용자 통지
try {
  await service.deleteRelationship(id);
  notifySuccess('삭제 완료');
} catch (error) {
  notifyUser(error.message);
  logError(error);
}
```

### 자동 복구 (재시도)
```javascript
async request(config) {
  let backoffMs = 1000;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await executeRequest(config);
    } catch (error) {
      if (!isRetryable(error) || i === maxRetries) throw error;
      await delay(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    }
  }
}
```

## 9. 캐싱 전략

```javascript
class CacheManager {
  invalidate(key) {
    this.cache.delete(key);
    // 의존 캐시 무효화
    this.dependencies.get(key)?.forEach(dep => this.invalidate(dep));
    this.notifySubscribers(key);
  }

  set(key, value, ttl = 5 * 60 * 1000) {
    this.cache.set(key, { value, expires: Date.now() + ttl });
    setTimeout(() => this.invalidate(key), ttl);
  }
}
```

## 10. 보안 고려사항

### 입력 검증
```javascript
// XSS 방지
sanitizeHtml(input) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a']
  });
}

// SQL Injection 방지 (파라미터화된 쿼리)
await db.query('SELECT * FROM users WHERE email = ?', [email]);
```

### 권한 검증 (RBAC)
```javascript
async canAccess(userId, resource, action) {
  const permissions = await getUserPermissions(userId);
  if (!permissions.includes(`${resource}:${action}`))
    throw new ForbiddenError('접근 권한 없음');
}
```

## 11. 성능 최적화

### 페이징 (커서 기반)
```javascript
async fetchPage({ cursor, limit = 20 }) {
  const query = cursor ? { _id: { $gt: cursor } } : {};
  const items = await collection.find(query).limit(limit + 1).toArray();
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]._id : null };
}
```

### 배치 처리
```javascript
async scheduleBatch() {
  await delay(batchDelay);
  while (queue.length > 0) {
    const batch = queue.splice(0, batchSize);
    try {
      await api.batchUpdate(batch);
    } catch (error) {
      retryQueue.push(...batch);
    }
  }
}
```

## 12. 실제 적용: 고객 관계 관리

### 현재 문제점
- `CustomerRelationshipTreeView`가 자체 fetchAllData()
- `CustomerRelationshipDetail`이 자체 fetchRelationships()
- 같은 데이터를 두 번 가져옴 → 동기화 문제

### 올바른 구조
```
RelationshipService (Document)
    ↓ 한 번만 fetch
RelationshipProvider (Controller)
    ↓ 데이터 배포
├── CustomerRelationshipTreeView (트리형 표시)
└── CustomerRelationshipDetail (테이블형 표시)
```

## 마이그레이션 로드맵

### Phase 1: Foundation (0-3개월)
- Service Layer 구축, 중복 제거
- 에러 처리 표준화

### Phase 2: Architecture Modernization (3-6개월)
- Context/Provider 구현
- 캐싱 메커니즘 도입

### Phase 3: Scalability (6-9개월)
- 마이크로서비스 분리
- API Gateway 도입

### Phase 4-6: Mobile Expansion (9-18개월)
- PWA 구현
- React Native 앱 (iOS/Android)
- 오프라인 기능

### Phase 7+: Advanced Features (18개월+)
- AI/ML 통합
- 실시간 협업
- AR/VR (선택사항)

---

**작성일**: 2025-08-31
**버전**: 2.0.0

**중요**: 이 가이드는 AIMS 프로젝트의 모든 프론트엔드 개발에 적용됩니다.
데이터 무결성과 시스템 신뢰성은 비즈니스 성공의 핵심입니다.
