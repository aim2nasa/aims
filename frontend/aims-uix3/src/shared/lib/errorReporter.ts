/**
 * AIMS Error Reporter
 * 프론트엔드 에러를 백엔드로 전송하는 유틸리티
 *
 * 기능:
 * - 전역 에러 핸들러 (window.onerror, unhandledrejection)
 * - API 에러 리포트
 * - 컴포넌트 에러 리포트 (ErrorBoundary용)
 * - 스로틀링으로 과도한 에러 전송 방지
 *
 * @since 2025-12-22
 */

import { api, ApiError, NetworkError, TimeoutError } from './api';

// 버전 정보 (빌드 시 주입되거나 기본값 사용)
const APP_VERSION = import.meta.env['VITE_APP_VERSION'] || '1.0.0';

/**
 * 에러 심각도
 */
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * 에러 카테고리
 */
type ErrorCategory = 'api' | 'network' | 'timeout' | 'validation' | 'runtime' | 'unhandled';

/**
 * 에러 리포트 구조
 */
interface ErrorReport {
  error: {
    type: string;
    code?: string;
    message: string;
    stack?: string;
    severity: ErrorSeverity;
    category: ErrorCategory;
  };
  source: {
    type: 'frontend';
    component?: string;
    url: string;
    file?: string;
    line?: number;
    column?: number;
  };
  context: {
    request_id?: string;
    browser?: string;
    os?: string;
    version?: string;
    payload?: Record<string, unknown>;
    response_status?: number;
    componentStack?: string;
  };
}

/**
 * 민감 정보 필드 목록
 * 🔒 보안: 다양한 변형 패턴 포함 (user_token, auth_code 등)
 */
const SENSITIVE_KEYS = [
  // 인증 관련
  'password', 'passwd', 'pwd',
  'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'bearer', 'jwt', 'session', 'sessionid', 'session_id',
  'authorization', 'auth', 'authcode', 'auth_code',
  'apikey', 'api_key', 'api-key',
  'credentials', 'credential',
  // 암호화 키
  'secret', 'secretkey', 'secret_key',
  'privatekey', 'private_key', 'private-key',
  'publickey', 'public_key', 'public-key',
  // 개인정보
  'ssn', 'socialsecurity',
  'creditcard', 'credit_card', 'cardnumber', 'card_number', 'cvv', 'cvc',
  'pin', 'pincode', 'pin_code',
  // 쿠키/스토리지
  'cookie', 'cookies',
];

/**
 * 에러 리포터 클래스
 */
class ErrorReporter {
  private queue: ErrorReport[] = [];
  private isProcessing = false;
  private lastReportTime = 0;
  private errorCounts: Map<string, number> = new Map();
  private recent502Count = 0;
  private last502ResetTime = 0;

  // 설정
  private readonly THROTTLE_MS = 1000; // 에러 간 최소 간격 (1초)
  private readonly MAX_QUEUE_SIZE = 50; // 최대 큐 크기
  private readonly DEDUP_WINDOW_MS = 60000; // 중복 제거 윈도우 (1분)
  private readonly MAX_SAME_ERROR = 5; // 같은 에러 최대 전송 횟수
  private readonly TRANSIENT_502_WINDOW_MS = 5 * 60 * 1000; // 502 판단 윈도우 (5분)
  private readonly TRANSIENT_502_THRESHOLD = 3; // 이 횟수 이상이면 실제 장애로 판단

  constructor() {
    this.setupGlobalHandlers();
    // 주기적으로 에러 카운트 리셋
    setInterval(() => this.errorCounts.clear(), this.DEDUP_WINDOW_MS);
  }

  /**
   * 전역 에러 핸들러 설정
   */
  private setupGlobalHandlers() {
    // 이미 설정되었는지 확인 (HMR 대응)
    if ((window as unknown as { __errorReporterInitialized?: boolean }).__errorReporterInitialized) {
      return;
    }
    (window as unknown as { __errorReporterInitialized?: boolean }).__errorReporterInitialized = true;

    // window.onerror - 동기 에러
    const originalOnError = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      this.report({
        error: {
          type: error?.name || 'Error',
          message: String(message),
          stack: error?.stack,
          severity: 'high',
          category: 'runtime'
        },
        source: {
          type: 'frontend',
          url: window.location.href,
          file: source || undefined,
          line: lineno || undefined,
          column: colno || undefined
        }
      });

      // 원래 핸들러 호출
      if (originalOnError) {
        return originalOnError.call(window, message, source, lineno, colno, error);
      }
      return false;
    };

