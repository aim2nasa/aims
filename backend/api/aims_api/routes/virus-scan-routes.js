/**
 * 바이러스 스캔 라우트 - 관리자용 바이러스 검사 관리 API
 * @since 2025-12-30
 *
 * yuri(RPi5) 스캔 서비스와 통신하여 바이러스 검사 수행
 *
 * 주요 기능:
 * - 스캔 서비스 상태 확인
 * - 스캔 통계 조회
 * - 스캔 설정 관리
 * - 감염 파일 관리
 * - SSE 실시간 알림
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const backendLogger = require('../lib/backendLogger');
const sseBroadcast = require('../lib/sseBroadcast');

// yuri 스캔 서비스 URL
const VIRUS_SCAN_SERVICE_URL = process.env.VIRUS_SCAN_SERVICE_URL || 'http://100.120.196.45:8100';
const VIRUS_SCAN_SECRET = process.env.VIRUS_SCAN_SECRET || 'aims-virus-scan-secret-key';

// 컬렉션 이름
const COLLECTIONS = {
  FILES: 'files',
  PERSONAL_FILES: 'personal_files',
  INQUIRIES: 'inquiries',
  VIRUS_SCAN_LOGS: 'virus_scan_logs',
  VIRUS_SCAN_SETTINGS: 'virus_scan_settings',
  USERS: 'users',
  CUSTOMERS: 'customers'
};

// SSE 클라이언트 (바이러스 스캔 전용)
const virusScanSSEClients = new Set();

/**
 * SSE 이벤트 전송 헬퍼
 */
function sendVirusScanSSE(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('[VirusScan-SSE] 전송 실패:', e.message);
  }
}

/**
 * 바이러스 스캔 이벤트 브로드캐스트
 */
function broadcastVirusScanEvent(event, data) {
  console.log(`[VirusScan-SSE] 브로드캐스트: ${event}, 클라이언트: ${virusScanSSEClients.size}`);
  virusScanSSEClients.forEach(res => {
    sendVirusScanSSE(res, event, data);
  });
}

/**
 * 라우트 설정 함수
 */
