/**
 * chatHistoryService.js
 * AI 채팅 히스토리 저장 서비스
 * - 세션 단위로 대화 저장
 * - 30일 TTL 자동 삭제
 * - 사용자당 최대 50개 세션 제한
 *
 * @since 2025-12-20
 */

const { v4: uuidv4 } = require('uuid');
const backendLogger = require('./backendLogger');

// 설정값
const TTL_DAYS = 30;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60; // 2592000
const MAX_SESSIONS_PER_USER = 50;
const TITLE_MAX_LENGTH = 50;
const PREVIEW_MAX_LENGTH = 100;

class ChatHistoryService {
  constructor() {
    this.sessionsCollection = null;
    this.messagesCollection = null;
    this.initialized = false;
  }

  /**
   * ChatHistoryService 초기화
   * @param {Db} analyticsDb - MongoDB aims_analytics 데이터베이스
   */
  async initialize(analyticsDb) {
    if (this.initialized) {
      console.log('[ChatHistoryService] 이미 초기화됨');
      return;
    }

    try {
      this.sessionsCollection = analyticsDb.collection('chat_sessions');
      this.messagesCollection = analyticsDb.collection('chat_messages');
      await this._createIndexes();
      this.initialized = true;
      console.log('[ChatHistoryService] 초기화 완료');
    } catch (error) {
      console.error('[ChatHistoryService] 초기화 실패:', error.message);
      throw error;
    }
  }

  /**
   * 인덱스 생성
   */
  async _createIndexes() {
    try {
      // chat_sessions 인덱스
      await this.sessionsCollection.createIndex(
        { user_id: 1, updated_at: -1 }
      );
      await this.sessionsCollection.createIndex(
        { session_id: 1 },
        { unique: true }
      );
      // 30일 TTL
      await this.sessionsCollection.createIndex(
        { created_at: 1 },
        { expireAfterSeconds: TTL_SECONDS }
      );

      // chat_messages 인덱스
      await this.messagesCollection.createIndex(
        { session_id: 1, timestamp: 1 }
      );
      await this.messagesCollection.createIndex(
        { user_id: 1, timestamp: -1 }
      );
      // 30일 TTL
      await this.messagesCollection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: TTL_SECONDS }
      );

