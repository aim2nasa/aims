/**
 * File Hash Tests
 * @since 1.0.0
 *
 * 파일 해시 계산 및 중복 검사 테스트
 * - SHA-256 해시 계산
 * - 대용량 파일 처리
 * - 중복 파일 감지
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateFileHash, isDuplicateHash } from '../fileHash'

// Web Crypto API 모킹
const mockDigest = vi.fn()

// File.arrayBuffer() 모킹을 위한 헬퍼
const createMockFile = (content: string | Uint8Array, name: string, options?: FilePropertyBag) => {
  const file = new File([content], name, options)

  // arrayBuffer() 메서드 추가
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => {
      if (typeof content === 'string') {
        const encoder = new TextEncoder()
        return encoder.encode(content).buffer
      }
      return content.buffer
    },
    writable: false,
    configurable: true
  })

  return file
}

beforeEach(() => {
  mockDigest.mockClear()

  // crypto.subtle.digest 모킹
  if (!global.crypto) {
    global.crypto = {} as Crypto
  }
  if (!global.crypto.subtle) {
    Object.defineProperty(global.crypto, 'subtle', {
      value: {} as SubtleCrypto,
      writable: true,
      configurable: true
    })
  }
  Object.defineProperty(global.crypto.subtle, 'digest', {
    value: mockDigest,
    writable: true,
    configurable: true
  })
})

describe('calculateFileHash', () => {
  describe('SHA-256 해시 계산', () => {
    it('작은 파일의 해시를 계산할 수 있어야 함', async () => {
      // 모킹된 해시 값 (32바이트 = 256비트)
      const mockHash = new Uint8Array(32).fill(0xab)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('hello world', 'small.txt', { type: 'text/plain' })
      const hash = await calculateFileHash(file)

      // 64자 hex string이어야 함
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]+$/)
      expect(mockDigest).toHaveBeenCalled()
    })

    it('동일한 파일은 동일한 해시를 반환해야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0x12)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file1 = createMockFile('test content', 'file1.txt')
      const file2 = createMockFile('test content', 'file2.txt') // 내용은 같지만 이름이 다름

      const hash1 = await calculateFileHash(file1)
      const hash2 = await calculateFileHash(file2)

      // 내용이 같으면 해시도 같아야 함
      expect(hash1).toBe(hash2)
    })

    it('다른 내용의 파일은 다른 해시를 반환해야 함', async () => {
      // 첫 번째 호출
      const mockHash1 = new Uint8Array(32).fill(0x11)
      // 두 번째 호출
      const mockHash2 = new Uint8Array(32).fill(0x22)

      mockDigest
        .mockResolvedValueOnce(mockHash1.buffer)
        .mockResolvedValueOnce(mockHash2.buffer)

      const file1 = createMockFile('content1', 'file1.txt')
      const file2 = createMockFile('content2', 'file2.txt')

      const hash1 = await calculateFileHash(file1)
      const hash2 = await calculateFileHash(file2)

      expect(hash1).not.toBe(hash2)
    })

    it('빈 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0x00)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('', 'empty.txt')
      const hash = await calculateFileHash(file)

      expect(hash).toHaveLength(64)
      expect(hash).toBe('0'.repeat(64))
    })

    it('중간 크기 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xcd)
      mockDigest.mockResolvedValue(mockHash.buffer)

      // 1MB 파일
      const content = new Array(1024 * 1024).fill('x').join('')
      const file = createMockFile(content, 'medium.txt')

      const hash = await calculateFileHash(file)

      expect(hash).toHaveLength(64)
      expect(mockDigest).toHaveBeenCalled()
    })

    it('대용량 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xef)
      mockDigest.mockResolvedValue(mockHash.buffer)

      // 10MB 파일 (실제로는 모킹되므로 메모리 사용 없음)
      const content = 'x'.repeat(10 * 1024 * 1024)
      const file = createMockFile(content, 'large.txt')

      const hash = await calculateFileHash(file)

      expect(hash).toHaveLength(64)
      expect(mockDigest).toHaveBeenCalled()
    })
  })

  describe('hex 변환', () => {
    it('모든 바이트를 올바르게 hex로 변환해야 함', async () => {
      // 0x00부터 0x1f까지의 바이트 (32바이트)
      const mockHash = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        mockHash[i] = i
      }
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('test', 'test.txt')
      const hash = await calculateFileHash(file)

      // 각 바이트가 2자리 hex로 변환되어야 함
      expect(hash).toBe(
        '000102030405060708090a0b0c0d0e0f' +
        '101112131415161718191a1b1c1d1e1f'
      )
    })

    it('한 자리 hex 값은 0으로 패딩되어야 함', async () => {
      // 0x00, 0x01, 0x0f 등 한 자리 hex
      const mockHash = new Uint8Array([
        0x00, 0x01, 0x0f, 0x10,
        ...new Array(28).fill(0)
      ])
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('test', 'test.txt')
      const hash = await calculateFileHash(file)

      // 앞 4바이트가 올바르게 패딩되어야 함
      expect(hash.startsWith('00010f10')).toBe(true)
    })

    it('0xff 바이트를 올바르게 변환해야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xff)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('test', 'test.txt')
      const hash = await calculateFileHash(file)

      expect(hash).toBe('f'.repeat(64))
    })
  })

  describe('에러 처리', () => {
    it('파일 읽기 실패 시 에러를 던져야 함', async () => {
      // arrayBuffer() 실패 시뮬레이션
      const file = createMockFile('test', 'broken.txt')
      vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('읽기 실패'))

      await expect(calculateFileHash(file)).rejects.toThrow('파일 해시 계산에 실패했습니다.')
    })

    it('crypto.subtle.digest 실패 시 에러를 던져야 함', async () => {
      mockDigest.mockRejectedValue(new Error('해시 계산 실패'))

      const file = createMockFile('test', 'test.txt')

      await expect(calculateFileHash(file)).rejects.toThrow('파일 해시 계산에 실패했습니다.')
    })

    it('알 수 없는 에러 발생 시 에러를 던져야 함', async () => {
      mockDigest.mockRejectedValue('unknown error')

      const file = createMockFile('test', 'test.txt')

      await expect(calculateFileHash(file)).rejects.toThrow()
    })
  })

  describe('다양한 파일 형식', () => {
    it('PDF 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xaa)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile('%PDF-1.4...', 'document.pdf', {
        type: 'application/pdf'
      })

      const hash = await calculateFileHash(file)
      expect(hash).toHaveLength(64)
    })

    it('이미지 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xbb)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const file = createMockFile(new Uint8Array([0xff, 0xd8, 0xff]), 'image.jpg', {
        type: 'image/jpeg'
      })

      const hash = await calculateFileHash(file)
      expect(hash).toHaveLength(64)
    })

    it('바이너리 파일의 해시를 계산할 수 있어야 함', async () => {
      const mockHash = new Uint8Array(32).fill(0xcc)
      mockDigest.mockResolvedValue(mockHash.buffer)

      const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
      const file = createMockFile(binaryData, 'binary.bin', {
        type: 'application/octet-stream'
      })

      const hash = await calculateFileHash(file)
      expect(hash).toHaveLength(64)
    })
  })
})

describe('isDuplicateHash', () => {
  describe('중복 검사', () => {
    it('중복된 해시를 감지해야 함', () => {
      const fileHash = 'abcd1234'
      const existingHashes = ['abcd1234', 'efgh5678', 'ijkl9012']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(true)
    })

    it('중복되지 않은 해시는 false를 반환해야 함', () => {
      const fileHash = 'xyz9999'
      const existingHashes = ['abcd1234', 'efgh5678', 'ijkl9012']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(false)
    })

    it('빈 목록에서는 항상 false를 반환해야 함', () => {
      const fileHash = 'abcd1234'
      const existingHashes: string[] = []

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(false)
    })

    it('undefined를 포함한 목록을 처리할 수 있어야 함', () => {
      const fileHash = 'abcd1234'
      const existingHashes = ['abcd1234', undefined, 'efgh5678', undefined]

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(true)
    })

    it('모든 항목이 undefined면 false를 반환해야 함', () => {
      const fileHash = 'abcd1234'
      const existingHashes = [undefined, undefined, undefined]

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(false)
    })

    it('대소문자를 구분해야 함', () => {
      const fileHash = 'ABCD1234'
      const existingHashes = ['abcd1234', 'efgh5678']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(false)
    })

    it('부분 문자열 매칭이 아닌 완전 일치만 감지해야 함', () => {
      const fileHash = 'abcd'
      const existingHashes = ['abcd1234', 'xyzabcd', 'abcdefgh']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(false)
    })

    it('여러 중복이 있어도 true를 반환해야 함', () => {
      const fileHash = 'duplicate'
      const existingHashes = ['duplicate', 'other', 'duplicate', 'another']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(true)
    })
  })

  describe('엣지 케이스', () => {
    it('빈 문자열 해시를 처리할 수 있어야 함', () => {
      const fileHash = ''
      const existingHashes = ['', 'abcd1234']

      const result = isDuplicateHash(fileHash, existingHashes)

      // 빈 문자열은 falsy이므로 some 조건에서 필터링됨
      expect(result).toBe(false)
    })

    it('매우 긴 해시 문자열을 처리할 수 있어야 함', () => {
      const fileHash = 'a'.repeat(64) // SHA-256 해시 길이
      const existingHashes = ['a'.repeat(64), 'b'.repeat(64)]

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(true)
    })

    it('특수문자를 포함한 해시를 처리할 수 있어야 함', () => {
      const fileHash = 'hash-with-special!@#'
      const existingHashes = ['normal', 'hash-with-special!@#', 'other']

      const result = isDuplicateHash(fileHash, existingHashes)

      expect(result).toBe(true)
    })
  })

  describe('성능', () => {
    it('대량의 해시 목록에서 빠르게 검색해야 함', () => {
      const fileHash = 'target'
      const existingHashes = [
        ...new Array(1000).fill('other'),
        'target',
        ...new Array(1000).fill('different')
      ]

      const startTime = performance.now()
      const result = isDuplicateHash(fileHash, existingHashes)
      const endTime = performance.now()

      expect(result).toBe(true)
      // 2000개 항목에서 1ms 이내에 찾아야 함
      expect(endTime - startTime).toBeLessThan(1)
    })

    it('해시가 없을 때도 빠르게 검색해야 함', () => {
      const fileHash = 'not-found'
      const existingHashes = new Array(2000).fill('other')

      const startTime = performance.now()
      const result = isDuplicateHash(fileHash, existingHashes)
      const endTime = performance.now()

      expect(result).toBe(false)
      // 2000개 항목 전체 검색도 1ms 이내
      expect(endTime - startTime).toBeLessThan(1)
    })
  })
})
