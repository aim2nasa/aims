/**
 * System Settings Routes - 시스템 설정 API
 * @since 2025-12-13
 * @version 1.1.0
 *
 * 파일 검증 설정 등 시스템 전역 설정 관리
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const backendLogger = require('../lib/backendLogger');

// 공유 상수 로드 (프론트엔드와 동일한 소스 사용)
// 원본: shared/file-validation-constants.json (Docker 빌드 시 복사됨)
const sharedConstants = require(path.join(__dirname, '../file-validation-constants.json'));

// 기본 파일 검증 설정
const DEFAULT_FILE_VALIDATION_SETTINGS = {
  // 1. 확장자 검증
  extensionValidation: {
    enabled: true,
    blockedExtensions: sharedConstants.blockedExtensions,
    description: '위험한 확장자(exe, bat, dll, ps1, sh, elf 등) 차단'
  },

  // 2. 파일 크기 검증
  fileSizeValidation: {
    enabled: true,
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    maxSizeMB: 50,
    description: '파일 크기 제한'
  },

  // 3. MIME 타입 검증
  mimeTypeValidation: {
    enabled: true,
    description: '확장자 위조 탐지 (MIME 타입 검증)'
  },

  // 4. 스토리지 용량 검사
  storageQuotaValidation: {
    enabled: true,
    description: '사용자 스토리지 용량 검사'
  },

  // 5. 중복 파일 검사
  duplicateValidation: {
    enabled: true,
    description: '동일 파일 중복 업로드 방지'
  },

  // 6. 바이러스 검사 (ClamAV 불안정으로 기본 비활성화)
  virusScanValidation: {
    enabled: false,
    timeoutMs: 30000, // 30초
    description: 'ClamAV 바이러스 검사 (현재 비활성화)'
  }
};

// MongoDB 컬렉션 이름
const SETTINGS_COLLECTION = 'system_settings';
const SETTINGS_DOC_ID = 'file_validation';
const AI_MODELS_DOC_ID = 'ai_models';

// 사용 가능한 AI 모델 목록 (모든 서비스 공통) - OpenAI 전체 모델
const AVAILABLE_AI_MODELS = [
  // === GPT-4.1 시리즈 (2025 최신) ===
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',

  // === GPT-4.5 시리즈 ===
  'gpt-4.5-preview',
  'gpt-4.5-preview-2025-02-27',

  // === GPT-4o 시리즈 ===
  'gpt-4o',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-05-13',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-12-17',
  'gpt-4o-audio-preview-2024-10-01',
  'gpt-4o-realtime-preview',
  'gpt-4o-realtime-preview-2024-12-17',
  'gpt-4o-realtime-preview-2024-10-01',
  'gpt-4o-mini-audio-preview',
  'gpt-4o-mini-audio-preview-2024-12-17',
  'gpt-4o-mini-realtime-preview',
  'gpt-4o-mini-realtime-preview-2024-12-17',
  'chatgpt-4o-latest',

  // === GPT-4 Turbo 시리즈 ===
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-4-vision-preview',
  'gpt-4-1106-vision-preview',

  // === GPT-4 기본 시리즈 ===
  'gpt-4',
  'gpt-4-0613',
  'gpt-4-32k',
  'gpt-4-32k-0613',

  // === GPT-3.5 Turbo 시리즈 ===
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0125',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-16k',
  'gpt-3.5-turbo-instruct',

  // === o-시리즈 (Reasoning Models) ===
  'o1',
  'o1-2024-12-17',
  'o1-preview',
  'o1-preview-2024-09-12',
  'o1-mini',
  'o1-mini-2024-09-12',
  'o3-mini',
  'o3-mini-2025-01-31',
  'o4-mini',
  'o4-mini-2025-04-16',

  // === o1-pro 시리즈 (고성능) ===
  'o1-pro',
  'o1-pro-2025-03-19'
];

// 사용 가능한 AR 파서 목록
const AVAILABLE_AR_PARSERS = ['openai', 'pdfplumber', 'pdfplumber_table', 'upstage'];

// 사용 가능한 CR 파서 목록
const AVAILABLE_CR_PARSERS = ['regex', 'pdfplumber_table'];

// 기본 AI 모델 설정
const DEFAULT_AI_MODEL_SETTINGS = {
  chat: {
    model: 'gpt-4o',
    description: 'AI 채팅 (MCP 도구 사용)',
    availableModels: AVAILABLE_AI_MODELS
  },
  rag: {
    model: 'gpt-3.5-turbo',
    description: 'RAG 답변 생성',
    availableModels: AVAILABLE_AI_MODELS
  },
  annualReport: {
    model: 'gpt-4.1',
    parser: 'openai',  // openai | pdfplumber | upstage
    description: 'Annual Report PDF 파싱',
    availableModels: AVAILABLE_AI_MODELS,
    availableParsers: AVAILABLE_AR_PARSERS
  },
  customerReview: {
    model: 'gpt-4.1',
    parser: 'regex',  // regex | pdfplumber_table
    description: 'Customer Review Service PDF 파싱',
    availableModels: AVAILABLE_AI_MODELS,
    availableParsers: AVAILABLE_CR_PARSERS
  }
};

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 * @param {Function} requireRole - 역할 검증 미들웨어
 */
