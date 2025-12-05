/**
 * DocumentStatusList - OCR/AR 뱃지 시스템 회귀 테스트
 *
 * @commit dcbe7d1
 * @description OCR 및 AR 문서 뱃지 시스템 추가
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. OCR 뱃지가 신뢰도별로 올바른 색상 클래스 적용
 * 2. AR 뱃지가 연간 보고서 문서에만 표시
 * 3. OCR + AR 뱃지 동시 표시 가능
 * 4. OCR 신뢰도 메시지 파싱 정확도
 * 5. 뱃지 크기 및 배치 일관성
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

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

describe('DocumentStatusList - OCR/AR 뱃지 시스템 (commit dcbe7d1)', () => {
  // ============================================
  // OCR 뱃지 색상 시스템 테스트
  // ============================================

  describe('[회귀] OCR 신뢰도별 색상 분류', () => {
    it('신뢰도 ≥95%는 "excellent" 클래스 적용', () => {
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge).toBeTruthy()
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
      expect(ocrBadge?.textContent).toBe('OCR')
    })

    it('신뢰도 85~95%는 "high" 클래스 적용', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.8734)',
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
      expect(ocrBadge?.classList.contains('ocr-high')).toBe(true)
    })

    it('신뢰도 70~85%는 "medium" 클래스 적용', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.7523)',
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
      expect(ocrBadge?.classList.contains('ocr-medium')).toBe(true)
    })

    it('신뢰도 50~70%는 "low" 클래스 적용', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.6142)',
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
      expect(ocrBadge?.classList.contains('ocr-low')).toBe(true)
    })

    it('신뢰도 <50%는 "very-low" 클래스 적용', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.4215)',
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
      expect(ocrBadge?.classList.contains('ocr-very-low')).toBe(true)
    })
  })

  // ============================================
  // OCR 신뢰도 메시지 파싱 테스트
  // ============================================

  describe('[회귀] OCR 신뢰도 메시지 파싱', () => {
    it('stages.ocr.message에서 신뢰도 정확히 추출 - excellent (0.9817)', () => {
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('stages.ocr.message에서 신뢰도 정확히 추출 - high (0.8734)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.8734)',
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
      expect(ocrBadge?.classList.contains('ocr-high')).toBe(true)
    })

    it('stages.ocr.message에서 신뢰도 정확히 추출 - medium (0.7012)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.7012)',
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
      expect(ocrBadge?.classList.contains('ocr-medium')).toBe(true)
    })

    it('stages.ocr.message에서 신뢰도 정확히 추출 - low (0.5678)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.5678)',
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
      expect(ocrBadge?.classList.contains('ocr-low')).toBe(true)
    })

    it('stages.ocr.message에서 신뢰도 정확히 추출 - very-low (0.3421)', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.3421)',
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
      expect(ocrBadge?.classList.contains('ocr-very-low')).toBe(true)
    })

    it('OCR 신뢰도가 없으면 뱃지 표시 안 함', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료',
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
      expect(ocrBadge).toBeFalsy()
    })

    it('stages.ocr가 문자열이면 뱃지 표시 안 함', () => {
      const doc = createMockDocument({
        stages: {
          // @ts-expect-error - 테스트를 위한 의도적 타입 불일치 (백엔드가 문자열을 반환하는 경우 테스트)
          ocr: 'completed'
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
      expect(ocrBadge).toBeFalsy()
    })
  })

  // ============================================
  // AR 뱃지 표시 테스트
  // ============================================

  describe('[회귀] AR 뱃지 표시', () => {
    it('is_annual_report가 true면 AR 뱃지 표시', () => {
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
      expect(arBadge?.textContent).toBe('AR')
    })

    it('is_annual_report가 false면 AR 뱃지 표시 안 함', () => {
      const doc = createMockDocument({
        is_annual_report: false
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
      expect(arBadge).toBeFalsy()
    })

    it('is_annual_report가 없으면 AR 뱃지 표시 안 함', () => {
      const doc = createMockDocument()

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const arBadge = container.querySelector('.document-ar-badge')
      expect(arBadge).toBeFalsy()
    })
  })

  // ============================================
  // OCR + AR 뱃지 동시 표시 테스트
  // ============================================

  describe('[회귀] OCR + AR 뱃지 동시 표시', () => {
    it('OCR과 AR 뱃지가 동시에 표시되어야 함', () => {
      const doc = createMockDocument({
        is_annual_report: true,
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      const arBadge = container.querySelector('.document-ar-badge')

      expect(ocrBadge).toBeTruthy()
      expect(arBadge).toBeTruthy()
      expect(ocrBadge?.textContent).toBe('OCR')
      expect(arBadge?.textContent).toBe('AR')
    })

    it('동일한 문서에서 OCR 신뢰도 색상과 AR 뱃지가 독립적으로 작동', () => {
      const doc = createMockDocument({
        is_annual_report: true,
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.7234)',
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
      const arBadge = container.querySelector('.document-ar-badge')

      expect(ocrBadge?.classList.contains('ocr-medium')).toBe(true)
      expect(arBadge).toBeTruthy()
    })
  })

  // ============================================
  // 뱃지 크기 및 CSS 클래스 검증
  // ============================================

  describe('[회귀] 뱃지 크기 및 스타일', () => {
    it('OCR 뱃지에 기본 클래스가 적용되어야 함', () => {
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

      const ocrBadge = container.querySelector('.document-ocr-badge')
      expect(ocrBadge?.classList.contains('document-ocr-badge')).toBe(true)
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('AR 뱃지에 기본 클래스가 적용되어야 함', () => {
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
      expect(arBadge?.classList.contains('document-ar-badge')).toBe(true)
    })
  })

  // ============================================
  // document.ocr.confidence 직접 필드 테스트
  // ============================================

  describe('[회귀] document.ocr.confidence 직접 필드 지원', () => {
    it('ocr.confidence 필드가 있으면 뱃지 표시', () => {
      const doc = createMockDocument({
        ocr: {
          confidence: '0.9817',
          full_text: 'Test OCR text',
          summary: 'Test summary'
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
      expect(ocrBadge).toBeTruthy()
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('ocr.confidence와 stages.ocr.message 둘 다 있으면 confidence 우선', () => {
      const doc = createMockDocument({
        ocr: {
          confidence: '0.9817', // excellent
          full_text: 'Test',
          summary: 'Test'
        },
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.5000)', // low
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
      // ocr.confidence가 우선이므로 excellent
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })
  })

  // ============================================
  // 엣지 케이스 테스트
  // ============================================

  describe('[회귀] 엣지 케이스', () => {
    it('신뢰도가 정확히 경계값(0.95)이면 excellent', () => {
      const doc = createMockDocument({
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
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('신뢰도가 0.0이면 very-low', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 0.0)',
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
      expect(ocrBadge?.classList.contains('ocr-very-low')).toBe(true)
    })

    it('신뢰도가 1.0이면 excellent', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: 1.0)',
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
      expect(ocrBadge?.classList.contains('ocr-excellent')).toBe(true)
    })

    it('잘못된 신뢰도 형식이면 뱃지 표시 안 함', () => {
      const doc = createMockDocument({
        stages: {
          ocr: {
            name: 'OCR 처리',
            status: 'completed',
            message: 'OCR 완료 (신뢰도: invalid)',
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
      expect(ocrBadge).toBeFalsy()
    })
  })

  // ============================================
  // 다중 문서 렌더링 테스트
  // ============================================

  describe('[회귀] 다중 문서에서 뱃지 독립성', () => {
    it('여러 문서가 각각 올바른 뱃지를 표시해야 함', () => {
      const docs = [
        createMockDocument({
          _id: 'doc-1',
          is_annual_report: true,
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'completed',
              message: 'OCR 완료 (신뢰도: 0.9817)',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        }),
        createMockDocument({
          _id: 'doc-2',
          is_annual_report: false,
          stages: {
            ocr: {
              name: 'OCR 처리',
              status: 'completed',
              message: 'OCR 완료 (신뢰도: 0.5234)',
              timestamp: '2025-01-01T00:00:00.000Z'
            }
          }
        }),
        createMockDocument({
          _id: 'doc-3',
          is_annual_report: true
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

      const ocrBadges = container.querySelectorAll('.document-ocr-badge')
      const arBadges = container.querySelectorAll('.document-ar-badge')

      // OCR 뱃지: doc-1 (excellent), doc-2 (low)
      expect(ocrBadges.length).toBe(2)

      // AR 뱃지: doc-1, doc-3
      expect(arBadges.length).toBe(2)
    })
  })
})
