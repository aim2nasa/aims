/**
 * System Settings Routes - 시스템 설정 API
 * @since 2025-12-13
 * @version 1.0.0
 *
 * 파일 검증 설정 등 시스템 전역 설정 관리
 */

const express = require('express');
const router = express.Router();

// 기본 파일 검증 설정
const DEFAULT_FILE_VALIDATION_SETTINGS = {
  // 1. 확장자 검증
  extensionValidation: {
    enabled: true,
    blockedExtensions: [
      'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
      'dll', 'sys', 'drv',
      'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsc', 'wsh',
      'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
      'reg', 'inf', 'scf', 'lnk', 'hta'
    ],
    description: '위험한 확장자(exe, bat, dll, ps1 등) 차단'
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

  return router;
};

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
