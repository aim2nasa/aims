/**
 * AIMS 시스템 로그 — aims_analytics DB 직접 기록
 * MCP 서버의 에러/경고를 aims_analytics.error_logs에 직접 기록
 *
 * 스키마: aims_rag_api/analytics_writer.py log_system_event()와 동일
 * @since 2026-04-05 공개 API 호출 → DB 직접 기록 전환
 */

import { MongoClient, Db } from 'mongodb';
import { randomUUID } from 'crypto';

// MongoDB 연결 (aims_analytics DB 전용)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://tars:27017/';
const ANALYTICS_DB = 'aims_analytics';
const ERROR_LOGS_COLLECTION = 'error_logs';

let analyticsClient: MongoClient | null = null;
let analyticsDb: Db | null = null;

/**
 * aims_analytics DB 연결 (지연 초기화, 싱글턴)
 */
async function getAnalyticsDb(): Promise<Db> {
  if (analyticsDb) return analyticsDb;

  analyticsClient = new MongoClient(MONGO_URI);
  await analyticsClient.connect();
  analyticsDb = analyticsClient.db(ANALYTICS_DB);
  return analyticsDb;
}

interface LogData {
  [key: string]: unknown;
}

/**
 * error_logs 컬렉션에 로그 기록
 * 스키마: analytics_writer.py log_system_event()와 동일
 */
async function insertLog(
  level: string,
  component: string,
  message: string,
  error?: Error | unknown,
  data?: LogData
): Promise<boolean> {
  try {
    const db = await getAnalyticsDb();

    // error 객체 구성 (error 레벨일 때만)
    let errorObj: Record<string, unknown> | null = null;
    if (level === 'error') {
      if (error instanceof Error) {
        errorObj = {
          type: error.name,
          code: null,
          message: error.message,
          stack: error.stack || null,
          severity: 'high',
          category: 'runtime'
        };
      } else if (error) {
        errorObj = {
          type: 'Error',
          code: null,
          message: String(error),
          stack: null,
          severity: 'high',
          category: 'runtime'
        };
      } else {
        errorObj = {
          type: 'Error',
          code: null,
          message: message,
          stack: null,
          severity: 'high',
          category: 'runtime'
        };
      }
    }

    const logEntry = {
      // LEVEL
      level,
      // MESSAGE
      message,
      // DATA
      data: data || {},
      // WHO (서버 프로세스이므로 actor 없음)
      actor: {
        user_id: null,
        name: null,
        email: null,
        role: 'anonymous',
        ip_address: null,
        user_agent: null
      },
      // WHEN
      timestamp: new Date(),
      // WHERE
      source: {
        type: 'backend',
        endpoint: null,
        method: null,
        component,
        url: null,
        file: null,
        line: null,
        column: null
      },
      // WHAT
      error: errorObj,
      // CONTEXT
      context: {
        request_id: randomUUID(),
        session_id: null,
        browser: null,
        os: null,
        version: null,
        payload: null,
        response_status: null,
        component_stack: null
      },
      // META
      meta: {
        resolved: false,
        resolved_by: null,
        resolved_at: null,
        notes: null
      },
      // TTL (30일 자동 삭제)
      ttl_expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };

    await db.collection(ERROR_LOGS_COLLECTION).insertOne(logEntry);
    return true;
  } catch (e) {
    console.error('[systemLogger] aims_analytics 로그 기록 실패:', e);
    return false;
  }
}

/**
 * 에러 로그 기록
 */
export async function sendErrorLog(
  component: string,
  message: string,
  error?: Error | unknown,
  data?: LogData
): Promise<boolean> {
  return insertLog('error', component, message, error, data);
}

/**
 * 경고 로그 기록
 */
export async function sendWarnLog(
  component: string,
  message: string,
  data?: LogData
): Promise<boolean> {
  return insertLog('warn', component, message, undefined, data);
}

/**
 * analytics DB 연결 종료
 */
export async function closeAnalyticsDb(): Promise<void> {
  if (analyticsClient) {
    await analyticsClient.close();
    analyticsClient = null;
    analyticsDb = null;
  }
}
