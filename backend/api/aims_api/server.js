// server.js - 문서 상태 모니터링 API 서버
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { prepareDocumentResponse, formatBytes, isConvertibleFile } = require('./lib/documentStatusHelper');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('./lib/timeUtils');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const { generateToken, authenticateJWT, authenticateJWTorAPIKey, requireRole } = require('./middleware/auth');
const { getTierDefinitions } = require('./lib/storageQuotaService');
const metricsCollector = require('./lib/metricsCollector');
const activityLogger = require('./lib/activityLogger');

const app = express();

// Python API URL (RAG/문서처리 서버)
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// CORS 허용 origin 목록
const ALLOWED_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // origin이 없는 경우 (same-origin 또는 curl 등) 허용
    if (!origin) return callback(null, true);
    // 허용된 origin인 경우 허용
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));
app.use(cookieParser());

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

/**
 * customerId를 안전하게 ObjectId로 변환
 * 문자열이면 ObjectId로 변환, 이미 ObjectId면 그대로 반환
 * @param {string|ObjectId|null} id - 변환할 ID
 * @returns {ObjectId|null} - ObjectId 또는 null
 */
function toSafeObjectId(id) {
  if (!id) return null;
  if (typeof id === 'string') {
    try {
      return new ObjectId(id);
    } catch (err) {
      console.error(`❌ Invalid ObjectId string: ${id}`);
      return null;
    }
  }
  if (id instanceof ObjectId) return id;
  console.error(`❌ Unexpected customerId type: ${typeof id}`);
  return null;
}

/**
 * 명백한 BIN 타입 체크 (OCR 비용 절감)
 * FILE_BADGE_SYSTEM.md 참조
 * @param {string} mimeType - MIME 타입
 * @returns {boolean} - BIN 타입 여부
 */
function isBinaryMimeType(mimeType) {
  if (!mimeType) return false;

  const BIN_MIME_TYPES = [
    // 압축
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',

    // 오디오
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/flac',
    'audio/aac',
    'audio/ogg',

    // 비디오
    'video/mp4',
    'video/mpeg',
    'video/x-msvideo',
    'video/quicktime',
    'video/x-matroska',
    'video/x-ms-wmv',

    // 실행 파일
    'application/x-msdownload',
    'application/x-executable',
    'application/x-sharedlib',
  ];

  return BIN_MIME_TYPES.includes(mimeType.toLowerCase());
}

// 🔍 포괄적인 요청 디버깅 미들웨어 (모든 요청 로깅)
app.use((req, res, next) => {
  const timestamp = utcNowISO();
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
const ANALYTICS_DB_NAME = 'aims_analytics';
const COLLECTION_NAME = 'files';
const CUSTOMERS_COLLECTION = 'customers';
const AGENTS_COLLECTION = 'agents';
const CASES_COLLECTION = 'cases';

// Qdrant 설정
const QDRANT_HOST = 'localhost';
const QDRANT_PORT = 6333;
const QDRANT_COLLECTION = 'docembed';

// 고객 관계 관리 라우트 import
const { setupCustomerRelationshipRoutes } = require('./customer-relationships-routes');
// 개인 파일 관리 라우트 import
const personalFilesRoutes = require('./routes/personal-files-routes');
// PDF 변환 서비스 import
const pdfConversionService = require('./lib/pdfConversionService');

let db;
let fallbackHandlersRegistered = false;

// ========================
// PDF 변환 백그라운드 처리
// ========================

/**
 * 문서를 백그라운드에서 PDF로 변환
 * @param {ObjectId|string} fileId - 파일 ID
 * @param {string} inputPath - 원본 파일 경로
 */
async function convertDocumentInBackground(fileId, inputPath) {
  const fileIdStr = fileId.toString();

  try {
    // 1. 상태를 processing으로 업데이트
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(fileIdStr) },
      { $set: { 'upload.conversion_status': 'processing' } }
    );

    console.log(`[PDF변환] 변환 시작: ${inputPath}`);

    // 2. PDF 변환 실행
    const pdfPath = await pdfConversionService.convertDocument(inputPath);

    // 3. 성공 시 DB 업데이트
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(fileIdStr) },
      {
        $set: {
          'upload.convPdfPath': pdfPath,
          'upload.converted_at': utcNowDate(),
          'upload.conversion_status': 'completed'
        }
      }
    );

    console.log(`[PDF변환] 변환 완료: ${pdfPath}`);
  } catch (error) {
    console.error(`[PDF변환] 변환 실패 (${fileIdStr}): ${error.message}`);

    // 4. 실패 시 에러 기록
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(fileIdStr) },
      {
        $set: {
          'upload.conversion_status': 'failed',
          'upload.conversion_error': error.message
        }
      }
    );
  }
}

/**
 * 문서의 PDF 변환이 필요한지 확인하고 트리거
 * @param {Object} document - 문서 객체
 * @returns {string} 'triggered' | 'not_required' | 'already_done' | 'already_processing'
 */
async function triggerPdfConversionIfNeeded(document) {
  const originalName = document.upload?.originalName;
  const destPath = document.upload?.destPath;
  const conversionStatus = document.upload?.conversion_status;

  // 이미 변환 완료
  if (conversionStatus === 'completed') {
    return 'already_done';
  }

  // 이미 변환 중
  if (conversionStatus === 'processing' || conversionStatus === 'pending') {
    return 'already_processing';
  }

  // 변환 가능 여부 체크
  if (!pdfConversionService.isConvertible(originalName)) {
    // 이미 프리뷰 가능하거나 지원하지 않는 형식
    if (!conversionStatus) {
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: document._id },
        { $set: { 'upload.conversion_status': 'not_required' } }
      );
    }
    return 'not_required';
  }

  // 파일 경로가 없으면 변환 불가
  if (!destPath) {
    console.warn(`[PDF변환] 파일 경로 없음: ${document._id}`);
    return 'not_required';
  }

  // 변환 상태를 pending으로 설정 후 백그라운드 변환 시작
  await db.collection(COLLECTION_NAME).updateOne(
    { _id: document._id },
    { $set: { 'upload.conversion_status': 'pending' } }
  );

  // 비동기로 변환 시작 (await 없음)
  convertDocumentInBackground(document._id, destPath);

  return 'triggered';
}

// ========================
// PDF 변환 프록시 엔드포인트 (POC용)
// ========================

const PDF_CONVERTER_HOST = process.env.PDF_CONVERTER_HOST || 'localhost';
const PDF_CONVERTER_PORT = process.env.PDF_CONVERTER_PORT || 3011;

/**
 * PDF 변환 프록시 - 파일 업로드를 PDF 변환 서버로 전달
 * POST /api/pdf/convert
 * multipart/form-data로 파일 전송
 */
app.post('/api/pdf/convert', upload.single('file'), async (req, res) => {
  const startTime = Date.now();

  if (!req.file) {
    return res.status(400).json({ error: '파일이 필요합니다.' });
  }

  try {
    // FormData 생성
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // PDF 변환 서버로 프록시
    const response = await axios.post(
      `http://${PDF_CONVERTER_HOST}:${PDF_CONVERTER_PORT}/convert`,
      formData,
      {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 120000,  // 2분 타임아웃
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const conversionTime = Date.now() - startTime;

    // PDF 응답 전달
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(req.file.originalname.replace(/\.[^/.]+$/, '.pdf'))}"`,
      'X-Conversion-Time': conversionTime.toString()
    });
    res.send(Buffer.from(response.data));

  } catch (error) {
    console.error('[PDF Proxy] 변환 실패:', error.message);

    // 에러 응답 처리
    if (error.response) {
      const errorMessage = error.response.data
        ? Buffer.from(error.response.data).toString('utf-8')
        : '변환 실패';
      try {
        const errorJson = JSON.parse(errorMessage);
        return res.status(error.response.status).json(errorJson);
      } catch {
        return res.status(error.response.status).json({ error: errorMessage });
      }
    }

    res.status(500).json({ error: `PDF 변환 서버 오류: ${error.message}` });
  }
});

