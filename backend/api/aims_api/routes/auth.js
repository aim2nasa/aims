/**
 * 인증 관련 라우트
 */

const express = require('express');
const passport = require('passport');
const { generateToken, authenticateJWT } = require('../middleware/auth');
const activityLogger = require('../lib/activityLogger');
const backendLogger = require('../lib/backendLogger');

// 허용된 리다이렉트 도메인 목록 (보안)
const ALLOWED_REDIRECT_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5173',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:5178',
  'http://127.0.0.1:5173',
  // 모바일 앱 딥링크
  'aims-mobile://'
];

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
   * 카카오 로그인 시작 (기존 계정으로 빠른 로그인)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/kakao', (req, res, next) => {
    // redirect origin 저장 (state 파라미터로 전달)
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      // state에 redirect origin 인코딩하여 전달
      return passport.authenticate('kakao', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('kakao', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/kakao/switch
   * 카카오 로그인 (다른 계정으로 로그인 - 매번 로그인 화면 표시)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/kakao/switch', (req, res, next) => {
    // redirect origin 저장 (state 파라미터로 전달)
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      return passport.authenticate('kakao-switch', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('kakao-switch', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/kakao/callback
   * 카카오 로그인 콜백 (kakao, kakao-switch 공통)
   * state 파라미터에서 redirect origin 추출하여 동적 리다이렉트
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

        // state에서 redirect origin 추출
        let frontendUrl = process.env.FRONTEND_URL;
        if (req.query.state) {
          try {
            const decodedOrigin = Buffer.from(req.query.state, 'base64').toString('utf-8');
            // 허용된 도메인인지 검증
            if (ALLOWED_REDIRECT_ORIGINS.includes(decodedOrigin)) {
              frontendUrl = decodedOrigin;
              console.log(`[Auth] Dynamic redirect to: ${frontendUrl}`);
            }
          } catch (e) {
            console.error('[Auth] Failed to decode state:', e);
          }
        }

        // 로그인 성공 로그
        activityLogger.log({
          actor: {
            user_id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '카카오 로그인'
          },
          result: {
            success: true,
            statusCode: 302
          },
          meta: {
            endpoint: '/api/auth/kakao/callback',
            method: 'GET'
          }
        });

        // 프론트엔드로 리다이렉트 (토큰 포함)
        // 모바일 딥링크인 경우 /login 없이 바로 토큰 전달
        if (frontendUrl.endsWith('://')) {
          res.redirect(`${frontendUrl}?token=${token}`);
        } else {
          res.redirect(`${frontendUrl}/login?token=${token}`);
        }
      } catch (error) {
        console.error('Token generation error:', error);
        backendLogger.error('Auth', '카카오 로그인 토큰 생성 오류', error);

        // 로그인 실패 로그
        activityLogger.log({
          actor: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '카카오 로그인 실패'
          },
          result: {
            success: false,
            statusCode: 500,
            error: { message: error.message }
          },
          meta: {
            endpoint: '/api/auth/kakao/callback',
            method: 'GET'
          }
        });

        res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
      }
    }
  );

  // ===== 네이버 OAuth 라우트 =====

  /**
   * GET /api/auth/naver
   * 네이버 로그인 시작 (기존 계정으로 빠른 로그인)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/naver', (req, res, next) => {
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      return passport.authenticate('naver', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('naver', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/naver/switch
   * 네이버 로그인 (다른 계정으로 로그인 - 매번 로그인 화면 표시)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/naver/switch', (req, res, next) => {
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      return passport.authenticate('naver-switch', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('naver-switch', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/naver/callback
   * 네이버 로그인 콜백 (naver, naver-switch 공통)
   * state 파라미터에서 redirect origin 추출하여 동적 리다이렉트
   */
  router.get('/naver/callback',
    passport.authenticate('naver', {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=naver_auth_failed`
    }),
    (req, res) => {
      try {
        // JWT 토큰 생성
        const token = generateToken(req.user);

        // state에서 redirect origin 추출
        let frontendUrl = process.env.FRONTEND_URL;
        if (req.query.state) {
          try {
            const decodedOrigin = Buffer.from(req.query.state, 'base64').toString('utf-8');
            if (ALLOWED_REDIRECT_ORIGINS.includes(decodedOrigin)) {
              frontendUrl = decodedOrigin;
              console.log(`[Auth] Dynamic redirect to: ${frontendUrl}`);
            }
          } catch (e) {
            console.error('[Auth] Failed to decode state:', e);
          }
        }

        // 로그인 성공 로그
        activityLogger.log({
          actor: {
            user_id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '네이버 로그인'
          },
          result: {
            success: true,
            statusCode: 302
          },
          meta: {
            endpoint: '/api/auth/naver/callback',
            method: 'GET'
          }
        });

        // 프론트엔드로 리다이렉트 (토큰 포함)
        // 모바일 딥링크인 경우 /login 없이 바로 토큰 전달
        if (frontendUrl.endsWith('://')) {
          res.redirect(`${frontendUrl}?token=${token}`);
        } else {
          res.redirect(`${frontendUrl}/login?token=${token}`);
        }
      } catch (error) {
        console.error('Token generation error:', error);
        backendLogger.error('Auth', '네이버 로그인 토큰 생성 오류', error);

        activityLogger.log({
          actor: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '네이버 로그인 실패'
          },
          result: {
            success: false,
            statusCode: 500,
            error: { message: error.message }
          },
          meta: {
            endpoint: '/api/auth/naver/callback',
            method: 'GET'
          }
        });

        res.redirect(`${process.env.FRONTEND_URL}/login?error=token_generation_failed`);
      }
    }
  );

  // ===== 구글 OAuth 라우트 =====

  /**
   * GET /api/auth/google
   * 구글 로그인 시작 (기존 계정으로 빠른 로그인)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/google', (req, res, next) => {
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      return passport.authenticate('google', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('google', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/google/switch
   * 구글 로그인 (다른 계정으로 로그인 - 매번 로그인 화면 표시)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/google/switch', (req, res, next) => {
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
      return passport.authenticate('google-switch', {
        session: false,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('google-switch', { session: false })(req, res, next);
  });

  /**
   * GET /api/auth/google/callback
   * 구글 로그인 콜백 (google, google-switch 공통)
   * state 파라미터에서 redirect origin 추출하여 동적 리다이렉트
   */
  router.get('/google/callback',
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`
    }),
    (req, res) => {
      try {
        // JWT 토큰 생성
        const token = generateToken(req.user);

        // state에서 redirect origin 추출
        let frontendUrl = process.env.FRONTEND_URL;
        if (req.query.state) {
          try {
            const decodedOrigin = Buffer.from(req.query.state, 'base64').toString('utf-8');
            if (ALLOWED_REDIRECT_ORIGINS.includes(decodedOrigin)) {
              frontendUrl = decodedOrigin;
              console.log(`[Auth] Dynamic redirect to: ${frontendUrl}`);
            }
          } catch (e) {
            console.error('[Auth] Failed to decode state:', e);
          }
        }

        // 로그인 성공 로그
        activityLogger.log({
          actor: {
            user_id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '구글 로그인'
          },
          result: {
            success: true,
            statusCode: 302
          },
          meta: {
            endpoint: '/api/auth/google/callback',
            method: 'GET'
          }
        });

        // 프론트엔드로 리다이렉트 (토큰 포함)
        // 모바일 딥링크인 경우 /login 없이 바로 토큰 전달
        if (frontendUrl.endsWith('://')) {
          res.redirect(`${frontendUrl}?token=${token}`);
        } else {
          res.redirect(`${frontendUrl}/login?token=${token}`);
        }
      } catch (error) {
        console.error('Token generation error:', error);
        backendLogger.error('Auth', '구글 로그인 토큰 생성 오류', error);

        activityLogger.log({
          actor: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
          },
          action: {
            type: 'login',
            category: 'auth',
            description: '구글 로그인 실패'
          },
          result: {
            success: false,
            statusCode: 500,
            error: { message: error.message }
          },
          meta: {
            endpoint: '/api/auth/google/callback',
            method: 'GET'
          }
        });

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
        { projection: { _id: 1, name: 1, email: 1, phone: 1, department: 1, position: 1, avatarUrl: 1, role: 1, authProvider: 1, profileCompleted: 1, hasOcrPermission: 1, oauthProfile: 1 } }
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
          phone: user.phone,
          department: user.department,
          position: user.position,
          avatarUrl: user.avatarUrl,
          role: user.role,
          authProvider: user.authProvider,
          profileCompleted: user.profileCompleted ?? true,
          hasOcrPermission: user.hasOcrPermission || false,
          oauthProfile: user.oauthProfile || null  // 소셜 로그인에서 받아온 초기 프로필 정보
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      backendLogger.error('Auth', '사용자 정보 조회 오류', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user information'
      });
    }
  });

  /**
   * PUT /api/auth/profile
   * 프로필 업데이트 (이름, 이메일, 전화번호, 지점, 직급)
   */
  router.put('/profile', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');
      const { name, email, phone, department, position, avatarUrl } = req.body;

      // 업데이트할 필드 준비
      const updateFields = { profileCompleted: true };

      // 이름 유효성 검사 및 설정
      if (name !== undefined) {
        if (typeof name !== 'string') {
          return res.status(400).json({
            success: false,
            message: '이름 형식이 올바르지 않습니다'
          });
        }
        const trimmedName = name.trim();
        if (trimmedName.length < 1 || trimmedName.length > 20) {
          return res.status(400).json({
            success: false,
            message: '이름은 1-20자로 입력해주세요'
          });
        }
        updateFields.name = trimmedName;
      }

      // 이메일 유효성 검사 및 설정
      if (email !== undefined) {
        if (typeof email !== 'string') {
          return res.status(400).json({
            success: false,
            message: '이메일 형식이 올바르지 않습니다'
          });
        }
        const trimmedEmail = email.trim();
        if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          return res.status(400).json({
            success: false,
            message: '올바른 이메일 형식이 아닙니다'
          });
        }
        updateFields.email = trimmedEmail || null;
      }

      // 전화번호 설정
      if (phone !== undefined) {
        updateFields.phone = typeof phone === 'string' ? phone.trim() || null : null;
      }

      // 지점 설정
      if (department !== undefined) {
        updateFields.department = typeof department === 'string' ? department.trim() || null : null;
      }

      // 직급 설정
      if (position !== undefined) {
        updateFields.position = typeof position === 'string' ? position.trim() || null : null;
      }

      // 아바타 설정 (base64 data URL)
      if (avatarUrl !== undefined) {
        updateFields.avatarUrl = typeof avatarUrl === 'string' ? avatarUrl : null;
      }

      // 프로필 업데이트
      await usersCollection.updateOne(
        { _id: new ObjectId(req.user.id) },
        { $set: updateFields }
      );

      const user = await usersCollection.findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { _id: 1, name: 1, email: 1, phone: 1, department: 1, position: 1, avatarUrl: 1, role: 1, authProvider: 1, profileCompleted: 1, hasOcrPermission: 1 } }
      );

      res.json({
        success: true,
        user: {
          _id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          department: user.department,
          position: user.position,
          avatarUrl: user.avatarUrl,
          role: user.role,
          authProvider: user.authProvider,
          profileCompleted: user.profileCompleted,
          hasOcrPermission: user.hasOcrPermission || false
        }
      });
    } catch (error) {
      console.error('Profile update error:', error);
      backendLogger.error('Auth', '프로필 업데이트 오류', error);
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
    // 토큰에서 사용자 정보 추출 시도 (로깅용)
    let user = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        user = jwt.verify(token, process.env.JWT_SECRET);
      }
    } catch (e) {
      // 토큰 검증 실패해도 로그아웃은 진행
    }

    // 로그아웃 로그
    activityLogger.log({
      actor: {
        user_id: user?.id || null,
        name: user?.name || null,
        email: user?.email || null,
        role: user?.role || null,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      },
      action: {
        type: 'logout',
        category: 'auth',
        description: '로그아웃'
      },
      result: {
        success: true,
        statusCode: 200
      },
      meta: {
        endpoint: '/api/auth/logout',
        method: 'POST'
      }
    });

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

      // ObjectId 형식이면 ObjectId로 변환, 아니면 문자열 그대로 사용 (dev-user 등)
      let userId;
      try {
        userId = ObjectId.isValid(req.user.id) && req.user.id.length === 24
          ? new ObjectId(req.user.id)
          : req.user.id;
      } catch {
        userId = req.user.id;
      }

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
      backendLogger.error('Auth', '계정 삭제 오류', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account'
      });
    }
  });

  /**
   * POST /api/auth/admin-login
   * Admin 직접 로그인 (카카오 없이)
   * 현재는 비밀번호 없이 접근, 추후 비밀번호 인증 추가 예정
   */
  router.post('/admin-login', async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');

      // TODO: 추후 비밀번호 인증 추가
      // const { password } = req.body;

      // 시스템 Admin 계정 조회
      const admin = await usersCollection.findOne({
        role: 'admin',
        authProvider: 'system'  // 카카오가 아닌 시스템 계정
      });

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin 계정이 존재하지 않습니다'
        });
      }

      // JWT 토큰 생성
      const token = generateToken(admin);

      // 마지막 로그인 시간 업데이트
      await usersCollection.updateOne(
        { _id: admin._id },
        { $set: { lastLogin: new Date() } }
      );

      // 로그인 로그
      activityLogger.log({
        actor: {
          user_id: admin._id.toString(),
          name: admin.name,
          email: admin.email,
          role: admin.role,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        },
        action: {
          type: 'login',
          category: 'auth',
          description: 'Admin 직접 로그인'
        },
        result: {
          success: true,
          statusCode: 200
        },
        meta: {
          endpoint: '/api/auth/admin-login',
          method: 'POST'
        }
      });

      res.json({
        success: true,
        token,
        user: {
          _id: admin._id.toString(),
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      backendLogger.error('Auth', 'Admin 로그인 오류', error);
      res.status(500).json({
        success: false,
        message: 'Admin 로그인에 실패했습니다'
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
      backendLogger.error('Auth', '토큰 갱신 오류', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh token'
      });
    }
  });

  return router;
};
