/**
 * documents-routes.js - Document CRUD, PDF 변환, 문서 상태 라우트
 *
 * Phase 10: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');
const { escapeRegex, toSafeObjectId, isBinaryMimeType, getInitialFromChar, CHOSUNG_RANGE_MAP } = require('../lib/helpers');
const activityLogger = require('../lib/activityLogger');
const sseManager = require('../lib/sseManager');
const { notifyCustomerDocSubscribers, notifyDocumentStatusSubscribers, notifyDocumentListSubscribers, notifyPersonalFilesSubscribers, sendSSE } = sseManager;
const { prepareDocumentResponse, isConvertibleFile, analyzeDocumentStatus } = require('../lib/documentStatusHelper');
const createPdfConversionTrigger = require('../lib/pdfConversionTrigger');
const { MAX_MANUAL_RETRIES } = createPdfConversionTrigger;

const COLLECTION_NAME = COLLECTIONS.FILES;
const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;

module.exports = function(db, analyticsDb, authenticateJWT, upload, qdrantClient, qdrantCollection) {
  const router = express.Router();
  const QDRANT_COLLECTION = qdrantCollection;

  // ZIP 다운로드 임시 파일 관리 (이어받기 지원)
  const pendingDownloads = new Map(); // downloadId → { filePath, filename, userId, size, skippedFiles, expiresAt, downloaded }
  const activeZipGenerations = new Map(); // requestId → { userId, archive, aborted } — ZIP 생성 중인 요청 추적
  const DOWNLOAD_TTL_MS = 30 * 60 * 1000; // 30분
  const DOWNLOAD_TEMP_DIR = '/tmp/aims-zip-downloads';

  // 임시 디렉토리 생성 + 만료 파일 정리 (5분 간격)
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const { authenticateJWTWithQuery } = require('../middleware/auth');
  try { fs.mkdirSync(DOWNLOAD_TEMP_DIR, { recursive: true }); } catch { /* 이미 존재 */ }
  const cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of pendingDownloads) {
      if (now > entry.expiresAt) {
        try { fs.unlinkSync(entry.filePath); } catch { /* 이미 삭제됨 */ }
        pendingDownloads.delete(id);
      }
    }
  }, 5 * 60 * 1000);

  // 사용자별 동시 다운로드(생성 중 + 대기 중) 카운트 헬퍼
  function countUserDownloads(userId) {
    let count = 0;
    for (const entry of activeZipGenerations.values()) {
      if (entry.userId === userId) count++;
    }
    for (const entry of pendingDownloads.values()) {
      if (entry.userId === userId && !entry.downloaded) count++;
    }
    return count;
  }

  const PDF_CONVERTER_HOST = process.env.PDF_CONVERTER_HOST || 'localhost';
  const PDF_CONVERTER_PORT = process.env.PDF_CONVERTER_PORT || 8005;

  // PDF 변환 오케스트레이션 (공유 모듈)
  const { convertDocumentInBackground, triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);

  // 🔧 full_text 제거 + badgeType 플래그: aggregation 파이프라인 공용 스테이지
  const TEXT_FLAG_STAGES = [
    { $addFields: {
      _hasMetaText: {
        $cond: {
          if: { $and: [
            { $ne: [{ $ifNull: ['$meta.full_text', null] }, null] },
            { $ne: ['$meta.full_text', ''] }
          ]},
          then: true,
          else: false
        }
      },
      _hasOcrText: {
        $cond: {
          if: { $and: [
            { $ne: [{ $ifNull: ['$ocr.full_text', null] }, null] },
            { $ne: ['$ocr.full_text', ''] }
          ]},
          then: true,
          else: false
        }
      }
    }},
    { $project: { 'meta.full_text': 0, 'ocr.full_text': 0 } }
  ];

// ========================
// PDF 변환 프록시 엔드포인트 (POC용)
// ========================

/**
 * PDF 변환 프록시 - 파일 업로드를 PDF 변환 서버로 전달
 * POST /api/pdf/convert
 * multipart/form-data로 파일 전송
 */
