/**
 * DocumentSearchView - Top-K Customization Regression Tests
 * @since 2025-11-14
 * @commit 6aeec063
 *
 * AI 검색 결과 개수 사용자 커스터마이징 기능 회귀 방지 테스트
 *
 * 테스트 범위:
 * - Progressive Disclosure (AI 검색 모드일 때만 topK 드롭다운 표시)
 * - topK 드롭다운 옵션 (3, 5, 10, 15, 20)
 * - topK 기본값 (10)
 * - topK 값 변경 시 상태 업데이트
 * - sessionStorage 저장 및 복원
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentSearchProvider } from '@/contexts/DocumentSearchProvider'
import { DocumentSearchView } from '../DocumentSearchView'
import * as SearchService from '@/services/searchService'

// Mock SearchService
vi.mock('@/services/searchService', () => ({
  SearchService: {
    searchDocuments: vi.fn(),
    getOriginalName: vi.fn((doc) => doc.filename || 'unknown.pdf')
  }
}))

// Mock DocumentService
vi.mock('@/services/DocumentService', () => ({
  DocumentService: {
    getDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    linkDocumentToCustomer: vi.fn(),
    unlinkDocument: vi.fn()
  }
}))

// Mock DocumentStatusService
vi.mock('@/services/DocumentStatusService', () => ({
  DocumentStatusService: {
    getDocumentStatus: vi.fn(),
    getDocuments: vi.fn()
  }
}))

// Mock recent customers store
vi.mock('@/shared/store/useRecentCustomersStore', () => ({
  useRecentCustomersStore: vi.fn(() => ({
    recentCustomers: [],
    addRecentCustomer: vi.fn(),
    getRecentCustomers: vi.fn(() => [])
  }))
}))

// Mock recent search queries
vi.mock('@/utils/recentSearchQueries', () => ({
  getRecentSearchQueries: vi.fn(() => []),
  addRecentSearchQuery: vi.fn()
}))

// Mock DocumentLinkModal (uses useQuery which requires QueryClientProvider)
vi.mock('../../DocumentStatusView/components/DocumentLinkModal', () => ({
  default: () => null,
}))

const mockSearchDocuments = SearchService.SearchService.searchDocuments as ReturnType<typeof vi.fn>

describe('DocumentSearchView - Top-K Customization (커밋 6aeec063)', () => {
  const renderComponent = (props = {}) => {
    return render(
      <DocumentSearchProvider>
        <DocumentSearchView
          visible={true}
          onClose={() => {}}
          {...props}
        />
      </DocumentSearchProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // sessionStorage 초기화
    sessionStorage.clear()

    mockSearchDocuments.mockResolvedValue({
      search_results: [],
      answer: null
    })
  })

  describe('[회귀 방지] Progressive Disclosure', () => {
    it('키워드 검색 모드일 때 topK 드롭다운이 숨겨져야 함', async () => {
      const { container } = renderComponent()

      // 검색 모드 드롭다운에서 "키워드 검색" 확인
      await waitFor(() => {
        const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
        expect(searchModeDropdown).toBeInTheDocument()
      })

      // topK 드롭다운이 없어야 함
      const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      expect(topKDropdown).not.toBeInTheDocument()
    })

    it('AI 검색 모드로 변경하면 topK 드롭다운이 표시되어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // 검색 모드 드롭다운 찾기
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      expect(searchModeDropdown).toBeInTheDocument()

      // 드롭다운 열기
      const trigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(trigger)

      // "질문 검색" 옵션 클릭
      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK 드롭다운이 표시되어야 함
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        expect(topKDropdown).toBeInTheDocument()
      })
    })

    it('AI 검색 → 키워드 검색으로 변경하면 topK 드롭다운이 숨겨져야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색으로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const trigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(trigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        expect(topKDropdown).toBeInTheDocument()
      })

      // 다시 키워드 검색으로 변경
      await user.click(trigger)
      const keywordSearchOption = await screen.findByRole('option', { name: '키워드 검색' })
      await user.click(keywordSearchOption)

      // topK 드롭다운이 숨겨져야 함
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        expect(topKDropdown).not.toBeInTheDocument()
      })
    })
  })

  describe('[회귀 방지] topK 드롭다운 옵션', () => {
    it('상위 3, 5, 10, 15, 20개 옵션이 모두 있어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK 드롭다운 찾기 및 열기
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        expect(topKDropdown).toBeInTheDocument()
      })

      const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      const topKTrigger = topKDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(topKTrigger)

      // 모든 옵션 확인
      await waitFor(() => {
        expect(screen.getByRole('option', { name: '상위 3개' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '상위 5개' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '상위 10개' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '상위 15개' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: '상위 20개' })).toBeInTheDocument()
      })
    })

    it('topK 기본값은 10이어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK 드롭다운의 선택된 값 확인
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        const topKValue = topKDropdown?.querySelector('.ios-dropdown__value')
        expect(topKValue).toHaveTextContent('상위 10개')
      })
    })
  })

  describe('[회귀 방지] topK 값 변경', () => {
    it('topK 값을 변경할 수 있어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK를 20으로 변경
      const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      const topKTrigger = topKDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(topKTrigger)

      const topK20Option = await screen.findByRole('option', { name: '상위 20개' })
      await user.click(topK20Option)

      // 선택된 값 확인
      await waitFor(() => {
        const topKValue = topKDropdown?.querySelector('.ios-dropdown__value')
        expect(topKValue).toHaveTextContent('상위 20개')
      })
    })

    it('여러 topK 값을 순서대로 변경할 수 있어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      const topKTrigger = topKDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      const getTopKValue = () => topKDropdown?.querySelector('.ios-dropdown__value')

      // 3 → 5 → 15 → 10 순서로 변경
      await user.click(topKTrigger)
      await user.click(await screen.findByRole('option', { name: '상위 3개' }))
      expect(getTopKValue()).toHaveTextContent('상위 3개')

      await user.click(topKTrigger)
      await user.click(await screen.findByRole('option', { name: '상위 5개' }))
      expect(getTopKValue()).toHaveTextContent('상위 5개')

      await user.click(topKTrigger)
      await user.click(await screen.findByRole('option', { name: '상위 15개' }))
      expect(getTopKValue()).toHaveTextContent('상위 15개')

      await user.click(topKTrigger)
      await user.click(await screen.findByRole('option', { name: '상위 10개' }))
      expect(getTopKValue()).toHaveTextContent('상위 10개')
    })
  })

  describe('[회귀 방지] sessionStorage 저장', () => {
    it('topK 값 변경 시 sessionStorage에 저장되어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK를 5로 변경
      const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      const topKTrigger = topKDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(topKTrigger)

      const topK5Option = await screen.findByRole('option', { name: '상위 5개' })
      await user.click(topK5Option)

      // sessionStorage 확인
      await waitFor(() => {
        const stored = sessionStorage.getItem('document-search-top-k')
        expect(stored).toBe('5')
      })
    })

    it('sessionStorage에 저장된 topK 값이 복원되어야 함', async () => {
      // sessionStorage에 topK 15 저장
      sessionStorage.setItem('document-search-top-k', '15')

      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // topK 드롭다운의 값이 15로 복원되어야 함
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        const topKValue = topKDropdown?.querySelector('.ios-dropdown__value')
        expect(topKValue).toHaveTextContent('상위 15개')
      })
    })

    it('페이지 새로고침 후에도 topK 값이 유지되어야 함', async () => {
      const user = userEvent.setup()

      // 첫 번째 렌더: topK를 3으로 설정
      const { unmount: unmount1, container: container1 } = renderComponent()

      const searchModeDropdown1 = container1.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger1 = searchModeDropdown1?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger1)

      const aiSearchOption1 = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption1)

      const topKDropdown1 = container1.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
      const topKTrigger1 = topKDropdown1?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(topKTrigger1)

      const topK3Option = await screen.findByRole('option', { name: '상위 3개' })
      await user.click(topK3Option)

      await waitFor(() => {
        expect(sessionStorage.getItem('document-search-top-k')).toBe('3')
      })

      unmount1()

      // 두 번째 렌더: topK가 3으로 유지되어야 함
      const { container: container2 } = renderComponent()

      const searchModeDropdown2 = container2.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger2 = searchModeDropdown2?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger2)

      const aiSearchOption2 = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption2)

      await waitFor(() => {
        const topKDropdown2 = container2.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        const topKValue2 = topKDropdown2?.querySelector('.ios-dropdown__value')
        expect(topKValue2).toHaveTextContent('상위 3개')
      })
    })
  })

  describe('[회귀 방지] API 요청 검증', () => {
    it('AI 검색 시 top_k가 API 요청에 포함되어야 함', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // 검색어 입력
      const searchInput = screen.getByPlaceholderText(/상세 문서검색/i)
      await user.type(searchInput, 'AI 검색 테스트')
      await user.keyboard('{Enter}')

      // API 호출 확인 — semantic 검색 시 top_k가 포함됨
      await waitFor(() => {
        expect(mockSearchDocuments).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'AI 검색 테스트',
            search_mode: 'semantic',
            top_k: 10
          })
        )
      })
    })

    it('키워드 검색 시 topK가 API 요청에 포함되지 않아야 함', async () => {
      const user = userEvent.setup()
      renderComponent()

      // 검색어 입력 (기본 키워드 검색 모드)
      const searchInput = screen.getByPlaceholderText(/상세 문서검색/i)
      await user.type(searchInput, '키워드 검색 테스트')
      await user.keyboard('{Enter}')

      // API 호출 확인
      await waitFor(() => {
        expect(mockSearchDocuments).toHaveBeenCalledWith(
          expect.objectContaining({
            query: '키워드 검색 테스트',
            search_mode: 'keyword',
            mode: 'AND'
          })
        )

        // top_k가 포함되지 않았는지 확인
        const callArgs = mockSearchDocuments.mock.calls[0]![0]
        expect(callArgs).not.toHaveProperty('top_k')
      })
    })
  })

  describe('[회귀 방지] 기존 기본값 변경 검증', () => {
    it('기존 기본값 5에서 10으로 변경되었는지 확인', async () => {
      const user = userEvent.setup()
      const { container } = renderComponent()

      // AI 검색 모드로 변경
      const searchModeDropdown = container.querySelector('[aria-label="검색 모드 선택"]')
      const searchModeTrigger = searchModeDropdown?.querySelector('.ios-dropdown__trigger') as HTMLButtonElement
      await user.click(searchModeTrigger)

      const aiSearchOption = await screen.findByRole('option', { name: '질문 검색' })
      await user.click(aiSearchOption)

      // 기본값이 10인지 확인 (커밋 메시지: 기존 5개에서 10개로 변경)
      await waitFor(() => {
        const topKDropdown = container.querySelector('[aria-label="AI 검색 결과 개수 선택"]')
        const topKValue = topKDropdown?.querySelector('.ios-dropdown__value')
        expect(topKValue).toHaveTextContent('상위 10개')
        expect(topKValue).not.toHaveTextContent('상위 5개')
      })
    })
  })
})
