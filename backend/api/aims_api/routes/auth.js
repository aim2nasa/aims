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
   * 설계안: 소셜 ID(kakaoId 등) 노출 금지
   */
  router.get('/me', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');

      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { _id: 1, name: 1, email: 1, avatarUrl: 1, role: 1, authProvider: 1, profileCompleted: 1 } }
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
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
          authProvider: user.authProvider,
          profileCompleted: user.profileCompleted ?? true
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
   * PUT /api/auth/profile
   * 프로필 업데이트 (이름 설정)
   */
  router.put('/profile', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');
      const { name } = req.body;

      // 이름 유효성 검사
      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          success: false,
          message: '이름을 입력해주세요'
        });
      }

      const trimmedName = name.trim();
      if (trimmedName.length < 1 || trimmedName.length > 20) {
        return res.status(400).json({
          success: false,
          message: '이름은 1-20자로 입력해주세요'
        });
      }

      // 프로필 업데이트
      await usersCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        {
          $set: {
            name: trimmedName,
            profileCompleted: true
          }
        }
      );

      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { _id: 1, name: 1, email: 1, avatarUrl: 1, role: 1, authProvider: 1, profileCompleted: 1 } }
      );

      res.json({
        success: true,
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
          authProvider: user.authProvider,
          profileCompleted: user.profileCompleted
        }
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({
        success: false,
        message: '프로필 업데이트에 실패했습니다'
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
   * DELETE /api/auth/account
   * 계정 완전 삭제 (개발/테스트용)
   */
  router.delete('/account', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');
      const userId = new ObjectId(req.user.id);

      // 사용자 삭제
      const result = await usersCollection.deleteOne({ _id: userId });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log(`[Auth] User account deleted: ${req.user.id}`);

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('Account deletion error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account'
      });
    }
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
