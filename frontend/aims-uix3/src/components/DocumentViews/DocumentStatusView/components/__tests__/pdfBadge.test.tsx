/**
 * PDF 변환 배지 테스트
 *
 * @since 2025-12-14
 * @commit 748bb43e - PDF 변환 배지 UI 및 안정성 개선
 *
 * 이 테스트는 다음을 검증합니다:
 * 1. 변환 대상 확장자에만 배지 표시 (pptx, ppt, xlsx, xls, docx, doc, hwp, txt)
 * 2. 상태별 CSS 클래스 적용 (completed/processing/pending/failed)
 * 3. 상태별 아이콘 렌더링
 * 4. 실패 상태 재시도 버튼 표시
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentStatusList } from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

// Mock API
vi.mock('@/services/api', () => ({
  default: {
    post: vi.fn()
  }
}))

// Mock showAlert
vi.mock('@/shared/ui/AlertDialog', () => ({
  useShowAlert: () => vi.fn().mockResolvedValue(undefined)
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
  ...overrides,
})

// ============================================
// 1. 변환 대상 확장자 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 변환 대상 확장자 (commit 748bb43e)', () => {
  const convertibleExtensions = ['pptx', 'ppt', 'xlsx', 'xls', 'docx', 'doc', 'hwp', 'txt']

  convertibleExtensions.forEach((ext) => {
    it(`${ext.toUpperCase()} 파일에 PDF 변환 배지가 표시되어야 함`, () => {
      const doc = createMockDocument({
        originalName: `document.${ext}`,
        conversionStatus: 'pending',
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const pdfBadge = container.querySelector('.pdf-conversion-badge')
      expect(pdfBadge).toBeTruthy()
    })
  })

  it('PDF 파일에는 PDF 변환 배지가 표시되지 않아야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.pdf',
      mimeType: 'application/pdf',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge).toBeFalsy()
  })

  it('JPG 이미지 파일에는 PDF 변환 배지가 표시되지 않아야 함', () => {
    const doc = createMockDocument({
      originalName: 'image.jpg',
      mimeType: 'image/jpeg',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge).toBeFalsy()
  })

  it('isConvertible이 명시적으로 false면 배지가 표시되지 않아야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      isConvertible: false,
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge).toBeFalsy()
  })

  it('conversionStatus가 not_required면 배지가 표시되지 않아야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'not_required',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge).toBeFalsy()
  })
})

// ============================================
// 2. 상태별 CSS 클래스 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 상태별 CSS 클래스 (commit 748bb43e)', () => {
  const statusClasses = [
    { status: 'completed', expectedClass: 'pdf-conversion-badge--completed' },
    { status: 'processing', expectedClass: 'pdf-conversion-badge--processing' },
    { status: 'pending', expectedClass: 'pdf-conversion-badge--pending' },
    { status: 'failed', expectedClass: 'pdf-conversion-badge--failed' },
  ]

  statusClasses.forEach(({ status, expectedClass }) => {
    it(`${status} 상태에 ${expectedClass} 클래스가 적용되어야 함`, () => {
      const doc = createMockDocument({
        originalName: 'document.xlsx',
        conversionStatus: status,
      })

      const { container } = render(
        <DocumentStatusList
          documents={[doc]}
          isLoading={false}
          isEmpty={false}
          error={null}
        />
      )

      const pdfBadge = container.querySelector('.pdf-conversion-badge')
      expect(pdfBadge).toBeTruthy()
      expect(pdfBadge?.classList.contains(expectedClass)).toBe(true)
    })
  })

  it('변환 상태가 없는 변환 대상 파일은 pending 클래스가 기본 적용', () => {
    const doc = createMockDocument({
      originalName: 'document.docx',
      // conversionStatus 없음
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge).toBeTruthy()
    expect(pdfBadge?.classList.contains('pdf-conversion-badge--pending')).toBe(true)
  })
})

// ============================================
// 3. 상태별 아이콘 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 상태별 아이콘 (commit 748bb43e)', () => {
  it('completed 상태에 체크마크 아이콘이 표시되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'completed',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    const svg = pdfBadge?.querySelector('svg.pdf-badge-icon')
    expect(svg).toBeTruthy()
    // completed 아이콘: 녹색 원 + 체크마크 path
    const circle = svg?.querySelector('circle[fill="#34c759"]')
    expect(circle).toBeTruthy()
  })

  it('processing 상태에 스피너 아이콘이 표시되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'processing',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    const svg = pdfBadge?.querySelector('svg.pdf-badge-icon')
    expect(svg).toBeTruthy()
    // processing 아이콘: --spin 클래스
    expect(svg?.classList.contains('pdf-badge-icon--spin')).toBe(true)
  })

  it('pending 상태에 점 세개 아이콘이 표시되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'pending',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    const svg = pdfBadge?.querySelector('svg.pdf-badge-icon')
    expect(svg).toBeTruthy()
    // pending 아이콘: 세 개의 원 (cx="3", "6", "9")
    const circles = svg?.querySelectorAll('circle')
    expect(circles?.length).toBe(3)
  })

  it('failed 상태에 X 아이콘이 표시되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'failed',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    const svg = pdfBadge?.querySelector('svg.pdf-badge-icon')
    expect(svg).toBeTruthy()
    // failed 아이콘: 빨간색 X 경로 (stroke="#ff3b30")
    const path = svg?.querySelector('path[stroke="#ff3b30"]')
    expect(path).toBeTruthy()
  })
})

// ============================================
// 4. 재시도 버튼 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 재시도 버튼 (commit 748bb43e)', () => {
  it('failed 상태에서만 버튼이 렌더링되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'failed',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const retryButton = container.querySelector('button.pdf-conversion-badge--failed')
    expect(retryButton).toBeTruthy()
    expect(retryButton?.getAttribute('aria-label')).toBe('PDF 변환 재시도')
  })

  it('completed 상태에서는 버튼이 아닌 span이 렌더링되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'completed',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge?.tagName.toLowerCase()).toBe('span')
  })

  it('processing 상태에서는 버튼이 아닌 span이 렌더링되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'processing',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge?.tagName.toLowerCase()).toBe('span')
  })

  it('pending 상태에서도 버튼이 렌더링되어야 함 (stuck 재시도 지원)', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'pending',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge?.tagName.toLowerCase()).toBe('button')
    expect(pdfBadge?.getAttribute('aria-label')).toBe('PDF 변환 재시도')
  })
})

// ============================================
// 5. PDF 텍스트 표시 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 텍스트 표시 (commit 748bb43e)', () => {
  it('배지에 "pdf" 텍스트가 표시되어야 함', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'completed',
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfText = container.querySelector('.pdf-badge-text')
    expect(pdfText).toBeTruthy()
    expect(pdfText?.textContent).toBe('pdf')
  })
})

// ============================================
// 6. upload.conversion_status 필드 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - upload 객체 상태 (commit 748bb43e)', () => {
  it('upload.conversion_status가 있으면 해당 상태 사용', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      upload: {
        conversion_status: 'completed',
      } as any,
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    expect(pdfBadge?.classList.contains('pdf-conversion-badge--completed')).toBe(true)
  })

  it('conversionStatus가 upload.conversion_status보다 우선', () => {
    const doc = createMockDocument({
      originalName: 'document.xlsx',
      conversionStatus: 'failed',
      upload: {
        conversion_status: 'completed',
      } as any,
    })

    const { container } = render(
      <DocumentStatusList
        documents={[doc]}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadge = container.querySelector('.pdf-conversion-badge')
    // conversionStatus가 우선이므로 failed
    expect(pdfBadge?.classList.contains('pdf-conversion-badge--failed')).toBe(true)
  })
})

// ============================================
// 7. 다중 문서 렌더링 테스트
// ============================================

describe('[회귀] PDF 변환 배지 - 다중 문서 (commit 748bb43e)', () => {
  it('여러 문서가 각각 올바른 변환 상태 배지를 표시해야 함', () => {
    const docs = [
      createMockDocument({
        _id: 'doc-1',
        originalName: 'doc1.xlsx',
        conversionStatus: 'completed',
      }),
      createMockDocument({
        _id: 'doc-2',
        originalName: 'doc2.pptx',
        conversionStatus: 'processing',
      }),
      createMockDocument({
        _id: 'doc-3',
        originalName: 'doc3.pdf', // PDF - 배지 없음
      }),
      createMockDocument({
        _id: 'doc-4',
        originalName: 'doc4.docx',
        conversionStatus: 'failed',
      }),
    ]

    const { container } = render(
      <DocumentStatusList
        documents={docs}
        isLoading={false}
        isEmpty={false}
        error={null}
      />
    )

    const pdfBadges = container.querySelectorAll('.pdf-conversion-badge')
    // PDF 파일 제외 3개만 배지 있음
    expect(pdfBadges.length).toBe(3)

    // 각 상태 확인
    const completedBadge = container.querySelector('.pdf-conversion-badge--completed')
    const processingBadge = container.querySelector('.pdf-conversion-badge--processing')
    const failedBadge = container.querySelector('.pdf-conversion-badge--failed')

    expect(completedBadge).toBeTruthy()
    expect(processingBadge).toBeTruthy()
    expect(failedBadge).toBeTruthy()
  })
})
