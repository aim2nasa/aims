/**
 * AIMS Health Monitor - 독립 헬스 모니터링 서비스
 *
 * aims_api와 완전히 분리된 독립 프로세스로 실행됩니다.
 * aims_api가 죽어도 이 서비스는 계속 동작하여 장애를 감지합니다.
 */

import express from 'express';
import cors from 'cors';
import { connectDB, closeDB } from './db';
import { startMonitoring } from './monitor';
import { healthRoutes } from './api/routes';
import { config } from './config';

const app = express();

// CORS 설정 (Admin 프론트엔드 허용)
app.use(cors({
  origin: [
    'https://admin.aims.giize.com',
    'https://aims.giize.com',
    'http://localhost:5178',
    'http://localhost:5179'
  ],
  credentials: true
}));

app.use(express.json());

// 자체 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'aims_health_monitor',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API 라우트 (/api/health/*, /api/ports)
app.use('/api', healthRoutes);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    path: req.path
  });
});

// 에러 핸들러
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[HealthMonitor] 에러:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * 서비스 시작
 */
async function main() {
  try {
    console.log('==========================================');
    console.log('  AIMS Health Monitor');
    console.log('  독립 헬스 모니터링 서비스');
    console.log('==========================================');

    // MongoDB 연결
    await connectDB();

    // 모니터링 시작
    monitorInterval = startMonitoring();

    // Express 서버 시작
    app.listen(config.port, () => {
      console.log(`[HealthMonitor] 서버 시작: http://localhost:${config.port}`);
      console.log(`[HealthMonitor] 헬스체크: http://localhost:${config.port}/health`);
      console.log(`[HealthMonitor] 서비스 상태: http://localhost:${config.port}/api/health/current`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('[HealthMonitor] 시작 실패:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[HealthMonitor] SIGTERM 수신, 종료 중...');
  if (monitorInterval) clearInterval(monitorInterval);
  await closeDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[HealthMonitor] SIGINT 수신, 종료 중...');
  if (monitorInterval) clearInterval(monitorInterval);
  await closeDB();
  process.exit(0);
});

// 시작
main();
