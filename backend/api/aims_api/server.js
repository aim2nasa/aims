// server.js - 문서 상태 모니터링 API 서버
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { prepareDocumentResponse, formatBytes } = require('./lib/documentStatusHelper');

const app = express();
app.use(cors());
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// Multer 설정 (메모리 저장 - 프록시용)
const upload = multer({ storage: multer.memoryStorage() });

// UTF-8 응답 헤더 설정
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

/**
 * 정규식 특수문자 이스케이프 함수
 * 정규식에서 특별한 의미를 가진 문자들을 리터럴로 처리
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} - 이스케이프된 문자열
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  // 정규식 특수문자: . * + ? ^ $ { } ( ) | [ ] \ -
  return str.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
}

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
let fallbackHandlersRegistered = false;

const registerFallbackHandlers = () => {
  if (fallbackHandlersRegistered) {
    return;
  }
  fallbackHandlersRegistered = true;

  app.use((req, res, next) => {
    res.status(404).json({
      success: false,
      error: '요청한 엔드포인트를 찾을 수 없습니다.',
      requested_url: req.originalUrl,
      method: req.method,
      available_endpoints: [
        'GET /api/health',
        'GET /api/documents',
        'GET /api/documents/status',
        'GET /api/documents/:id/status',
        'GET /api/customers',
        'POST /api/customers',
        'GET /api/customers/:id',
        'PUT /api/customers/:id',
        'DELETE /api/customers/:id'
      ],
      timestamp: new Date().toISOString()
    });
  });

  app.use((error, req, res, next) => {
    console.error('서버 오류:', error);
    res.status(500).json({
      success: false,
      error: '내부 서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  });
};

// MongoDB 연결
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);
  })
  .catch(error => console.error('MongoDB 연결 실패:', error));

/**
 * 🔴 DEPRECATED: 기존 analyzeDocumentStatus() 함수
 * → prepareDocumentResponse()로 대체됨
 *
 * 하위 호환성을 위해 잠시 유지하지만, 곧 제거될 예정
 */
function analyzeDocumentStatus(doc) {
  const response = prepareDocumentResponse(doc);
  // 기존 API 응답 형식 유지 (computed만 반환)
  return {
    stages: response.computed.uiStages,
    currentStage: response.computed.currentStage,
    overallStatus: response.computed.overallStatus,
    progress: response.computed.progress
  };
}

// prepareDocumentResponse와 formatBytes는 lib/documentStatusHelper.js로 이동됨

/**
 * 모든 문서 목록 조회 API (문서검색View용)
 */
