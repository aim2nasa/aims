/**
 * Passport.js 설정 - 카카오/네이버/구글 OAuth 전략
 */

const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;
const NaverStrategy = require('passport-naver-v2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const backendLogger = require('../lib/backendLogger');
const { DEFAULT_TIER } = require('../lib/storageQuotaService');

module.exports = function(db) {
  const usersCollection = db.collection('users');

  // KAKAO_CLIENT_ID가 없으면 테스트용 placeholder 사용
  const kakaoClientId = process.env.KAKAO_CLIENT_ID || 'test_client_id';
  if (kakaoClientId === 'your_kakao_rest_api_key_here' || kakaoClientId === 'test_client_id') {
    console.warn('⚠️  KAKAO_CLIENT_ID가 실제 값이 아닙니다. 테스트 모드로 작동합니다.');
  }

  // 공통 카카오 인증 콜백
  const kakaoVerifyCallback = async (accessToken, refreshToken, profile, done) => {
    try {
      const kakaoId = profile.id;

      // 디버깅: 카카오에서 받은 전체 프로필 출력
      console.log('[Kakao OAuth] Full profile:', JSON.stringify(profile, null, 2));

      // 카카오에서 제공하는 정보: 닉네임, 이메일, 프로필 사진
      const name = profile._json.properties?.nickname || null;
      const email = profile._json.kakao_account?.email || null;
      const avatarUrl = profile._json.properties?.profile_image || null;

      console.log('[Kakao OAuth] Extracted:', { name, email, avatarUrl });

      // 기존 사용자 찾기
      let user = await usersCollection.findOne({ kakaoId });

      if (user) {
        // 기존 사용자: lastLogin 업데이트 + oauthProfile 갱신 (사용자가 설정한 name, email, avatarUrl은 유지)
        await usersCollection.updateOne(
          { kakaoId },
          {
            $set: {
              lastLogin: new Date(),
              oauthProfile: { name, email, avatarUrl }  // 소셜 로그인 정보는 항상 최신으로 갱신
            }
          }
        );
        user = await usersCollection.findOne({ kakaoId });
      } else {
        // 새 사용자 생성 (소셜 정보는 oauthProfile에 보관, 적용은 별도 처리)
        const newUser = {
          kakaoId,
          naverId: null,
          googleId: null,
          name: null,
          email: null,
          avatarUrl: null,
          oauthProfile: { name, email, avatarUrl },  // 소셜 로그인에서 받아온 정보 보관
          role: 'user',
          authProvider: 'kakao',
          storage: { tier: DEFAULT_TIER, updated_at: new Date() },  // 기본 등급 설정
          hasOcrPermission: true,  // OCR 권한 (기본값: 허용)
          profileCompleted: true,  // 소셜 로그인 정보를 그대로 사용  // 프로필 미완료
          createdAt: new Date(),
          lastLogin: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }

      return done(null, user);
    } catch (error) {
      backendLogger.error('Passport', '카카오 OAuth 인증 오류', error);
      return done(error, null);
    }
  };

  // 커스텀 카카오 전략 (prompt=login: 다른 계정으로 로그인)
  class KakaoStrategyWithPrompt extends KakaoStrategy {
    authorizationParams() {
      return { prompt: 'login' };
    }
  }

  // 기본 전략: 기존 계정으로 빠른 로그인 (prompt 없음)
  passport.use('kakao', new KakaoStrategy({
    clientID: kakaoClientId,
    clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, kakaoVerifyCallback));

  // 다른 계정 전략: 매번 로그인 화면 표시
  passport.use('kakao-switch', new KakaoStrategyWithPrompt({
    clientID: kakaoClientId,
    clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    callbackURL: process.env.KAKAO_CALLBACK_URL
  }, kakaoVerifyCallback));

  // ===== 네이버 OAuth 설정 =====
  const naverClientId = process.env.NAVER_CLIENT_ID || 'test_naver_client_id';
  if (naverClientId === 'your_naver_client_id_here' || naverClientId === 'test_naver_client_id') {
    console.warn('⚠️  NAVER_CLIENT_ID가 실제 값이 아닙니다. 테스트 모드로 작동합니다.');
  }

  // 네이버 인증 콜백
  const naverVerifyCallback = async (accessToken, refreshToken, profile, done) => {
    try {
      const naverId = profile.id;
      // 네이버에서 제공하는 정보: 이름, 이메일, 프로필 사진
      const name = profile.name || profile.nickname || null;
      const email = profile.email || null;
      const avatarUrl = profile.profileImage || null;

      // 기존 사용자 찾기
      let user = await usersCollection.findOne({ naverId });

      if (user) {
        // 기존 사용자: lastLogin 업데이트 + oauthProfile 갱신 (사용자가 설정한 name, email, avatarUrl은 유지)
        await usersCollection.updateOne(
          { naverId },
          {
            $set: {
              lastLogin: new Date(),
              oauthProfile: { name, email, avatarUrl }  // 소셜 로그인 정보는 항상 최신으로 갱신
            }
          }
        );
        user = await usersCollection.findOne({ naverId });
      } else {
        // 새 사용자 생성 (소셜 정보는 oauthProfile에 보관, 적용은 별도 처리)
        const newUser = {
          kakaoId: null,
          naverId,
          googleId: null,
          name: null,
          email: null,
          avatarUrl: null,
          oauthProfile: { name, email, avatarUrl },  // 소셜 로그인에서 받아온 정보 보관
          role: 'user',
          authProvider: 'naver',
          storage: { tier: DEFAULT_TIER, updated_at: new Date() },  // 기본 등급 설정
          hasOcrPermission: true,
          profileCompleted: true,  // 소셜 로그인 정보를 그대로 사용
          createdAt: new Date(),
          lastLogin: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }

      return done(null, user);
    } catch (error) {
      backendLogger.error('Passport', '네이버 OAuth 인증 오류', error);
      return done(error, null);
    }
  };

  // 커스텀 네이버 전략 (auth_type=reprompt: 다른 계정으로 로그인)
  class NaverStrategyWithReprompt extends NaverStrategy {
    authorizationParams() {
      return { auth_type: 'reprompt' };
    }
  }

  // 기본 전략: 기존 계정으로 빠른 로그인
  passport.use('naver', new NaverStrategy({
    clientID: naverClientId,
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, naverVerifyCallback));

  // 다른 계정 전략: 매번 로그인 화면 표시
  passport.use('naver-switch', new NaverStrategyWithReprompt({
    clientID: naverClientId,
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    callbackURL: process.env.NAVER_CALLBACK_URL
  }, naverVerifyCallback));

  // ===== 구글 OAuth 설정 =====
  const googleClientId = process.env.GOOGLE_CLIENT_ID || 'test_google_client_id';
  if (googleClientId === 'your_google_client_id_here' || googleClientId === 'test_google_client_id') {
    console.warn('⚠️  GOOGLE_CLIENT_ID가 실제 값이 아닙니다. 테스트 모드로 작동합니다.');
  }

  // 구글 인증 콜백
  const googleVerifyCallback = async (accessToken, refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      // 구글에서 제공하는 정보: 이름, 이메일, 프로필 사진
      const name = profile.displayName || null;
      const email = profile.emails?.[0]?.value || null;
      const avatarUrl = profile.photos?.[0]?.value || null;

      // 기존 사용자 찾기
      let user = await usersCollection.findOne({ googleId });

      if (user) {
        // 기존 사용자: lastLogin 업데이트 + oauthProfile 갱신 (사용자가 설정한 name, email, avatarUrl은 유지)
        await usersCollection.updateOne(
          { googleId },
          {
            $set: {
              lastLogin: new Date(),
              oauthProfile: { name, email, avatarUrl }  // 소셜 로그인 정보는 항상 최신으로 갱신
            }
          }
        );
        user = await usersCollection.findOne({ googleId });
      } else {
        // 새 사용자 생성 (소셜 정보는 oauthProfile에 보관, 적용은 별도 처리)
        const newUser = {
          kakaoId: null,
          naverId: null,
          googleId,
          name: null,
          email: null,
          avatarUrl: null,
          oauthProfile: { name, email, avatarUrl },  // 소셜 로그인에서 받아온 정보 보관
          role: 'user',
          authProvider: 'google',
          storage: { tier: DEFAULT_TIER, updated_at: new Date() },  // 기본 등급 설정
          hasOcrPermission: true,
          profileCompleted: true,  // 소셜 로그인 정보를 그대로 사용
          createdAt: new Date(),
          lastLogin: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }

      return done(null, user);
    } catch (error) {
      backendLogger.error('Passport', '구글 OAuth 인증 오류', error);
      return done(error, null);
    }
  };

  // 커스텀 구글 전략 (prompt=select_account: 다른 계정으로 로그인)
  class GoogleStrategyWithPrompt extends GoogleStrategy {
    authorizationParams() {
      return { prompt: 'select_account' };
    }
  }

  // 기본 전략: 기존 계정으로 빠른 로그인
  passport.use('google', new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
  }, googleVerifyCallback));

  // 다른 계정 전략: 매번 로그인 화면 표시
  passport.use('google-switch', new GoogleStrategyWithPrompt({
    clientID: googleClientId,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    scope: ['profile', 'email']
  }, googleVerifyCallback));

  // 세션에 사용자 ID 저장
  passport.serializeUser((user, done) => {
    done(null, user._id.toString());
  });

  // 세션에서 사용자 복원
  passport.deserializeUser(async (id, done) => {
    try {
      const { ObjectId } = require('mongodb');
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      done(null, user);
    } catch (error) {
      backendLogger.error('Passport', '세션 사용자 복원 오류', error);
      done(error, null);
    }
  });
};
