/**
 * AIMS 시스템 로그 API 연동 모듈
 * MCP 서버의 에러를 중앙 시스템 로그로 전송
 */

const SYSTEM_LOG_API_URL = 'http://localhost:3010/api/system-logs';

interface LogData {
  [key: string]: unknown;
}

/**
 * AIMS 시스템 로그 API에 에러 로그 전송
 */
export async function sendErrorLog(
  component: string,
  message: string,
  error?: Error | unknown,
  data?: LogData
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      level: 'error',
      source: {
        type: 'backend',
        component
      },
      message,
      data: data || {}
    };

    if (error) {
      if (error instanceof Error) {
        (payload.data as LogData).error_type = error.name;
        (payload.data as LogData).error_message = error.message;
        (payload.data as LogData).error_stack = error.stack;
      } else {
        (payload.data as LogData).error_message = String(error);
      }
    }

    const response = await fetch(SYSTEM_LOG_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    return response.ok;
  } catch (e) {
    console.error('[systemLogger] 시스템 로그 전송 실패:', e);
    return false;
  }
}

/**
 * AIMS 시스템 로그 API에 경고 로그 전송
 */
export async function sendWarnLog(
  component: string,
  message: string,
  data?: LogData
): Promise<boolean> {
  try {
    const payload = {
      level: 'warn',
      source: {
        type: 'backend',
        component
      },
      message,
      data: data || {}
    };

    const response = await fetch(SYSTEM_LOG_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });

    return response.ok;
  } catch (e) {
    console.error('[systemLogger] 시스템 로그 전송 실패:', e);
    return false;
  }
}