router.post('/pdf/convert', upload.single('file'), async (req, res) => {
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
    backendLogger.error('Documents', '[PDF Proxy] 변환 실패', error);

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

// analyzeDocumentStatus, prepareDocumentResponse, formatBytes는 lib/documentStatusHelper.js로 이동됨

/**
 * 문서 통계 조회 API
 * GET /api/documents/stats
 */
router.get('/documents/stats', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const baseFilter = { ownerId: userId };

    // 병렬로 통계 조회
    const [total, active, archived, deleted, ocrStats, sizeStats] = await Promise.all([
      // 전체 문서 수
      db.collection(COLLECTIONS.FILES).countDocuments(baseFilter),
      // 활성 문서 수
      db.collection(COLLECTIONS.FILES).countDocuments({
        ...baseFilter,
        status: { $nin: ['archived', 'deleted'] }
      }),
      // 보관 문서 수
      db.collection(COLLECTIONS.FILES).countDocuments({
        ...baseFilter,
        status: 'archived'
      }),
      // 삭제 문서 수
      db.collection(COLLECTIONS.FILES).countDocuments({
        ...baseFilter,
        status: 'deleted'
      }),
      // OCR 통계
      db.collection(COLLECTIONS.FILES).aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: null,
            completed: { $sum: { $cond: [{ $eq: ['$ocr_status', 'completed'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $in: ['$ocr_status', ['pending', 'processing', null]] }, 1, 0] } }
          }
        }
      ]).toArray(),
      // 총 파일 크기
      db.collection(COLLECTIONS.FILES).aggregate([
        { $match: baseFilter },
        { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
      ]).toArray()
    ]);

    res.json({
      success: true,
      total,
      active,
      archived,
      deleted,
      totalSize: sizeStats[0]?.totalSize || 0,
      ocrCompleted: ocrStats[0]?.completed || 0,
      ocrPending: ocrStats[0]?.pending || 0,
      mostUsedTags: []
    });
  } catch (error) {
    console.error('[Documents Stats] Error:', error);
    backendLogger.error('Documents', '문서 통계 조회 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 🔴 파일 해시 중복 검사 API
 * 동일한 해시를 가진 파일이 이미 존재하는지 확인 (전체 시스템에서)
 * @route POST /api/documents/check-hash
 */
router.post('/documents/check-hash', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const { fileHash, customerId } = req.body;
    if (!fileHash || typeof fileHash !== 'string') {
      return res.status(400).json({ success: false, error: 'fileHash required (SHA-256)' });
    }

    // 전역 db 변수 사용 (이미 docupload DB에 연결됨)

    // 🔴 customerId가 제공되면 해당 고객에게만 중복 체크
    // customerId가 없으면 미분류 문서(customerId=null)에서만 체크
    const query = {
      ownerId: userId,
      'meta.file_hash': fileHash
    };

    if (customerId) {
      // 특정 고객에게 업로드하는 경우: 해당 고객의 문서만 체크
      query.customerId = ObjectId.isValid(customerId) ? new ObjectId(customerId) : customerId;
    } else {
      // 미분류로 업로드하는 경우: 미분류 문서만 체크
      query.customerId = null;
    }

    const existingDoc = await db.collection(COLLECTION_NAME).findOne(
      query,
      {
        projection: {
          _id: 1,
          'upload.originalName': 1,
          customerId: 1,
          'meta.file_hash': 1,
          'upload.uploaded_at': 1
        }
      }
    );

    if (existingDoc) {
      // 고객 정보 조회 (있는 경우)
      let customerName = null;
      if (existingDoc.customerId) {
        const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne(
          { _id: new ObjectId(existingDoc.customerId) },
          { projection: { 'personal_info.name': 1 } }
        );
        customerName = customer?.personal_info?.name || null;
      }

      return res.json({
        success: true,
        isDuplicate: true,
        existingDocument: {
          documentId: existingDoc._id.toString(),
          fileName: existingDoc.upload?.originalName || 'unknown',
          customerId: existingDoc.customerId || null,
          customerName,
          uploadedAt: existingDoc.upload?.uploaded_at || null
        }
      });
    }

    res.json({
      success: true,
      isDuplicate: false
    });
  } catch (error) {
    console.error('[Documents Check Hash] Error:', error);
    backendLogger.error('Documents', '해시 중복 검사 오류', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * 모든 문서 목록 조회 API (문서검색View용)
 */
router.get('/documents', authenticateJWT, async (req, res) => {
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
    let { page, limit = 10, offset, search, sort = 'uploadTime_desc', sortBy, sortOrder, mimeType, customerId: customerIdFilter } = req.query;

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
    // customerId 필터 처리:
    // - customerId=null → 고객 미연결 문서만 (개인 파일 포함)
    // - customerId=<id> → 특정 고객 문서만
    // - customerId 없음 → 모든 고객 연결 문서 (개인 파일 제외)
    let query = { ownerId: userId };

    if (customerIdFilter === 'null' || customerIdFilter === '') {
      // Issue #3 수정: customerId=null 필터 - 고객 미연결 문서
      query.$or = [
        { customerId: null },
        { customerId: { $exists: false } }
      ];
      console.log('📂 고객 미연결 문서 필터 적용');
    } else if (customerIdFilter && ObjectId.isValid(customerIdFilter)) {
      // 특정 고객의 문서만
      query.customerId = new ObjectId(customerIdFilter);
      console.log(`📂 특정 고객 문서 필터: ${customerIdFilter}`);
    } else {
      // 기본: 고객 연결 문서만 (설계사 개인 파일 제외)
      // customerId가 ownerId와 같으면 개인 파일이므로 제외
      query.customerId = { $exists: true, $ne: null };
      query.$expr = { $ne: [{ $toString: '$customerId' }, userId] };  // customerId !== ownerId
    }

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
      
    } else if (sort === 'uploadTime_desc' || sort === 'uploadTime_asc' || !sort) {
      // 🔧 uploadTime 정렬: Date/String 혼합 타입 대응을 위해 $toDate 사용
      const sortOrder = sort === 'uploadTime_asc' ? 1 : -1;
      console.log(`📝 uploadTime 정렬 요청: ${sort} (aggregation)`);

      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: query },
        {
          $addFields: {
            uploaded_at_normalized: { $toDate: '$upload.uploaded_at' }
          }
        },
        { $sort: { uploaded_at_normalized: sortOrder } },
        { $skip: parseInt(skip) },
        { $limit: parseInt(limit) },
        { $project: { uploaded_at_normalized: 0 } }
      ]).toArray();
    } else {
      // filename 정렬
      console.log(`📝 일반 정렬 요청: ${sort}`);

      let sortOption = {};
      switch (sort) {
        case 'filename_asc':
          sortOption = { 'upload.originalName': 1 };
          break;
        case 'filename_desc':
          sortOption = { 'upload.originalName': -1 };
          break;
        default:
          sortOption = { 'upload.uploaded_at': -1 };
      }

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

    // Intentional fire-and-forget: 응답 속도를 위해 비동기 후처리.
    // 실패 시 다음 요청에서 자동 재시도됨 (docsToFix는 매 요청마다 재계산)
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
      const customers = await db.collection(COLLECTIONS.CUSTOMERS)
        .find({ _id: { $in: customerIds } })
        .project({ _id: 1, 'personal_info.name': 1, 'insurance_info.customer_type': 1 })
        .toArray();

      console.log('[DEBUG] customers found:', customers.length);
      console.log('[DEBUG] customers:', JSON.stringify(customers, null, 2));

      customers.forEach(customer => {
        customerMap[customer._id.toString()] = {
          name: customer.personal_info?.name || null,
          type: customer.insurance_info?.customer_type || null
        };
      });

      console.log('[DEBUG] customerMap:', customerMap);
    }

    // 문서 데이터 변환 (단순화)
    const transformedDocuments = documents.map(doc => {
      // 단순한 상태 판단
      let status = 'processing';
      let progress = 50;

      // 1. MongoDB에 저장된 progress 필드 우선 사용 (document_pipeline에서 업데이트)
      if (doc.progress !== undefined && doc.progress !== null) {
        progress = doc.progress;
        status = doc.progress >= 100 ? 'completed' : 'processing';
      }
      // 2. progress 필드가 없으면 기존 로직으로 계산
      else if (doc.ocr && doc.ocr.status === 'done') {
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
          customer_name: customerMap[customerId]?.name || null,
          customer_type: customerMap[customerId]?.type || null,
          notes: doc.customer_notes || ''
        };
      }

      return {
        _id: doc._id,
        filename: doc.upload?.originalName || 'Unknown File',
        displayName: doc.displayName || null,
        displayNameStatus: doc.displayNameStatus || null,
        fileSize: doc.meta?.size_bytes || 0,
        mimeType: doc.meta?.mime || 'unknown',
        uploadTime: doc.upload?.uploaded_at || doc.createdAt,
        status: status,
        progress: progress,
        filePath: doc.upload?.destPath,
        is_annual_report: doc.is_annual_report || false,
        is_customer_review: doc.is_customer_review || false,
        customer_relation: customerRelation,
        ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
        customerId: doc.customerId || null,  // 🆕 내 파일 기능
        document_type: doc.document_type || (doc.meta && doc.meta.document_type) || null,  // 🏷️ 문서 유형
        document_type_auto: doc.document_type_auto || (doc.meta && doc.meta.document_type_auto) || false  // 🏷️ 자동 분류 여부
      };
    });

    res.json({
      success: true,
      data: {
        documents: transformedDocuments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount: parseInt(totalCount),
          hasNext: (page * limit) < totalCount,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    backendLogger.error('Documents', '문서 목록 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '문서 목록 조회에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 문서 초성 카운트 조회 API
 * DB 전체 문서의 연결된 고객명 초성별 카운트 반환
 * GET /api/documents/status/initials?fileScope=excludeMyFiles
 */
router.get('/documents/status/initials', authenticateJWT, async (req, res) => {
  try {
    const { fileScope = 'excludeMyFiles' } = req.query;
    const userId = req.user.id;

    // /documents/status와 동일한 base filter 구성
    let filter;
    if (fileScope === 'onlyMyFiles') {
      filter = {
        ownerId: userId,
        $expr: { $eq: [{ $toString: '$customerId' }, userId] }
      };
    } else if (fileScope === 'all') {
      filter = { ownerId: userId };
    } else {
      // excludeMyFiles (기본값)
      filter = {
        ownerId: userId,
        customerId: { $exists: true, $ne: null },
        $expr: { $ne: [{ $toString: '$customerId' }, userId] }
      };
    }

    // 1. customerId별 문서 수 집계
    const docCountsByCustomer = await db.collection(COLLECTION_NAME).aggregate([
      { $match: filter },
      { $group: { _id: '$customerId', count: { $sum: 1 } } }
    ]).toArray();

    // 2. 고객 이름 조회
    const validIds = docCountsByCustomer.map(d => d._id).filter(id => id != null);
    const customers = validIds.length > 0
      ? await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ _id: { $in: validIds } })
          .project({ _id: 1, 'personal_info.name': 1 })
          .toArray()
      : [];

    // 3. 초성별 문서 수 카운트
    const customerNameMap = new Map();
    customers.forEach(c => customerNameMap.set(String(c._id), c.personal_info?.name || ''));

    const initials = {};
    docCountsByCustomer.forEach(d => {
      const name = customerNameMap.get(String(d._id));
      if (!name) return;
      const initial = getInitialFromChar(name.charAt(0));
      if (initial) {
        initials[initial] = (initials[initial] || 0) + d.count;
      }
    });

    res.json({ success: true, data: { initials } });
  } catch (error) {
    backendLogger.error('Documents', '초성 카운트 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '초성 카운트 조회에 실패했습니다.'
    });
  }
});

/**
 * 문서 탐색기 트리 데이터 조회 API
 * 고객별 문서 수, 최신 업로드 일시, 초성별 카운트를 한 번에 반환
 * initial 파라미터 지정 시 해당 초성 고객의 문서 목록도 포함
 * GET /api/documents/status/explorer-tree?fileScope=excludeMyFiles&initial=ㄱ
 */
router.get('/documents/status/explorer-tree', authenticateJWT, async (req, res) => {
  try {
    const { fileScope = 'excludeMyFiles', initial, search } = req.query;
    const userId = req.user.id;

    // fileScope 필터 구성 (initials 엔드포인트와 동일 패턴)
    let filter;
    if (fileScope === 'onlyMyFiles') {
      filter = {
        ownerId: userId,
        $expr: { $eq: [{ $toString: '$customerId' }, userId] }
      };
    } else if (fileScope === 'all') {
      filter = { ownerId: userId };
    } else {
      // excludeMyFiles (기본값)
      filter = {
        ownerId: userId,
        customerId: { $exists: true, $ne: null },
        $expr: { $ne: [{ $toString: '$customerId' }, userId] }
      };
    }

    // 1. customerId별 문서 수 + 최신 업로드 일시 집계
    const docStatsByCustomer = await db.collection(COLLECTION_NAME).aggregate([
      { $match: filter },
      { $group: {
        _id: '$customerId',
        docCount: { $sum: 1 },
        latestUpload: { $max: { $toDate: { $ifNull: ['$upload.uploaded_at', new Date(0)] } } }
      }}
    ]).toArray();

    // 2. 고객 이름 + customer_type 조회
    const validIds = docStatsByCustomer.map(d => d._id).filter(id => id != null);
    const customers = validIds.length > 0
      ? await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ _id: { $in: validIds } })
          .project({ _id: 1, 'personal_info.name': 1, 'insurance_info.customer_type': 1 })
          .toArray()
      : [];

    const customerNameMap = new Map();
    const customerTypeMap = new Map();
    customers.forEach(c => {
      customerNameMap.set(String(c._id), c.personal_info?.name || '');
      customerTypeMap.set(String(c._id), c.insurance_info?.customer_type || null);
    });

    // 3. 초성별 문서 수 카운트 + 고객 리스트 구성
    const initials = {};
    let totalDocuments = 0;
    const customerList = [];

    docStatsByCustomer.forEach(d => {
      const customerId = String(d._id);
      const name = customerNameMap.get(customerId);
      if (!name) return;

      const customerInitial = getInitialFromChar(name.charAt(0));
      if (!customerInitial) return;

      // 초성별 문서 수 누적
      initials[customerInitial] = (initials[customerInitial] || 0) + d.docCount;
      totalDocuments += d.docCount;

      customerList.push({
        customerId,
        name,
        initial: customerInitial,
        docCount: d.docCount,
        latestUpload: d.latestUpload,
        customerType: customerTypeMap.get(customerId) || null
      });
    });

    // 고객명 가나다순 정렬
    customerList.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    // 4. initial 파라미터가 있으면 해당 초성 고객의 문서 목록 포함
    let documents = undefined;
    if (initial && typeof initial === 'string' && initial.length === 1) {
      // 해당 초성에 속하는 고객 ID 필터링
      const filteredCustomerIds = customerList
        .filter(c => c.initial === initial)
        .map(c => c.customerId);

      if (filteredCustomerIds.length > 0) {
        // customerId를 ObjectId로 변환
        const customerObjectIds = filteredCustomerIds
          .map(id => toSafeObjectId(id))
          .filter(id => id !== null);

        if (customerObjectIds.length > 0) {
          // customerObjectIds는 이미 ownerId 기반 집계를 거쳐 도출된 값이므로
          // $expr 없이 ownerId + customerId 조건만으로 충분
          const docFilter = {
            ownerId: userId,
            customerId: { $in: customerObjectIds }
          };

          const rawDocs = await db.collection(COLLECTION_NAME).aggregate([
            { $match: docFilter },
            { $sort: { 'upload.uploaded_at': -1 } },
            ...TEXT_FLAG_STAGES
          ]).toArray();

          // 고객 이름 + customer_type 맵 구성 (응답 매핑용)
          const customerMap = {};
          const customerTypeMapByInitial = {};
          customerList
            .filter(c => c.initial === initial)
            .forEach(c => {
              customerMap[c.customerId] = c.name;
              customerTypeMapByInitial[c.customerId] = c.customerType;
            });

          // 응답 매핑 — /documents/status 엔드포인트와 동일 형식
          documents = rawDocs.map(doc => {
            let customerRelation = null;
            const effectiveCustomerId = doc.customerId;
            if (effectiveCustomerId) {
              const cid = effectiveCustomerId.toString();
              customerRelation = {
                customer_id: cid,
                customer_name: customerMap[cid] || null,
                customer_type: customerTypeMapByInitial[cid] || null,
                notes: doc.customer_notes || ''
              };
            }

            const statusInfo = analyzeDocumentStatus(doc);

            // badgeType 계산
            let badgeType = doc.badgeType;
            if (!badgeType) {
              if (doc._hasMetaText) badgeType = 'TXT';
              else if (doc._hasOcrText) badgeType = 'OCR';
              else if (doc.meta?.mime && doc.meta.mime.startsWith('image/')) badgeType = 'OCR';
              else badgeType = 'BIN';
            }

            return {
              _id: doc._id,
              originalName: doc.upload?.originalName || 'Unknown File',
              displayName: doc.displayName || null,
              displayNameStatus: doc.displayNameStatus || null,
              uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
              fileSize: doc.meta?.size_bytes,
              mimeType: doc.meta?.mime,
              is_annual_report: doc.is_annual_report,
              is_customer_review: doc.is_customer_review,
              customer_relation: customerRelation,
              badgeType,
              _hasMetaText: doc._hasMetaText || false,
              _hasOcrText: doc._hasOcrText || false,
              conversionStatus: doc.upload?.conversion_status || null,
              isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),
              upload: doc.upload ? {
                originalName: doc.upload.originalName,
                uploaded_at: doc.upload.uploaded_at,
                destPath: doc.upload.destPath,
                convPdfPath: doc.upload.convPdfPath,
                conversion_status: doc.upload.conversion_status,
              } : null,
              meta: doc.meta ? {
                mime: doc.meta.mime,
                size_bytes: doc.meta.size_bytes,
                pdf_pages: doc.meta.pdf_pages,
                meta_status: doc.meta.meta_status,
                summary: doc.meta.summary,
                created_at: doc.meta.created_at,
              } : null,
              ocr: doc.ocr ? {
                status: doc.ocr.status,
                confidence: doc.ocr.confidence,
                done_at: doc.ocr.done_at,
                summary: doc.ocr.summary,
              } : null,
              docembed: doc.docembed,
              ownerId: doc.ownerId || null,
              customerId: doc.customerId || null,
              folderId: doc.folderId || null,
              document_type: doc.document_type || (doc.meta && doc.meta.document_type) || null,
              document_type_auto: doc.document_type_auto || (doc.meta && doc.meta.document_type_auto) || false,
              virusScan: doc.virusScan || null,
              ...statusInfo
            };
          });
        }
      }

      // 문서가 없으면 빈 배열
      if (!documents) documents = [];
    }

    // 5. search 파라미터: 고객명 + 파일명 통합 검색
    let searchDocuments = undefined;
    let filteredCustomerList = customerList;

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      const searchRegex = new RegExp(escapeRegex(searchTerm), 'i');

      // 고객명 매칭 고객 ID Set
      const nameMatchedIds = new Set(
        customerList.filter(c => searchRegex.test(c.name)).map(c => c.customerId)
      );

      // 파일명 매칭 문서 검색 (displayName 또는 originalName)
      const allCustomerObjectIds = customerList
        .map(c => toSafeObjectId(c.customerId))
        .filter(id => id !== null);

      // allCustomerObjectIds는 이미 ownerId 기반 집계(1단계)로 도출되었으므로
      // ownerId + customerId $in 조건만으로 데이터 격리 보장
      const searchFilter = {
        ownerId: userId,
        customerId: { $in: allCustomerObjectIds },
        $or: [
          { displayName: { $regex: searchRegex } },
          { 'upload.originalName': { $regex: searchRegex } }
        ]
      };

      const matchedDocs = await db.collection(COLLECTION_NAME).aggregate([
        { $match: searchFilter },
        { $sort: { 'upload.uploaded_at': -1 } },
        // 고객별 최대 5건씩만 (인라인 미리보기용)
        { $group: {
          _id: '$customerId',
          docs: { $push: {
            _id: '$_id',
            displayName: '$displayName',
            originalName: { $ifNull: ['$upload.originalName', 'Unknown File'] },
            uploadedAt: { $ifNull: ['$upload.uploaded_at', null] },
            fileSize: { $ifNull: ['$meta.size_bytes', null] },
            mimeType: { $ifNull: ['$meta.mime', null] },
            document_type: { $ifNull: ['$document_type', { $ifNull: ['$meta.document_type', null] }] },
            badgeType: '$badgeType'
          }},
          totalCount: { $sum: 1 }
        }},
        { $project: {
          docs: { $slice: ['$docs', 5] },
          totalCount: 1
        }}
      ]).toArray();

      // 파일명 매칭된 고객 ID Set
      const docMatchedIds = new Set(matchedDocs.map(g => String(g._id)));

      // searchDocuments 평탄화 (고객별 최대 5건)
      searchDocuments = [];
      matchedDocs.forEach(group => {
        const cid = String(group._id);
        const cName = customerNameMap.get(cid) || '';
        group.docs.forEach(doc => {
          searchDocuments.push({
            _id: String(doc._id),
            displayName: doc.displayName || null,
            originalName: doc.originalName,
            uploadedAt: doc.uploadedAt ? normalizeTimestamp(doc.uploadedAt) : null,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            customerId: cid,
            customerName: cName,
            document_type: doc.document_type,
            badgeType: doc.badgeType || 'BIN',
          });
        });
      });

      // 고객명 매칭 OR 파일명 매칭된 고객만 필터
      filteredCustomerList = customerList.filter(c =>
        nameMatchedIds.has(c.customerId) || docMatchedIds.has(c.customerId)
      );

      // 고객별 매칭 문서 수 맵
      const docMatchCountMap = new Map(matchedDocs.map(g => [String(g._id), g.totalCount]));

      // 고객 리스트에 matchedDocCount + nameMatched 플래그 추가
      filteredCustomerList = filteredCustomerList.map(c => ({
        ...c,
        matchedDocCount: docMatchCountMap.get(c.customerId) || 0,
        nameMatched: nameMatchedIds.has(c.customerId),
      }));

      // 정렬: 고객명 매칭 우선 → 매칭 문서 수 내림차순 → 이름순
      filteredCustomerList.sort((a, b) => {
        // 1) 고객명 매칭 고객 우선
        if (a.nameMatched && !b.nameMatched) return -1;
        if (!a.nameMatched && b.nameMatched) return 1;
        // 2) 매칭 문서 수 내림차순
        const countA = a.matchedDocCount || 0;
        const countB = b.matchedDocCount || 0;
        if (countB !== countA) return countB - countA;
        // 3) 이름순
        return a.name.localeCompare(b.name, 'ko');
      });
    }

    const responseData = {
      customers: filteredCustomerList,
      totalCustomers: filteredCustomerList.length,
      totalDocuments,
      initials
    };

    // initial이 지정된 경우에만 documents 포함
    if (documents !== undefined) {
      responseData.documents = documents;
    }

    // search 결과 포함
    if (searchDocuments !== undefined) {
      responseData.searchDocuments = searchDocuments;
    }

    res.json({ success: true, data: responseData });
  } catch (error) {
    backendLogger.error('Documents', '탐색기 트리 데이터 조회 오류', error);
    res.status(500).json({
      success: false,
      error: '탐색기 트리 데이터 조회에 실패했습니다.'
    });
  }
});

