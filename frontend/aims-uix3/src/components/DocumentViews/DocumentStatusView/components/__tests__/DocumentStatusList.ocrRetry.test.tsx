/**
 * DocumentStatusList - OCR 재시도 기능 테스트
 *
 * @commit 0341ce03
 * @description OCR 실패 문서 자동/수동 재시도 기능 구현
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. OCR 에러 상태에서 클릭 가능한 재시도 버튼 렌더링
 * 2. OCR 정상 상태에서는 일반 텍스트 렌더링
 * 3. 재시도 버튼의 CSS 클래스 및 접근성 속성
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

describe('DocumentStatusList - OCR 재시도 기능 (commit 0341ce03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // OCR 에러 상태 재시도 버튼 렌더링 테스트
  // ============================================

  describe('[회귀] OCR 에러 상태 재시도 버튼', () => {
    it('OCR 에러 상태에서 클릭 가능한 버튼이 렌더링됨', () => {
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

      // 클릭 가능한 버튼이 있어야 함
      const clickableButton = container.querySelector('.status-cell-inner--clickable')
      expect(clickableButton).toBeTruthy()
      expect(clickableButton?.tagName.toLowerCase()).toBe('button')
    })

    it('OCR 에러 버튼에 aria-label이 있어야 함', () => {
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

      const button = container.querySelector('.status-cell-inner--clickable')
      expect(button?.getAttribute('aria-label')).toBe('OCR 재시도')
    })

    it('OCR 정상 완료 상태에서는 버튼이 아닌 span 렌더링', () => {
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

      // 클릭 가능한 버튼이 없어야 함
      const clickableButton = container.querySelector('.status-cell-inner--clickable')
      expect(clickableButton).toBeFalsy()
    })

    it('OCR 진행 중 상태에서는 버튼이 아닌 span 렌더링', () => {
      const doc = createMockDocument({
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

      const clickableButton = container.querySelector('.status-cell-inner--clickable')
      expect(clickableButton).toBeFalsy()
    })
  })

  // ============================================
  // 재시도 버튼 CSS 클래스 테스트
  // ============================================

  describe('[회귀] 재시도 버튼 스타일', () => {
    it('에러 상태 버튼에 올바른 CSS 클래스 적용', () => {
      const doc = createMockDocument({
        _id: 'style-test-doc',
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

      const button = container.querySelector('.status-cell-inner--clickable')
      expect(button?.classList.contains('status-cell-inner')).toBe(true)
      expect(button?.classList.contains('status-cell-inner--clickable')).toBe(true)
    })
  })

  // ============================================
  // 다중 문서에서 에러 문서만 버튼 렌더링
  // ============================================

  describe('[회귀] 다중 문서 에러 처리', () => {
    it('여러 문서 중 에러 문서만 재시도 버튼 표시', () => {
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
        }),
        createMockDocument({
          _id: 'pending-doc',
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'pending',
              message: '대기 중',
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

      // 에러 문서 1개만 버튼이어야 함
      const clickableButtons = container.querySelectorAll('.status-cell-inner--clickable')
      expect(clickableButtons.length).toBe(1)
    })

    it('여러 에러 문서가 있으면 각각 재시도 버튼 표시', () => {
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

      const clickableButtons = container.querySelectorAll('.status-cell-inner--clickable')
      expect(clickableButtons.length).toBe(2)
    })
  })

  // ============================================
  // 에러 코드별 테스트
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
      it(`${code} ${name} 에러에서 재시도 버튼 표시`, () => {
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

        const clickableButton = container.querySelector('.status-cell-inner--clickable')
        expect(clickableButton).toBeTruthy()
      })
    })
  })
})
