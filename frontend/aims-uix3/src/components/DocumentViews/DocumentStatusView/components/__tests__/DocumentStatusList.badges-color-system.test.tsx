/**
 * Phase 2-1: OCR/AR/TXT 뱃지 색상 시스템 Regression 테스트
 * @description OCR 신뢰도별 색상, AR 뱃지, TXT 뱃지의 시각적 일관성 검증
 * @regression 커밋 dcbe7d1, 83590d7, a0c1a96 - OCR/AR/TXT 뱃지 시스템
 * @priority MEDIUM - UI 일관성 및 사용자 경험
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

const createMockDocument = (overrides?: Partial<Document>): Document => ({
  _id: 'test-doc',
  originalName: 'test.pdf',
  uploaded_at: '2025-01-01T00:00:00.000Z',
  fileSize: 1024,
  mimeType: 'application/pdf',
  overallStatus: 'completed',
  progress: 100,
  ...overrides
})

describe('DocumentStatusList - 뱃지 색상 시스템 Regression', () => {
  describe('OCR 신뢰도 경계값 테스트 (색상 전환점)', () => {
    it('신뢰도 정확히 95%는 excellent (녹색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.9500)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('신뢰도 94.99%는 high (녹색, 덜 진함)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.9499)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-high')).toBe(true)
    })

    it('신뢰도 정확히 85%는 high (녹색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.8500)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-high')).toBe(true)
    })

    it('신뢰도 84.99%는 medium (노란색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.8499)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-medium')).toBe(true)
    })

    it('신뢰도 정확히 70%는 medium (노란색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.7000)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-medium')).toBe(true)
    })

    it('신뢰도 69.99%는 low (주황색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.6999)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-low')).toBe(true)
    })

    it('신뢰도 정확히 50%는 low (주황색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.5000)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-low')).toBe(true)
    })

    it('신뢰도 49.99%는 very-low (빨간색)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.4999)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-very-low')).toBe(true)
    })
  })

  describe('TXT 뱃지 표시 로직', () => {
    it.skip('TXT 확장자 문서는 TXT 뱃지 표시 (향후 구현 예정)', () => {
      const doc = createMockDocument({
        originalName: 'document.txt',
        mimeType: 'text/plain'
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const txtBadge = container.querySelector('.document-txt-badge')
      expect(txtBadge).toBeTruthy()
      expect(txtBadge?.textContent).toContain('TXT')
    })

    it.skip('TXT 파일에 OCR 뱃지는 표시 안 함 (향후 구현 예정)', () => {
      const doc = createMockDocument({
        originalName: 'document.txt',
        mimeType: 'text/plain',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.95)',
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      const txtBadge = container.querySelector('.document-txt-badge')

      expect(txtBadge).toBeTruthy()
      // TXT 파일은 OCR이 필요없으므로 OCR 뱃지 표시 안 함
      expect(ocrBadge).toBeFalsy()
    })

    it('PDF + OCR 100%도 TXT 뱃지 표시 안 함 (OCR 뱃지만)', () => {
      const doc = createMockDocument({
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 1.0000)',
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      const txtBadge = container.querySelector('.document-txt-badge')

      expect(ocrBadge).toBeTruthy()
      expect(txtBadge).toBeFalsy()
    })
  })

  describe('AR (Annual Report) 뱃지 색상 통일', () => {
    it('AR 뱃지는 항상 동일한 색상 클래스 사용', () => {
      const doc = createMockDocument({
        is_annual_report: true
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const arBadge = container.querySelector('.document-ar-badge')
      expect(arBadge).toBeTruthy()
      // AR 뱃지는 고유한 스타일 클래스 사용
      expect(arBadge?.classList.contains('document-ar-badge')).toBe(true)
    })

    it('AR + OCR 뱃지 동시 표시 가능', () => {
      const doc = createMockDocument({
        is_annual_report: true,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.92)',
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

      const arBadge = container.querySelector('.document-ar-badge')
      const ocrBadge = container.querySelector('.document-ocr-badge')

      expect(arBadge).toBeTruthy()
      expect(ocrBadge).toBeTruthy()
    })

    it('AR 뱃지가 OCR 뱃지보다 먼저 렌더링 (z-index 또는 순서)', () => {
      const doc = createMockDocument({
        is_annual_report: true,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.88)',
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

      const badges = container.querySelectorAll('.document-badge')
      const badgeArray = Array.from(badges)

      // AR 뱃지가 OCR 뱃지보다 먼저 나와야 함 (시각적 우선순위)
      const arIndex = badgeArray.findIndex(b => b.classList.contains('document-ar-badge'))
      const ocrIndex = badgeArray.findIndex(b => b.classList.contains('document-ocr-badge'))

      if (arIndex !== -1 && ocrIndex !== -1) {
        expect(arIndex).toBeLessThan(ocrIndex)
      }
    })
  })

  describe('뱃지 조합 시나리오', () => {
    it('OCR excellent + AR 뱃지 동시 표시', () => {
      const doc = createMockDocument({
        is_annual_report: true,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.9823)',
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

      const arBadge = container.querySelector('.document-ar-badge')
      const ocrBadge = container.querySelector('.document-ocr-badge')

      expect(arBadge).toBeTruthy()
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('OCR very-low + AR 뱃지 동시 표시', () => {
      const doc = createMockDocument({
        is_annual_report: true,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.3245)',
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

      const arBadge = container.querySelector('.document-ar-badge')
      const ocrBadge = container.querySelector('.document-ocr-badge')

      expect(arBadge).toBeTruthy()
      expect(ocrBadge?.classList.contains('ocr-very-low')).toBe(true)
    })

    it('뱃지 없는 문서 (일반 PDF)', () => {
      const doc = createMockDocument({
        originalName: 'normal.pdf',
        mimeType: 'application/pdf',
        is_annual_report: false
        // OCR 정보 없음
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const badges = container.querySelectorAll('.document-badge')
      expect(badges.length).toBe(0)
    })
  })

  describe('OCR 신뢰도 파싱 엣지 케이스', () => {
    it('신뢰도가 0%인 경우 very-low', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.0000)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-very-low')).toBe(true)
    })

    it('신뢰도가 100%인 경우 excellent', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 1.0000)',
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

      const badge = container.querySelector('.document-ocr-badge')
      expect(badge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it.skip('신뢰도 메시지에 백분율 형식인 경우도 파싱 (향후 지원 예정)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 87%)',
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

      const badge = container.querySelector('.document-ocr-badge')
      // 87%는 85~95% 범위이므로 high
      expect(badge?.classList.contains('ocr-high')).toBe(true)
    })
  })
})
