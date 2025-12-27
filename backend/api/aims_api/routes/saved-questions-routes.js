/**
 * saved-questions-routes.js
 * 나만의 질문 저장소 + 자주 쓰는 질문 API
 * @since 2025-12-27
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const backendLogger = require('../lib/backendLogger');

const COLLECTION_NAME = 'saved_questions';
const FREQUENT_COLLECTION = 'frequent_questions';

/**
 * 라우트 설정 함수
 * @param {Db} db - MongoDB docupload 인스턴스
 * @param {Function} authenticateJWT - JWT 인증 미들웨어
 */
module.exports = function(db, authenticateJWT) {

  /**
   * GET /api/saved-questions
   * 사용자의 저장된 질문 목록 조회
   */
  router.get('/saved-questions', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;

      const questions = await db.collection(COLLECTION_NAME)
        .find({ userId: new ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      res.json({
        success: true,
        data: questions
      });
    } catch (error) {
      console.error('[SavedQuestions] 목록 조회 오류:', error);
      backendLogger.error('SavedQuestions', '목록 조회 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
  });

  /**
   * POST /api/saved-questions
   * 새 질문 저장
   */
  router.post('/saved-questions', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({
          success: false,
          message: '질문 내용이 필요합니다'
        });
      }

      const trimmedText = text.trim();

      // 중복 체크
      const existing = await db.collection(COLLECTION_NAME).findOne({
        userId: new ObjectId(userId),
        text: trimmedText
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: '이미 저장된 질문입니다'
        });
      }

      const doc = {
        userId: new ObjectId(userId),
        text: trimmedText,
        createdAt: new Date()
      };

      const result = await db.collection(COLLECTION_NAME).insertOne(doc);

      res.json({
        success: true,
        data: {
          _id: result.insertedId,
          text: trimmedText,
          createdAt: doc.createdAt
        }
      });
    } catch (error) {
      console.error('[SavedQuestions] 저장 오류:', error);
      backendLogger.error('SavedQuestions', '저장 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
  });

  /**
   * DELETE /api/saved-questions/:id
   * 질문 삭제
   */
  router.delete('/saved-questions/:id', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 ID'
        });
      }

      // 자신의 데이터만 삭제 가능
      const result = await db.collection(COLLECTION_NAME).deleteOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId)
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: '질문을 찾을 수 없습니다'
        });
      }

      res.json({
        success: true,
        message: '삭제되었습니다'
      });
    } catch (error) {
      console.error('[SavedQuestions] 삭제 오류:', error);
      backendLogger.error('SavedQuestions', '삭제 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
  });

  // ==================== 자주 쓰는 질문 ====================

  /**
   * GET /api/frequent-questions
   * 자주 사용한 질문 목록 (사용 횟수 순)
   */
  router.get('/frequent-questions', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;

      const questions = await db.collection(FREQUENT_COLLECTION)
        .find({ userId: new ObjectId(userId) })
        .sort({ count: -1, lastUsedAt: -1 })
        .limit(20)
        .toArray();

      res.json({
        success: true,
        data: questions
      });
    } catch (error) {
      console.error('[FrequentQuestions] 목록 조회 오류:', error);
      backendLogger.error('FrequentQuestions', '목록 조회 오류', error);
      res.status(500).json({
        success: false,
        message: '서버 오류'
      });
    }
  });

  /**
   * POST /api/frequent-questions/track
   * 질문 사용 추적 (메시지 전송 시 호출)
   */
  router.post('/frequent-questions/track', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const { text } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({
          success: false,
          message: '질문 내용이 필요합니다'
        });
      }

      const trimmedText = text.trim();

      // upsert: 있으면 count 증가, 없으면 생성
      await db.collection(FREQUENT_COLLECTION).updateOne(
        {
          userId: new ObjectId(userId),
          text: trimmedText
        },
        {
          $inc: { count: 1 },
          $set: { lastUsedAt: new Date() },
          $setOnInsert: {
            userId: new ObjectId(userId),
            text: trimmedText,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );

      res.json({
        success: true
      });
    } catch (error) {
      console.error('[FrequentQuestions] 추적 오류:', error);
      // 추적 실패는 조용히 처리 (사용자 경험에 영향 없음)
      res.json({
        success: true
      });
    }
  });

  return router;
};
