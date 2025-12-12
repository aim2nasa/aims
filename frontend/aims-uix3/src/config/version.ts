/**
 * AIMS UIX3 버전 정보
 * package.json에서 자동으로 버전을 가져옵니다.
 * @since 2025-12-13
 */

import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version
export const APP_NAME = packageJson.name

/**
 * 빌드 날짜 (컴파일 시점)
 */
export const BUILD_DATE = new Date().toISOString()
