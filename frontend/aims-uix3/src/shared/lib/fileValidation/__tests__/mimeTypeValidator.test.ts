/**
 * MIME 타입 검증 테스트
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import {
  isDangerousMimeType,
  isExtensionMimeMatch,
  validateMimeType,
} from '../validators/mimeTypeValidator'
import { DANGEROUS_MIME_TYPES } from '../constants'

describe('isDangerousMimeType', () => {
  it('위험한 MIME 타입 감지 - Windows', () => {
    expect(isDangerousMimeType('application/x-msdownload')).toBe(true)
    expect(isDangerousMimeType('application/x-msi')).toBe(true)
    expect(isDangerousMimeType('application/vnd.microsoft.portable-executable')).toBe(true)
  })

  it('위험한 MIME 타입 감지 - Linux', () => {
    expect(isDangerousMimeType('application/x-executable')).toBe(true)
    expect(isDangerousMimeType('application/x-elf')).toBe(true)
    expect(isDangerousMimeType('application/x-shellscript')).toBe(true)
    expect(isDangerousMimeType('application/x-debian-package')).toBe(true)
    expect(isDangerousMimeType('application/x-rpm')).toBe(true)
    expect(isDangerousMimeType('application/x-sharedlib')).toBe(true)
  })

  it('위험한 MIME 타입 감지 - 크로스플랫폼', () => {
    expect(isDangerousMimeType('application/java-archive')).toBe(true)
    expect(isDangerousMimeType('text/x-python')).toBe(true)
    expect(isDangerousMimeType('text/x-perl')).toBe(true)
    expect(isDangerousMimeType('text/x-ruby')).toBe(true)
  })

  it('안전한 MIME 타입 통과', () => {
    expect(isDangerousMimeType('application/pdf')).toBe(false)
    expect(isDangerousMimeType('image/jpeg')).toBe(false)
    expect(isDangerousMimeType('text/plain')).toBe(false)
    expect(isDangerousMimeType('application/zip')).toBe(false)
  })

  it('대소문자 무관 검사', () => {
    expect(isDangerousMimeType('APPLICATION/X-MSDOWNLOAD')).toBe(true)
    expect(isDangerousMimeType('Application/X-Executable')).toBe(true)
  })

  it('공백 트림 처리', () => {
    expect(isDangerousMimeType('  application/x-msdownload  ')).toBe(true)
  })

  it('모든 위험 MIME 타입 테스트', () => {
    for (const mimeType of DANGEROUS_MIME_TYPES) {
      expect(isDangerousMimeType(mimeType)).toBe(true)
    }
  })
})

describe('isExtensionMimeMatch', () => {
  it('PDF 확장자 + PDF MIME → 통과', () => {
    expect(isExtensionMimeMatch('pdf', 'application/pdf')).toBe(true)
  })

  it('JPEG 확장자 + JPEG MIME → 통과', () => {
    expect(isExtensionMimeMatch('jpg', 'image/jpeg')).toBe(true)
    expect(isExtensionMimeMatch('jpeg', 'image/jpeg')).toBe(true)
  })

  it('DOCX 확장자 + DOCX MIME → 통과', () => {
    expect(isExtensionMimeMatch('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
  })

  it('PDF 확장자 + EXE MIME → 거부 (위조 탐지)', () => {
    expect(isExtensionMimeMatch('pdf', 'application/x-msdownload')).toBe(false)
  })

  it('JPG 확장자 + PDF MIME → 거부 (위조 탐지)', () => {
    expect(isExtensionMimeMatch('jpg', 'application/pdf')).toBe(false)
  })

  it('알 수 없는 확장자 → 관대하게 통과', () => {
    expect(isExtensionMimeMatch('xyz', 'application/octet-stream')).toBe(true)
    expect(isExtensionMimeMatch('unknown', 'some/mimetype')).toBe(true)
  })

  it('확장자 없음 → 관대하게 통과', () => {
    expect(isExtensionMimeMatch('', 'application/pdf')).toBe(true)
  })

  it('application/octet-stream → 관대하게 통과', () => {
    // 브라우저가 MIME 타입을 알 수 없을 때
    expect(isExtensionMimeMatch('pdf', 'application/octet-stream')).toBe(true)
    expect(isExtensionMimeMatch('jpg', 'application/octet-stream')).toBe(true)
  })

  it('빈 MIME 타입 → 관대하게 통과', () => {
    expect(isExtensionMimeMatch('pdf', '')).toBe(true)
  })

  it('대소문자 무관 검사', () => {
    expect(isExtensionMimeMatch('PDF', 'application/pdf')).toBe(true)
    expect(isExtensionMimeMatch('pdf', 'APPLICATION/PDF')).toBe(true)
  })
})

describe('validateMimeType', () => {
  // 테스트용 File 객체 생성 헬퍼
  const createMockFile = (name: string, mimeType: string): File => {
    return new File(['test content'], name, { type: mimeType })
  }

  it('정상 PDF 파일 통과', () => {
    const file = createMockFile('document.pdf', 'application/pdf')
    const result = validateMimeType(file)

    expect(result.valid).toBe(true)
    expect(result.file).toBe(file)
    expect(result.reason).toBeUndefined()
  })

  it('정상 이미지 파일 통과', () => {
    const jpgFile = createMockFile('photo.jpg', 'image/jpeg')
    expect(validateMimeType(jpgFile).valid).toBe(true)

    const pngFile = createMockFile('image.png', 'image/png')
    expect(validateMimeType(pngFile).valid).toBe(true)
  })

  it('정상 Office 문서 통과', () => {
    const docxFile = createMockFile('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(validateMimeType(docxFile).valid).toBe(true)

    const xlsxFile = createMockFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(validateMimeType(xlsxFile).valid).toBe(true)
  })

  it('위험한 MIME 타입 거부', () => {
    const file = createMockFile('safe.pdf', 'application/x-msdownload')
    const result = validateMimeType(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('mime_mismatch')
    expect(result.message).toContain('위험한 파일 형식')
  })

  it('확장자 위조 파일 거부 (PDF 확장자 + 실행 파일)', () => {
    const file = createMockFile('fake.pdf', 'application/x-executable')
    const result = validateMimeType(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('mime_mismatch')
  })

  it('확장자 위조 파일 거부 (JPG 확장자 + PDF MIME)', () => {
    const file = createMockFile('fake.jpg', 'application/pdf')
    const result = validateMimeType(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('mime_mismatch')
    expect(result.message).toContain('.jpg')
    expect(result.message).toContain('application/pdf')
  })

  it('알 수 없는 MIME (application/octet-stream) 관대하게 통과', () => {
    const file = createMockFile('document.pdf', 'application/octet-stream')
    const result = validateMimeType(file)

    expect(result.valid).toBe(true)
  })

  it('알 수 없는 확장자 관대하게 통과', () => {
    const file = createMockFile('file.xyz', 'application/xyz')
    const result = validateMimeType(file)

    expect(result.valid).toBe(true)
  })

  it('확장자 없는 파일 관대하게 통과', () => {
    const file = createMockFile('README', 'text/plain')
    const result = validateMimeType(file)

    expect(result.valid).toBe(true)
  })
})
