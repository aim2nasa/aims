/**
 * Passport.js 설정 - 카카오 OAuth 전략
 */

const passport = require('passport');
const KakaoStrategy = require('passport-kakao').Strategy;

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
      const email = profile._json.kakao_account?.email || null;
      const avatarUrl = profile._json.properties?.profile_image || null;

      // 기존 사용자 찾기
      let user = await usersCollection.findOne({ kakaoId });

      if (user) {
        // 기존 사용자: lastLogin만 업데이트 (avatarUrl은 사용자가 직접 설정한 것 유지)
        await usersCollection.updateOne(
          { kakaoId },
          {
            $set: {
              lastLogin: new Date()
            }
          }
        );
        user = await usersCollection.findOne({ kakaoId });
      } else {
        // 새 사용자 생성 (설계안 준수)
        const newUser = {
          kakaoId,
          naverId: null,
          googleId: null,
          name: null,  // 프로필 설정에서 입력
          email,
          avatarUrl,
          role: 'user',
          authProvider: 'kakao',
          hasOcrPermission: false,  // 🆕 OCR 권한 (기본값: 불가)
          profileCompleted: false,  // 프로필 미완료
          createdAt: new Date(),
          lastLogin: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      }

      return done(null, user);
    } catch (error) {
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
      done(error, null);
    }
  });
};
