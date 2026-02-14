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
const { escapeRegex, toSafeObjectId, isBinaryMimeType } = require('../lib/helpers');
const activityLogger = require('../lib/activityLogger');
const sseManager = require('../lib/sseManager');
const { notifyCustomerDocSubscribers, notifyDocumentStatusSubscribers, notifyDocumentListSubscribers, notifyPersonalFilesSubscribers, sendSSE } = sseManager;
const { prepareDocumentResponse, isConvertibleFile, analyzeDocumentStatus } = require('../lib/documentStatusHelper');
const createPdfConversionTrigger = require('../lib/pdfConversionTrigger');

const COLLECTION_NAME = COLLECTIONS.FILES;

module.exports = function(db, analyticsDb, authenticateJWT, upload, qdrantClient, qdrantCollection) {
  const router = express.Router();
  const QDRANT_COLLECTION = qdrantCollection;

  const PDF_CONVERTER_HOST = process.env.PDF_CONVERTER_HOST || 'localhost';
  const PDF_CONVERTER_PORT = process.env.PDF_CONVERTER_PORT || 8005;

  // PDF 변환 오케스트레이션 (공유 모듈)
  const { convertDocumentInBackground, triggerPdfConversionIfNeeded } = createPdfConversionTrigger(db);

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
          customer_name: customerMap[customerId] || null,
          notes: doc.customer_notes || ''
        };
      }

      return {
        _id: doc._id,
        filename: doc.upload?.originalName || 'Unknown File',
        displayName: doc.displayName || null,  // 🍎 CR 파싱 후 생성된 사용자 친화적 이름
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
        document_type: doc.document_type || null,  // 🏷️ 문서 유형
        document_type_auto: doc.document_type_auto || false  // 🏷️ 자동 분류 여부
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
    backendLogger.error('Documents', '문서 목록 조회 오류', error);
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
router.get('/documents/status', authenticateJWT, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, sort, customerLink, fileScope = 'excludeMyFiles', searchField } = req.query;
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
      // 🍎 searchField에 따라 검색 대상 필드 결정
      if (searchField === 'displayName') {
        // 별칭 모드: displayName 우선, 없으면 originalName도 포함 (OR 검색)
        filter['$or'] = [
          { displayName: { $regex: search, $options: 'i' } },
          { 'upload.originalName': { $regex: search, $options: 'i' } }
        ];
      } else {
        // 원본 모드 (기본값): originalName에서만 검색
        filter['upload.originalName'] = { $regex: search, $options: 'i' };
      }
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
        // 3단계: 정렬용 한글 라벨 생성
        {
          $addFields: {
            docType_label: {
              $cond: {
                if: {
                  $or: [
                    { $eq: [{ $ifNull: ['$_normalized_docType', null] }, null] },
                    { $eq: ['$_normalized_docType', 'unspecified'] },
                    { $eq: ['$_normalized_docType', ''] }
                  ]
                },
                then: '미지정', // 한글 가나다순 정렬
                else: { $ifNull: [{ $arrayElemAt: ['$docType_info.label', 0] }, '$_normalized_docType'] }
              }
            }
          }
        },
        { $sort: { docType_label: sortOrder, 'upload.uploaded_at': -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        { $project: { docType_info: 0, docType_label: 0, _normalized_docType: 0 } }
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
        .project({ _id: 1, 'personal_info.name': 1 })
        .toArray();

      customers.forEach(customer => {
        customerMap[customer._id.toString()] = customer.personal_info?.name || null;
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
        displayName: doc.displayName || null,  // CR 등 파싱 후 생성된 사용자 친화적 이름
        uploadedAt: normalizeTimestamp(doc.upload?.uploaded_at),
        fileSize: doc.meta?.size_bytes,
        mimeType: doc.meta?.mime,
        is_annual_report: doc.is_annual_report,
        is_customer_review: doc.is_customer_review,
        customer_relation: customerRelation,
        badgeType: badgeType,  // 🔥 항상 badgeType 포함
        conversionStatus: doc.upload?.conversion_status || null,  // 🔥 PDF 변환 상태
        isConvertible: isConvertibleFile(doc.upload?.destPath || doc.upload?.originalName),   // 🔥 PDF 변환 가능 여부 (destPath 없으면 originalName으로 확인)
        upload: doc.upload,  // 🔥 프론트엔드에서 upload.conversion_status 접근용
        meta: doc.meta,
        ocr: doc.ocr,
        docembed: doc.docembed,
        ownerId: doc.ownerId || null,  // 🆕 내 파일 기능
        customerId: doc.customerId || null,  // 🆕 내 파일 기능
        folderId: doc.folderId || null,  // 🆕 내 파일 폴더 구조
        document_type: doc.document_type || null,  // 🏷️ 문서 유형
        document_type_auto: doc.document_type_auto || false,  // 🏷️ 자동 분류 여부
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
          totalPages: Math.ceil(totalCount / limit),
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

    const documents = await db.collection(COLLECTION_NAME).find(filter).toArray();

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
        displayName: doc.displayName || null,  // CR 등 파싱 후 생성된 사용자 친화적 이름
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
    updateFields.overallStatus = 'processing';
    updateFields.overallStatusUpdatedAt = new Date();

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
      console.warn('⚠️ 고객 참조 정리 실패:', customerError.message);
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

    // ========== Customer Review 파싱 데이터 삭제 ==========
    // 매칭 조건: source_file_id가 같으면 삭제 (Annual Report와 동일한 로직)
    // is_customer_review 플래그 또는 doc_type이 "고객리뷰"인 경우 모두 처리
    if (document.is_customer_review || document.doc_type === '고객리뷰') {
      try {
        console.log(`🗑️  [CR 삭제] Customer Review 문서 삭제 감지: file_id=${id}`);

        // 1. 고객 ID 및 CR 메타데이터 추출
        const customerId = document.customerId;
        const fileObjectId = document._id;  // ObjectId
        const policyNumber = document.cr_metadata?.policy_number;
        const issueDate = document.cr_metadata?.issue_date;

        if (!customerId) {
          console.warn('⚠️ [CR 삭제] customerId를 찾을 수 없음 - CR 파싱 삭제 건너뜀');
        } else {
          // 2. source_file_id (ObjectId)로 정확히 매칭하여 삭제
          console.log(`🗓️  [CR 삭제] source_file_id=${fileObjectId}로 CR 파싱 삭제 시도`);

          const crDeleteResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
            { '_id': customerId },
            {
              $pull: { customer_reviews: { source_file_id: fileObjectId } },
              $set: { 'meta.updated_at': utcNowDate() }
            }
          );

          if (crDeleteResult.modifiedCount > 0) {
            console.log(`✅ [CR 삭제] CR 파싱 데이터 삭제 완료 (source_file_id 매칭): customer_id=${customerId}`);
          } else {
            // fallback: policy_number + issue_date로 매칭
            if (policyNumber && issueDate) {
              console.log(`🗓️  [CR 삭제] source_file_id 매칭 실패, policy_number=${policyNumber} + issue_date=${issueDate}로 fallback 삭제 시도`);
              const fallbackResult = await db.collection(CUSTOMERS_COLLECTION).updateOne(
                { '_id': customerId },
                {
                  $pull: {
                    customer_reviews: {
                      'contract_info.policy_number': policyNumber,
                      issue_date: new Date(issueDate)
                    }
                  },
                  $set: { 'meta.updated_at': utcNowDate() }
                }
              );
              if (fallbackResult.modifiedCount > 0) {
                console.log(`✅ [CR 삭제] CR 파싱 데이터 삭제 완료 (policy_number + issue_date 매칭)`);
              } else {
                console.log(`ℹ️  [CR 삭제] 삭제할 CR 파싱 데이터 없음`);
              }
            } else {
              console.log(`ℹ️  [CR 삭제] 삭제할 CR 파싱 데이터 없음 (source_file_id 매칭 실패, policy_number 또는 issue_date 없음)`);
            }
          }
        }
      } catch (crError) {
        console.warn('⚠️ [CR 삭제] CR 파싱 데이터 삭제 실패:', crError.message);
        // CR 삭제 실패해도 문서 삭제는 진행
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
      console.warn('⚠️ [문서 삭제] 고객 참조 정리 실패:', customerError.message);
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


  return router;
};
