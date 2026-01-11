/**
 * Express 라우터
 */

import { Router } from 'express';
import {
  getHealthCurrent,
  forceHealthCheck,
  getHealthHistory,
  clearHealthHistory,
  getHealthStats,
  getPorts
} from './handlers';

const router = Router();

// 헬스 관련 API
router.get('/health/current', getHealthCurrent);
router.get('/health/check', forceHealthCheck);
router.get('/health/history', getHealthHistory);
router.delete('/health/history', clearHealthHistory);
router.get('/health/stats', getHealthStats);

// 포트 현황 API
router.get('/ports', getPorts);

export { router as healthRoutes };