module.exports = function(db, authenticateJWT, requireRole) {

  /**
   * GET /api/settings/file-validation
   * 파일 검증 설정 조회
   *
   * 인증된 사용자만 조회 가능 (admin 뿐 아니라 일반 사용자도 조회)
   * - 프론트엔드에서 검증 로직에 사용하기 위함
   */
  router.get('/settings/file-validation', authenticateJWT, async (req, res) => {
    try {
      const collection = db.collection(SETTINGS_COLLECTION);

      // 설정 조회
      let settings = await collection.findOne({ _id: SETTINGS_DOC_ID });

      // 설정이 없으면 기본값 반환
      if (!settings) {
        settings = { ...DEFAULT_FILE_VALIDATION_SETTINGS };
      } else {
        // _id 제거하고 설정만 반환
        delete settings._id;
      }

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('파일 검증 설정 조회 오류:', error);
      backendLogger.error('SystemSettings', '파일 검증 설정 조회 오류', error);
      res.status(500).json({
        success: false,
        error: '설정 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * PUT /api/settings/file-validation
   * 파일 검증 설정 수정
   *
   * admin 역할만 수정 가능
   */
  router.put('/settings/file-validation', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const updates = req.body;

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({
          success: false,
          error: '잘못된 요청입니다. 설정 객체가 필요합니다.'
        });
      }

      const collection = db.collection(SETTINGS_COLLECTION);

      // 기존 설정 조회
      let existingSettings = await collection.findOne({ _id: SETTINGS_DOC_ID });

      if (!existingSettings) {
        existingSettings = { ...DEFAULT_FILE_VALIDATION_SETTINGS };
      }

      // 설정 병합 (깊은 병합)
      const mergedSettings = deepMerge(existingSettings, updates);
      delete mergedSettings._id; // _id는 별도 처리

      // 유효성 검증
      const validationError = validateSettings(mergedSettings);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError
        });
      }

      // 업데이트 또는 삽입
      await collection.updateOne(
        { _id: SETTINGS_DOC_ID },
        {
          $set: {
            ...mergedSettings,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        },
        { upsert: true }
      );

      console.log(`✅ 파일 검증 설정 수정됨 (by ${req.user.name || req.user.id})`);

      res.json({
        success: true,
        data: mergedSettings,
        message: '설정이 저장되었습니다.'
      });

    } catch (error) {
      console.error('파일 검증 설정 수정 오류:', error);
      backendLogger.error('SystemSettings', '파일 검증 설정 수정 오류', error);
      res.status(500).json({
        success: false,
        error: '설정 저장에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/settings/file-validation/reset
   * 파일 검증 설정 초기화 (기본값으로)
   *
   * admin 역할만 가능
   */
  router.post('/settings/file-validation/reset', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const collection = db.collection(SETTINGS_COLLECTION);

      // 기본값으로 덮어쓰기
      await collection.updateOne(
        { _id: SETTINGS_DOC_ID },
        {
          $set: {
            ...DEFAULT_FILE_VALIDATION_SETTINGS,
            updatedAt: new Date(),
            updatedBy: req.user.id,
            resetAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log(`🔄 파일 검증 설정 초기화됨 (by ${req.user.name || req.user.id})`);

      res.json({
        success: true,
        data: DEFAULT_FILE_VALIDATION_SETTINGS,
        message: '설정이 기본값으로 초기화되었습니다.'
      });

    } catch (error) {
      console.error('파일 검증 설정 초기화 오류:', error);
      backendLogger.error('SystemSettings', '파일 검증 설정 초기화 오류', error);
      res.status(500).json({
        success: false,
        error: '설정 초기화에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/settings/file-validation/defaults
   * 기본 파일 검증 설정 조회 (참고용)
   */
  router.get('/settings/file-validation/defaults', authenticateJWT, async (req, res) => {
    res.json({
      success: true,
      data: DEFAULT_FILE_VALIDATION_SETTINGS
    });
  });

  // ============================================
  // AI 모델 설정 API
  // ============================================

  /**
   * GET /api/settings/ai-models
   * AI 모델 설정 조회
   *
   * 인증 없이 조회 가능 (다른 서비스에서 호출)
   */
  router.get('/settings/ai-models', async (req, res) => {
    try {
      const collection = db.collection(SETTINGS_COLLECTION);
      let settings = await collection.findOne({ _id: AI_MODELS_DOC_ID });

      if (!settings) {
        settings = { ...DEFAULT_AI_MODEL_SETTINGS };
      } else {
        delete settings._id;
        delete settings.updatedAt;
        delete settings.updatedBy;
        // 항상 최신 availableModels/availableParsers 사용
        for (const service of ['chat', 'rag', 'annualReport', 'customerReview']) {
          if (settings[service]) {
            settings[service].availableModels = AVAILABLE_AI_MODELS;
          }
        }
        // annualReport에 availableParsers 추가
        if (settings.annualReport) {
          settings.annualReport.availableParsers = AVAILABLE_AR_PARSERS;
        }
        // customerReview에 availableParsers 추가
        if (settings.customerReview) {
          settings.customerReview.availableParsers = AVAILABLE_CR_PARSERS;
        } else {
          // customerReview 설정이 없으면 기본값 추가
          settings.customerReview = { ...DEFAULT_AI_MODEL_SETTINGS.customerReview };
        }
      }

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('AI 모델 설정 조회 오류:', error);
      backendLogger.error('SystemSettings', 'AI 모델 설정 조회 오류', error);
      res.status(500).json({
        success: false,
        error: 'AI 모델 설정 조회에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * PUT /api/settings/ai-models
   * AI 모델 설정 수정
   *
   * admin 역할만 수정 가능
   */
  router.put('/settings/ai-models', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const updates = req.body;

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({
          success: false,
          error: '잘못된 요청입니다. 설정 객체가 필요합니다.'
        });
      }

      const collection = db.collection(SETTINGS_COLLECTION);

      // 기존 설정 조회
      let existingSettings = await collection.findOne({ _id: AI_MODELS_DOC_ID });
      if (!existingSettings) {
        existingSettings = { ...DEFAULT_AI_MODEL_SETTINGS };
      }
      // customerReview가 없으면 기본값 사용
      if (!existingSettings.customerReview) {
        existingSettings.customerReview = { ...DEFAULT_AI_MODEL_SETTINGS.customerReview };
      }

      // 설정 병합
      const mergedSettings = {
        chat: { ...existingSettings.chat, ...updates.chat },
        rag: { ...existingSettings.rag, ...updates.rag },
        annualReport: { ...existingSettings.annualReport, ...updates.annualReport },
        customerReview: { ...existingSettings.customerReview, ...updates.customerReview }
      };

      // 유효성 검증
      const validationError = validateAIModelSettings(mergedSettings);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: validationError
        });
      }

      // 업데이트
      await collection.updateOne(
        { _id: AI_MODELS_DOC_ID },
        {
          $set: {
            ...mergedSettings,
            updatedAt: new Date(),
            updatedBy: req.user.id
          }
        },
        { upsert: true }
      );

      console.log(`✅ AI 모델 설정 수정됨 (by ${req.user.name || req.user.id})`);

      res.json({
        success: true,
        data: mergedSettings,
        message: 'AI 모델 설정이 저장되었습니다.'
      });
    } catch (error) {
      console.error('AI 모델 설정 수정 오류:', error);
      backendLogger.error('SystemSettings', 'AI 모델 설정 수정 오류', error);
      res.status(500).json({
        success: false,
        error: 'AI 모델 설정 저장에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/settings/ai-models/reset
   * AI 모델 설정 초기화
   *
   * admin 역할만 가능
   */
  router.post('/settings/ai-models/reset', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const collection = db.collection(SETTINGS_COLLECTION);

      await collection.updateOne(
        { _id: AI_MODELS_DOC_ID },
        {
          $set: {
            ...DEFAULT_AI_MODEL_SETTINGS,
            updatedAt: new Date(),
            updatedBy: req.user.id,
            resetAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log(`🔄 AI 모델 설정 초기화됨 (by ${req.user.name || req.user.id})`);

      res.json({
        success: true,
        data: DEFAULT_AI_MODEL_SETTINGS,
        message: 'AI 모델 설정이 기본값으로 초기화되었습니다.'
      });
    } catch (error) {
      console.error('AI 모델 설정 초기화 오류:', error);
      backendLogger.error('SystemSettings', 'AI 모델 설정 초기화 오류', error);
      res.status(500).json({
        success: false,
        error: 'AI 모델 설정 초기화에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};

/**
 * AI 모델 설정 유효성 검증
 */
function validateAIModelSettings(settings) {
  const services = ['chat', 'rag', 'annualReport', 'customerReview'];

  for (const service of services) {
    if (!settings[service]) {
      return `${service} 설정이 없습니다.`;
    }
    if (!settings[service].model || typeof settings[service].model !== 'string') {
      return `${service} 모델명이 올바르지 않습니다.`;
    }
    // availableModels에 포함된 모델인지 확인
    const available = DEFAULT_AI_MODEL_SETTINGS[service].availableModels;
    if (!available.includes(settings[service].model)) {
      return `${service}에 사용할 수 없는 모델입니다: ${settings[service].model}`;
    }
  }

  // annualReport parser 유효성 검증
  if (settings.annualReport && settings.annualReport.parser) {
    if (!AVAILABLE_AR_PARSERS.includes(settings.annualReport.parser)) {
      return `사용할 수 없는 AR 파서입니다: ${settings.annualReport.parser}. 사용 가능: ${AVAILABLE_AR_PARSERS.join(', ')}`;
    }
  }

  // customerReview parser 유효성 검증
  if (settings.customerReview && settings.customerReview.parser) {
    if (!AVAILABLE_CR_PARSERS.includes(settings.customerReview.parser)) {
      return `사용할 수 없는 CR 파서입니다: ${settings.customerReview.parser}. 사용 가능: ${AVAILABLE_CR_PARSERS.join(', ')}`;
    }
  }

  return null;
}

/**
 * 깊은 객체 병합
 * @param {Object} target - 대상 객체
 * @param {Object} source - 소스 객체
 * @returns {Object} - 병합된 객체
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 설정 유효성 검증
 * @param {Object} settings - 검증할 설정
 * @returns {string|null} - 오류 메시지 또는 null
 */
function validateSettings(settings) {
  // 파일 크기 검증
  if (settings.fileSizeValidation) {
    const { maxSizeBytes, maxSizeMB } = settings.fileSizeValidation;

    if (maxSizeBytes !== undefined && (typeof maxSizeBytes !== 'number' || maxSizeBytes <= 0)) {
      return '파일 크기 제한은 양수여야 합니다.';
    }

    if (maxSizeMB !== undefined && (typeof maxSizeMB !== 'number' || maxSizeMB <= 0)) {
      return '파일 크기 제한(MB)은 양수여야 합니다.';
    }

    // maxSizeMB가 변경되면 maxSizeBytes도 자동 계산
    if (maxSizeMB !== undefined && maxSizeBytes === undefined) {
      settings.fileSizeValidation.maxSizeBytes = maxSizeMB * 1024 * 1024;
    }
  }

  // 확장자 검증
  if (settings.extensionValidation) {
    const { blockedExtensions } = settings.extensionValidation;

    if (blockedExtensions !== undefined && !Array.isArray(blockedExtensions)) {
      return '차단 확장자 목록은 배열이어야 합니다.';
    }
  }

  // 바이러스 검사 타임아웃
  if (settings.virusScanValidation) {
    const { timeoutMs } = settings.virusScanValidation;

    if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs < 1000)) {
      return '바이러스 검사 타임아웃은 최소 1000ms(1초) 이상이어야 합니다.';
    }
  }

  return null;
}
