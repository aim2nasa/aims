/**
 * 파일 크기 검증 테스트
 * @since 2025-12-13
 * @version 2.0.0 - Phase 1: 개별 파일 크기 제한 제거
 */

import { describe, it, expect } from 'vitest'
import {
  isFileSizeValid,
  validateFileSize,
} from '../validators/fileSizeValidator'

describe('isFileSizeValid', () => {
  it('양수 크기 통과', () => {
    expect(isFileSizeValid(1)).toBe(true)
    expect(isFileSizeValid(1000)).toBe(true)
    expect(isFileSizeValid(1024 * 1024)).toBe(true) // 1MB
    expect(isFileSizeValid(10 * 1024 * 1024)).toBe(true) // 10MB
    expect(isFileSizeValid(49 * 1024 * 1024)).toBe(true) // 49MB
  })

  it('50MB 이상도 통과 (Phase 1: 크기 제한 없음)', () => {
    expect(isFileSizeValid(50 * 1024 * 1024)).toBe(true) // 50MB
    expect(isFileSizeValid(51 * 1024 * 1024)).toBe(true) // 51MB
    expect(isFileSizeValid(100 * 1024 * 1024)).toBe(true) // 100MB
    expect(isFileSizeValid(500 * 1024 * 1024)).toBe(true) // 500MB
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

  it('큰 파일도 통과 (Phase 1: 크기 제한 없음)', () => {
    const file = createMockFile('large.pdf', 100 * 1024 * 1024) // 100MB
    const result = validateFileSize(file)

    expect(result.valid).toBe(true)
  })

  it('0바이트 파일 거부', () => {
    const file = createMockFile('empty.txt', 0)
    const result = validateFileSize(file)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe('size_exceeded')
    expect(result.message).toContain('빈 파일')
  })
})
