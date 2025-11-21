// server.js - 문서 상태 모니터링 API 서버
require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { prepareDocumentResponse, formatBytes } = require('./lib/documentStatusHelper');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('./lib/timeUtils');
const passport = require('passport');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5177',
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

let db;
let fallbackHandlersRegistered = false;

// Qdrant 클라이언트 인스턴스
const qdrantClient = new QdrantClient({ host: QDRANT_HOST, port: QDRANT_PORT });

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
app.get('/api/documents', async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
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
    let query = {
      ownerId: userId
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

    // customer_relation이 있는 문서의 customer_id 수집
    const customerIds = documents
      .filter(doc => doc.customer_relation?.customer_id)
      .map(doc => doc.customer_relation.customer_id);

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
      if (doc.customer_relation?.customer_id) {
        const customerId = doc.customer_relation.customer_id.toString();
        customerRelation = {
          customer_id: customerId,
          customer_name: customerMap[customerId] || null,
          relationship_type: doc.customer_relation.relationship_type,
          assigned_by: doc.customer_relation.assigned_by,
          assigned_at: doc.customer_relation.assigned_at,
          notes: doc.customer_relation.notes
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
app.get('/api/documents/status', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, sort, customerLink, fileScope = 'all' } = req.query;
    const skip = (page - 1) * limit;

    // 🔍 정렬 파라미터 디버깅
    console.error(`\n🔍🔍🔍 [정렬 디버깅] sort=${sort}, page=${page}, limit=${limit}, fileScope=${fileScope}`);

    // userId 추출 (헤더 또는 쿼리)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // 필터 조건 구성 - ownerId 필터 추가
    let filter = {
      ownerId: userId
    };

    // 🍎 파일 범위 필터 추가
    if (fileScope === 'excludeMyFiles') {
      // 내 파일 제외: ownerId !== customerId 또는 customerId 없음
      filter.$or = [
        { customerId: { $exists: false } },
        { customerId: null },
        { $expr: { $ne: ['$ownerId', '$customerId'] } }
      ];
    } else if (fileScope === 'onlyMyFiles') {
      // 내 파일만: ownerId === customerId
      filter.$expr = { $eq: ['$ownerId', '$customerId'] };
    }

    // 🍎 고객 연결 필터 추가
    if (customerLink === 'linked') {
      filter['customer_relation.customer_id'] = { $exists: true, $ne: null };
    } else if (customerLink === 'unlinked') {
      filter['customer_relation.customer_id'] = { $exists: false };
    }

    if (search) {
      filter['upload.originalName'] = { $regex: search, $options: 'i' };
    }

    // 문서 조회 및 정렬
    let documents;
    const totalCount = await db.collection(COLLECTION_NAME).countDocuments(filter);

    // fileSize, mimeType, customer 정렬은 aggregation 사용
    if (sort === 'customer_asc' || sort === 'customer_desc') {
      // customer 정렬: customers 컬렉션과 join하여 고객 이름으로 정렬
      const sortOrder = sort === 'customer_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_relation.customer_id',
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
    } else {
      // 일반 정렬 조건 구성
      let sortCriteria = { 'upload.uploaded_at': -1 }; // 기본: 최신순
      if (sort === 'status_asc') {
        sortCriteria = { overallStatus: 1, 'upload.uploaded_at': -1 };
      } else if (sort === 'status_desc') {
        sortCriteria = { overallStatus: -1, 'upload.uploaded_at': -1 };
      } else if (sort === 'filename_asc') {
        sortCriteria = { 'upload.originalName': 1, 'upload.uploaded_at': -1 };
      } else if (sort === 'filename_desc') {
        sortCriteria = { 'upload.originalName': -1, 'upload.uploaded_at': -1 };
      } else if (sort === 'uploadDate_asc') {
        sortCriteria = { 'upload.uploaded_at': 1 };
      } else if (sort === 'uploadDate_desc') {
        sortCriteria = { 'upload.uploaded_at': -1 };
      }

      documents = await db.collection(COLLECTION_NAME)
        .find(filter)
        .sort(sortCriteria)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();
    }

    // customer_relation이 있는 문서의 customer_id 수집
    const customerIds = documents
      .filter(doc => doc.customer_relation?.customer_id)
      .map(doc => doc.customer_relation.customer_id);

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
      if (doc.customer_relation?.customer_id) {
        const customerId = doc.customer_relation.customer_id.toString();
        customerRelation = {
          customer_id: customerId,
          customer_name: customerMap[customerId] || null,
          relationship_type: doc.customer_relation.relationship_type,
          assigned_by: doc.customer_relation.assigned_by,
          assigned_at: doc.customer_relation.assigned_at,
          notes: doc.customer_relation.notes
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
        uploadedAt: normalizeTimestamp(document.upload?.uploaded_at),
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
app.get('/api/documents/statistics', async (req, res) => {
  try {
    // userId 추출 (헤더 또는 쿼리)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

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
 * 문서에 Annual Report 플래그 및 메타데이터 설정 API
 */
app.patch('/api/documents/set-annual-report', async (req, res) => {
  try {
    const { filename, metadata } = req.body;

    console.log(`🏷️  [Set AR Flag] 요청 - filename: ${filename}, metadata:`, metadata);

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

    // is_annual_report 필드 및 메타데이터 설정
    const updateFields = { is_annual_report: true };

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
    if (document.is_annual_report) {
      try {
        console.log(`🗑️  [AR 삭제] Annual Report 문서 삭제 감지: file_id=${id}`);

        // 1. 고객 ID 및 발행일 추출
        const customerId = document.customer_relation?.customer_id;
        const issueDate = document.ar_metadata?.issue_date;

        if (!customerId) {
          console.warn('⚠️ [AR 삭제] customer_id를 찾을 수 없음 - AR 파싱 삭제 건너뜀');
        } else if (!issueDate) {
          console.warn('⚠️ [AR 삭제] issue_date를 찾을 수 없음 - AR 파싱 삭제 건너뜀');
        } else {
          // 2. 해당 고객의 annual_reports에서 동일한 발행일을 가진 모든 항목 제거
          console.log(`🗓️  [AR 삭제] 발행일: ${issueDate} - 동일 발행일의 모든 AR 파싱 삭제`);

          const arDeleteResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { '_id': customerId },
            {
              $pull: { annual_reports: { issue_date: new Date(issueDate) } },
              $set: { 'meta.updated_at': utcNowDate() }
            }
          );

          if (arDeleteResult.modifiedCount > 0) {
            console.log(`✅ [AR 삭제] AR 파싱 데이터 삭제 완료: customer_id=${customerId}, issue_date=${issueDate}`);
          } else {
            console.log(`ℹ️  [AR 삭제] 삭제할 AR 파싱 데이터 없음 (issue_date로 매칭 실패)`);
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
app.get('/api/customers', async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
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
      status,
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
 * 윈도우식 중복명 처리를 위한 고유한 고객명 생성 함수
 * @param {string} originalName - 원본 고객명
 * @param {string} userId - 설계사(사용자) ID - 설계사별로 고객명 중복 체크
 */
async function generateUniqueCustomerName(originalName, userId) {
  // 해당 설계사의 고객 중에서만 중복 체크
  const filter = { 'personal_info.name': originalName };
  if (userId) {
    filter['meta.created_by'] = userId;
  }

  // 원본 이름으로 먼저 검색 (해당 설계사 소속 고객만)
  const existingCustomer = await db.collection(CUSTOMERS_COLLECTION)
    .findOne(filter);

  // 중복이 없으면 원본 이름 반환
  if (!existingCustomer) {
    return originalName;
  }

  // 중복이 있으면 (1), (2), ... 형태로 번호 붙이기
  let counter = 1;
  let uniqueName;

  while (true) {
    uniqueName = `${originalName} (${counter})`;

    const duplicateFilter = { 'personal_info.name': uniqueName };
    if (userId) {
      duplicateFilter['meta.created_by'] = userId;
    }

    const duplicateCheck = await db.collection(CUSTOMERS_COLLECTION)
      .findOne(duplicateFilter);

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

    // ⭐ userId 추출 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required'
      });
    }

    // 원본 고객명을 기준으로 유니크한 이름 생성
    const originalName = customerData.personal_info?.name;
    if (!originalName) {
      return res.status(400).json({
        success: false,
        error: '고객명은 필수 입력 항목입니다.'
      });
    }

    const uniqueName = await generateUniqueCustomerName(originalName, userId);

    const newCustomer = {
      ...customerData,
      personal_info: {
        ...customerData.personal_info,
        name: uniqueName
      },
      meta: {
        created_at: utcNowDate(),
        updated_at: utcNowDate(),
        created_by: userId,
        last_modified_by: userId,
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
          customer_relation: {
            customer_id: new ObjectId(id),
            relationship_type: relationship_type || 'general',
            assigned_by: assigned_by || null,
            assigned_at: utcNowDate(),
            notes: notes || ''
          }
        }
      }
    );

    // 🔥 Qdrant 동기화: 문서의 모든 청크에 customer_id 추가
    const qdrantResult = await syncQdrantCustomerRelation(document_id, id);
    console.log(`📊 [Qdrant 동기화 결과] ${qdrantResult.message}, 업데이트된 청크: ${qdrantResult.chunksUpdated || 0}개`);

    res.json({
      success: true,
      message: '문서가 고객에게 성공적으로 연결되었습니다.',
      qdrant_sync: qdrantResult
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
        $unset: { customer_relation: "" }
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
 */
app.patch('/api/customers/:id/documents/:document_id', async (req, res) => {
  try {
    const { id, document_id } = req.params;
    const { notes } = req.body;

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

    // 문서 컬렉션에서도 customer_relation.notes 업데이트
    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(document_id) },
      {
        $set: {
          'customer_relation.notes': newNotes
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
app.get('/api/customers/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 고객 ID입니다.'
      });
    }

    // ⭐ userId 추출 (보안 강화)
    const userId = req.query.userId || req.headers['x-user-id'];

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

    // ⭐ ownerId 필터 추가 (사용자별 문서 격리)
    const query = { _id: { $in: documentIds } };
    if (userId) {
      query.ownerId = userId;
    }

    const documents = await db.collection(COLLECTION_NAME)
      .find(query)
      .toArray();

    // 문서에 상태 정보 추가
    const documentsWithStatus = documents.map(doc => {
      const statusInfo = analyzeDocumentStatus(doc);
      const customerDoc = customer.documents.find(d => d.document_id.equals(doc._id));

      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        relationship: customerDoc?.relationship,
        notes: customerDoc?.notes,
        linkedAt: normalizeTimestamp(customerDoc?.upload_date),
        ar_metadata: doc.ar_metadata,
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

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
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
 */
app.get('/api/customers/:customerId/annual-reports/pending', async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log(`📋 [Annual Report] AR 파싱 대기 문서 조회: ${customerId}`);

    // AR 파싱 대기 또는 진행 중인 문서 조회
    const pendingDocs = await db.collection(COLLECTION_NAME).find({
      'customer_relation.customer_id': new ObjectId(customerId),
      is_annual_report: true,
      $or: [
        { ar_parsing_status: { $exists: false } },
        { ar_parsing_status: 'pending' },
        { ar_parsing_status: 'processing' }
      ]
    }).project({
      _id: 1,
      'upload.originalName': 1,
      'upload.uploaded_at': 1,
      ar_parsing_status: 1,
      'ar_metadata.issue_date': 1
    }).toArray();

    res.json({
      success: true,
      data: {
        pending_count: pendingDocs.length,
        documents: pendingDocs.map(doc => ({
          file_id: doc._id.toString(),
          filename: doc.upload?.originalName || 'Unknown',
          uploaded_at: normalizeTimestamp(doc.upload?.uploaded_at),
          status: doc.ar_parsing_status || 'pending',
          issue_date: doc.ar_metadata?.issue_date
        }))
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
app.get('/api/customers/:customerId/annual-reports/latest', async (req, res) => {
  const { customerId } = req.params; // catch 블록에서도 접근 가능하도록 밖으로 이동

  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
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
app.delete('/api/customers/:customerId/annual-reports', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { indices } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
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
app.post('/api/customers/:customerId/annual-reports/cleanup-duplicates', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { issue_date, reference_linked_at } = req.body;

    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
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

// ==================== MongoDB 연결 & 서버 시작 ====================

// 고객 관계 관리 라우트 설정
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('MongoDB 연결 성공');
    db = client.db(DB_NAME);

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
  console.log(`🚀 서버 시간: ${utcNowISO()}`);
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
app.post("/api/ar-background/trigger-parsing", async (req, res) => {
  try {
    // ⭐ userId 추출 및 검증 (사용자 계정 기능)
    const userId = req.query.userId || req.headers['x-user-id'];
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

module.exports = app;
