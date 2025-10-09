/**
 * AIMS UIX-3 Customer Detail View
 * @since 2025-10-03
 * @version 6.0.0
 *
 * 🍎 탭 기반 고객 정보 보기
 * - aims-uix2와 동일한 5개 탭 구조
 * - 기본정보, 문서, 관계, 상담이력, 계약
 * - 기본정보 탭만 구현, 나머지는 플레이스홀더
 */

import React, { useState, useEffect, useCallback } from 'react';
import BaseViewer from '../../../../components/BaseViewer/BaseViewer';
import CustomerEditModal from '../CustomerEditModal';
import FamilyRelationshipModal from '../../components/FamilyRelationshipModal';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { Tabs, type Tab } from '../../../../components/Tabs';
import { BasicInfoTab } from './tabs/BasicInfoTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';
import { EmptyTab } from './tabs/EmptyTab';
import type { Customer } from '@/entities/customer/model';
import { CustomerService } from '@/services/customerService';
import './CustomerDetailView.css';

interface CustomerDetailViewProps {
  customer: Customer;
  onClose: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void;
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
  onSelectCustomer,
  gapLeft = 2,
  gapRight = 2,
  gapTop = 2,
  gapBottom = 2,
}) => {
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isFamilyModalVisible, setIsFamilyModalVisible] = useState(false);
  const [customerData, setCustomerData] = useState<Customer>(customer);
  const [activeTab, setActiveTab] = useState<string>('info');
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

  // 🍎 탭 정의 (순서: 기본정보, 관계, 문서, 상담이력, 계약)
  const tabs: Tab[] = [
    {
      key: 'info',
      label: '기본 정보',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="5" r="2.5"/>
          <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z"/>
        </svg>
      )
    },
    {
      key: 'relationships',
      label: '관계',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM10.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1H2v-1zM10 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1h-7v-1z"/>
        </svg>
      )
    },
    {
      key: 'documents',
      label: '문서',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1.5 1.5 0 011.06.44l2.415 2.414a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0112.5 15h-8A1.5 1.5 0 013 13.5v-11z"/>
        </svg>
      ),
      count: 0
    },
    {
      key: 'consultations',
      label: '상담 이력',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm1-8V4a1 1 0 0 0-2 0v4H4a1 1 0 0 0 0 2h3v4a1 1 0 0 0 2 0v-4h3a1 1 0 0 0 0-2H9z"/>
        </svg>
      ),
      count: 0
    },
    {
      key: 'contracts',
      label: '계약',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 3.5a.5.5 0 0 1 1 0V4H12V3.5a.5.5 0 0 1 1 0V4h.5A1.5 1.5 0 0 1 15 5.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-8A1.5 1.5 0 0 1 2.5 4H3v-.5zM2.5 5a.5.5 0 0 0-.5.5v1h12v-1a.5.5 0 0 0-.5-.5h-11z"/>
        </svg>
      ),
      count: 0
    }
  ];

  // 🍎 탭 내용 렌더링
  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return <BasicInfoTab customer={customer} />;
      case 'documents':
        return (
          <EmptyTab
            title="문서 탭"
            description="고객과 연결된 문서 목록이 여기에 표시됩니다."
            icon={
              <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1.5 1.5 0 011.06.44l2.415 2.414a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0112.5 15h-8A1.5 1.5 0 013 13.5v-11z"/>
              </svg>
            }
          />
        );
      case 'relationships':
        return (
          <RelationshipsTab
            customer={customer}
            onSelectCustomer={onSelectCustomer}
            onRelationshipsUpdated={onRefresh}
          />
        );
      case 'consultations':
        return (
          <EmptyTab
            title="상담 이력 탭"
            description="고객과의 상담 기록이 여기에 표시됩니다."
            icon={
              <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm1-8V4a1 1 0 0 0-2 0v4H4a1 1 0 0 0 0 2h3v4a1 1 0 0 0 2 0v-4h3a1 1 0 0 0 0-2H9z"/>
              </svg>
            }
          />
        );
      case 'contracts':
        return (
          <EmptyTab
            title="계약 탭"
            description="고객의 보험 계약 정보가 여기에 표시됩니다."
            icon={
              <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 3.5a.5.5 0 0 1 1 0V4H12V3.5a.5.5 0 0 1 1 0V4h.5A1.5 1.5 0 0 1 15 5.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 13.5v-8A1.5 1.5 0 0 1 2.5 4H3v-.5zM2.5 5a.5.5 0 0 0-.5.5v1h12v-1a.5.5 0 0 0-.5-.5h-11z"/>
              </svg>
            }
          />
        );
      default:
        return <BasicInfoTab customer={customer} />;
    }
  };

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

          {/* 🍎 탭 네비게이션 */}
          <Tabs
            tabs={tabs}
            activeKey={activeTab}
            onChange={setActiveTab}
            className="customer-detail-view__tabs"
          />

          {/* 🍎 탭 내용 */}
          <div className="customer-detail-view__tab-content">
            {renderTabContent()}
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
