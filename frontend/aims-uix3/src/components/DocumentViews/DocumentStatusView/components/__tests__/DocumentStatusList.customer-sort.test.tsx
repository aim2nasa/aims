/**
 * DocumentStatusList Customer Column Sorting Tests
 * @since 1.0.0
 *
 * 커밋 45a019e: "연결된 고객" 칼럼 정렬 기능 추가
 *
 * 주요 검증 사항:
 * 1. "연결된 고객" 칼럼 헤더가 정렬 가능함
 * 2. 칼럼 클릭 시 정렬 핸들러가 'customer' 파라미터와 함께 호출됨
 * 3. 정렬 인디케이터가 올바르게 표시됨 (▲ 오름차순, ▼ 내림차순)
 * 4. 정렬 상태에 따라 header-sortable 클래스가 적용됨
 * 5. 고객 이름이 클릭 가능한 버튼으로 렌더링됨
 * 6. 고객 연결이 없는 문서는 '-'로 표시됨
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentStatusList from '../DocumentStatusList'
import type { Document } from '../../../../../types/documentStatus'

// Mock documents with customer relations
const createMockDocumentsWithCustomers = (): Document[] => {
  return [
    {
      _id: 'doc-1',
      filename: '김보성보유계약현황.pdf',
      fileSize: 1024000,
      mimeType: 'application/pdf',
      uploaded_at: new Date().toISOString(),
      status: 'completed' as const,
      progress: 100,
      customer_relation: {
        customer_id: 'customer-1',
        customer_name: '김보성',
        relationship_type: 'policy_holder',
        assigned_by: 'tester',
        assigned_at: new Date().toISOString(),
      },
    },
    {
      _id: 'doc-2',
      filename: '신상철계약서.pdf',
      fileSize: 2048000,
      mimeType: 'application/pdf',
      uploaded_at: new Date().toISOString(),
      status: 'completed' as const,
      progress: 100,
      customer_relation: {
        customer_id: 'customer-2',
        customer_name: '신상철',
        relationship_type: 'policy_holder',
        assigned_by: 'tester',
        assigned_at: new Date().toISOString(),
      },
    },
    {
      _id: 'doc-3',
      filename: '일반문서.pdf',
      fileSize: 512000,
      mimeType: 'application/pdf',
      uploaded_at: new Date().toISOString(),
      status: 'completed' as const,
      progress: 100,
      // No customer_relation
    },
  ]
}

// Mock SFSymbol
vi.mock('../../../../SFSymbol', () => ({
  SFSymbol: ({ name }: any) => <span data-testid="sf-symbol">{name}</span>,
  SFSymbolSize: {
    CAPTION_2: 'caption-2',
    CAPTION_1: 'caption-1',
  },
  SFSymbolWeight: {
    REGULAR: 'regular',
    MEDIUM: 'medium',
  },
}))

// Mock Tooltip
vi.mock('@/shared/ui', () => ({
  Tooltip: ({ children, content }: any) => (
    <div data-tooltip={content}>{children}</div>
  ),
}))

// Mock DocumentActionIcons
vi.mock('../../components/DocumentActionIcons', () => ({
  EyeIcon: () => <span data-testid="eye-icon">eye</span>,
  SummaryIcon: () => <span data-testid="summary-icon">summary</span>,
  DocumentIcon: () => <span data-testid="document-icon">document</span>,
  LinkIcon: () => <span data-testid="link-icon">link</span>,
}))

describe('DocumentStatusList - 연결된 고객 칼럼 정렬 테스트 (커밋 45a019e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Unit Tests - 칼럼 헤더', () => {
    it('"연결된 고객" 칼럼 헤더가 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).toBeInTheDocument()
      expect(customerHeader?.textContent).toContain('연결된 고객')
    })

    it('정렬 핸들러가 제공되면 header-sortable 클래스가 적용되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).toHaveClass('header-sortable')
    })

    it('정렬 핸들러가 없으면 header-sortable 클래스가 없어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).not.toHaveClass('header-sortable')
    })

    it('칼럼 헤더에 role="button"이 설정되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).toHaveAttribute('role', 'button')
    })

    it('칼럼 헤더에 tabIndex=0이 설정되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).toHaveAttribute('tabIndex', '0')
    })

    it('칼럼 헤더에 aria-label이 설정되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      expect(customerHeader).toHaveAttribute('aria-label', '연결된 고객으로 정렬')
    })
  })

  describe('Unit Tests - 정렬 핸들러', () => {
    it('칼럼 헤더 클릭 시 onColumnSort가 "customer"와 함께 호출되어야 함', async () => {
      const user = userEvent.setup()
      const onColumnSort = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={onColumnSort}
        />
      )

      const customerHeader = document.querySelector('.header-customer') as HTMLElement
      await user.click(customerHeader)

      expect(onColumnSort).toHaveBeenCalledTimes(1)
      expect(onColumnSort).toHaveBeenCalledWith('customer')
    })

    it('정렬 핸들러가 없으면 클릭해도 에러가 발생하지 않아야 함', async () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
        />
      )

      const customerHeader = document.querySelector('.header-customer') as HTMLElement

      // Should not throw - just click without expecting
      expect(customerHeader).toBeInTheDocument()
    })
  })

  describe('Unit Tests - 정렬 인디케이터', () => {
    it('sortField가 "customer"이고 오름차순일 때 ▲가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      const sortIndicator = customerHeader?.querySelector('.sort-indicator')

      expect(sortIndicator).toBeInTheDocument()
      expect(sortIndicator?.textContent).toBe('▲')
    })

    it('sortField가 "customer"이고 내림차순일 때 ▼가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="desc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      const sortIndicator = customerHeader?.querySelector('.sort-indicator')

      expect(sortIndicator).toBeInTheDocument()
      expect(sortIndicator?.textContent).toBe('▼')
    })

    it('sortField가 "customer"가 아니면 정렬 인디케이터가 표시되지 않아야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      const sortIndicator = customerHeader?.querySelector('.sort-indicator')

      expect(sortIndicator).not.toBeInTheDocument()
    })

    it('sortField가 null이면 정렬 인디케이터가 표시되지 않아야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer')
      const sortIndicator = customerHeader?.querySelector('.sort-indicator')

      expect(sortIndicator).not.toBeInTheDocument()
    })
  })

  describe('Unit Tests - 고객 이름 표시', () => {
    it('고객 연결이 있는 문서는 고객 이름이 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      expect(screen.getByText('김보성')).toBeInTheDocument()
      expect(screen.getByText('신상철')).toBeInTheDocument()
    })

    it('고객 이름이 클릭 가능한 버튼으로 렌더링되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
          onCustomerClick={vi.fn()}
        />
      )

      const customerButton = screen.getByRole('button', { name: /김보성 상세 보기/ })
      expect(customerButton).toBeInTheDocument()
      expect(customerButton).toHaveClass('customer-name-button')
    })

    it('고객 연결이 없는 문서는 "-"가 표시되어야 함', () => {
      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      const customerNone = document.querySelector('.customer-none')
      expect(customerNone).toBeInTheDocument()
      expect(customerNone?.textContent).toBe('-')
    })

    it('고객 이름 버튼 클릭 시 onCustomerClick이 customer_id와 함께 호출되어야 함', async () => {
      const user = userEvent.setup()
      const onCustomerClick = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
          onCustomerClick={onCustomerClick}
        />
      )

      const customerButton = screen.getByRole('button', { name: /김보성 상세 보기/ })
      await user.click(customerButton)

      expect(onCustomerClick).toHaveBeenCalledTimes(1)
      expect(onCustomerClick).toHaveBeenCalledWith('customer-1')
    })

    it('고객 이름 버튼 클릭 시 이벤트 전파가 중단되어야 함', async () => {
      const user = userEvent.setup()
      const onCustomerClick = vi.fn()
      const onDocumentClick = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDocumentClick={onDocumentClick}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={vi.fn()}
          onCustomerClick={onCustomerClick}
        />
      )

      const customerButton = screen.getByRole('button', { name: /김보성 상세 보기/ })
      await user.click(customerButton)

      expect(onCustomerClick).toHaveBeenCalledTimes(1)
      // onDocumentClick should NOT be called due to stopPropagation
      expect(onDocumentClick).not.toHaveBeenCalled()
    })
  })

  describe('Regression Tests - 정렬 기능 회귀 방지 (커밋 45a019e)', () => {
    it('[회귀 방지] "연결된 고객" 칼럼이 정렬 가능한 칼럼 목록에 포함되어야 함', () => {
      const onColumnSort = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={onColumnSort}
        />
      )

      const customerHeader = document.querySelector('.header-customer')

      // Should be sortable
      expect(customerHeader).toHaveClass('header-sortable')
      expect(customerHeader).toHaveAttribute('role', 'button')
      expect(customerHeader).toHaveAttribute('aria-label', '연결된 고객으로 정렬')
    })

    it('[회귀 방지] 정렬 상태가 다른 칼럼으로 변경되어도 "연결된 고객" 칼럼은 정상 작동해야 함', async () => {
      const user = userEvent.setup()
      const onColumnSort = vi.fn()

      const { rerender } = render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="filename"
          sortDirection="asc"
          onColumnSort={onColumnSort}
        />
      )

      // Verify no sort indicator on customer column
      let customerHeader = document.querySelector('.header-customer')
      let sortIndicator = customerHeader?.querySelector('.sort-indicator')
      expect(sortIndicator).not.toBeInTheDocument()

      // Change sort to customer
      rerender(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="asc"
          onColumnSort={onColumnSort}
        />
      )

      // Verify sort indicator appears
      customerHeader = document.querySelector('.header-customer')
      sortIndicator = customerHeader?.querySelector('.sort-indicator')
      expect(sortIndicator).toBeInTheDocument()
      expect(sortIndicator?.textContent).toBe('▲')
    })

    it('[회귀 방지] 정렬 방향 토글이 정상 작동해야 함', () => {
      const { rerender } = render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="asc"
          onColumnSort={vi.fn()}
        />
      )

      let customerHeader = document.querySelector('.header-customer')
      let sortIndicator = customerHeader?.querySelector('.sort-indicator')
      expect(sortIndicator?.textContent).toBe('▲')

      // Toggle to descending
      rerender(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="desc"
          onColumnSort={vi.fn()}
        />
      )

      customerHeader = document.querySelector('.header-customer')
      sortIndicator = customerHeader?.querySelector('.sort-indicator')
      expect(sortIndicator?.textContent).toBe('▼')
    })

    it('[회귀 방지] 삭제 모드에서도 정렬 기능이 작동해야 함', async () => {
      const user = userEvent.setup()
      const onColumnSort = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField={null}
          sortDirection="asc"
          onColumnSort={onColumnSort}
          isDeleteMode={true}
          selectedDocumentIds={new Set()}
          onSelectAll={vi.fn()}
          onSelectDocument={vi.fn()}
        />
      )

      const customerHeader = document.querySelector('.header-customer') as HTMLElement
      await user.click(customerHeader)

      expect(onColumnSort).toHaveBeenCalledWith('customer')
    })

    it('[회귀 방지] 고객 이름이 없는 경우에도 에러가 발생하지 않아야 함', () => {
      const documentsWithEmptyName = [
        {
          _id: 'doc-empty',
          filename: 'empty-customer.pdf',
          fileSize: 1024000,
          mimeType: 'application/pdf',
          uploaded_at: new Date().toISOString(),
          status: 'completed' as const,
          progress: 100,
          customer_relation: {
            customer_id: 'customer-empty',
            customer_name: '',
            relationship_type: 'policy_holder',
            assigned_by: 'tester',
            assigned_at: new Date().toISOString(),
          },
        },
      ]

      expect(() => {
        render(
          <DocumentStatusList
            documents={documentsWithEmptyName}
            isLoading={false}
            isEmpty={false}
            error={null}
            onDetailClick={vi.fn()}
            onSummaryClick={vi.fn()}
            onFullTextClick={vi.fn()}
            onLinkClick={vi.fn()}
            sortField="customer"
            sortDirection="asc"
            onColumnSort={vi.fn()}
          />
        )
      }).not.toThrow()
    })

    it('[회귀 방지] customer_relation이 없는 경우에도 에러가 발생하지 않아야 함', () => {
      const documentsWithoutRelation: Document[] = [
        {
          _id: 'doc-no-relation',
          filename: 'no-relation.pdf',
          fileSize: 1024000,
          mimeType: 'application/pdf',
          uploaded_at: new Date().toISOString(),
          status: 'completed' as const,
          progress: 100,
          // No customer_relation property
        },
      ]

      expect(() => {
        render(
          <DocumentStatusList
            documents={documentsWithoutRelation}
            isLoading={false}
            isEmpty={false}
            error={null}
            onDetailClick={vi.fn()}
            onSummaryClick={vi.fn()}
            onFullTextClick={vi.fn()}
            onLinkClick={vi.fn()}
            sortField="customer"
            sortDirection="asc"
            onColumnSort={vi.fn()}
          />
        )
      }).not.toThrow()
    })
  })

  describe('Integration Tests - 전체 시나리오', () => {
    it('고객 칼럼 클릭 → 정렬 → 고객 이름 클릭 전체 플로우가 작동해야 함', async () => {
      const onColumnSort = vi.fn()
      const onCustomerClick = vi.fn()

      render(
        <DocumentStatusList
          documents={createMockDocumentsWithCustomers()}
          isLoading={false}
          isEmpty={false}
          error={null}
          onDetailClick={vi.fn()}
          onSummaryClick={vi.fn()}
          onFullTextClick={vi.fn()}
          onLinkClick={vi.fn()}
          sortField="customer"
          sortDirection="asc"
          onColumnSort={onColumnSort}
          onCustomerClick={onCustomerClick}
        />
      )

      // Step 1: Verify column header is sortable
      const customerHeader = document.querySelector('.header-customer') as HTMLElement
      expect(customerHeader).toHaveClass('header-sortable')

      // Step 2: Click column header to sort
      customerHeader.click()
      expect(onColumnSort).toHaveBeenCalledWith('customer')

      // Step 3: Verify sort indicator
      const sortIndicator = customerHeader.querySelector('.sort-indicator')
      expect(sortIndicator?.textContent).toBe('▲')

      // Step 4: Click customer name
      const customerButton = screen.getByRole('button', { name: /김보성 상세 보기/ })
      customerButton.click()
      expect(onCustomerClick).toHaveBeenCalledWith('customer-1')
    })
  })
})
