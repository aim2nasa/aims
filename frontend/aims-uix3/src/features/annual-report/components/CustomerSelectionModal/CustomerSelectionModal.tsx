/**
 * CustomerSelectionModal
 *
 * AR 업로드 시 고객 선택 모달
 * - 유사 이름 고객 목록 표시
 * - 기존 고객 선택 또는 새 고객 등록 선택
 * - 새 고객 추가 시 목록에 표시 후 선택
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Tooltip } from '@/shared/ui/Tooltip';
import type { Customer } from '@/entities/customer';
import { formatDate } from '@/shared/lib/timeUtils';
import './CustomerSelectionModal.css';

export interface CustomerSelectionModalProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** AR 메타데이터 (추출된 고객명, 발행일) */
  arMetadata: {
    customer_name: string;
    issue_date: string;
  };
  /** 검색된 유사 이름 고객 목록 */
  matchingCustomers: Customer[];
  /** 기존 고객 선택 시 콜백 */
  onSelectCustomer: (customerId: string) => void;
  /** 새 고객 등록 선택 시 콜백 */
  onCreateNewCustomer: () => void;
  /** 로딩 상태 */
  isLoading?: boolean;
  /** AR 파일명 (선택) */
  fileName?: string;
  /** 새로 생성된 고객 ID (자동 선택용) */
  newlyCreatedCustomerId?: string | null;
}

/**
 * AR 업로드 시 고객 선택 모달
 *
 * Case 2: 유사 이름 고객이 1명 이상인 경우 표시
 * - 기존 고객 선택: 해당 고객에 AR 추가
 * - 새 고객으로 등록: NewCustomerInputModal로 전환
 */
