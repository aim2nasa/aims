/**
 * CustomerIdentificationModal Component Unit Tests
 * @since 2025-10-23
 *
 * 테스트 범위:
 * 1. 드래그 기능
 * 2. 고객 자동 선택 (1명일 때)
 * 3. 고객 선택 (여러명일 때)
 * 4. 신규 고객 생성
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerIdentificationModal from './CustomerIdentificationModal';
import type { Customer } from '@/entities/customer/model';
import { api } from '@/shared/lib/api';

// Mock dependencies
vi.mock('@/shared/lib/api', () => ({
  api: {
    post: vi.fn()
  }
}));

describe('CustomerIdentificationModal Component', () => {
  const mockMetadata = {
    customer_name: '김철수',
    issue_date: '2025-01-15',
    report_title: '연간 보고서'
  };

  const mockCustomers: Customer[] = [
    {
      _id: 'customer1',
      personal_info: {
        name: '김철수',
        mobile_phone: '010-1234-5678'
      }
    } as Customer,
    {
      _id: 'customer2',
      personal_info: {
        name: '김철수',
        email: 'kim@example.com'
      }
    } as Customer
  ];

  const mockOnClose = vi.fn();
  const mockOnCustomerSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('렌더링', () => {
    it('isOpen이 false일 때 렌더링되지 않아야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={false}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.queryByText('Annual Report 감지')).not.toBeInTheDocument();
    });

    it('isOpen이 true일 때 렌더링되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.getByText('Annual Report 감지')).toBeInTheDocument();
    });

    it('파일명이 표시되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="annual_report_2025.pdf"
        />
      );

      expect(screen.getByText('annual_report_2025.pdf')).toBeInTheDocument();
    });

    it('메타데이터가 표시되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.getByText('김철수')).toBeInTheDocument();
      expect(screen.getByText('2025-01-15')).toBeInTheDocument();
      expect(screen.getByText('연간 보고서')).toBeInTheDocument();
    });
  });

  describe('고객 자동 선택 (1명) - 9f585c7', () => {
    it('고객이 1명일 때 자동으로 선택되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[mockCustomers[0]!]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.getByText('다음 고객의 Annual Report로 자동 등록됩니다:')).toBeInTheDocument();
      // 고객 카드 내의 전화번호로 확인
      expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    });

    it('선택 완료 버튼 클릭 시 onCustomerSelected가 호출되어야 한다', async () => {
      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[mockCustomers[0]!]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const confirmButton = screen.getByText('선택 완료');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnCustomerSelected).toHaveBeenCalledWith('customer1');
      });
    });
  });

  describe('고객 선택 (여러명)', () => {
    it('고객이 여러명일 때 라디오 버튼으로 선택할 수 있어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.getByText(/2명의 고객이 검색되었습니다/)).toBeInTheDocument();

      const radioButtons = screen.getAllByRole('radio');
      expect(radioButtons).toHaveLength(2);
    });

    it('고객 선택 시 라디오 버튼이 체크되어야 한다', async () => {
      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const radioButtons = screen.getAllByRole('radio') as HTMLInputElement[];

      await user.click(radioButtons[0]!);
      expect(radioButtons[0]!.checked).toBe(true);

      await user.click(radioButtons[1]!);
      expect(radioButtons[1]!.checked).toBe(true);
      expect(radioButtons[0]!.checked).toBe(false);
    });

    it('고객을 선택하지 않으면 선택 완료 버튼이 비활성화되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const confirmButton = screen.getByText('선택 완료');
      expect(confirmButton).toBeDisabled();
    });

    it('고객 선택 후 선택 완료 버튼이 활성화되어야 한다', async () => {
      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const radioButtons = screen.getAllByRole('radio');
      await user.click(radioButtons[0]!);

      await waitFor(() => {
        const confirmButton = screen.getByText('선택 완료');
        expect(confirmButton).not.toBeDisabled();
      });
    });
  });

  describe('드래그 기능 (8e72230)', () => {
    it.skip('DraggableModal로 마이그레이션하여 자체 드래그 로직 제거됨', () => {
      // DraggableModal이 드래그 기능을 제공하므로 자체 드래그 테스트 불필요
    });

    it.skip('마우스 이동 시 모달 위치가 변경되어야 한다 - DraggableModal이 처리', () => {
      // DraggableModal이 드래그 기능을 제공
    });

    it.skip('마우스업 시 드래그가 종료되어야 한다 - DraggableModal이 처리', () => {
      // DraggableModal이 드래그 기능을 제공
    });
  });

  describe('신규 고객 생성', () => {
    it('고객이 없을 때 신규 등록 폼이 표시되어야 한다', () => {
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      expect(screen.getByText(/고객이 등록되지 않았습니다/)).toBeInTheDocument();
      expect(screen.getByText('신규 고객으로 등록하시겠습니까?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('010-0000-0000')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('example@email.com')).toBeInTheDocument();
    });

    it('신규 고객 생성 버튼 클릭 시 API가 호출되어야 한다', async () => {
      vi.mocked(api.post).mockResolvedValue({
        success: true,
        data: {
          customer_id: 'new-customer-id'
        }
      } as any);

      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const confirmButton = screen.getByText('등록 후 Annual Report 저장');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/customers', expect.objectContaining({
          type: 'individual',
          personal_info: expect.objectContaining({
            name: '김철수'
          })
        }));
      });
    });

    it('신규 고객 생성 성공 시 onCustomerSelected가 호출되어야 한다', async () => {
      vi.mocked(api.post).mockResolvedValue({
        success: true,
        data: {
          customer_id: 'new-customer-id'
        }
      } as any);

      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const confirmButton = screen.getByText('등록 후 Annual Report 저장');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnCustomerSelected).toHaveBeenCalledWith('new-customer-id');
      });
    });

    it('전화번호와 이메일을 입력할 수 있어야 한다', async () => {
      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const phoneInput = screen.getByPlaceholderText('010-0000-0000') as HTMLInputElement;
      const emailInput = screen.getByPlaceholderText('example@email.com') as HTMLInputElement;

      await user.type(phoneInput, '010-9876-5432');
      await user.type(emailInput, 'new@example.com');

      expect(phoneInput.value).toBe('010-9876-5432');
      expect(emailInput.value).toBe('new@example.com');
    });
  });

  describe('취소 버튼', () => {
    it('취소 버튼 클릭 시 onClose가 호출되어야 한다', async () => {
      const user = userEvent.setup();
      render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={[]}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const cancelButton = screen.getByText('취소');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('모달 닫힐 때 초기화', () => {
    it.skip('DraggableModal이 위치 초기화를 자동 처리', async () => {
      // DraggableModal의 useModalDragResize 훅이 위치 초기화를 자동으로 처리
    });
  });
});
