/**
 * 주기적 모니터링 및 상태 변경 감지 모듈
 */

import { getDB } from './db';
import { checkHttpHealth, checkTcpHealth, HealthCheckResult } from './healthChecker';
import { MONITORED_SERVICES, ServiceConfig, config } from './config';

export interface ServiceStatus {
  service: string;
  port: number;
  description: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error: string | null;
  checkedAt: string;
}

export interface HealthEvent {
  service: string;
  port: number;
  description: string;
  eventType: 'down' | 'recovered';
  previousStatus: string;
  currentStatus: string;
  error: string | null;
  responseTime: number;
  timestamp: Date;
  timestampISO: string;
}

// 이전 상태 캐시 (상태 변경 감지용)
const previousStatus: Record<string, string> = {};

// 현재 상태 캐시 (API 응답용)
let currentResults: ServiceStatus[] = [];

// 모니터 시작 시간
let monitorStartTime: Date | null = null;

// 마지막 체크 시간
let lastCheckTime: Date | null = null;

/**
 * 단일 서비스 상태 체크
 */
async function checkService(svc: ServiceConfig): Promise<ServiceStatus> {
  let result: HealthCheckResult;

  if (svc.healthEndpoint) {
    result = await checkHttpHealth(svc.port, svc.healthEndpoint, svc.timeout);
  } else {
    result = await checkTcpHealth(svc.port);
  }

  return {
    service: svc.service,
    port: svc.port,
    description: svc.description,
    status: result.healthy ? 'healthy' : 'unhealthy',
    responseTime: result.responseTime,
    error: result.error,
    checkedAt: new Date().toISOString()
  };
}

/**
 * 모든 서비스 상태 체크 (병렬 실행)
 */
async function checkAllServices(): Promise<ServiceStatus[]> {
  const results = await Promise.all(
    MONITORED_SERVICES.map(svc => checkService(svc))
  );
  return results;
}

/**
 * 상태 변경 감지 및 DB 로깅
 */
async function detectAndLogChanges(results: ServiceStatus[]): Promise<void> {
  const db = getDB();
  const collection = db.collection<HealthEvent>(config.collectionName);
  const now = new Date();
  const eventsToInsert: HealthEvent[] = [];

  for (const result of results) {
    const prevStatus = previousStatus[result.service];
    const currentStatus = result.status;

    // 상태 변경 감지 (첫 체크 시에는 이벤트 생성 안함)
    if (prevStatus !== undefined && prevStatus !== currentStatus) {
      const eventType = currentStatus === 'healthy' ? 'recovered' : 'down';

      const event: HealthEvent = {
        service: result.service,
        port: result.port,
        description: result.description,
        eventType,
        previousStatus: prevStatus,
        currentStatus,
        error: result.error,
        responseTime: result.responseTime,
        timestamp: now,
        timestampISO: now.toISOString()
      };

      eventsToInsert.push(event);

      // 콘솔 로그
      if (eventType === 'down') {
        console.error(`[HealthMonitor] ❌ ${result.service} DOWN - ${result.error}`);
      } else {
        console.log(`[HealthMonitor] ✅ ${result.service} RECOVERED`);
      }
    }

    // 상태 캐시 업데이트
    previousStatus[result.service] = currentStatus;
  }

  // DB에 이벤트 저장
  if (eventsToInsert.length > 0) {
    try {
      await collection.insertMany(eventsToInsert);
      console.log(`[HealthMonitor] ${eventsToInsert.length}건 상태 변경 기록됨`);
    } catch (err) {
      console.error('[HealthMonitor] DB 저장 실패:', err);
    }
  }
}

/**
 * 헬스 체크 1회 실행
 */
export async function runHealthCheck(): Promise<ServiceStatus[]> {
  try {
    const results = await checkAllServices();
    await detectAndLogChanges(results);

    // 현재 상태 캐시 업데이트
    currentResults = results;
    lastCheckTime = new Date();

    return results;
  } catch (err) {
    console.error('[HealthMonitor] 헬스 체크 실패:', err);
    return currentResults;  // 이전 결과 반환
  }
}

/**
 * 주기적 모니터링 시작
 */
export function startMonitoring(): NodeJS.Timeout {
  const interval = config.checkInterval;

  console.log(`[HealthMonitor] 모니터링 시작 (${interval / 1000}초 간격)`);
  monitorStartTime = new Date();

  // 초기 체크 (즉시 실행)
  runHealthCheck().then(() => {
    console.log('[HealthMonitor] 초기 상태 캐시됨');
  });

  // 주기적 체크
  return setInterval(runHealthCheck, interval);
}

/**
 * 현재 상태 조회 (캐시된 데이터)
 */
export function getCurrentStatus(): {
  services: ServiceStatus[];
  summary: { healthy: number; unhealthy: number; total: number };
  monitorUptime: number | null;
  lastCheck: string | null;
} {
  const healthyCount = currentResults.filter(s => s.status === 'healthy').length;
  const unhealthyCount = currentResults.filter(s => s.status === 'unhealthy').length;

  return {
    services: currentResults,
    summary: {
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      total: currentResults.length
    },
    monitorUptime: monitorStartTime
      ? Math.floor((Date.now() - monitorStartTime.getTime()) / 1000)
      : null,
    lastCheck: lastCheckTime?.toISOString() || null
  };
}

/**
 * 이전 상태 캐시 조회 (디버깅용)
 */
export function getPreviousStatus(): Record<string, string> {
  return { ...previousStatus };
}
