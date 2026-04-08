/**
 * Regression 테스트: body-parser limit 50MB 설정 (#43)
 *
 * 이전: express.json() 기본 100KB → 대용량 OCR 텍스트 "request entity too large" 에러
 * 수정: express.json({ limit: '50mb' }) 설정
 */

const fs = require('fs');
const path = require('path');

describe('Body Parser Limit 설정 (#43)', () => {
  const serverPath = path.join(__dirname, '../../server.js');
  let serverContent;

  beforeAll(() => {
    serverContent = fs.readFileSync(serverPath, 'utf-8');
  });

  test('express.json()에 limit이 설정되어야 함', () => {
    expect(serverContent).toContain("limit: '50mb'");
  });

  test('express.urlencoded()에도 limit이 설정되어야 함', () => {
    const urlEncodedMatch = serverContent.match(/express\.urlencoded\(\{[^}]*limit[^}]*\}/);
    expect(urlEncodedMatch).not.toBeNull();
  });

  test('limit이 100KB 기본값이 아니어야 함', () => {
    // express.json()에 limit 없이 호출하면 안 됨
    const noLimitJson = /express\.json\(\{\s*charset/;
    expect(serverContent).not.toMatch(noLimitJson);
  });
});
