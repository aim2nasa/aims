/**
 * 백엔드 로거 래퍼
 * Express 요청 컨텍스트를 자동으로 캡처하여 systemLogger로 전달
 *
 * 사용법:
 * const logger = require('./lib/backendLogger');
 *
 * // 미들웨어로 요청 컨텍스트 캡처
 * app.use(logger.middleware);
 *
 * // 로깅
 * logger.debug('MCP', 'Tool executed', { toolName });
 * logger.info('FileUpload', 'File uploaded successfully', { filename });
 * logger.warn('Auth', 'Invalid token format');
 * logger.error('API', 'Request failed', error);
 *
 * @since 2025-12-22
 */

const systemLogger = require('./errorLogger');
const { AsyncLocalStorage } = require('async_hooks');

// 요청 컨텍스트를 저장하는 AsyncLocalStorage
const requestContext = new AsyncLocalStorage();

/**
 * 요청에서 actor 정보 추출
 */
function extractActor(req) {
  if (!req) return {};

  return {
    user_id: req.user?.id || req.user?.userId || null,
    name: req.user?.name || null,
    email: req.user?.email || null,
    role: req.user?.role || 'anonymous',
    ip_address: req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
      || req.connection?.remoteAddress
      || req.ip
      || null,
    user_agent: req.headers?.['user-agent'] || null
  };
}

/**
 * 요청에서 컨텍스트 정보 추출
 */
function extractContext(req) {
  if (!req) return {};

  return {
    request_id: req.headers?.['x-request-id'] || null,
    session_id: req.sessionID || null,
    endpoint: req.originalUrl || req.url,
    method: req.method
  };
}

/**
 * 현재 요청 컨텍스트 가져오기
 */
function getCurrentContext() {
  return requestContext.getStore() || {};
}

/**
 * Express 미들웨어 - 요청 컨텍스트 캡처
 */
function middleware(req, res, next) {
  const context = {
    req,
    actor: extractActor(req),
    context: extractContext(req)
  };

  requestContext.run(context, () => {
    next();
  });
}

/**
 * 로그 메시지 포맷팅
 */
function formatMessage(component, message) {
  return `[${component}] ${message}`;
}

/**
 * 로깅 함수들
 */
const backendLogger = {
  // 미들웨어
  middleware,

  /**
   * Debug 레벨 로그 (1% 샘플링)
   */
  debug(component, message, data = null) {
    const ctx = getCurrentContext();

    // 콘솔에도 출력 (개발 환경)
    if (process.env.NODE_ENV !== 'production') {
      console.log(formatMessage(component, message), data || '');
    }

    return systemLogger.logWithLevel('debug', {
      actor: ctx.actor,
      source: { type: 'backend', component },
      message,
      data,
      context: ctx.context
    });
  },

  /**
   * Info 레벨 로그 (10% 샘플링)
   */
  info(component, message, data = null) {
    const ctx = getCurrentContext();

    // 콘솔에도 출력
    console.log(formatMessage(component, message), data || '');

    return systemLogger.logWithLevel('info', {
      actor: ctx.actor,
      source: { type: 'backend', component },
      message,
      data,
      context: ctx.context
    });
  },

  /**
   * Warn 레벨 로그 (100% 수집)
   */
  warn(component, message, data = null) {
    const ctx = getCurrentContext();

    // 콘솔에도 출력
    console.warn(formatMessage(component, message), data || '');

    return systemLogger.logWithLevel('warn', {
      actor: ctx.actor,
      source: { type: 'backend', component },
      message,
      data,
      context: ctx.context
    });
  },

  /**
   * Error 레벨 로그 (100% 수집)
   */
  error(component, message, errorOrData = null) {
    const ctx = getCurrentContext();

    // 콘솔에도 출력
    console.error(formatMessage(component, message), errorOrData || '');

    const isError = errorOrData instanceof Error || (errorOrData && errorOrData.stack);

    return systemLogger.logWithLevel('error', {
      actor: ctx.actor,
      source: { type: 'backend', component },
      message,
      data: isError ? null : errorOrData,
      error: isError ? {
        type: errorOrData.name || 'Error',
        message: errorOrData.message,
        stack: errorOrData.stack,
        severity: 'high',
        category: 'runtime'
      } : null,
      context: ctx.context
    });
  },

  /**
   * 특정 요청 컨텍스트로 로깅 (미들웨어 없이 사용)
   */
  withRequest(req) {
    const actor = extractActor(req);
    const context = extractContext(req);

    return {
      debug: (component, message, data) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(formatMessage(component, message), data || '');
        }
        return systemLogger.logWithLevel('debug', {
          actor, source: { type: 'backend', component }, message, data, context
        });
      },
      info: (component, message, data) => {
        console.log(formatMessage(component, message), data || '');
        return systemLogger.logWithLevel('info', {
          actor, source: { type: 'backend', component }, message, data, context
        });
      },
      warn: (component, message, data) => {
        console.warn(formatMessage(component, message), data || '');
        return systemLogger.logWithLevel('warn', {
          actor, source: { type: 'backend', component }, message, data, context
        });
      },
      error: (component, message, errorOrData) => {
        console.error(formatMessage(component, message), errorOrData || '');
        const isError = errorOrData instanceof Error || (errorOrData && errorOrData.stack);
        return systemLogger.logWithLevel('error', {
          actor, source: { type: 'backend', component }, message,
          data: isError ? null : errorOrData,
          error: isError ? {
            type: errorOrData.name || 'Error',
            message: errorOrData.message,
            stack: errorOrData.stack,
            severity: 'high',
            category: 'runtime'
          } : null,
          context
        });
      }
    };
  }
};

module.exports = backendLogger;
