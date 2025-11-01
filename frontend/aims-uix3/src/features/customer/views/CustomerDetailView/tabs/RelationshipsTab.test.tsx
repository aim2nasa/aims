/**
 * RelationshipsTab Component Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위 (커밋: 183e453):
 * 1. 관계 레이블 표시 (배우자, 자녀, 대표, 임원 등)
 * 2. display_relationship_label 우선 표시
 * 3. 관계 삭제 기능
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RelationshipsTab } from './RelationshipsTab';
import type { Customer } from '@/entities/customer/model';
import { useCustomerRelationshipsController } from '@/controllers/useCustomerRelationshipsController';
import type { Relationship } from '@/services/relationshipService';

// Mock dependencies
vi.mock('@/controllers/useCustomerRelationshipsController', () => ({
  useCustomerRelationshipsController: vi.fn()
}));

vi.mock('@/controllers/useAppleConfirmController', () => ({
  useAppleConfirmController: vi.fn(() => ({
    state: {
      isOpen: false,
      title: '',
      message: '',
      confirmText: '확인',
      cancelText: '취소',
      confirmStyle: 'default' as const,
      showCancel: true,
      iconType: 'info' as const
    },
    actions: {
      openModal: vi.fn().mockResolvedValue(true),
      closeModal: vi.fn()
    }
  }))
}));

describe('RelationshipsTab - 관계 레이블 표시 (커밋: 183e453)', () => {
  let queryClient: QueryClient;
  const mockOnSelectCustomer = vi.fn();
  const mockOnRelationshipsUpdated = vi.fn();
  const mockLoadRelationships = vi.fn();
  const mockDeleteRelationship = vi.fn();
  const mockGetRelationshipTypeLabel = vi.fn();

  const mockCustomer: Customer = {
    _id: 'customer-main',
    personal_info: { name: '김철수' },
    insurance_info: { customer_type: '개인' }
  } as Customer;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderComponent = (relationships: Relationship[] = []) => {
    vi.mocked(useCustomerRelationshipsController).mockReturnValue({
      state: {
        relationships,
        relationshipTypes: {},
        isLoading: false,
        error: null
      },
      actions: {
        loadRelationships: mockLoadRelationships,
        refreshRelationshipTypes: vi.fn(),
        deleteRelationship: mockDeleteRelationship,
        getRelationshipTypeLabel: mockGetRelationshipTypeLabel
      }
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <RelationshipsTab
          customer={mockCustomer}
          onSelectCustomer={mockOnSelectCustomer}
          onRelationshipsUpdated={mockOnRelationshipsUpdated}
        />
      </QueryClientProvider>
    );
  };

  describe('가족 관계 레이블 표시', () => {
    it('배우자 관계는 "(배우자)" 레이블을 표시해야 한다', async () => {
      const spouseCustomer: Customer = {
        _id: 'spouse-1',
        personal_info: { name: '이영희' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-spouse',
          from_customer: mockCustomer,
          related_customer: spouseCustomer,
          relationship_info: {
            relationship_category: 'family',
            relationship_type: 'spouse'
          }
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        if (rel.relationship_info?.relationship_type === 'spouse') {
          return '배우자';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      // 테이블에 "배우자" 레이블이 표시되는지 확인
      await waitFor(() => {
        expect(screen.getByText('배우자')).toBeInTheDocument();
      });
    });

    it('자녀 관계는 "(자녀)" 레이블을 표시해야 한다', async () => {
      const childCustomer: Customer = {
        _id: 'child-1',
        personal_info: { name: '박민수' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-child',
          from_customer: mockCustomer,
          related_customer: childCustomer,
          relationship_info: {
            relationship_category: 'family',
            relationship_type: 'child'
          }
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        if (rel.relationship_info?.relationship_type === 'child') {
          return '자녀';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('자녀')).toBeInTheDocument();
      });
    });
  });

  describe('법인 관계 레이블 표시', () => {
    it('CEO 관계는 "(대표)" 레이블을 표시해야 한다', async () => {
      const company: Customer = {
        _id: 'company-1',
        personal_info: { name: '캐치업 코리아' },
        insurance_info: { customer_type: '법인' }
      } as Customer;

      const ceoCustomer: Customer = {
        _id: 'ceo-1',
        personal_info: { name: '정부균' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-ceo',
          from_customer: company,
          related_customer: ceoCustomer,
          relationship_info: {
            relationship_category: 'corporate',
            relationship_type: 'ceo'
          }
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        if (rel.relationship_info?.relationship_type === 'ceo') {
          return '대표';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('대표')).toBeInTheDocument();
      });
    });

    it('임원 관계는 "(임원)" 레이블을 표시해야 한다', async () => {
      const company: Customer = {
        _id: 'company-1',
        personal_info: { name: '캐치업 코리아' },
        insurance_info: { customer_type: '법인' }
      } as Customer;

      const executiveCustomer: Customer = {
        _id: 'exec-1',
        personal_info: { name: '신상철' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-exec',
          from_customer: company,
          related_customer: executiveCustomer,
          relationship_info: {
            relationship_category: 'corporate',
            relationship_type: 'executive'
          }
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        if (rel.relationship_info?.relationship_type === 'executive') {
          return '임원';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText('임원')).toBeInTheDocument();
      });
    });
  });

  describe('사용자 정의 레이블 우선 표시', () => {
    it('display_relationship_label이 있으면 relationship_type 대신 표시해야 한다', async () => {
      const company: Customer = {
        _id: 'company-1',
        personal_info: { name: '캐치업 코리아' },
        insurance_info: { customer_type: '법인' }
      } as Customer;

      const consultantCustomer: Customer = {
        _id: 'consultant-1',
        personal_info: { name: '김컨설턴트' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-consultant',
          from_customer: company,
          related_customer: consultantCustomer,
          relationship_info: {
            relationship_category: 'corporate',
            relationship_type: 'employee'
          },
          display_relationship_label: '전문 컨설턴트'
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        // display_relationship_label이 있으면 우선 반환
        if (rel.display_relationship_label) {
          return rel.display_relationship_label;
        }
        if (rel.relationship_info?.relationship_type === 'employee') {
          return '직원';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      // "전문 컨설턴트"가 표시되고 "직원"은 표시되지 않아야 함
      await waitFor(() => {
        expect(screen.getByText('전문 컨설턴트')).toBeInTheDocument();
      });

      expect(screen.queryByText('직원')).not.toBeInTheDocument();
    });
  });

  describe('역방향 관계 표시', () => {
    it('역방향 관계는 "(역방향)" 표시를 포함해야 한다', async () => {
      const relatedCustomer: Customer = {
        _id: 'related-1',
        personal_info: { name: '이관계' },
        insurance_info: { customer_type: '개인' }
      } as Customer;

      const relationships: Relationship[] = [
        {
          _id: 'rel-reversed',
          from_customer: relatedCustomer,
          related_customer: mockCustomer,
          relationship_info: {
            relationship_category: 'family',
            relationship_type: 'parent'
          },
          is_reversed: true
        } as Relationship
      ];

      mockGetRelationshipTypeLabel.mockImplementation((rel: Relationship) => {
        if (rel.relationship_info?.relationship_type === 'parent') {
          return '부모';
        }
        return '';
      });

      renderComponent(relationships);

      await waitFor(() => {
        expect(mockGetRelationshipTypeLabel).toHaveBeenCalled();
      });

      // "부모" 레이블과 "(역방향)" 표시가 모두 있어야 함
      await waitFor(() => {
        expect(screen.getByText('부모')).toBeInTheDocument();
        expect(screen.getByText('(역방향)')).toBeInTheDocument();
      });
    });
  });
});