// Qdrant 클라이언트 인스턴스 (서버 1.9.0과 클라이언트 1.15.x 호환성 문제 해결)
const qdrantClient = new QdrantClient({
  host: QDRANT_HOST,
  port: QDRANT_PORT,
  checkCompatibility: false
});

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
      timestamp: utcNowISO()
    });
  });

  app.use((error, req, res, next) => {
    console.error('서버 오류:', error);
    res.status(500).json({
      success: false,
      error: '내부 서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: utcNowISO()
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
app.get('/api/documents', authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

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

    // ⭐ ownerId 필터 추가 (사용자 계정 기능)
    // ⭐ 전체 문서 보기: 고객 문서만 표시 (설계사 개인 파일 제외)
    // customerId가 ownerId와 같으면 개인 파일이므로 제외
    // customerId는 ObjectId, ownerId는 string이므로 $expr + $toString 사용
    let query = {
      ownerId: userId,
      customerId: { $exists: true, $ne: null },
      $expr: { $ne: [{ $toString: '$customerId' }, userId] }  // customerId !== ownerId
    };

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
      query['upload.originalName'] = { $regex: escapedSearch, $options: 'i' };

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

    // customerId가 있는 문서의 customer_id 수집
    // 🔥 문자열 customerId 자동 수정
    const docsToFix = [];
    const customerIds = documents
      .filter(doc => doc.customerId)
      .map(doc => {
        const id = doc.customerId;

        // 문자열이면 ObjectId로 변환하고 수정 대상에 추가
        if (typeof id === 'string') {
          const objectId = toSafeObjectId(id);
          if (objectId && doc.customerId) {
            docsToFix.push({ _id: doc._id, customerId: objectId });
          }
          return objectId;
        }
        return id;
      })
      .filter(id => id !== null);

    // 문자열 customerId 일괄 수정 (비동기)
    if (docsToFix.length > 0) {
      console.log(`🔧 [AUTO-FIX] ${docsToFix.length}개 문서의 customerId를 문자열→ObjectId로 변환 중...`);
      Promise.all(
        docsToFix.map(doc =>
          db.collection(COLLECTION_NAME).updateOne(
            { _id: doc._id },
            { $set: { customerId: doc.customerId } }
          )
        )
      ).then(() => {
        console.log(`✅ [AUTO-FIX] customerId 변환 완료`);
      }).catch(err => {
        console.error(`❌ [AUTO-FIX] customerId 변환 실패:`, err);
      });
    }

    // 고객 정보 일괄 조회
    const customerMap = {};
    if (customerIds.length > 0) {
      console.log('[DEBUG] customerIds:', customerIds);
      const customers = await db.collection('customers')
        .find({ _id: { $in: customerIds } })
        .project({ _id: 1, 'personal_info.name': 1 })
        .toArray();

      console.log('[DEBUG] customers found:', customers.length);
      console.log('[DEBUG] customers:', JSON.stringify(customers, null, 2));

      customers.forEach(customer => {
        customerMap[customer._id.toString()] = customer.personal_info?.name || null;
      });

      console.log('[DEBUG] customerMap:', customerMap);
    }

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

      // customer_relation 변환 (ObjectId를 string으로, customer_name 추가)
      let customerRelation = null;
      const effectiveCustomerId = doc.customerId;
      if (effectiveCustomerId) {
        const customerId = effectiveCustomerId.toString();
        customerRelation = {
          customer_id: customerId,
          customer_name: customerMap[customerId] || null,
          notes: doc.customer_notes || ''
        };
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
        customer_relation: customerRelation,
        ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
        customerId: doc.customerId || null  // 🆕 내 파일 기능
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
app.get('/api/documents/status', authenticateJWT, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, sort, customerLink, fileScope = 'excludeMyFiles' } = req.query;
    const skip = (page - 1) * limit;

    // 🔍 정렬 파라미터 디버깅
    console.error(`\n🔍🔍🔍 [정렬 디버깅] sort=${sort}, page=${page}, limit=${limit}, fileScope=${fileScope}`);

    // userId 추출 (헤더 또는 쿼리)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // 필터 조건 구성 - ownerId 필터 추가
    // ⭐ 기본적으로 고객 문서만 표시 (설계사 개인 파일 제외)
    // customerId가 ownerId와 같으면 개인 파일이므로 제외
    let filter = {
      ownerId: userId,
      customerId: { $exists: true, $ne: null },
      $expr: { $ne: [{ $toString: '$customerId' }, userId] }  // customerId !== ownerId (타입 변환 필요)
    };

    // 🍎 파일 범위 필터 추가
    if (fileScope === 'excludeMyFiles') {
      // 내 파일 제외: 기본 필터와 동일 (이미 적용됨)
      // 추가 조건 없음
    } else if (fileScope === 'onlyMyFiles') {
      // 내 파일만: customerId === ownerId (개인 파일만)
      filter = {
        ownerId: userId,
        $expr: { $eq: [{ $toString: '$customerId' }, userId] }
      };
    } else if (fileScope === 'all') {
      // 모든 파일: 개인 파일 포함
      filter = { ownerId: userId };
    }

    // 🍎 고객 연결 필터 추가
    if (customerLink === 'linked') {
      filter['customerId'] = { $exists: true, $ne: null };
    } else if (customerLink === 'unlinked') {
      filter['customerId'] = { $exists: false };
    }

    if (search) {
      filter['upload.originalName'] = { $regex: search, $options: 'i' };
    }

    // 🔍 필터 디버깅
    console.log(`\n🔍 [/api/documents/status] fileScope=${fileScope}, userId=${userId}`);
    console.log(`🔍 Filter: ${JSON.stringify(filter, null, 2)}`);

    // 문서 조회 및 정렬
    let documents;
    const totalCount = await db.collection(COLLECTION_NAME).countDocuments(filter);
    console.log(`🔍 Total count: ${totalCount}`);

    // fileSize, mimeType, customer 정렬은 aggregation 사용
    if (sort === 'customer_asc' || sort === 'customer_desc') {
      // customer 정렬: customers 컬렉션과 join하여 고객 이름으로 정렬
      const sortOrder = sort === 'customer_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'customers',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer_info'
          }
        },
        {
          $addFields: {
            // 고객 이름 추출 (없으면 빈 문자열)
            customer_name: {
              $ifNull: [
                { $arrayElemAt: ['$customer_info.personal_info.name', 0] },
                ''
              ]
            }
          }
        },
        // 고객 없는 문서를 맨 뒤로 보내기 위해 두 단계 정렬
        { $sort: {
            customer_name: sortOrder,
            'upload.uploaded_at': -1
          }
        },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
    } else if (sort === 'fileSize_asc' || sort === 'fileSize_desc') {
      const sortOrder = sort === 'fileSize_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $addFields: {
            size_bytes_num: { $toLong: '$meta.size_bytes' }
          }
        },
        { $sort: { size_bytes_num: sortOrder, 'upload.uploaded_at': -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
    } else if (sort === 'mimeType_asc' || sort === 'mimeType_desc') {
      // mimeType 정렬: 확장자 알파벳 순
      const sortOrder = sort === 'mimeType_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $addFields: {
            // 파일명에서 확장자 추출
            fileExtension: {
              $toLower: {
                $arrayElemAt: [
                  { $split: ['$upload.originalName', '.'] },
                  -1
                ]
              }
            }
          }
        },
        { $sort: { fileExtension: sortOrder, 'upload.originalName': 1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();
    } else if (sort === 'badgeType_asc' || sort === 'badgeType_desc') {
      // badgeType 정렬: OCR/TXT/BIN 타입별 정렬
      console.error(`\n⚡⚡⚡ [badgeType 정렬 실행] sort=${sort}, sortOrder=${sort === 'badgeType_asc' ? 1 : -1}`);
      const sortOrder = sort === 'badgeType_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $addFields: {
            // badgeType 계산 로직 (FILE_BADGE_SYSTEM.md OCR 비용 최적화)
            badgeType: {
              $cond: {
                // Level 1: meta.full_text에 실제 데이터가 있으면 "TXT"
                if: {
                  $and: [
                    { $ne: [{ $ifNull: ["$meta.full_text", null] }, null] },
                    { $ne: ["$meta.full_text", ""] }
                  ]
                },
                then: "TXT",
                else: {
                  $cond: {
                    // Level 2: 명백한 BIN MIME 체크 (OCR 건너뜀 💰)
                    if: {
                      $in: [
                        { $toLower: { $ifNull: ["$metadata.mimetype", ""] } },
                        [
                          // 압축
                          "application/zip",
                          "application/x-zip-compressed",
                          "application/x-rar-compressed",
                          "application/x-7z-compressed",
                          "application/x-tar",
                          "application/gzip",
                          "application/x-bzip2",
                          // 오디오
                          "audio/mpeg",
                          "audio/mp4",
                          "audio/wav",
                          "audio/flac",
                          "audio/aac",
                          "audio/ogg",
                          // 비디오
                          "video/mp4",
                          "video/mpeg",
                          "video/x-msvideo",
                          "video/quicktime",
                          "video/x-matroska",
                          "video/x-ms-wmv",
                          // 실행 파일
                          "application/x-msdownload",
                          "application/x-executable",
                          "application/x-sharedlib"
                        ]
                      ]
                    },
                    then: "BIN",
                    else: {
                      $cond: {
                        // Level 3: ocr.full_text 있으면 "OCR"
                        if: { $ne: [{ $ifNull: ["$ocr.full_text", null] }, null] },
                        then: "OCR",
                        // Level 4: 나머지 모두 "BIN"
                        else: "BIN"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        { $sort: { badgeType: sortOrder, 'upload.uploaded_at': -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]).toArray();

      // 디버깅: badgeType 계산 결과 확인
      if (documents.length > 0) {
        console.error('📊📊📊 [badgeType 정렬 결과]');
        documents.slice(0, 5).forEach(doc => {
          const hasMetaFullText = doc.meta?.full_text ? 'O' : 'X';
          const hasOcrFullText = doc.ocr?.full_text ? 'O' : 'X';
          console.error(`  - ${doc.upload?.originalName}: badgeType=${doc.badgeType}, meta.full_text=${hasMetaFullText}, ocr.full_text=${hasOcrFullText}, ocr.confidence=${doc.ocr?.confidence}`);
        });
      }
    } else if (sort === 'uploadDate_asc' || sort === 'uploadDate_desc' || !sort) {
      // 🔧 uploadDate 정렬: Date/String 혼합 타입 대응을 위해 $toDate 사용
      const sortOrder = sort === 'uploadDate_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $addFields: {
            uploaded_at_normalized: { $toDate: '$upload.uploaded_at' }
          }
        },
        { $sort: { uploaded_at_normalized: sortOrder } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        { $project: { uploaded_at_normalized: 0 } }
      ]).toArray();
    } else {
      // 일반 정렬 조건 구성 (status, filename)
      let sortCriteria = { 'upload.uploaded_at': -1 }; // 기본: 최신순
      if (sort === 'status_asc') {
        sortCriteria = { overallStatus: 1, 'upload.uploaded_at': -1 };
      } else if (sort === 'status_desc') {
        sortCriteria = { overallStatus: -1, 'upload.uploaded_at': -1 };
      } else if (sort === 'filename_asc') {
        sortCriteria = { 'upload.originalName': 1, 'upload.uploaded_at': -1 };
      } else if (sort === 'filename_desc') {
        sortCriteria = { 'upload.originalName': -1, 'upload.uploaded_at': -1 };
      }

      documents = await db.collection(COLLECTION_NAME)
        .find(filter)
        .sort(sortCriteria)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
    }

    // customerId가 있는 문서의 customer_id 수집
    // 🔥 문자열 customerId 자동 수정
    const docsToFix = [];
    const customerIds = documents
      .filter(doc => doc.customerId)
      .map(doc => {
        const id = doc.customerId;

        // 문자열이면 ObjectId로 변환하고 수정 대상에 추가
        if (typeof id === 'string') {
          const objectId = toSafeObjectId(id);
          if (objectId && doc.customerId) {
            docsToFix.push({ _id: doc._id, customerId: objectId });
          }
          return objectId;
        }
        return id;
      })
      .filter(id => id !== null);

    // 문자열 customerId 일괄 수정 (비동기)
    if (docsToFix.length > 0) {
      console.log(`🔧 [AUTO-FIX] ${docsToFix.length}개 문서의 customerId를 문자열→ObjectId로 변환 중...`);
      Promise.all(
        docsToFix.map(doc =>
          db.collection(COLLECTION_NAME).updateOne(
            { _id: doc._id },
            { $set: { customerId: doc.customerId } }
          )
        )
      ).then(() => {
        console.log(`✅ [AUTO-FIX] customerId 변환 완료`);
      }).catch(err => {
        console.error(`❌ [AUTO-FIX] customerId 변환 실패:`, err);
      });
    }

    // 고객 정보 일괄 조회
    const customerMap = {};
    if (customerIds.length > 0) {
      const customers = await db.collection('customers')
        .find({ _id: { $in: customerIds } })
        .project({ _id: 1, 'personal_info.name': 1 })
        .toArray();

      customers.forEach(customer => {
        customerMap[customer._id.toString()] = customer.personal_info?.name || null;
      });
    }

    // 각 문서의 상태 분석 + DB 업데이트
    const documentsWithStatus = await Promise.all(documents.map(async (doc) => {
      // overallStatus 없거나 completed 아니면 DB 업데이트
      if (!doc.overallStatus || doc.overallStatus !== 'completed') {
        const { computed } = prepareDocumentResponse(doc);
        const newStatus = computed.overallStatus;

        // DB에 저장된 값과 다르면 업데이트
        if (doc.overallStatus !== newStatus) {
          await db.collection(COLLECTION_NAME).updateOne(
            { _id: doc._id },
            {
              $set: {
                overallStatus: newStatus,
                overallStatusUpdatedAt: utcNowDate()
              }
            }
          );
          // doc 객체도 업데이트 (이후 응답용)
          doc.overallStatus = newStatus;
        }
      }

      // customer_relation 변환 (ObjectId를 string으로, customer_name 추가)
      let customerRelation = null;
      const effectiveCustomerId = doc.customerId;
      if (effectiveCustomerId) {
        const customerId = effectiveCustomerId.toString();
        customerRelation = {
          customer_id: customerId,
          customer_name: customerMap[customerId] || null,
          notes: doc.customer_notes || ''
        };
      }

      // 기존 analyzeDocumentStatus 방식대로 응답 구성
      const statusInfo = analyzeDocumentStatus(doc);

      // badgeType 계산 (MongoDB aggregation 결과 없으면 JavaScript로 계산)
      let badgeType = doc.badgeType;
      if (!badgeType) {
        // Level 1: meta.full_text에 실제 데이터가 있으면 TXT
        if (doc.meta?.full_text && doc.meta.full_text.trim().length > 0) {
          badgeType = 'TXT';
        }
        // Level 2: ocr.full_text 있으면 OCR (MIME 무관)
        else if (doc.ocr?.full_text) {
          badgeType = 'OCR';
        }
        // Level 3: 나머지 BIN
        else {
          badgeType = 'BIN';
        }
      }

      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        is_annual_report: doc.is_annual_report,
        customer_relation: customerRelation,
        badgeType: badgeType,  // 🔥 항상 badgeType 포함
        conversionStatus: doc.upload?.conversion_status || null,  // 🔥 PDF 변환 상태
        isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),   // 🔥 PDF 변환 가능 여부 (destPath 없으면 originalName으로 확인)
        meta: doc.meta,
        ocr: doc.ocr,
        docembed: doc.docembed,
        ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
        customerId: doc.customerId || null,  // 🆕 내 파일 기능
        folderId: doc.folderId || null,  // 🆕 내 파일 폴더 구조
        ...statusInfo
      };
    }));

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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.get('/api/documents/:id/status', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 문서만 조회 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ✅ NEW: raw + computed 구조 사용
    const response = prepareDocumentResponse(document);

    // 🆕 customer_relation 동적 생성 (customerId가 있는 경우)
    let customerRelation = null;
    if (document.customerId) {
      const customerId = document.customerId.toString();
      // 고객 이름 조회
      const customer = await db.collection('customers')
        .findOne(
          { _id: new ObjectId(customerId) },
          { projection: { 'personal_info.name': 1 } }
        );
      customerRelation = {
        customer_id: customerId,
        customer_name: customer?.personal_info?.name || null,
        notes: document.customer_notes || ''
      };
    }

    // raw에 customer_relation 업데이트
    response.raw.customer_relation = customerRelation;

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
        uploadedAt: normalizeTimestamp(document.upload?.uploaded_at),
        fileSize: document.meta?.size_bytes,
        mimeType: document.meta?.mime,
        filePath: document.upload?.destPath,
        previewFilePath: response.computed?.previewFilePath || null,  // 📄 프리뷰용 경로 (변환 PDF 또는 원본)
        customer_relation: customerRelation  // 🆕 하위 호환성용 추가
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
      last_updated: utcNowISO()
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
app.get('/api/documents/statistics', authenticateJWT, async (req, res) => {
  try {
    // userId 추출 (헤더 또는 쿼리)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // 사용자별 필터링 (ownerId 기준)
    const filter = { ownerId: userId };
    const documents = await db.collection(COLLECTION_NAME).find(filter).toArray();

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
      },
      badgeTypes: {
        TXT: 0,
        OCR: 0,
        BIN: 0
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

      // badgeType 계산 (FILE_BADGE_SYSTEM.md OCR 비용 최적화)
      let badgeType = 'BIN';

      // Level 1: meta.full_text 확인
      if (doc.meta?.full_text && doc.meta.full_text.trim().length > 0) {
        badgeType = 'TXT';
      }
      // Level 2: 명백한 BIN MIME 체크 (OCR 건너뜀 💰)
      else if (isBinaryMimeType(doc.metadata?.mimetype)) {
        badgeType = 'BIN';
      }
      // Level 3: OCR 텍스트 확인
      else if (doc.ocr?.full_text) {
        badgeType = 'OCR';
      }
      // Level 4: 나머지 모두 BIN (기본값 유지)

      stats.badgeTypes[badgeType]++;
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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.post('/api/documents/:id/retry', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body; // 'ocr' 또는 'docembed'

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 문서만 재처리 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    let updateFields = {};

    if (stage === 'ocr') {
      // OCR 재처리: ocr 필드 초기화 후 큐에 다시 추가
      updateFields = {
        $unset: { 'ocr.status': '', 'ocr.error': '', 'ocr.failed_at': '' },
        $set: {
          'ocr.queue': true,
          'ocr.queue_at': utcNowISO()
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
    } else if (stage === 'pdf_conversion') {
      // PDF 변환 재시도: 실패한 경우에만 1회 재시도 허용
      const currentStatus = document.upload?.conversion_status;
      const retryCount = document.upload?.conversion_retry_count || 0;

      if (currentStatus !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'PDF 변환이 실패 상태일 때만 재시도할 수 있습니다.'
        });
      }

      if (retryCount >= 1) {
        return res.status(400).json({
          success: false,
          error: 'PDF 변환 재시도는 1회만 가능합니다.'
        });
      }

      const destPath = document.upload?.destPath;
      if (!destPath) {
        return res.status(400).json({
          success: false,
          error: '파일 경로를 찾을 수 없습니다.'
        });
      }

      // 재시도 카운트 증가 및 상태 초기화
      await db.collection(COLLECTION_NAME).updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            'upload.conversion_status': 'pending',
            'upload.conversion_retry_count': retryCount + 1
          },
          $unset: {
            'upload.conversion_error': ''
          }
        }
      );

      // 비동기로 변환 시작
      convertDocumentInBackground(new ObjectId(id), destPath);

      return res.json({
        success: true,
        message: 'PDF 변환 재시도가 시작되었습니다.',
        retry_count: retryCount + 1
      });
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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.get('/api/documents/status/live', authenticateJWT, async (req, res) => {
  try {
    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // ⭐ 소유권 검증: 해당 설계사의 문서만 조회
    const processingDocs = await db.collection(COLLECTION_NAME)
      .find({
        ownerId: userId,
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
 * 문서에 Annual Report 플래그 및 메타데이터 설정 API
 */
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.patch('/api/documents/set-annual-report', authenticateJWT, async (req, res) => {
  try {
    const { filename, metadata, customer_id } = req.body;

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    console.log(`🏷️  [Set AR Flag] 요청 - filename: ${filename}, customer_id: ${customer_id}, metadata:`, metadata);

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'filename is required'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 문서만 수정 가능
    const document = await db.collection(COLLECTION_NAME)
      .find({ 'upload.originalName': filename, ownerId: userId })
      .sort({ 'upload.uploaded_at': -1 })
      .limit(1)
      .toArray()
      .then(docs => docs[0]);

    if (!document) {
      console.log(`❌ [Set AR Flag] 문서를 찾을 수 없음: ${filename}`);
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // is_annual_report 필드 및 메타데이터 설정
    const updateFields = { is_annual_report: true };

    // 🔗 고객 ID가 제공된 경우 customerId 설정 (고객 문서함에서 보이도록)
    if (customer_id && ObjectId.isValid(customer_id)) {
      updateFields.customerId = new ObjectId(customer_id);
      console.log(`🔗 [Set AR Flag] customerId 설정: ${customer_id}`);
    }

    // 📊 초기 overallStatus 설정 (전체문서보기에서 진행 상태 표시)
    updateFields.overallStatus = 'processing';
    updateFields.overallStatusUpdatedAt = new Date();

    // 메타데이터가 제공된 경우 추가
    if (metadata) {
      updateFields.ar_metadata = {
        issue_date: metadata.issue_date || null,
        customer_name: metadata.customer_name || null,
        fsr_name: metadata.fsr_name || null,
        report_title: metadata.report_title || null
      };
      // AR 파싱 상태 초기화
      updateFields.ar_parsing_status = 'pending';
    }

    await db.collection(COLLECTION_NAME)
      .updateOne(
        { _id: document._id },
        { $set: updateFields }
      );

    console.log(`✅ [Set AR Flag] is_annual_report=true 설정 완료: ${document._id}`, updateFields);

    // 🔗 고객의 documents 배열에도 추가 (고객 문서함에서 보이도록)
    if (customer_id && ObjectId.isValid(customer_id)) {
      try {
        // 이미 있는지 확인 후 추가 (중복 방지)
        const customerObjectId = new ObjectId(customer_id);
        const customer = await db.collection('customers').findOne({
          _id: customerObjectId,
          'documents.document_id': document._id
        });

        if (!customer) {
          // documents 배열에 추가
          await db.collection('customers').updateOne(
            { _id: customerObjectId },
            {
              $push: {
                documents: {
                  document_id: document._id,
                  linked_at: new Date(),
                  link_type: 'auto'
                }
              }
            }
          );
          console.log(`🔗 [Set AR Flag] 고객 documents 배열에 추가: ${customer_id}`);
        } else {
          console.log(`ℹ️ [Set AR Flag] 이미 고객 documents 배열에 존재: ${customer_id}`);
        }
      } catch (linkError) {
        console.error(`⚠️ [Set AR Flag] 고객 documents 연결 실패:`, linkError);
        // 연결 실패해도 AR 플래그 설정은 성공으로 처리
      }
    }

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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.delete('/api/documents/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 문서 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 문서만 삭제 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ========== 고객 참조 정리 추가 ==========
    // 문서 삭제 전에 이 문서를 참조하는 모든 고객의 documents 배열에서 제거
    try {
      const customersUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
        { 'documents.document_id': new ObjectId(id) },
        {
          $pull: { documents: { document_id: new ObjectId(id) } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );
      if (customersUpdateResult.modifiedCount > 0) {
        console.log(`✅ 고객 참조 정리: ${customersUpdateResult.modifiedCount}명의 고객에서 문서 참조 제거`);
      }
    } catch (customerError) {
      console.warn('⚠️ 고객 참조 정리 실패:', customerError.message);
      // 고객 참조 정리 실패해도 문서 삭제는 진행
    }
    // ========================================

    // ========== Annual Report 파싱 데이터 삭제 ==========
    // 매칭 조건: customer_name + issue_date가 같으면 한 쌍
    if (document.is_annual_report) {
      try {
        console.log(`🗑️  [AR 삭제] Annual Report 문서 삭제 감지: file_id=${id}`);

        // 1. 고객 ID 및 AR 메타데이터 추출
        const customerId = document.customerId;
        const fileObjectId = document._id;  // ObjectId
        const customerName = document.ar_metadata?.customer_name;
        const issueDate = document.ar_metadata?.issue_date;

        if (!customerId) {
          console.warn('⚠️ [AR 삭제] customerId를 찾을 수 없음 - AR 파싱 삭제 건너뜀');
        } else {
          // 2. source_file_id (ObjectId)로 정확히 매칭하여 삭제
          console.log(`🗓️  [AR 삭제] source_file_id=${fileObjectId}로 AR 파싱 삭제 시도`);

          const arDeleteResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { '_id': customerId },
            {
              $pull: { annual_reports: { source_file_id: fileObjectId } },
              $set: { 'meta.updated_at': utcNowDate() }
            }
          );

          if (arDeleteResult.modifiedCount > 0) {
            console.log(`✅ [AR 삭제] AR 파싱 데이터 삭제 완료 (source_file_id 매칭): customer_id=${customerId}`);
          } else {
            // fallback: customer_name + issue_date로 매칭 (한 쌍 조건)
            if (customerName && issueDate) {
              console.log(`🗓️  [AR 삭제] source_file_id 매칭 실패, customer_name=${customerName} + issue_date=${issueDate}로 fallback 삭제 시도`);
              const fallbackResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
                { '_id': customerId },
                {
                  $pull: { annual_reports: { customer_name: customerName, issue_date: new Date(issueDate) } },
                  $set: { 'meta.updated_at': utcNowDate() }
                }
              );
              if (fallbackResult.modifiedCount > 0) {
                console.log(`✅ [AR 삭제] AR 파싱 데이터 삭제 완료 (customer_name + issue_date 매칭)`);
              } else {
                console.log(`ℹ️  [AR 삭제] 삭제할 AR 파싱 데이터 없음`);
              }
            } else {
              console.log(`ℹ️  [AR 삭제] 삭제할 AR 파싱 데이터 없음 (source_file_id 매칭 실패, customer_name 또는 issue_date 없음)`);
            }
          }
        }
      } catch (arError) {
        console.warn('⚠️ [AR 삭제] AR 파싱 데이터 삭제 실패:', arError.message);
        // AR 삭제 실패해도 문서 삭제는 진행
      }
    }
    // ===================================================

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

    // Qdrant에서 임베딩 삭제
    try {
      console.log(`🗑️  [Qdrant] 문서 임베딩 삭제 시도: doc_id=${id}`);

      // Qdrant에서 doc_id 필터를 사용하여 포인트 삭제
      await qdrantClient.delete(QDRANT_COLLECTION, {
        filter: {
          must: [
            {
              key: 'doc_id',
              match: {
                value: id
              }
            }
          ]
        }
      });

      console.log(`✅ [Qdrant] 문서 임베딩 삭제 완료: doc_id=${id}`);
    } catch (qdrantError) {
      console.warn(`⚠️  [Qdrant] 임베딩 삭제 실패:`, qdrantError.message);
      // Qdrant 삭제 실패해도 문서는 이미 삭제됨
    }

    // 문서 삭제 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'document',
        description: '문서 삭제',
        target: {
          entity_type: 'document',
          entity_id: id,
          entity_name: document.upload?.originalName || document.meta?.filename || document.filename,
          parent_id: document.customerId?.toString(),
          parent_name: null
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/documents/${id}`,
        method: 'DELETE'
      }
    });

    res.json({
      success: true,
      message: '문서가 성공적으로 삭제되었습니다.'
    });
  } catch (error) {
    console.error('문서 삭제 오류:', error);

    // 문서 삭제 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'document',
        description: '문서 삭제 실패',
        target: {
          entity_type: 'document',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/documents/${req.params?.id}`,
        method: 'DELETE'
      }
    });

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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.delete('/api/documents', authenticateJWT, async (req, res) => {
  try {
    const { document_ids } = req.body;

    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    console.log(`🗑️  [문서 삭제] 복수 삭제 요청: ${document_ids?.length}건 (userId: ${userId})`);

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 문서 ID가 필요합니다'
      });
    }

    // ⭐ 소유권 검증: 삭제 대상 문서가 모두 해당 설계사의 것인지 확인
    const objectIds = document_ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    const ownedDocs = await db.collection(COLLECTION_NAME)
      .find({ _id: { $in: objectIds }, ownerId: userId })
      .project({ _id: 1 })
      .toArray();

    const ownedDocIds = ownedDocs.map(d => d._id.toString());
    const unauthorizedIds = document_ids.filter(id => !ownedDocIds.includes(id));

    if (unauthorizedIds.length > 0) {
      console.log(`⚠️ [문서 삭제] 권한 없는 문서 삭제 시도: ${unauthorizedIds.join(', ')}`);
      return res.status(403).json({
        success: false,
        error: '일부 문서에 대한 접근 권한이 없습니다.',
        unauthorized_ids: unauthorizedIds
      });
    }

    // ========== 고객 참조 정리 추가 ==========
    // 문서 삭제 전에 이 문서들을 참조하는 모든 고객의 documents 배열에서 제거
    try {
      const deleteObjectIds = ownedDocIds.map(id => new ObjectId(id));
      const customersUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
        { 'documents.document_id': { $in: deleteObjectIds } },
        {
          $pull: { documents: { document_id: { $in: deleteObjectIds } } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );
      if (customersUpdateResult.modifiedCount > 0) {
        console.log(`✅ [문서 삭제] 고객 참조 정리: ${customersUpdateResult.modifiedCount}명의 고객에서 문서 참조 제거`);
      }
    } catch (customerError) {
      console.warn('⚠️ [문서 삭제] 고객 참조 정리 실패:', customerError.message);
      // 고객 참조 정리 실패해도 문서 삭제는 진행
    }
    // ========================================

    // 문서들을 직접 삭제 (파일 + DB + Qdrant)
    const fs = require('fs').promises;
    let deletedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const docId of ownedDocIds) {
      try {
        // 문서 조회
        const document = await db.collection(COLLECTION_NAME)
          .findOne({ _id: new ObjectId(docId) });

        if (!document) {
          errors.push({ document_id: docId, error: '문서를 찾을 수 없습니다' });
          failedCount++;
          continue;
        }

        // ========== Annual Report 파싱 데이터 삭제 ==========
        // 매칭 조건: customer_name + issue_date가 같으면 한 쌍
        if (document.is_annual_report) {
          try {
            const customerId = document.customerId;
            const fileObjectId = document._id;  // ObjectId
            const customerName = document.ar_metadata?.customer_name;
            const issueDate = document.ar_metadata?.issue_date;

            if (customerId) {
              // 1차: source_file_id로 정확히 매칭하여 삭제
              const arDeleteResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
                { '_id': customerId },
                {
                  $pull: { annual_reports: { source_file_id: fileObjectId } },
                  $set: { 'meta.updated_at': utcNowDate() }
                }
              );

              if (arDeleteResult.modifiedCount > 0) {
                console.log(`✅ [AR 삭제] AR 파싱 데이터 삭제 완료 (source_file_id 매칭): customer_id=${customerId}`);
              } else if (customerName && issueDate) {
                // 2차 fallback: customer_name + issue_date로 매칭 (레거시 데이터 지원)
                const fallbackResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
                  { '_id': customerId },
                  {
                    $pull: { annual_reports: { customer_name: customerName, issue_date: new Date(issueDate) } },
                    $set: { 'meta.updated_at': utcNowDate() }
                  }
                );
                if (fallbackResult.modifiedCount > 0) {
                  console.log(`✅ [AR 삭제] AR 파싱 데이터 삭제 완료 (customer_name + issue_date fallback): ${customerName}, ${issueDate}`);
                }
              }
            }
          } catch (arError) {
            console.warn('⚠️ [AR 삭제] AR 파싱 데이터 삭제 실패:', arError.message);
          }
        }

        // 파일 시스템에서 파일 삭제
        if (document.upload?.destPath) {
          try {
            await fs.unlink(document.upload.destPath);
            console.log(`✅ 파일 삭제 성공: ${document.upload.destPath}`);
          } catch (fileError) {
            console.warn('⚠️ 파일 삭제 실패:', fileError.message);
          }
        }

        // MongoDB에서 문서 삭제
        await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(docId) });

        // Qdrant에서 임베딩 삭제
        try {
          await qdrantClient.delete(QDRANT_COLLECTION, {
            filter: {
              must: [{ key: 'doc_id', match: { value: docId } }]
            }
          });
          console.log(`✅ [Qdrant] 문서 임베딩 삭제 완료: doc_id=${docId}`);
        } catch (qdrantError) {
          console.warn('⚠️ [Qdrant] 임베딩 삭제 실패:', qdrantError.message);
        }

        deletedCount++;
        console.log(`✅ DB 문서 삭제 성공: ${docId}`);

      } catch (error) {
        errors.push({ document_id: docId, error: error.message });
        failedCount++;
        console.error(`❌ 문서 삭제 중 오류: ${docId} - ${error.message}`);
      }
    }

    const message = deletedCount > 0
      ? `${deletedCount}건 삭제되었습니다` + (failedCount > 0 ? ` (${failedCount}건 실패)` : '')
      : '삭제된 문서가 없습니다';

    console.log(`✅ [문서 삭제] 삭제 완료: ${deletedCount}/${document_ids.length}건`);
    res.json({
      success: deletedCount > 0,
      message,
      deleted_count: deletedCount,
      failed_count: failedCount,
      errors
    });

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
      timestamp: utcNowISO(),
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

// ==================== 사용자 관리 API ====================

/**
 * 사용자 목록 조회 API
 * 개발자 모드에서 사용자 전환 시 사용
 */
app.get('/api/users', async (req, res) => {
  try {
    const usersCollection = db.collection('users');

    // 모든 사용자 조회 (비밀번호 제외)
    const users = await usersCollection
      .find({}, { projection: { password: 0 } })
      .sort({ _id: 1 })
      .toArray();

    // 사용자별 아바타 매핑 (Adventurer 스타일 - 픽사 캐릭터 느낌)
    const avatarMap = {
      'tester': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4',
      'user2': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=ffdfbf'
    };

    res.json({
      success: true,
      data: users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: avatarMap[user._id] || user.avatarUrl
      }))
    });
  } catch (error) {
    console.error('❌ 사용자 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 개발 전용: 개발 계정 자동 생성/조회 API
 * POST /api/dev/ensure-user
 *
 * 개발 환경에서 항상 일관된 계정을 사용하기 위한 엔드포인트
 * - dev 계정이 존재하면 조회
 * - 없으면 자동으로 생성
 * - 실제 JWT 토큰 발급 (계정 삭제 등 인증 필요 기능 사용 가능)
 * - MongoDB ObjectId 사용 (고정값: 000000000000000000000001)
 */
app.post('/api/dev/ensure-user', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');

    // 개발 계정 고정 ObjectId (항상 동일한 ID 사용)
    const DEV_USER_ID = new ObjectId('000000000000000000000001');
    const DEV_USER = {
      _id: DEV_USER_ID,
      name: '개발자 (Dev)',
      email: 'dev@aims.local',
      role: 'agent',
      avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dev&backgroundColor=c0ffc0',
      authProvider: 'dev',
      profileCompleted: true,
      createdAt: new Date(),
      lastLogin: new Date()
    };

    const usersCollection = db.collection('users');

    // 개발 계정 존재 여부 확인
    let user = await usersCollection.findOne({ _id: DEV_USER_ID });

    if (!user) {
      // 없으면 생성
      await usersCollection.insertOne(DEV_USER);
      user = DEV_USER;
      console.log(`✅ 개발 전용 계정 생성: ${DEV_USER_ID.toString()}`);
    } else {
      // 마지막 로그인 시간 업데이트
      await usersCollection.updateOne(
        { _id: DEV_USER_ID },
        { $set: { lastLogin: new Date() } }
      );
      user.lastLogin = new Date();
      console.log(`ℹ️  개발 전용 계정 존재 확인: ${DEV_USER_ID.toString()}`);
    }

    // 실제 JWT 토큰 발급 (계정 삭제 등 인증 필요 기능에서 사용)
    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    });

    res.json({
      success: true,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        authProvider: user.authProvider,
        profileCompleted: user.profileCompleted
      },
      token,  // JWT 토큰 추가
      message: '개발 계정 로그인 완료'
    });
  } catch (error) {
    console.error('❌ 개발 계정 생성/조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 개발 환경 전용: 모든 고객 삭제
 * DELETE /api/dev/customers/all
 * 주의: 개발 환경에서만 사용! 프로덕션에서는 절대 사용 금지!
 */
app.delete('/api/dev/customers/all', authenticateJWT, async (req, res) => {
  try {
    // 요청한 사용자(설계사)의 고객만 삭제
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // 고객은 meta.created_by로 설계사 ID를 저장함 (문자열)
    const result = await db.collection(CUSTOMERS_COLLECTION).deleteMany({
      'meta.created_by': userId
    });

    console.log(`🗑️ [DEV] 고객 전체 삭제: meta.created_by=${userId}, deletedCount=${result.deletedCount}`);

    res.json({
      success: true,
      message: `${result.deletedCount}명의 고객이 삭제되었습니다.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ 고객 전체 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 개발 환경 전용: 모든 계약 삭제
 * DELETE /api/dev/contracts/all
 * 주의: 개발 환경에서만 사용! 프로덕션에서는 절대 사용 금지!
 */
app.delete('/api/dev/contracts/all', authenticateJWT, async (req, res) => {
  try {
    // 요청한 사용자(설계사)의 계약만 삭제
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    // agent_id가 ObjectId로 저장되어 있으므로 변환 필요
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    const result = await db.collection(CONTRACTS_COLLECTION).deleteMany({
      agent_id: agentObjectId
    });

    console.log(`🗑️ [DEV] 계약 전체 삭제: agent_id=${userId}, deletedCount=${result.deletedCount}`);

    res.json({
      success: true,
      message: `${result.deletedCount}건의 계약이 삭제되었습니다.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ 계약 전체 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 특정 사용자 정보 조회 API
 * GET /api/users/:id
 * 개발자 모드 및 계정 설정에서 사용
 */
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const usersCollection = db.collection('users');

    // 사용자 조회 (비밀번호 제외)
    const user = await usersCollection.findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 아바타 매핑 (기존 로직과 동일)
    const avatarMap = {
      'tester': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4',
      'user2': 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=ffdfbf'
    };

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        department: user.department || '',
        position: user.position || '',
        role: user.role,
        avatarUrl: user.avatarUrl || avatarMap[user._id]
      }
    });
  } catch (error) {
    console.error('❌ 사용자 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 사용자 정보 업데이트 API
 * PUT /api/users/:id
 * 계정 설정에서 프로필 정보 수정 시 사용
 */
app.put('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;
    const usersCollection = db.collection('users');

    // 업데이트할 수 있는 필드만 허용
    const allowedFields = ['name', 'email', 'phone', 'department', 'position', 'avatarUrl'];
    const filteredData = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    // 업데이트할 데이터가 없는 경우
    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // 사용자 정보 업데이트
    const result = await usersCollection.updateOne(
      { _id: userId },
      { $set: filteredData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 업데이트된 사용자 정보 조회 (비밀번호 제외)
    const updatedUser = await usersCollection.findOne(
      { _id: userId },
      { projection: { password: 0 } }
    );

    res.json({
      success: true,
      data: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        department: updatedUser.department || '',
        position: updatedUser.position || '',
        role: updatedUser.role,
        avatarUrl: updatedUser.avatarUrl
      }
    });
  } catch (error) {
    console.error('❌ 사용자 정보 업데이트 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 고객 관리 API ====================

/**
 * 고객 목록 조회 API
 */
app.get('/api/customers', authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    const {
      page = 1,
      limit = 10,
      search,
      status = 'active',  // ⭐ 기본값: active (활성 고객만)
      customerType,
      region,
      startDate,
      endDate,
      hasDocuments
    } = req.query;
    const skip = (page - 1) * limit;

    // ⭐ created_by 필터 추가 (사용자 계정 기능)
    let filter = {
      'meta.created_by': userId
    };

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

    // ⭐ Status filter (soft delete 지원)
    if (status === 'all') {
      // No status filter - show all customers
    } else if (status === 'inactive') {
      filter['meta.status'] = 'inactive';
    } else {
      // Default: only active customers
      filter['meta.status'] = 'active';
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
        // "YYYY-MM-DD" 형식을 UTC 자정으로 변환
        dateFilter.$gte = new Date(startDate + 'T00:00:00.000Z');
      }
      if (endDate) {
        // "YYYY-MM-DD" 형식을 UTC 23:59:59.999로 변환
        dateFilter.$lte = new Date(endDate + 'T23:59:59.999Z');
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
 * 새 고객 등록 API
 */
app.post('/api/customers', authenticateJWT, async (req, res) => {
  try {
    const customerData = req.body;

    // ⭐ userId 추출 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    // 고객명 필수 체크
    const originalName = customerData.personal_info?.name;
    if (!originalName) {
      return res.status(400).json({
        success: false,
        error: '고객명은 필수 입력 항목입니다.'
      });
    }

    // 🔴 중복 체크 (철칙: 고객명은 userId 내에서 개인/법인/활성/휴면 모두 통틀어 유일해야 함)
    // - customer_type 조건 없음: 개인 "홍길동"이 있으면 법인 "홍길동" 등록 불가
    // - status 조건 없음: 휴면 고객도 포함하여 중복 체크
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION).findOne(
      {
        'personal_info.name': originalName,
        'meta.created_by': userId  // 같은 설계사 내에서만 중복 체크
      },
      {
        collation: {
          locale: 'ko',
          strength: 2  // 대소문자 무시
        }
      }
    );

    if (existingCustomer) {
      const statusText = existingCustomer.meta?.status === 'inactive' ? ' (휴면)' : '';
      const typeText = existingCustomer.insurance_info?.customer_type || '';
      return res.status(409).json({
        success: false,
        error: `이미 등록된 고객명입니다. [${typeText}${statusText}]`,
        details: {
          field: 'personal_info.name',
          value: originalName,
          existingCustomerType: existingCustomer.insurance_info?.customer_type,
          existingCustomerId: existingCustomer._id.toString(),
          existingStatus: existingCustomer.meta?.status
        }
      });
    }

    const newCustomer = {
      ...customerData,
      personal_info: {
        ...customerData.personal_info,
        name: originalName
      },
      meta: {
        created_at: utcNowDate(),
        updated_at: utcNowDate(),
        created_by: userId,
        last_modified_by: userId,
        status: 'active'
      },
      deleted_at: null,
      deleted_by: null
    };

    const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomer);

    // 생성된 고객 전체 데이터 반환 (프론트엔드 Zod 검증과 호환)
    const createdCustomer = {
      _id: result.insertedId.toString(),
      ...newCustomer
    };

    // 고객 등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'customer',
        description: '고객 등록',
        target: {
          entity_type: 'customer',
          entity_id: result.insertedId.toString(),
          entity_name: originalName
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: '/api/customers',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      data: createdCustomer
    });
  } catch (error) {
    console.error('고객 등록 오류:', error);

    // 고객 등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'customer',
        description: '고객 등록 실패',
        target: {
          entity_type: 'customer',
          entity_name: req.body?.personal_info?.name
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/customers',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/bulk
 * 고객 일괄 등록/업데이트 (Excel Import용)
 * - 고객명 기준 upsert: 존재하면 업데이트, 없으면 생성
 * - 변경사항 없으면 건너뜀
 */
app.post('/api/customers/bulk', authenticateJWT, async (req, res) => {
  try {
    const { customers } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: '고객 데이터가 비어있습니다.'
      });
    }

    const now = utcNowDate();

    // 해당 설계사의 기존 고객 목록 조회 (이름으로 매칭)
    const existingCustomers = await db.collection(CUSTOMERS_COLLECTION)
      .find({ 'meta.created_by': userId })
      .toArray();

    const customerMap = new Map();
    existingCustomers.forEach(c => {
      const name = c.personal_info?.name?.trim();
      if (name) customerMap.set(name, c);
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const errors = [];

    for (const customer of customers) {
      try {
        const name = customer.name?.trim();
        if (!name) {
          errors.push({ name: customer.name || '(이름없음)', reason: '고객명 누락' });
          continue;
        }

        const existingCustomer = customerMap.get(name);

        if (existingCustomer) {
          // 기존 고객 존재 - 업데이트 필요 여부 확인
          const changes = [];
          const updateFields = {};

          // MongoDB 제약: 부모 필드가 null이면 중첩 필드 설정 불가
          // 부모 필드가 null인 경우 전체 객체로 설정해야 함
          const hasPersonalInfo = existingCustomer.personal_info !== null && existingCustomer.personal_info !== undefined;
          const hasInsuranceInfo = existingCustomer.insurance_info !== null && existingCustomer.insurance_info !== undefined;
          const hasMeta = existingCustomer.meta !== null && existingCustomer.meta !== undefined;

          // 연락처 비교/업데이트
          if (customer.mobile_phone && customer.mobile_phone !== existingCustomer.personal_info?.mobile_phone) {
            if (hasPersonalInfo) {
              updateFields['personal_info.mobile_phone'] = customer.mobile_phone;
            } else {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, mobile_phone: customer.mobile_phone };
            }
            changes.push('연락처');
          }

          // 주소 비교/업데이트
          if (customer.address && customer.address !== existingCustomer.personal_info?.address?.address1) {
            if (!hasPersonalInfo) {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, address: { address1: customer.address } };
            } else if (existingCustomer.personal_info?.address === null || existingCustomer.personal_info?.address === undefined) {
              updateFields['personal_info.address'] = { address1: customer.address };
            } else {
              updateFields['personal_info.address.address1'] = customer.address;
            }
            changes.push('주소');
          }

          // 성별 비교/업데이트 (개인 고객만)
          if (customer.gender) {
            const normalizedGender = customer.gender === '남' || customer.gender === 'M' ? 'M' :
                                     customer.gender === '여' || customer.gender === 'F' ? 'F' : null;
            if (normalizedGender && normalizedGender !== existingCustomer.personal_info?.gender) {
              if (hasPersonalInfo) {
                updateFields['personal_info.gender'] = normalizedGender;
              } else {
                updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, gender: normalizedGender };
              }
              changes.push('성별');
            }
          }

          // 생년월일 비교/업데이트 (개인 고객만)
          if (customer.birth_date && customer.birth_date !== existingCustomer.personal_info?.birth_date) {
            if (hasPersonalInfo) {
              updateFields['personal_info.birth_date'] = customer.birth_date;
            } else {
              updateFields['personal_info'] = { name: existingCustomer.personal_info?.name || customer.name, birth_date: customer.birth_date };
            }
            changes.push('생년월일');
          }

          // 고객 유형 비교/업데이트
          if (customer.customer_type && customer.customer_type !== existingCustomer.insurance_info?.customer_type) {
            if (hasInsuranceInfo) {
              updateFields['insurance_info.customer_type'] = customer.customer_type;
            } else {
              updateFields['insurance_info'] = { customer_type: customer.customer_type };
            }
            changes.push('고객유형');
          }

          if (changes.length > 0) {
            // 변경사항 있음 - 업데이트
            if (hasMeta) {
              updateFields['meta.updated_at'] = now;
              updateFields['meta.last_modified_by'] = userId;
            } else {
              updateFields['meta'] = { updated_at: now, last_modified_by: userId };
            }

            await db.collection(CUSTOMERS_COLLECTION).updateOne(
              { _id: existingCustomer._id },
              { $set: updateFields }
            );

            updated.push({ name, _id: existingCustomer._id.toString(), changes });
          } else {
            // 변경사항 없음 - 건너뜀
            skipped.push({ name, reason: '변경사항 없음' });
          }
        } else {
          // 신규 고객 생성
          const normalizedGender = customer.gender === '남' || customer.gender === 'M' ? 'M' :
                                   customer.gender === '여' || customer.gender === 'F' ? 'F' : undefined;

          const newCustomer = {
            personal_info: {
              name: name,
              mobile_phone: customer.mobile_phone || undefined,
              gender: normalizedGender,
              birth_date: customer.birth_date || undefined,
              address: customer.address ? { address1: customer.address } : undefined
            },
            insurance_info: {
              customer_type: customer.customer_type || '개인'
            },
            contracts: [],
            documents: [],
            consultations: [],
            tags: [],
            meta: {
              created_at: now,
              updated_at: now,
              created_by: userId,
              last_modified_by: userId,
              status: 'active',
              source: 'excel_import'
            }
          };

          const result = await db.collection(CUSTOMERS_COLLECTION).insertOne(newCustomer);
          created.push({ name, _id: result.insertedId.toString() });

          // 현재 배치 내 중복 방지를 위해 맵에 추가
          customerMap.set(name, { ...newCustomer, _id: result.insertedId });
        }
      } catch (itemError) {
        errors.push({ name: customer.name || '(이름없음)', reason: itemError.message });
      }
    }

    // 고객 일괄등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'customer',
        description: '고객 일괄 등록',
        bulkCount: created.length + updated.length
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: created.length + updated.length
      },
      meta: {
        endpoint: '/api/customers/bulk',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: `${created.length}건 등록, ${updated.length}건 업데이트, ${skipped.length}건 건너뜀`,
      data: {
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        created: created.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: skipped.slice(0, 50),
        errors: errors.slice(0, 50)
      }
    });

  } catch (error) {
    console.error('고객 일괄 등록 오류:', error);

    // 고객 일괄등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'customer',
        description: '고객 일괄 등록 실패'
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/customers/bulk',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 일괄 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/validate-names
 * 고객명 DB 중복 검사 (Excel Import 검증용)
 * - 엑셀 고객명과 DB 기존 고객 비교
 * - 동일 타입: UPDATE 대상 (허용)
 * - 다른 타입: 고유성 위반 (에러)
 */
app.post('/api/customers/validate-names', authenticateJWT, async (req, res) => {
  try {
    const { customers } = req.body; // [{ name: string, customerType: '개인' | '법인' }]
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: '고객 데이터가 비어있습니다.'
      });
    }

    // 해당 설계사의 기존 고객 목록 조회
    const existingCustomers = await db.collection(CUSTOMERS_COLLECTION)
      .find({ 'meta.created_by': userId })
      .toArray();

    // 이름 → 기존 고객 맵
    const customerMap = new Map();
    existingCustomers.forEach(c => {
      const name = c.personal_info?.name?.trim();
      if (name) {
        customerMap.set(name, {
          _id: c._id.toString(),
          name: name,
          customerType: c.insurance_info?.customer_type || '개인',
          email: c.personal_info?.email,
          phone: c.personal_info?.mobile_phone,
          address: c.personal_info?.address?.address1,
          birthDate: c.personal_info?.birth_date,
          businessNumber: c.insurance_info?.business_number,
          representativeName: c.insurance_info?.representative_name
        });
      }
    });

    // 검증 결과
    const results = [];

    for (const customer of customers) {
      const name = customer.name?.trim();
      const requestedType = customer.customerType || '개인';

      if (!name) {
        results.push({
          name: customer.name || '',
          status: 'empty',
          message: '고객명 누락'
        });
        continue;
      }

      const existing = customerMap.get(name);

      if (!existing) {
        // DB에 없음 → 신규 생성
        results.push({
          name: name,
          status: 'new',
          message: '신규 고객'
        });
      } else if (existing.customerType === requestedType) {
        // 동일 타입 → UPDATE 대상
        results.push({
          name: name,
          status: 'update',
          message: '기존 고객 정보 업데이트',
          existingCustomer: existing
        });
      } else {
        // 다른 타입 → 고유성 위반
        results.push({
          name: name,
          status: 'type_conflict',
          message: `이미 ${existing.customerType}고객으로 등록됨`,
          existingType: existing.customerType,
          requestedType: requestedType
        });
      }
    }

    // 통계
    const stats = {
      total: results.length,
      new: results.filter(r => r.status === 'new').length,
      update: results.filter(r => r.status === 'update').length,
      typeConflict: results.filter(r => r.status === 'type_conflict').length,
      empty: results.filter(r => r.status === 'empty').length
    };

    res.json({
      success: true,
      data: results,
      stats: stats
    });

  } catch (error) {
    console.error('고객명 검증 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객명 검증에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객명 중복 체크 API (실시간 검사용)
 * @since 2025-12-11
 *
 * GET /api/customers/check-name?name=홍길동
 *
 * Response:
 * - exists: true/false
 * - customer: 기존 고객 정보 (exists인 경우)
 */
app.get('/api/customers/check-name', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.query;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.json({
        success: true,
        exists: false,
        customer: null
      });
    }

    const trimmedName = name.trim();

    // 대소문자 무시하여 중복 체크 (CLAUDE.md 규칙)
    const existing = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        'meta.created_by': userId,
        'personal_info.name': { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

    res.json({
      success: true,
      exists: !!existing,
      customer: existing ? {
        _id: existing._id.toString(),
        name: existing.personal_info?.name,
        customer_type: existing.insurance_info?.customer_type,
        status: existing.meta?.status || 'active'
      } : null
    });

  } catch (error) {
    console.error('고객명 중복 체크 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객명 중복 체크에 실패했습니다.'
    });
  }
});

/**
 * 고객 상세 정보 조회 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.get('/api/customers/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 1단계: 고객 존재 여부 확인 (소유권 무관)
    const customerExists = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customerExists) {
      // 🔴 고객이 DB에 없음 (삭제됨)
      return res.status(404).json({
        success: false,
        error: '해당 고객은 삭제되었습니다.',
        deleted: true
      });
    }

    // ⭐ 2단계: 소유권 검증 (해당 설계사의 고객인지)
    if (customerExists.meta?.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '접근 권한이 없습니다.'
      });
    }

    res.json({
      success: true,
      data: customerExists
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
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.put('/api/customers/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 수정 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
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
          changed_at: utcNowDate(),
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
      'meta.updated_at': utcNowDate(),
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

    // 고객 수정 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'update',
        category: 'customer',
        description: '고객 정보 수정',
        target: {
          entity_type: 'customer',
          entity_id: id,
          entity_name: existingCustomer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/customers/${id}`,
        method: 'PUT'
      }
    });

    res.json({
      success: true,
      message: '고객 정보가 성공적으로 수정되었습니다.',
      address_archived: addressChanged
    });
  } catch (error) {
    console.error('고객 수정 오류:', error);

    // 고객 수정 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'update',
        category: 'customer',
        description: '고객 정보 수정 실패',
        target: {
          entity_type: 'customer',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}`,
        method: 'PUT'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 정보 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 삭제 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 * ⭐ 트랜잭션으로 원자적 삭제 (좀비 참조 방지)
 */
app.delete('/api/customers/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query; // ?permanent=true for hard delete

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 삭제 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ Soft Delete (Default)
    if (permanent !== 'true') {
      const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'meta.status': 'inactive',
            'meta.updated_at': utcNowISO(),
            deleted_at: utcNowDate(),
            deleted_by: userId
          }
        },
        { returnDocument: 'after' }  // 업데이트 후 문서 반환
      );

      // 🔍 디버그: result 구조 확인
      console.log('🔍 [DEBUG] findOneAndUpdate result:', JSON.stringify({
        hasValue: !!result.value,
        hasOk: !!result.ok,
        resultKeys: Object.keys(result || {}),
        resultType: typeof result
      }));

      if (!result.value && !result) {
        return res.status(404).json({
          success: false,
          error: '고객을 찾을 수 없습니다.'
        });
      }

      const updatedCustomer = result.value || result;
      console.log(`🗂️ [Soft Delete] 고객 ${id} 휴면 처리 완료 (by ${userId})`);

      // 고객 삭제(휴면) 성공 로그
      activityLogger.log({
        actor: {
          user_id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        },
        action: {
          type: 'delete',
          category: 'customer',
          description: '고객 휴면 처리',
          target: {
            entity_type: 'customer',
            entity_id: id,
            entity_name: existingCustomer.personal_info?.name
          }
        },
        result: {
          success: true,
          statusCode: 200
        },
        meta: {
          endpoint: `/api/customers/${id}`,
          method: 'DELETE'
        }
      });

      return res.json({
        success: true,
        message: '고객이 휴면 처리되었습니다.',
        soft_delete: true,
        customer: updatedCustomer  // 업데이트된 고객 데이터 반환
      });
    }

    // ⭐ Hard Delete (Permanent) - 기존 로직 유지
    console.log(`🗑️ [Hard Delete] 고객 ${id} 영구 삭제 시작...`);

    // ⭐ Cascading Delete: 순차적으로 관련 데이터 삭제
    // 참고: MongoDB Standalone은 트랜잭션 미지원 → 순차 삭제 + 정리 API로 대응
    const customerId = new ObjectId(id);
    let relationshipsDeleteCount = 0;
    let contractsDeleteCount = 0;
    let filesUpdateCount = 0;

    // 1. 해당 고객과 관련된 모든 관계 레코드 삭제
    const relationshipsDeleteResult = await db.collection('customer_relationships').deleteMany({
      $or: [
        { from_customer: customerId },
        { related_customer: customerId },
        { family_representative: customerId }
      ]
    });
    relationshipsDeleteCount = relationshipsDeleteResult.deletedCount;

    // 2. 해당 고객의 계약 삭제
    const contractsDeleteResult = await db.collection('contracts').deleteMany({
      customer_id: customerId
    });
    contractsDeleteCount = contractsDeleteResult.deletedCount;

    // 3. 고객과 연결된 모든 문서 삭제 (파일 + DB + Qdrant)
    const fs = require('fs').promises;
    let deletedDocumentsCount = 0;

    // 고객과 연결된 모든 문서 조회
    const customerDocuments = await db.collection(COLLECTION_NAME).find({
      customerId: new ObjectId(id)
    }).toArray();

    console.log(`🗑️ [Hard Delete] 고객 ${id}와 연결된 문서 ${customerDocuments.length}개 삭제 시작`);

    // 각 문서 삭제
    for (const document of customerDocuments) {
      try {
        const docId = document._id.toString();

        // AR 파싱 데이터 삭제
        if (document.is_annual_report) {
          try {
            const arCustomerId = document.customerId;
            const issueDate = document.ar_metadata?.issue_date;

            if (arCustomerId && issueDate) {
              await db.collection(CUSTOMERS_COLLECTION).updateOne(
                { '_id': arCustomerId },
                {
                  $pull: { annual_reports: { issue_date: new Date(issueDate) } },
                  $set: { 'meta.updated_at': utcNowDate() }
                }
              );
            }
          } catch (arError) {
            console.warn(`⚠️ [AR 삭제] 실패: ${arError.message}`);
          }
        }

        // 파일 시스템에서 파일 삭제
        if (document.upload?.destPath) {
          try {
            await fs.unlink(document.upload.destPath);
            console.log(`✅ 파일 삭제: ${document.upload.destPath}`);
          } catch (fileError) {
            console.warn(`⚠️ 파일 삭제 실패: ${fileError.message}`);
          }
        }

        // MongoDB에서 문서 삭제
        await db.collection(COLLECTION_NAME).deleteOne({ _id: document._id });

        // Qdrant에서 임베딩 삭제
        try {
          await qdrantClient.delete(QDRANT_COLLECTION, {
            filter: {
              must: [{ key: 'doc_id', match: { value: docId } }]
            }
          });
        } catch (qdrantError) {
          console.warn(`⚠️ [Qdrant] 임베딩 삭제 실패: ${qdrantError.message}`);
        }

        deletedDocumentsCount++;
        console.log(`✅ 문서 삭제 완료: ${docId}`);

      } catch (docError) {
        console.error(`❌ 문서 삭제 중 오류: ${docError.message}`);
      }
    }

    filesUpdateCount = deletedDocumentsCount;

    // 4. 고객 삭제
    await db.collection(CUSTOMERS_COLLECTION).deleteOne({ _id: customerId });

    console.log(`🗑️ [Hard Delete] 고객 ${id} 영구 삭제 완료: 관계=${relationshipsDeleteCount}, 계약=${contractsDeleteCount}, 문서=${filesUpdateCount}`);

    // 고객 영구 삭제 성공 로그
    activityLogger.log({
      actor: {
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'customer',
        description: '고객 영구 삭제',
        target: {
          entity_type: 'customer',
          entity_id: id,
          entity_name: existingCustomer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: 1 + relationshipsDeleteCount + contractsDeleteCount + filesUpdateCount
      },
      meta: {
        endpoint: `/api/customers/${id}?permanent=true`,
        method: 'DELETE'
      }
    });

    res.json({
      success: true,
      message: '고객이 영구적으로 삭제되었습니다.',
      deletedRelationships: relationshipsDeleteCount,
      deletedContracts: contractsDeleteCount,
      deletedDocuments: filesUpdateCount,
      cascading: true,  // Cascading Delete 사용 여부 표시
      permanent: true
    });
  } catch (error) {
    console.error('고객 삭제 오류:', error);

    // 고객 삭제 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.user?.id,
        name: req.user?.name,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'customer',
        description: '고객 삭제 실패',
        target: {
          entity_type: 'customer',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}`,
        method: 'DELETE'
      }
    });

    res.status(500).json({
      success: false,
      error: '고객 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 복원 API
 * POST /api/customers/:id/restore
 */
app.post('/api/customers/:id/restore', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 복원 가능
    const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!existingCustomer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 이미 활성 상태인지 확인
    if (existingCustomer.meta?.status === 'active') {
      return res.status(400).json({
        success: false,
        error: '이미 활성 상태인 고객입니다.'
      });
    }

    // ⭐ 복원 처리
    const result = await db.collection(CUSTOMERS_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          'meta.status': 'active',
          'meta.updated_at': utcNowISO(),
          deleted_at: null,
          deleted_by: null
        }
      },
      { returnDocument: 'after' }  // 업데이트 후 문서 반환
    );

    // 🔍 디버그: result 구조 확인
    console.log('🔍 [DEBUG] findOneAndUpdate result:', JSON.stringify({
      hasValue: !!result.value,
      hasOk: !!result.ok,
      resultKeys: Object.keys(result || {}),
      resultType: typeof result
    }));

    const restoredCustomer = result.value || result;

    if (!restoredCustomer) {
      return res.status(404).json({
        success: false,
        error: '복원할 수 없는 고객입니다.'
      });
    }

    console.log(`♻️ [Restore] 고객 ${id} 복원 완료 (by ${userId})`);

    res.json({
      success: true,
      message: '고객이 복원되었습니다.',
      data: restoredCustomer  // 복원된 고객 데이터 반환
    });
  } catch (error) {
    console.error('고객 복원 오류:', error);
    res.status(500).json({
      success: false,
      error: '고객 복원에 실패했습니다.',
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
          createdAt: normalizeTimestamp(relationship.meta?.created_at)
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
 * 데이터 무결성 리포트 API
 * 전체 데이터 현황 및 고아(좀비) 참조 탐지
 */
app.get('/api/admin/data-integrity-report', async (req, res) => {
  try {
    console.log('📊 데이터 무결성 리포트 생성 시작...');

    // 1. 전체 데이터 수 조회
    const [totalCustomers, totalContracts, totalRelationships, totalFiles] = await Promise.all([
      db.collection(CUSTOMERS_COLLECTION).countDocuments(),
      db.collection('contracts').countDocuments(),
      db.collection('customer_relationships').countDocuments(),
      db.collection(COLLECTION_NAME).countDocuments()
    ]);

    // 2. 모든 고객 ID 수집
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { projection: { _id: 1 } }).toArray())
        .map(c => c._id.toString())
    );

    // 3. 고아 계약 탐지 (customer_id가 존재하지 않는 고객 참조)
    const contracts = await db.collection('contracts').find({}, { projection: { customer_id: 1 } }).toArray();
    const orphanedContracts = contracts.filter(c => {
      const customerId = c.customer_id?.toString();
      return customerId && !allCustomerIds.has(customerId);
    });

    // 4. 고아 관계 탐지
    const relationships = await db.collection('customer_relationships').find({}).toArray();
    const orphanedRelationships = relationships.filter(r => {
      const fromId = r.from_customer?.toString();
      const toId = r.related_customer?.toString();
      return (fromId && !allCustomerIds.has(fromId)) || (toId && !allCustomerIds.has(toId));
    });

    // 5. 고아 파일 참조 탐지
    const filesWithCustomerRef = await db.collection(COLLECTION_NAME).find(
      { 'customerId': { $exists: true, $ne: null } },
      { projection: { 'customerId': 1 } }
    ).toArray();
    const orphanedFileRefs = filesWithCustomerRef.filter(f => {
      const customerId = f.customerId?.toString();
      return customerId && !allCustomerIds.has(customerId);
    });

    // 6. 건강 상태 판단
    const totalOrphaned = orphanedContracts.length + orphanedRelationships.length + orphanedFileRefs.length;
    let health = 'healthy';
    if (totalOrphaned > 10) health = 'critical';
    else if (totalOrphaned > 0) health = 'warning';

    console.log(`📊 무결성 리포트: 고객=${totalCustomers}, 계약=${totalContracts}(고아:${orphanedContracts.length}), 관계=${totalRelationships}(고아:${orphanedRelationships.length}), 파일참조 고아=${orphanedFileRefs.length}`);

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          totalContracts,
          totalRelationships,
          totalFiles
        },
        orphanedData: {
          contracts: orphanedContracts.length,
          relationships: orphanedRelationships.length,
          fileReferences: orphanedFileRefs.length,
          total: totalOrphaned
        },
        health
      }
    });

  } catch (error) {
    console.error('데이터 무결성 리포트 오류:', error);
    res.status(500).json({
      success: false,
      error: '데이터 무결성 리포트 생성에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 전체 고아 데이터 일괄 정리 API
 * 계약, 관계, 파일 참조의 고아 데이터를 모두 정리
 */
app.delete('/api/admin/orphaned-all', async (req, res) => {
  try {
    console.log('🗑️ 전체 고아 데이터 정리 시작...');

    // 1. 모든 고객 ID 수집
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { projection: { _id: 1 } }).toArray())
        .map(c => c._id.toString())
    );

    // 2. 고아 계약 삭제
    const contracts = await db.collection('contracts').find({}, { projection: { _id: 1, customer_id: 1 } }).toArray();
    const orphanedContractIds = contracts
      .filter(c => {
        const customerId = c.customer_id?.toString();
        return customerId && !allCustomerIds.has(customerId);
      })
      .map(c => c._id);

    let deletedContracts = 0;
    if (orphanedContractIds.length > 0) {
      const result = await db.collection('contracts').deleteMany({ _id: { $in: orphanedContractIds } });
      deletedContracts = result.deletedCount;
    }

    // 3. 고아 관계 삭제
    const relationships = await db.collection('customer_relationships').find({}).toArray();
    const orphanedRelIds = relationships
      .filter(r => {
        const fromId = r.from_customer?.toString();
        const toId = r.related_customer?.toString();
        return (fromId && !allCustomerIds.has(fromId)) || (toId && !allCustomerIds.has(toId));
      })
      .map(r => r._id);

    let deletedRelationships = 0;
    if (orphanedRelIds.length > 0) {
      const result = await db.collection('customer_relationships').deleteMany({ _id: { $in: orphanedRelIds } });
      deletedRelationships = result.deletedCount;
    }

    // 4. 고아 파일 참조 정리 (참조만 제거, 파일은 유지)
    const filesWithCustomerRef = await db.collection(COLLECTION_NAME).find(
      { 'customerId': { $exists: true, $ne: null } },
      { projection: { _id: 1, 'customerId': 1 } }
    ).toArray();

    const orphanedFileIds = filesWithCustomerRef
      .filter(f => {
        const customerId = f.customerId?.toString();
        return customerId && !allCustomerIds.has(customerId);
      })
      .map(f => f._id);

    let clearedFileReferences = 0;
    if (orphanedFileIds.length > 0) {
      const result = await db.collection(COLLECTION_NAME).updateMany(
        { _id: { $in: orphanedFileIds } },
        {
          $unset: { 'customerId': '', 'customer_notes': '' },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );
      clearedFileReferences = result.modifiedCount;
    }

    const total = deletedContracts + deletedRelationships + clearedFileReferences;
    console.log(`✅ 고아 데이터 정리 완료: 계약=${deletedContracts}, 관계=${deletedRelationships}, 파일참조=${clearedFileReferences}`);

    res.json({
      success: true,
      data: {
        deletedContracts,
        deletedRelationships,
        clearedFileReferences,
        total
      },
      message: total > 0 ? `고아 데이터 ${total}건 정리 완료` : '정리할 고아 데이터가 없습니다.'
    });

  } catch (error) {
    console.error('고아 데이터 정리 오류:', error);
    res.status(500).json({
      success: false,
      error: '고아 데이터 정리에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 관리자: 사용자 OCR 권한 설정
 */
app.put('/api/admin/users/:id/ocr-permission', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { hasOcrPermission } = req.body;

  if (typeof hasOcrPermission !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'hasOcrPermission은 boolean이어야 합니다'
    });
  }

  try {
    // ID가 ObjectId 형식인지 확인 (24자리 hex string)
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);
    const query = isObjectId ? { _id: new ObjectId(id) } : { _id: id };

    const result = await db.collection('users').updateOne(
      query,
      { $set: { hasOcrPermission } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }

    console.log(`[Admin] 사용자 ${id} OCR 권한 ${hasOcrPermission ? '활성화' : '비활성화'}`);

    res.json({
      success: true,
      message: `OCR 권한이 ${hasOcrPermission ? '활성화' : '비활성화'}되었습니다`,
      userId: id,
      hasOcrPermission
    });
  } catch (error) {
    console.error('OCR 권한 설정 오류:', error);
    res.status(500).json({
      success: false,
      error: 'OCR 권한 설정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 관리자: 사용자 OCR 권한 조회
 */
app.get('/api/admin/users/:id/ocr-permission', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    // ID가 ObjectId 형식인지 확인 (24자리 hex string)
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);
    const query = isObjectId ? { _id: new ObjectId(id) } : { _id: id };

    const user = await db.collection('users').findOne(
      query,
      { projection: { hasOcrPermission: 1 } }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다'
      });
    }

    res.json({
      success: true,
      userId: id,
      hasOcrPermission: user.hasOcrPermission || false
    });
  } catch (error) {
    console.error('OCR 권한 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: 'OCR 권한 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 관리자: 대시보드 통계 조회
 */
app.get('/api/admin/dashboard', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    // 병렬로 모든 통계 쿼리 실행
    const [totalUsers, totalCustomers, totalDocuments, totalContracts] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('customers').countDocuments({ deleted_at: null }),
      db.collection('files').countDocuments(),
      db.collection('contracts').countDocuments()
    ]);

    // 활성 사용자 (최근 30일 이내 로그인)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db.collection('users').countDocuments({
      lastLogin: { $gte: thirtyDaysAgo }
    });

    // 문서 분류 및 처리 상태 (상세)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    const [
      // OCR 대상 문서 (ocr 서브도큐먼트가 있는 문서)
      ocrTargetDocs,
      // OCR 비대상 문서 (ocr 서브도큐먼트가 없는 문서)
      ocrNonTargetDocs,
      // OCR 완료
      ocrDone,
      // OCR 대기
      ocrPending,
      // OCR 처리중
      ocrProcessing,
      // OCR 실패
      ocrFailed,
      // 임베딩 완료
      embedDone,
      // 임베딩 대기
      embedPending,
      // 임베딩 처리중
      embedProcessing,
      // 임베딩 실패
      embedFailed,
      // 전체 완료
      overallCompleted,
      // 전체 처리중
      overallProcessing,
      // 전체 실패
      overallError,
      // 이번 달 OCR 완료 (ocr 서브도큐먼트가 있는 문서 중)
      ocrUsedThisMonth,
      // 전체 OCR 완료 (ocr 서브도큐먼트가 있는 문서 중)
      ocrTotalProcessed
    ] = await Promise.all([
      // OCR 대상 문서 (ocr 서브도큐먼트 존재)
      db.collection('files').countDocuments({ 'ocr': { $exists: true } }),
      // OCR 비대상 문서 (ocr 서브도큐먼트 없음)
      db.collection('files').countDocuments({ 'ocr': { $exists: false } }),
      // OCR 완료
      db.collection('files').countDocuments({ 'ocr.status': 'done' }),
      // OCR 대기
      db.collection('files').countDocuments({
        $or: [
          { 'ocr.status': 'pending' },
          { 'stages.ocr.status': 'pending' }
        ]
      }),
      // OCR 처리중
      db.collection('files').countDocuments({
        $or: [
          { 'ocr.status': 'processing' },
          { 'stages.ocr.status': 'processing' }
        ]
      }),
      // OCR 실패
      db.collection('files').countDocuments({
        $or: [
          { 'ocr.status': 'error' },
          { 'stages.ocr.status': 'error' }
        ]
      }),
      // 임베딩 완료
      db.collection('files').countDocuments({ 'docembed.status': 'done' }),
      // 임베딩 대기
      db.collection('files').countDocuments({
        $or: [
          { 'docembed.status': 'pending' },
          { 'stages.docembed.status': 'pending' }
        ]
      }),
      // 임베딩 처리중
      db.collection('files').countDocuments({
        $or: [
          { 'docembed.status': 'processing' },
          { 'stages.docembed.status': 'processing' }
        ]
      }),
      // 임베딩 실패
      db.collection('files').countDocuments({
        $or: [
          { 'docembed.status': 'failed' },
          { 'docembed.status': 'error' },
          { 'stages.docembed.status': 'failed' },
          { 'stages.docembed.status': 'error' }
        ]
      }),
      // 전체 완료
      db.collection('files').countDocuments({ 'overallStatus': 'completed' }),
      // 전체 처리중
      db.collection('files').countDocuments({ 'overallStatus': 'processing' }),
      // 전체 실패
      db.collection('files').countDocuments({ 'overallStatus': 'error' }),
      // 이번 달 OCR 완료 (ocr 서브도큐먼트가 있는 문서만)
      db.collection('files').countDocuments({
        'ocr.status': { $in: ['done', 'error'] },
        $or: [
          { 'ocr.done_at': { $gte: startOfMonth } },
          { 'ocr.done_at': { $gte: startOfMonthISO } },
          { 'ocr.failed_at': { $gte: startOfMonth } },
          { 'ocr.failed_at': { $gte: startOfMonthISO } }
        ]
      }),
      // 전체 OCR 완료 (ocr 서브도큐먼트가 있는 문서만)
      db.collection('files').countDocuments({
        'ocr.status': { $in: ['done', 'error'] }
      })
    ]);

    // 시스템 상태 - 실제 연결 체크
    const healthChecks = await Promise.allSettled([
      // [0] Node.js API (aims_api - 자기 자신)
      (async () => {
        const start = Date.now();
        return { latency: Date.now() - start, version: process.version };
      })(),
      // [1] AIMS RAG API (aims_rag_api - 포트 8000)
      (async () => {
        const start = Date.now();
        const response = await axios.get(`${PYTHON_API_URL}/openapi.json`, { timeout: 5000 });
        return { latency: Date.now() - start, version: response.data?.info?.version || null };
      })(),
      // [2] MongoDB
      (async () => {
        const start = Date.now();
        const result = await db.admin().ping();
        const serverStatus = await db.admin().serverStatus();
        return {
          latency: Date.now() - start,
          version: serverStatus.version,
          uptime: serverStatus.uptime
        };
      })(),
      // [3] Qdrant
      (async () => {
        const start = Date.now();
        const collections = await qdrantClient.getCollections();
        return {
          latency: Date.now() - start,
          collections: collections.collections?.length || 0
        };
      })(),
      // [4] n8n (워크플로우 엔진 - 포트 5678)
      (async () => {
        const start = Date.now();
        const response = await axios.get('http://localhost:5678/healthz', { timeout: 5000 });
        return { latency: Date.now() - start, status: response.data?.status || 'ok' };
      })(),
      // [5] Annual Report API (포트 8004)
      (async () => {
        const start = Date.now();
        const response = await axios.get('http://localhost:8004/openapi.json', { timeout: 5000 });
        return { latency: Date.now() - start, version: response.data?.info?.version || null };
      })(),
      // [6] PDF Proxy (포트 8002)
      (async () => {
        const start = Date.now();
        const response = await axios.get('http://localhost:8002/health', { timeout: 5000 });
        return { latency: Date.now() - start };
      })()
    ]);

    const checkTime = utcNowISO();
    const health = {
      // Tier 1: Infrastructure
      mongodb: {
        status: healthChecks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value.latency : null,
        version: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value.version : null,
        uptime: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value.uptime : null,
        error: healthChecks[2].status === 'rejected' ? healthChecks[2].reason?.message : null,
        checkedAt: checkTime
      },
      qdrant: {
        status: healthChecks[3].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[3].status === 'fulfilled' ? healthChecks[3].value.latency : null,
        collections: healthChecks[3].status === 'fulfilled' ? healthChecks[3].value.collections : null,
        error: healthChecks[3].status === 'rejected' ? healthChecks[3].reason?.message : null,
        checkedAt: checkTime
      },
      // Tier 2: Backend APIs
      nodeApi: {
        status: 'healthy',
        latency: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value.latency : null,
        version: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value.version : null,
        checkedAt: checkTime
      },
      aimsRagApi: {
        status: healthChecks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value.latency : null,
        version: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value.version : null,
        error: healthChecks[1].status === 'rejected' ? healthChecks[1].reason?.message : null,
        checkedAt: checkTime
      },
      annualReportApi: {
        status: healthChecks[5].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[5].status === 'fulfilled' ? healthChecks[5].value.latency : null,
        version: healthChecks[5].status === 'fulfilled' ? healthChecks[5].value.version : null,
        error: healthChecks[5].status === 'rejected' ? healthChecks[5].reason?.message : null,
        checkedAt: checkTime
      },
      pdfProxy: {
        status: healthChecks[6].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[6].status === 'fulfilled' ? healthChecks[6].value.latency : null,
        error: healthChecks[6].status === 'rejected' ? healthChecks[6].reason?.message : null,
        checkedAt: checkTime
      },
      // Tier 3: Workflow
      n8n: {
        status: healthChecks[4].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[4].status === 'fulfilled' ? healthChecks[4].value.latency : null,
        error: healthChecks[4].status === 'rejected' ? healthChecks[4].reason?.message : null,
        checkedAt: checkTime
      }
    };

    // n8n API에서 워크플로우 상태 직접 조회 (AIMS 핵심 워크플로우만 필터링)
    const AIMS_CORE_WORKFLOWS = [
      'DocUpload', 'DocMeta', 'DocPrepMain', 'DocOCR',
      'OCRWorker', 'SmartSearch', 'DocSummary'
    ];
    let workflows = [];
    try {
      // n8n SQLite 데이터베이스에서 워크플로우 조회
      const n8nDbPath = '/n8n_data/database.sqlite';
      const { execSync } = require('child_process');
      const dbExists = require('fs').existsSync(n8nDbPath);

      if (dbExists) {
        const query = `SELECT id, name, active, updatedAt FROM workflow_entity WHERE name IN (${AIMS_CORE_WORKFLOWS.map(n => `'${n}'`).join(',')});`;
        const output = execSync(`sqlite3 "${n8nDbPath}" "${query}"`, { encoding: 'utf8' });
        const lines = output.trim().split('\n').filter(l => l);

        // 같은 이름의 워크플로우가 여러 개면 최신 것만 유지
        const workflowMap = new Map();
        for (const line of lines) {
          const [id, name, active, updatedAt] = line.split('|');
          const existing = workflowMap.get(name);
          if (!existing || new Date(updatedAt) > new Date(existing.updatedAt)) {
            workflowMap.set(name, {
              id,
              name,
              active: active === '1',
              updatedAt: new Date(updatedAt + 'Z').toISOString()
            });
          }
        }
        workflows = Array.from(workflowMap.values());
      }
    } catch (wfError) {
      console.error('[Admin] n8n 워크플로우 상태 조회 오류:', wfError.message);
    }

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        totalCustomers,
        totalDocuments,
        totalContracts
      },
      // 문서 처리 현황 (상세)
      documents: {
        total: totalDocuments,
        // OCR 분류
        ocr: {
          target: ocrTargetDocs,       // OCR 대상 (ocr 서브도큐먼트 있음)
          nonTarget: ocrNonTargetDocs, // OCR 비대상 (ocr 서브도큐먼트 없음)
          done: ocrDone,
          pending: ocrPending,
          processing: ocrProcessing,
          failed: ocrFailed
        },
        // 임베딩 분류
        embed: {
          done: embedDone,
          pending: embedPending,
          processing: embedProcessing,
          failed: embedFailed
        },
        // 전체 상태
        overall: {
          completed: overallCompleted,
          processing: overallProcessing,
          error: overallError
        }
      },
      // 레거시 호환 (기존 processing 필드)
      processing: {
        ocrQueue: ocrPending + ocrProcessing,
        embedQueue: embedPending + embedProcessing,
        failedDocuments: ocrFailed + embedFailed
      },
      health,
      ocr: {
        usedThisMonth: ocrUsedThisMonth,
        totalProcessed: ocrTotalProcessed
      },
      workflows
    });
  } catch (error) {
    console.error('[Admin] 대시보드 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '대시보드 통계 조회에 실패했습니다',
      error: error.message
    });
  }
});

// ==================== 시스템 메트릭 API ====================

/**
 * 관리자: 현재 시스템 메트릭 조회 (파이 차트용)
 */
app.get('/api/admin/metrics/current', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const metrics = metricsCollector.collectMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[Admin] 시스템 메트릭 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '시스템 메트릭 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: 시스템 메트릭 히스토리 조회 (시계열 그래프용)
 */
app.get('/api/admin/metrics/history', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const hoursNum = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168); // 1~168시간 (7일)
    const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);

    const metrics = await db.collection('system_metrics')
      .find({ timestamp: { $gte: since } })
      .sort({ timestamp: 1 })
      .toArray();

    res.json({
      success: true,
      data: {
        hours: hoursNum,
        count: metrics.length,
        metrics
      }
    });
  } catch (error) {
    console.error('[Admin] 메트릭 히스토리 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '메트릭 히스토리 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: 사용자 목록 조회 (페이징, 검색, 필터)
 */
app.get('/api/admin/users', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 50, search = '', role = '', hasOcrPermission } = req.query;

  console.log('[Admin Users API] 요청 파라미터:', { page, limit, search, role, hasOcrPermission });

  try {
    // 검색 필터 구성
    const filter = {};

    if (search) {
      const escapedSearch = escapeRegex(search);
      console.log('[Admin Users API] 검색어:', search, '-> 이스케이프:', escapedSearch);
      const searchRegex = new RegExp(escapedSearch, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (hasOcrPermission !== undefined && hasOcrPermission !== '') {
      filter.hasOcrPermission = hasOcrPermission === 'true';
    }

    // 페이지네이션
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    console.log('[Admin Users API] 필터:', JSON.stringify(filter));

    // 병렬로 사용자 목록과 전체 개수 조회
    const [users, total] = await Promise.all([
      db.collection('users')
        .find(filter, {
          projection: {
            // 보안상 소셜 로그인 ID 제외
            kakaoId: 0,
            naverId: 0,
            googleId: 0
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('users').countDocuments(filter)
    ]);

    console.log('[Admin Users API] 결과:', { total, returnedCount: users.length });

    // 각 사용자의 스토리지 사용량 계산
    const userIds = users.map(u => u._id.toString());
    const storageAgg = await db.collection('files').aggregate([
      { $match: { ownerId: { $in: userIds } } },
      { $group: {
        _id: '$ownerId',
        used_bytes: { $sum: { $toDouble: { $ifNull: ['$meta.size_bytes', '0'] } } }
      }}
    ]).toArray();

    const storageMap = {};
    storageAgg.forEach(item => {
      storageMap[item._id] = item.used_bytes;
    });

    // 각 사용자의 이번 달 OCR 사용량 계산 (files 컬렉션에서 실제 집계)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    const ocrAgg = await db.collection('files').aggregate([
      {
        $match: {
          ownerId: { $in: userIds },
          $or: [
            // ocr.done_at이 이번 달인 경우 (Date 또는 ISO string)
            { 'ocr.done_at': { $gte: startOfMonth } },
            { 'ocr.done_at': { $gte: startOfMonthISO } },
            // 이번 달에 생성된 문서 중 OCR 완료된 것
            {
              'meta.created_at': { $gte: startOfMonthISO },
              $or: [
                { 'ocr.status': 'done' },
                { 'meta.full_text': { $ne: null, $exists: true } }
              ]
            }
          ]
        }
      },
      {
        $group: {
          _id: '$ownerId',
          ocr_count: { $sum: 1 }
        }
      }
    ]).toArray();

    const ocrMap = {};
    ocrAgg.forEach(item => {
      ocrMap[item._id] = item.ocr_count;
    });

    // 티어 정의 로드 (OCR 할당량 포함)
    const tierDefinitions = await getTierDefinitions(db);

    // ObjectId를 문자열로 변환 및 스토리지 정보 추가
    const usersWithStringId = users.map(u => {
      const userId = u._id.toString();
      const isAdmin = u.role === 'admin';
      const tier = isAdmin ? 'admin' : (u.storage?.tier || 'standard');
      const tierDef = tierDefinitions[tier] || tierDefinitions['standard'];
      // 항상 티어 정의의 quota_bytes 사용 (관리자가 티어 용량 변경 시 즉시 반영)
      const quota_bytes = isAdmin ? -1 : (tierDef?.quota_bytes || 30 * 1024 * 1024 * 1024);
      const used_bytes = storageMap[userId] || 0;

      // OCR 할당량 계산 (ocrMap에서 실제 사용량 가져오기)
      const ocr_quota = isAdmin ? -1 : (tierDef?.ocr_quota ?? 100);
      const ocr_used_this_month = ocrMap[userId] ?? 0;

      return {
        ...u,
        _id: userId,
        storage: {
          tier,
          quota_bytes,
          used_bytes,
          usage_percent: quota_bytes > 0 ? Math.round((used_bytes / quota_bytes) * 100) : 0,
          ocr_quota,
          ocr_used_this_month
        }
      };
    });

    res.json({
      success: true,
      users: usersWithStringId,
      pagination: {
        total,
        page: parseInt(page),
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[Admin] 사용자 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '사용자 목록 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * Qdrant에서 문서의 모든 청크에 customer_id를 동기화합니다.
 * @param {string} documentId - 문서 ID (ObjectId 문자열)
 * @param {string|null} customerId - 고객 ID (ObjectId 문자열, null이면 제거)
 * @returns {Promise<{success: boolean, message: string, chunksUpdated?: number}>}
 */
async function syncQdrantCustomerRelation(documentId, customerId) {
  try {
    const qdrantCollectionName = 'docembed';

    // 1. Qdrant에서 해당 문서의 모든 청크 찾기 (doc_id로 필터링)
    const scrollResult = await qdrantClient.scroll(qdrantCollectionName, {
      filter: {
        must: [
          {
            key: 'doc_id',
            match: { value: documentId }
          }
        ]
      },
      limit: 1000, // 대용량 문서 대비 (최대 700개 예상)
      with_payload: true
    });

    const points = scrollResult.points; // Node.js 클라이언트는 {points: [], next_page_offset: ...} 형식으로 반환

    if (!points || points.length === 0) {
      console.log(`⚠️  [Qdrant 동기화] 문서 ${documentId}의 청크를 찾을 수 없습니다.`);
      return {
        success: true,
        message: 'Qdrant에 청크가 없음 (임베딩 전 문서)',
        chunksUpdated: 0
      };
    }

    console.log(`🔄 [Qdrant 동기화] 문서 ${documentId}의 ${points.length}개 청크 업데이트 시작`);

    // 2. 각 청크의 payload 업데이트
    const pointIds = points.map(point => point.id);

    if (customerId === null) {
      // customer_id 제거 (연결 해제)
      await qdrantClient.deletePayload(qdrantCollectionName, {
        keys: ['customer_id'],
        points: pointIds
      });
      console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에서 customer_id 제거 완료`);
    } else {
      // customer_id 추가/업데이트
      await qdrantClient.setPayload(qdrantCollectionName, {
        payload: { customer_id: customerId },
        points: pointIds
      });
      console.log(`✅ [Qdrant 동기화] ${pointIds.length}개 청크에 customer_id=${customerId} 설정 완료`);
    }

    return {
      success: true,
      message: 'Qdrant 동기화 성공',
      chunksUpdated: pointIds.length
    };

  } catch (error) {
    console.error(`❌ [Qdrant 동기화 오류] 문서 ${documentId}:`, error);
    return {
      success: false,
      message: `Qdrant 동기화 실패: ${error.message}`
    };
  }
}

/**
 * 고객에 문서 연결 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 * 🔑 JWT 또는 API Key 인증 지원 (n8n 웹훅용)
 */
app.post('/api/customers/:id/documents', authenticateJWTorAPIKey, async (req, res) => {
  // 🔑 활동 로그용 actor 정보 (try 블록 밖에서 정의하여 catch에서도 사용 가능)
  let actorInfo = {
    user_id: req.user?.id,
    name: req.user?.name,
    email: req.user?.email,
    role: req.user?.role
  };

  try {
    const { id } = req.params;
    const { document_id, notes } = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

    // 🔑 API Key 인증 시 실제 사용자 정보 조회 (활동 로그용)
    if (req.user.authMethod === 'apiKey' && userId) {
      try {
        const actualUser = await db.collection('users').findOne(
          { _id: new ObjectId(userId) },
          { projection: { name: 1, email: 1, role: 1 } }
        );
        if (actualUser) {
          actorInfo = {
            user_id: userId,
            name: actualUser.name,
            email: actualUser.email,
            role: actualUser.role || 'agent'
          };
        }
      } catch (e) {
        console.warn('[문서연결] 사용자 정보 조회 실패:', e.message);
      }
    }

    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 고객에 문서 연결 추가
    const documentLink = {
      document_id: new ObjectId(document_id),
      upload_date: utcNowDate(),
      notes: notes || ''
    };

    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { 
        $push: { documents: documentLink },
        $set: { 'meta.updated_at': utcNowDate() }
      }
    );

    // 문서에도 고객 연결 정보 추가
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          customerId: new ObjectId(id),
          customer_notes: notes || ''
        }
      }
    );

    // 🔥 Qdrant 동기화: 문서의 모든 청크에 customer_id 추가
    const qdrantResult = await syncQdrantCustomerRelation(document_id, id);
    console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

    // 📄 PDF 변환 트리거 (Office 문서인 경우)
    let pdfConversionResult = 'not_triggered';
    try {
      pdfConversionResult = await triggerPdfConversionIfNeeded(document);
      console.log(`📄 [PDF변환] 문서 ${document_id}: ${pdfConversionResult}`);
    } catch (convError) {
      console.error(`📄 [PDF변환] 트리거 실패 (${document_id}): ${convError.message}`);
      // PDF 변환 실패는 치명적이지 않으므로 계속 진행
    }

    // 📋 AR 문서인 경우 파싱 큐에 추가
    if (document.is_annual_report === true) {
      try {
        const queueDoc = {
          file_id: new ObjectId(document_id),
          customer_id: new ObjectId(id),
          status: 'pending',
          retry_count: 0,
          created_at: utcNowDate(),
          updated_at: utcNowDate(),
          processed_at: null,
          error_message: null,
          metadata: {
            filename: document.filename || 'unknown',
            mime_type: document.mimeType || 'unknown'
          }
        };

        // 중복 방지: file_id가 이미 존재하면 무시
        await db.collection('ar_parse_queue').updateOne(
          { file_id: new ObjectId(document_id) },
          { $setOnInsert: queueDoc },
          { upsert: true }
        );

        console.log(`✅ AR 파싱 큐에 작업 추가: file_id=${document_id}, customer_id=${id}`);
      } catch (queueError) {
        console.error(`❌ AR 파싱 큐 추가 실패: ${queueError.message}`);
        // 큐 추가 실패는 치명적이지 않으므로 계속 진행
      }
    }

    // 문서 업로드 성공 로그 (actorInfo 사용 - API Key 인증 시 실제 사용자 정보 포함)
    activityLogger.log({
      actor: {
        ...actorInfo,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'upload',
        category: 'document',
        description: '문서 업로드',
        target: {
          entity_type: 'document',
          entity_id: document_id,
          entity_name: document.upload?.originalName || document.meta?.filename || document.filename,
          parent_id: id,
          parent_name: customer.personal_info?.name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/customers/${id}/documents`,
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: '문서가 고객에게 성공적으로 연결되었습니다.',
      qdrant_sync: qdrantResult,
      pdf_conversion: pdfConversionResult
    });
  } catch (error) {
    console.error('문서 연결 오류:', error);

    // 문서 업로드 실패 로그 (actorInfo 사용)
    activityLogger.log({
      actor: {
        ...actorInfo,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'upload',
        category: 'document',
        description: '문서 업로드 실패',
        target: {
          entity_type: 'document',
          entity_id: req.body?.document_id,
          parent_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/customers/${req.params?.id}/documents`,
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '문서 연결에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객에서 문서 연결 해제 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.delete('/api/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
  try {
    const { id, document_id } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 연결 해제 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // ⭐ 문서 소유권 검증: 해당 설계사의 문서만 연결 해제 가능
    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(document_id), ownerId: userId });

    if (!document) {
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // AR 문서인 경우 파싱 데이터도 삭제
    if (document.is_annual_report) {
      const issueDate = document.ar_metadata?.issue_date;
      if (issueDate) {
        console.log(`🗑️  [AR 삭제] issue_date=${issueDate} 파싱 데이터 삭제`);
        await db.collection(CUSTOMERS_COLLECTION).updateOne(
          { _id: new ObjectId(id) },
          {
            $pull: { annual_reports: { issue_date: new Date(issueDate) } },
            $set: { 'meta.updated_at': utcNowDate() }
          }
        );
        console.log(`✅ [AR 삭제] 파싱 데이터 삭제 완료`);
      }
    }

    // 고객에서 문서 연결 제거
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { 
        $pull: { documents: { document_id: new ObjectId(document_id) } },
        $set: { 'meta.updated_at': utcNowDate() }
      }
    );

    // 문서에서 고객 연결 정보 제거
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $unset: {
          customerId: "",
          customer_notes: ""
        }
      }
    );

    // 🔥 Qdrant 동기화: 문서의 모든 청크에서 customer_id 제거
    const qdrantResult = await syncQdrantCustomerRelation(document_id, null);
    console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

    res.json({
      success: true,
      message: '문서 연결이 성공적으로 해제되었습니다.',
      qdrant_sync: qdrantResult
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
 * 고객 문서 메모 수정 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.patch('/api/customers/:id/documents/:document_id', authenticateJWT, async (req, res) => {
  try {
    const { id, document_id } = req.params;
    const { notes } = req.body;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id) || !ObjectId.isValid(document_id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 ID입니다.'
      });
    }

    // notes 유효성 검사 (undefined일 수 있음 - 빈 문자열로 삭제 허용)
    if (notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'notes는 문자열이어야 합니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 메모 수정 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
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

    const newNotes = notes !== undefined ? notes : '';

    // 고객 컬렉션에서 해당 문서의 notes 업데이트
    await db.collection(CUSTOMERS_COLLECTION).updateOne(
      {
        _id: new ObjectId(id),
        'documents.document_id': new ObjectId(document_id)
      },
      {
        $set: {
          'documents.$.notes': newNotes,
          'meta.updated_at': utcNowDate()
        }
      }
    );

    // 문서 컬렉션에서도 customer_notes 업데이트
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          customer_notes: newNotes
        }
      }
    );

    res.json({
      success: true,
      message: '메모가 성공적으로 수정되었습니다.',
      data: {
        notes: newNotes
      }
    });
  } catch (error) {
    console.error('메모 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '메모 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 고객 관련 문서 목록 조회 API
 */
app.get('/api/customers/:id/documents', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ userId 추출 (보안 강화)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)

    // 고객 정보 조회
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 🔥 Single Source of Truth: files.customerId로 직접 조회 (customers.documents[] 의존성 제거)
    // 이제 AR 문서와 일반 문서가 동일한 방식으로 조회됨
    const query = { customerId: new ObjectId(id) };
    if (userId) {
      query.ownerId = userId;
    }

    const documents = await db.collection(COLLECTION_NAME)
      .find(query)
      .sort({ 'upload.uploaded_at': -1 })
      .toArray();

    // 문서에 상태 정보 추가
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);

      // 🔥 Single Source of Truth: files 컬렉션 데이터 우선 사용
      // 기존 customers.documents[] 데이터는 fallback으로만 사용 (점진적 마이그레이션)
      const customerDoc = customer.documents?.find(d => d.document_id?.equals(doc._id));

      // badgeType 계산 (FILE_BADGE_SYSTEM.md 기준)
      let badgeType = 'BIN';
      if (doc.meta?.full_text && doc.meta.full_text.trim().length > 0) {
        badgeType = 'TXT';
      } else if (doc.ocr?.full_text) {
        badgeType = 'OCR';
      }

      // AR 문서 여부 판단: doc.is_annual_report 또는 customer.annual_reports에 source_file_id로 존재하는지 확인
      const isAR = doc.is_annual_report === true ||
        (customer.annual_reports || []).some(ar => ar.source_file_id?.equals(doc._id));

      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        // 🔥 files 데이터 우선, customers.documents fallback
        relationship: isAR ? 'annual_report' : (doc.customer_relationship || customerDoc?.relationship || null),
        notes: doc.customer_notes ?? customerDoc?.notes ?? null,
        linkedAt: normalizeTimestamp(doc.customer_linked_at || customerDoc?.upload_date || doc.upload?.uploaded_at),
        ar_metadata: doc.ar_metadata,
        badgeType: badgeType,
        conversionStatus: doc.upload?.conversion_status || null,
        isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),
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
    timestamp: utcNowISO()
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
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
app.get('/api/annual-report/status/:file_id', async (req, res) => {
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
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.get('/api/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
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
app.get('/api/customers/:customerId/annual-reports/pending', authenticateJWT, async (req, res) => {
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
    const pendingQueue = await db.collection('ar_parse_queue').find({
      customer_id: new ObjectId(customerId),
      status: { $in: ['pending', 'processing'] }
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
        db.collection('ar_parse_queue').deleteOne({ _id: queue._id }).catch(() => {});
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

    res.status(500).json({
      success: false,
      message: 'AR 파싱 대기 문서 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 고객의 최신 Annual Report 조회 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.get('/api/customers/:customerId/annual-reports/latest', authenticateJWT, async (req, res) => {
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
app.delete('/api/customers/:customerId/annual-reports', authenticateJWT, async (req, res) => {
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

    console.log(`🗑️  [Annual Report] 삭제 요청: customer=${customerId}, userId=${userId}, indices=${JSON.stringify(indices)}`);

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '삭제할 항목을 선택해주세요'
      });
    }

    const pythonApiUrl = `http://172.17.0.1:8004/customers/${customerId}/annual-reports`;

    const response = await axios.delete(pythonApiUrl, {
      data: { indices },
      headers: {
        'x-user-id': userId
      },
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

/**
 * 고객의 중복 Annual Reports 정리 프록시
 */
/**
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.post('/api/customers/:customerId/annual-reports/cleanup-duplicates', authenticateJWT, async (req, res) => {
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

// ==================== 주소 보관소 관리 API ====================

/**
 * 고객 주소 이력 조회 API
 * ⭐ 설계사별 고객 데이터 격리 적용
 */
app.get('/api/customers/:id/address-history', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;

    // ⭐ 설계사별 고객 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ 소유권 검증: 해당 설계사의 고객만 조회 가능
    const customer = await db.collection(CUSTOMERS_COLLECTION)
      .findOne({
        _id: new ObjectId(id),
        'meta.created_by': userId
      });

    if (!customer) {
      return res.status(403).json({
        success: false,
        error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // 주소 이력 조회 (현재 주소 + 이력)
    const addressHistory = [];
    
    // 1. 현재 주소 추가
    if (customer.personal_info?.address) {
      addressHistory.push({
        _id: 'current',
        address: customer.personal_info.address,
        changed_at: normalizeTimestamp(customer.meta?.updated_at || customer.meta?.created_at),
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
        changed_at: normalizeTimestamp(record.changed_at),
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
      changed_at: utcNowDate(),
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

// ==================== Customer Memos API ====================

const CUSTOMER_MEMOS_COLLECTION = 'customer_memos';

/**
 * GET /api/customers/:id/memos
 * 고객 메모 목록 조회
 */
app.get('/api/customers/:id/memos', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 고객 존재 및 소유권 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION).findOne({
      _id: new ObjectId(id),
      'meta.created_by': userId
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    // 메모 목록 조회 (최신순)
    const memos = await db.collection(CUSTOMER_MEMOS_COLLECTION)
      .find({ customer_id: new ObjectId(id) })
      .sort({ created_at: -1 })
      .toArray();

    // is_mine 필드 추가 (본인 메모 여부)
    const memosWithMine = memos.map(memo => ({
      ...memo,
      is_mine: memo.created_by === userId
    }));

    res.json({
      success: true,
      data: memosWithMine,
      total: memos.length
    });

  } catch (error) {
    console.error('메모 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '메모 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/customers/:id/memos
 * 고객 메모 생성
 */
app.post('/api/customers/:id/memos', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메모 내용을 입력해주세요.'
      });
    }

    // 고객 존재 및 소유권 확인
    const customer = await db.collection(CUSTOMERS_COLLECTION).findOne({
      _id: new ObjectId(id),
      'meta.created_by': userId
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: '고객을 찾을 수 없습니다.'
      });
    }

    const now = utcNowDate();
    const newMemo = {
      customer_id: new ObjectId(id),
      content: content.trim(),
      created_by: userId,
      created_at: now,
      updated_at: now
    };

    const result = await db.collection(CUSTOMER_MEMOS_COLLECTION).insertOne(newMemo);

    res.json({
      success: true,
      data: {
        _id: result.insertedId,
        ...newMemo,
        is_mine: true
      },
      message: '메모가 저장되었습니다.'
    });

  } catch (error) {
    console.error('메모 생성 오류:', error);
    res.status(500).json({
      success: false,
      error: '메모 저장에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/customers/:id/memos/:memoId
 * 고객 메모 수정 (본인만 가능)
 */
app.put('/api/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
  try {
    const { id, memoId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메모 내용을 입력해주세요.'
      });
    }

    // 메모 존재 확인
    const memo = await db.collection(CUSTOMER_MEMOS_COLLECTION).findOne({
      _id: new ObjectId(memoId),
      customer_id: new ObjectId(id)
    });

    if (!memo) {
      return res.status(404).json({
        success: false,
        error: '메모를 찾을 수 없습니다.'
      });
    }

    // 본인 메모인지 확인
    if (memo.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '본인이 작성한 메모만 수정할 수 있습니다.'
      });
    }

    const now = utcNowDate();
    await db.collection(CUSTOMER_MEMOS_COLLECTION).updateOne(
      { _id: new ObjectId(memoId) },
      {
        $set: {
          content: content.trim(),
          updated_at: now,
          updated_by: userId
        }
      }
    );

    res.json({
      success: true,
      data: {
        _id: memoId,
        content: content.trim(),
        updated_at: now,
        is_mine: true
      },
      message: '메모가 수정되었습니다.'
    });

  } catch (error) {
    console.error('메모 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '메모 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/customers/:id/memos/:memoId
 * 고객 메모 삭제 (본인만 가능)
 */
app.delete('/api/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
  try {
    const { id, memoId } = req.params;
    const userId = req.user.id;

    // 메모 존재 확인
    const memo = await db.collection(CUSTOMER_MEMOS_COLLECTION).findOne({
      _id: new ObjectId(memoId),
      customer_id: new ObjectId(id)
    });

    if (!memo) {
      return res.status(404).json({
        success: false,
        error: '메모를 찾을 수 없습니다.'
      });
    }

    // 본인 메모인지 확인
    if (memo.created_by !== userId) {
      return res.status(403).json({
        success: false,
        error: '본인이 작성한 메모만 삭제할 수 있습니다.'
      });
    }

    await db.collection(CUSTOMER_MEMOS_COLLECTION).deleteOne({
      _id: new ObjectId(memoId)
    });

    res.json({
      success: true,
      message: '메모가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('메모 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '메모 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

// ==================== Insurance Products API ====================

const INSURANCE_PRODUCTS_COLLECTION = 'insurance_products';

/**
 * GET /api/insurance-products
 * 보험상품 목록 조회
 */
app.get('/api/insurance-products', async (req, res) => {
  try {
    const { category, status, search, surveyDate, limit = 1000, skip = 0 } = req.query;

    const query = {};

    if (category && category !== 'all') {
      query.category = category;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.productName = { $regex: escapeRegex(search), $options: 'i' };
    }
    if (surveyDate) {
      query.surveyDate = surveyDate;
    }

    const products = await db.collection(INSURANCE_PRODUCTS_COLLECTION)
      .find(query)
      .sort({ category: 1, productName: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection(INSURANCE_PRODUCTS_COLLECTION).countDocuments(query);

    res.json({
      success: true,
      data: products,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

  } catch (error) {
    console.error('보험상품 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '보험상품 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/insurance-products/bulk
 * 보험상품 일괄 등록
 *
 * 로직:
 * 1. 같은 기준일의 데이터가 이미 있으면: 해당 기준일 데이터 모두 삭제 후 새 데이터로 대체
 * 2. 다른 기준일이면: productName 기준으로 upsert (기존 상품 업데이트, 새 상품 추가, 없어진 상품 삭제)
 */
app.post('/api/insurance-products/bulk', async (req, res) => {
  try {
    const { products, surveyDate } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: '등록할 상품 목록이 필요합니다.'
      });
    }

    if (!surveyDate) {
      return res.status(400).json({
        success: false,
        error: '기준일(surveyDate)이 필요합니다.'
      });
    }

    const now = utcNowDate();
    const collection = db.collection(INSURANCE_PRODUCTS_COLLECTION);

    // 기존 데이터 확인
    const existingDataWithSameDate = await collection.findOne({ surveyDate });

    if (existingDataWithSameDate) {
      // 같은 기준일 데이터 존재: 해당 기준일 데이터 삭제 후 새로 삽입
      const deleteResult = await collection.deleteMany({ surveyDate });
      console.log(`같은 기준일(${surveyDate}) 데이터 ${deleteResult.deletedCount}개 삭제`);

      const productsWithTimestamp = products.map(p => ({
        ...p,
        surveyDate,
        createdAt: now,
        updatedAt: now
      }));

      const insertResult = await collection.insertMany(productsWithTimestamp);

      res.json({
        success: true,
        message: `기존 ${deleteResult.deletedCount}개 삭제, ${insertResult.insertedCount}개 상품 등록 (기준일: ${surveyDate})`,
        insertedCount: insertResult.insertedCount,
        deletedCount: deleteResult.deletedCount,
        surveyDate
      });

    } else {
      // 다른 기준일: productName 기준으로 upsert (삭제 없음)
      // 상품은 삭제되지 않음 - 상태만 변경됨 (판매중 → 판매중지)
      let updatedCount = 0;
      let insertedCount = 0;

      for (const product of products) {
        const existingProduct = await collection.findOne({ productName: product.productName });

        if (existingProduct) {
          // 기존 상품 업데이트 (상태, 기준일 등)
          await collection.updateOne(
            { productName: product.productName },
            {
              $set: {
                ...product,
                surveyDate,
                updatedAt: now
              }
            }
          );
          updatedCount++;
        } else {
          // 새 상품 추가
          await collection.insertOne({
            ...product,
            surveyDate,
            createdAt: now,
            updatedAt: now
          });
          insertedCount++;
        }
      }

      res.json({
        success: true,
        message: `${updatedCount}개 업데이트, ${insertedCount}개 추가 (기준일: ${surveyDate})`,
        updatedCount,
        insertedCount,
        surveyDate
      });
    }

  } catch (error) {
    console.error('보험상품 일괄 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '보험상품 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/insurance-products
 * 단일 보험상품 등록
 */
app.post('/api/insurance-products', async (req, res) => {
  try {
    const product = req.body;

    if (!product.productName || !product.category) {
      return res.status(400).json({
        success: false,
        error: '상품명과 구분은 필수입니다.'
      });
    }

    const now = utcNowDate();
    const newProduct = {
      ...product,
      createdAt: now,
      updatedAt: now
    };

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).insertOne(newProduct);

    res.json({
      success: true,
      message: '상품이 등록되었습니다.',
      data: { ...newProduct, _id: result.insertedId }
    });

  } catch (error) {
    console.error('보험상품 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '보험상품 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/insurance-products/:id
 * 보험상품 수정
 */
app.put('/api/insurance-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 상품 ID입니다.'
      });
    }

    delete updates._id; // _id는 수정 불가
    updates.updatedAt = utcNowDate();

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '상품을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '상품이 수정되었습니다.'
    });

  } catch (error) {
    console.error('보험상품 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '보험상품 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/insurance-products/:id
 * 보험상품 삭제
 */
app.delete('/api/insurance-products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 상품 ID입니다.'
      });
    }

    const result = await db.collection(INSURANCE_PRODUCTS_COLLECTION).deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '상품을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '상품이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('보험상품 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '보험상품 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/insurance-products/statistics
 * 보험상품 통계
 */
app.get('/api/insurance-products/statistics', async (req, res) => {
  try {
    const { surveyDate } = req.query;
    const query = surveyDate ? { surveyDate } : {};

    const stats = await db.collection(INSURANCE_PRODUCTS_COLLECTION).aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', '판매중'] }, 1, 0] } },
          discontinued: { $sum: { $cond: [{ $eq: ['$status', '판매중지'] }, 1, 0] } }
        }
      }
    ]).toArray();

    const byCategory = await db.collection(INSURANCE_PRODUCTS_COLLECTION).aggregate([
      { $match: query },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    const surveyDates = await db.collection(INSURANCE_PRODUCTS_COLLECTION).distinct('surveyDate');

    res.json({
      success: true,
      data: {
        total: stats[0]?.total || 0,
        active: stats[0]?.active || 0,
        discontinued: stats[0]?.discontinued || 0,
        byCategory: byCategory.reduce((acc, c) => {
          acc[c._id] = c.count;
          return acc;
        }, {}),
        surveyDates: surveyDates.sort().reverse()
      }
    });

  } catch (error) {
    console.error('보험상품 통계 오류:', error);
    res.status(500).json({
      success: false,
      error: '통계 조회에 실패했습니다.',
      details: error.message
    });
  }
});

// ==================== Contracts API ====================

const CONTRACTS_COLLECTION = 'contracts';

/**
 * GET /api/contracts
 * 계약 목록 조회
 */
app.get('/api/contracts', authenticateJWT, async (req, res) => {
  try {
    // ⭐ 설계사별 데이터 격리: userId 검증
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    const { customer_id, search, limit = 1000, skip = 0 } = req.query;

    const query = {};

    // agent_id 필터 (필수 - 데이터 격리)
    const agentObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
    query.agent_id = agentObjectId;

    // customer_id 필터
    if (customer_id) {
      query.customer_id = new ObjectId(customer_id);
    }

    // 검색어 (고객명 또는 상품명)
    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { customer_name: searchRegex },
        { product_name: searchRegex },
        { policy_number: searchRegex }
      ];
    }

    const contracts = await db.collection(CONTRACTS_COLLECTION)
      .find(query)
      .sort({ 'meta.created_at': -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection(CONTRACTS_COLLECTION).countDocuments(query);

    res.json({
      success: true,
      data: contracts,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

  } catch (error) {
    console.error('계약 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '계약 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * GET /api/contracts/:id
 * 계약 상세 조회
 */
app.get('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    const contract = await db.collection(CONTRACTS_COLLECTION).findOne({
      _id: new ObjectId(id)
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      data: contract
    });

  } catch (error) {
    console.error('계약 상세 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '계약 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts
 * 단일 계약 등록
 */
app.post('/api/contracts', async (req, res) => {
  try {
    const contract = req.body;

    if (!contract.agent_id) {
      return res.status(400).json({
        success: false,
        error: 'agent_id는 필수입니다.'
      });
    }

    if (!contract.policy_number) {
      return res.status(400).json({
        success: false,
        error: '증권번호는 필수입니다.'
      });
    }

    // 증권번호 중복 체크
    const existing = await db.collection(CONTRACTS_COLLECTION).findOne({
      policy_number: contract.policy_number
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: '이미 존재하는 증권번호입니다.',
        existingId: existing._id
      });
    }

    const now = utcNowDate();
    const newContract = {
      agent_id: new ObjectId(contract.agent_id),
      customer_id: contract.customer_id ? new ObjectId(contract.customer_id) : null,
      insurer_id: contract.insurer_id ? new ObjectId(contract.insurer_id) : null,
      product_id: contract.product_id ? new ObjectId(contract.product_id) : null,
      customer_name: contract.customer_name || '',
      product_name: contract.product_name || '',
      contract_date: contract.contract_date || null,
      policy_number: contract.policy_number,
      premium: Number(contract.premium) || 0,
      payment_day: contract.payment_day || null,  // 원본 텍스트 그대로 저장
      payment_cycle: contract.payment_cycle || null,
      payment_period: contract.payment_period || null,
      insured_person: contract.insured_person || null,
      payment_status: contract.payment_status || null,
      meta: {
        created_at: now,
        updated_at: now,
        created_by: contract.agent_id,
        source: contract.source || 'manual'
      }
    };

    const result = await db.collection(CONTRACTS_COLLECTION).insertOne(newContract);

    // 계약 등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: contract.agent_id,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'contract',
        description: '계약 등록',
        target: {
          entity_type: 'contract',
          entity_id: result.insertedId.toString(),
          entity_name: contract.policy_number,
          parent_id: contract.customer_id,
          parent_name: contract.customer_name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: '/api/contracts',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: '계약이 등록되었습니다.',
      data: { ...newContract, _id: result.insertedId }
    });

  } catch (error) {
    console.error('계약 등록 오류:', error);

    // 계약 등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.body?.agent_id,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'create',
        category: 'contract',
        description: '계약 등록 실패',
        target: {
          entity_type: 'contract',
          entity_name: req.body?.policy_number
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/contracts',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts/bulk
 * 일괄 계약 등록/업데이트 (Excel Import용)
 * - 증권번호 기준 upsert: 존재하면 업데이트, 없으면 생성
 * - 변경사항 없으면 건너뜀
 */
app.post('/api/contracts/bulk', async (req, res) => {
  try {
    const { contracts, agent_id } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: 'agent_id는 필수입니다.'
      });
    }

    // agent_id 유효성 검사
    if (!ObjectId.isValid(agent_id)) {
      return res.status(400).json({
        success: false,
        error: 'agent_id가 유효하지 않습니다.',
        details: `받은 값: "${agent_id}" (24자리 hex 문자열이어야 합니다)`
      });
    }

    if (!Array.isArray(contracts) || contracts.length === 0) {
      return res.status(400).json({
        success: false,
        error: '계약 데이터가 비어있습니다.'
      });
    }

    const now = utcNowDate();
    const agentObjectId = new ObjectId(agent_id);

    // 고객 목록 조회 (이름으로 매칭)
    const customers = await db.collection('customers').find({}).toArray();
    const customerMap = new Map();
    customers.forEach(c => {
      const name = c.personal_info?.name?.trim().toLowerCase();
      if (name) customerMap.set(name, c._id);
    });

    // 상품 목록 조회 (상품명으로 매칭)
    const products = await db.collection(INSURANCE_PRODUCTS_COLLECTION).find({}).toArray();
    const productMap = new Map();
    products.forEach(p => {
      const name = p.productName?.trim().toLowerCase();
      if (name) productMap.set(name, p._id);
    });

    // 기존 계약 조회 (증권번호로 매칭, 전체 데이터 포함)
    const existingContracts = await db.collection(CONTRACTS_COLLECTION)
      .find({ agent_id: agentObjectId })
      .toArray();
    const contractMap = new Map();
    existingContracts.forEach(c => {
      if (c.policy_number) contractMap.set(c.policy_number, c);
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const errors = [];

    for (const contract of contracts) {
      try {
        // 증권번호 필수 체크
        if (!contract.policy_number) {
          errors.push({
            customer_name: contract.customer_name || '(미지정)',
            policy_number: '',
            reason: '증권번호 누락'
          });
          continue;
        }

        const existingContract = contractMap.get(contract.policy_number);

        if (existingContract) {
          // 기존 계약 존재 - 업데이트 필요 여부 확인
          const changes = [];
          const updateFields = {};

          // 보험료 비교/업데이트
          const newPremium = Number(contract.premium) || 0;
          if (newPremium && newPremium !== existingContract.premium) {
            updateFields.premium = newPremium;
            changes.push('보험료');
          }

          // 계약일 비교/업데이트
          if (contract.contract_date && contract.contract_date !== existingContract.contract_date) {
            updateFields.contract_date = contract.contract_date;
            changes.push('계약일');
          }

          // 이체일 비교/업데이트
          const newPaymentDay = contract.payment_day || null;
          if (newPaymentDay !== null && newPaymentDay !== existingContract.payment_day) {
            updateFields.payment_day = newPaymentDay;
            changes.push('이체일');
          }

          // 납입주기 비교/업데이트
          if (contract.payment_cycle && contract.payment_cycle !== existingContract.payment_cycle) {
            updateFields.payment_cycle = contract.payment_cycle;
            changes.push('납입주기');
          }

          // 납입기간 비교/업데이트
          if (contract.payment_period && contract.payment_period !== existingContract.payment_period) {
            updateFields.payment_period = contract.payment_period;
            changes.push('납입기간');
          }

          // 피보험자 비교/업데이트
          if (contract.insured_person && contract.insured_person !== existingContract.insured_person) {
            updateFields.insured_person = contract.insured_person;
            changes.push('피보험자');
          }

          // 납입상태 비교/업데이트
          if (contract.payment_status && contract.payment_status !== existingContract.payment_status) {
            updateFields.payment_status = contract.payment_status;
            changes.push('납입상태');
          }

          // 상품명 비교/업데이트
          if (contract.product_name && contract.product_name !== existingContract.product_name) {
            updateFields.product_name = contract.product_name;
            // product_id도 업데이트
            const productName = contract.product_name?.trim().toLowerCase();
            const productId = productMap.get(productName) || null;
            updateFields.product_id = productId;
            changes.push('상품명');
          }

          // 고객명 비교/업데이트
          if (contract.customer_name && contract.customer_name !== existingContract.customer_name) {
            updateFields.customer_name = contract.customer_name;
            // customer_id도 업데이트
            const customerName = contract.customer_name?.trim().toLowerCase();
            const customerId = customerMap.get(customerName) || null;
            updateFields.customer_id = customerId;
            changes.push('고객명');
          }

          if (changes.length > 0) {
            // 변경사항 있음 - 업데이트
            // MongoDB 제약: meta가 null이면 중첩 필드 설정 불가
            if (existingContract.meta !== null && existingContract.meta !== undefined) {
              updateFields['meta.updated_at'] = now;
            } else {
              updateFields['meta'] = { updated_at: now };
            }

            await db.collection(CONTRACTS_COLLECTION).updateOne(
              { _id: existingContract._id },
              { $set: updateFields }
            );

            updated.push({
              customer_name: contract.customer_name || existingContract.customer_name,
              product_name: contract.product_name || existingContract.product_name,
              policy_number: contract.policy_number,
              contract_date: contract.contract_date || existingContract.contract_date,
              premium: newPremium || existingContract.premium,
              payment_day: contract.payment_day || existingContract.payment_day,
              payment_cycle: contract.payment_cycle || existingContract.payment_cycle,
              payment_period: contract.payment_period || existingContract.payment_period,
              insured_person: contract.insured_person || existingContract.insured_person,
              payment_status: contract.payment_status || existingContract.payment_status,
              _id: existingContract._id.toString(),
              changes
            });
          } else {
            // 변경사항 없음 - 건너뜀
            skipped.push({
              customer_name: contract.customer_name || existingContract.customer_name,
              policy_number: contract.policy_number,
              reason: '변경사항 없음'
            });
          }
        } else {
          // 신규 계약 생성
          const customerName = contract.customer_name?.trim().toLowerCase();
          const productName = contract.product_name?.trim().toLowerCase();
          const customerId = customerMap.get(customerName) || null;
          const productId = productMap.get(productName) || null;

          const newContract = {
            agent_id: agentObjectId,
            customer_id: customerId,
            insurer_id: null,
            product_id: productId,
            customer_name: contract.customer_name || '',
            product_name: contract.product_name || '',
            contract_date: contract.contract_date || null,
            policy_number: contract.policy_number,
            premium: Number(contract.premium) || 0,
            payment_day: contract.payment_day || null,
            payment_cycle: contract.payment_cycle || null,
            payment_period: contract.payment_period || null,
            insured_person: contract.insured_person || null,
            payment_status: contract.payment_status || null,
            meta: {
              created_at: now,
              updated_at: now,
              created_by: agent_id,
              source: 'excel_import'
            }
          };

          const result = await db.collection(CONTRACTS_COLLECTION).insertOne(newContract);
          created.push({
            customer_name: contract.customer_name || '',
            product_name: contract.product_name || '',
            policy_number: contract.policy_number,
            contract_date: contract.contract_date || null,
            premium: Number(contract.premium) || 0,
            payment_day: contract.payment_day || null,
            payment_cycle: contract.payment_cycle || null,
            payment_period: contract.payment_period || null,
            insured_person: contract.insured_person || null,
            payment_status: contract.payment_status || null,
            _id: result.insertedId.toString()
          });

          // 현재 배치 내 중복 방지를 위해 맵에 추가
          contractMap.set(contract.policy_number, { ...newContract, _id: result.insertedId });
        }
      } catch (itemError) {
        errors.push({
          customer_name: contract.customer_name || '(미지정)',
          policy_number: contract.policy_number || '',
          reason: itemError.message
        });
      }
    }

    // 계약 일괄등록 성공 로그
    activityLogger.log({
      actor: {
        user_id: agent_id,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'contract',
        description: '계약 일괄 등록',
        bulkCount: created.length + updated.length
      },
      result: {
        success: true,
        statusCode: 200,
        affectedCount: created.length + updated.length
      },
      meta: {
        endpoint: '/api/contracts/bulk',
        method: 'POST'
      }
    });

    res.json({
      success: true,
      message: `${created.length}건 등록, ${updated.length}건 업데이트, ${skipped.length}건 건너뜀`,
      data: {
        createdCount: created.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        created: created.slice(0, 50),
        updated: updated.slice(0, 50),
        skipped: skipped.slice(0, 50),
        errors: errors.slice(0, 50)
      }
    });

  } catch (error) {
    console.error('계약 일괄 등록 오류:', error);

    // 계약 일괄등록 실패 로그
    activityLogger.log({
      actor: {
        user_id: req.body?.agent_id,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'bulk_create',
        category: 'contract',
        description: '계약 일괄 등록 실패'
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: '/api/contracts/bulk',
        method: 'POST'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 일괄 등록에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * PUT /api/contracts/:id
 * 계약 수정
 */
app.put('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    delete updates._id;
    delete updates.meta;

    // ObjectId 필드 변환
    if (updates.customer_id) updates.customer_id = new ObjectId(updates.customer_id);
    if (updates.product_id) updates.product_id = new ObjectId(updates.product_id);
    if (updates.insurer_id) updates.insurer_id = new ObjectId(updates.insurer_id);

    const result = await db.collection(CONTRACTS_COLLECTION).updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...updates,
          'meta.updated_at': utcNowDate()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '계약이 수정되었습니다.'
    });

  } catch (error) {
    console.error('계약 수정 오류:', error);
    res.status(500).json({
      success: false,
      error: '계약 수정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/contracts/:id
 * 계약 삭제
 */
app.delete('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 계약 ID입니다.'
      });
    }

    // 1. 계약 정보 조회 (customer_id 확인)
    const contract = await db.collection(CONTRACTS_COLLECTION).findOne({
      _id: new ObjectId(id)
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: '계약을 찾을 수 없습니다.'
      });
    }

    // 2. 고객의 contracts 배열에서 이 계약 참조 제거 (있는 경우)
    if (contract.customer_id) {
      const customerId = ObjectId.isValid(contract.customer_id)
        ? new ObjectId(contract.customer_id)
        : contract.customer_id;

      const customerUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: customerId },
        {
          $pull: { contracts: { contract_id: new ObjectId(id) } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );

      if (customerUpdateResult.modifiedCount > 0) {
        console.log(`🗑️ 고객 ${contract.customer_id}의 contracts 배열에서 계약 ${id} 참조 제거`);
      }
    }

    // 3. 계약 삭제
    const result = await db.collection(CONTRACTS_COLLECTION).deleteOne({
      _id: new ObjectId(id)
    });

    // 계약 삭제 성공 로그
    activityLogger.log({
      actor: {
        user_id: contract.agent_id?.toString(),
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'contract',
        description: '계약 삭제',
        target: {
          entity_type: 'contract',
          entity_id: id,
          entity_name: contract.policy_number,
          parent_id: contract.customer_id?.toString(),
          parent_name: contract.customer_name
        }
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: `/api/contracts/${id}`,
        method: 'DELETE'
      }
    });

    res.json({
      success: true,
      message: '계약이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('계약 삭제 오류:', error);

    // 계약 삭제 실패 로그
    activityLogger.log({
      actor: {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'delete',
        category: 'contract',
        description: '계약 삭제 실패',
        target: {
          entity_type: 'contract',
          entity_id: req.params?.id
        }
      },
      result: {
        success: false,
        statusCode: 500,
        error: { message: error.message }
      },
      meta: {
        endpoint: `/api/contracts/${req.params?.id}`,
        method: 'DELETE'
      }
    });

    res.status(500).json({
      success: false,
      error: '계약 삭제에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * DELETE /api/contracts/bulk
 * 계약 일괄 삭제
 */
app.delete('/api/contracts/bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: '삭제할 계약 ID 목록이 필요합니다.'
      });
    }

    const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '유효한 계약 ID가 없습니다.'
      });
    }

    // 1. 삭제할 계약들의 customer_id 조회
    const contracts = await db.collection(CONTRACTS_COLLECTION).find({
      _id: { $in: objectIds }
    }, { projection: { customer_id: 1 } }).toArray();

    // 2. 고객의 contracts 배열에서 이 계약들 참조 제거
    const customerIds = contracts
      .filter(c => c.customer_id)
      .map(c => ObjectId.isValid(c.customer_id) ? new ObjectId(c.customer_id) : c.customer_id);

    if (customerIds.length > 0) {
      const customerUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
        { _id: { $in: customerIds } },
        {
          $pull: { contracts: { contract_id: { $in: objectIds } } },
          $set: { 'meta.updated_at': utcNowDate() }
        }
      );

      if (customerUpdateResult.modifiedCount > 0) {
        console.log(`🗑️ ${customerUpdateResult.modifiedCount}명의 고객 contracts 배열에서 계약 참조 제거`);
      }
    }

    // 3. 계약 삭제
    const result = await db.collection(CONTRACTS_COLLECTION).deleteMany({
      _id: { $in: objectIds }
    });

    res.json({
      success: true,
      message: `${result.deletedCount}건 삭제되었습니다.`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('계약 일괄 삭제 오류:', error);
    res.status(500).json({
      success: false,
      error: '계약 일괄 삭제에 실패했습니다.',
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
    const analyticsDb = client.db(ANALYTICS_DB_NAME);

    // ActivityLogger 초기화
    activityLogger.initialize(analyticsDb).catch(err => {
      console.error('[Server] ActivityLogger 초기화 실패:', err.message);
    });

    // Passport 초기화
    require('./config/passport')(db);
    app.use(passport.initialize());

    // 인증 라우트 등록
    const authRoutes = require('./routes/auth')(db);
    app.use('/api/auth', authRoutes);

    // 고객 관계 라우트 설정
    setupCustomerRelationshipRoutes(app, db);

    // 개인 파일 관리 라우트 설정
    app.use('/api/personal-files', personalFilesRoutes);

    // AI 토큰 사용량 라우트 설정 (가장 먼저 등록)
    console.log('[Server] fallbackHandlersRegistered BEFORE token routes:', fallbackHandlersRegistered);
    const tokenUsageRoutes = require('./routes/token-usage-routes')(db, analyticsDb, authenticateJWT, requireRole);
    console.log('[Server] tokenUsageRoutes type:', typeof tokenUsageRoutes, 'stack:', tokenUsageRoutes.stack?.length);
    app.use('/api', tokenUsageRoutes);
    console.log('[Server] tokenUsageRoutes 등록 완료');

    // OCR 사용량 라우트 설정
    const ocrUsageRoutes = require('./routes/ocr-usage-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', ocrUsageRoutes);
    console.log('[Server] ocrUsageRoutes 등록 완료');

    // 사용자 활동 라우트 설정
    const userActivityRoutes = require('./routes/user-activity-routes')(db, analyticsDb, authenticateJWT, requireRole);
    app.use('/api', userActivityRoutes);
    console.log('[Server] userActivityRoutes 등록 완료');

    // 스토리지 쿼터 라우트 설정
    const storageRoutes = require('./routes/storage-routes')(db, authenticateJWT, requireRole);
    app.use('/api', storageRoutes);

    // 테스트: storage routes 바로 다음에 직접 라우트 등록
    app.get('/api/storage-test', (req, res) => {
      res.json({ success: true, message: 'Direct route after storage works!' });
    });

    // 보안 라우트 설정 (바이러스 검사)
    const securityRoutes = require('./routes/security-routes')(db, authenticateJWT);
    app.use('/api', securityRoutes);

    // 시스템 설정 라우트 설정 (파일 검증 설정 등)
    const systemSettingsRoutes = require('./routes/system-settings-routes')(db, authenticateJWT, requireRole);
    app.use('/api', systemSettingsRoutes);

    console.log('[Server] fallbackHandlersRegistered BEFORE registerFallbackHandlers():', fallbackHandlersRegistered);
    registerFallbackHandlers();
  })
  .catch(error => {
    console.error('MongoDB 연결 실패:', error);
    registerFallbackHandlers();
  });

// ==================== OCR 권한 백그라운드 체크 ====================
// 주기적으로 권한 없는 사용자의 문서를 확인하여 ocr.warn 설정
let ocrPermissionCheckInterval = null;

async function checkOcrPermissions() {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    const db = client.db(DB_NAME);

    try {
      // meta 완료 + full_text 없음 + ocr.warn 없음 + ocr.status 없음인 문서 조회
      const documents = await db.collection(COLLECTION_NAME).find({
        'meta.meta_status': 'ok',
        $or: [
          { 'meta.full_text': null },
          { 'meta.full_text': '' }
        ],
        'ocr.warn': { $exists: false },
        'ocr.status': { $exists: false }
      }).limit(100).toArray(); // 한 번에 최대 100개만 처리

      let processedCount = 0;
      let skippedCount = 0;

      for (const doc of documents) {
        if (!doc.ownerId) {
          console.log(`[OCR Permission Check] 문서 ${doc._id}: ownerId 없음, 스킵`);
          continue;
        }

        const user = await db.collection('users').findOne({ _id: new ObjectId(doc.ownerId) });

        if (!user || !user.hasOcrPermission) {
          await db.collection(COLLECTION_NAME).updateOne(
            { _id: doc._id },
            {
              $set: {
                'ocr.warn': 'OCR 권한이 없습니다. 관리자에게 문의하세요.',
                'ocr.status': 'skipped'
              }
            }
          );
          skippedCount++;
          console.log(`[OCR Permission Check] 문서 ${doc._id}: OCR 권한 없음, ocr.warn 설정`);
        }

        processedCount++;
      }

      if (processedCount > 0) {
        console.log(`[OCR Permission Check] 처리 완료: ${processedCount}개 확인, ${skippedCount}개 스킵 설정`);
      }
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('[OCR Permission Check] 오류:', error);
  }
}

// 5초마다 실행
ocrPermissionCheckInterval = setInterval(checkOcrPermissions, 5000);

// 서버 종료 시 interval 정리
process.on('SIGTERM', () => {
  if (ocrPermissionCheckInterval) {
    clearInterval(ocrPermissionCheckInterval);
    console.log('[OCR Permission Check] Interval 정리 완료');
  }
});

// 메트릭 수집 인터벌
let metricsCollectionInterval = null;

/**
 * 시스템 메트릭 수집 및 저장
 */
async function collectAndSaveMetrics() {
  try {
    const metrics = metricsCollector.collectMetrics();
    await db.collection('system_metrics').insertOne(metrics);
    console.log(`[Metrics] 시스템 메트릭 수집 완료 - CPU: ${metrics.cpu.usage}%, Mem: ${metrics.memory.usagePercent}%, Disk: ${metrics.disk.usagePercent}%`);
  } catch (error) {
    console.error('[Metrics] 메트릭 수집 실패:', error.message);
  }
}

/**
 * 메트릭 컬렉션 TTL 인덱스 설정 (7일 후 자동 삭제)
 */
async function setupMetricsCollection() {
  try {
    const collections = await db.listCollections({ name: 'system_metrics' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('system_metrics');
      console.log('[Metrics] system_metrics 컬렉션 생성됨');
    }

    // TTL 인덱스 설정 (이미 있으면 무시됨)
    await db.collection('system_metrics').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 604800 } // 7일
    );
    console.log('[Metrics] TTL 인덱스 설정 완료 (7일 보관)');
  } catch (error) {
    // 인덱스가 이미 있으면 무시
    if (!error.message.includes('already exists')) {
      console.error('[Metrics] 인덱스 설정 실패:', error.message);
    }
  }
}

process.on('SIGINT', () => {
  if (ocrPermissionCheckInterval) {
    clearInterval(ocrPermissionCheckInterval);
    console.log('[OCR Permission Check] Interval 정리 완료');
  }
  if (metricsCollectionInterval) {
    clearInterval(metricsCollectionInterval);
    console.log('[Metrics] Interval 정리 완료');
  }
});

// =============================================================================
// n8n Webhook 프록시 엔드포인트 (보안: 내부망에서만 n8n 접근 가능)
// =============================================================================

const N8N_INTERNAL_URL = 'http://localhost:5678';

/**
 * 스마트 검색 프록시 - n8n smartsearch webhook
 * 외부에서 직접 n8n에 접근하지 못하도록 aims_api를 통해 프록시
 */
app.post('/api/n8n/smartsearch', authenticateJWT, async (req, res) => {
  try {
    console.log(`[n8n Proxy] smartsearch 요청 - userId: ${req.user.userId}`);

    const response = await axios.post(
      `${N8N_INTERNAL_URL}/webhook/smartsearch`,
      {
        ...req.body,
        userId: req.user.userId  // 인증된 사용자 정보 주입
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000  // 60초 타임아웃 (AI 검색은 시간이 걸릴 수 있음)
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[n8n Proxy] smartsearch 오류:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Search service unavailable' });
    }
  }
});

/**
 * 문서 업로드 프록시 - n8n docprep-main webhook
 * 외부에서 직접 n8n에 접근하지 못하도록 aims_api를 통해 프록시
 */
app.post('/api/n8n/docprep', authenticateJWT, async (req, res) => {
  try {
    console.log(`[n8n Proxy] docprep 요청 - userId: ${req.user.userId}`);

    const response = await axios.post(
      `${N8N_INTERNAL_URL}/webhook/docprep-main`,
      {
        ...req.body,
        userId: req.user.userId  // 인증된 사용자 정보 주입
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000  // 120초 타임아웃 (파일 업로드는 시간이 걸릴 수 있음)
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('[n8n Proxy] docprep 오류:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Upload service unavailable' });
    }
  }
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n🚀🚀🚀 ================================');
  console.log(`🚀 문서 상태 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🚀 서버 시간: ${utcNowISO()}`);
  console.log(`🚀 바인딩: 0.0.0.0:${PORT} (모든 네트워크 인터페이스)`);
  console.log('🚀🚀🚀 ================================\n');

  // MongoDB 연결 대기 (최대 30초)
  let dbWaitCount = 0;
  while (!db && dbWaitCount < 30) {
    console.log('[Metrics] MongoDB 연결 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    dbWaitCount++;
  }

  if (!db) {
    console.error('[Metrics] MongoDB 연결 실패 - 메트릭 수집 비활성화');
  } else {
    // 메트릭 수집 설정
    await setupMetricsCollection();

    // 즉시 1회 수집 후, 1분마다 수집
    await collectAndSaveMetrics();
    metricsCollectionInterval = setInterval(collectAndSaveMetrics, 60 * 1000);
    console.log('[Metrics] 시스템 메트릭 수집 시작 (1분 간격)');
  }

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

  console.log(`
📁 Personal Files APIs:`);
  console.log(`  GET  /api/personal-files/folders/:folderId? - 폴더 내용 조회`);
  console.log(`  POST /api/personal-files/folders - 폴더 생성`);
  console.log(`  POST /api/personal-files/upload - 파일 업로드`);
  console.log(`  PUT  /api/personal-files/:itemId/rename - 항목 이름 변경`);
  console.log(`  DELETE /api/personal-files/:itemId - 항목 삭제`);
  console.log(`  GET  /api/personal-files/:fileId/download - 파일 다운로드`);
  console.log(`  GET  /api/customers/:customerId/annual-reports - 고객 Annual Reports 목록`);
  console.log(`  GET  /api/customers/:customerId/annual-reports/latest - 최신 Annual Report 조회`);

  console.log(`\n🔍 디버깅 활성화: 모든 HTTP 요청/응답 로깅 중...`);
  console.log(`=============================================\n`);
});

// ==================== AR Background Parsing Proxy ====================
/**
 * AR 백그라운드 파싱 프록시 엔드포인트
 * 포트 8004 방화벽 문제 우회용
 */
app.post("/api/ar-background/trigger-parsing", authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    console.log("🚀 [AR 백그라운드 파싱 프록시] 요청 수신, userId:", userId);

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/ar-background/trigger-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 5000
      }
    );

    console.log("✅ [AR 백그라운드 파싱 프록시] 성공:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("❌ [AR 백그라운드 파싱 프록시] 실패:", error.message);
    res.status(500).json({
      success: false,
      error: "백그라운드 파싱 트리거 실패",
      details: error.message
    });
  }
});

/**
 * AR 파싱 재시도 프록시 엔드포인트
 * 파싱 실패한 AR 문서를 다시 파싱 요청
 */
app.post("/api/ar-background/retry-parsing", authenticateJWT, async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }

    const { file_id } = req.body;
    if (!file_id) {
      return res.status(400).json({
        success: false,
        message: 'file_id required'
      });
    }

    console.log("🔄 [AR 파싱 재시도 프록시] 요청 수신, file_id:", file_id, "userId:", userId);

    // localhost:8004로 요청 전달
    const response = await axios.post(
      "http://localhost:8004/ar-background/retry-parsing",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId
        },
        timeout: 5000
      }
    );

    console.log("✅ [AR 파싱 재시도 프록시] 성공:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("❌ [AR 파싱 재시도 프록시] 실패:", error.message);
    res.status(500).json({
      success: false,
      error: "파싱 재시도 트리거 실패",
      details: error.message
    });
  }
});

module.exports = app;
