/**
 * 확장자 검증 테스트
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import {
  getFileExtension,
  isBlockedExtension,
  isSystemFileName,
  validateExtension,
} from '../validators/extensionValidator'
import { BLOCKED_EXTENSIONS, SYSTEM_FILE_NAMES } from '../constants'

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

describe('isSystemFileName', () => {
  it('Windows 시스템 파일 감지', () => {
    expect(isSystemFileName('Thumbs.db')).toBe(true)
    expect(isSystemFileName('thumbs.db')).toBe(true)
    expect(isSystemFileName('desktop.ini')).toBe(true)
    expect(isSystemFileName('Desktop.ini')).toBe(true)
    expect(isSystemFileName('ehthumbs.db')).toBe(true)
    expect(isSystemFileName('ehthumbs_vista.db')).toBe(true)
  })

  it('macOS 시스템 파일 감지', () => {
    expect(isSystemFileName('.DS_Store')).toBe(true)
  })

  it('Office 임시 파일 감지 (~$ 접두사)', () => {
    expect(isSystemFileName('~$보고서.xlsx')).toBe(true)
    expect(isSystemFileName('~$계약서.docx')).toBe(true)
    expect(isSystemFileName('~$김도일 보험현황.xlsx')).toBe(true)
  })

  it('일반 파일은 통과', () => {
    expect(isSystemFileName('document.pdf')).toBe(false)
    expect(isSystemFileName('image.jpg')).toBe(false)
    expect(isSystemFileName('report.xlsx')).toBe(false)
    expect(isSystemFileName('thumbs.pdf')).toBe(false)
    expect(isSystemFileName('my_thumbs.db')).toBe(false)
  })

  it('모든 시스템 파일명 테스트', () => {
    for (const name of SYSTEM_FILE_NAMES) {
      expect(isSystemFileName(name)).toBe(true)
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

  it('OS 시스템 파일 거부 — Thumbs.db', () => {
    const file = createMockFile('Thumbs.db')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('system_file')
    expect(result.message).toContain('시스템 파일')
  })

  it('OS 시스템 파일 거부 — .DS_Store', () => {
    const file = createMockFile('.DS_Store')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('system_file')
    expect(result.message).toContain('시스템 파일')
  })

  it('OS 시스템 파일 거부 — desktop.ini', () => {
    const file = createMockFile('desktop.ini')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('system_file')
    expect(result.message).toContain('시스템 파일')
  })

  it('Office 임시 파일 거부 — ~$보고서.xlsx', () => {
    const file = createMockFile('~$보고서.xlsx')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('system_file')
    expect(result.message).toContain('편집 중 자동 생성된 파일')
  })

  it('Office 임시 파일 거부 — ~$계약서.docx', () => {
    const file = createMockFile('~$계약서.docx')
    const result = validateExtension(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('system_file')
    expect(result.message).toContain('편집 중 자동 생성된 파일')
  })

  it('시스템 파일과 이름이 유사하지만 다른 파일은 통과', () => {
    const file = createMockFile('my_thumbs.db')
    const result = validateExtension(file)

    // db 확장자는 차단 확장자가 아니므로 통과해야 함
    expect(result.valid).toBe(true)
  })
})
