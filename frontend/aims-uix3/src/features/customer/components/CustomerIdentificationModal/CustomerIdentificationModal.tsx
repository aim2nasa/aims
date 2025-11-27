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

import React, { useState, useEffect, useRef } from 'react';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import DraggableModal from '@/shared/ui/DraggableModal';
import Button from '@/shared/ui/Button';
import type { Customer } from '@/entities/customer/model';
import type { CheckAnnualReportResult } from '@/features/customer/utils/pdfParser';
import { api } from '@/shared/lib/api';
import './CustomerIdentificationModal.css';

export interface CustomerIdentificationModalProps {
  /** 모달 표시 여부 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** Annual Report 메타데이터 */
  metadata: CheckAnnualReportResult['metadata'];
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
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm();

  console.log('[CustomerIdentificationModal] 🔍 받은 고객 목록:', customers);
  console.log('[CustomerIdentificationModal] 🔍 첫 번째 고객:', customers[0]);
  console.log('[CustomerIdentificationModal] 🔍 첫 번째 고객 _id:', customers[0]?._id);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers.length === 1 ? customers[0]?._id || '' : ''
  );

  // 신규 고객 등록 폼 상태
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState<boolean>(false);

  // 고객별 Annual Report 목록 캐시 (customerId -> issue_date[])
  const customerReportsCacheRef = useRef<Map<string, string[]>>(new Map());

  // ✅ customers prop이 변경될 때 selectedCustomerId 업데이트
  useEffect(() => {
    if (customers.length === 1) {
      const customerId = customers[0]?._id || '';
      console.log('[CustomerIdentificationModal] useEffect - customerId 설정:', customerId);
      setSelectedCustomerId(customerId);
    }
  }, [customers]);

  // 모달이 닫힐 때 캐시 초기화
  useEffect(() => {
    if (!isOpen) {
      customerReportsCacheRef.current.clear();
    }
  }, [isOpen]);

  // 시나리오 판단
  const scenario = customers.length === 1 ? 'single' : customers.length > 1 ? 'multiple' : 'none';

  const handleConfirm = async () => {
    // ⚠️ 중요: selectedCustomerId를 즉시 복사 (state 초기화 전에)
    const customerIdToSend = selectedCustomerId;
    console.log('[CustomerIdentificationModal] 🚀 확인 버튼 클릭, customerId:', customerIdToSend);

    // 기존 고객 선택 시나리오
    if (scenario === 'single' || (scenario === 'multiple' && customerIdToSend)) {
      onCustomerSelected(customerIdToSend);
      return;
    }

    // 신규 고객 생성 시나리오
    if (scenario === 'none') {
      try {
        setIsCreatingCustomer(true);
        console.log('[CustomerIdentificationModal] 🆕 신규 고객 생성 시작:', {
          name: metadata?.customer_name,
          phone: newCustomerPhone,
          email: newCustomerEmail,
        });

        // 고객 생성 - validate 건너뛰고 직접 API 호출
        const response = await api.post<{ success: boolean; data: { customer_id: string } }>('/api/customers', {
          type: 'individual',
          personal_info: {
            name: metadata?.customer_name || '',
            mobile_phone: newCustomerPhone.trim() || undefined,
            email: newCustomerEmail.trim() || undefined,
          },
          insurance_info: {
            customer_type: '개인'
          },
        });

        console.log('[CustomerIdentificationModal] 📦 API 응답 원본:', response);

        if (!response.success || !response.data?.customer_id) {
          throw new Error('고객 생성에 실패했습니다');
        }

        const customerId = response.data.customer_id;
        console.log('[CustomerIdentificationModal] ✅ 신규 고객 생성 완료, ID:', customerId);

        // 생성된 고객의 ID로 Annual Report 파싱 요청
        onCustomerSelected(customerId);
      } catch (error) {
        console.error('[CustomerIdentificationModal] ❌ 신규 고객 생성 실패:', error);
        console.error('[CustomerIdentificationModal] ❌ 에러 상세:', JSON.stringify(error, null, 2));
        showAlert({
          title: '생성 실패',
          message: '고객 생성에 실패했습니다. 다시 시도해주세요.',
          iconType: 'error'
        });
      } finally {
        setIsCreatingCustomer(false);
      }
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title={
        <div className="customer-identification-modal__header-content">
          <div className="customer-identification-modal__icon">📊</div>
          <h2 className="customer-identification-modal__title">Annual Report 감지</h2>
        </div>
      }
      initialWidth={600}
      initialHeight={700}
      minWidth={500}
      minHeight={500}
      footer={
        <div className="customer-identification-modal__footer">
          <Button
            variant="ghost"
            size="md"
            onClick={handleCancel}
            disabled={isCreatingCustomer}
            className="customer-identification-modal__button customer-identification-modal__button--secondary"
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            disabled={
              isCreatingCustomer ||
              (scenario === 'multiple' && !selectedCustomerId)
            }
            loading={isCreatingCustomer}
            className="customer-identification-modal__button customer-identification-modal__button--primary"
          >
            {!isCreatingCustomer && scenario === 'single' && '선택 완료'}
            {!isCreatingCustomer && scenario === 'multiple' && '선택 완료'}
            {!isCreatingCustomer && scenario === 'none' && '등록 후 Annual Report 저장'}
          </Button>
        </div>
      }
      className="customer-identification-modal"
    >
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
              {metadata.report_title && (
                <div className="customer-identification-modal__metadata-row">
                  <span className="customer-identification-modal__metadata-label">보고서</span>
                  <span className="customer-identification-modal__metadata-value">
                    {metadata.report_title}
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
                          <span className="customer-identification-modal__customer-contact-inline">
                            ({customer.personal_info?.mobile_phone || customer.personal_info?.email || '연락처 없음'})
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {scenario === 'none' && (
              <div className="customer-identification-modal__none">
                <p className="customer-identification-modal__message">
                  ⚠️ "{metadata?.customer_name}" 고객이 등록되지 않았습니다.
                </p>
                <p className="customer-identification-modal__hint">
                  신규 고객으로 등록하시겠습니까?
                </p>

                {/* 신규 고객 등록 폼 */}
                <div className="customer-identification-modal__new-customer-form">
                  <div className="customer-identification-modal__form-field">
                    <label className="customer-identification-modal__form-label">고객명</label>
                    <input
                      type="text"
                      className="customer-identification-modal__form-input"
                      value={metadata?.customer_name || ''}
                      readOnly
                    />
                  </div>
                  <div className="customer-identification-modal__form-field">
                    <label className="customer-identification-modal__form-label">전화번호 (선택)</label>
                    <input
                      type="tel"
                      className="customer-identification-modal__form-input"
                      placeholder="010-0000-0000"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="customer-identification-modal__form-field">
                    <label className="customer-identification-modal__form-label">이메일 (선택)</label>
                    <input
                      type="email"
                      className="customer-identification-modal__form-input"
                      placeholder="example@email.com"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </DraggableModal>
  );
};

export default CustomerIdentificationModal;
