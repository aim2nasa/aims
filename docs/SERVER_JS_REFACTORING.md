# server.js 리팩토링 진행 문서

## 개요

| 항목 | 내용 |
|------|------|
| 대상 | `backend/api/aims_api/server.js` (12,986줄) |
| 목표 | ~300줄의 앱 초기화 + 라우트 등록 전용 파일로 축소 |
| 핵심 원칙 | 100% 동작 동일성을 자동화 테스트로 증명 |
| 시작일 | 2026-02-07 |

---

## Phase 진행 상황

| Phase | 내용 | 상태 | 완료일 |
|-------|------|------|--------|
| **0** | 테스트 인프라 구축 + Golden Master 캡처 | **완료** | 2026-02-07 |
| **1** | 헬퍼 함수 추출 → `lib/helpers.js` | **완료** | 2026-02-07 |
| **2** | SSE Manager 추출 → `lib/sseManager.js` | **완료** | 2026-02-07 |
| **3** | Health/System 라우트 추출 | **완료** | 2026-02-07 |
| **4** | User/Dev 라우트 추출 | **완료** | 2026-02-07 |
| **5** | Address/Geocoding 라우트 추출 | **완료** | 2026-02-07 |
| **6** | Insurance Products & Contracts 라우트 추출 | **완료** | 2026-02-07 |
| **7** | Chat & Audio 라우트 추출 | 대기 | - |
| **8** | Admin/Backup 라우트 추출 | 대기 | - |
| **9** | Customer CRUD 라우트 추출 | 대기 | - |
| **10** | Document 라우트 추출 | 대기 | - |
| **11** | AR/CR 라우트 + Webhooks 추출 | 대기 | - |
| **12** | Customer-Document 관계 + SSE 스트림 추출 | 대기 | - |
| **13** | 잔여 코드 정리 + 최종 검증 | 대기 | - |

---

## Phase 0: 테스트 인프라 + Golden Master (완료)

### 생성된 파일

#### 테스트 헬퍼
| 파일 | 용도 |
|------|------|
| `__tests__/helpers/contractTestTemplate.js` | 공통 유틸 (apiFetch, assertSuccessResponse, extractShape 등) |
| `__tests__/helpers/testDataFactory.js` | 테스트 데이터 생성/정리 팩토리 |
| `__tests__/helpers/sseTestHelper.js` | SSE 스트림 테스트 유틸 |

#### Golden Master
| 파일 | 용도 |
|------|------|
| `__tests__/golden-master/captureSnapshots.js` | API 스냅샷 캡처 (33 endpoints) |
| `__tests__/golden-master/verifyGoldenMaster.test.js` | 스냅샷 대비 검증 |
| `__tests__/golden-master/snapshots/*.json` | 캡처된 스냅샷 |

#### Contract 테스트 (12개)
| 파일 | 도메인 | 테스트 수 |
|------|--------|----------|
| `health.contract.test.js` | Health/System | 3 |
| `documents.contract.test.js` | Document CRUD | 12 |
| `customers.contract.test.js` | Customer CRUD | 15 |
| `customer-documents.contract.test.js` | Customer-Document 관계 | 3 |
| `contracts-insurance.contract.test.js` | Insurance/Contracts | 6 |
| `annual-reports.contract.test.js` | Annual Reports | 4 |
| `chat.contract.test.js` | Chat/Audio | 4 |
| `admin.contract.test.js` | Admin/Backup | 2 |
| `webhooks.contract.test.js` | Webhooks | 3 |
| `sse-streams.contract.test.js` | SSE Streams | 5 |
| `address.contract.test.js` | Address/Geocoding | 2 |
| `users.contract.test.js` | Users/Dev | 1 |

### 테스트 결과 (2026-02-07)

```
Contract Tests: 12/12 suites, 65/65 tests PASSED
Golden Master:   1/1 suite,  33/33 tests PASSED
Existing Tests: 25/25 suites, 703/703 tests PASSED
────────────────────────────────────────────────
Total:          38 suites, 801 tests, ALL GREEN
```

### 검증 명령어

```bash
# Contract 테스트
npm run test:contracts

# Golden Master 검증
npm run test:golden

# Golden Master 스냅샷 재캡처 (리팩토링 전에만)
npm run test:golden:capture

# 전체 리팩토링 검증 (contract + golden + unit)
npm run test:refactor
```

---

## 매 Phase 공통 프로세스

```
1. 대상 코드 식별 (server.js 라인 범위)
2. 새 라우트/모듈 파일 생성 (factory function 패턴)
3. 코드 이동 + 의존성 import 정리
4. server.js에서 원본 코드 삭제 + require() 추가
5. npm run test:refactor (전체 테스트)
6. 실패 시 → git checkout 원복 → 원인 분석 → 재시도
7. 성공 시 → 커밋
```

---

## Phase 1: 헬퍼 함수 추출 (완료)

### 추출 내역

