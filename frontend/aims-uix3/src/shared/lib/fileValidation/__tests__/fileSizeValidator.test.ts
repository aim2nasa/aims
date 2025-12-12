/**
 * 파일 크기 검증 테스트
 * @since 2025-12-13
 */

import { describe, it, expect } from 'vitest'
import {
  isFileSizeValid,
  validateFileSize,
} from '../validators/fileSizeValidator'
import { FILE_SIZE_LIMITS } from '../constants'

describe('isFileSizeValid', () => {
  const MAX_SIZE = FILE_SIZE_LIMITS.MAX_SINGLE_FILE // 50MB

  it('50MB 미만 통과', () => {
    expect(isFileSizeValid(1)).toBe(true)
    expect(isFileSizeValid(1000)).toBe(true)
    expect(isFileSizeValid(1024 * 1024)).toBe(true) // 1MB
    expect(isFileSizeValid(10 * 1024 * 1024)).toBe(true) // 10MB
    expect(isFileSizeValid(49 * 1024 * 1024)).toBe(true) // 49MB
  })

  it('정확히 50MB 통과', () => {
    expect(isFileSizeValid(MAX_SIZE)).toBe(true)
  })

  it('50MB 초과 거부', () => {
    expect(isFileSizeValid(MAX_SIZE + 1)).toBe(false)
    expect(isFileSizeValid(51 * 1024 * 1024)).toBe(false) // 51MB
    expect(isFileSizeValid(100 * 1024 * 1024)).toBe(false) // 100MB
  })

  it('0바이트 파일 거부', () => {
    expect(isFileSizeValid(0)).toBe(false)
  })

  it('음수 크기 거부', () => {
    expect(isFileSizeValid(-1)).toBe(false)
    expect(isFileSizeValid(-1000)).toBe(false)
  })
})

describe('validateFileSize', () => {
  // 테스트용 File 객체 생성 헬퍼
  const createMockFile = (name: string, size: number): File => {
    // File 생성자는 실제 크기를 content 길이에서 가져오므로
    // 테스트를 위해 Object.defineProperty로 size를 오버라이드
    const file = new File([''], name, { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: size, writable: false })
    return file
  }

  it('정상 크기 파일 통과', () => {
    const file = createMockFile('document.pdf', 1024 * 1024) // 1MB
    const result = validateFileSize(file)

    expect(result.valid).toBe(true)
    expect(result.file).toBe(file)
    expect(result.reason).toBeUndefined()
  })

  it('50MB 정확히 통과', () => {
    const file = createMockFile('large.pdf', FILE_SIZE_LIMITS.MAX_SINGLE_FILE)
    const result = validateFileSize(file)

    expect(result.valid).toBe(true)
  })

  it('50MB 초과 거부', () => {
    const file = createMockFile('huge.pdf', FILE_SIZE_LIMITS.MAX_SINGLE_FILE + 1)
    const result = validateFileSize(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('size_exceeded')
    expect(result.message).toContain('50MB')
    expect(result.message).toContain('초과')
  })

  it('0바이트 파일 거부', () => {
    const file = createMockFile('empty.txt', 0)
    const result = validateFileSize(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('size_exceeded')
    expect(result.message).toContain('빈 파일')
  })

  it('큰 파일 (100MB) 거부', () => {
    const file = createMockFile('verylarge.zip', 100 * 1024 * 1024)
    const result = validateFileSize(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('size_exceeded')
  })
})
