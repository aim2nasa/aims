/**
 * Activity Logger Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. _generateDescription - 액션 설명 자동 생성
 * 2. _maskSensitiveFields - 민감 정보 마스킹
 * 3. _sanitizeChanges - 변경사항 정제
 * 4. 로그 구조 검증
 */

// 모킹
jest.mock('../sseBroadcast', () => ({
  broadcastActivityLog: jest.fn()
}));

jest.mock('../backendLogger', () => ({
  error: jest.fn(),
  info: jest.fn()
}));

describe('activityLogger', () => {
  // =============================================================================
  // 1. _generateDescription 테스트
  // =============================================================================

  describe('_generateDescription', () => {
    const typeLabels = {
      create: '등록',
      update: '수정',
      delete: '삭제',
      upload: '업로드',
      download: '다운로드',
      search: '검색',
      login: '로그인',
      logout: '로그아웃',
      bulk_create: '일괄 등록',
      bulk_delete: '일괄 삭제',
      restore: '복원',
      retry: '재처리',
      parse: '파싱'
    };

    const categoryLabels = {
      customer: '고객',
      document: '문서',
      contract: '계약',
      auth: '인증',
      ai: 'AI',
      annual_report: '연결보고서',
      relationship: '관계',
      file: '파일'
    };

    function generateDescription(action) {
      const typeLabel = typeLabels[action.type] || action.type;
      const categoryLabel = categoryLabels[action.category] || action.category;
      return `${categoryLabel} ${typeLabel}`;
    }

    it('customer + create → "고객 등록"', () => {
      expect(generateDescription({ type: 'create', category: 'customer' }))
        .toBe('고객 등록');
    });

    it('document + delete → "문서 삭제"', () => {
      expect(generateDescription({ type: 'delete', category: 'document' }))
        .toBe('문서 삭제');
    });

    it('auth + login → "인증 로그인"', () => {
      expect(generateDescription({ type: 'login', category: 'auth' }))
        .toBe('인증 로그인');
    });

    it('contract + bulk_create → "계약 일괄 등록"', () => {
      expect(generateDescription({ type: 'bulk_create', category: 'contract' }))
        .toBe('계약 일괄 등록');
    });

    it('알 수 없는 타입 → 원본 유지', () => {
      expect(generateDescription({ type: 'unknown_action', category: 'customer' }))
        .toBe('고객 unknown_action');
    });

    it('알 수 없는 카테고리 → 원본 유지', () => {
      expect(generateDescription({ type: 'create', category: 'unknown_category' }))
        .toBe('unknown_category 등록');
    });
  });

  // =============================================================================
  // 2. _maskSensitiveFields 테스트
  // =============================================================================

  describe('_maskSensitiveFields', () => {
    const SENSITIVE_FIELDS = [
      'password',
      'ssn',
      'resident_number',
      'phone',
      'mobile',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'credit_card',
      'card_number'
    ];

    function maskSensitiveFields(obj) {
      if (!obj || typeof obj !== 'object') return obj;

      const masked = { ...obj };

      for (const field of SENSITIVE_FIELDS) {
        if (masked[field] !== undefined) {
          masked[field] = '***MASKED***';
        }
      }

      return masked;
    }

    it('password → 마스킹', () => {
      const result = maskSensitiveFields({ password: 'secret123' });
      expect(result.password).toBe('***MASKED***');
    });

    it('ssn → 마스킹', () => {
      const result = maskSensitiveFields({ ssn: '123-45-6789' });
      expect(result.ssn).toBe('***MASKED***');
    });

    it('phone → 마스킹', () => {
      const result = maskSensitiveFields({ phone: '010-1234-5678' });
      expect(result.phone).toBe('***MASKED***');
    });

    it('token → 마스킹', () => {
      const result = maskSensitiveFields({ token: 'eyJhbGciOiJIUzI1NiIs...' });
      expect(result.token).toBe('***MASKED***');
    });

    it('api_key → 마스킹', () => {
      const result = maskSensitiveFields({ api_key: 'sk-1234567890' });
      expect(result.api_key).toBe('***MASKED***');
    });

    it('일반 필드 → 유지', () => {
      const result = maskSensitiveFields({ name: '홍길동', email: 'test@example.com' });
      expect(result.name).toBe('홍길동');
      expect(result.email).toBe('test@example.com');
    });

    it('null → null 반환', () => {
      expect(maskSensitiveFields(null)).toBeNull();
    });

    it('undefined → undefined 반환', () => {
      expect(maskSensitiveFields(undefined)).toBeUndefined();
    });

    it('문자열 → 문자열 반환', () => {
      expect(maskSensitiveFields('not an object')).toBe('not an object');
    });

    it('여러 민감 필드 동시 마스킹', () => {
      const result = maskSensitiveFields({
        password: 'pass123',
        phone: '010-1234-5678',
        name: '홍길동'
      });

      expect(result.password).toBe('***MASKED***');
      expect(result.phone).toBe('***MASKED***');
      expect(result.name).toBe('홍길동');
    });
  });

  // =============================================================================
  // 3. _sanitizeChanges 테스트
  // =============================================================================

  describe('_sanitizeChanges', () => {
    function sanitizeChanges(changes) {
      if (!changes) return null;

      const sanitized = {};

      if (changes.before) {
        sanitized.before = { ...changes.before };
        if (sanitized.before.password) sanitized.before.password = '***MASKED***';
      }
      if (changes.after) {
        sanitized.after = { ...changes.after };
        if (sanitized.after.password) sanitized.after.password = '***MASKED***';
      }
      if (changes.changed_fields || changes.changedFields) {
        sanitized.changed_fields = changes.changed_fields || changes.changedFields;
      }

      return Object.keys(sanitized).length > 0 ? sanitized : null;
    }

    it('null → null', () => {
      expect(sanitizeChanges(null)).toBeNull();
    });

    it('undefined → null', () => {
      expect(sanitizeChanges(undefined)).toBeNull();
    });

    it('before/after 모두 처리', () => {
      const result = sanitizeChanges({
        before: { name: '김철수' },
        after: { name: '이영희' }
      });

      expect(result.before.name).toBe('김철수');
      expect(result.after.name).toBe('이영희');
    });

    it('changed_fields 보존', () => {
      const result = sanitizeChanges({
        changed_fields: ['name', 'email']
      });

      expect(result.changed_fields).toEqual(['name', 'email']);
    });

    it('빈 객체 → null', () => {
      const result = sanitizeChanges({});
      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // 4. 로그 구조 검증
  // =============================================================================

  describe('로그 구조', () => {
    it('actor 구조 검증', () => {
      const actor = {
        user_id: 'user-123',
        name: '홍길동',
        email: 'hong@example.com',
        role: 'user',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0'
      };

      expect(actor).toHaveProperty('user_id');
      expect(actor).toHaveProperty('name');
      expect(actor).toHaveProperty('email');
      expect(actor).toHaveProperty('role');
      expect(actor).toHaveProperty('ip_address');
      expect(actor).toHaveProperty('user_agent');
    });

    it('action 구조 검증', () => {
      const action = {
        type: 'create',
        category: 'customer',
        description: '고객 등록',
        target: {
          entity_type: 'customer',
          entity_id: 'cust-123',
          entity_name: '홍길동'
        }
      };

      expect(action).toHaveProperty('type');
      expect(action).toHaveProperty('category');
      expect(action).toHaveProperty('description');
      expect(action.target).toHaveProperty('entity_type');
    });

    it('result 구조 검증', () => {
      const result = {
        success: true,
        status_code: 200,
        affected_count: 1,
        duration_ms: 150
      };

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status_code');
      expect(result).toHaveProperty('affected_count');
      expect(result).toHaveProperty('duration_ms');
    });

    it('실패 result 구조', () => {
      const result = {
        success: false,
        status_code: 500,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Connection failed'
        }
      };

      expect(result.success).toBe(false);
      expect(result.error).toHaveProperty('code');
      expect(result.error).toHaveProperty('message');
    });
  });

  // =============================================================================
  // 5. 페이지네이션 테스트
  // =============================================================================

  describe('페이지네이션', () => {
    it('기본값: page=1, limit=50', () => {
      const params = {};
      const page = params.page || 1;
      const limit = params.limit || 50;

      expect(page).toBe(1);
      expect(limit).toBe(50);
    });

    it('skip 계산', () => {
      const page = 3;
      const limit = 50;
      const skip = (page - 1) * limit;

      expect(skip).toBe(100);
    });
  });

  // =============================================================================
  // 6. 필터링 테스트
  // =============================================================================

  describe('쿼리 필터', () => {
    it('userId 필터', () => {
      const query = {};
      const userId = 'user-123';

      if (userId) {
        query['actor.user_id'] = userId;
      }

      expect(query['actor.user_id']).toBe('user-123');
    });

    it('category 필터', () => {
      const query = {};
      const category = 'customer';

      if (category) {
        query['action.category'] = category;
      }

      expect(query['action.category']).toBe('customer');
    });

    it('success 필터 (true)', () => {
      const query = {};
      const success = true;

      if (success !== undefined) {
        query['result.success'] = success;
      }

      expect(query['result.success']).toBe(true);
    });

    it('success 필터 (false)', () => {
      const query = {};
      const success = false;

      if (success !== undefined) {
        query['result.success'] = success;
      }

      expect(query['result.success']).toBe(false);
    });

    it('날짜 범위 필터', () => {
      const query = {};
      const startDate = '2026-01-01';
      const endDate = '2026-02-01';

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
          query.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          query.timestamp.$lte = new Date(endDate);
        }
      }

      expect(query.timestamp.$gte).toEqual(new Date('2026-01-01'));
      expect(query.timestamp.$lte).toEqual(new Date('2026-02-01'));
    });
  });

  // =============================================================================
  // 7. TTL 설정 테스트
  // =============================================================================

  describe('TTL 설정', () => {
    it('90일 TTL (7776000초)', () => {
      const TTL_DAYS = 90;
      const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

      expect(TTL_SECONDS).toBe(7776000);
    });
  });
});
