/**
 * route-modules.test.js
 * 라우트 모듈 로딩 및 초기화 검증 테스트
 *
 * 목적: server.js 리팩토링 후 라우트 모듈이 올바르게 로드되는지 검증
 * - require() 시 SyntaxError/모듈 누락 검출
 * - factory 함수 호출 시 ReferenceError 검출 (미정의 변수/함수)
 * - router 객체 반환 검증
 *
 * 이 테스트는 MongoDB 연결 없이 로컬에서 실행 가능.
 * factory 함수에 mock 객체를 전달하여 초기화 경로만 검증.
 *
 * @since 2026-02-07
 */

// ==================== Mock 객체 준비 ====================

// Express Router mock
const mockRouter = {
  get: jest.fn().mockReturnThis(),
  post: jest.fn().mockReturnThis(),
  put: jest.fn().mockReturnThis(),
  patch: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  use: jest.fn().mockReturnThis(),
};

jest.mock('express', () => ({
  Router: () => ({ ...mockRouter }),
  json: jest.fn(),
  urlencoded: jest.fn(),
  static: jest.fn(),
}));

// Windows에서 VERSION 파일(텍스트)과 version.js가 대소문자 무시로 충돌
// Docker(Linux)에서는 정상 동작하지만 Windows 테스트를 위해 mock 처리
jest.mock('../version', () => ({
  VERSION_INFO: { version: '0.0.0-test', gitHash: 'test', buildTime: 'test', fullVersion: 'v0.0.0-test' },
  APP_VERSION: '0.0.0-test',
  GIT_HASH: 'test',
  BUILD_TIME: 'test',
  FULL_VERSION: 'v0.0.0-test',
  logVersionInfo: jest.fn(),
}));

// OpenAI SDK는 API 키 없이 초기화 불가 - mock 처리
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    audio: { transcriptions: { create: jest.fn() } },
  }));
});

// MongoDB mock
const mockCollection = {
  find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
  findOne: jest.fn().mockResolvedValue(null),
  insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
  createIndex: jest.fn().mockResolvedValue('mock-index'),
  bulkWrite: jest.fn().mockResolvedValue({}),
  distinct: jest.fn().mockResolvedValue([]),
};

const mockDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  listCollections: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
};

const mockAnalyticsDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
};

// Multer upload mock
const mockUpload = {
  single: jest.fn().mockReturnValue((req, res, next) => next()),
  array: jest.fn().mockReturnValue((req, res, next) => next()),
  fields: jest.fn().mockReturnValue((req, res, next) => next()),
  any: jest.fn().mockReturnValue((req, res, next) => next()),
};

// Auth middleware mocks
const mockAuthenticateJWT = (req, res, next) => next();
const mockAuthenticateJWTorAPIKey = (req, res, next) => next();
const mockAuthenticateJWTWithQuery = (req, res, next) => next();
const mockRequireRole = () => (req, res, next) => next();
const mockGenerateToken = jest.fn().mockReturnValue('mock-token');

// Qdrant mock
const mockQdrantClient = {
  delete: jest.fn().mockResolvedValue({}),
  search: jest.fn().mockResolvedValue([]),
  upsert: jest.fn().mockResolvedValue({}),
  getCollections: jest.fn().mockResolvedValue({ collections: [] }),
};
const MOCK_QDRANT_COLLECTION = 'docembed';

// 기타 의존성 mock
const mockNotifyUserAccountSubscribers = jest.fn();
const mockNotifyDocumentListSubscribers = jest.fn();
const mockCreditPolicy = {
  checkCredit: jest.fn().mockResolvedValue({ allowed: true }),
  deductCredit: jest.fn().mockResolvedValue({ success: true }),
};

// ==================== 리팩토링된 라우트 모듈 (factory function 패턴) ====================

/**
 * factory function 패턴 라우트 모듈 목록
 * Phase 1~12에서 server.js에서 추출된 모듈들
 */
