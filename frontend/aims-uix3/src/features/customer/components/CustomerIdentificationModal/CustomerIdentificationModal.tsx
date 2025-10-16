/**
 * AIMS UIX-3 Customer Identification Modal
 * @since 2025-10-16
 * @version 1.0.0
 *
 * Annual Report 업로드 시 고객 식별 모달
 * - 고객 1명: 자동 선택 확인 UI
 * - 동명이인 (2명 이상): 라디오 버튼 선택
 * - 고객 없음: 신규 생성 안내
 */

import React, { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import type { Customer } from '@/entities/customer/model';
import type { CheckAnnualReportResponse } from '@/features/customer/api/annualReportApi';
import './CustomerIdentificationModal.css';

export interface CustomerIdentificationModalProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** Annual Report 메타데이터 */
  metadata: CheckAnnualReportResponse['metadata'];
  /** 검색된 고객 목록 */
  customers: Customer[];
  /** 고객 선택 완료 핸들러 (customerId 전달) */
  onCustomerSelected: (customerId: string) => void;
  /** 파일 정보 (표시용) */
  fileName: string;
}

export const CustomerIdentificationModal: React.FC<CustomerIdentificationModalProps> = ({
  isOpen,
  onClose,
  metadata,
  customers,
  onCustomerSelected,
  fileName,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers.length === 1 ? customers[0]?._id || '' : ''
  );

  if (!isOpen) return null;

  // 시나리오 판단
  const scenario = customers.length === 1 ? 'single' : customers.length > 1 ? 'multiple' : 'none';

  const handleConfirm = () => {
    if (scenario === 'single' || (scenario === 'multiple' && selectedCustomerId)) {
      onCustomerSelected(selectedCustomerId);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // 고객 정보 표시용 함수
  const getCustomerDisplayInfo = (customer: Customer): string => {
    const name = customer.personal_info?.name || '이름 없음';
    const phone = customer.personal_info?.mobile_phone || '';
    const email = customer.personal_info?.email || '';
    const contact = phone || email || '연락처 없음';
    return `${name} (${contact})`;
  };

  return (
    <div className="customer-identification-modal__overlay">
      <div className="customer-identification-modal">
        {/* Header */}
        <div className="customer-identification-modal__header">
          <div className="customer-identification-modal__icon">📊</div>
          <h2 className="customer-identification-modal__title">Annual Report 감지</h2>
          <button
            type="button"
            className="customer-identification-modal__close"
            onClick={handleCancel}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="customer-identification-modal__content">
          {/* File Info */}
          <div className="customer-identification-modal__file-info">
            <div className="customer-identification-modal__file-icon">📄</div>
            <div className="customer-identification-modal__file-details">
              <div className="customer-identification-modal__file-name">{fileName}</div>
              <div className="customer-identification-modal__file-type">Annual Review Report</div>
            </div>
          </div>

          {/* Metadata */}
          {metadata && (
            <div className="customer-identification-modal__metadata">
              <div className="customer-identification-modal__metadata-row">
                <span className="customer-identification-modal__metadata-label">고객명</span>
                <span className="customer-identification-modal__metadata-value">
                  {metadata.customer_name}
                </span>
              </div>
              <div className="customer-identification-modal__metadata-row">
                <span className="customer-identification-modal__metadata-label">발행일</span>
                <span className="customer-identification-modal__metadata-value">
                  {metadata.issue_date}
                </span>
              </div>
              {metadata.fsr_name && (
                <div className="customer-identification-modal__metadata-row">
                  <span className="customer-identification-modal__metadata-label">FSR</span>
                  <span className="customer-identification-modal__metadata-value">
                    {metadata.fsr_name}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Customer Selection */}
          <div className="customer-identification-modal__customer-section">
            {scenario === 'single' && (
              <div className="customer-identification-modal__single">
                <p className="customer-identification-modal__message">
                  다음 고객의 Annual Report로 자동 등록됩니다:
                </p>
                <div className="customer-identification-modal__customer-card">
                  <div className="customer-identification-modal__customer-name">
                    {customers[0]?.personal_info?.name || '이름 없음'}
                  </div>
                  <div className="customer-identification-modal__customer-contact">
                    {customers[0]?.personal_info?.mobile_phone || customers[0]?.personal_info?.email || ''}
                  </div>
                </div>
              </div>
            )}

            {scenario === 'multiple' && (
              <div className="customer-identification-modal__multiple">
                <p className="customer-identification-modal__message">
                  "{metadata?.customer_name}" 이름으로 {customers.length}명의 고객이 검색되었습니다.
                  <br />
                  해당하는 고객을 선택해주세요:
                </p>
                <div className="customer-identification-modal__customer-list">
                  {customers.map((customer) => (
                    <label
                      key={customer._id}
                      className={`customer-identification-modal__customer-option ${
                        selectedCustomerId === customer._id ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="customer"
                        value={customer._id}
                        checked={selectedCustomerId === customer._id}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="customer-identification-modal__radio"
                      />
                      <div className="customer-identification-modal__customer-info">
                        <div className="customer-identification-modal__customer-name">
                          {customer.personal_info?.name || '이름 없음'}
                        </div>
                        <div className="customer-identification-modal__customer-contact">
                          {getCustomerDisplayInfo(customer)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {scenario === 'none' && (
              <div className="customer-identification-modal__none">
                <div className="customer-identification-modal__empty-icon">👤</div>
                <p className="customer-identification-modal__message">
                  "{metadata?.customer_name}" 이름으로 등록된 고객이 없습니다.
                </p>
                <p className="customer-identification-modal__hint">
                  고객을 먼저 생성한 후 다시 업로드해주세요.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="customer-identification-modal__footer">
          <Button variant="secondary" size="md" onClick={handleCancel}>
            취소
          </Button>
          {scenario !== 'none' && (
            <Button
              variant="primary"
              size="md"
              onClick={handleConfirm}
              disabled={scenario === 'multiple' && !selectedCustomerId}
            >
              {scenario === 'single' ? '확인' : '선택 완료'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerIdentificationModal;
