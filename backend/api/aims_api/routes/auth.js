/**
 * 인증 관련 라우트
 */

const express = require('express');
const passport = require('passport');
const { generateToken, authenticateJWT } = require('../middleware/auth');

module.exports = function(db) {
  const router = express.Router();

  /**
   * GET /api/auth/status
   * 인증 시스템 상태 확인
   */
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      message: 'Auth system is ready',
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /api/auth/kakao
   * 카카오 로그인 시작
   */
  router.get('/kakao',
    passport.authenticate('kakao', {
      session: false
    })
  );

  /**
   * GET /api/auth/kakao/callback
   * 카카오 로그인 콜백
   */
  router.get('/kakao/callback',
    passport.authenticate('kakao', {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=kakao_auth_failed`
    }),
    (req, res) => {
      try {
        // JWT 토큰 생성
        const token = generateToken(req.user);

        // 프론트엔드로 리다이렉트 (토큰 포함)
        res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
      } catch (error) {
        console.error('Token generation error:', error);
        res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
      }
    }
  );

  /**
   * GET /api/auth/me
   * 현재 로그인한 사용자 정보 조회
   */
  router.get('/me', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');

      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { _id: 1, kakaoId: 1, name: 1, email: 1, avatarUrl: 1, role: 1 } }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          kakaoId: user.kakaoId,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user information'
      });
    }
  });

  /**
   * POST /api/auth/logout
   * 로그아웃 (클라이언트에서 토큰 삭제)
   */
  router.post('/logout', (req, res) => {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  /**
   * POST /api/auth/refresh
   * JWT 토큰 갱신
   */
  router.post('/refresh', authenticateJWT, (req, res) => {
    try {
      const jwt = require('jsonwebtoken');

      // req.user는 이미 decoded JWT payload { id, kakaoId, email, name, role, exp, iat }
      // exp와 iat를 제거하고 새로 토큰 생성
      const { exp, iat, ...payload } = req.user;
      const newToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      });

      res.json({
        success: true,
        token: newToken
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh token'
      });
    }
  });

  return router;
};