      console.log('[ChatHistoryService] 인덱스 생성 완료');
    } catch (error) {
      console.error('[ChatHistoryService] 인덱스 생성 실패:', error.message);
      backendLogger.error('ChatHistoryService', '인덱스 생성 실패', error);
    }
  }

  /**
   * 첫 메시지에서 세션 제목 생성
   * @param {string} content - 첫 번째 사용자 메시지
   * @returns {string} 세션 제목
   */
  _generateTitle(content) {
    if (!content) return '새 대화';

    // 줄바꿈 제거 후 첫 줄만 사용
    const firstLine = content.split('\n')[0].trim();

    if (firstLine.length <= TITLE_MAX_LENGTH) {
      return firstLine;
    }

    return firstLine.substring(0, TITLE_MAX_LENGTH - 3) + '...';
  }

  /**
   * 새 세션 생성
   * @param {string} userId - 사용자 ID
   * @param {string} firstMessage - 첫 번째 사용자 메시지
   * @returns {Promise<Object>} 생성된 세션 정보
   */
  async createSession(userId, firstMessage) {
    if (!this.sessionsCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    // 세션 수 제한 적용
    await this.enforceSessionLimit(userId);

    const sessionId = uuidv4();
    const now = new Date();
    const title = this._generateTitle(firstMessage);

    const session = {
      session_id: sessionId,
      user_id: userId,
      title: title,
      created_at: now,
      updated_at: now,
      message_count: 0,
      total_tokens: 0,
      last_message_preview: ''
    };

    await this.sessionsCollection.insertOne(session);

    console.log(`[ChatHistoryService] 세션 생성: ${sessionId} (user: ${userId})`);

    return {
      session_id: sessionId,
      title: title,
      created_at: now
    };
  }

  /**
   * 메시지 추가
   * @param {string} sessionId - 세션 ID
   * @param {string} userId - 사용자 ID
   * @param {string} role - 'user' | 'assistant'
   * @param {string} content - 메시지 내용
   * @param {Object} metadata - 추가 정보 (tokens, tools_used, request_id)
   * @returns {Promise<Object>} 저장된 메시지 정보
   */
  async addMessage(sessionId, userId, role, content, metadata = {}) {
    if (!this.messagesCollection || !this.sessionsCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    const now = new Date();

    const message = {
      session_id: sessionId,
      user_id: userId,
      role: role,
      content: content,
      timestamp: now,
      request_id: metadata.request_id || null,
      tokens: role === 'assistant' && metadata.tokens ? {
        prompt: metadata.tokens.prompt || 0,
        completion: metadata.tokens.completion || 0,
        total: metadata.tokens.total || 0
      } : null,
      tools_used: role === 'assistant' ? (metadata.tools_used || []) : null
    };

    await this.messagesCollection.insertOne(message);

    // 세션 업데이트
    const preview = content.length > PREVIEW_MAX_LENGTH
      ? content.substring(0, PREVIEW_MAX_LENGTH - 3) + '...'
      : content;

    const updateDoc = {
      $set: {
        updated_at: now,
        last_message_preview: preview
      },
      $inc: {
        message_count: 1
      }
    };

    // 토큰 누적 (assistant 메시지만)
    if (role === 'assistant' && metadata.tokens?.total) {
      updateDoc.$inc.total_tokens = metadata.tokens.total;
    }

    await this.sessionsCollection.updateOne(
      { session_id: sessionId, user_id: userId },
      updateDoc
    );

    return {
      session_id: sessionId,
      role: role,
      timestamp: now
    };
  }

  /**
   * 사용자 세션 목록 조회
   * @param {string} userId - 사용자 ID
   * @param {number} page - 페이지 번호 (1부터 시작)
   * @param {number} limit - 페이지당 항목 수
   * @returns {Promise<Object>} 세션 목록 및 페이지네이션 정보
   */
  async getSessionList(userId, page = 1, limit = 20) {
    if (!this.sessionsCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionsCollection
        .find({ user_id: userId })
        .sort({ updated_at: -1 })
        .skip(skip)
        .limit(limit)
        .project({
          _id: 0,
          session_id: 1,
          title: 1,
          created_at: 1,
          updated_at: 1,
          message_count: 1,
          total_tokens: 1,
          last_message_preview: 1
        })
        .toArray(),
      this.sessionsCollection.countDocuments({ user_id: userId })
    ]);

    return {
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 세션 메시지 조회
   * @param {string} sessionId - 세션 ID
   * @param {string} userId - 사용자 ID (권한 확인용)
   * @returns {Promise<Object>} 세션 정보 및 메시지 목록
   */
  async getSessionMessages(sessionId, userId) {
    if (!this.sessionsCollection || !this.messagesCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    // 세션 존재 및 권한 확인
    const session = await this.sessionsCollection.findOne({
      session_id: sessionId,
      user_id: userId
    });

    if (!session) {
      return null;
    }

    // 메시지 조회
    const messages = await this.messagesCollection
      .find({ session_id: sessionId })
      .sort({ timestamp: 1 })
      .project({
        _id: 0,
        role: 1,
        content: 1,
        timestamp: 1,
        tokens: 1,
        tools_used: 1
      })
      .toArray();

    return {
      session: {
        session_id: session.session_id,
        title: session.title,
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session.message_count,
        total_tokens: session.total_tokens
      },
      messages
    };
  }

  /**
   * 세션 삭제
   * @param {string} sessionId - 세션 ID
   * @param {string} userId - 사용자 ID (권한 확인용)
   * @returns {Promise<boolean>} 삭제 성공 여부
   */
  async deleteSession(sessionId, userId) {
    if (!this.sessionsCollection || !this.messagesCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    // 세션 삭제
    const sessionResult = await this.sessionsCollection.deleteOne({
      session_id: sessionId,
      user_id: userId
    });

    if (sessionResult.deletedCount === 0) {
      return false;
    }

    // 관련 메시지 삭제
    await this.messagesCollection.deleteMany({
      session_id: sessionId
    });

    console.log(`[ChatHistoryService] 세션 삭제: ${sessionId} (user: ${userId})`);

    return true;
  }

  /**
   * 사용자당 세션 수 제한 적용
   * @param {string} userId - 사용자 ID
   * @param {number} maxSessions - 최대 세션 수
   */
  async enforceSessionLimit(userId, maxSessions = MAX_SESSIONS_PER_USER) {
    if (!this.sessionsCollection || !this.messagesCollection) {
      return;
    }

    try {
      const sessions = await this.sessionsCollection
        .find({ user_id: userId })
        .sort({ created_at: -1 })
        .project({ session_id: 1 })
        .toArray();

      if (sessions.length >= maxSessions) {
        // 오래된 세션부터 삭제
        const toDelete = sessions.slice(maxSessions - 1);
        const sessionIds = toDelete.map(s => s.session_id);

        await this.sessionsCollection.deleteMany({
          session_id: { $in: sessionIds }
        });

        await this.messagesCollection.deleteMany({
          session_id: { $in: sessionIds }
        });

        console.log(`[ChatHistoryService] 세션 제한 적용: ${sessionIds.length}개 삭제 (user: ${userId})`);
      }
    } catch (error) {
      console.error('[ChatHistoryService] 세션 제한 적용 실패:', error.message);
      backendLogger.error('ChatHistoryService', '세션 제한 적용 실패', error);
    }
  }

  /**
   * 세션 제목 업데이트
   * @param {string} sessionId - 세션 ID
   * @param {string} userId - 사용자 ID
   * @param {string} title - 새 제목
   * @returns {Promise<boolean>} 업데이트 성공 여부
   */
  async updateSessionTitle(sessionId, userId, title) {
    if (!this.sessionsCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    const result = await this.sessionsCollection.updateOne(
      { session_id: sessionId, user_id: userId },
      { $set: { title: title.substring(0, TITLE_MAX_LENGTH) } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * 사용자 채팅 통계 조회
   * @param {string} userId - 사용자 ID
   * @returns {Promise<Object>} 통계 정보
   */
  async getUserStats(userId) {
    if (!this.sessionsCollection) {
      throw new Error('ChatHistoryService가 초기화되지 않았습니다');
    }

    const pipeline = [
      { $match: { user_id: userId } },
      {
        $group: {
          _id: null,
          total_sessions: { $sum: 1 },
          total_messages: { $sum: '$message_count' },
          total_tokens: { $sum: '$total_tokens' },
          oldest_session: { $min: '$created_at' },
          newest_session: { $max: '$updated_at' }
        }
      }
    ];

    const result = await this.sessionsCollection.aggregate(pipeline).toArray();

    if (result.length === 0) {
      return {
        total_sessions: 0,
        total_messages: 0,
        total_tokens: 0,
        oldest_session: null,
        newest_session: null
      };
    }

    const stats = result[0];
    delete stats._id;
    return stats;
  }
}

// 싱글톤 인스턴스 export
module.exports = new ChatHistoryService();
