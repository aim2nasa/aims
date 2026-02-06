/**
 * admin-routes.js - Admin 라우트 (Orphan 정리, OCR, Dashboard, Metrics, Users 관리)
 *
 * Phase 8: server.js 리팩토링
 * @since 2026-02-07
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowISO, utcNowDate, normalizeTimestamp } = require('../lib/timeUtils');

module.exports = function(db, analyticsDb, authenticateJWT, requireRole, qdrantClient, qdrantCollection) {
  const router = express.Router();
  const QDRANT_COLLECTION = qdrantCollection;
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const COLLECTION_NAME = COLLECTIONS.FILES;

/**
 * Orphaned Relationships 조회 API (관리용)
 */
router.get('/admin/orphaned-relationships', async (req, res) => {
  try {
    console.log('🔍 Orphaned relationships 조회 시작...');
    
    // 모든 관계 레코드 조회
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).find({}).toArray();
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
    backendLogger.error('Admin', 'Orphaned relationships 조회 오류', error);
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
router.delete('/admin/orphaned-relationships', async (req, res) => {
  try {
    console.log('🗑️ Orphaned relationships 정리 시작...');
    
    // 먼저 orphaned relationships 조회
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).find({}).toArray();
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
    const deleteResult = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({
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
    backendLogger.error('Admin', 'Orphaned relationships 정리 오류', error);
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
router.get('/admin/data-integrity-report', async (req, res) => {
  try {
    console.log('📊 데이터 무결성 리포트 생성 시작...');

    // 1. 전체 데이터 수 조회
    const [totalCustomers, totalContracts, totalRelationships, totalFiles] = await Promise.all([
      db.collection(CUSTOMERS_COLLECTION).countDocuments(),
      db.collection(COLLECTIONS.CONTRACTS).countDocuments(),
      db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).countDocuments(),
      db.collection(COLLECTION_NAME).countDocuments()
    ]);

    // 2. 모든 고객 ID 수집
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { projection: { _id: 1 } }).toArray())
        .map(c => c._id.toString())
    );

    // 3. 고아 계약 탐지 (customer_id가 존재하지 않는 고객 참조)
    const contracts = await db.collection(COLLECTIONS.CONTRACTS).find({}, { projection: { customer_id: 1 } }).toArray();
    const orphanedContracts = contracts.filter(c => {
      const customerId = c.customer_id?.toString();
      return customerId && !allCustomerIds.has(customerId);
    });

    // 4. 고아 관계 탐지
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).find({}).toArray();
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
    backendLogger.error('Admin', '데이터 무결성 리포트 오류', error);
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
router.delete('/admin/orphaned-all', async (req, res) => {
  try {
    console.log('🗑️ 전체 고아 데이터 정리 시작...');

    // 1. 모든 고객 ID 수집
    const allCustomerIds = new Set(
      (await db.collection(CUSTOMERS_COLLECTION).find({}, { projection: { _id: 1 } }).toArray())
        .map(c => c._id.toString())
    );

    // 2. 고아 계약 삭제
    const contracts = await db.collection(COLLECTIONS.CONTRACTS).find({}, { projection: { _id: 1, customer_id: 1 } }).toArray();
    const orphanedContractIds = contracts
      .filter(c => {
        const customerId = c.customer_id?.toString();
        return customerId && !allCustomerIds.has(customerId);
      })
      .map(c => c._id);

    let deletedContracts = 0;
    if (orphanedContractIds.length > 0) {
      const result = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({ _id: { $in: orphanedContractIds } });
      deletedContracts = result.deletedCount;
    }

    // 3. 고아 관계 삭제
    const relationships = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).find({}).toArray();
    const orphanedRelIds = relationships
      .filter(r => {
        const fromId = r.from_customer?.toString();
        const toId = r.related_customer?.toString();
        return (fromId && !allCustomerIds.has(fromId)) || (toId && !allCustomerIds.has(toId));
      })
      .map(r => r._id);

    let deletedRelationships = 0;
    if (orphanedRelIds.length > 0) {
      const result = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({ _id: { $in: orphanedRelIds } });
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
    backendLogger.error('Admin', '고아 데이터 정리 오류', error);
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
router.put('/admin/users/:id/ocr-permission', authenticateJWT, requireRole('admin'), async (req, res) => {
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

    const result = await db.collection(COLLECTIONS.USERS).updateOne(
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
    backendLogger.error('Admin', 'OCR 권한 설정 오류', error);
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
router.get('/admin/users/:id/ocr-permission', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    // ID가 ObjectId 형식인지 확인 (24자리 hex string)
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);
    const query = isObjectId ? { _id: new ObjectId(id) } : { _id: id };

    const user = await db.collection(COLLECTIONS.USERS).findOne(
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
    backendLogger.error('Admin', 'OCR 권한 조회 오류', error);
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
router.get('/admin/dashboard', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    // 병렬로 모든 통계 쿼리 실행
    const [totalUsers, totalCustomers, totalDocuments, totalContracts] = await Promise.all([
      db.collection(COLLECTIONS.USERS).countDocuments(),
      db.collection(COLLECTIONS.CUSTOMERS).countDocuments({ deleted_at: null }),
      db.collection(COLLECTIONS.FILES).countDocuments(),
      db.collection(COLLECTIONS.CONTRACTS).countDocuments()
    ]);

    // 활성 사용자 (최근 30일 이내 로그인)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeUsers = await db.collection(COLLECTIONS.USERS).countDocuments({
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
      ocrTotalProcessed,
      // OCR 완료 문서의 총 페이지 수
      ocrDonePages
    ] = await Promise.all([
      // OCR 대상 문서 (ocr 서브도큐먼트 존재)
      db.collection(COLLECTIONS.FILES).countDocuments({ 'ocr': { $exists: true } }),
      // OCR 비대상 문서 (ocr 서브도큐먼트 없음)
      db.collection(COLLECTIONS.FILES).countDocuments({ 'ocr': { $exists: false } }),
      // OCR 완료
      db.collection(COLLECTIONS.FILES).countDocuments({ 'ocr.status': 'done' }),
      // OCR 대기
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'ocr.status': 'pending' },
          { 'stages.ocr.status': 'pending' }
        ]
      }),
      // OCR 처리중
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'ocr.status': 'processing' },
          { 'stages.ocr.status': 'processing' }
        ]
      }),
      // OCR 실패
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'ocr.status': 'error' },
          { 'stages.ocr.status': 'error' }
        ]
      }),
      // 임베딩 완료
      db.collection(COLLECTIONS.FILES).countDocuments({ 'docembed.status': 'done' }),
      // 임베딩 대기
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'docembed.status': 'pending' },
          { 'stages.docembed.status': 'pending' }
        ]
      }),
      // 임베딩 처리중
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'docembed.status': 'processing' },
          { 'stages.docembed.status': 'processing' }
        ]
      }),
      // 임베딩 실패
      db.collection(COLLECTIONS.FILES).countDocuments({
        $or: [
          { 'docembed.status': 'failed' },
          { 'docembed.status': 'error' },
          { 'stages.docembed.status': 'failed' },
          { 'stages.docembed.status': 'error' }
        ]
      }),
      // 전체 완료
      db.collection(COLLECTIONS.FILES).countDocuments({ 'overallStatus': 'completed' }),
      // 전체 처리중
      db.collection(COLLECTIONS.FILES).countDocuments({ 'overallStatus': 'processing' }),
      // 전체 실패
      db.collection(COLLECTIONS.FILES).countDocuments({ 'overallStatus': 'error' }),
      // 이번 달 OCR 완료 (ocr 서브도큐먼트가 있는 문서만)
      db.collection(COLLECTIONS.FILES).countDocuments({
        'ocr.status': { $in: ['done', 'error'] },
        $or: [
          { 'ocr.done_at': { $gte: startOfMonth } },
          { 'ocr.done_at': { $gte: startOfMonthISO } },
          { 'ocr.failed_at': { $gte: startOfMonth } },
          { 'ocr.failed_at': { $gte: startOfMonthISO } }
        ]
      }),
      // 전체 OCR 완료 (ocr 서브도큐먼트가 있는 문서만)
      db.collection(COLLECTIONS.FILES).countDocuments({
        'ocr.status': { $in: ['done', 'error'] }
      }),
      // OCR 완료 문서의 총 페이지 수
      db.collection(COLLECTIONS.FILES).aggregate([
        { $match: { 'ocr.status': 'done' } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$ocr.page_count', 1] } } } }
      ]).toArray().then(r => r[0]?.total || 0)
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
      })(),
      // [7] aims_mcp (MCP 서버 - 포트 3011)
      (async () => {
        const start = Date.now();
        const response = await axios.get('http://localhost:3011/health', { timeout: 5000 });
        return {
          latency: Date.now() - start,
          version: response.data?.version || null
        };
      })(),
      // [8] PDF Converter (문서→PDF 변환 서버 - 포트 8005)
      (async () => {
        const start = Date.now();
        const response = await axios.get('http://localhost:8005/health', { timeout: 5000 });
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
      pdfConverter: {
        status: healthChecks[8].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[8].status === 'fulfilled' ? healthChecks[8].value.latency : null,
        error: healthChecks[8].status === 'rejected' ? healthChecks[8].reason?.message : null,
        checkedAt: checkTime
      },
      aimsMcp: {
        status: healthChecks[7].status === 'fulfilled' ? 'healthy' : 'unhealthy',
        latency: healthChecks[7].status === 'fulfilled' ? healthChecks[7].value.latency : null,
        version: healthChecks[7].status === 'fulfilled' ? healthChecks[7].value.version : null,
        error: healthChecks[7].status === 'rejected' ? healthChecks[7].reason?.message : null,
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

    // n8n REST API로 워크플로우 상태 조회 (AIMS 핵심 워크플로우만 필터링)
    // ⚠️ 주의: SQLite 직접 조회는 DB 잠금 + 이벤트 루프 차단을 유발하므로 절대 사용 금지!
    const AIMS_CORE_WORKFLOWS = [
      'DocUpload', 'DocMeta', 'DocPrepMain', 'DocOCR',
      'OCRWorker', 'SmartSearch', 'DocSummary'
    ];
    let workflows = [];
    try {
      const n8nApiKey = process.env.N8N_API_KEY;
      if (n8nApiKey) {
        // n8n REST API 사용 (비동기, DB 잠금 없음)
        const n8nResponse = await axios.get('http://localhost:5678/api/v1/workflows', {
          headers: { 'X-N8N-API-KEY': n8nApiKey },
          timeout: 5000
        });

        if (n8nResponse.data?.data) {
          // AIMS 핵심 워크플로우만 필터링
          const workflowMap = new Map();
          for (const wf of n8nResponse.data.data) {
            if (AIMS_CORE_WORKFLOWS.includes(wf.name)) {
              const existing = workflowMap.get(wf.name);
              const updatedAt = wf.updatedAt || wf.createdAt;
              if (!existing || new Date(updatedAt) > new Date(existing.updatedAt)) {
                workflowMap.set(wf.name, {
                  id: wf.id,
                  name: wf.name,
                  active: wf.active === true,
                  updatedAt: updatedAt
                });
              }
            }
          }
          workflows = Array.from(workflowMap.values());
        }
      }
    } catch (wfError) {
      // API 오류는 로그만 남기고 계속 진행 (워크플로우 정보는 optional)
      console.warn('[Admin] n8n 워크플로우 상태 조회 실패 (API):', wfError.message);
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
          donePages: ocrDonePages,     // OCR 완료 페이지 수
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
    backendLogger.error('Admin', '대시보드 통계 조회 오류', error);
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
router.get('/admin/metrics/current', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const metrics = metricsCollector.collectMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[Admin] 시스템 메트릭 조회 오류:', error);
    backendLogger.error('Admin', '시스템 메트릭 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '시스템 메트릭 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: 실시간 시스템 메트릭 조회 (동시접속, 처리량, 부하지수)
 */
router.get('/admin/metrics/realtime', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const metrics = realtimeMetrics.getRealtimeMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('[Admin] 실시간 메트릭 조회 오류:', error);
    backendLogger.error('Admin', '실시간 메트릭 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '실시간 메트릭 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: 시스템 메트릭 히스토리 조회 (시계열 그래프용)
 *
 * 시간 범위에 따라 자동 샘플링 적용:
 * - 1~6시간: 전체 데이터 (약 360개)
 * - 24시간: 5분 간격 샘플링 (약 288개)
 * - 72시간 (3일): 15분 간격 샘플링 (약 288개)
 * - 168시간 (7일): 30분 간격 샘플링 (약 336개)
 */
router.get('/admin/metrics/history', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const hoursNum = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168); // 1~168시간 (7일)
    const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);

    // 시간 범위에 따른 샘플링 간격 결정 (분 단위)
    let sampleIntervalMinutes;
    if (hoursNum <= 6) {
      sampleIntervalMinutes = 1; // 전체 데이터
    } else if (hoursNum <= 24) {
      sampleIntervalMinutes = 5; // 5분 간격
    } else if (hoursNum <= 72) {
      sampleIntervalMinutes = 15; // 15분 간격
    } else {
      sampleIntervalMinutes = 30; // 30분 간격
    }

    // MongoDB aggregation으로 시간대별 평균 계산
    // DB 필드 구조: cpu.usage, memory.usagePercent, disks.root.usagePercent, disks.data.usagePercent
    const metrics = await db.collection('system_metrics').aggregate([
      // 1. 시간 범위 필터
      { $match: { timestamp: { $gte: since } } },

      // 2. 시간대별 그룹핑 (샘플링 간격에 맞춰)
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, sampleIntervalMinutes * 60 * 1000] }
              ]
            }
          },
          cpu: { $avg: '$cpu.usage' },
          memory: { $avg: '$memory.usagePercent' },
          diskRoot: { $avg: '$disks.root.usagePercent' },
          diskData: { $avg: '$disks.data.usagePercent' }
        }
      },

      // 3. 시간순 정렬
      { $sort: { _id: 1 } },

      // 4. 필드 재구성
      {
        $project: {
          _id: 0,
          timestamp: '$_id',
          cpu: { $round: ['$cpu', 1] },
          memory: { $round: ['$memory', 1] },
          diskRoot: { $round: ['$diskRoot', 1] },
          diskData: { $round: ['$diskData', 1] }
        }
      }
    ]).toArray();

    res.json({
      success: true,
      data: {
        hours: hoursNum,
        sampleInterval: sampleIntervalMinutes,
        count: metrics.length,
        metrics
      }
    });
  } catch (error) {
    console.error('[Admin] 메트릭 히스토리 조회 오류:', error);
    backendLogger.error('Admin', '메트릭 히스토리 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '메트릭 히스토리 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: AIMS 서비스 포트 현황 조회
 * HTTP 헬스 체크 방식으로 Tier 2 백엔드 API 상태와 일관성 유지
 */
router.get('/admin/ports', authenticateJWT, requireRole('admin'), async (req, res) => {
  // AIMS 서비스 포트 목록 (healthEndpoint: HTTP 헬스체크 URL, 없으면 TCP 체크)
  const AIMS_PORTS = [
    { port: 3010, service: 'aims_api', description: 'AIMS 메인 API', healthEndpoint: '/api/health' },
    { port: 3011, service: 'aims_mcp', description: 'MCP 서버 (AI 도구)', healthEndpoint: '/health' },
    { port: 8000, service: 'aims_rag_api', description: 'RAG/문서 처리 API', healthEndpoint: '/health' },
    { port: 8002, service: 'pdf_proxy', description: 'PDF 프록시', healthEndpoint: '/health' },
    { port: 8004, service: 'annual_report_api', description: '연간보고서 API', healthEndpoint: '/health' },
    { port: 8005, service: 'pdf_converter', description: 'PDF 변환 서버', healthEndpoint: '/health' },
    { port: 5678, service: 'n8n', description: '워크플로우 엔진', healthEndpoint: '/healthz' },
    { port: 6333, service: 'qdrant', description: '벡터 DB', healthEndpoint: null }, // TCP 체크
    { port: 27017, service: 'mongodb', description: '데이터베이스', healthEndpoint: null } // TCP 체크
  ];

  const checkTime = utcNowISO();
  const TIMEOUT_MS = 5000; // Tier 2 헬스 체크와 동일한 타임아웃

  // 병렬로 포트 상태 체크
  const portChecks = await Promise.allSettled(
    AIMS_PORTS.map(async ({ port, service, description, healthEndpoint }) => {
      try {
        if (healthEndpoint) {
          // HTTP 헬스 체크 (Tier 2 백엔드 API 체크와 동일한 방식)
          const url = `http://localhost:${port}${healthEndpoint}`;
          await axios.get(url, { timeout: TIMEOUT_MS });
          return { port, service, description, status: 'listening', checkedAt: checkTime };
        } else {
          // TCP 연결 체크 (MongoDB, Qdrant 등 HTTP 미지원 서비스)
          const net = require('net');
          return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            socket.setTimeout(TIMEOUT_MS);
            socket.on('connect', () => {
              socket.destroy();
              resolve({ port, service, description, status: 'listening', checkedAt: checkTime });
            });
            socket.on('timeout', () => {
              socket.destroy();
              reject(new Error('timeout'));
            });
            socket.on('error', (err) => {
              socket.destroy();
              reject(err);
            });
            socket.connect(port, 'localhost');
          });
        }
      } catch (error) {
        return { port, service, description, status: 'closed', checkedAt: checkTime };
      }
    })
  );

  const ports = portChecks.map((result, idx) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      ...AIMS_PORTS[idx],
      status: 'closed',
      checkedAt: checkTime
    };
  });

  res.json({
    success: true,
    data: ports
  });
});

