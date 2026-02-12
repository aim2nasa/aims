/**
 * ac-routes.js - AutoClicker 라우트
 *
 * Phase 1: AIMS 웹 → URI Scheme → AC 토큰 인증
 * Phase 2: AC 버전 체크 + 인스톨러 호스팅
 *
 * 엔드포인트:
 *   POST /api/ac/request-token  — 1회용 nonce 발급 (JWT 필수)
 *   POST /api/ac/verify-token   — nonce 검증 (인증 불필요)
 *   GET  /api/ac/latest-version — 최신 AC 버전 정보 (인증 불필요)
 *
 * @since 2026-02-12
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { ObjectId } = require('mongodb');
const backendLogger = require('../lib/backendLogger');

const AC_TOKEN_EXPIRY_SEC = 300; // 5분

module.exports = function(db, authenticateJWT) {
  const router = express.Router();
  const acTokens = db.collection('ac_tokens');

  // 인덱스 생성 (서버 시작 시 1회)
  (async () => {
    try {
      await acTokens.createIndex({ token: 1 }, { unique: true });
      await acTokens.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 });
      await acTokens.createIndex({ userId: 1 });
    } catch (err) {
      // 이미 존재하면 무시
    }
  })();

  /**
   * POST /api/ac/request-token
   * 1회용 nonce 토큰 발급 (AIMS 웹 → 서버)
   *
   * 인증: JWT 필수 (authenticateJWT)
   * 요청 body: (없음 또는 선택적 파라미터)
   * 응답: { success, token, expiresIn }
   */
  router.post('/request-token', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const token = uuidv4();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + AC_TOKEN_EXPIRY_SEC * 1000);

      await acTokens.insertOne({
        token,
        userId: new ObjectId(userId),
        createdAt: now,
        expiresAt,
        used: false,
      });

      backendLogger.info('AC', `토큰 발급: userId=${userId}`);

      res.json({
        success: true,
        token,
        expiresIn: AC_TOKEN_EXPIRY_SEC,
      });
    } catch (error) {
      backendLogger.error('AC', '토큰 발급 실패', error);
      res.status(500).json({
        success: false,
        message: '토큰 발급에 실패했습니다.',
      });
    }
  });

  /**
   * POST /api/ac/verify-token
   * 1회용 nonce 토큰 검증 (AC → 서버)
   *
   * 인증: 불필요 (토큰 자체가 인증 수단)
   * 요청 body: { token }
   * 응답: { success, user: { id, name } }
   */
  router.post('/verify-token', async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'token 파라미터가 필요합니다.',
        });
      }

      // 토큰 조회 + 사용 완료 처리 (atomic)
      const tokenDoc = await acTokens.findOneAndUpdate(
        {
          token,
          used: false,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: { used: true, usedAt: new Date() },
        },
        { returnDocument: 'before' }
      );

      if (!tokenDoc) {
        // 토큰이 없거나 이미 사용됨 또는 만료
        return res.status(401).json({
          success: false,
          message: '유효하지 않거나 만료된 토큰입니다.',
        });
      }

      // 사용자 정보 조회
      const user = await db.collection('users').findOne(
        { _id: tokenDoc.userId },
        { projection: { _id: 1, name: 1, role: 1 } }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      backendLogger.info('AC', `토큰 검증 성공: userId=${user._id}, name=${user.name}`);

      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      backendLogger.error('AC', '토큰 검증 실패', error);
      res.status(500).json({
        success: false,
        message: '토큰 검증에 실패했습니다.',
      });
    }
  });

  /**
   * GET /api/ac/latest-version
   * AC 최신 버전 정보 조회 (Phase 2 자동 업데이트)
   *
   * 인증: 불필요 (공개 — 버전 정보만)
   * 응답: { success, latest, installerUrl, releaseNotes }
   */
  router.get('/latest-version', async (req, res) => {
    try {
      const config = await db.collection('config').findOne({ _id: 'ac_latest_version' });

      if (!config) {
        // config 미설정 시 → 업데이트 없음 (현재 버전이 최신)
        return res.json({
          success: true,
          latest: '0.0.0',
          installerUrl: '',
          releaseNotes: '',
        });
      }

      res.json({
        success: true,
        latest: config.latest,
        installerUrl: config.installerUrl || '',
        releaseNotes: config.releaseNotes || '',
      });
    } catch (error) {
      backendLogger.error('AC', '버전 조회 실패', error);
      res.status(500).json({
        success: false,
        message: '버전 정보를 조회할 수 없습니다.',
      });
    }
  });

  return router;
};