app.get('/api/documents', async (req, res) => {
  try {
    // 파라미터 검증 및 기본값 설정
    let { page, limit = 10, offset, search, sort = 'uploadTime_desc', sortBy, sortOrder, mimeType } = req.query;

    // limit 파라미터 검증 (0 이하 또는 음수 방지)
    limit = parseInt(limit);
    if (isNaN(limit) || limit <= 0) {
      return res.status(400).json({
        success: false,
        error: 'limit 파라미터는 1 이상의 양의 정수여야 합니다.',
        provided: req.query.limit,
        expected: '1 이상의 양의 정수'
      });
    }

    // limit 최대값 제한 (DoS 공격 방지)
    if (limit > 1000) {
      return res.status(400).json({
        success: false,
        error: 'limit 파라미터는 1000 이하여야 합니다.',
        provided: limit,
        max_allowed: 1000
      });
    }

    // offset과 page 파라미터 처리 (offset 우선)
    let skip;
    if (offset !== undefined) {
      // offset이 제공된 경우 offset 사용 (프론트엔드 호환성)
      skip = parseInt(offset);
      if (isNaN(skip) || skip < 0) {
        return res.status(400).json({
          success: false,
          error: 'offset 파라미터는 0 이상의 정수여야 합니다.',
          provided: req.query.offset,
          expected: '0 이상의 정수'
        });
      }
      console.log(`📄 Offset 기반 페이지네이션: offset=${skip}, limit=${limit}`);
    } else {
      // offset이 없으면 page 사용 (기존 방식 호환)
      page = parseInt(page) || 1;
      if (page <= 0) {
        return res.status(400).json({
          success: false,
          error: 'page 파라미터는 1 이상의 양의 정수여야 합니다.',
          provided: req.query.page,
          expected: '1 이상의 양의 정수'
        });
      }
      skip = (page - 1) * limit;
      console.log(`📄 Page 기반 페이지네이션: page=${page}, limit=${limit}, skip=${skip}`);
    }

    // sortBy/sortOrder 검증 제거: sort 파라미터를 직접 사용하므로 불필요
    // 이 검증이 검색 기능을 방해하는 문제 발생
    // if (sortBy && !['size', 'time', 'name', 'fileType'].includes(sortBy)) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'sortBy 파라미터는 size, time, name, fileType 중 하나여야 합니다.',
    //     provided: sortBy,
    //     allowed: ['size', 'time', 'name', 'fileType']
    //   });
    // }

    // if (sortOrder && !['asc', 'desc'].includes(sortOrder)) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'sortOrder 파라미터는 asc 또는 desc여야 합니다.',
    //     provided: sortOrder,
    //     allowed: ['asc', 'desc']
    //   });
    // }

    let query = {};

    // 검색 조건 추가
    if (search) {
      console.log(`🔍 검색 요청 - 원본: "${search}"`);
      
      // 1. URL 디코딩 처리 (한글 인코딩 문제 해결)
      let decodedSearch;
      try {
        decodedSearch = decodeURIComponent(search);
        console.log(`📝 디코딩 완료: "${decodedSearch}"`);
      } catch (e) {
        console.warn(`⚠️ URL 디코딩 실패, 원본 사용: ${e.message}`);
        decodedSearch = search;
      }
      
      // 2. 유니코드 정규화 (한글 조합 문자 문제 해결)
      const normalizedSearch = decodedSearch.normalize('NFC');
      console.log(`🔄 정규화 완료: "${normalizedSearch}"`);

      // 3. 정규식 특수문자 이스케이프 (500 에러 방지)
      const escapedSearch = escapeRegex(normalizedSearch);
      console.log(`🛡️ 이스케이프 완료: "${escapedSearch}"`);

      // 4. 검색 조건 구성 (파일명만 검색)
      query = {
        'upload.originalName': { $regex: escapedSearch, $options: 'i' }
      };
      
      console.log(`🎯 MongoDB 쿼리:`, JSON.stringify(query, null, 2));
    }

    // 크기 정렬 또는 파일 형식 정렬이 필요한 경우 Aggregation 사용
    let documents;

    if (sort === 'size_desc' || sort === 'size_asc' || sort === 'fileType_asc' || sort === 'fileType_desc') {
      console.log(`📊 Aggregation 정렬 요청: ${sort}`);

      const pipeline = [
        // 1. 검색 조건 적용
        { $match: query },
      ];

      // 2. 정렬 종류에 따라 $addFields 추가
      if (sort === 'size_desc' || sort === 'size_asc') {
        // 크기 정렬: 문자열을 숫자로 변환
        const sortDirection = sort === 'size_desc' ? -1 : 1;
        pipeline.push({
          $addFields: {
            'meta.size_bytes_numeric': {
              $cond: {
                if: { $ne: ["$meta.size_bytes", null] },
                then: { $toDouble: "$meta.size_bytes" },
                else: 0
              }
            }
          }
        });
        pipeline.push({ $sort: { 'meta.size_bytes_numeric': sortDirection } });
        pipeline.push({ $project: { 'meta.size_bytes_numeric': 0 } });
      } else if (sort === 'fileType_asc' || sort === 'fileType_desc') {
        // 파일 형식 정렬: MIME 타입 우선순위
        const sortDirection = sort === 'fileType_desc' ? -1 : 1;
        pipeline.push({
          $addFields: {
            'fileTypePriority': {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: "$meta.mime", regex: /pdf/i } }, then: 1 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /msword|hwp/i } }, then: 2 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /sheet|excel/i } }, then: 3 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /presentation|powerpoint/i } }, then: 4 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /^image/i } }, then: 5 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /text/i } }, then: 6 },
                  { case: { $regexMatch: { input: "$meta.mime", regex: /zip|rar|7z|tar|gz/i } }, then: 7 },
                ],
                default: 99
              }
            }
          }
        });
        pipeline.push({
          $sort: {
            'fileTypePriority': sortDirection,
            'upload.originalName': 1  // 같은 형식이면 파일명순
          }
        });
        pipeline.push({ $project: { 'fileTypePriority': 0 } });
      }

      // 3. 페이징 적용
      pipeline.push({ $skip: parseInt(skip) });
      pipeline.push({ $limit: parseInt(limit) });
      
      console.log(`🔧 Aggregation Pipeline:`, JSON.stringify(pipeline, null, 2));
      
      // Aggregation 실행
      documents = await db.collection(COLLECTION_NAME)
        .aggregate(pipeline)
        .toArray();
      
      console.log(`📈 크기 정렬 결과 개수: ${documents.length}`);
      
    } else {
      // 기존 방식: 크기 정렬이 아닌 경우
      console.log(`📝 일반 정렬 요청: ${sort}`);
      
      // 정렬 조건 설정 (크기 정렬 제외)
      let sortOption = {};
      switch (sort) {
        case 'uploadTime_desc':
          sortOption = { 'upload.uploaded_at': -1 };
          break;
        case 'uploadTime_asc':
          sortOption = { 'upload.uploaded_at': 1 };
          break;
        case 'filename_asc':
          sortOption = { 'upload.originalName': 1 };
          break;
        case 'filename_desc':
          sortOption = { 'upload.originalName': -1 };
          break;
        default:
          sortOption = { 'upload.uploaded_at': -1 };
      }
      
      // 일반 쿼리 실행
      documents = await db.collection(COLLECTION_NAME)
        .find(query)
        .sort(sortOption)
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray();
    }

    // 전체 문서 수 조회
    const totalCount = await db.collection(COLLECTION_NAME).countDocuments(query);

    // 문서 데이터 변환 (단순화)
    const transformedDocuments = documents.map(doc => {
      // 단순한 상태 판단
      let status = 'processing';
      let progress = 50;

      if (doc.ocr && doc.ocr.status === 'done') {
        status = 'completed';
        progress = 100;
      } else if (doc.meta && doc.meta.meta_status === 'ok') {
        status = 'processing';
        progress = 60;
      }

      return {
        _id: doc._id,
        filename: doc.upload?.originalName || 'Unknown File',
        fileSize: doc.meta?.size_bytes || 0,
        mimeType: doc.meta?.mime || 'unknown',
        uploadTime: doc.upload?.uploaded_at || doc.createdAt,
        status: status,
        progress: progress,
        filePath: doc.upload?.destPath,
        is_annual_report: doc.is_annual_report || false,
        customer_relation: doc.customer_relation || null
      };
    });

    res.json({
      success: true,
      data: {
        documents: transformedDocuments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount: parseInt(totalCount),
          hasNext: (page * limit) < totalCount,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('문서 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '문서 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

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
        is_annual_report: doc.is_annual_report,
        customer_relation: doc.customer_relation || null,
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

    // ✅ NEW: raw + computed 구조 사용
    const response = prepareDocumentResponse(document);

    res.json({
      success: true,
      data: {
        // 📦 DB 원본 데이터 (투명하게 전달)
        raw: response.raw,

        // 🧮 UI용 계산값 (프론트엔드 편의)
        computed: response.computed,

        // 📋 기본 메타 정보 (하위 호환성)
        _id: document._id,
        originalName: document.upload?.originalName || 'Unknown File',
        uploadedAt: document.upload?.uploaded_at,
        fileSize: document.meta?.size_bytes,
        mimeType: document.meta?.mime,
        filePath: document.upload?.destPath
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
 * 문서에 Annual Report 플래그 설정 API
 */
app.patch('/api/documents/set-annual-report', async (req, res) => {
  try {
    const { filename } = req.body;

    console.log(`🏷️  [Set AR Flag] 요청 - filename: ${filename}`);

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'filename is required'
      });
    }

    // 파일명으로 문서 찾기 (최신 업로드 우선 - 동일 파일명 대응)
    const document = await db.collection(COLLECTION_NAME)
      .find({ 'upload.originalName': filename })
      .sort({ 'upload.uploaded_at': -1 })
      .limit(1)
      .toArray()
      .then(docs => docs[0]);

    if (!document) {
      console.log(`❌ [Set AR Flag] 문서를 찾을 수 없음: ${filename}`);
      return res.status(404).json({
        success: false,
        error: '문서를 찾을 수 없습니다.'
      });
    }

    // is_annual_report 필드 설정
    await db.collection(COLLECTION_NAME)
      .updateOne(
        { _id: document._id },
        { $set: { is_annual_report: true } }
      );

    console.log(`✅ [Set AR Flag] is_annual_report=true 설정 완료: ${document._id}`);

    res.json({
      success: true,
      message: 'is_annual_report 필드가 설정되었습니다.',
      document_id: document._id
    });

  } catch (error) {
    console.error('❌ [Set AR Flag] 오류:', error);
    res.status(500).json({
      success: false,
      error: 'is_annual_report 설정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 문서 삭제 API (단일 문서)
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
 * 문서 복수 삭제 API (Python API 프록시)
 */
app.delete('/api/documents', async (req, res) => {
  try {
    const { document_ids } = req.body;

    console.log(`🗑️  [문서 삭제] 복수 삭제 요청: ${document_ids?.length}건`);

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 문서 ID가 필요합니다'
      });
    }

    // Python API (포트 8080)로 프록시
    const pythonApiUrl = 'http://172.17.0.1:8080/documents';

    const response = await axios.delete(pythonApiUrl, {
      data: { document_ids },
      timeout: 30000 // 30초 타임아웃 (대량 삭제 고려)
    });

    console.log(`✅ [문서 삭제] 삭제 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [문서 삭제] 오류:', error.message);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Document Status API 서버에 연결할 수 없습니다.'
      });
    }

    if (error.response?.status) {
      return res.status(error.response.status).json(
        error.response.data || {
          success: false,
          message: '문서 삭제 중 오류가 발생했습니다.'
        }
      );
    }

    res.status(500).json({
      success: false,
      message: '문서 삭제 중 오류가 발생했습니다.',
      error: error.message
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

    // 기존 고객 정보 조회 (주소 변경 이력 저장을 위해)
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 주소 변경 여부 확인 및 이력 저장
    const newAddress = updateData.personal_info?.address;
    const oldAddress = existingCustomer.personal_info?.address;
    
    let addressChanged = false;
    if (newAddress && oldAddress) {
      // 주소 변경 여부 체크
      addressChanged = (
        newAddress.postal_code !== oldAddress.postal_code ||
        newAddress.address1 !== oldAddress.address1 ||
        newAddress.address2 !== oldAddress.address2
      );

      // 주소가 변경된 경우 이전 주소를 이력에 저장
      if (addressChanged && oldAddress) {
        const historyRecord = {
          customer_id: new ObjectId(id),
          address: oldAddress,
          changed_at: new Date(),
          reason: updateData.address_change_reason || '고객 요청',
          changed_by: updateData.modified_by || '시스템',
          notes: updateData.address_change_notes || ''
        };

        await db.collection('address_history').insertOne(historyRecord);
        console.log(`✅ 고객 ${id}의 이전 주소가 보관소에 저장됨`);
      }
    }

    // 기존 고객 정보 업데이트 로직
    const updateFields = {
      ...updateData,
      'meta.updated_at': new Date(),
      'meta.last_modified_by': updateData.modified_by || null
    };

    // 주소 변경 관련 임시 필드 제거 (DB에 저장하지 않음)
    delete updateFields.address_change_reason;
    delete updateFields.address_change_notes;

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
      message: '고객 정보가 성공적으로 수정되었습니다.',
      address_archived: addressChanged
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

    // 먼저 삭제할 고객이 존재하는지 확인
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 1. 해당 고객과 관련된 모든 관계 레코드 삭제 (Cascading Delete)
    const relationshipsDeleteResult = await db.collection('customer_relationships').deleteMany({
      $or: [
        { from_customer: new ObjectId(id) },
        { related_customer: new ObjectId(id) }
      ]
    });

    console.log(`🗑️ 고객 ${id}과 관련된 관계 레코드 ${relationshipsDeleteResult.deletedCount}개 삭제됨`);

    // 2. 고객 삭제
    const result = await db.collection(CUSTOMERS_COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      message: '고객이 성공적으로 삭제되었습니다.',
      deletedRelationships: relationshipsDeleteResult.deletedCount
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
 * Orphaned Relationships 조회 API (관리용)
 */
app.get('/api/admin/orphaned-relationships', async (req, res) => {
  try {
    console.log('🔍 Orphaned relationships 조회 시작...');
    
    // 모든 관계 레코드 조회
    const relationships = await db.collection('customer_relationships').find({}).toArray();
    console.log(`📊 총 관계 레코드 수: ${relationships.length}`);
    
    // 모든 고객 ID 조회
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { _id: 1 }).toArray())
        .map(customer => customer._id.toString())
    );
    console.log(`👥 총 고객 수: ${allCustomerIds.size}`);
    
    const orphanedRelationships = [];
    
    for (const relationship of relationships) {
      const fromCustomerId = relationship.from_customer?.toString();
      const relatedCustomerId = relationship.related_customer?.toString();
      
      const fromCustomerExists = allCustomerIds.has(fromCustomerId);
      const relatedCustomerExists = allCustomerIds.has(relatedCustomerId);
      
      if (!fromCustomerExists || !relatedCustomerExists) {
        orphanedRelationships.push({
          relationshipId: relationship._id,
          fromCustomer: fromCustomerId,
          relatedCustomer: relatedCustomerId,
          fromCustomerExists,
          relatedCustomerExists,
          relationshipType: relationship.relationship_info?.relationship_type || 'Unknown',
          createdAt: relationship.meta?.created_at
        });
      }
    }
    
    console.log(`🚨 발견된 orphaned relationships: ${orphanedRelationships.length}`);
    
    res.json({
      success: true,
      data: {
        totalRelationships: relationships.length,
        totalCustomers: allCustomerIds.size,
        orphanedRelationships: orphanedRelationships,
        orphanedCount: orphanedRelationships.length
      }
    });
    
  } catch (error) {
    console.error('Orphaned relationships 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Orphaned relationships 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * Orphaned Relationships 정리 API (관리용)
 */
app.delete('/api/admin/orphaned-relationships', async (req, res) => {
  try {
    console.log('🗑️ Orphaned relationships 정리 시작...');
    
    // 먼저 orphaned relationships 조회
    const relationships = await db.collection('customer_relationships').find({}).toArray();
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { _id: 1 }).toArray())
        .map(customer => customer._id.toString())
    );
    
    const orphanedIds = [];
    
    for (const relationship of relationships) {
      const fromCustomerId = relationship.from_customer?.toString();
      const relatedCustomerId = relationship.related_customer?.toString();
      
      const fromCustomerExists = allCustomerIds.has(fromCustomerId);
      const relatedCustomerExists = allCustomerIds.has(relatedCustomerId);
      
      if (!fromCustomerExists || !relatedCustomerExists) {
        orphanedIds.push(relationship._id);
      }
    }
    
    if (orphanedIds.length === 0) {
      return res.json({
        success: true,
        message: '정리할 orphaned relationships가 없습니다.',
        deletedCount: 0
      });
    }
    
    // Orphaned relationships 삭제
    const deleteResult = await db.collection('customer_relationships').deleteMany({
      _id: { $in: orphanedIds }
    });
    
    console.log(`✅ ${deleteResult.deletedCount}개의 orphaned relationship 레코드가 삭제되었습니다.`);
    
    res.json({
      success: true,
      message: `${deleteResult.deletedCount}개의 orphaned relationship 레코드가 정리되었습니다.`,
      deletedCount: deleteResult.deletedCount
    });
    
  } catch (error) {
    console.error('Orphaned relationships 정리 오류:', error);
    res.status(500).json({
      success: false,
      error: 'Orphaned relationships 정리에 실패했습니다.',
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

/**
 * 네이버 Geocoding API - 주소를 좌표로 변환
 */
app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '주소 정보가 필요합니다.'
      });
    }

    console.log(`🗺️ [Geocoding] 주소 → 좌표 변환 요청: "${address}"`);

    // 네이버 Geocoding API 호출
    const response = await axios.get('https://maps.apigw.ntruss.com/map-geocode/v2/geocode', {
      params: {
        query: address
      },
      headers: {
        'x-ncp-apigw-api-key-id': process.env.NAVER_MAP_ACCESS_KEY?.trim(),
        'x-ncp-apigw-api-key': process.env.NAVER_MAP_SECRET_KEY?.trim()
      },
      timeout: 5000
    });

    console.log(`📡 [Geocoding] 네이버 API 응답:`, JSON.stringify(response.data, null, 2));

    if (response.data && response.data.addresses && response.data.addresses.length > 0) {
      const firstResult = response.data.addresses[0];
      const latitude = parseFloat(firstResult.y);
      const longitude = parseFloat(firstResult.x);

      console.log(`✅ [Geocoding] 좌표 변환 성공: ${address} → (${latitude}, ${longitude})`);

      res.json({
        success: true,
        data: {
          address: address,
          latitude: latitude,
          longitude: longitude,
          roadAddress: firstResult.roadAddress || '',
          jibunAddress: firstResult.jibunAddress || '',
          addressElements: firstResult.addressElements || []
        }
      });
    } else {
      console.log(`⚠️ [Geocoding] 주소를 찾을 수 없음: ${address}`);
      res.json({
        success: false,
        error: '주소를 찾을 수 없습니다.',
        address: address
      });
    }
  } catch (error) {
    console.error('❌ [Geocoding] API 오류:', error.message);

    if (error.response?.status === 401) {
      console.error('🚨 [Geocoding] 인증 실패 - API 키 확인 필요');
    }

    res.status(500).json({
      success: false,
      error: '좌표 변환 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// ==================== Annual Report API (Phase 2 프록시) ====================

/**
 * Annual Report 체크 프록시 (Phase 2 - 파일 업로드 시 자동 감지)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 */
app.post('/api/annual-report/check', upload.single('file'), async (req, res) => {
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
 * Annual Report 파싱 프록시 (Phase 2 - 고객 선택 후 파싱)
 * 프론트엔드 → Node.js (3010) → Python (8004)
 */
app.post('/api/annual-report/parse-file', upload.single('file'), async (req, res) => {
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
app.post('/api/annual-report/parse', async (req, res) => {
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
app.get('/api/annual-report/status/:file_id', async (req, res) => {
  try {
    const { file_id } = req.params;

    console.log(`🔍 [Annual Report] 상태 조회 요청: ${file_id}`);

    const pythonApiUrl = `http://172.17.0.1:8004/annual-report/status/${file_id}`;

    const response = await axios.get(pythonApiUrl, {
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 상태 조회 오류:', error.message);

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
 * 고객의 Annual Reports 목록 조회 프록시
 */
app.get('/api/customers/:customerId/annual-reports', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit } = req.query;

    console.log(`📋 [Annual Report] 고객 Annual Reports 조회: ${customerId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

    const response = await axios.get(pythonApiUrl, {
      params: { limit },
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 조회 오류:', error.message);

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
 * 고객의 최신 Annual Report 조회 프록시
 */
app.get('/api/customers/:customerId/annual-reports/latest', async (req, res) => {
  const { customerId } = req.params; // catch 블록에서도 접근 가능하도록 밖으로 이동

  try {
    console.log(`📋 [Annual Report] 최신 Annual Report 조회: ${customerId}`);

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports/latest`;

    const response = await axios.get(pythonApiUrl, {
      timeout: 3000
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ [Annual Report] 최신 조회 오류:', error.message);

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
app.delete('/api/customers/:customerId/annual-reports', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { indices } = req.body;

    console.log(`🗑️  [Annual Report] 삭제 요청: customer=${customerId}, indices=${JSON.stringify(indices)}`);

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 항목을 선택해주세요'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

    const response = await axios.delete(pythonApiUrl, {
      data: { indices },
      timeout: 5000
    });

    console.log(`✅ [Annual Report] 삭제 완료:`, response.data);
    res.json(response.data);

  } catch (error) {
    console.error('❌ [Annual Report] 삭제 오류:', error.message);

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

// ==================== 주소 보관소 관리 API ====================

/**
 * 고객 주소 이력 조회 API
 */
app.get('/api/customers/:id/address-history', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
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

    // 주소 이력 조회 (현재 주소 + 이력)
    const addressHistory = [];
    
    // 1. 현재 주소 추가
    if (customer.personal_info?.address) {
      addressHistory.push({
        _id: 'current',
        address: customer.personal_info.address,
        changed_at: customer.meta?.updated_at || customer.meta?.created_at,
        reason: '현재 주소',
        changed_by: '시스템',
        is_current: true
      });
    }

    // 2. 이력 주소들 추가 (address_history 컬렉션에서 조회)
    const historyRecords = await db.collection('address_history')
      .find({ customer_id: new ObjectId(id) })
      .sort({ changed_at: -1 })
      .toArray();

    historyRecords.forEach(record => {
      addressHistory.push({
        _id: record._id,
        address: record.address,
        changed_at: record.changed_at,
        reason: record.reason || '주소 변경',
        changed_by: record.changed_by || '시스템',
        notes: record.notes,
        is_current: false
      });
    });

    res.json({
      success: true,
      data: addressHistory
    });

  } catch (error) {
    console.error('주소 이력 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '주소 이력 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 주소 이력 저장 API (내부 사용)
 */
app.post('/api/customers/:id/address-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { previous_address, reason, changed_by, notes } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    if (!previous_address) {
      return res.status(400).json({
        success: false,
        error: '이전 주소 정보가 필요합니다.'
      });
    }

    // 주소 이력 저장
    const historyRecord = {
      customer_id: new ObjectId(id),
      address: previous_address,
      changed_at: new Date(),
      reason: reason || '주소 변경',
      changed_by: changed_by || '시스템',
      notes: notes || ''
    };

    await db.collection('address_history').insertOne(historyRecord);

    res.json({
      success: true,
      message: '주소 이력이 저장되었습니다.',
      history_id: historyRecord._id
    });

  } catch (error) {
    console.error('주소 이력 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: '주소 이력 저장에 실패했습니다.',
      details: error.message
    });
  }
});

// ==================== MongoDB 연결 & 서버 시작 ====================

// 고객 관계 관리 라우트 설정
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);

    // 고객 관계 라우트 설정
    setupCustomerRelationshipRoutes(app, db);
    registerFallbackHandlers();
  })
  .catch(error => {
    console.error('MongoDB 연결 실패:', error);
    registerFallbackHandlers();
  });

const PORT = process.env.PORT || 3010;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀🚀🚀 ================================');
  console.log(`🚀 문서 상태 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🚀 서버 시간: ${new Date().toISOString()}`);
  console.log(`🚀 바인딩: 0.0.0.0:${PORT} (모든 네트워크 인터페이스)`);
  console.log('🚀🚀🚀 ================================\n');

  console.log(`📋 API 엔드포인트:`);
  console.log(`  GET  /api/documents - 모든 문서 목록 조회 (검색, 정렬, 페이징)`);
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
  console.log(`  GET /api/admin/orphaned-relationships - Orphaned relationships 조회`);
  console.log(`  DELETE /api/admin/orphaned-relationships - Orphaned relationships 정리`);
  console.log(`  POST /api/customers/:id/documents - 고객에 문서 연결`);
  console.log(`  GET  /api/customers/:id/documents - 고객 관련 문서 목록`);

  console.log(`\n🏠 Address Search API:`);
  console.log(`  GET  /api/address/search - 한국 주소 검색 (정부 API 프록시)`);
  console.log(`  POST /api/geocode - 주소 → 좌표 변환 (네이버 Geocoding API)`);

  console.log(`\n📊 Annual Report APIs:`);
  console.log(`  POST /api/annual-report/parse - Annual Report 파싱 요청`);
  console.log(`  GET  /api/annual-report/status/:file_id - 파싱 상태 조회`);
  console.log(`  GET  /api/customers/:customerId/annual-reports - 고객 Annual Reports 목록`);
  console.log(`  GET  /api/customers/:customerId/annual-reports/latest - 최신 Annual Report 조회`);

  console.log(`\n🔍 디버깅 활성화: 모든 HTTP 요청/응답 로깅 중...`);
  console.log(`=============================================\n`);
});

module.exports = app;
