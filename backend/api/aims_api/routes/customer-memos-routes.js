/**
 * customer-memos-routes.js - 고객 메모 관리 라우트
 *
 * customers-routes.js에서 분리된 메모 도메인 라우트 (4개)
 * @since 2026-04-04
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { COLLECTIONS } = require('@aims/shared-schema');
const backendLogger = require('../lib/backendLogger');
const { utcNowDate } = require('../lib/timeUtils');

module.exports = function(db, authenticateJWT, authenticateJWTorAPIKey) {
  const router = express.Router();
  const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;
  const CUSTOMER_MEMOS_COLLECTION = 'customer_memos';

  /**
   * 날짜를 YYYY.MM.DD HH:mm 형식으로 변환
   */
  function formatMemoDateTime(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${day} ${h}:${min}`;
  }

  /**
   * customer_memos 컬렉션의 데이터를 customers.memo 필드로 동기화
   * MCP와 aims_api 간 데이터 일관성 유지
   */
  async function syncCustomerMemoField(customerId) {
    try {
      const customerObjectId = new ObjectId(customerId);

      // customer_memos에서 해당 고객의 모든 메모 조회 (시간순)
      const memos = await db.collection(CUSTOMER_MEMOS_COLLECTION)
        .find({ customer_id: customerObjectId })
        .sort({ created_at: 1 })
        .toArray();

      // 타임스탬프 형식으로 변환
      const memoText = memos.map(m =>
        `[${formatMemoDateTime(m.created_at)}] ${m.content}`
      ).join('\n');

      // customers.memo 필드 업데이트
      await db.collection(CUSTOMERS_COLLECTION).updateOne(
        { _id: customerObjectId },
        { $set: { memo: memoText, 'meta.updated_at': new Date() } }
      );

      console.log(`[Memo Sync] 고객 ${customerId}: ${memos.length}개 메모 동기화 완료`);
    } catch (error) {
      console.error(`[Memo Sync] 동기화 실패 (고객 ${customerId}):`, error);
      backendLogger.error('Memos', `메모 동기화 실패 (고객 ${customerId})`, error);
    }
  }

  /**
   * GET /api/customers/:id/memos
   * 고객 메모 목록 조회
   */
  router.get('/customers/:id/memos', authenticateJWTorAPIKey, async (req, res) => {
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
      backendLogger.error('Memos', '메모 목록 조회 오류', error);
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
  router.post('/customers/:id/memos', authenticateJWTorAPIKey, async (req, res) => {
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

      // customers.memo 필드 동기화 (MCP 호환)
      await syncCustomerMemoField(id);

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
      backendLogger.error('Memos', '메모 생성 오류', error);
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
  router.put('/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
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

      // customers.memo 필드 동기화 (MCP 호환)
      await syncCustomerMemoField(id);

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
      backendLogger.error('Memos', '메모 수정 오류', error);
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
  router.delete('/customers/:id/memos/:memoId', authenticateJWT, async (req, res) => {
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

      // customers.memo 필드 동기화 (MCP 호환)
      await syncCustomerMemoField(id);

      res.json({
        success: true,
        message: '메모가 삭제되었습니다.'
      });

    } catch (error) {
      console.error('메모 삭제 오류:', error);
      backendLogger.error('Memos', '메모 삭제 오류', error);
      res.status(500).json({
        success: false,
        error: '메모 삭제에 실패했습니다.',
        details: error.message
      });
    }
  });

  return router;
};
