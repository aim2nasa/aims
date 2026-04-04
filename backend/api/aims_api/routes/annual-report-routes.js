/**
 * annual-report-routes.js - Annual Report / Customer Review 라우트
 *
 * customers-routes.js에서 분리된 AR/CRS 도메인 라우트 (16개)
 * @since 2026-04-04
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const { COLLECTIONS, AR_QUEUE_STATUS, AR_QUEUE_FIELDS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');
const sseManager = require('../lib/sseManager');
const { sendSSE, notifyARSubscribers, notifyCRSubscribers } = sseManager;
const sseChannels = require('../config/sse-channels');

module.exports = function(db, authenticateJWT, authenticateJWTWithQuery, upload) {
  const router = express.Router();
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

  // SSE channel aliases
  const arSSEClients = sseChannels.ar;
  const crSSEClients = sseChannels.cr;

  // ==================== Annual Report API (Phase 2 프록시) ====================

  /**
   * Annual Report 체크 프록시 (Phase 2 - 파일 업로드 시 자동 감지)
   * 프론트엔드 → Node.js (3010) → Python (8004)
   */
  router.post('/annual-report/check', authenticateJWT, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          is_annual_report: false,
          confidence: 0,
          metadata: null,
          error: 'No file uploaded'
        });
      }

      console.log(`📄 [Annual Report Check] 파일: ${req.file.originalname}, 크기: ${req.file.size} bytes`);

      // Python API로 전달할 FormData 생성
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      const pythonApiUrl = 'http://localhost:8004/annual-report/check';
      console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

      const response = await axios.post(pythonApiUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 10000 // 10초 타임아웃
      });

      console.log(`✅ [Annual Report Check] 결과:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Annual Report Check] 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report Check] 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          is_annual_report: false,
          confidence: 0,
          metadata: null,
          error: 'Python API 서버에 연결할 수 없습니다. (포트 8004)'
        });
      }

      // 에러 시에도 조용히 실패 (모달이 나타나지 않도록)
      res.json({
        is_annual_report: false,
        confidence: 0,
        metadata: null
      });
    }
  });

  /**
   * Customer Review 체크 프록시 (파일 업로드 시 자동 감지)
   * 프론트엔드 → Node.js (3010) → Python (8004)
   */
  router.post('/customer-review/check', authenticateJWT, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          is_customer_review: false,
          confidence: 0,
          metadata: null,
          error: 'No file uploaded'
        });
      }

      console.log(`📄 [Customer Review Check] 파일: ${req.file.originalname}, 크기: ${req.file.size} bytes`);

      // Python API로 전달할 FormData 생성
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

      const pythonApiUrl = 'http://localhost:8004/customer-review/check';
      console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

      const response = await axios.post(pythonApiUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 10000 // 10초 타임아웃
      });

      console.log(`✅ [Customer Review Check] 결과:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Customer Review Check] 오류:', error.message);
      backendLogger.error('CustomerReview', '[Customer Review Check] 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          is_customer_review: false,
          confidence: 0,
          metadata: null,
          error: 'Python API 서버에 연결할 수 없습니다. (포트 8004)'
        });
      }

      // 에러 시에도 조용히 실패
      res.json({
        is_customer_review: false,
        confidence: 0,
        metadata: null
      });
    }
  });

  /**
   * Annual Report 파싱 프록시 (Phase 2 - 고객 선택 후 파싱)
   * 프론트엔드 → Node.js (3010) → Python (8004)
   */
  router.post('/annual-report/parse-file', authenticateJWT, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      if (!req.body.customer_id) {
        return res.status(400).json({
          success: false,
          message: 'customer_id is required'
        });
      }

      console.log(`📄 [Annual Report Parse] 파일: ${req.file.originalname}, 고객: ${req.body.customer_id}`);

      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      formData.append('customer_id', req.body.customer_id);

      const pythonApiUrl = 'http://localhost:8004/annual-report/parse';
      console.log(`🐍 Python API 호출: ${pythonApiUrl}`);

      const response = await axios.post(pythonApiUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 10000
      });

      console.log(`✅ [Annual Report Parse] 결과:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Annual Report Parse] 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report Parse] 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Python API 서버에 연결할 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // ==================== Annual Report API (기존 - MongoDB 기반) ====================

  /**
   * Annual Report 파싱 요청 프록시 (Python FastAPI로 전달)
   */
  router.post('/annual-report/parse', authenticateJWT, async (req, res) => {
    try {
      const { file_path, file_id, customer_id } = req.body;

      console.log(`📄 [Annual Report] 파싱 요청 받음:`, {
        file_path,
        file_id,
        customer_id
      });

      if (!file_path || !file_id) {
        return res.status(400).json({
          success: false,
          error: 'file_path와 file_id는 필수 파라미터입니다.'
        });
      }

      // Python FastAPI (포트 8004)로 프록시
      // Linux Docker: 172.17.0.1 (Docker 브리지 게이트웨이) 사용
      const pythonApiUrl = 'http://172.17.0.1:8004/annual-report/parse';

      console.log(`🐍 Python FastAPI 호출: ${pythonApiUrl}`);

      const response = await axios.post(pythonApiUrl, {
        file_path,
        file_id,
        customer_id
      }, {
        timeout: 5000 // 백그라운드 처리이므로 5초 타임아웃
      });

      console.log(`✅ [Annual Report] Python API 응답:`, response.data);

      res.json(response.data);
    } catch (error) {
      console.error('❌ [Annual Report] 파싱 요청 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 파싱 요청 오류', error);

      // Python API 서버가 다운되었거나 응답 없음
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.',
          error: 'Python FastAPI 서버가 실행 중이 아닙니다. (포트 8004)',
          hint: 'cd backend/api/annual_report_api && python main.py'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Annual Report 파싱 요청 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * Annual Report 파싱 상태 조회 프록시
   */
  /**
   * ⭐ 설계사별 문서 데이터 격리 적용
   */
  router.get('/annual-report/status/:file_id', authenticateJWT, async (req, res) => {
    try {
      const { file_id } = req.params;

      // ⭐ 설계사별 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      // ⭐ 소유권 검증: 해당 설계사의 문서만 조회 가능
      if (ObjectId.isValid(file_id)) {
        const document = await db.collection(COLLECTION_NAME)
          .findOne({ _id: new ObjectId(file_id), ownerId: userId });
        if (!document) {
          return res.status(403).json({
            success: false,
            error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      console.log(`🔍 [Annual Report] 상태 조회 요청: ${file_id}, userId: ${userId}`);

      const pythonApiUrl = `http://172.17.0.1:8004/annual-report/status/${file_id}`;

      const response = await axios.get(pythonApiUrl, {
        timeout: 3000
      });

      res.json(response.data);
    } catch (error) {
      console.error('❌ [Annual Report] 상태 조회 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 상태 조회 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.',
          error: 'Python FastAPI 서버가 실행 중이 아닙니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Annual Report 상태 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 전체 Annual Reports 목록 조회 (고객별 그룹화)
   * ⭐ 설계사별 데이터 격리 적용
   *
   * 응답: 고객별 최신 AR 요약 목록
   */
  router.get('/annual-reports/all', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      console.log(`📋 [Annual Report] 전체 AR 목록 조회, userId: ${userId}`);

      // MongoDB Aggregation: 고객별 AR 그룹화 + 최신 AR 정보
      const results = await db.collection(CUSTOMERS_COLLECTION).aggregate([
        // 1. 해당 설계사의 고객 중 AR이 있는 고객만 필터
        {
          $match: {
            'meta.created_by': userId,
            'annual_reports.0': { $exists: true }
          }
        },
        // 2. annual_reports 배열 unwind
        {
          $unwind: '$annual_reports'
        },
        // 3. 파싱 완료된 AR만 필터 (parsed_at이 있는 것)
        {
          $match: {
            'annual_reports.parsed_at': { $exists: true, $ne: null }
          }
        },
        // 4. 파싱일 기준 정렬
        {
          $sort: { 'annual_reports.parsed_at': -1 }
        },
        // 5. 고객별 그룹화: 최신 AR + AR 개수
        {
          $group: {
            _id: '$_id',
            customer_name: { $first: '$personal_info.name' },
            customer_type: { $first: '$insurance_info.customer_type' },
            registered_at: { $first: '$meta.created_at' },
            latest_ar: { $first: '$annual_reports' },
            ar_count: { $sum: 1 }
          }
        },
        // 6. 최신 파싱일 기준 정렬
        {
          $sort: { 'latest_ar.parsed_at': -1 }
        },
        // 7. 결과 형식 변환
        {
          $project: {
            _id: 0,
            customer_id: '$_id',
            customer_name: 1,
            customer_type: 1,
            registered_at: 1,
            latest_issue_date: '$latest_ar.issue_date',
            latest_parsed_at: '$latest_ar.parsed_at',
            total_monthly_premium: '$latest_ar.total_monthly_premium',
            contract_count: '$latest_ar.total_contracts',
            ar_count: 1
          }
        }
      ]).toArray();

      console.log(`📋 [Annual Report] 조회 완료: ${results.length}명의 고객`);

      res.json({
        success: true,
        data: {
          reports: results,
          total_count: results.length
        }
      });
    } catch (error) {
      console.error('❌ [Annual Report] 전체 조회 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 전체 조회 오류', error);

      res.status(500).json({
        success: false,
        message: 'Annual Report 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 Annual Reports 목록 조회 프록시
   */
  /**
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.get('/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { limit } = req.query;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
      if (ObjectId.isValid(customerId)) {
        const customer = await db.collection(CUSTOMERS_COLLECTION)
          .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
        if (!customer) {
          return res.status(403).json({
            success: false,
            error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      console.log(`📋 [Annual Report] 고객 Annual Reports 조회: ${customerId}, userId: ${userId}`);

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

      const response = await axios.get(pythonApiUrl, {
        params: { limit },
        headers: {
          'x-user-id': userId
        },
        timeout: 3000
      });

      res.json(response.data);
    } catch (error) {
      console.error('❌ [Annual Report] 조회 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 조회 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Annual Report 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 AR 파싱 대기/진행 중인 문서 목록 조회
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.get('/customers/:customerId/annual-reports/pending', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;

      // ⭐ 설계사별 고객 데이터 격리: userId 검증
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      // ⭐ 소유권 검증: 해당 설계사의 고객만 조회 가능
      const customer = await db.collection(CUSTOMERS_COLLECTION)
        .findOne({
          _id: new ObjectId(customerId),
          'meta.created_by': userId
        });

      if (!customer) {
        return res.status(403).json({
          success: false,
          error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
        });
      }

      console.log(`📋 [Annual Report] AR 파싱 대기 문서 조회: ${customerId}`);

      // ⭐ 새로운 큐 시스템: ar_parse_queue 컬렉션에서 조회
      const pendingQueue = await db.collection(COLLECTIONS.AR_PARSE_QUEUE).find({
        customer_id: new ObjectId(customerId),
        status: { $in: [AR_QUEUE_STATUS.PENDING, AR_QUEUE_STATUS.PROCESSING] }
      }).toArray();

      // 파일 정보 가져오기 (ar_parsing_status 포함)
      const fileIds = pendingQueue.map(q => q.file_id);
      const files = await db.collection(COLLECTION_NAME).find({
        _id: { $in: fileIds }
      }).project({
        _id: 1,
        'upload.originalName': 1,
        'upload.uploaded_at': 1,
        ar_parsing_status: 1  // 🔧 파싱 상태 확인용
      }).toArray();

      // 파일 정보와 큐 정보 매핑
      const fileMap = new Map(files.map(f => [f._id.toString(), f]));

      // 🔧 불일치 데이터 필터링: files.ar_parsing_status=completed인데 큐에 남아있는 경우 제외 + 삭제
      const validQueue = [];
      for (const queue of pendingQueue) {
        const file = fileMap.get(queue.file_id.toString());
        if (file && file.ar_parsing_status === 'completed') {
          // 불일치 발견 → 큐에서 삭제 (비동기로 처리, 에러 무시)
          db.collection(COLLECTIONS.AR_PARSE_QUEUE).deleteOne({ _id: queue._id }).catch(() => {});
          console.log(`🔧 [Annual Report] 불일치 큐 레코드 삭제: file_id=${queue.file_id} (이미 완료됨)`);
        } else {
          validQueue.push(queue);
        }
      }

      const pendingDocs = validQueue.map(queue => {
        const file = fileMap.get(queue.file_id.toString());
        return {
          file_id: queue.file_id.toString(),
          filename: file?.upload?.originalName || queue.metadata?.filename || 'Unknown',
          uploaded_at: normalizeTimestamp(file?.upload?.uploaded_at),
          status: queue.status,
          created_at: normalizeTimestamp(queue.created_at),
          retry_count: queue.retry_count || 0
        };
      });

      res.json({
        success: true,
        data: {
          pending_count: pendingDocs.length,
          documents: pendingDocs
        }
      });
    } catch (error) {
      console.error('❌ [Annual Report] 대기 문서 조회 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 대기 문서 조회 오류', error);

      res.status(500).json({
        success: false,
        message: 'AR 파싱 대기 문서 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 Annual Report 실시간 업데이트 SSE 스트림
   * @route GET /api/customers/:customerId/annual-reports/stream
   * @description 고객의 AR 상태 변경을 실시간으로 전달
   */
  router.get('/customers/:customerId/annual-reports/stream', authenticateJWTWithQuery, (req, res) => {
    const { customerId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 고객 ID입니다.' });
    }

    // 🔍 DEBUG: SSE 연결 상세 로깅
    console.log(`[SSE-AR] 📡 AR 스트림 연결 요청 - customerId: "${customerId}" (type: ${typeof customerId}), userId: ${userId}`);
    console.log(`[SSE-AR] 🔍 연결 전 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!arSSEClients.has(customerId)) {
      arSSEClients.set(customerId, new Set());
    }
    arSSEClients.get(customerId).add(res);

    // 🔍 DEBUG: 등록 후 상태 로깅
    console.log(`[SSE-AR] ✅ 클라이언트 등록 완료 - customerId: "${customerId}"`);
    console.log(`[SSE-AR] 🔍 등록 후 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);
    console.log(`[SSE-AR] 🔍 해당 고객 연결 수: ${arSSEClients.get(customerId).size}`);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      customerId,
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-AR] ❌ AR 스트림 연결 종료 - customerId: "${customerId}"`);
      clearInterval(keepAliveInterval);
      arSSEClients.get(customerId)?.delete(res);
      if (arSSEClients.get(customerId)?.size === 0) {
        arSSEClients.delete(customerId);
        console.log(`[SSE-AR] 🗑️ 고객 ${customerId}의 모든 연결 종료, 키 삭제됨`);
      }
      console.log(`[SSE-AR] 🔍 연결 종료 후 arSSEClients 키 목록: [${Array.from(arSSEClients.keys()).join(', ')}]`);
    });
  });

  /**
   * 고객의 Customer Review 실시간 업데이트 SSE 스트림
   * @route GET /api/customers/:customerId/customer-reviews/stream
   * @description 고객의 CR 상태 변경을 실시간으로 전달
   */
  router.get('/customers/:customerId/customer-reviews/stream', authenticateJWTWithQuery, (req, res) => {
    const { customerId } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 고객 ID입니다.' });
    }

    console.log(`[SSE-CR] CR 스트림 연결 - customerId: ${customerId}, userId: ${userId}`);

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 클라이언트 등록
    if (!crSSEClients.has(customerId)) {
      crSSEClients.set(customerId, new Set());
    }
    crSSEClients.get(customerId).add(res);

    // 연결 확인 이벤트
    sendSSE(res, 'connected', {
      customerId,
      userId,
      timestamp: utcNowISO()
    });

    // 30초마다 keep-alive 전송
    const keepAliveInterval = setInterval(() => {
      sendSSE(res, 'ping', { timestamp: utcNowISO() });
    }, 30000);

    // 연결 종료 처리
    req.on('close', () => {
      console.log(`[SSE-CR] CR 스트림 연결 종료 - customerId: ${customerId}`);
      clearInterval(keepAliveInterval);
      crSSEClients.get(customerId)?.delete(res);
      if (crSSEClients.get(customerId)?.size === 0) {
        crSSEClients.delete(customerId);
      }
    });
  });

  /**
   * 고객의 최신 Annual Report 조회 프록시
   */
  /**
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.get('/customers/:customerId/annual-reports/latest', authenticateJWT, async (req, res) => {
    const { customerId } = req.params; // catch 블록에서도 접근 가능하도록 밖으로 이동

    try {
      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
      if (ObjectId.isValid(customerId)) {
        const customer = await db.collection(CUSTOMERS_COLLECTION)
          .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
        if (!customer) {
          return res.status(403).json({
            success: false,
            error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      console.log(`📋 [Annual Report] 최신 Annual Report 조회: ${customerId}, userId: ${userId}`);

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports/latest`;

      const response = await axios.get(pythonApiUrl, {
        headers: {
          'x-user-id': userId
        },
        timeout: 3000
      });

      res.json(response.data);
    } catch (error) {
      console.error('❌ [Annual Report] 최신 조회 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 최신 조회 오류', error);

      // 404는 정상 케이스 (데이터 없음) - 프론트엔드에 빈 데이터로 전달
      if (error.response?.status === 404) {
        return res.json({
          success: true,
          data: {
            customer_id: customerId,
            report: null
          }
        });
      }

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: '최신 Annual Report 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 Annual Reports 삭제 프록시
   */
  /**
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.delete('/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { identifiers, indices } = req.body;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 삭제 가능
      if (ObjectId.isValid(customerId)) {
        const customer = await db.collection(CUSTOMERS_COLLECTION)
          .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
        if (!customer) {
          return res.status(403).json({
            success: false,
            error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      // identifiers 우선, 하위 호환을 위해 indices도 허용
      const hasIdentifiers = identifiers && Array.isArray(identifiers) && identifiers.length > 0;
      const hasIndices = indices && Array.isArray(indices) && indices.length > 0;

      console.log(`🗑️  [Annual Report] 삭제 요청: customer=${customerId}, userId=${userId}, identifiers=${JSON.stringify(identifiers)}, indices=${JSON.stringify(indices)}`);

      if (!hasIdentifiers && !hasIndices) {
        return res.status(400).json({
          success: false,
          message: '삭제할 항목을 선택해주세요'
        });
      }

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

      // identifiers가 있으면 identifiers 전달, 없으면 기존 indices 전달
      const requestBody = hasIdentifiers ? { identifiers } : { indices };
      const response = await axios.delete(pythonApiUrl, {
        data: requestBody,
        headers: {
          'x-user-id': userId
        },
        timeout: 5000
      });

      console.log(`✅ [Annual Report] 삭제 완료:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Annual Report] 삭제 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 삭제 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.'
        });
      }

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: error.response.data?.message || '고객을 찾을 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Annual Report 삭제 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  // ==================== Customer Review API Proxy ====================
  /**
   * 고객의 Customer Reviews 목록 조회 프록시
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.get('/customers/:customerId/customer-reviews', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { limit } = req.query;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 조회 가능
      if (ObjectId.isValid(customerId)) {
        const customer = await db.collection(CUSTOMERS_COLLECTION)
          .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
        if (!customer) {
          return res.status(403).json({
            success: false,
            error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      console.log(`📋 [Customer Review] 고객 Customer Reviews 조회: ${customerId}, userId: ${userId}`);

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/customer-reviews`;

      const response = await axios.get(pythonApiUrl, {
        params: { limit },
        headers: {
          'x-user-id': userId
        },
        timeout: 3000
      });

      res.json(response.data);
    } catch (error) {
      console.error('❌ [Customer Review] 조회 오류:', error.message);
      backendLogger.error('CustomerReview', '[Customer Review] 조회 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Customer Review API 서버에 연결할 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Customer Review 조회 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 Customer Reviews 삭제 프록시
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.delete('/customers/:customerId/customer-reviews', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { indices } = req.body;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      // ⭐ 고객 소유권 검증: 해당 설계사의 고객만 삭제 가능
      if (ObjectId.isValid(customerId)) {
        const customer = await db.collection(CUSTOMERS_COLLECTION)
          .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });
        if (!customer) {
          return res.status(403).json({
            success: false,
            error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
          });
        }
      }

      console.log(`🗑️  [Customer Review] 삭제 요청: customer=${customerId}, userId=${userId}, indices=${JSON.stringify(indices)}`);

      if (!indices || !Array.isArray(indices) || indices.length === 0) {
        return res.status(400).json({
          success: false,
          message: '삭제할 리뷰 인덱스가 필요합니다.'
        });
      }

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/customer-reviews`;

      const response = await axios.delete(pythonApiUrl, {
        data: { indices },
        headers: {
          'x-user-id': userId
        },
        timeout: 5000
      });

      console.log(`✅ [Customer Review] 삭제 완료:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Customer Review] 삭제 오류:', error.message);
      backendLogger.error('CustomerReview', '[Customer Review] 삭제 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Customer Review API 서버에 연결할 수 없습니다.'
        });
      }

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: error.response.data?.message || '고객을 찾을 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Customer Review 삭제 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * 고객의 중복 Annual Reports 정리 프록시
   */
  /**
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.post('/customers/:customerId/annual-reports/cleanup-duplicates', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { issue_date, reference_linked_at } = req.body;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      console.log(`🧹 [Annual Report] 중복 정리 요청: customer=${customerId}, userId=${userId}, issue_date=${issue_date}, reference=${reference_linked_at}`);

      if (!issue_date || !reference_linked_at) {
        return res.status(400).json({
          success: false,
          message: 'issue_date와 reference_linked_at가 필요합니다'
        });
      }

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports/cleanup-duplicates`;

      const response = await axios.post(pythonApiUrl, {
        issue_date,
        reference_linked_at
      }, {
        headers: {
          'x-user-id': userId
        },
        timeout: 5000
      });

      console.log(`✅ [Annual Report] 중복 정리 완료:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [Annual Report] 중복 정리 오류:', error.message);
      backendLogger.error('AnnualReport', '[Annual Report] 중복 정리 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.'
        });
      }

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: error.response.data?.message || '고객을 찾을 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: '중복 Annual Report 정리 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  /**
   * AR 보험계약 등록 API (수동)
   * 프론트엔드 → Node.js (3010) → Python (8004)
   * ⭐ 설계사별 고객 데이터 격리 적용
   */
  router.post('/customers/:customerId/ar-contracts', authenticateJWT, async (req, res) => {
    try {
      const { customerId } = req.params;
      const { issue_date, customer_name } = req.body;

      // ⭐ userId 추출 및 검증 (사용자 계정 기능)
      const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId required'
        });
      }

      console.log(`📋 [AR Contracts] 보험계약 등록 요청: customer=${customerId}, userId=${userId}, issue_date=${issue_date}`);

      if (!issue_date) {
        return res.status(400).json({
          success: false,
          message: 'issue_date가 필요합니다'
        });
      }

      const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/ar-contracts`;

      const response = await axios.post(pythonApiUrl, {
        issue_date,
        customer_name
      }, {
        headers: {
          'x-user-id': userId
        },
        timeout: 5000
      });

      console.log(`✅ [AR Contracts] 보험계약 등록 완료:`, response.data);
      res.json(response.data);

    } catch (error) {
      console.error('❌ [AR Contracts] 보험계약 등록 오류:', error.message);
      backendLogger.error('ARContracts', '[AR Contracts] 보험계약 등록 오류', error);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'Annual Report API 서버에 연결할 수 없습니다.'
        });
      }

      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: error.response.data?.detail || '고객 또는 AR을 찾을 수 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'AR 보험계약 등록 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  });

  return router;
};
