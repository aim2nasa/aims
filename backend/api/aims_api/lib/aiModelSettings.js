/**
 * AI 모델 설정 조회 모듈
 * @since 2025-12-27
 *
 * chatService.js에서 사용하는 AI 모델 설정을 MongoDB에서 조회
 * 1분 TTL 캐싱으로 DB 부하 최소화
 */

// 기본 AI 모델 설정 (MongoDB에 설정이 없을 때 사용)
const DEFAULT_AI_MODEL_SETTINGS = {
  chat: {
    model: 'gpt-4o',
    description: 'AI 채팅 (MCP 도구 사용)',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  rag: {
    model: 'gpt-3.5-turbo',
    description: 'RAG 답변 생성',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  annualReport: {
    model: 'gpt-4.1',
    description: '연보 PDF 파싱',
    availableModels: ['gpt-4.1', 'gpt-4o', 'gpt-4-turbo']
  }
};

// 캐시 설정
const CACHE_TTL_MS = 60 * 1000; // 1분
let cachedSettings = null;
let cacheTimestamp = 0;

// MongoDB 인스턴스 (init 시 설정)
let db = null;

/**
 * 모듈 초기화
 * @param {Db} mongoDb - MongoDB 인스턴스
 */
function init(mongoDb) {
  db = mongoDb;
  console.log('✅ aiModelSettings 모듈 초기화 완료');
}

/**
 * AI 모델 설정 조회 (캐싱 적용)
 * @returns {Promise<Object>} AI 모델 설정
 */
async function getSettings() {
  const now = Date.now();

  // 캐시가 유효하면 캐시 반환
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSettings;
  }

  // DB에서 조회
  if (!db) {
    console.warn('⚠️ aiModelSettings: DB가 초기화되지 않음, 기본값 사용');
    return DEFAULT_AI_MODEL_SETTINGS;
  }

  try {
    const collection = db.collection('system_settings');
    const settings = await collection.findOne({ _id: 'ai_models' });

    if (settings) {
      // 메타 필드 제거
      delete settings._id;
      delete settings.updatedAt;
      delete settings.updatedBy;
      delete settings.resetAt;

      cachedSettings = settings;
    } else {
      cachedSettings = DEFAULT_AI_MODEL_SETTINGS;
    }

    cacheTimestamp = now;
    return cachedSettings;
  } catch (error) {
    console.error('❌ AI 모델 설정 조회 오류:', error);
    return DEFAULT_AI_MODEL_SETTINGS;
  }
}

/**
 * 특정 서비스의 모델명 조회
 * @param {string} service - 서비스명 (chat, rag, annualReport)
 * @returns {Promise<string>} 모델명
 */
async function getModel(service) {
  const settings = await getSettings();
  return settings[service]?.model || DEFAULT_AI_MODEL_SETTINGS[service]?.model;
}

/**
 * 캐시 무효화
 */
function invalidateCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
  console.log('🔄 AI 모델 설정 캐시 무효화됨');
}

module.exports = {
  init,
  getSettings,
  getModel,
  invalidateCache,
  DEFAULT_AI_MODEL_SETTINGS
};
