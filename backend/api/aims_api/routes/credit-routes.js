/**
 * credit-routes.js - 크레딧 내부 API 라우트
 *
 * 크레딧 체크, credit_pending 문서 조회 등
 * document_pipeline, aims_rag_api 등 내부 서비스에서 호출하는 엔드포인트.
 *
 * R2: chat-routes.js에서 분리 (물리적 서비스 분리 대비)
 * @since 2026-04-04
 */

const express = require('express');
const { COLLECTIONS } = require('@aims/shared-schema');

module.exports = function(db, creditPolicy) {
  const router = express.Router();

  // 내부 API 키 검증
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
  function verifyInternalApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !INTERNAL_API_KEY || apiKey !== INTERNAL_API_KEY) {
      return res.status(401).json({ success: false, error: '인증 실패' });
    }
    next();
  }

  // ============================================================
  // POST /api/internal/check-credit
  // ============================================================
  /**
   * 문서 처리 전 크레딧 체크 (내부 API)
   * @route POST /api/internal/check-credit
   * @description document_pipeline, aims_rag_api에서 호출
   * @see docs/EMBEDDING_CREDIT_POLICY.md
   */
  router.post('/internal/check-credit', verifyInternalApiKey, async (req, res) => {
    try {
      const { user_id, estimated_pages = 1 } = req.body;

      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'user_id가 필요합니다.'
        });
      }

      const creditCheck = await creditPolicy.checkForDocumentProcessing(
        user_id,
        estimated_pages
      );

      console.log(`[CreditCheck] userId=${user_id}, pages=${estimated_pages}, allowed=${creditCheck.allowed}, reason=${creditCheck.reason}`);

      res.json({
        success: true,
        ...creditCheck
      });
    } catch (error) {
      console.error('[CreditCheck] 오류:', error);
      // fail-open: 에러 시에도 허용
      res.json({
        success: true,
        allowed: true,
        reason: 'error_fallback',
        error: error.message
      });
    }
  });

  // ============================================================
  // GET /api/internal/credit-pending-documents
  // ============================================================
  /**
   * credit_pending 문서 목록 조회 (내부 API)
   * @route GET /api/internal/credit-pending-documents
   */
  router.get('/internal/credit-pending-documents', verifyInternalApiKey, async (req, res) => {
    try {
      const { user_id } = req.query;

      const filter = { overallStatus: 'credit_pending' };
      if (user_id) {
        filter.ownerId = user_id;
      }

      const pendingDocs = await db.collection(COLLECTIONS.FILES).find(filter).toArray();

      res.json({
        success: true,
        count: pendingDocs.length,
        documents: pendingDocs.map(doc => ({
          _id: doc._id.toString(),
          ownerId: doc.ownerId,
          originalName: doc.upload?.originalName,
          createdAt: doc.createdAt,
          credit_pending_since: doc.credit_pending_since
        }))
      });
    } catch (error) {
      console.error('[CreditPending] 조회 오류:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
