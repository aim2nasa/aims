// server.js - 문서 상태 모니터링 API 서버
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB 연결 설정
const MONGO_URI = 'mongodb://tars:27017/';
const DB_NAME = 'docupload';
const COLLECTION_NAME = 'files';

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`문서 상태 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`API 엔드포인트:`);
  console.log(`  GET  /api/documents/status - 문서 목록 및 상태 조회`);
  console.log(`  GET  /api/documents/:id/status - 특정 문서 상세 상태`);
  console.log(`  GET  /webhook/get-status/:document_id - 간단한 문서 상태 조회 (당신이 원했던 엔드포인트)`);
  console.log(`  GET  /api/documents/statistics - 처리 상태 통계`);
  console.log(`  POST /api/documents/:id/retry - 문서 재처리`);
  console.log(`  GET  /api/documents/status/live - 실시간 상태 (폴링용)`);
  console.log(`  DELETE /api/documents/:id - 문서 삭제`);
  console.log(`  GET  /api/health - 헬스체크`);
});

module.exports = app;