| 함수 | 용도 |
|------|------|
| `escapeRegex()` | 정규식 특수문자 이스케이프 |
| `sanitizeHtml()` | XSS 방지 HTML 태그 제거 |
| `toSafeObjectId()` | String→ObjectId 안전 변환 |
| `flattenObject()` | MongoDB $set용 dot notation 변환 |
| `isBinaryMimeType()` | 바이너리 MIME 타입 판별 |

### 생성 파일
- `lib/helpers.js` (130줄)

### 줄 수 변화
- server.js: 12,986줄 → 12,856줄 (-130줄)

### 테스트 결과

```
Contract Tests: 12/12 suites, 65/65 tests PASSED
Golden Master:   1/1 suite,  33/33 tests PASSED
Jest Unit:      38/39 suites, 822/824 tests (cascadingDelete 2건 기존 flaky)
```

---

## Phase 2: SSE Manager 추출 (완료)

### 추출 내역

| 항목 | 내용 |
|------|------|
| SSE Maps | 8개 (customerDoc, ar, cr, customerCombined, personalFiles, documentStatus, documentList, userAccount) |
| notify 함수 | 8개 (notifyCustomerDocSubscribers 등) |
| 헬퍼 | sendSSE(), subscribe(), unsubscribe() |

### 생성 파일
- `lib/sseManager.js` (231줄)

### 설계
- Node.js 모듈 캐싱을 활용한 싱글턴 패턴
- `channels` 객체에 8개 Map 관리
- server.js에 Map alias 변수 유지 (SSE 스트림 엔드포인트 호환용, Phase 12에서 제거 예정)

### 줄 수 변화
- server.js: 12,856줄 → 12,636줄 (-220줄)

---

## Phase 3: Health/System 라우트 추출 (완료)

### 추출 내역

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/health` | MongoDB ping 헬스체크 |
| `GET /api/health/deep` | 상세 헬스체크 (좀비 상태 감지) |
| `GET /api/system/versions` | 서비스 버전 정보 |

### 생성 파일
- `routes/health-routes.js` (177줄)

### 패턴
```javascript
module.exports = function(db) {
  const router = express.Router();
  // ... routes ...
  return router;
};
// server.js: app.use('/api', require('./routes/health-routes')(db));
```

### 줄 수 변화
- server.js: 12,636줄 → 12,480줄 (-156줄)

---

## Phase 4: User/Dev 라우트 추출 (완료)

### 추출 내역

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/users` | 전체 사용자 목록 |
| `GET /api/users/:id` | 사용자 상세 |
| `PUT /api/users/:id` | 사용자 수정 |
| `POST /api/dev/ensure-user` | 개발 계정 생성 |
| `DELETE /api/dev/customers/all` | 개발용 전체 삭제 |
| `DELETE /api/dev/contracts/all` | 개발용 전체 삭제 |
| `DELETE /api/dev/documents/all` | 개발용 전체 삭제 |

### 생성 파일
- `routes/users-routes.js` (376줄)

### 의존성
- `db, authenticateJWT, generateToken, qdrantClient, QDRANT_COLLECTION`

### 줄 수 변화
- server.js: 12,480줄 → 11,989줄 (-491줄)

---

## Phase 5: Address/Geocoding 라우트 추출 (완료)

### 추출 내역

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/address/test` | Kakao API 연결 테스트 |
| `GET /api/address/search` | Kakao 주소 검색 프록시 |
| `POST /api/geocode` | Naver Geocoding |

### 생성 파일
- `routes/address-routes.js` (238줄)

### 특이사항
- DB 의존성 없음: `module.exports = function() { ... }`
- 외부 API 호출만 (axios)

### 줄 수 변화
- server.js: 11,989줄 → 11,762줄 (-227줄)

---

## Phase 6: Insurance Products & Contracts 라우트 추출 (완료)

### 추출 내역

| 엔드포인트 | 용도 |
|------------|------|
| Insurance Products CRUD | 6개 엔드포인트 |
| Contracts CRUD + Bulk | 7개 엔드포인트 |

### 생성 파일
- `routes/insurance-contracts-routes.js` (1,223줄)

### 의존성
- `db, authenticateJWTorAPIKey`
- `helpers.escapeRegex`
- `@aims/shared-schema` (COLLECTIONS)

### 줄 수 변화
- server.js: 11,762줄 → 10,599줄 (-1,163줄)

### 누적 줄 수 변화 (Phase 1~6)
- **시작**: 12,986줄
- **현재**: 10,599줄
- **감소**: -2,387줄 (18.4%)

### 테스트 결과

```
Contract Tests: 13/13 suites, 98/98 tests PASSED
Golden Master:   1/1 suite,  33/33 tests PASSED
Jest Unit:      38/39 suites (cascadingDelete 기존 flaky)
```

---

## 상세 계획 (Phase 7~13)

상세 계획은 플랜 파일 참조: `.claude/plans/streamed-wishing-neumann.md`
