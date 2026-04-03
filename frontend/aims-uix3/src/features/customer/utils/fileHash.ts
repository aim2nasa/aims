/**
 * 파일 해시 유틸리티 — 호환 re-export
 *
 * 본체는 @/shared/lib/fileValidation/fileHash.ts로 이동됨.
 * 기존 import 호환을 위해 re-export 유지.
 *
 * @deprecated @/shared/lib/fileValidation/fileHash에서 직접 import하세요.
 */
export { calculateFileHash, isDuplicateHash } from '@/shared/lib/fileValidation/fileHash';
