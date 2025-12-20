/**
 * AIMS API 버전 정보
 * VERSION 파일에서 버전을 읽고, 빌드 시 주입된 git hash를 사용합니다.
 * @since 2025-12-20
 */

const fs = require('fs');
const path = require('path');

// VERSION 파일에서 버전 읽기
const getVersion = () => {
  try {
    const versionPath = path.join(__dirname, 'VERSION');
    return fs.readFileSync(versionPath, 'utf8').trim();
  } catch {
    return '0.0.0';
  }
};

// 환경변수에서 빌드 정보 읽기 (Docker build-arg로 주입)
const GIT_HASH = process.env.GIT_HASH || 'dev';
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

const APP_VERSION = getVersion();
const FULL_VERSION = `v${APP_VERSION} (${GIT_HASH})`;

const VERSION_INFO = {
  version: APP_VERSION,
  gitHash: GIT_HASH,
  buildTime: BUILD_TIME,
  fullVersion: FULL_VERSION,
};

/**
 * 콘솔에 버전 정보 출력
 */
const logVersionInfo = () => {
  console.log(`\n========================================`);
  console.log(`  AIMS API ${FULL_VERSION}`);
  console.log(`  Build: ${BUILD_TIME}`);
  console.log(`========================================\n`);
};

module.exports = {
  APP_VERSION,
  GIT_HASH,
  BUILD_TIME,
  FULL_VERSION,
  VERSION_INFO,
  logVersionInfo,
};
