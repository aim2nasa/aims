/**
 * 파일 검증 동일성 테스트
 * @since 2025-12-14
 * @version 2.0.0 - Phase 1: 개별 파일 크기 제한 제거
 *
 * 목적: 새 문서 등록과 문서 일괄등록에서 동일한 파일에 대해
 * 100% 동일한 검증 결과가 나오는지 증명
 *
 * 검증 항목:
 * 1. 확장자 검증 - 동일한 blocked/allowed 목록 사용
 * 2. 파일 크기 검증 - 0바이트만 거부 (크기 상한은 쿼터로 관리)
 * 3. MIME 타입 검증 - 동일한 확장자-MIME 매핑
 * 4. 중복 파일 검사 - 동일한 SHA-256 해시 로직
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 공통 모듈 (새 문서 등록에서 사용)
import {
  validateFile as validateFileShared,
  validateFiles as validateFilesShared,
  BLOCKED_EXTENSIONS as BLOCKED_EXTENSIONS_SHARED,
  ALLOWED_DOCUMENT_EXTENSIONS as ALLOWED_EXTENSIONS_SHARED,
  getFileExtension as getFileExtensionShared,
  isBlockedExtension as isBlockedExtensionShared,
  isFileSizeValid as isFileSizeValidShared,
} from '../index'

// batch-upload 모듈 (문서 일괄등록에서 사용)
import {
  validateFile as validateFileBatch,
  BLOCKED_EXTENSIONS as BLOCKED_EXTENSIONS_BATCH,
  ALLOWED_DOCUMENT_EXTENSIONS as ALLOWED_EXTENSIONS_BATCH,
  getFileExtension as getFileExtensionBatch,
  isBlockedExtension as isBlockedExtensionBatch,
  isFileSizeValid as isFileSizeValidBatch,
} from '@/features/batch-upload/utils/fileValidation'

// duplicateChecker - 공통 모듈 vs batch-upload re-export
import {
  getUniqueFileName as getUniqueFileNameShared,
} from '../duplicateChecker'

import {
  getUniqueFileName as getUniqueFileNameBatch,
} from '@/features/batch-upload/utils/duplicateChecker'

describe('파일 검증 동일성 테스트', () => {
  // ============================================
  // 1. 상수 동일성 테스트
  // ============================================

  describe('상수 동일성', () => {
    it('BLOCKED_EXTENSIONS가 완전히 동일해야 함', () => {
      expect(BLOCKED_EXTENSIONS_SHARED).toEqual(BLOCKED_EXTENSIONS_BATCH)
      expect(BLOCKED_EXTENSIONS_SHARED).toBe(BLOCKED_EXTENSIONS_BATCH) // 참조 동일성
    })

    it('ALLOWED_DOCUMENT_EXTENSIONS가 완전히 동일해야 함', () => {
      expect(ALLOWED_EXTENSIONS_SHARED).toEqual(ALLOWED_EXTENSIONS_BATCH)
      expect(ALLOWED_EXTENSIONS_SHARED).toBe(ALLOWED_EXTENSIONS_BATCH) // 참조 동일성
    })
  })

  // ============================================
  // 2. 유틸리티 함수 동일성 테스트
  // ============================================

  describe('유틸리티 함수 동일성', () => {
    const testFileNames = [
      'document.pdf',
      'image.PNG',
      'script.EXE',
      'archive.tar.gz',
      'no-extension',
      '.hidden',
      'multiple.dots.in.name.txt',
    ]

    testFileNames.forEach((fileName) => {
      it(`getFileExtension("${fileName}") 결과가 동일해야 함`, () => {
        expect(getFileExtensionShared(fileName)).toBe(getFileExtensionBatch(fileName))
      })
    })

    const testExtensions = ['exe', 'pdf', 'jpg', 'bat', 'cmd', 'msi', 'unknown']

    testExtensions.forEach((ext) => {
      it(`isBlockedExtension("${ext}") 결과가 동일해야 함`, () => {
        expect(isBlockedExtensionShared(ext)).toBe(isBlockedExtensionBatch(ext))
      })
    })

    // Phase 1: 0바이트만 거부, 나머지는 모두 통과
    const testSizes = [0, 1024, 50 * 1024 * 1024, 51 * 1024 * 1024, 100 * 1024 * 1024]

    testSizes.forEach((size) => {
      it(`isFileSizeValid(${size}) 결과가 동일해야 함`, () => {
        expect(isFileSizeValidShared(size)).toBe(isFileSizeValidBatch(size))
      })
    })
  })

  // ============================================
  // 3. 파일 검증 결과 동일성 테스트
  // ============================================

  describe('validateFile 결과 동일성', () => {
    // 유효한 파일들
    const validFiles = [
      { name: 'document.pdf', type: 'application/pdf', size: 1024 },
      { name: 'image.jpg', type: 'image/jpeg', size: 2048 },
      { name: 'image.png', type: 'image/png', size: 4096 },
      { name: 'data.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 8192 },
    ]

    // 무효한 파일들 (확장자)
    const blockedExtensionFiles = [
      { name: 'virus.exe', type: 'application/x-msdownload', size: 1024 },
      { name: 'script.bat', type: 'application/x-bat', size: 512 },
      { name: 'installer.msi', type: 'application/x-msi', size: 2048 },
    ]

    // Phase 1: 큰 파일도 이제 유효 (크기 제한 없음)
    const largeFiles = [
      { name: 'huge.pdf', type: 'application/pdf', size: 51 * 1024 * 1024 },
      { name: 'giant.jpg', type: 'image/jpeg', size: 100 * 1024 * 1024 },
    ]

    // Mock File 생성 헬퍼
    function createMockFile(props: { name: string; type: string; size: number }): File {
      const blob = new Blob(['x'.repeat(Math.min(props.size, 100))], { type: props.type })
      const file = new File([blob], props.name, { type: props.type })
      Object.defineProperty(file, 'size', { value: props.size })
      return file
    }

    validFiles.forEach((fileProps) => {
      it(`유효한 파일 "${fileProps.name}": 양쪽 모두 valid=true`, () => {
        const file = createMockFile(fileProps)

        const resultShared = validateFileShared(file)
        const resultBatch = validateFileBatch(file)

        expect(resultShared.valid).toBe(true)
        expect(resultBatch.valid).toBe(true)
        expect(resultShared.valid).toBe(resultBatch.valid)
      })
    })

    blockedExtensionFiles.forEach((fileProps) => {
      it(`차단 확장자 "${fileProps.name}": 양쪽 모두 valid=false, reason=blocked_extension`, () => {
        const file = createMockFile(fileProps)

        const resultShared = validateFileShared(file)
        const resultBatch = validateFileBatch(file)

        expect(resultShared.valid).toBe(false)
        expect(resultBatch.valid).toBe(false)

        if (!resultShared.valid && !resultBatch.valid) {
          expect(resultShared.reason).toBe('blocked_extension')
          expect(resultBatch.reason).toBe('blocked_extension')
        }
      })
    })

    largeFiles.forEach((fileProps) => {
      it(`큰 파일 "${fileProps.name}": 양쪽 모두 valid=true (Phase 1: 크기 제한 없음)`, () => {
        const file = createMockFile(fileProps)

        const resultShared = validateFileShared(file)
        const resultBatch = validateFileBatch(file)

        expect(resultShared.valid).toBe(true)
        expect(resultBatch.valid).toBe(true)
      })
    })
  })

  // ============================================
  // 4. duplicateChecker 함수 동일성 테스트
  // ============================================

  describe('duplicateChecker 함수 동일성', () => {
    it('getUniqueFileName이 동일한 함수여야 함', () => {
      // 함수 참조가 동일해야 함 (re-export이므로)
      expect(getUniqueFileNameShared).toBe(getUniqueFileNameBatch)
    })

    const testCases = [
      { fileName: 'report.pdf', existingNames: [], expected: 'report.pdf' },
      { fileName: 'report.pdf', existingNames: ['report.pdf'], expected: 'report (1).pdf' },
      { fileName: 'report.pdf', existingNames: ['report.pdf', 'report (1).pdf'], expected: 'report (2).pdf' },
      { fileName: 'noext', existingNames: ['noext'], expected: 'noext (1)' },
    ]

    testCases.forEach(({ fileName, existingNames, expected }) => {
      it(`getUniqueFileName("${fileName}", [${existingNames.join(', ')}]) = "${expected}"`, () => {
        const resultShared = getUniqueFileNameShared(fileName, existingNames)
        const resultBatch = getUniqueFileNameBatch(fileName, existingNames)

        expect(resultShared).toBe(expected)
        expect(resultBatch).toBe(expected)
        expect(resultShared).toBe(resultBatch)
      })
    })
  })

  // ============================================
  // 5. 통합 동일성 테스트: 실제 사용 시나리오
  // ============================================

  describe('통합 시나리오 동일성', () => {
    it('동일한 파일 세트에 대해 validateFiles 결과가 동일해야 함', () => {
      const files = [
        new File(['pdf content'], 'doc1.pdf', { type: 'application/pdf' }),
        new File(['jpg content'], 'image.jpg', { type: 'image/jpeg' }),
        new File(['exe content'], 'virus.exe', { type: 'application/x-msdownload' }),
      ]

      const resultShared = validateFilesShared(files)

      // batch-upload의 validateBatch는 tierLimit이 필요하므로 직접 비교는 어려움
      // 대신 validateFile을 개별적으로 호출하여 비교
      const batchResults = files.map((file) => validateFileBatch(file))

      // 유효한 파일 수 비교
      const batchValidCount = batchResults.filter((r) => r.valid).length
      expect(resultShared.validFiles.length).toBe(batchValidCount)

      // 무효한 파일 수 비교
      const batchInvalidCount = batchResults.filter((r) => !r.valid).length
      expect(resultShared.invalidFiles.length).toBe(batchInvalidCount)

      // 각 파일의 유효성 결과가 일치하는지 확인
      files.forEach((file, index) => {
        const sharedValid = resultShared.validFiles.includes(file)
        const batchValid = batchResults[index].valid
        expect(sharedValid).toBe(batchValid)
      })
    })

    it('MIME 타입 불일치 파일에 대해 양쪽 모두 동일하게 처리해야 함', () => {
      // PDF 확장자지만 JPEG MIME 타입인 위조 파일
      const spoofedFile = new File(['fake content'], 'document.pdf', { type: 'image/jpeg' })

      const resultShared = validateFileShared(spoofedFile)
      const resultBatch = validateFileBatch(spoofedFile)

      // 양쪽 모두 동일한 결과여야 함
      expect(resultShared.valid).toBe(resultBatch.valid)

      if (!resultShared.valid && !resultBatch.valid) {
        expect(resultShared.reason).toBe(resultBatch.reason)
      }
    })
  })
})

// ============================================
// 6. 모듈 참조 동일성 테스트
// ============================================

describe('모듈 참조 동일성', () => {
  it('batch-upload/duplicateChecker는 shared 모듈을 re-export해야 함', async () => {
    // 동적 import로 모듈 자체를 비교
    const sharedModule = await import('../duplicateChecker')
    const batchModule = await import('@/features/batch-upload/utils/duplicateChecker')

    // 각 export된 함수가 동일한 참조인지 확인
    expect(sharedModule.getCustomerFileHashes).toBe(batchModule.getCustomerFileHashes)
    expect(sharedModule.checkDuplicateFile).toBe(batchModule.checkDuplicateFile)
    expect(sharedModule.checkDuplicateFiles).toBe(batchModule.checkDuplicateFiles)
    expect(sharedModule.getUniqueFileName).toBe(batchModule.getUniqueFileName)
  })
})