/**
 * 🐛 BUG-3 FIX: 필터 조건에 해당하는 모든 문서 ID 조회 (전체 선택용)
 * 페이지네이션 없이 ID만 반환하여 "전체 선택" 기능 지원
 */
router.get('/documents/status/all-ids', authenticateJWT, async (req, res) => {
  try {
    const { customerId: customerIdFilter, fileScope = 'excludeMyFiles', initial, initialType } = req.query;
    const userId = req.user.id;

    // initialType 유효성 검증
    const VALID_INITIAL_TYPES = ['korean', 'alphabet', 'number'];
    if (initialType && !VALID_INITIAL_TYPES.includes(initialType)) {
      return res.status(400).json({ success: false, message: 'Invalid initialType' });
    }

    // 기본 필터 구성 (documents/status와 동일)
    let filter = {
      ownerId: userId,
      customerId: { $exists: true, $ne: null },
      $expr: { $ne: [{ $toString: '$customerId' }, userId] }
    };

    if (fileScope === 'onlyMyFiles') {
      filter = {
        ownerId: userId,
        $expr: { $eq: [{ $toString: '$customerId' }, userId] }
      };
    } else if (fileScope === 'all') {
      filter = { ownerId: userId };
    }

    // 특정 고객 필터
    if (customerIdFilter && typeof customerIdFilter === 'string' && ObjectId.isValid(customerIdFilter)) {
      filter['customerId'] = new ObjectId(customerIdFilter);
    }

    // 초성 카테고리 필터 (initialType)
    if (initialType && !initial) {
      let nameFilter = null;
      if (initialType === 'korean') {
        nameFilter = { $gte: '가', $lt: '\uD7A4' };
      } else if (initialType === 'alphabet') {
        nameFilter = { $regex: /^[A-Za-z]/ };
      } else if (initialType === 'number') {
        nameFilter = { $not: { $regex: /^[가-힣A-Za-z]/ } };
      }
      if (nameFilter) {
        const matchingCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ 'meta.created_by': userId, 'personal_info.name': nameFilter })
          .project({ _id: 1 })
          .toArray();
        if (matchingCustomers.length > 0) {
          const ids = matchingCustomers.map(c => c._id);
          if (!(filter['customerId'] instanceof ObjectId)) {
            filter['customerId'] = { $in: ids };
          }
        } else {
          return res.json({ success: true, data: { ids: [] } });
        }
      }
    }

    // 초성 필터 (initial)
    if (initial && typeof initial === 'string' && initial.length === 1) {
      let nameFilter = null;
      const code = initial.charCodeAt(0);
      if (code >= 0x3131 && code <= 0x314E) {
        const range = CHOSUNG_RANGE_MAP[initial];
        if (range) nameFilter = { $gte: range[0], $lt: range[1] };
      } else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        const upper = initial.toUpperCase();
        const lower = initial.toLowerCase();
        nameFilter = { $regex: `^[${escapeRegex(upper)}${escapeRegex(lower)}]` };
      } else if (code >= 48 && code <= 57) {
        nameFilter = { $regex: `^${escapeRegex(initial)}` };
      } else if (initial === '#') {
        nameFilter = { $not: { $regex: /^[가-힣ㄱ-ㅎA-Za-z0-9]/ } };
      }
      if (nameFilter) {
        const matchingCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ 'meta.created_by': userId, 'personal_info.name': nameFilter })
          .project({ _id: 1 })
          .toArray();
        if (matchingCustomers.length > 0) {
          const ids = matchingCustomers.map(c => c._id);
          if (!(filter['customerId'] instanceof ObjectId)) {
            filter['customerId'] = { $in: ids };
          }
        } else {
          return res.json({ success: true, data: { ids: [] } });
        }
      }
    }

    // _id만 조회 (성능 최적화)
    const documents = await db.collection(COLLECTION_NAME)
      .find(filter)
      .project({ _id: 1 })
      .toArray();

    const ids = documents.map(doc => doc._id.toString());
    res.json({ success: true, data: { ids, totalCount: ids.length } });
  } catch (error) {
    console.error('[documents/status/all-ids] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 모든 문서의 상태를 조회하는 API
 */
router.get('/documents/status', authenticateJWT, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, sort, customerLink, fileScope = 'excludeMyFiles', searchField, period, initial, initialType, customerId: customerIdFilter } = req.query;
    const skip = (page - 1) * limit;

    // (정렬 디버깅 로그 제거됨 — 성능 최적화)

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

    // 🍎 특정 고객의 문서만 필터링 (고객 필터 기능)
    if (customerIdFilter && typeof customerIdFilter === 'string' && ObjectId.isValid(customerIdFilter)) {
      filter['customerId'] = new ObjectId(customerIdFilter);
    }

    if (search) {
      const escapedSearch = escapeRegex(search);
      // 🍎 searchField에 따라 검색 대상 필드 결정
      if (searchField === 'displayName') {
        // 별칭 모드: displayName 우선, 없으면 originalName도 포함 (OR 검색)
        filter['$or'] = [
          { displayName: { $regex: escapedSearch, $options: 'i' } },
          { 'upload.originalName': { $regex: escapedSearch, $options: 'i' } }
        ];
      } else {
        // 원본 모드 (기본값): originalName에서만 검색
        filter['upload.originalName'] = { $regex: escapedSearch, $options: 'i' };
      }
    }

    // 📊 기간 필터 (DocumentManagementView 최근 활동용)
    const VALID_PERIODS = ['1week', '1month', '3months', '6months', '1year'];
    if (period && VALID_PERIODS.includes(period)) {
      const cutoff = new Date();
      switch (period) {
        case '1week': cutoff.setDate(cutoff.getDate() - 7); break;
        case '1month': cutoff.setMonth(cutoff.getMonth() - 1); break;
        case '3months': cutoff.setMonth(cutoff.getMonth() - 3); break;
        case '6months': cutoff.setMonth(cutoff.getMonth() - 6); break;
        case '1year': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      }
      const periodExpr = { $gte: [
        { $toDate: { $ifNull: ['$upload.uploaded_at', new Date(0)] } },
        cutoff
      ]};
      if (filter.$expr) {
        filter.$expr = { $and: [filter.$expr, periodExpr] };
      } else {
        filter.$expr = periodExpr;
      }
    }

    // 📝 initialType 카테고리 필터 (탭 선택 = 카테고리 필터)
    const VALID_INITIAL_TYPES = ['korean', 'alphabet', 'number'];
    if (initialType && !VALID_INITIAL_TYPES.includes(initialType)) {
      return res.status(400).json({ success: false, message: 'Invalid initialType' });
    }
    if (initialType && !initial) {
      let nameFilter = null;
      if (initialType === 'korean') {
        nameFilter = { $gte: '가', $lt: '\uD7A4' };
      } else if (initialType === 'alphabet') {
        nameFilter = { $regex: /^[A-Za-z]/ };
      } else if (initialType === 'number') {
        // 숫자 + 특수문자 = 한글도 영문도 아닌 모든 것
        nameFilter = { $not: { $regex: /^[가-힣A-Za-z]/ } };
      }

      if (nameFilter) {
        const matchingCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ 'meta.created_by': userId, 'personal_info.name': nameFilter })
          .project({ _id: 1 })
          .toArray();

        if (matchingCustomers.length > 0) {
          const initialCustomerIds = matchingCustomers.map(c => c._id);
          // 🐛 BUG-2 FIX: 기존 customerId 필터(특정 고객)가 있으면 교집합 적용
          if (filter['customerId'] instanceof ObjectId) {
            const existingId = filter['customerId'];
            const isInInitialFilter = initialCustomerIds.some(id => id.equals(existingId));
            if (!isInInitialFilter) {
              // 특정 고객이 초성 범위에 없음 → 빈 결과
              return res.json({
                success: true,
                data: {
                  documents: [],
                  pagination: {
                    currentPage: parseInt(page),
                    totalPages: 0,
                    totalCount: 0,
                    limit: parseInt(limit)
                  }
                }
              });
            }
            // 특정 고객이 초성 범위에 있으면 기존 customerId 필터 유지
          } else {
            filter['customerId'] = { $in: initialCustomerIds };
          }
        } else {
          return res.json({
            success: true,
            data: {
              documents: [],
              pagination: {
                currentPage: parseInt(page),
                totalPages: 0,
                totalCount: 0,
                limit: parseInt(limit)
              }
            }
          });
        }
      }
    }

    // 📝 초성 필터 (고객명 기준 — 서버사이드)
    if (initial && typeof initial === 'string' && initial.length === 1) {
      let nameFilter = null;
      const code = initial.charCodeAt(0);

      // 한글 자모 (ㄱ-ㅎ: U+3131-U+314E)
      if (code >= 0x3131 && code <= 0x314E) {
        const range = CHOSUNG_RANGE_MAP[initial];
        if (range) {
          nameFilter = { $gte: range[0], $lt: range[1] };
        }
      }
      // 영문 (A-Z, a-z)
      else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        const upper = initial.toUpperCase();
        const lower = initial.toLowerCase();
        nameFilter = { $regex: `^[${escapeRegex(upper)}${escapeRegex(lower)}]` };
      }
      // 숫자 (0-9)
      else if (code >= 48 && code <= 57) {
        nameFilter = { $regex: `^${escapeRegex(initial)}` };
      }
      // '#' = 특수문자 (한글, 영문, 숫자 모두 아닌 것)
      else if (initial === '#') {
        nameFilter = { $not: { $regex: /^[가-힣ㄱ-ㅎA-Za-z0-9]/ } };
      }

      if (nameFilter) {
        const matchingCustomers = await db.collection(COLLECTIONS.CUSTOMERS)
          .find({ 'meta.created_by': userId, 'personal_info.name': nameFilter })
          .project({ _id: 1 })
          .toArray();

        if (matchingCustomers.length > 0) {
          const initialCustomerIds = matchingCustomers.map(c => c._id);
          // 🐛 BUG-2 FIX: 기존 customerId 필터(특정 고객)가 있으면 교집합 적용
          if (filter['customerId'] instanceof ObjectId) {
            const existingId = filter['customerId'];
            const isInInitialFilter = initialCustomerIds.some(id => id.equals(existingId));
            if (!isInInitialFilter) {
              // 특정 고객이 초성 범위에 없음 → 빈 결과
              return res.json({
                success: true,
                data: {
                  documents: [],
                  pagination: {
                    currentPage: parseInt(page),
                    totalPages: 0,
                    totalCount: 0,
                    limit: parseInt(limit)
                  }
                }
              });
            }
            // 특정 고객이 초성 범위에 있으면 기존 customerId 필터 유지
          } else {
            filter['customerId'] = { $in: initialCustomerIds };
          }
        } else {
          // 매칭 고객 없음 → 빈 결과 즉시 반환
          return res.json({
            success: true,
            data: {
              documents: [],
              pagination: {
                currentPage: parseInt(page),
                totalPages: 0,
                totalCount: 0,
                limit: parseInt(limit)
              }
            }
          });
        }
      }
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
        { $limit: parseInt(limit) },
        ...TEXT_FLAG_STAGES
      ], { collation: { locale: 'ko', strength: 2 } }).toArray();
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
        { $limit: parseInt(limit) },
        ...TEXT_FLAG_STAGES
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
        { $limit: parseInt(limit) },
        ...TEXT_FLAG_STAGES
      ]).toArray();
    } else if (sort === 'badgeType_asc' || sort === 'badgeType_desc') {
      // badgeType 정렬: OCR/TXT/BIN 타입별 정렬
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
                        else: {
                          $cond: {
                            // Level 4: 이미지 파일(image/*)이면 "OCR"
                            if: {
                              $and: [
                                { $ne: [{ $ifNull: ["$meta.mime", null] }, null] },
                                { $eq: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$meta.mime", ""] } }, "image/"] }, 0] }
                              ]
                            },
                            then: "OCR",
                            // Level 5: 나머지 모두 "BIN"
                            else: "BIN"
                          }
                        }
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
        { $limit: parseInt(limit) },
        ...TEXT_FLAG_STAGES
      ]).toArray();
    } else if (sort === 'docType_asc' || sort === 'docType_desc') {
      // 🏷️ docType 정렬: 한글 라벨 기준 가나다순 정렬 (미지정은 맨 뒤로)
      const sortOrder = sort === 'docType_asc' ? 1 : -1;
      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        // 1단계: is_annual_report, is_customer_review 문서의 document_type 정규화
        {
          $addFields: {
            _normalized_docType: {
              $switch: {
                branches: [
                  { case: { $eq: ['$is_annual_report', true] }, then: 'annual_report' },
                  { case: { $eq: ['$is_customer_review', true] }, then: 'customer_review' }
                ],
                default: '$document_type'
              }
            }
          }
        },
        // 2단계: document_types 컬렉션과 join하여 한글 라벨 가져오기
        {
          $lookup: {
            from: 'document_types',
            localField: '_normalized_docType',
            foreignField: 'value',
            as: 'docType_info'
          }
        },
        // 3단계: 정렬용 한글 라벨 + sortWeight 생성 (null/unspecified → 맨 뒤)
        {
          $addFields: {
            _isUnspecified: {
              $or: [
                { $eq: [{ $ifNull: ['$_normalized_docType', null] }, null] },
                { $eq: ['$_normalized_docType', 'unspecified'] },
                { $eq: ['$_normalized_docType', ''] }
              ]
            }
          }
        },
        {
          $addFields: {
            docType_sortWeight: { $cond: { if: '$_isUnspecified', then: 1, else: 0 } },
            docType_label: {
              $cond: {
                if: '$_isUnspecified',
                then: '미지정',
                else: { $ifNull: [{ $arrayElemAt: ['$docType_info.label', 0] }, '$_normalized_docType'] }
              }
            }
          }
        },
        { $sort: { docType_sortWeight: 1, docType_label: sortOrder, 'upload.uploaded_at': -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        { $project: { docType_info: 0, docType_label: 0, docType_sortWeight: 0, _normalized_docType: 0, _isUnspecified: 0 } },
        ...TEXT_FLAG_STAGES
      ], { collation: { locale: 'ko' } }).toArray();
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
        { $project: { uploaded_at_normalized: 0 } },
        ...TEXT_FLAG_STAGES
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

      documents = await db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        { $sort: sortCriteria },
        { $skip: skip },
        { $limit: parseInt(limit) },
        ...TEXT_FLAG_STAGES
      ], { collation: { locale: 'ko', strength: 2 } }).toArray();
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

    // Intentional fire-and-forget: 응답 속도를 위해 비동기 후처리.
    // 실패 시 다음 요청에서 자동 재시도됨 (docsToFix는 매 요청마다 재계산)
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
      const customers = await db.collection(COLLECTIONS.CUSTOMERS)
        .find({ _id: { $in: customerIds } })
        .project({ _id: 1, 'personal_info.name': 1, 'insurance_info.customer_type': 1 })
        .toArray();

      customers.forEach(customer => {
        customerMap[customer._id.toString()] = {
          name: customer.personal_info?.name || null,
          type: customer.insurance_info?.customer_type || null
        };
      });
    }

    // 🚀 N+1 최적화: 상태 업데이트가 필요한 문서 수집 후 bulkWrite
    const bulkUpdateOps = [];
    const updateTimestamp = utcNowDate();

    // 1단계: 상태 계산 + 업데이트 필요한 문서 수집 (DB 호출 없음)
    for (const doc of documents) {
      if (!doc.overallStatus || doc.overallStatus !== 'completed') {
        const { computed } = prepareDocumentResponse(doc);
        const newStatus = computed.overallStatus;

        if (doc.overallStatus !== newStatus) {
          bulkUpdateOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  overallStatus: newStatus,
                  overallStatusUpdatedAt: updateTimestamp
                }
              }
            }
          });
          // doc 객체 즉시 업데이트 (응답용)
          doc.overallStatus = newStatus;
        }
      }
    }

    // 2단계: bulkWrite로 일괄 업데이트 (1회 DB 호출)
    if (bulkUpdateOps.length > 0) {
      await db.collection(COLLECTION_NAME).bulkWrite(bulkUpdateOps, { ordered: false });
      backendLogger.info('Documents', `overallStatus 일괄 업데이트: ${bulkUpdateOps.length}건`);
    }

    // 3단계: 응답 데이터 구성 (DB 호출 없음)
    const documentsWithStatus = documents.map((doc) => {
      // customer_relation 변환 (ObjectId를 string으로, customer_name 추가)
      let customerRelation = null;
      const effectiveCustomerId = doc.customerId;
      if (effectiveCustomerId) {
        const customerId = effectiveCustomerId.toString();
        customerRelation = {
          customer_id: customerId,
          customer_name: customerMap[customerId]?.name || null,
          customer_type: customerMap[customerId]?.type || null,
          notes: doc.customer_notes || ''
        };
      }

      // 기존 analyzeDocumentStatus 방식대로 응답 구성
      const statusInfo = analyzeDocumentStatus(doc);

      // badgeType 계산 (MongoDB aggregation 결과 없으면 _hasMetaText/_hasOcrText 플래그 사용)
      let badgeType = doc.badgeType;
      if (!badgeType) {
        // Level 1: meta.full_text에 실제 데이터가 있으면 TXT (_hasMetaText는 aggregation에서 계산)
        if (doc._hasMetaText) {
          badgeType = 'TXT';
        }
        // Level 2: ocr.full_text 있으면 OCR (_hasOcrText는 aggregation에서 계산)
        else if (doc._hasOcrText) {
          badgeType = 'OCR';
        }
        // Level 3: 이미지 파일은 OCR 배지 (image/* MIME)
        else if (doc.meta?.mime && doc.meta.mime.startsWith('image/')) {
          badgeType = 'OCR';
        }
        // Level 4: 나머지 BIN
        else {
          badgeType = 'BIN';
        }
      }

      return {
        _id: doc._id,
        originalName: doc.upload?.originalName || 'Unknown File',
        displayName: doc.displayName || null,
        displayNameStatus: doc.displayNameStatus || null,
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        is_annual_report: doc.is_annual_report,
        is_customer_review: doc.is_customer_review,
        customer_relation: customerRelation,
        badgeType: badgeType,  // 🔥 항상 badgeType 포함
        _hasMetaText: doc._hasMetaText || false,  // 🔧 full_text 제거 대신 존재 플래그
        _hasOcrText: doc._hasOcrText || false,    // 🔧 full_text 제거 대신 존재 플래그
        conversionStatus: doc.upload?.conversion_status || null,  // 🔥 PDF 변환 상태
        isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),   // 🔥 PDF 변환 가능 여부 (destPath 없으면 originalName으로 확인)
        upload: doc.upload ? {
          originalName: doc.upload.originalName,
          uploaded_at: doc.upload.uploaded_at,
          destPath: doc.upload.destPath,
          convPdfPath: doc.upload.convPdfPath,
          conversion_status: doc.upload.conversion_status,
        } : null,
        meta: doc.meta ? {
          mime: doc.meta.mime,
          size_bytes: doc.meta.size_bytes,
          pdf_pages: doc.meta.pdf_pages,
          meta_status: doc.meta.meta_status,
          summary: doc.meta.summary,
          created_at: doc.meta.created_at,
        } : null,
        ocr: doc.ocr ? {
          status: doc.ocr.status,
          confidence: doc.ocr.confidence,
          done_at: doc.ocr.done_at,
          summary: doc.ocr.summary,
        } : null,
        docembed: doc.docembed,
        ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
        customerId: doc.customerId || null,  // 🆕 내 파일 기능
        folderId: doc.folderId || null,  // 🆕 내 파일 폴더 구조
        document_type: doc.document_type || (doc.meta && doc.meta.document_type) || null,  // 🏷️ 문서 유형
        document_type_auto: doc.document_type_auto || (doc.meta && doc.meta.document_type_auto) || false,  // 🏷️ 자동 분류 여부
        virusScan: doc.virusScan || null,  // 🔴 바이러스 스캔 정보
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
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    backendLogger.error('Documents', '문서 상태 조회 오류', error);
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
router.get('/documents/:id/status', authenticateJWT, async (req, res) => {
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
      // 고객 이름 및 타입 조회
      const customer = await db.collection(COLLECTIONS.CUSTOMERS)
        .findOne(
          { _id: new ObjectId(customerId) },
          { projection: { 'personal_info.name': 1, 'insurance_info.customer_type': 1 } }
        );
      customerRelation = {
        customer_id: customerId,
        customer_name: customer?.personal_info?.name || null,
        customer_type: customer?.insurance_info?.customer_type || null,  // 🔥 고객 타입 추가
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
    backendLogger.error('Documents', '문서 상세 상태 조회 오류', error);
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
router.get('/webhook/get-status/:document_id', async (req, res) => {
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
    backendLogger.error('Documents', '문서 상태 조회 오류', error);
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
 * @query batchId - 특정 업로드 묶음의 통계만 조회 (현재 세션 진행률)
 */
router.get('/documents/statistics', authenticateJWT, async (req, res) => {
  try {
    // userId 추출 (헤더 또는 쿼리)
    const userId = req.user.id;  // JWT 토큰에서 추출 (보안)
    const { batchId } = req.query;  // 🔴 업로드 묶음 ID (현재 세션 필터)

    // 사용자별 필터링 (ownerId 기준)
    const filter = { ownerId: userId };

    // 🔴 batchId가 있으면 해당 배치만 필터링
    if (batchId) {
      filter.batchId = batchId;
    }

    // 📊 파일 타입 분포 집계를 기존 통계와 병렬 실행 (batchId 없을 때만)
    const [documents, fileTypeDistribution] = await Promise.all([
      db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        ...TEXT_FLAG_STAGES
      ]).toArray(),
      !batchId ? db.collection(COLLECTION_NAME).aggregate([
        { $match: filter },
        {
          $addFields: {
            _filename: { $toLower: { $ifNull: ['$upload.originalName', ''] } }
          }
        },
        {
          $addFields: {
            _parts: { $split: ['$_filename', '.'] }
          }
        },
        {
          $addFields: {
            _extension: {
              $cond: {
                if: { $gt: [{ $size: '$_parts' }, 1] },
                then: { $toUpper: { $arrayElemAt: ['$_parts', -1] } },
                else: 'UNKNOWN'
              }
            }
          }
        },
        { $group: { _id: '$_extension', count: { $sum: 1 } } },
        { $project: { _id: 0, label: '$_id', count: 1 } },
        { $sort: { count: -1 } }
      ]).toArray() : Promise.resolve([])
    ]);

    const stats = {
      total: documents.length,
      completed: 0,
      processing: 0,
      error: 0,
      pending: 0,
      completed_with_skip: 0,
      credit_pending: 0,  // 🔴 크레딧 부족으로 처리 보류된 문서
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
      },
      arParsing: {
        total: 0,
        completed: 0,
        processing: 0,
        pending: 0,
        failed: 0,
        credit_pending: 0  // 🔴 크레딧 부족으로 파싱 보류된 AR 문서
      },
      crsParsing: {
        total: 0,
        completed: 0,
        processing: 0,
        pending: 0,
        failed: 0,
        credit_pending: 0  // 🔴 크레딧 부족으로 파싱 보류된 CRS 문서
      }
    };

    documents.forEach(doc => {
      const { overallStatus, currentStage } = analyzeDocumentStatus(doc);
      // 방어: 세분화 상태(embed_pending 등)가 직접 반환될 경우 processing으로 집계
      const statsKey = (overallStatus in stats) ? overallStatus : 'processing';
      stats[statsKey]++;

      // 현재 단계별 통계
      if (currentStage >= 1) stats.stages.upload++;
      if (currentStage >= 2) stats.stages.meta++;
      if (currentStage >= 3) stats.stages.ocr_prep++;
      if (currentStage >= 4) stats.stages.ocr++;
      if (currentStage >= 5) stats.stages.docembed++;

      // badgeType 계산 (_hasMetaText/_hasOcrText 플래그 사용 — full_text는 $project로 제거됨)
      let badgeType = 'BIN';

      // Level 1: meta.full_text 존재 확인 (_hasMetaText 플래그)
      if (doc._hasMetaText) {
        badgeType = 'TXT';
      }
      // Level 2: 명백한 BIN MIME 체크 (OCR 건너뜀 💰)
      else if (isBinaryMimeType(doc.metadata?.mimetype)) {
        badgeType = 'BIN';
      }
      // Level 3: OCR 텍스트 확인 (_hasOcrText 플래그)
      else if (doc._hasOcrText) {
        badgeType = 'OCR';
      }
      // Level 4: 이미지 파일은 OCR 배지 (image/* MIME)
      else if (doc.meta?.mime && doc.meta.mime.startsWith('image/')) {
        badgeType = 'OCR';
      }
      // Level 5: 나머지 모두 BIN (기본값 유지)

      stats.badgeTypes[badgeType]++;

      // AR/CRS 파싱 통계 집계
      // 🔴 credit_pending 문서는 별도 카운트 (진행률 100%에 포함하기 위해)
      const isDocCreditPending = overallStatus === 'credit_pending';

      if (doc.is_annual_report) {
        stats.arParsing.total++;
        if (isDocCreditPending) {
          // credit_pending AR 문서는 별도 카운트
          stats.arParsing.credit_pending++;
        } else {
          const arStatus = doc.ar_parsing_status || 'pending';
          if (stats.arParsing[arStatus] !== undefined) {
            stats.arParsing[arStatus]++;
          }
        }
      }
      if (doc.is_customer_review) {
        stats.crsParsing.total++;
        if (isDocCreditPending) {
          // credit_pending CRS 문서는 별도 카운트
          stats.crsParsing.credit_pending++;
        } else {
          const crStatus = doc.cr_parsing_status || 'pending';
          if (stats.crsParsing[crStatus] !== undefined) {
            stats.crsParsing[crStatus]++;
          }
        }
      }
    });

    // 📊 파일 타입 분포 추가 (batchId 없을 때)
    if (!batchId) {
      stats.fileTypeDistribution = fileTypeDistribution;
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    backendLogger.error('Documents', '통계 조회 오류', error);
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
router.post('/documents/:id/retry', authenticateJWT, async (req, res) => {
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

      if (currentStatus === 'pending') {
        // pending stuck 판정: 큐에 active job(pending/processing)이 없으면 stuck
        const activeJob = await db.collection('pdf_conversion_queue').findOne({
          document_id: id,
          job_type: 'preview_pdf',
          status: { $in: ['pending', 'processing'] }
        });
        if (activeJob) {
          return res.status(400).json({
            success: false,
            error: 'PDF 변환이 진행 중입니다. 잠시 후 다시 시도해주세요.'
          });
        }
        // stuck 확인 → retry_count 리셋 (시스템 문제이므로)
        await db.collection(COLLECTION_NAME).updateOne(
          { _id: new ObjectId(id) },
          { $set: { 'upload.conversion_retry_count': 0 } }
        );
      } else if (currentStatus !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'PDF 변환이 실패 상태일 때만 재시도할 수 있습니다.'
        });
      }

      if (currentStatus === 'failed' && retryCount >= MAX_MANUAL_RETRIES) {
        return res.status(400).json({
          success: false,
          error: `PDF 변환 재시도는 ${MAX_MANUAL_RETRIES}회만 가능합니다.`
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
          $set: { 'upload.conversion_status': 'pending' },
          $inc: { 'upload.conversion_retry_count': 1 },
          $unset: { 'upload.conversion_error': '' }
        }
      );

      // force 모드로 큐 재등록 (기존 failed/completed 레코드 자동 삭제)
      try {
        await convertDocumentInBackground(new ObjectId(id), destPath, { force: true });
      } catch (queueError) {
        // 큐 등록 실패 → pending hang 방지를 위해 failed로 롤백
        console.error(`[PDF변환] 재시도 큐 등록 실패, failed로 롤백: ${id}`, queueError.message);
        backendLogger.error('Documents', `[PDF변환] 재시도 큐 등록 실패 (${id})`, queueError);
        await db.collection(COLLECTION_NAME).updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { 'upload.conversion_status': 'failed', 'upload.conversion_error': queueError.message },
            $inc: { 'upload.conversion_retry_count': -1 }
          }
        );
        return res.status(500).json({
          success: false,
          error: 'PDF 변환 큐 등록에 실패했습니다.',
          details: queueError.message
        });
      }

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
    backendLogger.error('Documents', '재처리 요청 오류', error);
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
router.get('/documents/status/live', authenticateJWT, async (req, res) => {
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
        displayName: doc.displayName || null,
        displayNameStatus: doc.displayNameStatus || null,
        ...statusInfo
      };
    });

    res.json({
      success: true,
      data: documentsWithStatus
    });
  } catch (error) {
    console.error('실시간 상태 조회 오류:', error);
    backendLogger.error('Documents', '실시간 상태 조회 오류', error);
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
router.patch('/documents/set-annual-report', authenticateJWT, async (req, res) => {
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
    // 🔧 Date/String 혼합 타입 대응을 위해 $toDate 사용
    const documents = await db.collection(COLLECTION_NAME).aggregate([
      { $match: { 'upload.originalName': filename, ownerId: userId } },
      { $addFields: { uploaded_at_normalized: { $toDate: '$upload.uploaded_at' } } },
      { $sort: { uploaded_at_normalized: -1 } },
      { $limit: 1 },
      { $project: { uploaded_at_normalized: 0 } }
    ]).toArray();
    const document = documents[0];

    if (!document) {
      console.log(`❌ [Set AR Flag] 문서를 찾을 수 없음: ${filename}`);
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // is_annual_report 필드 및 메타데이터 설정
    const updateFields = {
      is_annual_report: true,
      document_type: 'annual_report',        // 문서 유형 직접 설정
      document_type_auto: true,              // 시스템 자동 분류
      document_type_confidence: 1.0          // 신뢰도 100%
    };

    // 🔗 고객 ID가 제공된 경우 customerId 설정 (고객 문서함에서 보이도록)
    if (customer_id && ObjectId.isValid(customer_id)) {
      updateFields.customerId = new ObjectId(customer_id);
      console.log(`🔗 [Set AR Flag] customerId 설정: ${customer_id}`);
    }

    // 📊 초기 overallStatus 설정 (전체문서보기에서 진행 상태 표시)
    // BUG-3 수정: status=failed 또는 overallStatus=error인 문서는 overallStatus를 덮어쓰지 않음
    if (document.status !== 'failed' && document.overallStatus !== 'error') {
      updateFields.overallStatus = 'processing';
      updateFields.overallStatusUpdatedAt = new Date();
    }

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
        const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
          _id: customerObjectId,
          'documents.document_id': document._id
        });

        if (!customer) {
          // documents 배열에 추가
          await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
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
        backendLogger.error('Documents', `[Set AR Flag] 고객 documents 연결 실패: ${customer_id}`, linkError);
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
    backendLogger.error('Documents', '[Set AR Flag] 오류', error);
    res.status(500).json({
      success: false,
      error: 'is_annual_report 설정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * Customer Review 플래그 설정 API
 * - is_customer_review = true 설정
 * - CRS 메타데이터 저장
 * - 설계사별 데이터 격리
 */
router.post('/documents/set-cr-flag', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { filename, customer_id, metadata } = req.body;

    console.log(`📋 [Set CR Flag] 요청: filename=${filename}, customer_id=${customer_id}, userId=${userId}`);

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'filename이 필요합니다.'
      });
    }

    // 파일 조회 (소유권 검증)
    const documents = await db.collection(COLLECTION_NAME).aggregate([
      {
        $addFields: {
          uploaded_at_normalized: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:%S.%LZ',
              date: { $toDate: '$upload.uploaded_at' }
            }
          }
        }
      },
      {
        $match: {
          ownerId: userId,
          'upload.originalName': filename
        }
      },
      { $sort: { uploaded_at_normalized: -1 } },
      { $limit: 1 },
      { $project: { uploaded_at_normalized: 0 } }
    ]).toArray();
    const document = documents[0];

    if (!document) {
      console.log(`❌ [Set CR Flag] 문서를 찾을 수 없음: ${filename}`);
      return res.status(403).json({
        success: false,
        error: '문서를 찾을 수 없거나 접근 권한이 없습니다.'
      });
    }

    // is_customer_review 필드 및 메타데이터 설정
    const updateFields = {
      is_customer_review: true,
      document_type: 'customer_review',      // 문서 유형 직접 설정
      document_type_auto: true,              // 시스템 자동 분류
      document_type_confidence: 1.0          // 신뢰도 100%
    };

    // 고객 ID가 제공된 경우 customerId 설정
    if (customer_id && ObjectId.isValid(customer_id)) {
      updateFields.customerId = new ObjectId(customer_id);
      console.log(`🔗 [Set CR Flag] customerId 설정: ${customer_id}`);
    }

    // 초기 overallStatus 설정
    // BUG-3 수정: status=failed 또는 overallStatus=error인 문서는 overallStatus를 덮어쓰지 않음
    if (document.status !== 'failed' && document.overallStatus !== 'error') {
      updateFields.overallStatus = 'processing';
      updateFields.overallStatusUpdatedAt = new Date();
    }

    // 메타데이터가 제공된 경우 추가
    if (metadata) {
      updateFields.cr_metadata = {
        product_name: metadata.product_name || null,
        issue_date: metadata.issue_date || null,
        contractor_name: metadata.contractor_name || null,
        insured_name: metadata.insured_name || null,
        death_beneficiary: metadata.death_beneficiary || null,
        fsr_name: metadata.fsr_name || null
      };
      // CR 파싱 상태 초기화
      updateFields.cr_parsing_status = 'pending';
    }

    await db.collection(COLLECTION_NAME)
      .updateOne(
        { _id: document._id },
        { $set: updateFields }
      );

    console.log(`✅ [Set CR Flag] is_customer_review=true 설정 완료: ${document._id}`, updateFields);

    // 고객의 documents 배열에도 추가
    if (customer_id && ObjectId.isValid(customer_id)) {
      try {
        const customerObjectId = new ObjectId(customer_id);
        const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({
          _id: customerObjectId,
          'documents.document_id': document._id
        });

        if (!customer) {
          await db.collection(COLLECTIONS.CUSTOMERS).updateOne(
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
          console.log(`🔗 [Set CR Flag] 고객 documents 배열에 추가: ${customer_id}`);
        }
      } catch (linkError) {
        console.error(`⚠️ [Set CR Flag] 고객 documents 연결 실패:`, linkError);
        backendLogger.error('Documents', `[Set CR Flag] 고객 documents 연결 실패: ${customer_id}`, linkError);
      }
    }

    res.json({
      success: true,
      message: 'is_customer_review 필드가 설정되었습니다.',
      document_id: document._id
    });

  } catch (error) {
    console.error('❌ [Set CR Flag] 오류:', error);
    backendLogger.error('Documents', '[Set CR Flag] 오류', error);
    res.status(500).json({
      success: false,
      error: 'is_customer_review 설정에 실패했습니다.',
      details: error.message
    });
  }
});

/**
 * 문서 별칭(displayName) 변경 API
 * - displayName만 변경, originalName과 파일시스템은 불변
 */
router.patch('/documents/:id/display-name', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName } = req.body;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 문서 ID입니다.' });
    }
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      return res.status(400).json({ success: false, error: '문서 이름은 비어있을 수 없습니다.' });
    }
    if (displayName.trim().length > 200) {
      return res.status(400).json({ success: false, error: '문서 이름은 200자를 초과할 수 없습니다.' });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), ownerId: userId });
    if (!document) {
      return res.status(403).json({ success: false, error: '문서를 찾을 수 없거나 접근 권한이 없습니다.' });
    }

    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $set: { displayName: displayName.trim() } }
    );

    res.json({ success: true, displayName: displayName.trim() });
  } catch (error) {
    console.error('문서 이름 변경 실패:', error);
    res.status(500).json({ success: false, error: '문서 이름 변경에 실패했습니다.' });
  }
});

