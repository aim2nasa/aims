/**
 * RelationshipModal Component Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. 컴포넌트 렌더링 및 초기 상태
 * 2. 고객 검색 기능
 * 3. 관계 유형 선택
 * 4. 폼 검증 및 제출
 * 5. 모달 닫기
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RelationshipModal, type RelationshipType } from './RelationshipModal';
import { RelationshipService } from '@/services/relationshipService';

// Mock services
vi.mock('@/services/customerService', () => ({
  CustomerService: {
    getCustomers: vi.fn()
  }
}));

vi.mock('@/services/relationshipService', () => ({
  RelationshipService: {
    getAllRelationshipsWithCustomers: vi.fn(),
    createRelationship: vi.fn()
  }
}));

describe('RelationshipModal', () => {
  const mockOnCancel = vi.fn();
  const mockCustomerId = 'current-customer-123';

  const mockRelationshipTypes: RelationshipType[] = [
    {
      value: 'spouse',
      label: '배우자',
      icon: '❤️',
      description: '배우자 관계'
    },
    {
      value: 'child',
      label: '자녀',
      icon: '👶',
      description: '자녀 관계'
    }
  ];

  const mockTitleIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M0 0h16v16H0z" />
    </svg>
  );

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getAllRelationshipsWithCustomers - 빈 관계 목록 반환
    vi.mocked(RelationshipService.getAllRelationshipsWithCustomers).mockResolvedValue({
      relationships: [],
      customers: []
    } as any);
  });

  describe('렌더링 및 초기 상태', () => {
    it('visible이 true일 때 모달이 렌더링되어야 한다', () => {
      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      expect(screen.getByText('가족 관계 추가')).toBeInTheDocument();
    });

    it('visible이 false일 때 모달이 렌더링되지 않아야 한다', () => {
      render(
        <RelationshipModal
          visible={false}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      expect(screen.queryByText('가족 관계 추가')).not.toBeInTheDocument();
    });

    it('memberLabel이 올바르게 표시되어야 한다', () => {
      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="법인 관계자 추가"
          titleIcon={mockTitleIcon}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      expect(screen.getByText(/관계자 선택/)).toBeInTheDocument();
    });
  });

  describe('관계 유형 선택', () => {
    it('제공된 관계 유형 목록이 select 옵션으로 렌더링되어야 한다', () => {
      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      // "관계 유형 선택" 텍스트가 있는지 확인
      expect(screen.getByText('관계 유형 선택')).toBeInTheDocument();

      // Select 요소 찾기 (class로)
      const selects = document.querySelectorAll('.form-select');
      expect(selects.length).toBeGreaterThan(0);

      // 관계 유형 옵션 확인
      expect(screen.getByText(/배우자/)).toBeInTheDocument();
      expect(screen.getByText(/자녀/)).toBeInTheDocument();
    });

    it('allowCustomRelation이 true일 때 직접 입력 옵션이 표시되어야 한다', () => {
      const {container} = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="법인 관계자 추가"
          titleIcon={mockTitleIcon}
          memberLabel="관계자"
          relationshipCategory="corporate"
          relationshipTypes={mockRelationshipTypes}
          allowCustomRelation={true}
        />
      );

      // 직접 입력 옵션이 select 안에 있는지 확인
      const selectElements = container.querySelectorAll('select');
      let hasDirectInput = false;
      selectElements.forEach(select => {
        if (select.textContent?.includes('직접 입력')) {
          hasDirectInput = true;
        }
      });
      expect(hasDirectInput).toBe(true);
    });

    it('allowCustomRelation이 false일 때 직접 입력 옵션이 표시되지 않아야 한다', () => {
      const {container} = render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
          allowCustomRelation={false}
        />
      );

      // 직접 입력 옵션이 없어야 함
      const selectElements = container.querySelectorAll('select');
      let hasDirectInput = false;
      selectElements.forEach(select => {
        if (select.textContent?.includes('직접 입력')) {
          hasDirectInput = true;
        }
      });
      expect(hasDirectInput).toBe(false);
    });
  });

  describe('고객 검색', () => {
    it('검색 입력란이 렌더링되어야 한다', () => {
      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
          filterCustomerType="개인"
        />
      );

      const searchInput = screen.getByPlaceholderText('고객 이름을 입력하여 검색하세요');
      expect(searchInput).toBeInTheDocument();
    });

    it('검색 입력란에 텍스트를 입력할 수 있어야 한다', async () => {
      const user = userEvent.setup();

      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      const searchInput = screen.getByPlaceholderText('고객 이름을 입력하여 검색하세요') as HTMLInputElement;
      await user.type(searchInput, '김철수');

      expect(searchInput.value).toBe('김철수');
    });
  });

  describe('폼 제출', () => {
    it('추가 버튼은 관계 유형과 고객이 모두 선택되어야 활성화된다', async () => {
      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      const submitButton = screen.getByRole('button', { name: /추가/ });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('모달 닫기', () => {
    it('취소 버튼 클릭 시 onCancel이 호출되어야 한다', async () => {
      const user = userEvent.setup();

      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /취소/ });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('X 버튼 클릭 시 onCancel이 호출되어야 한다', async () => {
      const user = userEvent.setup();

      render(
        <RelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          title="가족 관계 추가"
          titleIcon={mockTitleIcon}
          memberLabel="가족 구성원"
          relationshipCategory="family"
          relationshipTypes={mockRelationshipTypes}
        />
      );

      const closeButton = screen.getByLabelText(/닫기/);
      await user.click(closeButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});
