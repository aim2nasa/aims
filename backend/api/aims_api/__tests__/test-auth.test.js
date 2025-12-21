/**
 * 테스트 인증 미들웨어 검증
 *
 * ALLOW_TEST_AUTH=true 환경에서 x-user-id 헤더만으로 인증 가능 확인
 */

const fs = require('fs');
const path = require('path');

describe('테스트 인증 지원', () => {
  const authCode = fs.readFileSync(
    path.join(__dirname, '../middleware/auth.js'),
    'utf-8'
  );

  describe('x-user-id 헤더 인증', () => {
    it('x-user-id 헤더를 읽어야 함', () => {
      expect(authCode).toContain("req.headers['x-user-id']");
    });

    it('NODE_ENV=test에서 x-user-id 인증 허용', () => {
      expect(authCode).toContain("process.env.NODE_ENV === 'test'");
    });

    it('ALLOW_TEST_AUTH=true에서 x-user-id 인증 허용', () => {
      expect(authCode).toContain("process.env.ALLOW_TEST_AUTH === 'true'");
    });

    it('테스트 인증 시 req.user 설정', () => {
      expect(authCode).toContain("req.user = { id: testUserId");
    });

    it('테스트 인증 로그 출력', () => {
      expect(authCode).toContain("[TEST AUTH] x-user-id 인증");
    });
  });

  describe('보안 조건', () => {
    it('JWT 토큰이 없을 때만 테스트 인증 사용', () => {
      // !authHeader 조건 확인
      expect(authCode).toContain('!authHeader && testUserId');
    });

    it('테스트 환경에서만 활성화', () => {
      // NODE_ENV=test 또는 ALLOW_TEST_AUTH=true 조건
      const conditionMatch = authCode.match(
        /!authHeader && testUserId && \(process\.env\.NODE_ENV === 'test' \|\| process\.env\.ALLOW_TEST_AUTH === 'true'\)/
      );
      expect(conditionMatch).not.toBeNull();
    });
  });
});