module.exports = function(db, authenticateJWT, requireRole, authenticateJWTWithQuery) {

  // ==================== SSE 스트림 ====================

  /**
   * GET /api/admin/virus-scan/stream
   * SSE 실시간 바이러스 스캔 알림
   * 인증: ?token=xxx 쿼리 파라미터 (EventSource는 헤더 설정 불가)
   */
  router.get('/admin/virus-scan/stream', authenticateJWTWithQuery, requireRole('admin'), (req, res) => {
    console.log('[VirusScan-SSE] 클라이언트 연결');

    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // 클라이언트 추가
    virusScanSSEClients.add(res);

    // 초기 상태 전송
    sendVirusScanSSE(res, 'connected', { message: 'Connected to virus scan stream' });

    // 연결 해제 처리
    req.on('close', () => {
      virusScanSSEClients.delete(res);
      console.log('[VirusScan-SSE] 클라이언트 연결 해제');
    });

    // Keep-alive
    const pingInterval = setInterval(() => {
      sendVirusScanSSE(res, 'ping', { time: new Date().toISOString() });
    }, 30000);

    req.on('close', () => clearInterval(pingInterval));
  });

  // ==================== 상태 및 통계 ====================

  /**
   * GET /api/admin/virus-scan/status
   * yuri 스캔 서비스 상태 확인 (헬스 + 시스템 정보)
   */
  router.get('/admin/virus-scan/status', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 헬스체크와 시스템 정보 동시 요청
      const [healthRes, systemRes] = await Promise.all([
        axios.get(`${VIRUS_SCAN_SERVICE_URL}/health`, { timeout: 5000 }),
        axios.get(`${VIRUS_SCAN_SERVICE_URL}/system`, { timeout: 5000 }).catch(() => null)
      ]);

      res.json({
        success: true,
        data: {
          serviceUrl: VIRUS_SCAN_SERVICE_URL,
          ...healthRes.data,
          system: systemRes?.data || null
        }
      });
    } catch (error) {
      console.error('[VirusScan] 서비스 상태 확인 실패:', error.message);
      res.json({
        success: true,
        data: {
          serviceUrl: VIRUS_SCAN_SERVICE_URL,
          status: 'offline',
          clamd_running: false,
          error: error.message,
          system: null
        }
      });
    }
  });

  /**
   * GET /api/admin/virus-scan/stats
   * 스캔 통계 조회
   */
  router.get('/admin/virus-scan/stats', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 각 컬렉션별 스캔 상태 집계
      const filesStats = await db.collection(COLLECTIONS.FILES).aggregate([
        {
          $group: {
            _id: '$virusScan.status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const personalFilesStats = await db.collection(COLLECTIONS.PERSONAL_FILES).aggregate([
        { $match: { type: 'file' } },
        {
          $group: {
            _id: '$virusScan.status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      // 통계 정리
      const statusCounts = {
        pending: 0,
        scanning: 0,
        clean: 0,
        infected: 0,
        deleted: 0,
        error: 0,
        notScanned: 0
      };

      [...filesStats, ...personalFilesStats].forEach(stat => {
        if (stat._id === null || stat._id === undefined) {
          statusCounts.notScanned += stat.count;
        } else if (statusCounts[stat._id] !== undefined) {
          statusCounts[stat._id] += stat.count;
        }
      });

      // 최근 감염 파일
      const recentInfected = await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS)
        .find({ 'result.status': 'infected' })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();

      // 오늘 스캔 수
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayScans = await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS)
        .countDocuments({ createdAt: { $gte: today } });

      res.json({
        success: true,
        data: {
          statusCounts,
          todayScans,
          recentInfected,
          totalFiles: statusCounts.clean + statusCounts.infected + statusCounts.deleted +
                      statusCounts.pending + statusCounts.scanning + statusCounts.notScanned
        }
      });
    } catch (error) {
      console.error('[VirusScan] 통계 조회 실패:', error);
      backendLogger.error('VirusScan', '통계 조회 실패', error);
      res.status(500).json({
        success: false,
        error: '통계 조회에 실패했습니다.'
      });
    }
  });

  // ==================== 설정 관리 ====================

  /**
   * GET /api/admin/virus-scan/settings
   * 스캔 설정 조회
   */
  router.get('/admin/virus-scan/settings', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      let settings = await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS)
        .findOne({ _id: 'virus_scan_config' });

      if (!settings) {
        // 기본 설정 생성
        settings = {
          _id: 'virus_scan_config',
          enabled: true,
          realtimeScan: {
            enabled: true,
            collections: ['files', 'personal_files', 'inquiries']
          },
          scheduledScan: {
            enabled: true,
            cronExpression: '0 4 * * *',
            lastRunAt: null,
            nextRunAt: null
          },
          freshclam: {
            autoUpdate: true,
            lastUpdateAt: null,
            updateSchedule: '0 3 * * *'
          },
          onInfectedAction: 'delete',
          notifyAdmin: true,
          logRetentionDays: 30,  // 스캔 로그 보관 기간 (일) - 기본 30일
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS).insertOne(settings);
      }

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('[VirusScan] 설정 조회 실패:', error);
      res.status(500).json({
        success: false,
        error: '설정 조회에 실패했습니다.'
      });
    }
  });

  /**
   * PUT /api/admin/virus-scan/settings
   * 스캔 설정 수정
   */
  router.put('/admin/virus-scan/settings', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const updates = req.body;

      // 허용된 필드만 업데이트
      const allowedFields = [
        'enabled',
        'realtimeScan',
        'scheduledScan',
        'freshclam',
        'onInfectedAction',
        'notifyAdmin',
        'logRetentionDays'
      ];

      const updateData = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }
      updateData.updatedAt = new Date();
      updateData.updatedBy = req.user?.id;

      await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS).updateOne(
        { _id: 'virus_scan_config' },
        { $set: updateData },
        { upsert: true }
      );

      const settings = await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS)
        .findOne({ _id: 'virus_scan_config' });

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('[VirusScan] 설정 수정 실패:', error);
      res.status(500).json({
        success: false,
        error: '설정 수정에 실패했습니다.'
      });
    }
  });

  // ==================== 스캔 로그 ====================

  /**
   * GET /api/admin/virus-scan/logs
   * 스캔 로그 목록 조회
   */
  router.get('/admin/virus-scan/logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        status,
        scanType
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const query = {};

      if (status) {
        query['result.status'] = status;
      }
      if (scanType) {
        query.scanType = scanType;
      }

      const [logs, total] = await Promise.all([
        db.collection(COLLECTIONS.VIRUS_SCAN_LOGS)
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        db.collection(COLLECTIONS.VIRUS_SCAN_LOGS).countDocuments(query)
      ]);

      // 각 로그의 documentId로 원본 파일명, 사용자, 고객 정보 조회
      const { ObjectId } = require('mongodb');
      const logsWithDetails = await Promise.all(
        logs.map(async (log) => {
          if (!log.documentId) return log;

          try {
            const docId = new ObjectId(log.documentId);

            // files 또는 personal_files에서 조회
            const collection = log.collectionName === 'personal_files'
              ? COLLECTIONS.PERSONAL_FILES
              : COLLECTIONS.FILES;

            const file = await db.collection(collection).findOne(
              { _id: docId },
              { projection: { 'upload.originalName': 1, filename: 1, name: 1, ownerId: 1, userId: 1, customerId: 1 } }
            );

            if (file) {
              const result = {
                ...log,
                originalName: file.upload?.originalName || file.filename || file.name || null,
                ownerId: file.ownerId || file.userId || null,
                customerId: file.customerId || null,
                ownerName: null,
                customerName: null
              };

              // 사용자(설계사) 이름 조회
              if (result.ownerId) {
                try {
                  const ownerId = typeof result.ownerId === 'string' ? new ObjectId(result.ownerId) : result.ownerId;
                  const user = await db.collection(COLLECTIONS.USERS).findOne(
                    { _id: ownerId },
                    { projection: { name: 1 } }
                  );
                  if (user) result.ownerName = user.name;
                } catch (e) { /* ignore */ }
              }

              // 고객 이름 조회
              if (result.customerId) {
                try {
                  const customerId = typeof result.customerId === 'string' ? new ObjectId(result.customerId) : result.customerId;
                  const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne(
                    { _id: customerId },
                    { projection: { 'personal_info.name': 1 } }
                  );
                  if (customer) result.customerName = customer.personal_info?.name;
                } catch (e) { /* ignore */ }
              }

              return result;
            }
          } catch (err) {
            // ObjectId 변환 실패 등 무시
          }
          return log;
        })
      );

      res.json({
        success: true,
        data: logsWithDetails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('[VirusScan] 로그 조회 실패:', error);
      res.status(500).json({
        success: false,
        error: '로그 조회에 실패했습니다.'
      });
    }
  });

  // ==================== 감염 파일 관리 ====================

  /**
   * GET /api/admin/virus-scan/infected
   * 감염/삭제된 파일 목록 조회
   */
  router.get('/admin/virus-scan/infected', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { page = 1, limit = 50, includeDeleted = 'true' } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const statusFilter = includeDeleted === 'true'
        ? { $in: ['infected', 'deleted'] }
        : 'infected';

      // files 컬렉션에서 조회
      const files = await db.collection(COLLECTIONS.FILES)
        .find({ 'virusScan.status': statusFilter })
        .sort({ 'virusScan.scannedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // personal_files 컬렉션에서 조회
      const personalFiles = await db.collection(COLLECTIONS.PERSONAL_FILES)
        .find({ 'virusScan.status': statusFilter, type: 'file' })
        .sort({ 'virusScan.scannedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // 결과 병합 및 정렬
      const allFiles = [...files.map(f => ({ ...f, source: 'files' })),
                        ...personalFiles.map(f => ({ ...f, source: 'personal_files' }))]
        .sort((a, b) => {
          const dateA = a.virusScan?.scannedAt || new Date(0);
          const dateB = b.virusScan?.scannedAt || new Date(0);
          return new Date(dateB) - new Date(dateA);
        })
        .slice(0, parseInt(limit));

      const total = await db.collection(COLLECTIONS.FILES)
        .countDocuments({ 'virusScan.status': statusFilter }) +
        await db.collection(COLLECTIONS.PERSONAL_FILES)
        .countDocuments({ 'virusScan.status': statusFilter, type: 'file' });

      res.json({
        success: true,
        data: allFiles,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('[VirusScan] 감염 파일 조회 실패:', error);
      res.status(500).json({
        success: false,
        error: '감염 파일 조회에 실패했습니다.'
      });
    }
  });

  /**
   * DELETE /api/admin/virus-scan/infected/:id
   * 감염 파일 삭제
   */
  router.delete('/admin/virus-scan/infected/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { source = 'files' } = req.query;

      const collection = source === 'personal_files'
        ? COLLECTIONS.PERSONAL_FILES
        : COLLECTIONS.FILES;

      const file = await db.collection(collection).findOne({
        _id: new ObjectId(id),
        'virusScan.status': 'infected'
      });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: '감염 파일을 찾을 수 없습니다.'
        });
      }

      // 파일 시스템에서 삭제
      const filePath = file.upload?.destPath || file.storagePath;
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[VirusScan] 파일 삭제됨: ${filePath}`);
      }

      // DB 상태 업데이트
      await db.collection(collection).updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            'virusScan.status': 'deleted',
            'virusScan.deletedAt': new Date(),
            'virusScan.deletedBy': `admin:${req.user?.id}`,
            'virusScan.deletedReason': '바이러스 감염으로 삭제됨'
          }
        }
      );

      // 로그 기록
      await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS).insertOne({
        scanType: 'manual_delete',
        collectionName: collection,
        documentId: new ObjectId(id),
        filePath,
        userId: file.ownerId || file.userId,
        result: {
          status: 'deleted',
          threatName: file.virusScan?.threatName
        },
        action: {
          type: 'deleted',
          performedAt: new Date(),
          performedBy: `admin:${req.user?.id}`
        },
        createdAt: new Date()
      });

      // SSE 알림
      broadcastVirusScanEvent('virus-file-deleted', {
        documentId: id,
        source: collection,
        threatName: file.virusScan?.threatName,
        deletedBy: req.user?.name || req.user?.id
      });

      res.json({
        success: true,
        message: '감염 파일이 삭제되었습니다.'
      });
    } catch (error) {
      console.error('[VirusScan] 파일 삭제 실패:', error);
      res.status(500).json({
        success: false,
        error: '파일 삭제에 실패했습니다.'
      });
    }
  });

  // ==================== 수동 스캔 ====================

  /**
   * POST /api/admin/virus-scan/scan-file/:id
   * 단일 파일 수동 스캔 요청
   */
  router.post('/admin/virus-scan/scan-file/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { source = 'files' } = req.query;

      const collection = source === 'personal_files'
        ? COLLECTIONS.PERSONAL_FILES
        : COLLECTIONS.FILES;

      const file = await db.collection(collection).findOne({ _id: new ObjectId(id) });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: '파일을 찾을 수 없습니다.'
        });
      }

      const filePath = file.upload?.destPath || file.storagePath;
      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: '파일 경로를 찾을 수 없습니다.'
        });
      }

      // 스캔 상태 업데이트
      await db.collection(collection).updateOne(
        { _id: new ObjectId(id) },
        { $set: { 'virusScan.status': 'scanning' } }
      );

      // yuri에 스캔 요청
      try {
        await axios.post(`${VIRUS_SCAN_SERVICE_URL}/scan`, {
          file_path: filePath,
          document_id: id,
          collection_name: collection,
          user_id: file.ownerId || file.userId
        }, {
          headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
          timeout: 10000
        });

        res.json({
          success: true,
          message: '스캔 요청이 전송되었습니다.'
        });
      } catch (scanError) {
        // 스캔 서비스 오류 시 상태 롤백
        await db.collection(collection).updateOne(
          { _id: new ObjectId(id) },
          { $set: { 'virusScan.status': 'error', 'virusScan.error': scanError.message } }
        );

        throw scanError;
      }
    } catch (error) {
      console.error('[VirusScan] 스캔 요청 실패:', error);
      res.status(500).json({
        success: false,
        error: '스캔 요청에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/admin/virus-scan/scan-all
   * 전체 파일 재스캔 시작 (이미 스캔된 파일 포함)
   * DB에서 모든 파일을 조회하여 yuri에 배치 스캔 요청
   */
  router.post('/admin/virus-scan/scan-all', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 모든 파일 조회 (files 컬렉션)
      const allFiles = await db.collection(COLLECTIONS.FILES)
        .find({})
        .project({ _id: 1, 'upload.destPath': 1, 'upload.originalName': 1, storagePath: 1, ownerId: 1, userId: 1, customerId: 1 })
        .toArray();

      // 모든 파일 조회 (personal_files 컬렉션)
      const allPersonalFiles = await db.collection(COLLECTIONS.PERSONAL_FILES)
        .find({ type: 'file' })
        .project({ _id: 1, storagePath: 1, name: 1, ownerId: 1, userId: 1 })
        .toArray();

      const filesToScan = [];

      // files 컬렉션 파일들
      for (const file of allFiles) {
        const filePath = file.upload?.destPath || file.storagePath;
        if (filePath) {
          filesToScan.push({
            file_path: filePath,
            document_id: file._id.toString(),
            collection_name: 'files',
            user_id: (file.ownerId || file.userId)?.toString() || null
          });
        }
      }

      // personal_files 컬렉션 파일들
      for (const file of allPersonalFiles) {
        if (file.storagePath) {
          filesToScan.push({
            file_path: file.storagePath,
            document_id: file._id.toString(),
            collection_name: 'personal_files',
            user_id: (file.ownerId || file.userId)?.toString() || null
          });
        }
      }

      if (filesToScan.length === 0) {
        return res.json({
          success: true,
          message: '스캔할 파일이 없습니다.',
          data: { file_count: 0 }
        });
      }

      // DB에서 상태를 scanning으로 업데이트
      const fileIds = filesToScan.filter(f => f.collection_name === 'files').map(f => new ObjectId(f.document_id));
      const personalFileIds = filesToScan.filter(f => f.collection_name === 'personal_files').map(f => new ObjectId(f.document_id));

      if (fileIds.length > 0) {
        await db.collection(COLLECTIONS.FILES).updateMany(
          { _id: { $in: fileIds } },
          { $set: { 'virusScan.status': 'scanning', 'virusScan.scannedAt': new Date() } }
        );
      }
      if (personalFileIds.length > 0) {
        await db.collection(COLLECTIONS.PERSONAL_FILES).updateMany(
          { _id: { $in: personalFileIds } },
          { $set: { 'virusScan.status': 'scanning', 'virusScan.scannedAt': new Date() } }
        );
      }

      console.log(`[VirusScan] 전체 재스캔 시작: ${filesToScan.length}개 파일`);

      // yuri에 배치 스캔 요청 (비동기)
      axios.post(`${VIRUS_SCAN_SERVICE_URL}/scan/batch`, {
        files: filesToScan
      }, {
        headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
        timeout: 30000
      }).catch(err => {
        console.error('[VirusScan] 배치 스캔 요청 실패:', err.message);
      });

      // SSE로 스캔 시작 브로드캐스트
      broadcastVirusScanEvent('virus-scan-progress', {
        is_running: true,
        totalFiles: filesToScan.length,
        scannedFiles: 0,
        infectedFiles: 0
      });

      res.json({
        success: true,
        message: `${filesToScan.length}개 파일 재스캔이 시작되었습니다.`,
        data: { file_count: filesToScan.length }
      });
    } catch (error) {
      console.error('[VirusScan] 전체 재스캔 시작 실패:', error);
      res.status(500).json({
        success: false,
        error: '전체 재스캔 시작에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * POST /api/admin/virus-scan/scan-unscanned
   * 미스캔 파일만 스캔 시작
   * DB에서 virusScan.status가 없는 파일들만 선별하여 스캔
   */
  router.post('/admin/virus-scan/scan-unscanned', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      // 미스캔 파일 조회 (virusScan.status가 없거나 pending인 파일)
      const unscannedQuery = {
        $or: [
          { 'virusScan.status': { $exists: false } },
          { 'virusScan.status': null },
          { 'virusScan.status': 'pending' }
        ]
      };

      // files 컬렉션에서 미스캔 파일 조회
      const unscannedFiles = await db.collection(COLLECTIONS.FILES)
        .find(unscannedQuery)
        .project({ _id: 1, 'upload.destPath': 1, storagePath: 1, ownerId: 1, userId: 1 })
        .toArray();

      // personal_files 컬렉션에서 미스캔 파일 조회
      const unscannedPersonalFiles = await db.collection(COLLECTIONS.PERSONAL_FILES)
        .find({ ...unscannedQuery, type: 'file' })
        .project({ _id: 1, storagePath: 1, ownerId: 1, userId: 1 })
        .toArray();

      const filesToScan = [];

      // files 컬렉션 파일들
      for (const file of unscannedFiles) {
        const filePath = file.upload?.destPath || file.storagePath;
        if (filePath) {
          filesToScan.push({
            file_path: filePath,
            document_id: file._id.toString(),
            collection_name: 'files',
            user_id: file.ownerId || file.userId
          });
        }
      }

      // personal_files 컬렉션 파일들
      for (const file of unscannedPersonalFiles) {
        if (file.storagePath) {
          filesToScan.push({
            file_path: file.storagePath,
            document_id: file._id.toString(),
            collection_name: 'personal_files',
            user_id: file.ownerId || file.userId
          });
        }
      }

      if (filesToScan.length === 0) {
        return res.json({
          success: true,
          message: '미스캔 파일이 없습니다.',
          data: { file_count: 0 }
        });
      }

      console.log(`[VirusScan] 미스캔 파일 ${filesToScan.length}개 스캔 시작`);

      // DB 상태를 scanning으로 업데이트
      const fileIds = unscannedFiles.map(f => f._id);
      const personalFileIds = unscannedPersonalFiles.map(f => f._id);

      if (fileIds.length > 0) {
        await db.collection(COLLECTIONS.FILES).updateMany(
          { _id: { $in: fileIds } },
          { $set: { 'virusScan.status': 'scanning' } }
        );
      }

      if (personalFileIds.length > 0) {
        await db.collection(COLLECTIONS.PERSONAL_FILES).updateMany(
          { _id: { $in: personalFileIds } },
          { $set: { 'virusScan.status': 'scanning' } }
        );
      }

      // SSE로 스캔 시작 알림
      broadcastVirusScanEvent('virus-scan-progress', {
        isComplete: false,
        totalFiles: filesToScan.length,
        scannedFiles: 0,
        infectedFiles: 0
      });

      // yuri에 배치 스캔 요청
      const response = await axios.post(`${VIRUS_SCAN_SERVICE_URL}/scan/batch`, {
        files: filesToScan
      }, {
        headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
        timeout: 10000
      });

      res.json({
        success: true,
        message: `미스캔 파일 ${filesToScan.length}개 스캔이 시작되었습니다.`,
        data: {
          file_count: filesToScan.length,
          ...response.data
        }
      });
    } catch (error) {
      console.error('[VirusScan] 미스캔 스캔 시작 실패:', error);
      res.status(500).json({
        success: false,
        error: '미스캔 스캔 시작에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/virus-scan/scan-progress
   * 전체 스캔 진행률 조회
   */
  router.get('/admin/virus-scan/scan-progress', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const response = await axios.get(`${VIRUS_SCAN_SERVICE_URL}/scan/progress`, {
        timeout: 5000
      });

      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      res.json({
        success: true,
        data: {
          is_running: false,
          error: error.message
        }
      });
    }
  });

  /**
   * POST /api/admin/virus-scan/scan-stop
   * 전체 스캔 중지
   */
  router.post('/admin/virus-scan/scan-stop', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const response = await axios.post(`${VIRUS_SCAN_SERVICE_URL}/scan/stop`, {}, {
        headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
        timeout: 5000
      });

      res.json({
        success: true,
        message: '스캔이 중지되었습니다.',
        data: response.data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '스캔 중지에 실패했습니다.',
        details: error.message
      });
    }
  });

  // ==================== yuri에서 결과 수신 ====================

  /**
   * POST /api/admin/virus-scan/result
   * yuri에서 스캔 결과 수신 (내부 API)
   */
  router.post('/admin/virus-scan/result', async (req, res) => {
    try {
      // 시크릿 키 확인
      const secret = req.headers['x-scan-secret'];
      if (secret !== VIRUS_SCAN_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const {
        documentId,
        collectionName,
        filePath,
        userId,
        status,
        threatName,
        clamVersion,
        scanDurationMs,
        errorMessage,
        scanType = 'realtime'
      } = req.body;

      console.log(`[VirusScan] 스캔 결과 수신: ${filePath} - ${status}`);

      // 스캔 로그 저장
      const logEntry = {
        scanType,
        collectionName,
        documentId: documentId ? new ObjectId(documentId) : null,
        filePath,
        userId,
        result: {
          status,
          threatName,
          clamVersion,
          scanDurationMs
        },
        action: {
          type: 'none',
          performedAt: null,
          performedBy: null
        },
        createdAt: new Date()
      };

      await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS).insertOne(logEntry);

      // 문서 업데이트 (documentId가 있는 경우)
      if (documentId && collectionName) {
        const collection = collectionName === 'personal_files'
          ? COLLECTIONS.PERSONAL_FILES
          : COLLECTIONS.FILES;

        await db.collection(collection).updateOne(
          { _id: new ObjectId(documentId) },
          {
            $set: {
              'virusScan.status': status,
              'virusScan.scannedAt': new Date(),
              'virusScan.clamVersion': clamVersion,
              'virusScan.threatName': threatName || null,
              'virusScan.scanDurationMs': scanDurationMs
            }
          }
        );

        // 감염 파일 처리
        if (status === 'infected') {
          await handleInfectedFile(db, documentId, collectionName, threatName, filePath, userId);
        }
      }

      // SSE 브로드캐스트
      if (status === 'infected') {
        broadcastVirusScanEvent('virus-detected', {
          documentId,
          collectionName,
          filePath,
          threatName,
          userId,
          detectedAt: new Date().toISOString()
        });
      } else {
        broadcastVirusScanEvent('virus-scan-complete', {
          documentId,
          collectionName,
          status,
          scanDurationMs
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[VirusScan] 결과 처리 실패:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/virus-scan/full-scan-complete
   * 전체 스캔 완료 알림 (yuri에서 호출)
   */
  router.post('/admin/virus-scan/full-scan-complete', async (req, res) => {
    try {
      const secret = req.headers['x-scan-secret'];
      if (secret !== VIRUS_SCAN_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { totalFiles, scannedFiles, infectedFiles, startedAt, completedAt } = req.body;

      console.log(`[VirusScan] 전체 스캔 완료: ${scannedFiles}/${totalFiles} 스캔, ${infectedFiles} 감염`);

      // 설정 업데이트
      await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS).updateOne(
        { _id: 'virus_scan_config' },
        {
          $set: {
            'scheduledScan.lastRunAt': new Date(completedAt),
            'scheduledScan.lastResult': {
              totalFiles,
              scannedFiles,
              infectedFiles,
              startedAt,
              completedAt
            }
          }
        }
      );

      // SSE 브로드캐스트
      broadcastVirusScanEvent('virus-scan-progress', {
        is_running: false,
        isComplete: true,
        totalFiles,
        scannedFiles,
        infectedFiles,
        completedAt
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[VirusScan] 전체 스캔 완료 처리 실패:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== Freshclam ====================

  /**
   * POST /api/admin/virus-scan/freshclam/update
   * 바이러스 DB 업데이트 트리거
   */
  router.post('/admin/virus-scan/freshclam/update', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const response = await axios.post(`${VIRUS_SCAN_SERVICE_URL}/freshclam/update`, {}, {
        headers: { 'X-Scan-Secret': VIRUS_SCAN_SECRET },
        timeout: 300000  // 5분
      });

      if (response.data.success) {
        // 설정 업데이트
        await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS).updateOne(
          { _id: 'virus_scan_config' },
          { $set: { 'freshclam.lastUpdateAt': new Date() } }
        );
      }

      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      console.error('[VirusScan] DB 업데이트 실패:', error);
      res.status(500).json({
        success: false,
        error: 'DB 업데이트에 실패했습니다.',
        details: error.message
      });
    }
  });

  /**
   * GET /api/admin/virus-scan/freshclam/status
   * 바이러스 DB 상태 조회
   */
  router.get('/admin/virus-scan/freshclam/status', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const response = await axios.get(`${VIRUS_SCAN_SERVICE_URL}/freshclam/status`, {
        timeout: 5000
      });

      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      res.json({
        success: true,
        data: {
          error: error.message
        }
      });
    }
  });

  // ==================== 로그 정리 ====================

  /**
   * POST /api/admin/virus-scan/cleanup-logs
   * 오래된 스캔 로그 수동 정리
   */
  router.post('/admin/virus-scan/cleanup-logs', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const deletedCount = await cleanupOldLogs(db);
      res.json({
        success: true,
        message: deletedCount > 0
          ? `오래된 로그 ${deletedCount}건이 삭제되었습니다.`
          : '삭제할 로그가 없습니다.',
        deletedCount
      });
    } catch (error) {
      console.error('[VirusScan] 로그 정리 실패:', error);
      res.status(500).json({
        success: false,
        error: '로그 정리에 실패했습니다.'
      });
    }
  });

  // 매일 새벽 1시에 로그 정리 실행 (24시간마다)
  // 서버 시작 시 1시간 후에 첫 실행
  setTimeout(() => {
    cleanupOldLogs(db);
    setInterval(() => cleanupOldLogs(db), 24 * 60 * 60 * 1000);
  }, 60 * 60 * 1000);

  console.log('[VirusScan] 로그 자동 정리 스케줄러 시작됨 (24시간 주기)');

  return router;
};

// ==================== 헬퍼 함수 ====================

/**
 * 오래된 스캔 로그 정리 (보관 기간 초과 로그 삭제)
 * 매일 새벽 1시에 자동 실행되도록 설정됨
 */
async function cleanupOldLogs(db) {
  try {
    // 설정에서 보관 기간 조회
    const settings = await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS)
      .findOne({ _id: 'virus_scan_config' });

    const retentionDays = settings?.logRetentionDays || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 오래된 로그 삭제
    const result = await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS).deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    if (result.deletedCount > 0) {
      console.log(`[VirusScan] 오래된 로그 ${result.deletedCount}건 삭제됨 (보관 기간: ${retentionDays}일)`);
    }

    return result.deletedCount;
  } catch (error) {
    console.error('[VirusScan] 로그 정리 실패:', error);
    return 0;
  }
}

/**
 * 감염 파일 처리
 */
async function handleInfectedFile(db, documentId, collectionName, threatName, filePath, userId) {
  try {
    // 설정 조회
    const settings = await db.collection(COLLECTIONS.VIRUS_SCAN_SETTINGS)
      .findOne({ _id: 'virus_scan_config' });

    const action = settings?.onInfectedAction || 'delete';

    if (action === 'delete') {
      // 파일 삭제
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[VirusScan] 감염 파일 자동 삭제: ${filePath}`);
      }

      // DB 상태 업데이트
      const collection = collectionName === 'personal_files'
        ? COLLECTIONS.PERSONAL_FILES
        : COLLECTIONS.FILES;

      await db.collection(collection).updateOne(
        { _id: new ObjectId(documentId) },
        {
          $set: {
            'virusScan.status': 'deleted',
            'virusScan.deletedAt': new Date(),
            'virusScan.deletedBy': 'system',
            'virusScan.deletedReason': `바이러스 감염: ${threatName}`
          }
        }
      );

      // 삭제 로그
      await db.collection(COLLECTIONS.VIRUS_SCAN_LOGS).updateOne(
        { documentId: new ObjectId(documentId), 'result.status': 'infected' },
        {
          $set: {
            'action.type': 'deleted',
            'action.performedAt': new Date(),
            'action.performedBy': 'system'
          }
        },
        { sort: { createdAt: -1 } }
      );

      console.log(`[VirusScan] 감염 파일 처리 완료: ${documentId}`);
    }

    // TODO: 관리자 알림 (이메일/Slack 등)

  } catch (error) {
    console.error('[VirusScan] 감염 파일 처리 실패:', error);
    backendLogger.error('VirusScan', '감염 파일 처리 실패', error);
  }
}
