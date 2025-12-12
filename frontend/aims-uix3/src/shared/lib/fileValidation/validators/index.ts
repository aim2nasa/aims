/**
 * 파일 검증기 모듈
 * @since 2025-12-13
 * @version 2.0.0 - 플러그인 아키텍처 전환
 *
 * 이 모듈은 하위 호환성을 위해 기존 함수들을 유지하면서,
 * 내부적으로 ValidationPipeline을 사용합니다.
 */

export {
  getFileExtension,
  isBlockedExtension,
  validateExtension,
} from './extensionValidator'

export {
  isFileSizeValid,
  validateFileSize,
} from './fileSizeValidator'

export {
  isDangerousMimeType,
  isExtensionMimeMatch,
  validateMimeType,
} from './mimeTypeValidator'

import { ValidationPipeline } from '../ValidationPipeline'
import {
  defaultPlugins,
  PLUGIN_NAMES,
} from '../plugins'
import type { FileValidationResult, PipelineExecutionOptions } from '../types'

// ============================================
// 기본 파이프라인 인스턴스
// ============================================

/**
 * 기본 검증 파이프라인
 *
 * 기본 플러그인(확장자, 크기, MIME)이 등록된 상태로 생성됩니다.
 * 커스터마이징이 필요하면 이 인스턴스를 직접 사용하거나 clone()하세요.
 *
 * @example
 * ```typescript
 * // 검증기 비활성화
 * defaultPipeline.setEnabled('mime', false)
 *
 * // 커스텀 검증기 추가
 * defaultPipeline.register(myValidator)
 *
 * // 검증기 제거
 * defaultPipeline.unregister('mime')
 * ```
 */
export const defaultPipeline = new ValidationPipeline()

// 기본 플러그인 등록
for (const plugin of defaultPlugins) {
  defaultPipeline.register(plugin)
}

// ============================================
// 하위 호환성을 위한 래퍼 함수
// ============================================

export interface ValidateFileOptions {
  /** MIME 타입 검증 활성화 (기본: true) */
  checkMimeType?: boolean
}

/**
 * 기본 파일 검증 (확장자 + 크기 + MIME)
 *
 * 내부적으로 defaultPipeline을 사용합니다.
 *
 * @param file File 객체
 * @param options 검증 옵션
 * @returns FileValidationResult
 */
export function validateFile(file: File, options: ValidateFileOptions = {}): FileValidationResult {
  const { checkMimeType = true } = options

  // 파이프라인 실행 옵션 변환
  const pipelineOptions: PipelineExecutionOptions = {}

  if (!checkMimeType) {
    pipelineOptions.exclude = [PLUGIN_NAMES.MIME]
  }

  return defaultPipeline.validate(file, pipelineOptions)
}

/**
 * 배치 파일 검증
 *
 * 내부적으로 defaultPipeline을 사용합니다.
 *
 * @param files File 배열
 * @param options 검증 옵션
 * @returns 유효한 파일과 무효한 파일을 분리한 결과
 */
export function validateFiles(
  files: File[],
  options: ValidateFileOptions = {}
): {
  validFiles: File[]
  invalidFiles: FileValidationResult[]
} {
  const { checkMimeType = true } = options

  const pipelineOptions: PipelineExecutionOptions = {}

  if (!checkMimeType) {
    pipelineOptions.exclude = [PLUGIN_NAMES.MIME]
  }

  return defaultPipeline.validateFiles(files, pipelineOptions)
}

// Re-export for convenience
export { ValidationPipeline } from '../ValidationPipeline'
export { defaultPlugins, PLUGIN_NAMES } from '../plugins'