    // unhandledrejection - 비동기 에러
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      this.report({
        error: {
          type: error?.name || 'UnhandledPromiseRejection',
          message: error?.message || String(error),
          stack: error?.stack,
          severity: 'high',
          category: 'unhandled'
        },
        source: {
          type: 'frontend',
          url: window.location.href
        }
      });
    });
  }

  /**
   * API 에러 리포트
   * TanStack Query나 직접 API 호출에서 발생한 에러 전송
   */
  public reportApiError(
    error: ApiError | NetworkError | TimeoutError | Error,
    context?: {
      endpoint?: string;
      component?: string;
      payload?: Record<string, unknown>;
    }
  ) {
    // 자동 복구되는 에러는 리포트하지 않음 (배포 중 502, SSE 끊김 등)
    if (this.isTransientError(error)) return;

    let category: ErrorCategory = 'api';
    let severity: ErrorSeverity = 'medium';
    let code: string | undefined;
    let responseStatus: number | undefined;

    if (error instanceof NetworkError) {
      category = 'network';
      severity = 'high';
    } else if (error instanceof TimeoutError) {
      category = 'timeout';
      severity = 'medium';
    } else if (error instanceof ApiError) {
      severity = error.status >= 500 ? 'high' : 'medium';
      code = String(error.status);
      responseStatus = error.status;
    }

    this.report({
      error: {
        type: error.name,
        code,
        message: error.message,
        stack: error.stack,
        severity,
        category
      },
      source: {
        type: 'frontend',
        url: window.location.href,
        component: context?.component
      },
      context: {
        payload: this.sanitizePayload(context?.payload),
        response_status: responseStatus
      }
    });
  }

  /**
   * 컴포넌트 에러 리포트
   * React ErrorBoundary에서 호출
   */
  public reportComponentError(
    error: Error,
    componentName: string,
    errorInfo?: { componentStack?: string }
  ) {
    this.report({
      error: {
        type: error.name,
        message: error.message,
        stack: error.stack,
        severity: 'critical',
        category: 'runtime'
      },
      source: {
        type: 'frontend',
        url: window.location.href,
        component: componentName
      },
      context: {
        componentStack: errorInfo?.componentStack
      }
    });
  }

  /**
   * 커스텀 에러 리포트
   * 비즈니스 로직에서 직접 호출
   */
  public reportCustomError(
    message: string,
    options?: {
      type?: string;
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      component?: string;
      context?: Record<string, unknown>;
    }
  ) {
    this.report({
      error: {
        type: options?.type || 'CustomError',
        message,
        severity: options?.severity || 'medium',
        category: options?.category || 'validation'
      },
      source: {
        type: 'frontend',
        url: window.location.href,
        component: options?.component
      },
      context: {
        payload: this.sanitizePayload(options?.context)
      }
    });
  }

  /**
   * HTTP 상태 코드 추출 (ApiError, AxiosError 모두 대응)
   */
  private getHttpStatus(error: Error): number | undefined {
    if (error instanceof ApiError) return error.status;
    // AxiosError 호환 (axios를 직접 사용하는 코드에서 발생)
    const axiosResponse = (error as { response?: { status?: number } }).response;
    return axiosResponse?.status;
  }

  /**
   * 자동 복구 가능한 일시적 에러 판별
   * 배포 중 502, SSE 연결 끊김, 인증 만료 등 — 리포트 불필요
   */
  private isTransientError(error: Error): boolean {
    const status = this.getHttpStatus(error);

    // 502 Bad Gateway — 배포 중 1~2회는 무시, 5분 내 반복 시 실제 장애로 리포트
    if (status === 502) {
      const now = Date.now();
      if (now - this.last502ResetTime > this.TRANSIENT_502_WINDOW_MS) {
        this.recent502Count = 0;
        this.last502ResetTime = now;
      }
      this.recent502Count++;
      return this.recent502Count < this.TRANSIENT_502_THRESHOLD;
    }

    // SSE 연결 에러 (자동 재연결됨)
    if (error.message === 'SSE connection error') return true;

    // 인증 만료/무효 (ProtectedRoute에서 logout 처리됨)
    if (status === 401 || status === 403) return true;

    return false;
  }

  /**
   * 에러 리포트 (내부 메서드)
   */
  private report(partial: Partial<ErrorReport>) {
    // 에러 메시지로 중복 체크
    const errorKey = `${partial.error?.type}:${partial.error?.message?.substring(0, 100)}`;
    const count = this.errorCounts.get(errorKey) || 0;

    if (count >= this.MAX_SAME_ERROR) {
      // 같은 에러가 너무 많이 발생하면 무시
      return;
    }
    this.errorCounts.set(errorKey, count + 1);

    const report: ErrorReport = {
      error: {
        type: partial.error?.type || 'Error',
        code: partial.error?.code,
        message: partial.error?.message || 'Unknown error',
        stack: partial.error?.stack,
        severity: partial.error?.severity || 'medium',
        category: partial.error?.category || 'unhandled'
      },
      source: {
        type: 'frontend',
        url: window.location.href,
        ...partial.source
      },
      context: {
        request_id: this.generateRequestId(),
        browser: navigator.userAgent,
        os: navigator.platform,
        version: APP_VERSION,
        ...partial.context
      }
    };

    // 큐에 추가
    if (this.queue.length < this.MAX_QUEUE_SIZE) {
      this.queue.push(report);
      this.processQueue();
    }
  }

  /**
   * 큐 처리
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    const now = Date.now();
    if (now - this.lastReportTime < this.THROTTLE_MS) {
      // 스로틀링: 잠시 후 다시 시도
      setTimeout(() => this.processQueue(), this.THROTTLE_MS);
      return;
    }

    this.isProcessing = true;
    const report = this.queue.shift()!;

    try {
      await api.post('/api/error-logs', report, { timeout: 5000 });
      this.lastReportTime = Date.now();
    } catch {
      // 에러 리포팅 실패는 무시 (무한 루프 방지)
      console.warn('[ErrorReporter] Failed to send error report');
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        // 다음 에러 처리
        setTimeout(() => this.processQueue(), this.THROTTLE_MS);
      }
    }
  }

  /**
   * 요청 ID 생성
   * 🔒 보안: crypto.randomUUID 사용 (Math.random은 예측 가능)
   */
  private generateRequestId(): string {
    return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * 민감 정보 마스킹
   */
  private sanitizePayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!payload) return undefined;

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk.toLowerCase()))) {
        sanitized[key] = '***MASKED***';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// 싱글톤 인스턴스 export
export const errorReporter = new ErrorReporter();