/**
 * 관리자: 서비스 상태 이력 조회
 * 서비스 장애/복구 이력 조회
 */
router.get('/admin/health-history', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { service, eventType, startDate, endDate, limit = 100, skip = 0 } = req.query;

    const result = await serviceHealthMonitor.getHealthHistory({
      service: service || null,
      eventType: eventType || null,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: parseInt(limit, 10),
      skip: parseInt(skip, 10)
    });

    res.json({
      success: true,
      data: result.logs,
      totalCount: result.totalCount
    });
  } catch (error) {
    console.error('[Admin Health History] 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 관리자: 서비스 상태 이력 삭제
 */
router.delete('/admin/health-history', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const result = await serviceHealthMonitor.clearHistory();

    res.json({
      success: true,
      message: `${result.deletedCount}건의 이력이 삭제되었습니다`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[Admin Health History] 삭제 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 관리자: 서비스 다운타임 통계
 * 지정 기간 동안 서비스별 장애 횟수 및 복구 횟수 통계
 */
router.get('/admin/health-stats', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await serviceHealthMonitor.getDowntimeStats(parseInt(days, 10));

    res.json({
      success: true,
      data: stats,
      period: `${days}일`
    });
  } catch (error) {
    console.error('[Admin Health Stats] 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 관리자: 현재 서비스 상태 조회 (실시간 체크)
 * 모든 서비스 상태를 실시간으로 체크하여 반환
 */
router.get('/admin/health-current', authenticateJWT, requireRole('admin'), async (req, res) => {
  try {
    const results = await serviceHealthMonitor.checkAllServices();

    res.json({
      success: true,
      data: results,
      checkedAt: utcNowISO()
    });
  } catch (error) {
    console.error('[Admin Health Current] 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 서비스 이벤트 기록 API (배포/재시작 등)
 * 배포 스크립트에서 호출하여 이벤트 기록
 * 인증 없이 localhost에서만 호출 가능
 */
router.post('/admin/service-event', async (req, res) => {
  // localhost에서만 호출 허용 (보안)
  const clientIp = req.ip || req.connection.remoteAddress || '';
  const isLocalhost = clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1';

  if (!isLocalhost) {
    return res.status(403).json({ success: false, error: 'Only localhost allowed' });
  }

  const { serviceName, eventType, reason, triggeredBy } = req.body;

  if (!serviceName || !eventType) {
    return res.status(400).json({ success: false, error: 'serviceName and eventType required' });
  }

  try {
    await db.collection('service_health_logs').insertOne({
      serviceName,
      status: eventType,  // 'restart-initiated', 'restart-completed', 'deploy' 등
      reason: reason || 'Manual deployment',
      triggeredBy: triggeredBy || 'deploy-script',
      timestamp: new Date(),
      metadata: {
        source: 'deploy-script',
        hostname: require('os').hostname()
      }
    });

    console.log(`[Service Event] ${serviceName}: ${eventType} - ${reason || 'No reason'}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[Service Event] 기록 실패:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 시스템 메트릭 API (실시간 성능 모니터링)
 * CPU, 메모리, 연결 상태 등 실시간 메트릭 제공
 */
router.get('/admin/metrics', authenticateJWT, requireRole('admin'), async (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.json({
    success: true,
    data: {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        raw: memUsage
      },
      cpu: cpuUsage,
      uptime: Math.round(process.uptime()) + 's',
      uptimeMinutes: Math.round(process.uptime() / 60),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      timestamp: utcNowISO()
    }
  });
});

/**
 * 관리자: 사용자 목록 조회 (페이징, 검색, 필터)
 */
router.get('/admin/users', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { page = 1, limit = 50, search = '', role = '', hasOcrPermission, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  console.log('[Admin Users API] 요청 파라미터:', { page, limit, search, role, hasOcrPermission, sortBy, sortOrder });

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

    // 정렬 옵션 구성
    const sortFieldMap = {
      name: 'name',
      email: 'email',
      tier: 'storage.tier',
      createdAt: 'createdAt',
      lastLogin: 'lastLogin'
    };
    const sortField = sortFieldMap[sortBy] || 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortOption = { [sortField]: sortDirection };

    console.log('[Admin Users API] 정렬:', sortOption);

    // 병렬로 사용자 목록과 전체 개수 조회
    const [users, total] = await Promise.all([
      db.collection(COLLECTIONS.USERS)
        .find(filter, {
          projection: {
            // 보안상 소셜 로그인 ID 제외
            kakaoId: 0,
            naverId: 0,
            googleId: 0
          }
        })
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection(COLLECTIONS.USERS).countDocuments(filter)
    ]);

    console.log('[Admin Users API] 결과:', { total, returnedCount: users.length });

    // 각 사용자의 스토리지 사용량 계산
    const userIds = users.map(u => u._id.toString());
    const storageAgg = await db.collection(COLLECTIONS.FILES).aggregate([
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

    const ocrAgg = await db.collection(COLLECTIONS.FILES).aggregate([
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
    backendLogger.error('Admin', '사용자 목록 조회 오류', error);
    res.status(500).json({
      success: false,
      message: '사용자 목록 조회에 실패했습니다',
      error: error.message
    });
  }
});

/**
 * 관리자: 사용자 삭제 미리보기 (삭제될 데이터 개수 조회)
 * - 삭제 전 어떤 데이터가 삭제될지 미리 보여줌
 *
 * @since 2025-12-27
 */
router.get('/admin/users/:id/delete-preview', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  try {
    // 1. 사용자 존재 확인 (ObjectId 또는 문자열 ID 모두 지원)
    let targetUser = null;
    let userIdQuery = null;

    if (ObjectId.isValid(id)) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) });
      userIdQuery = new ObjectId(id);
    }

    if (!targetUser) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: id });
      userIdQuery = id;
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const userId = id;

    // 2. 문서 정보 조회
    const userDocuments = await db.collection(COLLECTIONS.FILES)
      .find({ ownerId: userId })
      .toArray();

    const filePaths = userDocuments
      .filter(doc => doc.upload?.destPath)
      .map(doc => doc.upload.destPath);

    // 파일 폴더 경로 추출 (공통 부모 디렉토리)
    const folders = [...new Set(filePaths.map(p => {
      const parts = p.split('/');
      parts.pop(); // 파일명 제거
      return parts.join('/');
    }))];

    // 3. 고객 수 조회 (meta.created_by 필드 사용)
    const customersCount = await db.collection(COLLECTIONS.CUSTOMERS)
      .countDocuments({ 'meta.created_by': userId });

    // 4. 계약 수 조회 (agent_id는 ObjectId, meta.created_by는 문자열 - 둘 다 조회)
    let contractsCount = 0;
    if (ObjectId.isValid(userId)) {
      contractsCount = await db.collection(COLLECTIONS.CONTRACTS)
        .countDocuments({ agent_id: new ObjectId(userId) });
    }
    // agent_id로 못 찾으면 meta.created_by로 시도
    if (contractsCount === 0) {
      contractsCount = await db.collection(COLLECTIONS.CONTRACTS)
        .countDocuments({ 'meta.created_by': userId });
    }

    // 5. 관계 수 조회 (meta.created_by 필드 사용)
    const relationshipsCount = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS)
      .countDocuments({ 'meta.created_by': userId });

    // 6. AI 사용량 조회
    let tokenUsageCount = 0;
    try {
      tokenUsageCount = await db.collection('token_usage').countDocuments({ userId });
    } catch (err) {
      console.log('[Admin] token_usage 조회 오류:', err.message);
    }

    // 7. Qdrant 임베딩 수 조회 (추정치: 문서별 청크 수)
    let embeddingsCount = 0;
    for (const doc of userDocuments) {
      embeddingsCount += doc.chunks?.length || 0;
    }

    res.json({
      success: true,
      preview: {
        user: {
          _id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email
        },
        documents: {
          count: userDocuments.length,
          files: filePaths.slice(0, 10), // 최대 10개만 표시
          hasMore: filePaths.length > 10,
          totalFiles: filePaths.length,
          folders: folders
        },
        customers: customersCount,
        contracts: contractsCount,
        relationships: relationshipsCount,
        embeddings: embeddingsCount,
        tokenUsage: tokenUsageCount
      }
    });

  } catch (error) {
    console.error('[Admin] 삭제 미리보기 오류:', error);
    res.status(500).json({
      success: false,
      message: '삭제 미리보기 조회에 실패했습니다.',
      error: error.message
    });
  }
});

/**
 * 관리자: 사용자 삭제 예약 (24시간 후 삭제)
 * - 즉시 삭제 대신 scheduledDeletionAt 필드 설정
 * - 24시간 후 스케줄러가 실제 삭제 수행
 *
 * @since 2025-12-27
 * @updated 2026-01-06 - 24시간 예약 삭제로 변경 (보수적 삭제 디자인)
 */
router.delete('/admin/users/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const adminUserId = req.user.id;

  console.log(`[Admin] 사용자 삭제 예약 요청: userId=${id}, by admin=${adminUserId}`);

  // 자기 자신 삭제 방지
  if (id === adminUserId) {
    return res.status(400).json({
      success: false,
      message: '자기 자신은 삭제할 수 없습니다.'
    });
  }

  try {
    // 1. 사용자 존재 및 role 확인 (ObjectId 또는 문자열 ID 모두 지원)
    let targetUser = null;
    let userIdQuery = null;

    if (ObjectId.isValid(id)) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) });
      userIdQuery = new ObjectId(id);
    }

    if (!targetUser) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: id });
      userIdQuery = id;
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 관리자 삭제 방지 (다른 관리자도 삭제 불가)
    if (targetUser.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자는 삭제할 수 없습니다.'
      });
    }

    // 이미 삭제 예약된 경우
    if (targetUser.scheduledDeletionAt) {
      return res.status(400).json({
        success: false,
        message: '이미 삭제가 예약된 사용자입니다.',
        scheduledDeletionAt: targetUser.scheduledDeletionAt
      });
    }

    // 2. 24시간 후 삭제 예약 (scheduledDeletionAt 필드 설정)
    const scheduledDeletionAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24시간 후

    const updateResult = await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: userIdQuery },
      {
        $set: {
          scheduledDeletionAt: scheduledDeletionAt,
          scheduledDeletionBy: adminUserId,
          scheduledDeletionRequestedAt: new Date()
        }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(500).json({
        success: false,
        message: '삭제 예약에 실패했습니다.'
      });
    }

    console.log(`⏰ [Admin] 사용자 삭제 예약 완료: ${targetUser.name} (${targetUser.email}) - ${scheduledDeletionAt.toISOString()}`);
    backendLogger.info('Admin', `사용자 삭제 예약: ${targetUser.name} (${targetUser.email})`, {
      scheduledBy: adminUserId,
      scheduledDeletionAt: scheduledDeletionAt.toISOString()
    });

    res.json({
      success: true,
      message: `사용자 "${targetUser.name}"의 삭제가 24시간 후로 예약되었습니다.`,
      scheduledUser: {
        _id: id,
        name: targetUser.name,
        email: targetUser.email
      },
      scheduledDeletionAt: scheduledDeletionAt.toISOString()
    });

  } catch (error) {
    console.error('[Admin] 사용자 삭제 예약 오류:', error);
    backendLogger.error('Admin', '사용자 삭제 예약 오류', error);
    res.status(500).json({
      success: false,
      message: '사용자 삭제 예약 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 관리자: 사용자 삭제 예약 취소
 * - scheduledDeletionAt 필드 제거
 *
 * @since 2026-01-06
 */
router.post('/admin/users/:id/cancel-deletion', authenticateJWT, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const adminUserId = req.user.id;

  console.log(`[Admin] 사용자 삭제 취소 요청: userId=${id}, by admin=${adminUserId}`);

  try {
    // 1. 사용자 존재 확인
    let targetUser = null;
    let userIdQuery = null;

    if (ObjectId.isValid(id)) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) });
      userIdQuery = new ObjectId(id);
    }

    if (!targetUser) {
      targetUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: id });
      userIdQuery = id;
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    // 삭제 예약되지 않은 경우
    if (!targetUser.scheduledDeletionAt) {
      return res.status(400).json({
        success: false,
        message: '삭제가 예약되지 않은 사용자입니다.'
      });
    }

    // 2. 삭제 예약 취소 (scheduledDeletionAt 필드 제거)
    const updateResult = await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: userIdQuery },
      {
        $unset: {
          scheduledDeletionAt: '',
          scheduledDeletionBy: '',
          scheduledDeletionRequestedAt: ''
        }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(500).json({
        success: false,
        message: '삭제 취소에 실패했습니다.'
      });
    }

    console.log(`✅ [Admin] 사용자 삭제 취소 완료: ${targetUser.name} (${targetUser.email})`);
    backendLogger.info('Admin', `사용자 삭제 취소: ${targetUser.name} (${targetUser.email})`, {
      cancelledBy: adminUserId
    });

    res.json({
      success: true,
      message: `사용자 "${targetUser.name}"의 삭제 예약이 취소되었습니다.`,
      user: {
        _id: id,
        name: targetUser.name,
        email: targetUser.email
      }
    });

  } catch (error) {
    console.error('[Admin] 사용자 삭제 취소 오류:', error);
    backendLogger.error('Admin', '사용자 삭제 취소 오류', error);
    res.status(500).json({
      success: false,
      message: '사용자 삭제 취소 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 예약된 사용자 삭제 실행 (내부 함수)
 * - scheduledDeletionAt이 현재 시간보다 이전인 사용자 실제 삭제
 * - 서버 시작 시 + 매 시간마다 실행
 *
 * @since 2026-01-06
 */
async function executeScheduledDeletions() {
  console.log('[Scheduler] 예약된 사용자 삭제 실행 시작...');

  try {
    // scheduledDeletionAt이 현재 시간보다 이전인 사용자 조회
    const usersToDelete = await db.collection(COLLECTIONS.USERS).find({
      scheduledDeletionAt: { $lte: new Date() },
      role: { $ne: 'admin' } // 관리자는 삭제 불가
    }).toArray();

    if (usersToDelete.length === 0) {
      console.log('[Scheduler] 삭제 예정 사용자 없음');
      return { deleted: 0, errors: [] };
    }

    console.log(`[Scheduler] 삭제 대상 사용자: ${usersToDelete.length}명`);
    const results = { deleted: 0, errors: [] };

    for (const targetUser of usersToDelete) {
      const userId = targetUser._id.toString();
      const userIdQuery = targetUser._id;

      try {
        console.log(`[Scheduler] 사용자 삭제 시작: ${targetUser.name} (${targetUser.email})`);

        const deletionStats = {
          documents: { total: 0, filesDeleted: 0, qdrantDeleted: 0, errors: [] },
          customers: 0,
          contracts: 0,
          relationships: 0,
          tokenUsage: 0
        };

        // 1. 사용자의 모든 문서 조회
        const userDocuments = await db.collection(COLLECTIONS.FILES)
          .find({ ownerId: userId })
          .toArray();

        deletionStats.documents.total = userDocuments.length;

        // 2. 각 문서별 물리 파일 + Qdrant 삭제
        for (const doc of userDocuments) {
          const docId = doc._id.toString();

          // 물리 파일 삭제
          if (doc.upload?.destPath) {
            try {
              await fs.unlink(doc.upload.destPath);
              deletionStats.documents.filesDeleted++;
            } catch (fileErr) {
              if (fileErr.code !== 'ENOENT') {
                deletionStats.documents.errors.push({ docId, type: 'file', error: fileErr.message });
              }
            }
          }

          // Qdrant 임베딩 삭제
          try {
            await qdrantClient.delete(QDRANT_COLLECTION, {
              filter: { must: [{ key: 'doc_id', match: { value: docId } }] }
            });
            deletionStats.documents.qdrantDeleted++;
          } catch (qdrantErr) {
            deletionStats.documents.errors.push({ docId, type: 'qdrant', error: qdrantErr.message });
          }
        }

        // 3. MongoDB 문서 일괄 삭제
        await db.collection(COLLECTIONS.FILES).deleteMany({ ownerId: userId });

        // 4. 고객 삭제
        const customersResult = await db.collection(COLLECTIONS.CUSTOMERS).deleteMany({ 'meta.created_by': userId });
        deletionStats.customers = customersResult.deletedCount;

        // 5. 계약 삭제
        try {
          let contractsDeleted = 0;
          if (ObjectId.isValid(userId)) {
            const byAgentId = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({ agent_id: new ObjectId(userId) });
            contractsDeleted = byAgentId.deletedCount;
          }
          const byCreatedBy = await db.collection(COLLECTIONS.CONTRACTS).deleteMany({ 'meta.created_by': userId });
          contractsDeleted += byCreatedBy.deletedCount;
          deletionStats.contracts = contractsDeleted;
        } catch (err) { /* ignore */ }

        // 6. 관계 삭제
        try {
          const relationshipsResult = await db.collection(COLLECTIONS.CUSTOMER_RELATIONSHIPS).deleteMany({ 'meta.created_by': userId });
          deletionStats.relationships = relationshipsResult.deletedCount;
        } catch (err) { /* ignore */ }

        // 7. 토큰 사용량 삭제
        try {
          const tokenUsageResult = await db.collection('token_usage').deleteMany({ userId: userId });
          deletionStats.tokenUsage = tokenUsageResult.deletedCount;
        } catch (err) { /* ignore */ }

        // 8. 사용자 삭제
        await db.collection(COLLECTIONS.USERS).deleteOne({ _id: userIdQuery });

        console.log(`✅ [Scheduler] 사용자 삭제 완료: ${targetUser.name} (${targetUser.email})`);
        backendLogger.info('Scheduler', `예약 삭제 실행: ${targetUser.name} (${targetUser.email})`, {
          stats: deletionStats
        });

        results.deleted++;

      } catch (userError) {
        console.error(`❌ [Scheduler] 사용자 삭제 실패: ${targetUser.name}`, userError.message);
        results.errors.push({ userId, name: targetUser.name, error: userError.message });
      }
    }

    console.log(`[Scheduler] 예약 삭제 완료: ${results.deleted}명 삭제, ${results.errors.length}건 오류`);
    return results;

  } catch (error) {
    console.error('[Scheduler] 예약 삭제 실행 오류:', error);
    return { deleted: 0, errors: [{ error: error.message }] };
  }
}

// 예약 삭제 스케줄러 시작 (서버 시작 후 1분 뒤, 이후 매 시간마다)
setTimeout(() => {
  executeScheduledDeletions();
  setInterval(executeScheduledDeletions, 60 * 60 * 1000); // 매 시간마다
}, 60 * 1000); // 서버 시작 1분 후 첫 실행


  return router;
};
