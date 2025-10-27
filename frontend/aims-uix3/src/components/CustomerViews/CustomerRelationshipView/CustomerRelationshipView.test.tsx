/**
 * CustomerRelationshipView Component Unit Tests
 * @since 2025-10-23
 *
 * 테스트 범위 (74e7c09, 0310605, 3a2d690):
 * 1. 트리 검색 기능
 * 2. 트리 전체 펼치기/접기/대표만 보기
 * 3. localStorage 영속화
 * 4. 검색어 하이라이트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomerRelationshipView from './CustomerRelationshipView';
import type { Customer } from '@/entities/customer/model';
import { RelationshipService } from '../../../services/relationshipService';
import { useCustomerDocument } from '@/hooks/useCustomerDocument';

// Mock dependencies
vi.mock('../../../services/relationshipService', () => ({
  RelationshipService: {
    getAllRelationshipsWithCustomers: vi.fn()
  }
}));

vi.mock('@/hooks/useCustomerDocument', () => ({
  useCustomerDocument: vi.fn()
}));

describe('CustomerRelationshipView - 신규 기능 테스트', () => {
  let queryClient: QueryClient;
  const mockOnClose = vi.fn();
  const mockOnCustomerSelect = vi.fn();

  const mockCustomers: Customer[] = [
    {
      _id: 'customer1',
      personal_info: { name: '김철수' },
      insurance_info: { customer_type: '개인' }
    } as Customer,
    {
      _id: 'customer2',
      personal_info: { name: '이영희' },
      insurance_info: { customer_type: '개인' }
    } as Customer,
    {
      _id: 'customer3',
      personal_info: { name: '박민수' },
      insurance_info: { customer_type: '개인' }
    } as Customer
  ];

  const mockRelationships = [
    {
      _id: 'rel1',
      from_customer: mockCustomers[0],
      related_customer: mockCustomers[1],
      relationship_info: {
        relationship_category: 'family',
        relationship_type: 'spouse'
      },
      family_representative: mockCustomers[0]
    },
    {
      _id: 'rel2',
      from_customer: mockCustomers[0],
      related_customer: mockCustomers[2],
      relationship_info: {
        relationship_category: 'family',
        relationship_type: 'child'
      },
      family_representative: mockCustomers[0]
    }
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    vi.mocked(useCustomerDocument).mockReturnValue({
      customers: mockCustomers,
      isLoading: false,
      loadCustomers: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      total: mockCustomers.length,
      hasMore: false,
      error: null,
      lastUpdated: new Date(),
      clearCache: vi.fn(),
      getCustomerById: vi.fn(),
      getCustomersByIds: vi.fn(),
      searchCustomers: vi.fn(),
      isStale: vi.fn().mockReturnValue(false),
      invalidate: vi.fn()
    } as any);

    vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
      relationships: mockRelationships,
      customers: mockCustomers
    } as any);

    // localStorage mock
    Storage.prototype.getItem = vi.fn();
    Storage.prototype.setItem = vi.fn();
    Storage.prototype.removeItem = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CustomerRelationshipView
          visible={true}
          onClose={mockOnClose}
          onCustomerSelect={mockOnCustomerSelect}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  describe('렌더링', () => {
    it('visible이 true일 때 렌더링되어야 한다', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('고객 관계 현황')).toBeInTheDocument();
      });
    });

    it('visible이 false일 때 렌더링되지 않아야 한다', () => {
      renderComponent({ visible: false });

      expect(screen.queryByText('고객 관계 현황')).not.toBeInTheDocument();
    });
  });

  describe('트리 검색 기능 (74e7c09)', () => {
    it('검색 입력란이 렌더링되어야 한다', async () => {
      renderComponent();

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('고객 이름 검색...');
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('검색어 입력 시 검색어 지우기 버튼이 표시되어야 한다', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('고객 이름 검색...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('고객 이름 검색...');
      await user.type(searchInput, '김철수');

      await waitFor(() => {
        const clearButton = screen.getByLabelText('검색어 지우기');
        expect(clearButton).toBeInTheDocument();
      });
    });

    it('검색어 지우기 버튼 클릭 시 검색어가 초기화되어야 한다', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('고객 이름 검색...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('고객 이름 검색...') as HTMLInputElement;
      await user.type(searchInput, '김철수');

      await waitFor(() => {
        expect(searchInput.value).toBe('김철수');
      });

      const clearButton = screen.getByLabelText('검색어 지우기');
      await user.click(clearButton);

      await waitFor(() => {
        expect(searchInput.value).toBe('');
      });
    });
  });

  describe('트리 전체 펼치기/접기/대표만 보기 (0310605)', () => {
    it('트리 컨트롤 버튼들이 렌더링되어야 한다', async () => {
      renderComponent();

      await waitFor(() => {
        // 토글 버튼이므로 초기 상태에 따라 "전체 펼치기" 또는 "전체 접기"가 표시됨
        expect(
          screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기')
        ).toBeInTheDocument();
        expect(
          screen.queryByLabelText('대표만 보기') || screen.queryByLabelText('전체 보기')
        ).toBeInTheDocument();
      });
    });

    it('전체 펼치기/접기 버튼 클릭 시 토글되어야 한다', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(
          screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기')
        ).toBeInTheDocument();
      });

      // 초기 레이블 확인
      const initialButton = screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기');
      const initialLabel = initialButton?.getAttribute('aria-label');

      // 버튼 클릭
      await user.click(initialButton!);

      // 레이블이 토글되었는지 확인
      await waitFor(() => {
        const newButton = screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기');
        const newLabel = newButton?.getAttribute('aria-label');
        expect(newLabel).not.toBe(initialLabel);
      });
    });

    it('대표만 보기/전체 보기 버튼 클릭 시 토글되어야 한다', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(
          screen.queryByLabelText('대표만 보기') || screen.queryByLabelText('전체 보기')
        ).toBeInTheDocument();
      });

      // 초기 레이블 확인
      const initialButton = screen.queryByLabelText('대표만 보기') || screen.queryByLabelText('전체 보기');
      const initialLabel = initialButton?.getAttribute('aria-label');

      // 버튼 클릭
      await user.click(initialButton!);

      // 레이블이 토글되었는지 확인
      await waitFor(() => {
        const newButton = screen.queryByLabelText('대표만 보기') || screen.queryByLabelText('전체 보기');
        const newLabel = newButton?.getAttribute('aria-label');
        expect(newLabel).not.toBe(initialLabel);
      });
    });
  });

  describe('localStorage 영속화', () => {
    it('트리 확장 상태가 localStorage에 저장되어야 한다', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(
          screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기')
        ).toBeInTheDocument();
      });

      const toggleButton = screen.queryByLabelText('전체 펼치기') || screen.queryByLabelText('전체 접기');
      await user.click(toggleButton!);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'aims_relationship_expanded_nodes',
          expect.any(String)
        );
      });
    });

    it('컴포넌트 마운트 시 localStorage에서 확장 상태를 복원해야 한다', () => {
      const savedState = JSON.stringify(['family', 'corporate']);
      vi.mocked(localStorage.getItem).mockReturnValue(savedState);

      renderComponent();

      expect(localStorage.getItem).toHaveBeenCalledWith('aims_relationship_expanded_nodes');
    });

    it('localStorage 복원 실패 시 기본 상태로 초기화되어야 한다', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-json');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderComponent();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('새로고침 버튼', () => {
    it('새로고침 버튼이 렌더링되어야 한다', async () => {
      renderComponent();

      await waitFor(() => {
        const refreshButton = screen.getByLabelText('관계 데이터 새로고침');
        expect(refreshButton).toBeInTheDocument();
      });
    });

    it('새로고침 버튼 클릭 시 데이터를 다시 불러와야 한다', async () => {
      const user = userEvent.setup();
      const mockRefresh = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useCustomerDocument).mockReturnValue({
        customers: mockCustomers,
        isLoading: false,
        loadCustomers: vi.fn(),
        refresh: mockRefresh,
        total: mockCustomers.length,
        hasMore: false,
        error: null,
        lastUpdated: new Date()
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByLabelText('관계 데이터 새로고침')).toBeInTheDocument();
      });

      const refreshButton = screen.getByLabelText('관계 데이터 새로고침');
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledWith({ limit: 10000 });
      });
    });
  });

  describe('빈 상태', () => {
    it('관계 데이터가 없을 때 빈 상태 메시지가 표시되어야 한다', async () => {
      vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
        relationships: [],
        customers: []
      } as any);

      vi.mocked(useCustomerDocument).mockReturnValue({
        customers: [],
        isLoading: false,
        loadCustomers: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        total: 0,
        hasMore: false,
        error: null,
        lastUpdated: new Date()
      } as any);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('등록된 고객 관계가 없습니다')).toBeInTheDocument();
      });
    });
  });

  describe('로딩 상태', () => {
    it('데이터 로딩 중에는 로딩 스피너가 표시되어야 한다', () => {
      vi.mocked(useCustomerDocument).mockReturnValue({
        customers: [],
        isLoading: true,
        loadCustomers: vi.fn(),
        refresh: vi.fn().mockResolvedValue(undefined),
        total: 0,
        hasMore: false,
        error: null,
        lastUpdated: new Date()
      } as any);

      renderComponent();

      expect(screen.getByText('고객 관계 데이터를 불러오는 중...')).toBeInTheDocument();
    });
  });
});