export const CustomerSelectionModal: React.FC<CustomerSelectionModalProps> = ({
  isOpen,
  onClose,
  arMetadata,
  matchingCustomers,
  onSelectCustomer,
  onCreateNewCustomer,
  isLoading = false,
  fileName,
  newlyCreatedCustomerId,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // 새로 생성된 고객 자동 선택
  useEffect(() => {
    if (newlyCreatedCustomerId) {
      setSelectedCustomerId(newlyCreatedCustomerId);
    }
  }, [newlyCreatedCustomerId]);

  const handleSelect = () => {
    if (selectedCustomerId) {
      onSelectCustomer(selectedCustomerId);
    }
  };

  const handleRowClick = (customerId: string) => {
    setSelectedCustomerId(customerId);
  };

  const handleRowDoubleClick = (customerId: string) => {
    onSelectCustomer(customerId);
  };

  // 고객 등록일 포맷
  const formatRegisteredAt = (customer: Customer): string => {
    const createdAt = customer.meta?.created_at;
    if (!createdAt) return '-';
    return formatDate(createdAt);
  };

  // 최근 AR 날짜 포맷
  const formatLatestAR = (customer: Customer): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports = (customer as any).annual_reports;
    if (!reports || reports.length === 0) return '-';

    // 가장 최근 AR의 발행일
    const latestReport = reports[0];
    if (!latestReport?.issue_date) return '-';

    // issue_date가 Date 객체이거나 문자열일 수 있음
    const issueDate = latestReport.issue_date;
    if (typeof issueDate === 'string') {
      return formatDate(issueDate);
    }
    return formatDate(issueDate.toString());
  };

  // 계약 수
  const getContractCount = (customer: Customer): string => {
    // contracts 필드가 있으면 그 길이, 없으면 annual_reports의 최신 계약 수
    if (customer.contracts && customer.contracts.length > 0) {
      return `${customer.contracts.length}건`;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports = (customer as any).annual_reports;
    if (reports && reports.length > 0 && reports[0]?.total_contracts) {
      return `${reports[0].total_contracts}건`;
    }
    return '-';
  };

  // 생년월일 포맷 (YYYY-MM-DD → YY.MM.DD)
  const formatBirthDate = (customer: Customer): string => {
    const birthDate = customer.personal_info?.birth_date;
    if (!birthDate) return '-';
    // YYYY-MM-DD 형식에서 앞 2자리 년도만
    const parts = birthDate.split('-');
    if (parts.length === 3) {
      return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`;
    }
    return birthDate;
  };

  // 휴대폰 포맷 (마지막 4자리만)
  const formatPhone = (customer: Customer): string => {
    const phone = customer.personal_info?.mobile_phone;
    if (!phone) return '-';
    // 숫자만 추출
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `***-${digits.slice(-4)}`;
    }
    return phone;
  };

  // 주소 포맷 (시/구까지만 표시)
  const formatAddress = (customer: Customer): string => {
    const addressObj = customer.personal_info?.address;
    if (!addressObj) return '-';

    // address1 또는 address2에서 주소 추출
    const fullAddress = addressObj.address1 || addressObj.address2 || '';
    if (!fullAddress) return '-';

    // 시/도 + 구/군까지만 표시 (예: "서울시 강남구")
    const parts = fullAddress.split(' ');
    if (parts.length >= 2) {
      return parts.slice(0, 2).join(' ');
    }
    return fullAddress.length > 15 ? fullAddress.slice(0, 15) + '...' : fullAddress;
  };

  const footer = (
    <div className="customer-selection-modal__footer">
      <Button
        variant="primary"
        onClick={handleSelect}
        disabled={!selectedCustomerId || isLoading}
      >
        선택 완료
      </Button>
    </div>
  );

  return (
    <Modal
      visible={isOpen}
      onClose={onClose}
      title="고객 선택"
      size="lg"
      footer={footer}
      backdropClosable={false}
    >
      <div className="customer-selection-modal">
        {fileName && (
          <p className="customer-selection-modal__filename">
            📄 {fileName}
          </p>
        )}
        <p className="customer-selection-modal__description">
          <strong>{arMetadata.customer_name}</strong>님의 AR을 등록할 고객을 선택하세요.
        </p>

        <div className="customer-selection-modal__table-header">
          <Tooltip content="새 고객 추가" placement="bottom">
            <button
              type="button"
              className="customer-selection-modal__add-btn"
              onClick={onCreateNewCustomer}
              disabled={isLoading}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              새 고객
            </button>
          </Tooltip>
        </div>

        <div className="customer-selection-modal__table-container">
          <table className="customer-selection-modal__table">
            <thead>
              <tr>
                <th className="customer-selection-modal__th--select"></th>
                <th className="customer-selection-modal__th--name">고객명</th>
                <th className="customer-selection-modal__th--birth">생년월일</th>
                <th className="customer-selection-modal__th--phone">휴대폰</th>
                <th className="customer-selection-modal__th--address">주소</th>
                <th className="customer-selection-modal__th--type">구분</th>
                <th className="customer-selection-modal__th--date">등록일</th>
                <th className="customer-selection-modal__th--count">계약</th>
              </tr>
            </thead>
            <tbody>
              {matchingCustomers.map((customer) => {
                const customerId = customer._id;
                const isSelected = selectedCustomerId === customerId;
                const isNewlyCreated = customerId === newlyCreatedCustomerId;

                return (
                  <tr
                    key={customerId}
                    className={`customer-selection-modal__row ${isSelected ? 'customer-selection-modal__row--selected' : ''} ${isNewlyCreated ? 'customer-selection-modal__row--new' : ''}`}
                    onClick={() => handleRowClick(customerId)}
                    onDoubleClick={() => handleRowDoubleClick(customerId)}
                  >
                    <td className="customer-selection-modal__td--select">
                      <input
                        type="radio"
                        name="customer-selection"
                        checked={isSelected}
                        onChange={() => setSelectedCustomerId(customerId)}
                        className="customer-selection-modal__radio"
                      />
                    </td>
                    <td className="customer-selection-modal__td--name">
                      {customer.personal_info?.name || '-'}
                      {isNewlyCreated && <span className="customer-selection-modal__new-badge">NEW</span>}
                    </td>
                    <td className="customer-selection-modal__td--birth">
                      {formatBirthDate(customer)}
                    </td>
                    <td className="customer-selection-modal__td--phone">
                      {formatPhone(customer)}
                    </td>
                    <td className="customer-selection-modal__td--address">
                      {formatAddress(customer)}
                    </td>
                    <td className="customer-selection-modal__td--type">
                      {customer.insurance_info?.customer_type || '개인'}
                    </td>
                    <td className="customer-selection-modal__td--date">
                      {formatRegisteredAt(customer)}
                    </td>
                    <td className="customer-selection-modal__td--count">
                      {getContractCount(customer)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {matchingCustomers.length === 0 && (
          <div className="customer-selection-modal__empty">
            유사한 이름의 고객이 없습니다.
          </div>
        )}
      </div>
    </Modal>
  );
};

