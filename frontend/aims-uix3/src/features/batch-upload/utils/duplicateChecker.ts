/**
 * Duplicate File Checker Utility
 * @since 2025-12-07
 * @version 2.0.0 - 공통 모듈로 이동 (2025-12-14)
 *
 * 이 파일은 하위 호환성을 위해 공통 모듈을 re-export합니다.
 * 새 코드에서는 '@/shared/lib/fileValidation'에서 직접 import하세요.
 *
 * @example
 * ```typescript
 * // 권장 (새 코드)
 * import { checkDuplicateFile, getCustomerFileHashes } from '@/shared/lib/fileValidation'
 *
 * // 하위 호환성 (기존 코드)
 * import { checkDuplicateFile } from '@/features/batch-upload/utils/duplicateChecker'
 * ```
 */

export {
  getCustomerFileHashes,
  checkDuplicateFile,
  checkDuplicateFiles,
  getUniqueFileName,
  type ExistingFileHash,
  type DuplicateCheckResult,
} from '@/shared/lib/fileValidation'
