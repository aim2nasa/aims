/**
 * 인증 관련 라우트
 */

const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateToken, authenticateJWT } = require('../middleware/auth');
const activityLogger = require('../lib/activityLogger');
const backendLogger = require('../lib/backendLogger');

// PIN 설정 상수
const PIN_LENGTH = 4;
const PIN_MAX_FAIL = 5;
const PIN_SALT_ROUNDS = 10;
const SESSION_TOKEN_TTL_MS = 60 * 60 * 1000; // 1시간

// 취약 PIN 차단 목록
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '2345', '3456', '4567', '5678', '6789', '0123',
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  '1004', '1212', '0101', '1122', '2580',
]);

// userId 기반 rate limit (메모리 기반, 서버 재시작 시 초기화)
const pinRateLimit = new Map(); // userId -> { count, resetAt }
function checkPinRateLimit(userId) {
  const now = Date.now();
  const entry = pinRateLimit.get(userId);
  if (!entry || now > entry.resetAt) {
    pinRateLimit.set(userId, { count: 1, resetAt: now + 5 * 60 * 1000 }); // 5분
    return true;
  }
  if (entry.count >= 10) return false; // 5분간 10회 제한
  entry.count++;
  return true;
}

// 카카오 동의항목 scope (닉네임 + 프로필 사진 + 이메일 필수)
const KAKAO_SCOPE = ['profile_nickname', 'profile_image', 'account_email'];

// 허용된 리다이렉트 도메인 목록 (보안)
// - 정확한 문자열 일치만 허용 (Open Redirect 방지)
// - 모바일 딥링크는 고정 경로만 허용
const ALLOWED_REDIRECT_ORIGINS = [
  'https://aims.giize.com',
  'https://admin.aims.giize.com',
  // HTTP 개발 서버
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5173',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:5178',
  'http://127.0.0.1:5173',
  // HTTPS 개발 서버 (HTTP/2 지원)
  'https://localhost:5177',
  'https://localhost:5178',
  'https://localhost:5173',
  'https://127.0.0.1:5177',
  'https://127.0.0.1:5178',
  'https://127.0.0.1:5173',
  // 모바일 앱 딥링크 (고정 경로만 허용)
  'aims-mobile://callback'
];

/**
 * 리다이렉트 URL 검증 (보안)
 * @param {string} url - 검증할 URL
 * @returns {boolean} 허용 여부
 */
