/**
 * 시스템 중복 검사 상태 분류 Regression 테스트
 *
 * @bug 시스템 해시 중복 검사(checkSystemDuplicate)에서 중복 발견 시
 *      'error' 상태로 분류되던 버그 수정 검증
 * @fix 중복 파일은 실제 오류가 아니므로 'skipped'로 분류해야 함
 * @date 2026-03-26
 *
 * 검증 방식:
 * 1. 소스 코드 패턴 검증 — checkSystemDuplicate 중복 분기에서 'skipped' 사용 확인
 * 2. checkSystemDuplicate 함수 단위 테스트 — 중복 결과 반환 검증
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('시스템 중복 검사 상태 분류 (Regression)', () => {
  /**
   * 핵심 regression 테스트:
   * checkSystemDuplicate 중복 분기에서 updateFileStatus가 'skipped'를 사용하는지 검증
   * 'error'로 회귀하면 이 테스트가 실패함
   */
  describe('소스 코드 패턴 검증', () => {
    const sourceFilePath = path.resolve(
      __dirname,
      '../DocumentRegistrationView.tsx'
    )
    const sourceCode = fs.readFileSync(sourceFilePath, 'utf-8')

    it('checkSystemDuplicate 중복 분기에서 updateFileStatus는 "skipped"를 사용해야 함', () => {
      // checkSystemDuplicate 호출부터 해당 if 블록 끝까지의 코드 블록 추출
      const systemDupBlockRegex =
        /checkSystemDuplicate\(file[\s\S]*?if\s*\(systemDupResult\.isDuplicate[\s\S]*?continue\s*\n\s*\}/
      const match = sourceCode.match(systemDupBlockRegex)

      expect(match).not.toBeNull()

      const block = match![0]

      // 'skipped' 상태를 사용해야 함
      expect(block).toContain("updateFileStatus(file, 'skipped'")

      // 'error' 상태를 사용하면 안 됨 (regression 방지)
      expect(block).not.toContain("updateFileStatus(file, 'error'")
    })

    it('checkSystemDuplicate 중복 분기의 로그 레벨은 "error"가 아니어야 함', () => {
      const systemDupBlockRegex =
        /checkSystemDuplicate\(file[\s\S]*?if\s*\(systemDupResult\.isDuplicate[\s\S]*?continue\s*\n\s*\}/
      const match = sourceCode.match(systemDupBlockRegex)

      expect(match).not.toBeNull()

      const block = match![0]

      // addLog의 첫 번째 인자가 'error'이면 안 됨
      expect(block).not.toMatch(/addLog\(\s*'error'/)
    })

    it('2단계 중복 검사(checkDuplicateFile)도 "skipped"를 사용해야 함 (일관성 검증)', () => {
      const dupFileBlockRegex =
        /checkDuplicateFile\(file[\s\S]*?if\s*\(duplicateResult\.isDuplicate[\s\S]*?continue\s*\n\s*\}/
      const match = sourceCode.match(dupFileBlockRegex)

      expect(match).not.toBeNull()

      const block = match![0]

      // 2단계도 'skipped' 사용
      expect(block).toContain("updateFileStatus(file, 'skipped'")
      expect(block).not.toContain("updateFileStatus(file, 'error'")
    })
  })

  describe('checkSystemDuplicate 함수 단위 테스트', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('중복 파일 감지 시 isDuplicate=true와 existingDocument를 반환해야 함', async () => {
      // duplicateChecker 모듈을 동적 import하여 mock 적용
      const mockHash = 'sha256-test-hash-abc123'
      const mockExistingDoc = {
        documentId: 'doc-existing-123',
        fileName: 'existing-file.pdf',
        customerId: 'customer-456',
        customerName: '홍길동',
        uploadedAt: '2026-03-25T10:00:00Z',
      }

      // calculateFileHash mock
      vi.doMock('@/features/customer/utils/fileHash', () => ({
        calculateFileHash: vi.fn().mockResolvedValue(mockHash),
      }))

      // api mock — 중복 응답
      vi.doMock('@/shared/lib/api', () => ({
        api: {
          post: vi.fn().mockResolvedValue({
            isDuplicate: true,
            existingDocument: mockExistingDoc,
          }),
        },
      }))

      const { checkSystemDuplicate } = await import(
        '@/shared/lib/fileValidation/duplicateChecker'
      )

      const file = new File(['test-content'], 'test.pdf', {
        type: 'application/pdf',
      })
      const result = await checkSystemDuplicate(file, 'customer-456')

      expect(result.isDuplicate).toBe(true)
      expect(result.existingDocument).toBeDefined()
      expect(result.existingDocument?.documentId).toBe('doc-existing-123')
      expect(result.existingDocument?.customerName).toBe('홍길동')
      expect(result.fileHash).toBe(mockHash)
    })

    it('중복 아닌 경우 isDuplicate=false를 반환해야 함', async () => {
      const mockHash = 'sha256-unique-hash-xyz789'

      vi.doMock('@/features/customer/utils/fileHash', () => ({
        calculateFileHash: vi.fn().mockResolvedValue(mockHash),
      }))

      vi.doMock('@/shared/lib/api', () => ({
        api: {
          post: vi.fn().mockResolvedValue({
            isDuplicate: false,
          }),
        },
      }))

      const { checkSystemDuplicate } = await import(
        '@/shared/lib/fileValidation/duplicateChecker'
      )

      const file = new File(['unique-content'], 'unique.pdf', {
        type: 'application/pdf',
      })
      const result = await checkSystemDuplicate(file, 'customer-789')

      expect(result.isDuplicate).toBe(false)
      expect(result.existingDocument).toBeUndefined()
    })
  })
})