/**
 * 문서 원본명(originalName) 변경 API
 * - originalName만 변경, displayName과 파일시스템은 불변
 */
router.patch('/documents/:id/original-name', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { originalName } = req.body;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 문서 ID입니다.' });
    }
    if (typeof originalName !== 'string' || originalName.trim().length === 0) {
      return res.status(400).json({ success: false, error: '문서 이름은 비어있을 수 없습니다.' });
    }
    if (originalName.trim().length > 200) {
      return res.status(400).json({ success: false, error: '문서 이름은 200자를 초과할 수 없습니다.' });
    }

    const document = await db.collection(COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), ownerId: userId });
    if (!document) {
      return res.status(403).json({ success: false, error: '문서를 찾을 수 없거나 접근 권한이 없습니다.' });
    }

    await db.collection(COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $set: { 'upload.originalName': originalName.trim() } }
    );

    res.json({ success: true, originalName: originalName.trim() });
  } catch (error) {
    console.error('문서 원본명 변경 실패:', error);
    res.status(500).json({ success: false, error: '문서 원본명 변경에 실패했습니다.' });
  }
});

/**
 * 문서 삭제 API (단일 문서)
 */
/**
 * ⭐ 설계사별 문서 데이터 격리 적용
 */
router.delete('/documents/:id', authenticateJWT, async (req, res) => {
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
      console.error(`❌ 고객 참조 정리 실패 (doc_id=${id}):`, customerError.message);
      // 고객 참조 정리 실패해도 문서 삭제는 진행
    }
    // ========================================

    // ========== AR 파싱 큐에서 제거 ==========
    // 문서가 삭제되면 ar_parse_queue에서도 제거해야 pending 목록에서 사라짐
    try {
      const queueDeleteResult = await db.collection('ar_parse_queue').deleteMany({
        file_id: new ObjectId(id)
      });
      if (queueDeleteResult.deletedCount > 0) {
        console.log(`✅ AR 파싱 큐 정리: ${queueDeleteResult.deletedCount}개 레코드 삭제`);
      }
    } catch (queueError) {
      console.warn('⚠️ AR 파싱 큐 정리 실패:', queueError.message);
      // 큐 정리 실패해도 문서 삭제는 진행
    }
    // ========================================

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
    backendLogger.error('Documents', '문서 삭제 오류', error);

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
router.delete('/documents', authenticateJWT, async (req, res) => {
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
      console.error(`❌ [문서 삭제] 고객 참조 정리 실패 (doc_ids=${ownedDocIds.join(',')}):`, customerError.message);
      // 고객 참조 정리 실패해도 문서 삭제는 진행
    }
    // ========================================

    // ========== AR 파싱 큐에서 제거 ==========
    // 문서가 삭제되면 ar_parse_queue에서도 제거해야 pending 목록에서 사라짐
    try {
      const deleteObjectIds = ownedDocIds.map(id => new ObjectId(id));
      const queueDeleteResult = await db.collection('ar_parse_queue').deleteMany({
        file_id: { $in: deleteObjectIds }
      });
      if (queueDeleteResult.deletedCount > 0) {
        console.log(`✅ [문서 삭제] AR 파싱 큐 정리: ${queueDeleteResult.deletedCount}개 레코드 삭제`);
      }
    } catch (queueError) {
      console.warn('⚠️ [문서 삭제] AR 파싱 큐 정리 실패:', queueError.message);
      // 큐 정리 실패해도 문서 삭제는 진행
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
        backendLogger.error('Documents', `문서 삭제 중 오류: ${docId}`, error);
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
    backendLogger.error('Documents', '[문서 삭제] 오류', error);

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


  // ==================== 내부 API ====================

  /**
   * PDF 변환 완료 알림 (document_pipeline Worker → aims-api SSE)
   * Worker가 변환 완료/실패 시 호출하여 프론트엔드에 SSE 알림 발송
   */
  router.post('/internal/notify-conversion', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
      if (apiKey !== INTERNAL_API_KEY) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { documentId, status } = req.body;
      if (!documentId || !status) {
        return res.status(400).json({ success: false, message: 'documentId and status required' });
      }

      const ALLOWED_STATUSES = ['completed', 'failed'];
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }

      // 문서의 customerId 조회하여 SSE 알림 발송
      const doc = await db.collection(COLLECTION_NAME).findOne(
        { _id: new ObjectId(documentId) },
        { projection: { customerId: 1, ownerId: 1, 'upload.originalName': 1 } }
      );

      if (doc && doc.customerId) {
        notifyCustomerDocSubscribers(doc.customerId.toString(), 'document-status-change', {
          type: 'conversion',
          status: status,
          customerId: doc.customerId.toString(),
          documentId: documentId,
          documentName: doc.upload?.originalName || 'Unknown',
          timestamp: utcNowISO()
        });
      }

      // 전체 문서 보기(DocumentExplorerView)에도 알림 → 자동 갱신 트리거
      if (doc) {
        const ownerIdStr = doc.ownerId?.toString() || '';
        if (ownerIdStr) {
          notifyDocumentListSubscribers(ownerIdStr, 'document-list-change', {
            type: 'updated',
            documentId: documentId,
            timestamp: utcNowISO()
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[내부API] notify-conversion 오류:', error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  });


  // ========================
  // 고객별 문서함 ZIP 다운로드 (2단계: 준비 → 다운로드)
  // POST /api/documents/download — ZIP 임시 파일 생성, downloadId 반환
  // GET  /api/documents/download/:downloadId — 정적 파일 전송 (Range 이어받기 지원)
  // ========================

  // 카테고리 한글 라벨 (category 코드 → 한글명)
  const CATEGORY_LABELS = {
    insurance: '보험계약', claim: '보험금청구', identity: '신분·증명',
    medical: '건강·의료', asset: '자산', corporate: '법인', etc: '기타'
  };

  /**
   * DB document_types 컬렉션에서 TYPE_TO_CATEGORY, SUBTYPE_LABELS 매핑 동적 생성
   * @returns {{ typeToCategoryMap: Record<string,string>, subtypeLabelMap: Record<string,string> }}
   */
  async function buildDocTypeMapping() {
    const docTypes = await db.collection('document_types').find({}).toArray();
    const typeToCategoryMap = {};
    const subtypeLabelMap = {};
    for (const dt of docTypes) {
      typeToCategoryMap[dt.value] = dt.category || 'etc';
      subtypeLabelMap[dt.value] = dt.label || dt.value;
    }
    return { typeToCategoryMap, subtypeLabelMap };
  }

  // 폴더/파일명 안전 처리
  function sanitizeZipName(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/[.\s]+$/, '')
      .trim() || '이름없음';
  }

  // 한글 초성 추출 (ZIP 초성 폴더 그룹화용)
  function getKoreanInitial(name) {
    if (!name) return '기타';
    const code = name.charCodeAt(0);
    // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const initials = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
      const index = Math.floor((code - 0xAC00) / 588);
      return initials[index];
    }
    // 영문
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      return String.fromCharCode(code).toUpperCase();
    }
    return '기타';
  }

  // Phase 1: ZIP 파일 준비 (SSE 스트리밍으로 진행률 전송)
  // Content-Type: text/event-stream으로 각 파일 추가 시 progress 이벤트,
  // 완료 시 complete 이벤트(downloadId 포함), 에러 시 error 이벤트 전송
  router.post('/documents/download', authenticateJWT, async (req, res) => {
    const archiver = require('archiver');
    const BASE_DIR = path.resolve('/data/files');
    const requestId = crypto.randomBytes(12).toString('hex');

    try {
      const { customerIds } = req.body;
      const userId = req.user.id;

      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'customerIds 배열이 필요합니다.', timestamp: utcNowISO() });
      }

      // customerIds 크기 제한 (DoS 방지)
      const MAX_CUSTOMER_IDS = 1000;
      if (customerIds.length > MAX_CUSTOMER_IDS) {
        return res.status(400).json({ success: false, error: `한 번에 최대 ${MAX_CUSTOMER_IDS}명까지 다운로드할 수 있습니다.`, timestamp: utcNowISO() });
      }

      // 디스크 상한: 전체 pending 다운로드 수 제한
      const MAX_TOTAL_PENDING = 30;
      if (pendingDownloads.size + activeZipGenerations.size >= MAX_TOTAL_PENDING) {
        return res.status(503).json({ success: false, error: '서버 다운로드 대기열이 가득 찼습니다. 잠시 후 다시 시도하세요.', timestamp: utcNowISO() });
      }

      // 동시 다운로드 제한 (사용자당 최대 3개 — 생성 중 + 대기 중 합산)
      if (countUserDownloads(userId) >= 3) {
        return res.status(429).json({ success: false, error: '동시 다운로드는 최대 3건까지 가능합니다. 기존 다운로드를 완료한 후 다시 시도하세요.', timestamp: utcNowISO() });
      }

      // 1. 인가 검증: 모든 고객이 요청자 소유인지 확인
      const objectIds = customerIds.map(id => {
        if (!ObjectId.isValid(id)) throw new Error(`유효하지 않은 고객 ID: ${id}`);
        return new ObjectId(id);
      });

      const customers = await db.collection(CUSTOMERS_COLLECTION).find({
        _id: { $in: objectIds },
        'meta.created_by': userId
      }).toArray();

      if (customers.length !== customerIds.length) {
        return res.status(403).json({ success: false, error: '접근 권한이 없는 고객이 포함되어 있습니다.', timestamp: utcNowISO() });
      }

      // 1-b. 문서 유형 매핑 DB 조회 (하드코딩 제거)
      const { typeToCategoryMap, subtypeLabelMap } = await buildDocTypeMapping();

      // 2. 동명이인 감지 (ZIP 내 폴더명 충돌 방지)
      const nameCount = new Map();
      for (const c of customers) {
        const name = c.personal_info?.name || '이름없음';
        nameCount.set(name, (nameCount.get(name) || 0) + 1);
      }

      // 초성 폴더 사용 여부 (11명 이상 다중 고객일 때)
      const useInitialFolder = customers.length >= 11;

      // 3. ZIP 파일명 결정
      const isMulti = customers.length > 1;
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST (UTC+9)
      const dateStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;

      let zipFilename;
      if (isMulti) {
        zipFilename = `AIMS_문서함_${dateStr}${timeStr}.zip`;
      } else {
        const singleName = customers[0].personal_info?.name || '고객';
        zipFilename = `${singleName}-${dateStr}${timeStr}.zip`;
      }

      // 총 문서 수 사전 계산 (진행률 표시용)
      let totalFileCount = 0;
      const customerDocs = [];
      for (const customer of customers) {
        const docs = await db.collection(COLLECTION_NAME).find({
          customerId: customer._id,
          ownerId: userId
        }).toArray();
        customerDocs.push({ customer, docs });
        totalFileCount += docs.length;
      }

      // === SSE 스트리밍 시작 ===
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx 버퍼링 비활성화
      });

      // SSE 이벤트 전송 헬퍼
      function sendSSEEvent(event, data) {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      // 초기 이벤트: 총 파일 수 전송
      sendSSEEvent('start', { totalFiles: totalFileCount });

      // 4. 임시 파일에 ZIP 생성
      const downloadId = crypto.randomBytes(24).toString('hex');
      const tempFilePath = path.join(DOWNLOAD_TEMP_DIR, `${downloadId}.zip`);
      const output = fs.createWriteStream(tempFilePath);
      const archive = archiver('zip', { zlib: { level: 5 } });

      // ZIP 생성 중 추적 등록
      activeZipGenerations.set(requestId, { userId, archive, aborted: false });

      // 클라이언트 연결 끊김 시 ZIP 생성 중단 + 정리
      req.on('close', () => {
        const gen = activeZipGenerations.get(requestId);
        if (gen && !gen.aborted) {
          gen.aborted = true;
          try { archive.abort(); } catch { /* 무시 */ }
          try { fs.unlinkSync(tempFilePath); } catch { /* 무시 */ }
          activeZipGenerations.delete(requestId);
          console.warn(`[문서 다운로드] 클라이언트 연결 끊김 → ZIP 생성 중단 (requestId: ${requestId})`);
        }
      });

      // archiver → 임시 파일 파이프
      archive.pipe(output);

      archive.on('warning', (err) => {
        console.warn('[문서 다운로드] archiver 경고:', err);
      });

      // archiver 에러 핸들러 — 파일 추가 루프 진입 전에 등록 (미등록 시 프로세스 크래시 위험)
      archive.on('error', (err) => {
        console.error('[문서 다운로드] archiver 오류:', err);
        try { fs.unlinkSync(tempFilePath); } catch { /* 무시 */ }
        activeZipGenerations.delete(requestId);
      });

      let skippedFiles = 0;
      let processedFiles = 0;

      // 실제 압축 진행 시 progress 전송 (archive.file()은 큐 등록만 하므로 entry 이벤트에서 추적)
      archive.on('entry', () => {
        if (activeZipGenerations.get(requestId)?.aborted) return;
        processedFiles++;
        sendSSEEvent('progress', { processed: processedFiles + skippedFiles, total: totalFileCount, skipped: skippedFiles });
      });

      // 5. 고객별 문서 추가
      for (const { customer, docs } of customerDocs) {
        // 생성 중단 확인
        if (activeZipGenerations.get(requestId)?.aborted) break;

        const customerName = customer.personal_info?.name || '이름없음';
        let customerFolder = sanitizeZipName(customerName);

        // 동명이인 처리: ID 접미사 추가
        if (nameCount.get(customerName) > 1) {
          customerFolder = `${customerFolder}_${customer._id.toString().slice(-6)}`;
        }

        if (docs.length === 0) continue;

        // 폴더 내 파일명 충돌 추적
        const folderFileNames = new Map();

        for (const doc of docs) {
          // 생성 중단 확인
          if (activeZipGenerations.get(requestId)?.aborted) break;

          // 파일 경로 결정: PDF 변환본 우선, 없으면 원본
          let filePath = doc.upload?.convPdfPath || doc.upload?.destPath;
          if (!filePath) {
            skippedFiles++;
            sendSSEEvent('progress', { processed: processedFiles + skippedFiles, total: totalFileCount, skipped: skippedFiles });
            continue;
          }

          // 경로 탈출 방지
          const resolved = path.resolve(filePath);
          if (!resolved.startsWith(BASE_DIR)) {
            console.warn('[문서 다운로드] 경로 탈출 시도 감지:', filePath);
            skippedFiles++;
            sendSSEEvent('progress', { processed: processedFiles + skippedFiles, total: totalFileCount, skipped: skippedFiles });
            continue;
          }

          // 파일 존재 여부 확인
          if (!fs.existsSync(resolved)) {
            skippedFiles++;
            sendSSEEvent('progress', { processed: processedFiles + skippedFiles, total: totalFileCount, skipped: skippedFiles });
            continue;
          }

          // 카테고리/서브타입 폴더 경로 결정 (DB 조회 매핑 사용)
          const docType = doc.document_type || (doc.meta && doc.meta.document_type) || 'unspecified';
          const category = typeToCategoryMap[docType] || 'etc';
          const catLabel = CATEGORY_LABELS[category] || '기타';
          const subLabel = subtypeLabelMap[docType] || docType;

          // 폴더 경로 구성
          let folderPath;
          if (isMulti && useInitialFolder) {
            const initial = getKoreanInitial(customerName);
            folderPath = `AIMS_문서함_${dateStr}${timeStr}/${initial}/${customerFolder}/${catLabel}/${subLabel}`;
          } else if (isMulti) {
            folderPath = `AIMS_문서함_${dateStr}${timeStr}/${customerFolder}/${catLabel}/${subLabel}`;
          } else {
            folderPath = `${customerFolder}/${catLabel}/${subLabel}`;
          }

          // 파일명 결정 (displayName 우선 → originalName 폴백)
          let fileName = doc.displayName || doc.upload?.originalName || 'unnamed';

          // PDF 변환본 사용 시 확장자 교정
          if (doc.upload?.convPdfPath && filePath === doc.upload.convPdfPath) {
            const ext = path.extname(fileName).toLowerCase();
            if (ext !== '.pdf') {
              fileName = fileName.replace(/\.[^/.]+$/, '') + '.pdf';
            }
          }

          // 같은 폴더 내 파일명 충돌 처리
          if (!folderFileNames.has(folderPath)) {
            folderFileNames.set(folderPath, new Set());
          }
          const usedNames = folderFileNames.get(folderPath);

          if (usedNames.has(fileName)) {
            const nameBase = fileName.replace(/\.[^/.]+$/, '');
            const nameExt = path.extname(fileName);
            let counter = 2;
            while (usedNames.has(`${nameBase} (${counter})${nameExt}`)) {
              counter++;
            }
            fileName = `${nameBase} (${counter})${nameExt}`;
          }
          usedNames.add(fileName);

          // ZIP에 파일 추가 (실제 압축 진행률은 archive 'entry' 이벤트에서 전송)
          archive.file(resolved, { name: `${folderPath}/${fileName}` });
        }
      }

      // 생성 중단된 경우 종료
      if (activeZipGenerations.get(requestId)?.aborted) {
        activeZipGenerations.delete(requestId);
        if (!res.writableEnded) res.end();
        return;
      }

      if (skippedFiles > 0) {
        console.warn(`[문서 다운로드] ${skippedFiles}건의 파일을 찾을 수 없어 제외됨`);
      }

      // ZIP 생성 완료 대기 (error 핸들러는 위에서 이미 등록됨)
      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.finalize();
      });

      // ZIP 생성 중 추적 해제
      activeZipGenerations.delete(requestId);

      // 6. 다운로드 정보 등록
      const stat = fs.statSync(tempFilePath);
      pendingDownloads.set(downloadId, {
        filePath: tempFilePath,
        filename: zipFilename,
        userId,
        size: stat.size,
        skippedFiles,
        expiresAt: Date.now() + DOWNLOAD_TTL_MS,
        downloaded: false, // Phase 2 완료 시 true로 전환 → 카운터에서 제외
      });

      // 완료 이벤트 전송
      sendSSEEvent('complete', {
        downloadId,
        filename: zipFilename,
        size: stat.size,
        skippedFiles,
        expiresIn: DOWNLOAD_TTL_MS / 1000,
      });
      res.end();

    } catch (error) {
      // ZIP 생성 중 추적 해제
      activeZipGenerations.delete(requestId);

      console.error('[문서 다운로드] ZIP 준비 오류:', error.message);
      backendLogger.error('Documents', '[문서 다운로드] ZIP 준비 실패', error);
      if (!res.writableEnded && !res.headersSent) {
        res.status(500).json({ success: false, error: `문서 다운로드 준비 실패: ${error.message}`, timestamp: utcNowISO() });
      } else if (!res.writableEnded) {
        // SSE 스트림 시작 후 에러 발생 시
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        } catch { /* 무시 */ }
        res.end();
      }
    }
  });

  // Phase 2: ZIP 파일 다운로드 (Range 요청 = 이어받기 지원)
  // 인증: downloadId 자체가 192비트 랜덤 일회용 토큰 역할 (30분 TTL)
  // JWT를 URL 쿼리에 노출하지 않기 위해 별도 인증 없이 downloadId로만 접근
  router.get('/documents/download/:downloadId', (req, res) => {
    const { downloadId } = req.params;

    // downloadId 형식 검증 (48자 hex)
    if (!/^[a-f0-9]{48}$/.test(downloadId)) {
      return res.status(400).json({ success: false, error: '유효하지 않은 다운로드 ID입니다.', timestamp: utcNowISO() });
    }

    const entry = pendingDownloads.get(downloadId);
    if (!entry) {
      return res.status(404).json({ success: false, error: '다운로드가 만료되었거나 존재하지 않습니다.', timestamp: utcNowISO() });
    }

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      try { fs.unlinkSync(entry.filePath); } catch { /* 무시 */ }
      pendingDownloads.delete(downloadId);
      return res.status(410).json({ success: false, error: '다운로드가 만료되었습니다. 다시 요청하세요.', timestamp: utcNowISO() });
    }

    // 파일 존재 확인
    if (!fs.existsSync(entry.filePath)) {
      pendingDownloads.delete(downloadId);
      return res.status(410).json({ success: false, error: '다운로드 파일이 삭제되었습니다. 다시 요청하세요.', timestamp: utcNowISO() });
    }

    const fileSize = entry.size;
    const encodedFilename = encodeURIComponent(entry.filename);

    // 다운로드 완료/실패 시 카운터 해제 (이어받기 슬롯 확보)
    // finish: 정상 완료, close: 클라이언트 연결 끊김(실패 포함)
    const markDownloaded = () => {
      if (entry.downloaded) return;
      entry.downloaded = true;
    };
    res.on('finish', markDownloaded);
    res.on('close', markDownloaded);

    // 공통 헤더
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    // Range 요청 처리 (이어받기)
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', end - start + 1);

      const stream = fs.createReadStream(entry.filePath, { start, end });
      stream.on('error', (err) => {
        console.error('[문서 다운로드] 파일 스트림 오류:', err);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } else {
      // 일반 전체 다운로드
      res.setHeader('Content-Length', fileSize);

      const stream = fs.createReadStream(entry.filePath);
      stream.on('error', (err) => {
        console.error('[문서 다운로드] 파일 스트림 오류:', err);
        if (!res.headersSent) res.status(500).end();
      });

      // 임시 파일은 TTL(30분) 만료 시 자동 삭제
      // 즉시 삭제하면 네트워크 끊김 후 이어받기(Range) 재시도 불가
      stream.pipe(res);
    }
  });


  // SIGTERM/SIGINT 시 setInterval 정리 (메모리 누수 방지)
  router._cleanupInterval = cleanupIntervalId;

  return router;
};
