/**
 * AIMS UIX3 버전 정보
 * package.json에서 자동으로 버전을 가져오고, 빌드 시 git hash를 주입합니다.
 * @since 2025-12-13
 * @updated 2025-12-16 git hash 추가
 */

import packageJson from '../../package.json'

// Vite에서 빌드 시점에 주입하는 전역 변수 타입 선언
declare const __GIT_HASH__: string
declare const __BUILD_TIME__: string

export const APP_VERSION = packageJson.version
const APP_NAME = packageJson.name

/**
 * Git commit hash (빌드 시점에 주입)
 */
export const GIT_HASH = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev'

/**
 * 빌드 날짜 (빌드 시점에 주입)
 */
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString()

/**
 * 전체 버전 문자열 (버전 + git hash)
 */
export const FULL_VERSION = `v${APP_VERSION} (${GIT_HASH})`

/**
 * 버전 정보 객체
 */
export const VERSION_INFO = {
  version: APP_VERSION,
  gitHash: GIT_HASH,
  buildTime: BUILD_TIME,
  fullVersion: FULL_VERSION,
}

/**
 * 콘솔에 버전 정보 출력 (앱 시작 시 호출)
 */
export const logVersionInfo = (): void => {
  console.log(
    `%c AIMS UIX3 %c ${FULL_VERSION} %c`,
    'background: #007AFF; color: white; padding: 2px 6px; border-radius: 3px 0 0 3px;',
    'background: #333; color: #fff; padding: 2px 6px; border-radius: 0 3px 3px 0;',
    ''
  )
  if (import.meta.env.DEV) {
    console.log('[Version] Build time:', BUILD_TIME)
  }
}
