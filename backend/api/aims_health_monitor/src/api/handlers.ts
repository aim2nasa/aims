/**
 * API 핸들러
 */

import { Request, Response } from 'express';
import { getDB } from '../db';
import { getCurrentStatus, runHealthCheck, HealthEvent } from '../monitor';
import { MONITORED_SERVICES, config } from '../config';

/**
 * GET /api/health/current
 * 모든 서비스 현재 상태 조회
 */
export async function getHealthCurrent(req: Request, res: Response): Promise<void> {
  try {
    const status = getCurrentStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('[API] getHealthCurrent 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/health/check
 * 즉시 헬스체크 실행 (강제 새로고침)
 */
export async function forceHealthCheck(req: Request, res: Response): Promise<void> {
  try {
    await runHealthCheck();
    const status = getCurrentStatus();

    res.json({
      success: true,
      data: status,
      message: '헬스체크 완료'
    });
  } catch (error) {
    console.error('[API] forceHealthCheck 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/health/history
 * 상태 변경 이력 조회
 */
export async function getHealthHistory(req: Request, res: Response): Promise<void> {
  try {
    const {
      service,
      eventType,
      limit = '100',
      skip = '0'
    } = req.query;

    const db = getDB();
    const collection = db.collection<HealthEvent>(config.collectionName);

    // 쿼리 빌드
    const query: Record<string, unknown> = {};
    if (service) query.service = service;
    if (eventType) query.eventType = eventType;

    const [logs, totalCount] = await Promise.all([
      collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip(parseInt(skip as string))
        .limit(parseInt(limit as string))
        .toArray(),
      collection.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: logs,
      totalCount
    });
  } catch (error) {
    console.error('[API] getHealthHistory 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * DELETE /api/health/history
 * 상태 변경 이력 삭제
 */
export async function clearHealthHistory(req: Request, res: Response): Promise<void> {
  try {
    const db = getDB();
    const collection = db.collection(config.collectionName);

    const result = await collection.deleteMany({});

    console.log(`[HealthMonitor] ${result.deletedCount}건 이력 삭제됨`);

    res.json({
      success: true,
      message: '이력이 삭제되었습니다',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[API] clearHealthHistory 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/health/stats
 * 서비스별 다운타임 통계
 */
export async function getHealthStats(req: Request, res: Response): Promise<void> {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const db = getDB();
    const collection = db.collection(config.collectionName);

    const stats = await collection.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$service',
          downCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'down'] }, 1, 0] }
          },
          recoveryCount: {
            $sum: { $cond: [{ $eq: ['$eventType', 'recovered'] }, 1, 0] }
          },
          lastEvent: { $max: '$timestamp' }
        }
      },
      {
        $sort: { downCount: -1 }
      }
    ]).toArray();

    res.json({
      success: true,
      data: stats,
      period: `${daysNum}일`
    });
  } catch (error) {
    console.error('[API] getHealthStats 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/ports
 * 포트 현황 조회
 */
export async function getPorts(req: Request, res: Response): Promise<void> {
  try {
    const status = getCurrentStatus();
    const now = new Date().toISOString();

    const ports = MONITORED_SERVICES.map(svc => {
      const serviceStatus = status.services.find(s => s.service === svc.service);

      return {
        port: svc.port,
        service: svc.service,
        description: svc.description,
        status: serviceStatus?.status === 'healthy' ? 'listening' : 'closed',
        responseTime: serviceStatus?.responseTime || null,
        error: serviceStatus?.error || null,
        checkedAt: serviceStatus?.checkedAt || now
      };
    });

    res.json({
      success: true,
      data: ports
    });
  } catch (error) {
    console.error('[API] getPorts 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
