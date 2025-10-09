/**
 * AIMS UIX-3 Customer Detail View
 * @since 2025-10-03
 * @version 5.0.0
 *
 * 🍎 고객 등록 UI와 완벽히 동일한 레이아웃
 * - 모든 필드를 항상 표시 (등록 UI와 동일)
 * - 값이 없으면 빈 칸으로 표시
 */

import React, { useState, useEffect, useCallback } from 'react';
import BaseViewer from '../../../../components/BaseViewer/BaseViewer';
import CustomerEditModal from '../CustomerEditModal';
import FamilyRelationshipModal from '../../components/FamilyRelationshipModal';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import type { Customer } from '@/entities/customer/model';
import { CustomerService } from '@/services/customerService';
import './CustomerDetailView.css';

interface CustomerDetailViewProps {
  customer: Customer;
  onClose: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  gapLeft?: number;
  gapRight?: number;
  gapTop?: number;
  gapBottom?: number;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customer,
  onClose,
  onRefresh,
  onDelete,
  gapLeft = 2,
  gapRight = 2,
  gapTop = 2,
  gapBottom = 2,
}) => {
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isFamilyModalVisible, setIsFamilyModalVisible] = useState(false);
  const [customerData, setCustomerData] = useState<Customer>(customer);
  const confirmController = useAppleConfirmController();

  useEffect(() => {
    setCustomerData(customer);
  }, [customer]);

  const handleEditClick = useCallback(() => {
    setIsEditModalVisible(true);
  }, []);

  const handleDeleteClick = useCallback(async () => {
    const confirmed = await confirmController.actions.openModal({
      title: '고객 삭제',
      message: `"${customer.personal_info?.name}" 고객을 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    });

    if (confirmed) {
      try {
        await CustomerService.deleteCustomer(customer._id);
        onDelete?.();
        onClose();
      } catch (error) {
        await confirmController.actions.openModal({
          title: '삭제 실패',
          message: error instanceof Error ? error.message : '고객 삭제에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        });
      }
    }
  }, [customer, onClose, onDelete, confirmController]);

  const handleSaveSuccess = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleFamilyRelationshipSuccess = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  // 개인 고객인지 확인
  const isPersonalCustomer = customer.insurance_info?.customer_type === '개인';

  if (!customerData) return null;

  // 고객 타입 아이콘 (전체 보기와 동일한 SVG)
  const getCustomerTypeIcon = () => {
    const customerType = customer.insurance_info?.customer_type;
    if (customerType === '법인') {
      // 법인: 건물 아이콘
      return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-detail-icon customer-icon--corporate">
          <circle cx="10" cy="10" r="10" opacity="0.2" />
          <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
        </svg>
      );
    }
    // 개인: 사람 아이콘
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-detail-icon customer-icon--personal">
        <circle cx="10" cy="10" r="10" opacity="0.2" />
        <circle cx="10" cy="7" r="3" />
        <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
      </svg>
    );
  };

  // 아이콘과 이름을 조합한 타이틀
  const customerTitle = (
    <span className="customer-detail-title">
      {getCustomerTypeIcon()}
      <span className="customer-detail-name">{customer.personal_info?.name || '고객 정보'}</span>
    </span>
  );


  return (
    <BaseViewer
      visible={true}
      title={customerTitle}
      onClose={onClose}
      gapLeft={gapLeft}
      gapRight={gapRight}
      gapTop={gapTop}
      gapBottom={gapBottom}
    >
      <div className="customer-detail-view">
        <div className="customer-detail-view__inner">
          {/* 🍎 액션 버튼 영역 */}
          <div className="customer-detail-view__actions">
            {isPersonalCustomer && (
              <button
                className="customer-detail-view__action-button customer-detail-view__action-button--family"
                onClick={() => setIsFamilyModalVisible(true)}
                title="가족 구성원을 추가합니다"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM10.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1H2v-1zM10 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1h-7v-1z"/>
                </svg>
                가족 관계 추가
              </button>
            )}
            <button
              className="customer-detail-view__action-button customer-detail-view__action-button--primary"
              onClick={handleEditClick}
              autoFocus
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.146.146a.5.5 0 01.708 0l3 3a.5.5 0 010 .708l-10 10a.5.5 0 01-.168.11l-5 2a.5.5 0 01-.65-.65l2-5a.5.5 0 01.11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 2.793L10.5 3 4 9.5 3.1 12.9l3.4-.9 6.293-6.707z"/>
              </svg>
              정보 수정
            </button>
            <button
              className="customer-detail-view__action-button customer-detail-view__action-button--destructive"
              onClick={handleDeleteClick}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                <path d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
              고객 삭제
            </button>
          </div>

          {/* 🍎 기본 정보 섹션 */}
          <div className="form-section">
            <h3 className="form-section__title form-section__title--basic">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="5" r="2.5"/>
                <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
              </svg>
              <span>기본</span>
            </h3>
            <div className="form-section__content">
              {/* 이름 */}
              <div className="form-row">
                <label className="form-row__label">이름</label>
                <div className="form-row__value">{customer.personal_info?.name || ''}</div>
              </div>

              {/* 이름 (영문) */}
              <div className="form-row">
                <label className="form-row__label">이름 (영문)</label>
                <div className="form-row__value">{customer.personal_info?.name_en || ''}</div>
              </div>

              {/* 생년월일 */}
              <div className="form-row">
                <label className="form-row__label">생년월일</label>
                <div className="form-row__value">{customer.personal_info?.birth_date || ''}</div>
              </div>

              {/* 성별 */}
              <div className="form-row">
                <label className="form-row__label">성별</label>
                <div className="form-row__value">
                  {customer.personal_info?.gender === 'M' ? '남성' : customer.personal_info?.gender === 'F' ? '여성' : ''}
                </div>
              </div>
            </div>
          </div>

          {/* 🍎 연락처 정보 섹션 */}
          <div className="form-section">
            <h3 className="form-section__title form-section__title--contact">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-11A1.5 1.5 0 0012.5 1h-9zM8 4a1 1 0 011 1v1a1 1 0 01-2 0V5a1 1 0 011-1zm-2 7a1 1 0 011-1h2a1 1 0 110 2H7a1 1 0 01-1-1z"/>
              </svg>
              <span>연락처</span>
            </h3>
            <div className="form-section__content">
              {/* 휴대폰 */}
              <div className="form-row">
                <label className="form-row__label">휴대폰</label>
                <div className="form-row__value">{customer.personal_info?.mobile_phone || ''}</div>
              </div>

              {/* 집 전화 */}
              <div className="form-row">
                <label className="form-row__label">집 전화</label>
                <div className="form-row__value">{customer.personal_info?.home_phone || ''}</div>
              </div>

              {/* 회사 전화 */}
              <div className="form-row">
                <label className="form-row__label">회사 전화</label>
                <div className="form-row__value">{customer.personal_info?.work_phone || ''}</div>
              </div>

              {/* 이메일 */}
              <div className="form-row">
                <label className="form-row__label">이메일</label>
                <div className="form-row__value">{customer.personal_info?.email || ''}</div>
              </div>
            </div>
          </div>

          {/* 🍎 주소 정보 섹션 */}
          <div className="form-section">
            <h3 className="form-section__title form-section__title--address">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"/>
              </svg>
              <span>주소</span>
            </h3>
            <div className="form-section__content">
              {/* 우편번호 */}
              <div className="form-row">
                <label className="form-row__label">우편번호</label>
                <div className="form-row__value">{customer.personal_info?.address?.postal_code || ''}</div>
              </div>

              {/* 주소 */}
              <div className="form-row">
                <label className="form-row__label">주소</label>
                <div className="form-row__value">{customer.personal_info?.address?.address1 || ''}</div>
              </div>

              {/* 상세주소 */}
              <div className="form-row">
                <label className="form-row__label">상세주소</label>
                <div className="form-row__value">{customer.personal_info?.address?.address2 || ''}</div>
              </div>
            </div>
          </div>

          {/* 🍎 보험 정보 섹션 */}
          <div className="form-section">
            <h3 className="form-section__title form-section__title--insurance">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L2 3v5c0 3.5 2.5 6.5 6 7 3.5-.5 6-3.5 6-7V3L8 0zm0 2l4 2v4c0 2.5-1.5 4.5-4 5-2.5-.5-4-2.5-4-5V4l4-2z"/>
              </svg>
              <span>보험</span>
            </h3>
            <div className="form-section__content">
              {/* 고객 유형 */}
              <div className="form-row">
                <label className="form-row__label">고객 유형</label>
                <div className="form-row__value">{customer.insurance_info?.customer_type || ''}</div>
              </div>

              {/* 위험도 */}
              <div className="form-row">
                <label className="form-row__label">위험도</label>
                <div className="form-row__value">{customer.insurance_info?.risk_level || ''}</div>
              </div>

              {/* 연간 보험료 */}
              <div className="form-row">
                <label className="form-row__label">연간 보험료</label>
                <div className="form-row__value">
                  {customer.insurance_info?.annual_premium != null ? `${customer.insurance_info.annual_premium.toLocaleString()}원` : '-'}
                </div>
              </div>

              {/* 총 보장액 */}
              <div className="form-row">
                <label className="form-row__label">총 보장액</label>
                <div className="form-row__value">
                  {customer.insurance_info?.total_coverage != null ? `${customer.insurance_info.total_coverage.toLocaleString()}원` : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 고객 정보 수정 모달 */}
      <CustomerEditModal
        visible={isEditModalVisible}
        customer={customerData}
        onClose={() => setIsEditModalVisible(false)}
        onSuccess={handleSaveSuccess}
      />

      {/* 가족 관계 추가 모달 */}
      <FamilyRelationshipModal
        visible={isFamilyModalVisible}
        onCancel={() => setIsFamilyModalVisible(false)}
        customerId={customer._id}
        onSuccess={handleFamilyRelationshipSuccess}
      />

      {/* 🍎 애플 스타일 확인 모달 */}
      <AppleConfirmModal
        state={confirmController.state}
        actions={confirmController.actions}
      />
    </BaseViewer>
  );
};

export default CustomerDetailView;
