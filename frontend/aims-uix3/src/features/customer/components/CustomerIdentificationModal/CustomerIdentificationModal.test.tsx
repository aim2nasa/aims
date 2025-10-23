/**
 * CustomerIdentificationModal Component Unit Tests
 * @since 2025-10-23
 *
 * 테스트 범위 (9f585c7, 8e72230, 1ad58dc, 2de98cc):
 * 1. 중복 검사 기능 + API 캐싱
 * 2. 드래그 기능
 * 3. 고객 자동 선택 (1명일 때)
 * 4. 고객 선택 (여러명일 때)
 * 5. 신규 고객 생성
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerIdentificationModal from './CustomerIdentificationModal';
import type { Customer } from '@/entities/customer/model';
import { AnnualReportApi } from '@/features/customer/api/annualReportApi';
import { api } from '@/shared/lib/api';

// Mock dependencies
vi.mock('@/features/customer/api/annualReportApi', () => ({
  AnnualReportApi: {
    getAnnualReports: vi.fn()
  }
}));

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

    // AnnualReportApi.getAnnualReports 기본 mock 설정
    vi.mocked(AnnualReportApi.getAnnualReports).mockResolvedValue({
      success: true,
      data: {
        reports: []
      }
    } as any);
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

      // 중복 검사 완료 대기
      await waitFor(() => {
        const confirmButton = screen.getByText('선택 완료');
        expect(confirmButton).not.toBeDisabled();
      });

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

  describe('중복 검사 기능 (9f585c7)', () => {
    it('고객 선택 시 중복 검사 API가 호출되어야 한다', async () => {
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
        expect(AnnualReportApi.getAnnualReports).toHaveBeenCalledWith('customer1', 100);
      });
    });

    it('중복된 AR이 있을 때 경고 메시지가 표시되어야 한다', async () => {
      vi.mocked(AnnualReportApi.getAnnualReports).mockResolvedValue({
        success: true,
        data: {
          reports: [
            { issue_date: '2025-01-15T00:00:00Z' }
          ]
        }
      } as any);

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
        expect(screen.getByText(/이미 등록된 Annual Report입니다/)).toBeInTheDocument();
      });
    });

    it('중복 시 선택 완료 버튼이 비활성화되어야 한다', async () => {
      vi.mocked(AnnualReportApi.getAnnualReports).mockResolvedValue({
        success: true,
        data: {
          reports: [
            { issue_date: '2025-01-15T00:00:00Z' }
          ]
        }
      } as any);

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
        expect(confirmButton).toBeDisabled();
      });
    });

    it('캐싱: 동일 고객 재선택 시 API 호출 안 해야 한다', async () => {
      const user = userEvent.setup();
      const callCounts: number[] = [];

      // API 호출 횟수 추적
      vi.mocked(AnnualReportApi.getAnnualReports).mockImplementation(async () => {
        callCounts.push(callCounts.length + 1);
        return {
          success: true,
          data: { reports: [] }
        } as any;
      });

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

      // 첫 번째 선택
      await user.click(radioButtons[0]!);
      await waitFor(() => {
        expect(callCounts.length).toBe(1);
      });

      // 두 번째 고객 선택
      await user.click(radioButtons[1]!);
      await waitFor(() => {
        expect(callCounts.length).toBe(2);
      });

      // 첫 번째 고객 다시 선택 (캐시 사용 - API 호출 없음)
      await user.click(radioButtons[0]!);

      // 약간의 지연 후에도 API 호출 횟수가 증가하지 않아야 함
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(callCounts.length).toBe(2); // 여전히 2번
    });
  });

  describe('드래그 기능 (8e72230)', () => {
    it('헤더를 마우스다운 시 드래그 상태가 되어야 한다', () => {
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

      const header = screen.getByText('Annual Report 감지').parentElement!;

      fireEvent.mouseDown(header, { button: 0, clientX: 100, clientY: 100 });

      const modal = document.querySelector('.customer-identification-modal');
      expect(modal).toHaveClass('customer-identification-modal--dragging');
    });

    it('마우스 이동 시 모달 위치가 변경되어야 한다', () => {
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

      const header = screen.getByText('Annual Report 감지').parentElement!;
      const modal = document.querySelector('.customer-identification-modal') as HTMLElement;

      // 드래그 시작
      fireEvent.mouseDown(header, { button: 0, clientX: 100, clientY: 100 });

      // 마우스 이동
      fireEvent.mouseMove(document, { clientX: 150, clientY: 150 });

      // transform 스타일이 적용되어야 함
      expect(modal.style.transform).toBeTruthy();
    });

    it('마우스업 시 드래그가 종료되어야 한다', () => {
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

      const header = screen.getByText('Annual Report 감지').parentElement!;

      fireEvent.mouseDown(header, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.mouseUp(document);

      const modal = document.querySelector('.customer-identification-modal');
      expect(modal).not.toHaveClass('customer-identification-modal--dragging');
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
    it('모달이 닫히면 캐시가 초기화되어야 한다', async () => {
      const callCounts: number[] = [];

      // API 호출 횟수 추적
      vi.mocked(AnnualReportApi.getAnnualReports).mockImplementation(async () => {
        callCounts.push(callCounts.length + 1);
        return {
          success: true,
          data: { reports: [] }
        } as any;
      });

      const { rerender } = render(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      const user = userEvent.setup();
      const radioButtons = screen.getAllByRole('radio');
      await user.click(radioButtons[0]!);

      await waitFor(() => {
        expect(callCounts.length).toBe(1);
      });

      // 모달 닫기
      rerender(
        <CustomerIdentificationModal
          isOpen={false}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={mockCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      // 모달 다시 열기 (다른 고객 목록으로)
      const differentCustomers = [mockCustomers[1]!]; // 다른 고객
      rerender(
        <CustomerIdentificationModal
          isOpen={true}
          onClose={mockOnClose}
          metadata={mockMetadata}
          customers={differentCustomers}
          onCustomerSelected={mockOnCustomerSelected}
          fileName="test.pdf"
        />
      );

      // 새로운 고객이 자동 선택되어 중복 검사 API가 호출됨 (캐시 초기화 확인)
      await waitFor(() => {
        expect(callCounts.length).toBe(2);
      });
    });
  });
});
