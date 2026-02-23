/**
 * 파일 검증 유틸리티 테스트
 * @since 2025-12-05
 * @version 2.0.0 - Phase 1: 개별 파일 크기 제한 제거
 */

import { describe, test, expect } from 'vitest'
import {
  BLOCKED_EXTENSIONS,
  getFileExtension,
  isBlockedExtension,
  isFileSizeValid,
  isBatchSizeValid,
  validateFile,
  validateBatch,
  formatFileSize,
} from '../fileValidation'

/**
 * 테스트용 File 객체 생성 헬퍼
 */
function createMockFile(name: string, size: number): File {
  const blob = new Blob(['x'.repeat(size)], { type: 'application/octet-stream' })
  return new File([blob], name, { type: 'application/octet-stream' })
}

describe('fileValidation', () => {
  describe('BLOCKED_EXTENSIONS', () => {
    test('차단 확장자 목록이 정의되어 있다', () => {
      expect(BLOCKED_EXTENSIONS).toBeDefined()
      expect(BLOCKED_EXTENSIONS.length).toBeGreaterThan(0)
    })

    test('주요 위험 확장자가 포함되어 있다', () => {
      const dangerousExtensions = ['exe', 'bat', 'cmd', 'dll', 'vbs', 'ps1', 'msi', 'jar']
      for (const ext of dangerousExtensions) {
        expect(BLOCKED_EXTENSIONS).toContain(ext)
      }
    })
  })

  describe('getFileExtension', () => {
    test('일반 파일명에서 확장자를 추출한다', () => {
      expect(getFileExtension('document.pdf')).toBe('pdf')
      expect(getFileExtension('image.PNG')).toBe('png')
      expect(getFileExtension('file.DOCX')).toBe('docx')
    })

    test('다중 점이 있는 파일명에서 마지막 확장자를 추출한다', () => {
      expect(getFileExtension('file.backup.tar.gz')).toBe('gz')
      expect(getFileExtension('report.2024.01.pdf')).toBe('pdf')
    })

    test('확장자가 없으면 빈 문자열을 반환한다', () => {
      expect(getFileExtension('README')).toBe('')
      expect(getFileExtension('Makefile')).toBe('')
    })

    test('점으로 끝나는 파일명은 빈 문자열을 반환한다', () => {
      expect(getFileExtension('file.')).toBe('')
    })

    test('공백이 있는 파일명을 처리한다', () => {
      expect(getFileExtension('  document.pdf  ')).toBe('pdf')
      expect(getFileExtension('my file.doc')).toBe('doc')
    })
  })

  describe('isBlockedExtension', () => {
    test('차단된 확장자는 true를 반환한다', () => {
      expect(isBlockedExtension('virus.exe')).toBe(true)
      expect(isBlockedExtension('script.bat')).toBe(true)
      expect(isBlockedExtension('malware.dll')).toBe(true)
      expect(isBlockedExtension('hack.ps1')).toBe(true)
      expect(isBlockedExtension('trojan.vbs')).toBe(true)
    })

    test('대소문자를 구분하지 않는다', () => {
      expect(isBlockedExtension('file.EXE')).toBe(true)
      expect(isBlockedExtension('file.Bat')).toBe(true)
      expect(isBlockedExtension('file.DLL')).toBe(true)
    })

    test('허용된 확장자는 false를 반환한다', () => {
      expect(isBlockedExtension('document.pdf')).toBe(false)
      expect(isBlockedExtension('image.jpg')).toBe(false)
      expect(isBlockedExtension('spreadsheet.xlsx')).toBe(false)
      expect(isBlockedExtension('presentation.pptx')).toBe(false)
      expect(isBlockedExtension('text.txt')).toBe(false)
    })

    test('확장자가 없는 파일은 false를 반환한다', () => {
      expect(isBlockedExtension('README')).toBe(false)
      expect(isBlockedExtension('Makefile')).toBe(false)
    })
  })

  describe('isFileSizeValid', () => {
    test('양수 크기는 유효하다 (Phase 1: 크기 제한 없음)', () => {
      expect(isFileSizeValid(1)).toBe(true)
      expect(isFileSizeValid(1024)).toBe(true)
      expect(isFileSizeValid(1024 * 1024)).toBe(true)       // 1MB
      expect(isFileSizeValid(10 * 1024 * 1024)).toBe(true)  // 10MB
      expect(isFileSizeValid(50 * 1024 * 1024)).toBe(true)  // 50MB
      expect(isFileSizeValid(100 * 1024 * 1024)).toBe(true) // 100MB
      expect(isFileSizeValid(500 * 1024 * 1024)).toBe(true) // 500MB
    })

    test('0 또는 음수는 유효하지 않다', () => {
      expect(isFileSizeValid(0)).toBe(false)
      expect(isFileSizeValid(-1)).toBe(false)
    })
  })

  describe('isBatchSizeValid', () => {
    test('한도 이하는 유효하다', () => {
      const limit = 100 * 1024 * 1024 // 100MB
      expect(isBatchSizeValid(limit, limit)).toBe(true)
      expect(isBatchSizeValid(limit - 1, limit)).toBe(true)
    })

    test('한도 초과는 유효하지 않다', () => {
      const limit = 100 * 1024 * 1024 // 100MB
      expect(isBatchSizeValid(limit + 1, limit)).toBe(false)
    })

    test('0 또는 음수는 유효하지 않다', () => {
      const limit = 500 * 1024 * 1024 // 500MB
      expect(isBatchSizeValid(0, limit)).toBe(false)
      expect(isBatchSizeValid(-1, limit)).toBe(false)
    })

    test('tierLimit이 -1이면 무제한 (0바이트 초과이면 유효)', () => {
      expect(isBatchSizeValid(100 * 1024 * 1024, -1)).toBe(true) // 100MB
      expect(isBatchSizeValid(1, -1)).toBe(true)
      expect(isBatchSizeValid(0, -1)).toBe(false) // 0바이트는 여전히 무효
    })
  })

  describe('validateFile', () => {
    test('유효한 파일은 valid: true를 반환한다', () => {
      const file = createMockFile('document.pdf', 1024)
      const result = validateFile(file)
      expect(result.valid).toBe(true)
      expect(result.file).toBe(file)
      expect(result.reason).toBeUndefined()
    })

    test('차단된 확장자는 blocked_extension 사유를 반환한다', () => {
      const file = createMockFile('malware.exe', 1024)
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('blocked_extension')
      expect(result.message).toContain('.exe')
    })

    test('큰 파일도 통과한다 (Phase 1: 크기 제한 없음)', () => {
      const largeFile = createMockFile('large.pdf', 100 * 1024 * 1024) // 100MB
      const result = validateFile(largeFile)
      expect(result.valid).toBe(true)
    })
  })

  describe('validateBatch', () => {
    const tierLimit = 500 * 1024 * 1024 // 500MB (remaining_bytes 기반)

    test('모든 파일이 유효하면 validFiles에 포함된다', () => {
      const files = [
        createMockFile('doc1.pdf', 1024),
        createMockFile('doc2.docx', 2048),
        createMockFile('image.jpg', 4096),
      ]
      const result = validateBatch(files, tierLimit)
      expect(result.validFiles).toHaveLength(3)
      expect(result.invalidFiles).toHaveLength(0)
      expect(result.isBatchSizeExceeded).toBe(false)
    })

    test('차단된 확장자 파일은 invalidFiles에 포함된다', () => {
      const files = [
        createMockFile('doc.pdf', 1024),
        createMockFile('virus.exe', 1024),
        createMockFile('script.bat', 1024),
      ]
      const result = validateBatch(files, tierLimit)
      expect(result.validFiles).toHaveLength(1)
      expect(result.invalidFiles).toHaveLength(2)
      expect(result.invalidFiles[0].reason).toBe('blocked_extension')
    })

    test('배치 총 크기가 한도를 초과하면 isBatchSizeExceeded가 true다', () => {
      const smallLimit = 10 * 1024 // 10KB
      const files = [
        createMockFile('doc1.pdf', 5000),
        createMockFile('doc2.pdf', 5000),
        createMockFile('doc3.pdf', 5000), // 총 15KB > 10KB
      ]
      const result = validateBatch(files, smallLimit)
      expect(result.isBatchSizeExceeded).toBe(true)
    })

    test('totalValidSize가 정확히 계산된다', () => {
      const files = [
        createMockFile('doc1.pdf', 1000),
        createMockFile('doc2.pdf', 2000),
        createMockFile('virus.exe', 500), // 제외됨
      ]
      const result = validateBatch(files, tierLimit)
      expect(result.totalValidSize).toBe(3000)
    })
  })

  describe('formatFileSize', () => {
    test('바이트 단위를 포맷한다', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(500)).toBe('500 B')
    })

    test('KB 단위를 포맷한다', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })

    test('MB 단위를 포맷한다', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    })

    test('GB 단위를 포맷한다', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB')
      expect(formatFileSize(5 * 1024 * 1024 * 1024)).toBe('5.0 GB')
    })
  })
})
