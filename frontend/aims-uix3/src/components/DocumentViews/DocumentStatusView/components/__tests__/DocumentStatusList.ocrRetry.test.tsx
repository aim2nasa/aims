/**
 * DocumentStatusList - 에러 상태 표시 + 클립보드 복사 테스트
 *
 * @issue #20 (에러 시 재시도 제거, 에러 메시지 클릭 복사)
 * @description 에러 상태에서 재시도 버튼 대신 클릭 시 에러 메시지를 클립보드에 복사
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. 에러 상태에서 재시도 button이 아닌 div 렌더링
 * 2. 에러 상태에서 클릭 가능한 div (복사 기능)
 * 3. aria-label="OCR 재시도" 없음 (재시도 제거 확인)
 * 4. aria-label="에러 메시지 복사" 존재
 * 5. 정상 완료 상태에서는 기존과 동일하게 렌더링
 * 6. 다중 문서에서 에러 문서만 에러 아이콘 표시
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

// Mock API
vi.mock('@/shared/lib/api', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ success: true })
  }
}))

// Mock AppleConfirmProvider
vi.mock('@/contexts/AppleConfirmProvider', () => ({
  useAppleConfirm: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true)
  })
}))

// ============================================
// 테스트 데이터
// ============================================

const createMockDocument = (overrides?: Partial<Document>): Document => ({
  _id: 'test-doc-1',
  originalName: 'test.pdf',
  uploaded_at: '2025-01-01T00:00:00.000Z',
  fileSize: 1024,
  mimeType: 'application/pdf',
  overallStatus: 'completed',
  progress: 100,
  ...overrides
})

describe('DocumentStatusList - 에러 상태 표시 + 클립보드 복사 (#20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // 에러 상태: 재시도 없음, 복사 가능한 div 렌더링
  // ============================================

  describe('[회귀] 에러 상태에서 재시도 버튼 없음, 복사용 div 존재', () => {
    it('에러 상태에서 button이 아닌 div가 렌더링됨 (재시도 제거)', () => {
      const doc = createMockDocument({
        _id: 'error-doc-1',
        overallStatus: 'error',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'error',
            message: '429 Too Many Requests',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      // 클릭 가능한 요소가 있음 (복사용)
      const clickable = container.querySelector('.status-cell-inner--clickable')
      expect(clickable).toBeTruthy()

      // button 태그가 아닌 div (재시도 버튼이 아님)
      expect(clickable?.tagName.toLowerCase()).not.toBe('button')
    })

    it('에러 상태에서 에러 아이콘과 "오류" 텍스트가 표시됨', () => {
      const doc = createMockDocument({
        _id: 'error-doc-2',
        overallStatus: 'error',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'error',
            message: '500 Internal Server Error',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      // 에러 상태 아이콘이 존재
      const errorIcon = container.querySelector('.status-error')
      expect(errorIcon).toBeTruthy()

      // 상태 텍스트 표시
      const statusLabel = container.querySelector('.status-label')
      expect(statusLabel).toBeTruthy()
    })

    it('에러 상태에서 aria-label="OCR 재시도" 없음 (재시도 제거)', () => {
      const doc = createMockDocument({
        _id: 'error-doc-3',
        overallStatus: 'error',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'error',
            message: '502 Bad Gateway',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const retryButton = container.querySelector('[aria-label="OCR 재시도"]')
      expect(retryButton).toBeFalsy()
    })

    it('에러 상태에서 aria-label="에러 메시지 복사" 존재', () => {
      const doc = createMockDocument({
        _id: 'error-doc-4',
        overallStatus: 'error',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'error',
            message: '429 Too Many Requests',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const copyEl = container.querySelector('[aria-label="에러 메시지 복사"]')
      expect(copyEl).toBeTruthy()
    })
  })

  // ============================================
  // 정상 상태에서는 기존과 동일
  // ============================================

  describe('[회귀] 정상 상태 렌더링 유지', () => {
    it('완료 상태에서는 복사용 클릭 요소가 없음 (기존과 동일)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.9817)',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const copyEl = container.querySelector('[aria-label="에러 메시지 복사"]')
      expect(copyEl).toBeFalsy()
    })

    it('진행 중 상태에서는 복사용 클릭 요소가 없음 (기존과 동일)', () => {
      const doc = createMockDocument({
        overallStatus: 'processing',
        progress: 50,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'pending',
            message: 'OCR 대기 중',
            timestamp: '2025-01-01T00:00:00.000Z'
          }
        }
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const copyEl = container.querySelector('[aria-label="에러 메시지 복사"]')
      expect(copyEl).toBeFalsy()
    })
  })

  // ============================================
  // 다중 문서에서 에러 문서 처리
  // ============================================

  describe('[회귀] 다중 문서 에러 처리', () => {
    it('여러 문서 중 에러 문서만 복사 가능', () => {
      const docs = [
        createMockDocument({
          _id: 'success-doc',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'completed',
              message: 'OCR 완료 (신뢰도: 0.95)',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        }),
        createMockDocument({
          _id: 'error-doc',
          overallStatus: 'error',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'error',
              message: '429 Rate Limit',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        })
      ]

      const { container } = render(
        <DocumentStatusList
          documents={docs}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      // 에러 문서 1개만 복사 가능
      const copyElements = container.querySelectorAll('[aria-label="에러 메시지 복사"]')
      expect(copyElements.length).toBe(1)
    })

    it('여러 에러 문서가 있으면 각각 복사 가능', () => {
      const docs = [
        createMockDocument({
          _id: 'error-doc-1',
          overallStatus: 'error',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'error',
              message: '429 Rate Limit',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        }),
        createMockDocument({
          _id: 'error-doc-2',
          overallStatus: 'error',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'error',
              message: '500 Server Error',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        })
      ]

      const { container } = render(
        <DocumentStatusList
          documents={docs}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const copyElements = container.querySelectorAll('[aria-label="에러 메시지 복사"]')
      expect(copyElements.length).toBe(2)

      // 에러 아이콘도 2개
      const errorIcons = container.querySelectorAll('.status-error')
      expect(errorIcons.length).toBe(2)
    })
  })

  // ============================================
  // 다양한 에러 코드에서도 동일 동작
  // ============================================

  describe('[회귀] 다양한 에러 코드 처리', () => {
    const errorCodes = [
      { code: '429', name: 'Rate Limit' },
      { code: '500', name: 'Internal Server Error' },
      { code: '502', name: 'Bad Gateway' },
      { code: '503', name: 'Service Unavailable' },
      { code: '400', name: 'Bad Request' },
      { code: '404', name: 'Not Found' }
    ]

    errorCodes.forEach(({ code, name }) => {
      it(`${code} ${name} 에러에서 복사 가능한 에러 표시`, () => {
        const doc = createMockDocument({
          _id: `error-${code}`,
          overallStatus: 'error',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'error',
              message: `${code} ${name}`,
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        })

        const { container } = render(
          <DocumentStatusList
            documents={[doc]}
            isLoading={false}
            isEmpty={false}
            error={null}
          />
        )

        // 복사 가능한 에러 요소
        const copyEl = container.querySelector('[aria-label="에러 메시지 복사"]')
        expect(copyEl).toBeTruthy()

        // 에러 아이콘 표시
        const errorIcon = container.querySelector('.status-error')
        expect(errorIcon).toBeTruthy()
      })
    })
  })
})
