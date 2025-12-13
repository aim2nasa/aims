/**
 * 확장자 검증 테스트
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import {
  getFileExtension,
  isBlockedExtension,
  validateExtension,
} from '../validators/extensionValidator'
import { BLOCKED_EXTENSIONS } from '../constants'

describe('getFileExtension', () => {
  it('일반 파일명에서 확장자 추출', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf')
    expect(getFileExtension('image.PNG')).toBe('png')
    expect(getFileExtension('script.JS')).toBe('js')
  })

  it('여러 점이 있는 파일명', () => {
    expect(getFileExtension('file.name.with.dots.txt')).toBe('txt')
    expect(getFileExtension('archive.tar.gz')).toBe('gz')
  })

  it('확장자 없는 파일명', () => {
    expect(getFileExtension('README')).toBe('')
    expect(getFileExtension('Makefile')).toBe('')
  })

  it('점으로 끝나는 파일명', () => {
    expect(getFileExtension('file.')).toBe('')
  })

  it('공백이 있는 파일명', () => {
    expect(getFileExtension('  document.pdf  ')).toBe('pdf')
  })

  it('빈 문자열', () => {
    expect(getFileExtension('')).toBe('')
  })
})

describe('isBlockedExtension', () => {
  it('차단 확장자 거부 - Windows (exe, bat, dll, ps1...)', () => {
    expect(isBlockedExtension('malware.exe')).toBe(true)
    expect(isBlockedExtension('script.bat')).toBe(true)
    expect(isBlockedExtension('library.dll')).toBe(true)
    expect(isBlockedExtension('powershell.ps1')).toBe(true)
    expect(isBlockedExtension('installer.msi')).toBe(true)
    expect(isBlockedExtension('script.vbs')).toBe(true)
    expect(isBlockedExtension('archive.jar')).toBe(true)
  })

  it('차단 확장자 거부 - Linux (sh, elf, deb, so...)', () => {
    expect(isBlockedExtension('script.sh')).toBe(true)
    expect(isBlockedExtension('script.bash')).toBe(true)
    expect(isBlockedExtension('script.zsh')).toBe(true)
    expect(isBlockedExtension('binary.elf')).toBe(true)
    expect(isBlockedExtension('installer.bin')).toBe(true)
    expect(isBlockedExtension('package.deb')).toBe(true)
    expect(isBlockedExtension('package.rpm')).toBe(true)
    expect(isBlockedExtension('library.so')).toBe(true)
    expect(isBlockedExtension('launcher.desktop')).toBe(true)
    expect(isBlockedExtension('script.pl')).toBe(true)
    expect(isBlockedExtension('script.py')).toBe(true)
  })

  it('허용 확장자 통과 (pdf, jpg, docx...)', () => {
    expect(isBlockedExtension('document.pdf')).toBe(false)
    expect(isBlockedExtension('image.jpg')).toBe(false)
    expect(isBlockedExtension('spreadsheet.xlsx')).toBe(false)
    expect(isBlockedExtension('presentation.pptx')).toBe(false)
    expect(isBlockedExtension('archive.zip')).toBe(false)
    expect(isBlockedExtension('text.txt')).toBe(false)
  })

  it('대소문자 무관 테스트', () => {
    expect(isBlockedExtension('MALWARE.EXE')).toBe(true)
    expect(isBlockedExtension('Script.Bat')).toBe(true)
    expect(isBlockedExtension('LIBRARY.DLL')).toBe(true)
    expect(isBlockedExtension('DOCUMENT.PDF')).toBe(false)
  })

  it('확장자 없는 파일', () => {
    expect(isBlockedExtension('README')).toBe(false)
  })

  it('모든 차단 확장자 테스트', () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      expect(isBlockedExtension(`test.${ext}`)).toBe(true)
    }
  })
})

describe('validateExtension', () => {
  // 테스트용 File 객체 생성 헬퍼
  const createMockFile = (name: string, size: number = 1000): File => {
    return new File(['x'.repeat(size)], name, { type: 'application/octet-stream' })
  }

  it('차단 확장자 파일 거부', () => {
    const file = createMockFile('malware.exe')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('blocked_extension')
    expect(result.message).toContain('차단된 확장자')
    expect(result.message).toContain('.exe')
  })

  it('허용 확장자 파일 통과', () => {
    const file = createMockFile('document.pdf')
    const result = validateExtension(file)

    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('대소문자 무관 차단', () => {
    const file = createMockFile('SCRIPT.BAT')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('blocked_extension')
  })

  it('확장자 없는 파일 통과', () => {
    const file = createMockFile('README')
    const result = validateExtension(file)

    expect(result.valid).toBe(true)
  })
})
