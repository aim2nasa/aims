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
import type { Customer } from '@/entities/customer/model';
import type { CheckAnnualReportResult } from '@/features/customer/utils/pdfParser';
import { api } from '@/shared/lib/api';
import { AnnualReportApi } from '@/features/customer/api/annualReportApi';
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

  // 중복 검사 상태
  const [isDuplicate, setIsDuplicate] = useState<boolean>(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string>('');
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState<boolean>(false);

  // 고객별 Annual Report 목록 캐시 (customerId -> issue_date[])
  const customerReportsCacheRef = useRef<Map<string, string[]>>(new Map());

  // 드래그 상태
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // ✅ customers prop이 변경될 때 selectedCustomerId 업데이트
  useEffect(() => {
    if (customers.length === 1) {
      const customerId = customers[0]?._id || '';
      console.log('[CustomerIdentificationModal] useEffect - customerId 설정:', customerId);
      setSelectedCustomerId(customerId);
    }
  }, [customers]);

  /**
   * 중복 검사 함수
   * - 선택된 고객의 Annual Report 목록을 조회하여 발행일 중복 확인
   * - 캐싱을 통해 동일 고객 재선택 시 API 호출 최적화
   */
  const checkDuplicate = async (customerId: string) => {
    if (!metadata?.issue_date || !customerId) {
      setIsDuplicate(false);
      setDuplicateMessage('');
      return;
    }

    setIsCheckingDuplicate(true);

    try {
      // 캐시에서 먼저 확인
      let issueDates = customerReportsCacheRef.current.get(customerId);

      if (!issueDates) {
        // 캐시에 없으면 API 호출
        console.log('[CustomerIdentificationModal] 📡 고객 AR 목록 조회:', customerId);
        const response = await AnnualReportApi.getAnnualReports(customerId, 100);

        if (response.success && response.data) {
          // issue_date만 추출하여 캐시에 저장
          issueDates = response.data.reports
            .map(report => {
              // ISO 날짜에서 YYYY-MM-DD 부분만 추출
              const dateStr = report.issue_date?.split('T')[0];
              return dateStr || '';
            })
            .filter(date => date !== ''); // 빈 문자열 제거
          customerReportsCacheRef.current.set(customerId, issueDates);
          console.log('[CustomerIdentificationModal] ✅ 캐시 저장 완료:', issueDates);
        } else {
          console.warn('[CustomerIdentificationModal] ⚠️ AR 목록 조회 실패:', response.error);
          issueDates = [];
          customerReportsCacheRef.current.set(customerId, issueDates);
        }
      } else {
        console.log('[CustomerIdentificationModal] 🎯 캐시 사용:', issueDates);
      }

      // 현재 업로드 문서의 발행일 (metadata.issue_date는 "YYYY-MM-DD" 형식)
      const currentIssueDate = metadata.issue_date;

      // 중복 검사
      if (issueDates.includes(currentIssueDate)) {
        setIsDuplicate(true);
        setDuplicateMessage(`⚠️ 이미 등록된 Annual Report입니다. (발행일: ${currentIssueDate})`);
        console.log('[CustomerIdentificationModal] ❌ 중복 발견:', currentIssueDate);
      } else {
        setIsDuplicate(false);
        setDuplicateMessage('');
        console.log('[CustomerIdentificationModal] ✅ 중복 없음:', currentIssueDate);
      }
    } catch (error) {
      console.error('[CustomerIdentificationModal] ❌ 중복 검사 오류:', error);
      setIsDuplicate(false);
      setDuplicateMessage('');
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // 선택된 고객이 변경될 때마다 중복 검사
  useEffect(() => {
    if (selectedCustomerId) {
      checkDuplicate(selectedCustomerId);
    } else {
      setIsDuplicate(false);
      setDuplicateMessage('');
    }
  }, [selectedCustomerId, metadata?.issue_date]);

  // 모달이 닫힐 때 캐시 초기화 및 위치 리셋
  useEffect(() => {
    if (!isOpen) {
      customerReportsCacheRef.current.clear();
      setIsDuplicate(false);
      setDuplicateMessage('');
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // 드래그 이벤트 핸들러
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 왼쪽 마우스 버튼만
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  if (!isOpen) return null;

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
        alert('고객 생성에 실패했습니다. 다시 시도해주세요.');
      } finally {
        setIsCreatingCustomer(false);
      }
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="customer-identification-modal__overlay">
      <div
        ref={modalRef}
        className={`customer-identification-modal ${isDragging ? 'customer-identification-modal--dragging' : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        {/* Header */}
        <div
          className="customer-identification-modal__header"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="customer-identification-modal__icon">📊</div>
          <h2 className="customer-identification-modal__title">Annual Report 감지</h2>
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

          {/* Duplicate Warning */}
          {duplicateMessage && (
            <div className="customer-identification-modal__duplicate-warning">
              {duplicateMessage}
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

        {/* Footer */}
        <div className="customer-identification-modal__footer">
          <button
            className="customer-identification-modal__button customer-identification-modal__button--secondary"
            onClick={handleCancel}
            disabled={isCreatingCustomer}
          >
            취소
          </button>
          <button
            className="customer-identification-modal__button customer-identification-modal__button--primary"
            onClick={handleConfirm}
            disabled={
              isCreatingCustomer ||
              isCheckingDuplicate ||
              isDuplicate ||
              (scenario === 'multiple' && !selectedCustomerId)
            }
          >
            {isCheckingDuplicate && '중복 검사 중...'}
            {!isCheckingDuplicate && isCreatingCustomer && '고객 생성 중...'}
            {!isCheckingDuplicate && !isCreatingCustomer && scenario === 'single' && '선택 완료'}
            {!isCheckingDuplicate && !isCreatingCustomer && scenario === 'multiple' && '선택 완료'}
            {!isCheckingDuplicate && !isCreatingCustomer && scenario === 'none' && '등록 후 Annual Report 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerIdentificationModal;
