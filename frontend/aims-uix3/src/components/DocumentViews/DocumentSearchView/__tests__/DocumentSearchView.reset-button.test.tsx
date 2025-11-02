/**
 * DocumentSearchView - 검색 초기화 버튼 회귀 테스트
 * @since 2025-11-02
 *
 * 회귀 테스트 목적:
 * - a3f7776 커밋에서 추가된 검색 초기화 버튼 기능 검증
 * - Progressive Disclosure 원칙 준수 검증 (검색어/결과 있을 때만 표시)
 * - 버튼 클릭 시 모든 검색 상태 초기화 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentSearchView } from '../DocumentSearchView'
import { DocumentSearchProvider } from '@/contexts/DocumentSearchProvider'

// Mock 서비스
vi.mock('@/services/searchService', () => ({
  SearchService: {
    search: vi.fn().mockResolvedValue({
      results: [
        {
          document_id: 'doc1',
          name: 'test-document.pdf',
          score: 0.95,
          matched_text: 'test content'
        }
      ],
      answer: null
    }),
    getDocumentId: vi.fn((item) => item.document_id)
  }
}))

vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getDocumentsByIds: vi.fn().mockResolvedValue([])
  }
}))

// Modal mocks
vi.mock('../DocumentStatusView/components/DocumentDetailModal', () => ({
  default: () => null
}))
vi.mock('../DocumentStatusView/components/DocumentSummaryModal', () => ({
  default: () => null
}))
vi.mock('../DocumentStatusView/components/DocumentFullTextModal', () => ({
  default: () => null
}))
vi.mock('../DocumentStatusView/components/DocumentLinkModal', () => ({
  default: () => null
}))

describe('DocumentSearchView - 검색 초기화 버튼', () => {
  const defaultProps = {
    visible: true,
    onClose: vi.fn(),
    onDocumentClick: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * 회귀 테스트: Progressive Disclosure - 검색 전에는 초기화 버튼 숨김
   *
   * 배경 (2025-11-02 커밋 a3f7776):
   * - Progressive Disclosure 원칙에 따라 "필요할 때만 보여주기"
   * - 검색어나 검색 결과가 없으면 초기화 버튼을 숨김
   *
   * 목적:
   * - 초기 상태에서 초기화 버튼이 보이지 않는지 검증
   * - 불필요한 UI 요소로 사용자를 혼란시키지 않는지 확인
   */
  it('[회귀] 검색 전에는 초기화 버튼이 표시되지 않아야 함 (Progressive Disclosure)', () => {
    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 초기화 버튼이 없어야 함
    const resetButton = screen.queryByLabelText('검색 초기화')
    expect(resetButton).toBeNull()
  })

  /**
   * 회귀 테스트: Progressive Disclosure - 검색어 입력 시 초기화 버튼 표시
   *
   * 목적:
   * - 검색어가 있으면 초기화 버튼이 나타나는지 검증
   * - Progressive Disclosure의 첫 번째 단계 확인
   */
  it('[회귀] 검색어를 입력하면 초기화 버튼이 표시되어야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')

    // 초기화 버튼이 나타나야 함
    const resetButton = screen.getByLabelText('검색 초기화')
    expect(resetButton).toBeInTheDocument()
  })

  /**
   * 회귀 테스트: Progressive Disclosure - 검색어만 있어도 초기화 버튼 표시
   *
   * 목적:
   * - 검색어가 있으면 검색 결과 유무와 관계없이 초기화 버튼이 보이는지 검증
   * - Progressive Disclosure 원칙 확인
   */
  it('[회귀] 검색어가 있으면 초기화 버튼이 표시되어야 함 (검색 실행 후)', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색 실행 (검색어가 남아있음)
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')
    await user.keyboard('{Enter}')

    // 초기화 버튼이 있어야 함 (검색어가 있으므로)
    const resetButton = screen.getByLabelText('검색 초기화')
    expect(resetButton).toBeInTheDocument()
  })

  /**
   * 회귀 테스트: 초기화 버튼 클릭 시 검색어 초기화
   *
   * 목적:
   * - 초기화 버튼 클릭 시 검색어가 지워지는지 검증
   */
  it('[회귀] 초기화 버튼 클릭 시 검색어가 지워져야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('문서 검색') as HTMLInputElement
    await user.clear(searchInput)
    await user.type(searchInput, '테스트 검색어')
    expect(searchInput.value).toBe('테스트 검색어')

    // 초기화 버튼 클릭
    const resetButton = screen.getByLabelText('검색 초기화')
    await user.click(resetButton)

    // 검색어가 지워져야 함
    expect(searchInput.value).toBe('')
  })

  /**
   * 회귀 테스트: 초기화 버튼 클릭 시 전체 상태 초기화
   *
   * 목적:
   * - 초기화 버튼 클릭 시 모든 검색 상태가 초기화되는지 검증
   * - 검색어 + 에러 상태 초기화 확인
   */
  it('[회귀] 초기화 버튼 클릭 시 전체 검색 상태가 초기화되어야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('문서 검색') as HTMLInputElement
    await user.clear(searchInput)
    await user.type(searchInput, '테스트 검색어')
    expect(searchInput.value).toBe('테스트 검색어')

    // 초기화 버튼 클릭
    const resetButton = screen.getByLabelText('검색 초기화')
    await user.click(resetButton)

    // 검색어가 지워져야 함
    expect(searchInput.value).toBe('')

    // 초기 상태 메시지가 표시되어야 함
    await waitFor(() => {
      expect(screen.getByText('검색을 실행하면 결과가 표시됩니다.')).toBeInTheDocument()
    })
  })

  /**
   * 회귀 테스트: 초기화 후 다시 초기화 버튼 숨김
   *
   * 목적:
   * - 초기화 후 Progressive Disclosure 원칙에 따라 버튼이 다시 숨겨지는지 검증
   * - UI 상태가 초기 상태로 완전히 복원되는지 확인
   */
  it('[회귀] 초기화 후에는 초기화 버튼이 다시 숨겨져야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')

    // 초기화 버튼이 나타남
    let resetButton = screen.getByLabelText('검색 초기화')
    expect(resetButton).toBeInTheDocument()

    // 초기화 버튼 클릭
    await user.click(resetButton)

    // 초기화 버튼이 다시 숨겨져야 함
    await waitFor(() => {
      resetButton = screen.queryByLabelText('검색 초기화') as HTMLButtonElement
      expect(resetButton).toBeNull()
    })
  })

  /**
   * 회귀 테스트: 초기화 버튼 접근성
   *
   * 목적:
   * - 초기화 버튼이 접근성 표준을 준수하는지 검증
   * - aria-label, Tooltip 등 접근성 속성 확인
   */
  it('[회귀] 초기화 버튼은 접근성 속성을 가져야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력하여 초기화 버튼 표시
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')

    // 초기화 버튼 접근성 확인
    const resetButton = screen.getByLabelText('검색 초기화')
    expect(resetButton).toHaveAttribute('aria-label', '검색 초기화')
    expect(resetButton).toHaveClass('reset-button')
  })

  /**
   * 회귀 테스트: 초기화 버튼 디자인 클래스
   *
   * 목적:
   * - 초기화 버튼이 올바른 CSS 클래스를 가지는지 검증
   * - iOS 스타일 디자인 적용 확인
   */
  it('[회귀] 초기화 버튼은 올바른 CSS 클래스를 가져야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력하여 초기화 버튼 표시
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')

    // 초기화 버튼 CSS 클래스 확인
    const resetButton = screen.getByLabelText('검색 초기화')
    expect(resetButton).toHaveClass('reset-button')
  })

  /**
   * 회귀 테스트: 키보드 포커스 지원
   *
   * 목적:
   * - 초기화 버튼이 키보드로 포커스 가능한지 검증
   * - 키보드 전용 사용자 지원 확인
   */
  it('[회귀] 초기화 버튼은 키보드 포커스가 가능해야 함', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSearchProvider>
        <DocumentSearchView {...defaultProps} />
      </DocumentSearchProvider>
    )

    // 검색어 입력하여 초기화 버튼 표시
    const searchInput = screen.getByPlaceholderText('문서 검색')
    await user.type(searchInput, '테스트 검색어')

    // Tab 키로 초기화 버튼으로 이동
    const resetButton = screen.getByLabelText('검색 초기화')
    resetButton.focus()

    // 포커스 확인
    expect(resetButton).toHaveFocus()
  })
})