const FACTORY_ROUTE_MODULES = [
  {
    name: 'health-routes',
    path: '../routes/health-routes',
    args: () => [mockDb],
  },
  {
    name: 'users-routes',
    path: '../routes/users-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockGenerateToken, mockQdrantClient, MOCK_QDRANT_COLLECTION],
  },
  {
    name: 'address-routes',
    path: '../routes/address-routes',
    args: () => [],
  },
  {
    name: 'documents-routes',
    path: '../routes/documents-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockUpload, mockQdrantClient, MOCK_QDRANT_COLLECTION],
  },
  {
    name: 'customers-routes',
    path: '../routes/customers-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockAuthenticateJWTorAPIKey, mockAuthenticateJWTWithQuery, mockQdrantClient, MOCK_QDRANT_COLLECTION, mockUpload],
  },
  {
    name: 'admin-routes',
    path: '../routes/admin-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockRequireRole, mockQdrantClient, MOCK_QDRANT_COLLECTION],
  },
  {
    name: 'chat-routes',
    path: '../routes/chat-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockUpload],
  },
  {
    name: 'insurance-contracts-routes',
    path: '../routes/insurance-contracts-routes',
    args: () => [mockDb, mockAuthenticateJWTorAPIKey],
  },
  {
    name: 'webhooks-routes',
    path: '../routes/webhooks-routes',
    args: () => [mockDb, mockAuthenticateJWT],
  },
  {
    name: 'admin-backup-routes',
    path: '../routes/admin-backup-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockRequireRole],
  },
  {
    name: 'customer-documents-routes',
    path: '../routes/customer-documents-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockAuthenticateJWTorAPIKey, mockAuthenticateJWTWithQuery, mockQdrantClient, MOCK_QDRANT_COLLECTION, mockUpload],
  },
  {
    name: 'annual-report-routes',
    path: '../routes/annual-report-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockAuthenticateJWTWithQuery, mockUpload],
  },
  {
    name: 'notification-routes',
    path: '../routes/notification-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockAuthenticateJWTWithQuery],
  },
  {
    name: 'customer-memos-routes',
    path: '../routes/customer-memos-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockAuthenticateJWTorAPIKey],
  },
  {
    name: 'address-history-routes',
    path: '../routes/address-history-routes',
    args: () => [mockDb, mockAuthenticateJWT],
  },
  {
    name: 'credit-routes',
    path: '../routes/credit-routes',
    args: () => [mockDb, mockCreditPolicy],
  },
  {
    name: 'personal-files-routes',
    path: '../routes/personal-files-routes',
    args: () => [mockDb, mockAuthenticateJWT],
  },
  {
    name: 'storage-routes',
    path: '../routes/storage-routes',
    args: () => [mockDb, mockAnalyticsDb, mockAuthenticateJWT, mockRequireRole, mockNotifyUserAccountSubscribers, mockCreditPolicy],
  },
  {
    name: 'virus-scan-routes',
    path: '../routes/virus-scan-routes',
    args: () => [mockDb, mockAuthenticateJWT, mockRequireRole, mockAuthenticateJWTWithQuery, mockNotifyDocumentListSubscribers],
  },
  {
    name: 'internal-routes',
    path: '../routes/internal-routes',
    args: () => [mockDb],
  },
  {
    name: 'ac-routes',
    path: '../routes/ac-routes',
    args: () => [mockDb, mockAuthenticateJWT],
  },
  {
    name: 'rustdesk-routes',
    path: '../routes/rustdesk-routes',
    args: () => [mockDb, mockAuthenticateJWT],
  },
];

// ==================== 직접 export 라우트 목록 ====================

/**
 * 직접 export 패턴 라우트 모듈 목록
 * factory function이 아닌 router를 직접 export하는 모듈들
 */
const DIRECT_ROUTE_MODULES = [
  'auth',
  'bonus-credits-routes',
  'document-types-routes',
  'error-logs-routes',
  'help-content-routes',
  'inquiries-routes',
  'ocr-usage-routes',
  'saved-questions-routes',
  'security-routes',
  'system-settings-routes',
  'token-usage-routes',
  'usage-reset-routes',
  'user-activity-routes',
];

// ==================== 테스트 ====================

