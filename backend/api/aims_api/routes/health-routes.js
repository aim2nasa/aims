/**
 * health-routes.js - Health/System 라우트
 *
 * Phase 3: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { VERSION_INFO } = require('../version');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO } = require('../lib/timeUtils');

module.exports = function(db) {
  const router = express.Router();

  /**
   * 헬스체크 API (간단한 ping)
   */
  router.get('/health', async (req, res) => {
    try {
      // MongoDB 연결 상태 확인
      await db.admin().ping();

      res.json({
        success: true,
        message: 'API 서버가 정상적으로 작동 중입니다.',
        timestamp: utcNowISO(),
        database: 'connected',
        version: VERSION_INFO.fullVersion,
        versionInfo: VERSION_INFO
      });
    } catch (error) {
      backendLogger.error('Server', 'Health check 실패 (MongoDB 연결 오류)', error);
      res.status(500).json({
        success: false,
        message: 'API 서버에 문제가 있습니다.',
        error: error.message,
        version: VERSION_INFO.fullVersion
      });
    }
  });

  /**
   * Deep 헬스체크 API (좀비 상태 감지용)
   * - MongoDB ping + 실제 쿼리 수행
   * - Docker HEALTHCHECK에서 사용
   */
  router.get('/health/deep', async (req, res) => {
    const startTime = Date.now();
    const checks = {
      mongodb: { status: 'unknown', latency: 0 },
      fileQuery: { status: 'unknown', latency: 0 },
      timestamp: utcNowISO()
    };

    try {
      // 1. MongoDB 연결 확인 (ping)
      const mongoStart = Date.now();
      await db.admin().ping();
      checks.mongodb = { status: 'ok', latency: Date.now() - mongoStart };

      // 2. 실제 쿼리 수행 (좀비 상태 감지용)
      const queryStart = Date.now();
      await db.collection(COLLECTIONS.FILES).findOne({}, { maxTimeMS: 3000 });
      checks.fileQuery = { status: 'ok', latency: Date.now() - queryStart };

      const totalLatency = Date.now() - startTime;
      res.json({
        status: 'healthy',
        checks,
        totalLatency,
        version: VERSION_INFO.fullVersion
      });
    } catch (error) {
      const totalLatency = Date.now() - startTime;
      backendLogger.error('Server', 'Deep health check 실패', error);
      res.status(503).json({
        status: 'unhealthy',
        checks,
        error: error.message,
        totalLatency,
        version: VERSION_INFO.fullVersion
      });
    }
  });

  /**
   * 시스템 버전 정보 API
   * 각 백엔드 서비스의 /health 엔드포인트를 localhost로 호출하여 버전 정보 수집
   * 개발자 도구에서 전체 시스템 버전 확인용
   */
  router.get('/system/versions', async (req, res) => {
    // 내부 서비스 health 엔드포인트 호출 헬퍼
    const fetchHealth = (port, healthPath) => {
      return new Promise((resolve) => {
        const options = { hostname: 'localhost', port, path: healthPath, method: 'GET', timeout: 2000 };
        const healthReq = http.request(options, (healthRes) => {
          let data = '';
          healthRes.on('data', chunk => data += chunk);
          healthRes.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        });
        healthReq.on('error', () => resolve(null));
        healthReq.on('timeout', () => { healthReq.destroy(); resolve(null); });
        healthReq.end();
      });
    };

    // aims_api 자체 버전 (VERSION 파일 + 환경변수)
    let aimsApiVersion = null;
    try {
      aimsApiVersion = (await fs.readFile(path.join(__dirname, '..', 'VERSION'), 'utf8')).trim();
    } catch {}

    // 다른 서비스들의 health 엔드포인트 병렬 호출
    const [ragHealth, arHealth, pdfProxyHealth, pdfConverterHealth] = await Promise.all([
      fetchHealth(8000, '/health'),  // aims_rag_api
      fetchHealth(8004, '/health'),  // annual_report_api
      fetchHealth(8002, '/health'),  // pdf_proxy
      fetchHealth(8005, '/health'),  // pdf_converter
    ]);

    const services = [
      {
        name: 'aims_api',
        displayName: 'aims_api',
        version: aimsApiVersion,
        gitHash: process.env.GIT_HASH || null,
        status: 'ok'
      },
      {
        name: 'aims_rag_api',
        displayName: 'rag_api',
        version: ragHealth?.versionInfo?.version || null,
        gitHash: ragHealth?.versionInfo?.gitHash || null,
        status: ragHealth ? 'ok' : 'error'
      },
      {
        name: 'annual_report_api',
        displayName: 'ar_api',
        version: arHealth?.versionInfo?.version || null,
        gitHash: arHealth?.versionInfo?.gitHash || null,
        status: arHealth ? 'ok' : 'error'
      },
      {
        name: 'pdf_proxy',
        displayName: 'pdf_proxy',
        version: pdfProxyHealth?.versionInfo?.version || null,
        gitHash: pdfProxyHealth?.versionInfo?.gitHash || null,
        status: pdfProxyHealth ? 'ok' : 'error'
      },
      {
        name: 'pdf_converter',
        displayName: 'pdf_converter',
        version: pdfConverterHealth?.version || null,
        gitHash: null,
        status: pdfConverterHealth ? 'ok' : 'error'
      },
    ];

    res.json({
      success: true,
      timestamp: utcNowISO(),
      services
    });
  });

  return router;
};
