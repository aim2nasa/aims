/**
 * 검증기 통합 테스트
 * 확장자 + 크기 + MIME 통합 검증
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import { validateFile, validateFiles, ValidateFileOptions } from '../../validators'

describe('validateFile 통합 테스트', () => {
  // 테스트용 File 객체 생성 헬퍼
  const createMockFile = (
    name: string,
    size: number,
    mimeType: string = 'application/octet-stream'
  ): File => {
    const file = new File([''], name, { type: mimeType })
    Object.defineProperty(file, 'size', { value: size, writable: false })
    return file
  }

  describe('정상 파일 통과', () => {
    it('정상 PDF 파일', () => {
      const file = createMockFile('document.pdf', 1024 * 1024, 'application/pdf')
      const result = validateFile(file)
      expect(result.valid).toBe(true)
    })

    it('정상 JPEG 이미지', () => {
      const file = createMockFile('photo.jpg', 2 * 1024 * 1024, 'image/jpeg')
      const result = validateFile(file)
      expect(result.valid).toBe(true)
    })

    it('정상 Office 문서', () => {
      const file = createMockFile(
        'report.docx',
        5 * 1024 * 1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      const result = validateFile(file)
      expect(result.valid).toBe(true)
    })

    it('알 수 없는 MIME으로 정상 처리', () => {
      const file = createMockFile('document.pdf', 1024, 'application/octet-stream')
      const result = validateFile(file)
      expect(result.valid).toBe(true)
    })
  })

  describe('차단 확장자 거부 (최우선)', () => {
    it('EXE 파일 차단', () => {
      const file = createMockFile('malware.exe', 1024, 'application/x-msdownload')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('blocked_extension')
    })

    it('BAT 파일 차단', () => {
      const file = createMockFile('script.bat', 100, 'text/plain')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('blocked_extension')
    })

    it('PS1 파일 차단', () => {
      const file = createMockFile('powershell.ps1', 500, 'text/plain')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('blocked_extension')
    })
  })

  describe('파일 크기 초과 거부', () => {
    it('50MB 초과 파일', () => {
      const file = createMockFile('huge.pdf', 51 * 1024 * 1024, 'application/pdf')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('size_exceeded')
    })

    it('0바이트 파일', () => {
      const file = createMockFile('empty.txt', 0, 'text/plain')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('size_exceeded')
    })
  })

  describe('MIME 타입 불일치 거부', () => {
    it('PDF 확장자 + EXE MIME (위조)', () => {
      const file = createMockFile('fake.pdf', 1024, 'application/x-msdownload')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('mime_mismatch')
    })

    it('JPG 확장자 + PDF MIME (위조)', () => {
      const file = createMockFile('fake.jpg', 1024, 'application/pdf')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('mime_mismatch')
    })
  })

  describe('검증 순서 테스트', () => {
    it('차단 확장자는 크기 검사보다 먼저', () => {
      // EXE 파일이 크기 초과보다 먼저 체크됨
      const file = createMockFile('malware.exe', 100 * 1024 * 1024, 'application/x-msdownload')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('blocked_extension') // size_exceeded가 아님
    })

    it('크기 검사는 MIME 검사보다 먼저', () => {
      // 크기 초과가 MIME 불일치보다 먼저 체크됨
      const file = createMockFile('huge.pdf', 100 * 1024 * 1024, 'image/jpeg')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('size_exceeded') // mime_mismatch가 아님
    })
  })

  describe('MIME 검증 옵션', () => {
    it('checkMimeType: false로 MIME 검증 스킵', () => {
      const file = createMockFile('fake.jpg', 1024, 'application/pdf')
      const result = validateFile(file, { checkMimeType: false })
      expect(result.valid).toBe(true) // MIME 불일치 무시됨
    })

    it('기본값은 MIME 검증 활성화', () => {
      const file = createMockFile('fake.jpg', 1024, 'application/pdf')
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('mime_mismatch')
    })
  })
})

describe('validateFiles 배치 통합 테스트', () => {
  const createMockFile = (
    name: string,
    size: number,
    mimeType: string = 'application/octet-stream'
  ): File => {
    const file = new File([''], name, { type: mimeType })
    Object.defineProperty(file, 'size', { value: size, writable: false })
    return file
  }

  it('모든 파일 유효', () => {
    const files = [
      createMockFile('doc1.pdf', 1024, 'application/pdf'),
      createMockFile('doc2.pdf', 2048, 'application/pdf'),
      createMockFile('image.jpg', 1024, 'image/jpeg'),
    ]

    const { validFiles, invalidFiles } = validateFiles(files)
    expect(validFiles).toHaveLength(3)
    expect(invalidFiles).toHaveLength(0)
  })

  it('일부 파일 무효', () => {
    const files = [
      createMockFile('doc.pdf', 1024, 'application/pdf'),
      createMockFile('malware.exe', 1024, 'application/x-msdownload'),
      createMockFile('image.jpg', 1024, 'image/jpeg'),
    ]

    const { validFiles, invalidFiles } = validateFiles(files)
    expect(validFiles).toHaveLength(2)
    expect(invalidFiles).toHaveLength(1)
    expect(invalidFiles[0].reason).toBe('blocked_extension')
  })

  it('모든 파일 무효', () => {
    const files = [
      createMockFile('virus.exe', 1024, 'application/x-msdownload'),
      createMockFile('huge.pdf', 100 * 1024 * 1024, 'application/pdf'),
      createMockFile('fake.jpg', 1024, 'application/pdf'),
    ]

    const { validFiles, invalidFiles } = validateFiles(files)
    expect(validFiles).toHaveLength(0)
    expect(invalidFiles).toHaveLength(3)
  })

  it('옵션 전달', () => {
    const files = [
      createMockFile('fake.jpg', 1024, 'application/pdf'), // MIME 불일치
    ]

    const withMime = validateFiles(files)
    expect(withMime.invalidFiles).toHaveLength(1)

    const withoutMime = validateFiles(files, { checkMimeType: false })
    expect(withoutMime.validFiles).toHaveLength(1)
  })

  it('빈 배열 처리', () => {
    const { validFiles, invalidFiles } = validateFiles([])
    expect(validFiles).toHaveLength(0)
    expect(invalidFiles).toHaveLength(0)
  })
})
