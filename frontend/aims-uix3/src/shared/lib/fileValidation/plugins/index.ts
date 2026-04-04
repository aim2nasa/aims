/**
 * 기본 제공 검증기 플러그인
 *
 * 각 검증기는 FileValidator 인터페이스를 구현합니다.
 * 이 플러그인들은 기본 파이프라인에 자동으로 등록됩니다.
 *
 * @since 2025-12-13
 * @version 2.0.0
 */

import type { FileValidator } from '../types'
import { validateExtension } from '../validators/extensionValidator'
import { validateFileSize } from '../validators/fileSizeValidator'
import { validateMimeType } from '../validators/mimeTypeValidator'

/**
 * 확장자 검증 플러그인
 *
 * 위험한 확장자(exe, bat, dll, ps1 등)를 가진 파일을 차단합니다.
 * Priority: 10 (가장 먼저 실행)
 */
const extensionValidatorPlugin: FileValidator = {
  name: 'extension',
  priority: 10,
  enabled: true,
  description: '위험한 확장자(exe, bat, dll, ps1 등) 차단',
  validate: validateExtension,
}

/**
 * 파일 크기 검증 플러그인
 *
 * 0바이트(빈 파일)를 차단합니다. Phase 1: 개별 크기 상한 없음.
 * Priority: 20
 */
const fileSizeValidatorPlugin: FileValidator = {
  name: 'fileSize',
  priority: 20,
  enabled: true,
  description: '빈 파일 차단 (Phase 1: 크기 상한 없음)',
  validate: validateFileSize,
}

/**
 * MIME 타입 검증 플러그인
 *
 * 확장자와 MIME 타입 불일치(위조 파일)를 탐지합니다.
 * Priority: 30
 */
const mimeTypeValidatorPlugin: FileValidator = {
  name: 'mime',
  priority: 30,
  enabled: true,
  description: '확장자 위조 탐지 (MIME 타입 검증)',
  validate: validateMimeType,
}

/**
 * 기본 제공 플러그인 목록
 */
export const defaultPlugins: FileValidator[] = [
  extensionValidatorPlugin,
  fileSizeValidatorPlugin,
  mimeTypeValidatorPlugin,
]

/**
 * 플러그인 이름 상수
 */
export const PLUGIN_NAMES = {
  EXTENSION: 'extension',
  FILE_SIZE: 'fileSize',
  MIME: 'mime',
} as const
