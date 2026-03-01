/**
 * 문서 유형 API Routes
 * @since 2025-12-29
 *
 * 문서 유형 관리 (전역 설정)
 * - aims-uix3: 사용자용 조회 API
 * - aims-admin: 관리자용 CRUD API
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const backendLogger = require('../lib/backendLogger');
const { escapeRegex } = require('../lib/helpers');

// 기본 문서 유형 (초기 데이터)
const DEFAULT_DOCUMENT_TYPES = [
  // 시스템 유형
  { value: 'unspecified', label: '미지정', description: '유형이 지정되지 않은 문서', isSystem: true, order: 0 },

  // 계약 체결 관련
  { value: 'application', label: '청약서', description: '보험 가입 신청서, 청약서 부본', isSystem: false, order: 1 },
  { value: 'policy', label: '보험증권', description: '계약 체결 증명서, 보험가입증명서', isSystem: false, order: 2 },
  { value: 'terms', label: '약관', description: '보험약관, 상품설명서, 상품안내장', isSystem: false, order: 3 },
  { value: 'proposal', label: '제안서', description: '보험 상품 제안서', isSystem: false, order: 4 },

  // 보험금 청구 관련
  { value: 'claim', label: '보험금청구서', description: '보험금 청구 관련 문서', isSystem: false, order: 5 },
  { value: 'diagnosis', label: '진단서', description: '의사 진단서, 소견서, 진료확인서, 입퇴원확인서', isSystem: false, order: 6 },
  { value: 'medical_receipt', label: '진료비영수증', description: '진료비 영수증, 세부내역서, 처방전', isSystem: false, order: 7 },
  { value: 'accident_cert', label: '사고증명서', description: '교통사고사실확인서, 상해진단서', isSystem: false, order: 8 },

  // 신분/증빙 관련
  { value: 'id_card', label: '신분증', description: '주민등록증, 운전면허증, 여권', isSystem: false, order: 9 },
  { value: 'family_cert', label: '가족관계서류', description: '주민등록등본, 가족관계증명서', isSystem: false, order: 10 },
  { value: 'seal_signature', label: '인감/서명', description: '인감증명서, 본인서명사실확인서', isSystem: false, order: 11 },
  { value: 'bank_account', label: '통장사본', description: '통장사본, 계좌개설확인서', isSystem: false, order: 12 },
  { value: 'income_employment', label: '소득/재직증빙', description: '원천징수영수증, 재직증명서, 사업자등록증', isSystem: false, order: 13 },

  // 기타
  { value: 'annual_report', label: '연간보고서(AR)', description: '보험사 연간 보고서 (시스템 전용)', isSystem: true, order: 14 },
  { value: 'general', label: '일반 문서', description: '일반적인 문서', isSystem: false, order: 15 }
];

module.exports = (db, authenticateJWT, requireRole) => {
  const documentTypesCollection = db.collection('document_types');
  const filesCollection = db.collection('files');

  /**
   * 초기 데이터 확인 및 생성
   * 서버 시작 시 document_types 컬렉션이 비어있으면 기본 데이터 삽입
   */
  async function ensureDefaultDocumentTypes() {
    try {
      const count = await documentTypesCollection.countDocuments();
      if (count === 0) {
        console.log('[DocumentTypes] 기본 문서 유형 데이터 삽입 중...');
        const now = new Date();
        const docsToInsert = DEFAULT_DOCUMENT_TYPES.map(dt => ({
          ...dt,
          createdAt: now,
          updatedAt: now
        }));
        await documentTypesCollection.insertMany(docsToInsert);
        console.log('[DocumentTypes] 기본 문서 유형 데이터 삽입 완료:', docsToInsert.length);
      }
    } catch (error) {
      console.error('[DocumentTypes] 기본 데이터 삽입 오류:', error);
    }
  }

  // 서버 시작 시 기본 데이터 확인
  ensureDefaultDocumentTypes();

  // ========================================
  // 문서 유형 API - 사용자용
  // ========================================

  /**
   * 문서 유형 목록 조회 (모든 사용자)
   * GET /api/document-types
   *
   * 시스템 유형(unspecified, annual_report) 제외 옵션 제공
   */
  router.get('/document-types', async (req, res) => {
    try {
      const { includeSystem = 'true' } = req.query;

      const query = {};
      // includeSystem=false 이면 시스템 유형 제외
      if (includeSystem === 'false') {
        query.isSystem = { $ne: true };
      }

      const documentTypes = await documentTypesCollection
        .find(query)
        .sort({ order: 1 })
        .toArray();

      res.json({
        success: true,
        data: documentTypes
      });
    } catch (error) {
      console.error('문서 유형 목록 조회 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // 문서 유형 API - 관리자용
  // ========================================

  /**
   * 문서 유형 전체 목록 조회 (관리자)
   * GET /api/admin/document-types
   */
  router.get('/admin/document-types', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { search } = req.query;

      const query = {};
      if (search) {
        const escapedSearch = escapeRegex(search);
        query.$or = [
          { value: { $regex: escapedSearch, $options: 'i' } },
          { label: { $regex: escapedSearch, $options: 'i' } },
          { description: { $regex: escapedSearch, $options: 'i' } }
        ];
      }

      const documentTypes = await documentTypesCollection
        .find(query)
        .sort({ order: 1 })
        .toArray();

      // 각 문서 유형의 사용 문서 수 집계
      const typeCounts = await filesCollection.aggregate([
        { $group: { _id: '$document_type', count: { $sum: 1 } } }
      ]).toArray();

      const countMap = typeCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      // 사용 문서 수 추가
      const documentTypesWithCount = documentTypes.map(dt => ({
        ...dt,
        documentCount: countMap[dt.value] || 0
      }));

      res.json({
        success: true,
        data: documentTypesWithCount
      });
    } catch (error) {
      console.error('관리자 문서 유형 목록 조회 오류:', error);
      backendLogger.error('DocumentTypes', '관리자 문서 유형 목록 조회 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문서 유형 생성 (관리자)
   * POST /api/admin/document-types
   */
  router.post('/admin/document-types', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { value, label, description = '' } = req.body;
      const adminId = req.user.id;

      if (!value || !value.trim()) {
        return res.status(400).json({ success: false, message: '유형 코드(value)를 입력해주세요' });
      }
      if (!label || !label.trim()) {
        return res.status(400).json({ success: false, message: '유형 이름(label)을 입력해주세요' });
      }

      // 영문 소문자, 숫자, 언더스코어만 허용
      const valueRegex = /^[a-z0-9_]+$/;
      if (!valueRegex.test(value.trim())) {
        return res.status(400).json({
          success: false,
          message: '유형 코드는 영문 소문자, 숫자, 언더스코어(_)만 사용할 수 있습니다'
        });
      }

      // 중복 체크
      const existing = await documentTypesCollection.findOne({ value: value.trim() });
      if (existing) {
        return res.status(400).json({ success: false, message: '이미 존재하는 유형 코드입니다' });
      }

      // 다음 order 값 계산
      const maxOrderDoc = await documentTypesCollection.findOne({}, { sort: { order: -1 } });
      const nextOrder = (maxOrderDoc?.order ?? -1) + 1;

      const now = new Date();
      const newDocumentType = {
        value: value.trim(),
        label: label.trim(),
        description: description.trim(),
        isSystem: false, // 사용자가 만든 유형은 시스템 유형이 아님
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
        createdBy: adminId
      };

      const result = await documentTypesCollection.insertOne(newDocumentType);

      res.status(201).json({
        success: true,
        data: { _id: result.insertedId, ...newDocumentType }
      });
    } catch (error) {
      console.error('문서 유형 생성 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 생성 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문서 유형 수정 (관리자)
   * PUT /api/admin/document-types/:id
   *
   * 시스템 유형은 label, description만 수정 가능
   */
  router.put('/admin/document-types/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { label, description, order } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문서 유형 ID입니다' });
      }

      const existing = await documentTypesCollection.findOne({ _id: new ObjectId(id) });
      if (!existing) {
        return res.status(404).json({ success: false, message: '문서 유형을 찾을 수 없습니다' });
      }

      const updateFields = { updatedAt: new Date() };

      // label, description은 항상 수정 가능
      if (label !== undefined) updateFields.label = label.trim();
      if (description !== undefined) updateFields.description = description.trim();
      if (order !== undefined) updateFields.order = order;

      const result = await documentTypesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '문서 유형을 찾을 수 없습니다' });
      }

      const updated = await documentTypesCollection.findOne({ _id: new ObjectId(id) });
      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('문서 유형 수정 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 수정 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문서 유형 삭제 (관리자)
   * DELETE /api/admin/document-types/:id
   *
   * 시스템 유형(isSystem=true)은 삭제 불가
   * 삭제 시 해당 유형을 사용하는 문서들은 'unspecified'로 변경
   */
  router.delete('/admin/document-types/:id', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문서 유형 ID입니다' });
      }

      const documentType = await documentTypesCollection.findOne({ _id: new ObjectId(id) });
      if (!documentType) {
        return res.status(404).json({ success: false, message: '문서 유형을 찾을 수 없습니다' });
      }

      // 시스템 유형 삭제 불가
      if (documentType.isSystem) {
        return res.status(400).json({
          success: false,
          message: '시스템 기본 유형은 삭제할 수 없습니다'
        });
      }

      // 해당 유형을 사용하는 문서 수 확인
      const affectedDocs = await filesCollection.countDocuments({ document_type: documentType.value });

      // 해당 유형을 사용하는 문서들을 'unspecified'로 변경
      if (affectedDocs > 0) {
        await filesCollection.updateMany(
          { document_type: documentType.value },
          { $set: { document_type: 'unspecified' } }
        );
        console.log(`[DocumentTypes] ${affectedDocs}개 문서의 유형을 'unspecified'로 변경`);
      }

      // 문서 유형 삭제
      const result = await documentTypesCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, message: '문서 유형을 찾을 수 없습니다' });
      }

      res.json({
        success: true,
        message: '문서 유형이 삭제되었습니다',
        affectedDocuments: affectedDocs
      });
    } catch (error) {
      console.error('문서 유형 삭제 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 삭제 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문서 유형 순서 일괄 업데이트 (관리자)
   * PUT /api/admin/document-types/reorder
   */
  router.put('/admin/document-types/reorder', authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const { orders } = req.body; // [{ id: string, order: number }, ...]

      if (!Array.isArray(orders)) {
        return res.status(400).json({ success: false, message: '순서 배열이 필요합니다' });
      }

      const bulkOps = orders.map(({ id, order }) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: { order, updatedAt: new Date() } }
        }
      }));

      await documentTypesCollection.bulkWrite(bulkOps);

      res.json({ success: true, message: '순서가 업데이트되었습니다' });
    } catch (error) {
      console.error('문서 유형 순서 업데이트 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 순서 업데이트 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  // ========================================
  // 문서 자동 분류 API
  // ========================================

  const { classifyDocument, classifyDocuments } = require('../lib/documentTypeClassifier');

  /**
   * 단일 문서 자동 분류
   * POST /api/documents/:id/auto-classify
   *
   * meta.tags와 meta.summary를 기반으로 문서 유형 자동 분류
   * autoApply=true (기본값)이면 신뢰도 70% 이상 시 자동 적용
   */
  router.post('/documents/:id/auto-classify', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const { autoApply = true } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문서 ID입니다' });
      }

      const document = await filesCollection.findOne({ _id: new ObjectId(id) });
      if (!document) {
        return res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다' });
      }

      const tags = document.meta?.tags || [];
      const summary = document.meta?.summary || '';
      const filename = document.upload?.originalName || '';

      const result = classifyDocument(tags, summary, filename);

      // 자동 적용 (신뢰도 70% 이상)
      if (autoApply && result.autoApplied && result.type) {
        await filesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              document_type: result.type,
              document_type_auto: true,
              document_type_confidence: result.confidence,
              document_type_updated_at: new Date()
            }
          }
        );

        console.log(`[AutoClassify] 문서 ${id} → ${result.type} (신뢰도: ${result.confidence})`);
      }

      res.json({
        success: true,
        data: {
          documentId: id,
          currentType: document.document_type || 'unspecified',
          ...result,
          applied: autoApply && result.autoApplied
        }
      });
    } catch (error) {
      console.error('문서 자동 분류 오류:', error);
      backendLogger.error('DocumentTypes', '문서 자동 분류 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 문서 유형 수동 변경
   * PATCH /api/documents/:id/type
   *
   * 사용자가 수동으로 문서 유형 변경
   */
  router.patch('/documents/:id/type', authenticateJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문서 ID입니다' });
      }

      if (!type) {
        return res.status(400).json({ success: false, message: '문서 유형을 지정해주세요' });
      }

      // 유효한 문서 유형인지 확인
      const validType = await documentTypesCollection.findOne({ value: type });
      if (!validType) {
        return res.status(400).json({ success: false, message: '유효하지 않은 문서 유형입니다' });
      }

      const result = await filesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            document_type: type,
            document_type_auto: false, // 수동 변경
            document_type_updated_at: new Date()
          },
          $unset: {
            document_type_confidence: ''
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: '문서를 찾을 수 없습니다' });
      }

      console.log(`[ManualClassify] 문서 ${id} → ${type} (수동)`);

      res.json({
        success: true,
        data: {
          documentId: id,
          type,
          typeLabel: validType.label
        }
      });
    } catch (error) {
      console.error('문서 유형 변경 오류:', error);
      backendLogger.error('DocumentTypes', '문서 유형 변경 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  /**
   * 여러 문서 일괄 자동 분류
   * POST /api/documents/bulk-auto-classify
   *
   * 미분류 문서들을 일괄 분류
   */
  router.post('/documents/bulk-auto-classify', authenticateJWT, async (req, res) => {
    try {
      const { documentIds, autoApply = true } = req.body;

      let query = {};
      if (documentIds && Array.isArray(documentIds)) {
        query._id = { $in: documentIds.map(id => new ObjectId(id)) };
      } else {
        // documentIds가 없으면 미분류 문서만
        query.$or = [
          { document_type: { $exists: false } },
          { document_type: null },
          { document_type: 'unspecified' }
        ];
      }

      const documents = await filesCollection.find(query).toArray();
      const results = classifyDocuments(documents);

      let appliedCount = 0;
      if (autoApply) {
        for (const result of results) {
          if (result.autoApplied && result.type) {
            await filesCollection.updateOne(
              { _id: new ObjectId(result.documentId) },
              {
                $set: {
                  document_type: result.type,
                  document_type_auto: true,
                  document_type_confidence: result.confidence,
                  document_type_updated_at: new Date()
                }
              }
            );
            appliedCount++;
          }
        }
      }

      res.json({
        success: true,
        data: {
          total: documents.length,
          classified: results.filter(r => r.type || r.suggestedType).length,
          applied: appliedCount,
          results
        }
      });
    } catch (error) {
      console.error('문서 일괄 분류 오류:', error);
      backendLogger.error('DocumentTypes', '문서 일괄 분류 오류', error);
      res.status(500).json({ success: false, message: '서버 오류가 발생했습니다' });
    }
  });

  return router;
};