function isAllowedRedirect(url) {
  if (!url || typeof url !== 'string') return false;

  // 정확히 일치하는 경우
  if (ALLOWED_REDIRECT_ORIGINS.includes(url)) return true;

  // URL 파싱으로 추가 검증 (호스트명 기반)
  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isAllowedPort = ['5177', '5178', '5173'].includes(parsed.port);

    // HTTPS 검증
    if (parsed.protocol === 'https:') {
      // 프로덕션 도메인
      if (['aims.giize.com', 'admin.aims.giize.com'].includes(parsed.hostname)) {
        return true;
      }
      // 로컬 개발 환경 (HTTPS localhost - HTTP/2 지원)
      return isLocalhost && isAllowedPort;
    }

    // HTTP 로컬 개발 환경
    if (parsed.protocol === 'http:') {
      return isLocalhost && isAllowedPort;
    }
  } catch {
    // URL 파싱 실패 (커스텀 스킴 등) - 정확 일치만 허용
    return false;
  }

  return false;
}

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
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
      // state에 redirect origin 인코딩하여 전달
      return passport.authenticate('kakao', {
        session: false,
        scope: KAKAO_SCOPE,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('kakao', { session: false, scope: KAKAO_SCOPE })(req, res, next);
  });

  /**
   * GET /api/auth/kakao/switch
   * 카카오 로그인 (다른 계정으로 로그인 - 매번 로그인 화면 표시)
   * ?redirect=origin 파라미터로 리다이렉트 대상 지정 가능
   */
  router.get('/kakao/switch', (req, res, next) => {
    // redirect origin 저장 (state 파라미터로 전달)
    const redirectOrigin = req.query.redirect;
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
      return passport.authenticate('kakao-switch', {
        session: false,
        scope: KAKAO_SCOPE,
        state: Buffer.from(redirectOrigin).toString('base64')
      })(req, res, next);
    }
    passport.authenticate('kakao-switch', { session: false, scope: KAKAO_SCOPE })(req, res, next);
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
            if (isAllowedRedirect(decodedOrigin)) {
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
        // 모바일 딥링크인 경우 바로 토큰 전달
        if (frontendUrl.startsWith('aims-mobile://')) {
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
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
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
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
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
            if (isAllowedRedirect(decodedOrigin)) {
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
        // 모바일 딥링크인 경우 바로 토큰 전달
        if (frontendUrl.startsWith('aims-mobile://')) {
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
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
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
    if (redirectOrigin && isAllowedRedirect(redirectOrigin)) {
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
            if (isAllowedRedirect(decodedOrigin)) {
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
        // 모바일 딥링크인 경우 바로 토큰 전달
        if (frontendUrl.startsWith('aims-mobile://')) {
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
   * CASCADE DELETE: 사용자 삭제 시 관련 데이터 모두 삭제
   */
  router.delete('/account', authenticateJWT, async (req, res) => {
    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');
      const customersCollection = db.collection('customers');
      const filesCollection = db.collection('files');
      const relationshipsCollection = db.collection('customer_relationships');

      // ObjectId 형식이면 ObjectId로 변환, 아니면 문자열 그대로 사용 (dev-user 등)
      let userId;
      let userIdStr;
      try {
        userId = ObjectId.isValid(req.user.id) && req.user.id.length === 24
          ? new ObjectId(req.user.id)
          : req.user.id;
        userIdStr = req.user.id;
      } catch {
        userId = req.user.id;
        userIdStr = req.user.id;
      }

      // 1. 해당 사용자의 고객 ID 목록 조회
      const customerIds = await customersCollection
        .find({ 'meta.created_by': userIdStr })
        .project({ _id: 1 })
        .toArray()
        .then(docs => docs.map(d => d._id));

      console.log(`[Auth] Found ${customerIds.length} customers to delete for user ${userIdStr}`);

      if (customerIds.length > 0) {
        // 2. 해당 고객들의 관계 삭제
        const relDeleteResult = await relationshipsCollection.deleteMany({
          $or: [
            { from_customer: { $in: customerIds } },
            { related_customer: { $in: customerIds } }
          ]
        });
        console.log(`[Auth] Deleted ${relDeleteResult.deletedCount} relationships`);

        // 3. 해당 고객들의 파일 삭제
        const filesDeleteResult = await filesCollection.deleteMany({
          customerId: { $in: customerIds }
        });
        console.log(`[Auth] Deleted ${filesDeleteResult.deletedCount} files`);

        // 4. 고객 삭제
        const customersDeleteResult = await customersCollection.deleteMany({
          'meta.created_by': userIdStr
        });
        console.log(`[Auth] Deleted ${customersDeleteResult.deletedCount} customers`);
      }

      // 5. 사용자 삭제
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
        message: 'Account deleted successfully',
        deletedData: {
          customers: customerIds.length,
          user: 1
        }
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
    // 보안: 프로덕션 환경에서 비활성화 (비밀번호 인증 구현 전까지)
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    try {
      const { ObjectId } = require('mongodb');
      const usersCollection = db.collection('users');
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
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
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

  // ========== Phase 3: PIN 간편 비밀번호 API ==========

  /**
   * POST /api/auth/set-pin — PIN 설정
   * 설계서 4.1절: bcrypt 해시로 서버 저장
   */
  router.post('/set-pin', authenticateJWT, async (req, res) => {
    try {
      const pin = (req.body.pin || '').trim();
      const userId = req.user.id;

      if (!pin || pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
        return res.status(400).json({ success: false, message: `${PIN_LENGTH}자리 숫자를 입력해주세요` });
      }

      if (WEAK_PINS.has(pin)) {
        return res.status(400).json({ success: false, message: '너무 쉬운 비밀번호입니다. 다른 숫자를 입력해주세요' });
      }

      const usersCollection = db.collection('users');
      const { ObjectId } = require('mongodb');
      const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { pinHash, pinFailCount: 0, pinLockedAt: null } }
      );

      backendLogger.info('Auth', `PIN 설정 완료: ${userId}`);
      res.json({ success: true });
    } catch (error) {
      backendLogger.error('Auth', 'PIN 설정 오류', error);
      res.status(500).json({ success: false, message: 'PIN 설정에 실패했습니다' });
    }
  });

  /**
   * POST /api/auth/verify-pin — PIN 검증
   * 설계서 4.1절: Authorization 헤더에서 userId 추출 (body에서 받지 않음)
   * 성공 시 세션 토큰 발급 (1시간 TTL)
   */
  router.post('/verify-pin', authenticateJWT, async (req, res) => {
    try {
      const pin = (req.body.pin || '').trim();
      const userId = req.user.id;

      if (!pin || !/^\d+$/.test(pin)) {
        return res.status(400).json({ success: false, message: '숫자를 입력해주세요' });
      }

      // Rate limit 체크
      if (!checkPinRateLimit(userId)) {
        return res.status(429).json({ success: false, message: '너무 많은 시도입니다. 잠시 후 다시 시도해주세요' });
      }

      const usersCollection = db.collection('users');
      const { ObjectId } = require('mongodb');
      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

      if (!user || !user.pinHash) {
        return res.status(400).json({ success: false, message: 'PIN이 설정되지 않았습니다' });
      }

      // 잠금 확인
      if (user.pinFailCount >= PIN_MAX_FAIL) {
        return res.status(423).json({ success: false, message: '비밀번호를 여러 번 틀렸습니다. 소셜 로그인으로 다시 확인해주세요', locked: true });
      }

      const isValid = await bcrypt.compare(pin, user.pinHash);

      if (!isValid) {
        const newFailCount = (user.pinFailCount || 0) + 1;
        const updateFields = { pinFailCount: newFailCount };
        if (newFailCount >= PIN_MAX_FAIL) {
          updateFields.pinLockedAt = new Date();
        }
        await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: updateFields }
        );

        backendLogger.warn('Auth', `PIN 검증 실패: ${userId}, failCount: ${newFailCount}`);

        const remaining = PIN_MAX_FAIL - newFailCount;
        if (remaining <= 0) {
          return res.status(423).json({ success: false, message: '비밀번호를 여러 번 틀렸습니다. 소셜 로그인으로 다시 확인해주세요', locked: true });
        }
        return res.status(401).json({ success: false, message: `비밀번호가 올바르지 않습니다 (${newFailCount}/${PIN_MAX_FAIL})`, failCount: newFailCount, remaining });
      }

      // 성공: 실패 카운트 초기화 + 세션 토큰 발급
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionsCollection = db.collection('pin_sessions');
      await sessionsCollection.insertOne({
        sessionToken,
        userId: new ObjectId(userId),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TOKEN_TTL_MS),
      });

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { pinFailCount: 0, pinLockedAt: null } }
      );

      backendLogger.info('Auth', `PIN 검증 성공: ${userId}`);
      res.json({ success: true, sessionToken });
    } catch (error) {
      backendLogger.error('Auth', 'PIN 검증 오류', error);
      res.status(500).json({ success: false, message: 'PIN 검증에 실패했습니다' });
    }
  });

  /**
   * POST /api/auth/reset-pin — PIN 재설정 (소셜 로그인 인증 후)
   */
  router.post('/reset-pin', authenticateJWT, async (req, res) => {
    try {
      const newPin = (req.body.newPin || '').trim();
      const userId = req.user.id;

      if (!newPin || newPin.length !== PIN_LENGTH || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ success: false, message: `${PIN_LENGTH}자리 숫자를 입력해주세요` });
      }

      if (WEAK_PINS.has(newPin)) {
        return res.status(400).json({ success: false, message: '너무 쉬운 비밀번호입니다. 다른 숫자를 입력해주세요' });
      }

      const usersCollection = db.collection('users');
      const { ObjectId } = require('mongodb');
      const pinHash = await bcrypt.hash(newPin, PIN_SALT_ROUNDS);

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { pinHash, pinFailCount: 0, pinLockedAt: null } }
      );

      backendLogger.info('Auth', `PIN 재설정 완료: ${userId}`);
      res.json({ success: true });
    } catch (error) {
      backendLogger.error('Auth', 'PIN 재설정 오류', error);
      res.status(500).json({ success: false, message: 'PIN 재설정에 실패했습니다' });
    }
  });

  /**
   * DELETE /api/auth/pin — PIN 삭제 + 기기 기억 해제
   */
  router.delete('/pin', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const usersCollection = db.collection('users');
      const { ObjectId } = require('mongodb');

      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $unset: { pinHash: '', pinFailCount: '', pinLockedAt: '' } }
      );

      // 해당 사용자의 모든 세션 토큰 삭제
      const sessionsCollection = db.collection('pin_sessions');
      await sessionsCollection.deleteMany({ userId: new ObjectId(userId) });

      backendLogger.info('Auth', `PIN 삭제 완료: ${userId}`);
      res.json({ success: true });
    } catch (error) {
      backendLogger.error('Auth', 'PIN 삭제 오류', error);
      res.status(500).json({ success: false, message: 'PIN 삭제에 실패했습니다' });
    }
  });

  /**
   * POST /api/auth/verify-session — 세션 토큰 유효성 검증
   * GET → POST 변경: sessionToken을 query string 대신 body로 전달 (서버 로그 노출 방지)
   */
  router.post('/verify-session', authenticateJWT, async (req, res) => {
    try {
      const sessionToken = req.body.sessionToken;
      if (!sessionToken) {
        return res.status(400).json({ valid: false, message: '세션 토큰이 필요합니다' });
      }

      const sessionsCollection = db.collection('pin_sessions');
      const session = await sessionsCollection.findOne({
        sessionToken,
        expiresAt: { $gt: new Date() },
      });

      res.json({ valid: !!session });
    } catch (error) {
      backendLogger.error('Auth', '세션 검증 오류', error);
      res.status(500).json({ valid: false, message: '세션 검증에 실패했습니다' });
    }
  });

  /**
   * GET /api/auth/pin-status — PIN 설정 여부 확인
   */
  router.get('/pin-status', authenticateJWT, async (req, res) => {
    try {
      const userId = req.user.id;
      const usersCollection = db.collection('users');
      const { ObjectId } = require('mongodb');
      const user = await usersCollection.findOne(
        { _id: new ObjectId(userId) },
        { projection: { pinHash: 1, pinFailCount: 1, pinLockedAt: 1 } }
      );

      res.json({
        success: true,
        hasPin: !!(user && user.pinHash),
        locked: !!(user && user.pinFailCount >= PIN_MAX_FAIL),
      });
    } catch (error) {
      backendLogger.error('Auth', 'PIN 상태 조회 오류', error);
      res.status(500).json({ success: false, message: 'PIN 상태 조회에 실패했습니다' });
    }
  });

  // pin_sessions 컬렉션 TTL 인덱스 생성 (만료된 세션 자동 삭제)
  (async () => {
    try {
      const sessionsCollection = db.collection('pin_sessions');
      await sessionsCollection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true }
      );
    } catch { /* 인덱스 이미 존재하면 무시 */ }
  })();

  return router;
};
