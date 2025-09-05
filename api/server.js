// server.js - 문서 상태 모니터링 API 서버
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔍 포괄적인 요청 디버깅 미들웨어 (모든 요청 로깅)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  
  console.log(`\n======================================`);
  console.log(`📥 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`🌍 클라이언트 IP:`, clientIP);
  console.log(`📋 쿼리 파라미터:`, JSON.stringify(req.query, null, 2));
  console.log(`📦 요청 헤더:`, JSON.stringify(req.headers, null, 2));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📄 요청 바디:`, JSON.stringify(req.body, null, 2));
  }
  
  console.log(`======================================\n`);
  next();
});

// 🔍 응답 디버깅 미들웨어
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    console.log(`📤 [응답] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    if (typeof data === 'string' && data.length < 500) {
      console.log(`📤 응답 데이터:`, data);
    } else if (typeof data === 'object') {
      console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    console.log(`📤 [JSON 응답] ${req.method} ${req.url} - Status: ${res.statusCode}`);
    console.log(`📤 응답 JSON:`, JSON.stringify(data, null, 2));
    return originalJson.call(this, data);
  };
  
  next();
});

// MongoDB 연결 설정
const MONGO_URI = 'mongodb://tars:27017/';
const DB_NAME = 'docupload';
const COLLECTION_NAME = 'files';
const CUSTOMERS_COLLECTION = 'customers';
const AGENTS_COLLECTION = 'agents';
const CASES_COLLECTION = 'cases';

// 고객 관계 관리 라우트 import
const { setupCustomerRelationshipRoutes } = require('./customer-relationships-routes');

let db;

// MongoDB 연결
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);
  })
  .catch(error => console.error('MongoDB 연결 실패:', error));

/**
 * 문서의 처리 상태를 분석하는 함수
 */
function analyzeDocumentStatus(doc) {
  const stages = {
    upload: { name: '업로드', status: 'pending', message: '대기 중', timestamp: null },
    meta: { name: '메타데이터', status: 'pending', message: '대기 중', timestamp: null },
    ocr_prep: { name: 'OCR 준비', status: 'pending', message: '대기 중', timestamp: null },
    ocr: { name: 'OCR 처리', status: 'pending', message: '대기 중', timestamp: null },
    docembed: { name: '임베딩', status: 'pending', message: '대기 중', timestamp: null }
  };

  let currentStage = 0;
  let overallStatus = 'pending';
  let progress = 0;

  // 1. Upload 단계
  if (doc.upload) {
    stages.upload.status = 'completed';
    stages.upload.message = '업로드 완료';
    stages.upload.timestamp = doc.upload.uploaded_at;
    currentStage = 1;
    progress = 20;
  }

  // 2. Meta 단계
  if (doc.meta) {
    if (doc.meta.meta_status === 'ok') {
      stages.meta.status = 'completed';
      stages.meta.message = `메타데이터 추출 완료 (${doc.meta.mime}, ${formatBytes(doc.meta.size_bytes)})`;
      stages.meta.timestamp = doc.meta.created_at;
      currentStage = 2;
      progress = 40;
    } else {
      stages.meta.status = 'error';
      stages.meta.message = '메타데이터 추출 실패';
      overallStatus = 'error';
      return { stages, currentStage: 1, overallStatus, progress };
    }
  }

  // 3. OCR 준비 단계
  if (doc.meta && doc.meta.meta_status === 'ok') {
    stages.ocr_prep.status = 'completed';
    stages.ocr_prep.message = 'OCR 준비 완료';
    currentStage = 3;
    progress = 60;

    // 지원하지 않는 MIME 타입 체크
    const unsupportedMimes = ['application/postscript', 'application/zip', 'application/octet-stream'];
    if (unsupportedMimes.includes(doc.meta.mime)) {
      stages.ocr.status = 'skipped';
      stages.ocr.message = '지원하지 않는 문서 형식';
      stages.docembed.status = 'skipped';
      stages.docembed.message = 'OCR 생략으로 인한 건너뜀';
      overallStatus = 'completed_with_skip';
      progress = 100;
      return { stages, currentStage, overallStatus, progress };
    }

    // PDF 페이지 수 초과 체크
    if (doc.meta.pdf_pages && doc.meta.pdf_pages > 30) {
      stages.ocr.status = 'skipped';
      stages.ocr.message = `페이지 수 초과 (${doc.meta.pdf_pages} > 30)`;
      stages.docembed.status = 'skipped';
      stages.docembed.message = 'OCR 생략으로 인한 건너뜀';
      overallStatus = 'completed_with_skip';
      progress = 100;
      return { stages, currentStage, overallStatus, progress };
    }
  }

  // 4. OCR 처리 단계
  if (doc.ocr) {
    if (doc.ocr.warn) {
      stages.ocr.status = 'skipped';
      stages.ocr.message = doc.ocr.warn;
      stages.docembed.status = 'skipped';
      stages.docembed.message = 'OCR 생략으로 인한 건너뜀';
      overallStatus = 'completed_with_skip';
      progress = 100;
      return { stages, currentStage, overallStatus, progress };
    } else if (doc.ocr.queue) {
      stages.ocr.status = 'processing';
      stages.ocr.message = 'OCR 대기열에서 처리 대기 중';
      stages.ocr.timestamp = doc.ocr.queue_at;
      currentStage = 4;
      progress = 70;
      overallStatus = 'processing';
    } else if (doc.ocr.status === 'running') {
      stages.ocr.status = 'processing';
      stages.ocr.message = 'OCR 처리 중';
      stages.ocr.timestamp = doc.ocr.started_at;
      currentStage = 4;
      progress = 75;
      overallStatus = 'processing';
    } else if (doc.ocr.status === 'done') {
      stages.ocr.status = 'completed';
      stages.ocr.message = `OCR 완료 (신뢰도: ${doc.ocr.confidence})`;
      stages.ocr.timestamp = doc.ocr.done_at;
      currentStage = 4;
      progress = 80;
    } else if (doc.ocr.status === 'error') {
      stages.ocr.status = 'error';
      stages.ocr.message = `OCR 실패: ${doc.ocr.statusMessage || '알 수 없는 오류'}`;
      stages.ocr.timestamp = doc.ocr.failed_at;
      stages.docembed.status = 'blocked';
      stages.docembed.message = 'OCR 실패로 인한 차단';
      overallStatus = 'error';
      return { stages, currentStage, overallStatus, progress };
    }
  }

  // text 필드가 있는 경우 (text/plain 직접 처리)
  if (doc.text && doc.text.full_text) {
    stages.ocr.status = 'completed';
    stages.ocr.message = '텍스트 파일 직접 처리 완료';
    currentStage = 4;
    progress = 80;
  }

  // 5. DocEmbed 단계
  if (doc.docembed) {
    if (doc.docembed.status === 'done') {
      stages.docembed.status = 'completed';
      stages.docembed.message = `임베딩 완료 (${doc.docembed.chunks}개 청크, ${doc.docembed.dims}차원)`;
      stages.docembed.timestamp = doc.docembed.updated_at;
      currentStage = 5;
      progress = 100;
      overallStatus = 'completed';
    } else if (doc.docembed.status === 'failed') {
      stages.docembed.status = 'error';
      stages.docembed.message = `임베딩 실패: ${doc.docembed.error_message}`;
      stages.docembed.timestamp = doc.docembed.updated_at;
      overallStatus = 'error';
    } else if (doc.docembed.status === 'processing') {
      stages.docembed.status = 'processing';
      stages.docembed.message = '임베딩 처리 중';
      currentStage = 5;
      progress = 90;
      overallStatus = 'processing';
    }
  }

  // 전체 상태가 아직 결정되지 않은 경우
  if (overallStatus === 'pending' && currentStage > 0) {
    overallStatus = 'processing';
  }

  return { stages, currentStage, overallStatus, progress };
}

/**
 * 바이트를 사람이 읽기 쉬운 형태로 변환
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 모든 문서의 상태를 조회하는 API
 */
app.get('/api/documents/status', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    // 필터 조건 구성
    let filter = {};
    if (search) {
      filter['upload.originalName'] = { $regex: search, $options: 'i' };
    }

    // 문서 조회
    const documents = await db.collection(COLLECTION_NAME)
      .find(filter)
      .sort({ 'upload.uploaded_at': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const totalCount = await db.collection(COLLECTION_NAME).countDocuments(filter);

    // 각 문서의 상태 분석
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);
      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: doc.upload?.uploaded_at,
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        ...statusInfo
      };
    });

    // 상태별 필터링
    let filteredDocuments = documentsWithStatus;
    if (status) {
      filteredDocuments = documentsWithStatus.filter(doc => doc.overallStatus === status);
    }

    res.json({
      success: true,
      data: {
        documents: filteredDocuments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('문서 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 상태 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 특정 문서의 상세 상태를 조회하는 API
 */
app.get('/api/documents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    const statusInfo = analyzeDocumentStatus(document);

    res.json({
      success: true,
      data: {
        _id: document._id,
        originalName: document.upload?.originalName || 'Unknown File',
        uploadedAt: document.upload?.uploaded_at,
        fileSize: document.meta?.size_bytes,
        mimeType: document.meta?.mime,
        filePath: document.upload?.destPath,
        ...statusInfo,
        // 원본 문서 데이터도 포함 (디버깅용)
        rawDocument: document
      }
    });
  } catch (error) {
    console.error('문서 상세 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 상세 상태 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 당신이 원했던 엔드포인트: 단일 문서 ID로 상태 조회
 */
app.get('/webhook/get-status/:document_id', async (req, res) => {
  try {
    const { document_id } = req.params;

    if (!ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.',
        document_id
      });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.',
        document_id
      });
    }

    const statusInfo = analyzeDocumentStatus(document);

    // 간단한 응답 형식
    res.json({
      success: true,
      document_id,
      current_stage: statusInfo.currentStage,
      overall_status: statusInfo.overallStatus,
      progress_percentage: statusInfo.progress,
      stages: Object.values(statusInfo.stages),
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('문서 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 상태 조회에 실패했습니다.',
      document_id: req.params.document_id,
      details: error.message
    });
  }
});

/**
 * 문서 처리 상태 통계를 조회하는 API
 */
app.get('/api/documents/statistics', async (req, res) => {
  try {
    const documents = await db.collection(COLLECTION_NAME).find({}).toArray();
    
    const stats = {
      total: documents.length,
      completed: 0,
      processing: 0,
      error: 0,
      pending: 0,
      completed_with_skip: 0,
      stages: {
        upload: 0,
        meta: 0,
        ocr_prep: 0,
        ocr: 0,
        docembed: 0
      }
    };

    documents.forEach(doc => {
      const { overallStatus, currentStage } = analyzeDocumentStatus(doc);
      stats[overallStatus]++;
      
      // 현재 단계별 통계
      if (currentStage >= 1) stats.stages.upload++;
      if (currentStage >= 2) stats.stages.meta++;
      if (currentStage >= 3) stats.stages.ocr_prep++;
      if (currentStage >= 4) stats.stages.ocr++;
      if (currentStage >= 5) stats.stages.docembed++;
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 문서 재처리 요청 API (실패한 문서의 재처리)
 */
app.post('/api/documents/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body; // 'ocr' 또는 'docembed'

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    let updateFields = {};

    if (stage === 'ocr') {
      // OCR 재처리: ocr 필드 초기화 후 큐에 다시 추가
      updateFields = {
        $unset: { 'ocr.status': '', 'ocr.error': '', 'ocr.failed_at': '' },
        $set: {
          'ocr.queue': true,
          'ocr.queue_at': new Date().toISOString()
        }
      };
      
      // Redis 큐에 다시 추가하는 로직 필요
      // 실제로는 Redis XADD 명령어 실행
      
    } else if (stage === 'docembed') {
      // DocEmbed 재처리: docembed 필드 초기화
      updateFields = {
        $unset: { 
          'docembed.status': '', 
          'docembed.error_message': '', 
          'docembed.updated_at': '' 
        }
      };
      
      // Python 스크립트 재실행 트리거 필요
    }

    await db.collection(COLLECTION_NAME)
      .updateOne({ _id: new ObjectId(id) }, updateFields);

    res.json({
      success: true,
      message: `${stage} 단계 재처리가 요청되었습니다.`
    });
  } catch (error) {
    console.error('재처리 요청 오류:', error);
    res.status(500).json({
      success: false,
      error: '재처리 요청에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 실시간 상태 업데이트를 위한 WebSocket 또는 Server-Sent Events
 * 여기서는 간단한 폴링용 API로 구현
 */
app.get('/api/documents/status/live', async (req, res) => {
  try {
    // 처리 중인 문서들만 조회
    const processingDocs = await db.collection(COLLECTION_NAME)
      .find({
        $or: [
          { 'ocr.status': 'running' },
          { 'ocr.queue': true },
          { 'docembed.status': { $exists: false } }
        ]
      })
      .toArray();

    const documentsWithStatus = processingDocs.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);
      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        ...statusInfo
      };
    });

    res.json({
      success: true,
      data: documentsWithStatus
    });
  } catch (error) {
    console.error('실시간 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '실시간 상태 조회에 실패했습니다.'
    });
  }
});

/**
 * 문서 삭제 API
 */
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    // 파일 시스템에서 파일 삭제
    const fs = require('fs').promises;
    if (document.upload?.destPath) {
      try {
        await fs.unlink(document.upload.destPath);
      } catch (fileError) {
        console.warn('파일 삭제 실패:', fileError.message);
      }
    }

    // MongoDB에서 문서 삭제
    await db.collection(COLLECTION_NAME)
      .deleteOne({ _id: new ObjectId(id) });

    // Qdrant에서 임베딩 삭제 (필요한 경우)
    // Qdrant 클라이언트를 사용하여 해당 문서의 임베딩 삭제

    res.json({
      success: true,
      message: '문서가 성공적으로 삭제되었습니다.'
    });
  } catch (error) {
    console.error('문서 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 헬스체크 API
 */
app.get('/api/health', async (req, res) => {
  try {
    // MongoDB 연결 상태 확인
    await db.admin().ping();
    
    res.json({
      success: true,
      message: 'API 서버가 정상적으로 작동 중입니다.',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'API 서버에 문제가 있습니다.',
      error: error.message
    });
  }
});

// 에러 핸들링 미들웨어
app.use((error, req, res, next) => {
  console.error('서버 오류:', error);
  res.status(500).json({
    success: false,
    error: '내부 서버 오류가 발생했습니다.',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 고객 관계 관리 라우트 설정
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);
    
    // 고객 관계 라우트 설정
    setupCustomerRelationshipRoutes(app, db);
  })
  .catch(error => console.error('MongoDB 연결 실패:', error));

const PORT = process.env.PORT || 3010;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀🚀🚀 ================================');
  console.log(`🚀 문서 상태 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🚀 서버 시간: ${new Date().toISOString()}`);
  console.log(`🚀 바인딩: 0.0.0.0:${PORT} (모든 네트워크 인터페이스)`);
  console.log('🚀🚀🚀 ================================\n');
  
  console.log(`📋 API 엔드포인트:`);
  console.log(`  GET  /api/documents/status - 문서 목록 및 상태 조회`);
  console.log(`  GET  /api/documents/:id/status - 특정 문서 상세 상태`);
  console.log(`  GET  /webhook/get-status/:document_id - 간단한 문서 상태 조회`);
  console.log(`  GET  /api/documents/statistics - 처리 상태 통계`);
  console.log(`  POST /api/documents/:id/retry - 문서 재처리`);
  console.log(`  GET  /api/documents/status/live - 실시간 상태 (폴링용)`);
  console.log(`  DELETE /api/documents/:id - 문서 삭제`);
  console.log(`  GET  /api/health - 헬스체크`);
  
  console.log(`\n👥 Customer Management APIs:`);
  console.log(`  GET  /api/customers - 고객 목록 조회`);
  console.log(`  POST /api/customers - 새 고객 등록`);
  console.log(`  GET  /api/customers/:id - 고객 상세 정보`);
  console.log(`  PUT  /api/customers/:id - 고객 정보 수정`);
  console.log(`  DELETE /api/customers/:id - 고객 삭제`);
  console.log(`  POST /api/customers/:id/documents - 고객에 문서 연결`);
  console.log(`  GET  /api/customers/:id/documents - 고객 관련 문서 목록`);
  
  console.log(`\n🏠 Address Search API:`);
  console.log(`  GET  /api/address/search - 한국 주소 검색 (정부 API 프록시)`);
  
  console.log(`\n🔍 디버깅 활성화: 모든 HTTP 요청/응답 로깅 중...`);
  console.log(`=============================================\n`);
});

// ==================== 고객 관리 API ====================

/**
 * 고객 목록 조회 API
 */
app.get('/api/customers', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      customerType, 
      region, 
      startDate, 
      endDate, 
      hasDocuments 
    } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    
    // 기본 검색 (이름, 전화번호, 이메일)
    if (search) {
      // URL 디코딩 처리 (이미 디코딩된 경우 그대로 사용)
      let decodedSearch;
      try {
        decodedSearch = decodeURIComponent(search);
      } catch (e) {
        decodedSearch = search; // 디코딩 실패 시 원본 사용
      }
      
      filter.$or = [
        { 'personal_info.name': { $regex: decodedSearch, $options: 'i' } },
        { 'personal_info.phone': { $regex: decodedSearch, $options: 'i' } },
        { 'personal_info.email': { $regex: decodedSearch, $options: 'i' } }
      ];
    }
    
    // 기존 상태 필터
    if (status) {
      filter['meta.status'] = status;
    }
    
    // 고급 검색 필터들
    if (customerType) {
      filter['insurance_info.customer_type'] = customerType;
    }
    
    if (region) {
      if (region === '기타') {
        // 17개 시도가 아닌 모든 경우
        const koreanRegions = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', 
                              '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
        filter['personal_info.address.address1'] = { 
          $not: { $regex: `^(${koreanRegions.join('|')})`, $options: 'i' }
        };
      } else {
        filter['personal_info.address.address1'] = { $regex: `^${region}`, $options: 'i' };
      }
    }
    
    // 날짜 범위 필터 (등록일 기준)
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // 해당 일의 마지막 시간
        dateFilter.$lte = endDateTime;
      }
      filter['meta.created_at'] = dateFilter;
    }
    
    // 문서 보유 여부 필터
    if (hasDocuments === 'true') {
      filter['documents'] = { $exists: true, $not: { $size: 0 } };
    } else if (hasDocuments === 'false') {
      // 기존 $or가 있으면 $and로 감싸서 조건 추가
      if (filter.$or) {
        filter = {
          $and: [
            filter,
            {
              $or: [
                { 'documents': { $exists: false } },
                { 'documents': { $size: 0 } }
              ]
            }
          ]
        };
      } else {
        filter.$or = [
          { 'documents': { $exists: false } },
          { 'documents': { $size: 0 } }
        ];
      }
    }

    const customers = await db.collection(CUSTOMERS_COLLECTION)
      .find(filter)
      .sort({ 'meta.created_at': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const totalCount = await db.collection(CUSTOMERS_COLLECTION).countDocuments(filter);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('고객 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 윈도우식 중복명 처리를 위한 고유한 고객명 생성 함수
 */
async function generateUniqueCustomerName(originalName) {
  // 원본 이름으로 먼저 검색
  const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
    .findOne({ 'personal_info.name': originalName });
  
  // 중복이 없으면 원본 이름 반환
  if (!existingCustomer) {
    return originalName;
  }
  
  // 중복이 있으면 (1), (2), ... 형태로 번호 붙이기
  let counter = 1;
  let uniqueName;
  
  while (true) {
    uniqueName = `${originalName} (${counter})`;
    
    const duplicateCheck = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ 'personal_info.name': uniqueName });
    
    if (!duplicateCheck) {
      return uniqueName;
    }
    
    counter++;
    
    // 무한 루프 방지 (최대 100개까지)
    if (counter > 100) {
      return `${originalName} (${Date.now()})`;
    }
  }
}

/**
 * 새 고객 등록 API
 */
app.post('/api/customers', async (req, res) => {
  try {
    const customerData = req.body;
    
    // 원본 고객명을 기준으로 유니크한 이름 생성
    const originalName = customerData.personal_info?.name;
    if (!originalName) {
      return res.status(400).json({
        success: false,
        error: '고객명은 필수 입력 항목입니다.'
      });
    }
    
    const uniqueName = await generateUniqueCustomerName(originalName);
    
    const newCustomer = {
      ...customerData,
      personal_info: {
        ...customerData.personal_info,
        name: uniqueName
      },
      meta: {
        created_at: new Date(),
        updated_at: new Date(),
        created_by: customerData.created_by || null,
        last_modified_by: customerData.created_by || null,
        status: 'active',
        original_name: originalName !== uniqueName ? originalName : undefined
      }
    };

    const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomer);

    res.json({
      success: true,
      data: {
        customer_id: result.insertedId,
        customer_name: uniqueName,
        was_renamed: originalName !== uniqueName,
        original_name: originalName !== uniqueName ? originalName : undefined,
        message: originalName !== uniqueName 
          ? `고객이 성공적으로 등록되었습니다. (이름이 "${originalName}"에서 "${uniqueName}"으로 변경됨)`
          : '고객이 성공적으로 등록되었습니다.'
      }
    });
  } catch (error) {
    console.error('고객 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 상세 정보 조회 API
 */
app.get('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('고객 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 정보 수정 API
 */
app.put('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    const updateFields = {
      ...updateData,
      'meta.updated_at': new Date(),
      'meta.last_modified_by': updateData.modified_by || null
    };

    const result = await db.collection(CUSTOMERS_COLLECTION)
      .updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '고객 정보가 성공적으로 수정되었습니다.'
    });
  } catch (error) {
    console.error('고객 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 정보 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 삭제 API
 */
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    const result = await db.collection(CUSTOMERS_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '고객이 성공적으로 삭제되었습니다.'
    });
  } catch (error) {
    console.error('고객 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객에 문서 연결 API
 */
app.post('/api/customers/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const { document_id, relationship_type, notes, assigned_by } = req.body;

    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // 고객 존재 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 문서 존재 확인
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    // 고객에 문서 연결 추가
    const documentLink = {
      document_id: new ObjectId(document_id),
      relationship: relationship_type || 'general',
      upload_date: new Date(),
      notes: notes || ''
    };

    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { 
        $push: { documents: documentLink },
        $set: { 'meta.updated_at': new Date() }
      }
    );

    // 문서에도 고객 연결 정보 추가
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          customer_relation: {
            customer_id: new ObjectId(id),
            relationship_type: relationship_type || 'general',
            assigned_by: assigned_by ? new ObjectId(assigned_by) : null,
            assigned_at: new Date(),
            notes: notes || ''
          }
        }
      }
    );

    res.json({
      success: true,
      message: '문서가 고객에게 성공적으로 연결되었습니다.'
    });
  } catch (error) {
    console.error('문서 연결 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 연결에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객에서 문서 연결 해제 API
 */
app.delete('/api/customers/:id/documents/:document_id', async (req, res) => {
  try {
    const { id, document_id } = req.params;

    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // 고객 존재 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 문서 존재 확인
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id) });

    if (!document) {
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    // 고객에서 문서 연결 제거
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { 
        $pull: { documents: { document_id: new ObjectId(document_id) } },
        $set: { 'meta.updated_at': new Date() }
      }
    );

    // 문서에서 고객 연결 정보 제거
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $unset: { customer_relation: "" }
      }
    );

    res.json({
      success: true,
      message: '문서 연결이 성공적으로 해제되었습니다.'
    });
  } catch (error) {
    console.error('문서 연결 해제 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 연결 해제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 관련 문서 목록 조회 API
 */
app.get('/api/customers/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // 고객 정보 조회
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 고객에 연결된 문서들 조회
    const documentIds = customer.documents?.map(doc => doc.document_id) || [];
    
    if (documentIds.length === 0) {
      return res.json({
        success: true,
        data: {
          customer_id: id,
          documents: [],
          total: 0
        }
      });
    }

    const documents = await db.collection(COLLECTION_NAME)
      .find({ _id: { $in: documentIds } })
      .toArray();

    // 문서에 상태 정보 추가
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);
      const customerDoc = customer.documents.find(d => d.document_id.equals(doc._id));
      
      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: doc.upload?.uploaded_at,
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        relationship: customerDoc?.relationship,
        notes: customerDoc?.notes,
        linkedAt: customerDoc?.upload_date,
        ...statusInfo
      };
    });

    res.json({
      success: true,
      data: {
        customer_id: id,
        customer_name: customer.personal_info?.name,
        documents: documentsWithStatus,
        total: documentsWithStatus.length
      }
    });
  } catch (error) {
    console.error('고객 문서 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 문서 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 테스트용 간단한 주소 검색 엔드포인트
 */
app.get('/api/address/test', async (req, res) => {
  console.log('\n🧪🧪🧪 === 테스트 엔드포인트 진입!!! ===');
  console.log('🧪 URL:', req.url);
  console.log('🧪 METHOD:', req.method);
  console.log('🧪 요청 파라미터:', JSON.stringify(req.query, null, 2));
  console.log('🧪🧪🧪 ========================\n');
  
  res.json({
    success: true,
    message: '테스트 엔드포인트가 정상적으로 작동합니다!',
    query: req.query,
    timestamp: new Date().toISOString()
  });
});

/**
 * 카카오 주소 검색 API 프록시 - 즉시 사용 가능, 고품질
 */
app.get('/api/address/search', async (req, res) => {
  console.log('\n🎯🎯🎯 === 카카오 주소 검색 API 진입!!! ===');
  console.log('🎯 URL:', req.url);
  console.log('🎯 METHOD:', req.method);
  console.log('🎯 요청 파라미터:', JSON.stringify(req.query, null, 2));
  console.log('🎯🎯🎯 ========================\n');
  
  try {
    const { keyword, page = 1, size = 10 } = req.query;
    
    console.log(`📝 파싱된 값 - keyword: "${keyword}", page: ${page}, size: ${size}`);
    
    if (!keyword || keyword.trim() === '') {
      console.log('❌ 키워드 없음 - 400 에러 반환');
      return res.status(400).json({
        success: false,
        error: '검색어를 입력해주세요.'
      });
    }

    console.log(`🔍 카카오 API 호출 시작: "${keyword}"`);
    
    // 카카오 Local API (주소 검색)
    // REST API 키 (카카오 개발자센터에서 발급)
    const kakaoApiKey = 'KakaoAK 0e0db455dcbf09ba1309daad71af4174'; // 실제 키로 교체 필요
    const apiUrl = 'https://dapi.kakao.com/v2/local/search/address.json';
    
    const response = await axios.get(apiUrl, {
      params: {
        query: keyword.trim(),
        page: page,
        size: size,
        analyze_type: 'similar' // similar: 유사도순, exact: 정확도순
      },
      headers: {
        'Authorization': kakaoApiKey,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    console.log(`📡 카카오 API 응답 상태: ${response.status}`);
    console.log(`📄 카카오 API 응답:`, JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.documents) {
      const documents = response.data.documents;
      const meta = response.data.meta || {};
      
      console.log(`✅ 검색 결과: ${documents.length}건`);
      console.log(`📊 전체 건수: ${meta.total_count || documents.length}건`);
      
      // 카카오 API 응답을 프론트엔드 형식에 맞게 변환
      const transformedResults = documents.map(item => {
        const address = item.address || {};
        const roadAddress = item.road_address || {};
        
        // 우편번호 다양한 필드에서 찾기
        const zipCode = roadAddress.zone_no || 
                       address.zip_code || 
                       roadAddress.postal_code || 
                       address.postal_code ||
                       roadAddress.zipcode ||
                       address.zipcode || '';

        return {
          roadAddr: roadAddress.address_name || address.address_name || '',
          roadAddrPart1: roadAddress.address_name || address.address_name || '',
          jibunAddr: address.address_name || '',
          zipNo: zipCode, // 개선된 우편번호 매핑
          siNm: roadAddress.region_1depth_name || address.region_1depth_name || '',
          sggNm: roadAddress.region_2depth_name || address.region_2depth_name || '',
          emdNm: roadAddress.region_3depth_name || address.region_3depth_name || '',
          rn: roadAddress.road_name || '',
          bdNm: roadAddress.building_name || '',
          // 추가 정보
          building_name: roadAddress.building_name || address.building_name || '',
          main_building_no: roadAddress.main_building_no || address.main_address_no || '',
          sub_building_no: roadAddress.sub_building_no || address.sub_address_no || '',
          x: roadAddress.x || address.x || '', // 경도
          y: roadAddress.y || address.y || ''  // 위도
        };
      });
      
      res.json({
        success: true,
        data: {
          results: transformedResults,
          total: meta.total_count || documents.length,
          page: parseInt(page),
          size: parseInt(size),
          totalPages: Math.ceil((meta.total_count || documents.length) / parseInt(size)),
          kakao_api: true, // 카카오 API 사용 표시
          is_end: meta.is_end || false // 마지막 페이지 여부
        }
      });
      
    } else {
      console.log('❌ 카카오 API 응답에 documents가 없음');
      res.json({
        success: true,
        data: {
          results: [],
          total: 0,
          page: parseInt(page),
          size: parseInt(size),
          totalPages: 0,
          message: '검색 결과가 없습니다.',
          kakao_api: true
        }
      });
    }
    
  } catch (error) {
    console.error('🚨 카카오 주소 검색 API 오류:', error.message);
    console.error('🚨 오류 세부사항:', error.response?.data || error);
    
    // 카카오 API 오류인 경우 더 자세한 정보 제공
    if (error.response?.status === 401) {
      console.error('🚨 인증 실패: API 키를 확인해주세요');
    } else if (error.response?.status === 400) {
      console.error('🚨 요청 파라미터 오류');
    }
    
    res.status(500).json({
      success: false,
      error: '주소 검색 중 오류가 발생했습니다.',
      details: error.message,
      api_error: true,
      kakao_error: error.response?.data || null
    });
  }
});

module.exports = app;