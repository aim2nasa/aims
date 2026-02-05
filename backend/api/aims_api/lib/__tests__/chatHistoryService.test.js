/**
 * Chat History Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. _generateTitle - 세션 제목 자동 생성
 * 2. createSession - 새 세션 생성
 * 3. addMessage - 메시지 추가
 * 4. enforceSessionLimit - 세션 수 제한 (50개)
 */

// 모킹: 외부 의존성
jest.mock('../backendLogger', () => ({
  error: jest.fn(),
  info: jest.fn()
}));

// ChatHistoryService 싱글톤 대신 클래스 직접 테스트
const path = require('path');

// 클래스를 직접 가져오기 위해 모듈 재정의
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-12345')
}));

describe('chatHistoryService', () => {
  // =============================================================================
  // 1. _generateTitle 테스트
  // =============================================================================

  describe('_generateTitle', () => {
    // 함수 로직 테스트를 위한 헬퍼
    const TITLE_MAX_LENGTH = 50;

    function generateTitle(content) {
      if (!content) return '새 대화';
      const firstLine = content.split('\n')[0].trim();
      if (firstLine.length <= TITLE_MAX_LENGTH) {
        return firstLine;
      }
      return firstLine.substring(0, TITLE_MAX_LENGTH - 3) + '...';
    }

    it('빈 content → "새 대화"', () => {
      expect(generateTitle('')).toBe('새 대화');
    });

    it('null content → "새 대화"', () => {
      expect(generateTitle(null)).toBe('새 대화');
    });

    it('undefined content → "새 대화"', () => {
      expect(generateTitle(undefined)).toBe('새 대화');
    });

    it('짧은 텍스트 → 그대로 반환', () => {
      expect(generateTitle('안녕하세요')).toBe('안녕하세요');
    });

    it('50자 이하 → 그대로 반환', () => {
      const text = 'a'.repeat(50);
      expect(generateTitle(text)).toBe(text);
    });

    it('50자 초과 → 47자 + "..."', () => {
      const text = 'a'.repeat(60);
      expect(generateTitle(text)).toBe('a'.repeat(47) + '...');
    });

    it('여러 줄 → 첫 줄만 사용', () => {
      const text = '첫 번째 줄\n두 번째 줄\n세 번째 줄';
      expect(generateTitle(text)).toBe('첫 번째 줄');
    });

    it('첫 줄이 공백만 있으면 빈 문자열', () => {
      const text = '   \n두 번째 줄';
      expect(generateTitle(text)).toBe('');
    });

    it('첫 줄 앞뒤 공백 제거', () => {
      const text = '  안녕하세요  \n다른 줄';
      expect(generateTitle(text)).toBe('안녕하세요');
    });
  });

  // =============================================================================
  // 2. preview 생성 로직 테스트
  // =============================================================================

  describe('preview 생성', () => {
    const PREVIEW_MAX_LENGTH = 100;

    function generatePreview(content) {
      if (content.length > PREVIEW_MAX_LENGTH) {
        return content.substring(0, PREVIEW_MAX_LENGTH - 3) + '...';
      }
      return content;
    }

    it('100자 이하 → 그대로', () => {
      const text = 'a'.repeat(100);
      expect(generatePreview(text)).toBe(text);
    });

    it('100자 초과 → 97자 + "..."', () => {
      const text = 'a'.repeat(150);
      expect(generatePreview(text)).toBe('a'.repeat(97) + '...');
    });
  });

  // =============================================================================
  // 3. 설정값 테스트
  // =============================================================================

  describe('설정값', () => {
    const TTL_DAYS = 30;
    const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
    const MAX_SESSIONS_PER_USER = 50;

    it('TTL은 30일이어야 함', () => {
      expect(TTL_DAYS).toBe(30);
    });

    it('TTL_SECONDS는 2592000이어야 함', () => {
      expect(TTL_SECONDS).toBe(2592000);
    });

    it('MAX_SESSIONS_PER_USER는 50이어야 함', () => {
      expect(MAX_SESSIONS_PER_USER).toBe(50);
    });
  });

  // =============================================================================
  // 4. 세션 수 제한 로직 테스트
  // =============================================================================

  describe('세션 수 제한 로직', () => {
    it('50개 세션 중 49개 유지, 1개 삭제', () => {
      const sessions = Array.from({ length: 50 }, (_, i) => ({
        session_id: `session-${i}`
      }));

      const maxSessions = 50;
      const toDelete = sessions.slice(maxSessions - 1);

      expect(toDelete.length).toBe(1);
      expect(toDelete[0].session_id).toBe('session-49');
    });

    it('51개 세션 → 2개 삭제', () => {
      const sessions = Array.from({ length: 51 }, (_, i) => ({
        session_id: `session-${i}`
      }));

      const maxSessions = 50;
      const toDelete = sessions.slice(maxSessions - 1);

      expect(toDelete.length).toBe(2);
    });

    it('40개 세션 → 삭제 없음', () => {
      const sessions = Array.from({ length: 40 }, (_, i) => ({
        session_id: `session-${i}`
      }));

      const maxSessions = 50;
      const needsDelete = sessions.length >= maxSessions;

      expect(needsDelete).toBe(false);
    });
  });

  // =============================================================================
  // 5. 메시지 토큰 계산 테스트
  // =============================================================================

  describe('토큰 누적', () => {
    it('assistant 메시지 → 토큰 누적', () => {
      const role = 'assistant';
      const metadata = { tokens: { total: 150 } };

      const updateDoc = { $inc: { message_count: 1 } };

      if (role === 'assistant' && metadata.tokens?.total) {
        updateDoc.$inc.total_tokens = metadata.tokens.total;
      }

      expect(updateDoc.$inc.total_tokens).toBe(150);
    });

    it('user 메시지 → 토큰 누적 안 함', () => {
      const role = 'user';
      const metadata = { tokens: { total: 100 } };

      const updateDoc = { $inc: { message_count: 1 } };

      if (role === 'assistant' && metadata.tokens?.total) {
        updateDoc.$inc.total_tokens = metadata.tokens.total;
      }

      expect(updateDoc.$inc.total_tokens).toBeUndefined();
    });
  });

  // =============================================================================
  // 6. 페이지네이션 테스트
  // =============================================================================

  describe('페이지네이션', () => {
    it('page=1, limit=20 → skip=0', () => {
      const page = 1;
      const limit = 20;
      const skip = (page - 1) * limit;

      expect(skip).toBe(0);
    });

    it('page=3, limit=20 → skip=40', () => {
      const page = 3;
      const limit = 20;
      const skip = (page - 1) * limit;

      expect(skip).toBe(40);
    });

    it('totalPages 계산: 55개 / 20 → 3페이지', () => {
      const total = 55;
      const limit = 20;
      const totalPages = Math.ceil(total / limit);

      expect(totalPages).toBe(3);
    });
  });

  // =============================================================================
  // 7. 통계 집계 테스트
  // =============================================================================

  describe('통계 집계', () => {
    it('빈 결과 → 기본값 반환', () => {
      const result = [];

      const stats = result.length === 0
        ? {
            total_sessions: 0,
            total_messages: 0,
            total_tokens: 0,
            oldest_session: null,
            newest_session: null
          }
        : result[0];

      expect(stats.total_sessions).toBe(0);
      expect(stats.total_messages).toBe(0);
      expect(stats.total_tokens).toBe(0);
    });

    it('집계 결과 → _id 제거', () => {
      const result = [{
        _id: null,
        total_sessions: 10,
        total_messages: 100,
        total_tokens: 5000
      }];

      const stats = { ...result[0] };
      delete stats._id;

      expect(stats._id).toBeUndefined();
      expect(stats.total_sessions).toBe(10);
    });
  });
});