describe('라우트 모듈 로딩 검증', () => {
  describe('Factory function 라우트 모듈', () => {
    test.each(FACTORY_ROUTE_MODULES)(
      '$name: require() 및 factory 호출 성공',
      ({ name, path: modulePath, args }) => {
        // 1. 모듈 로드 (SyntaxError, 모듈 누락 검출)
        let moduleExport;
        expect(() => {
          moduleExport = require(modulePath);
        }).not.toThrow();

        // 2. factory 함수 타입 확인
        expect(typeof moduleExport).toBe('function');

        // 3. factory 호출 (ReferenceError 검출 - 미정의 변수/함수)
        let router;
        expect(() => {
          router = moduleExport(...args());
        }).not.toThrow();

        // 4. router 객체 반환 확인
        expect(router).toBeDefined();
        expect(typeof router).toBe('object');
      }
    );
  });

  describe('컬렉션 상수 정의 검증', () => {
    /**
     * Regression: CUSTOMERS_COLLECTION 미정의로 인한 고아 참조 버그 방지
     * documents-routes.js에서 사용하는 모든 _COLLECTION 상수가 const로 정의되어 있는지 검증
     */
    test.each(FACTORY_ROUTE_MODULES)(
      '$name: 사용된 _COLLECTION 상수가 모두 정의되어 있어야 함',
      ({ path: modulePath }) => {
        const fs = require('fs');
        const path = require('path');
        const routeContent = fs.readFileSync(
          path.resolve(__dirname, '..', 'routes', path.basename(modulePath) + '.js'),
          'utf-8'
        );

        // 파일 내에서 사용되는 _COLLECTION 패턴의 상수를 찾음
        const usedConstants = routeContent.match(/\b[A-Z_]+_COLLECTION\b/g);
        if (!usedConstants) return; // _COLLECTION 상수를 사용하지 않는 모듈은 스킵

        const uniqueConstants = [...new Set(usedConstants)];

        for (const constant of uniqueConstants) {
          const isDefinedAsConst = new RegExp(`const\\s+${constant}\\s*=`).test(routeContent);
          expect(isDefinedAsConst).toBe(true);
        }
      }
    );
  });

  describe('기존 라우트 모듈 (직접 export 패턴)', () => {
    test.each(DIRECT_ROUTE_MODULES)(
      '%s: require() 성공',
      (moduleName) => {
        expect(() => {
          require(`../routes/${moduleName}`);
        }).not.toThrow();
      }
    );
  });

  describe('라우트 디렉토리 자동 스캔 — 누락 검출', () => {
    /**
     * routes/ 디렉토리의 *-routes.js 파일이 모두 테스트에 등록되어 있는지 자동 검증.
     * 새 라우트 파일을 추가하고 테스트 목록에 등록하지 않으면 이 테스트가 실패한다.
     */
    test('모든 *-routes.js 파일이 FACTORY 또는 DIRECT 목록에 등록되어야 함', () => {
      const fs = require('fs');
      const path = require('path');

      const routesDir = path.resolve(__dirname, '..', 'routes');
      const allRouteFiles = fs.readdirSync(routesDir)
        .filter(f => f.endsWith('-routes.js'))
        .map(f => f.replace('.js', ''));

      // 테스트에 등록된 라우트 이름 수집
      const registeredFactory = FACTORY_ROUTE_MODULES.map(m => m.name);
      const registeredDirect = DIRECT_ROUTE_MODULES;
      const allRegistered = new Set([...registeredFactory, ...registeredDirect]);

      const missing = allRouteFiles.filter(name => !allRegistered.has(name));

      expect(missing).toEqual([]);
      // 실패 시 메시지: "누락된 라우트: [파일명]을 FACTORY_ROUTE_MODULES 또는 DIRECT_ROUTE_MODULES에 추가하세요"
      if (missing.length > 0) {
        throw new Error(
          `누락된 라우트 파일: ${missing.join(', ')}\n` +
          'FACTORY_ROUTE_MODULES 또는 DIRECT_ROUTE_MODULES에 추가하세요.'
        );
      }
    });
  });
});
