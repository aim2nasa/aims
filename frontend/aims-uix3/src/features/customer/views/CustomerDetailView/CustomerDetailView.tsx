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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BaseViewer from '../../../../components/BaseViewer/BaseViewer';
import CustomerEditModal from '../CustomerEditModal';
import FamilyRelationshipModal from '../../components/FamilyRelationshipModal';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { Button } from '../../../../shared/ui/Button';
import { Tabs, type Tab } from '../../../../components/Tabs';
import { BasicInfoTab } from './tabs/BasicInfoTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';
import { EmptyTab } from './tabs/EmptyTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { AnnualReportTab } from './tabs/AnnualReportTab';
import type { Customer } from '@/entities/customer/model';
import { CustomerDocument } from '@/stores/CustomerDocument';
import { RelationshipService } from '@/services/relationshipService';
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

  // URL에서 활성 탭 복원 (초기 마운트 시에만)
  const [activeTab, setActiveTab] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTab = urlParams.get('tab');
    return urlTab || 'info';
  });

  const [canAddFamilyRelation, setCanAddFamilyRelation] = useState(false);
  const [documentCount, setDocumentCount] = useState(0);
  const confirmController = useAppleConfirmController();

  useEffect(() => {
    setCustomerData(customer);
  }, [customer]);

  // 활성 탭 변경 시 URL 동기화
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeTab && activeTab !== 'info') {
      url.searchParams.set('tab', activeTab);
    } else {
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', url.toString());
  }, [activeTab]);

  // 가족 관계 추가 가능 여부 확인 (aims-uix2 로직 적용)
  useEffect(() => {
    const checkCanAddFamilyRelation = async () => {
      // 법인 고객은 가족 추가 불가
      if (customer.insurance_info?.customer_type !== '개인') {
        setCanAddFamilyRelation(false);
        return;
      }

      try {
        // 모든 관계 데이터 로드
        const allData = await RelationshipService.getAllRelationshipsWithCustomers();
        const { relationships } = allData;

        // 가족 관계 네트워크 구축
        const familyNetworks = new Map<string, Set<string>>();

        // 가족 관계만 필터링 (개인-개인만)
        relationships.forEach(relationship => {
          const category = relationship.relationship_info.relationship_category;
          const fromCustomer = relationship.from_customer;
          const toCustomer = relationship.related_customer;

          if (category === 'family' &&
              typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === '개인' &&
              typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === '개인') {

            const fromId = fromCustomer._id;
            const toId = toCustomer._id;

            // 양방향 관계 설정
            if (!familyNetworks.has(fromId)) {
              familyNetworks.set(fromId, new Set());
            }
            if (!familyNetworks.has(toId)) {
              familyNetworks.set(toId, new Set());
            }

            familyNetworks.get(fromId)!.add(toId);
            familyNetworks.get(toId)!.add(fromId);
          }
        });

        // 현재 고객이 가족이 없는 경우 → 가족관계 추가 가능 (첫 가족대표가 됨)
        if (!familyNetworks.has(customer._id)) {
          setCanAddFamilyRelation(true);
          return;
        }

        // 현재 고객이 가족이 있는 경우, 가족대표인지 확인
        const myFamilyMembers = new Set<string>();
        const stack = [customer._id];
        const visited = new Set<string>();

        // DFS로 연결된 모든 가족 구성원 찾기
        while (stack.length > 0) {
          const currentId = stack.pop()!;
          if (visited.has(currentId)) continue;

          visited.add(currentId);
          myFamilyMembers.add(currentId);

          const connections = familyNetworks.get(currentId);
          if (connections) {
            connections.forEach(connectedId => {
              if (!visited.has(connectedId)) {
                stack.push(connectedId);
              }
            });
          }
        }

        // 이 가족의 관계들 수집하여 가족대표 찾기
        const familyRelationships = relationships.filter(rel => {
          const fromId = typeof rel.from_customer === 'string' ? rel.from_customer : rel.from_customer?._id;
          const toId = typeof rel.related_customer === 'string' ? rel.related_customer : rel.related_customer?._id;
          return fromId && toId && myFamilyMembers.has(fromId) && myFamilyMembers.has(toId);
        });

        // 가족대표 찾기
        let familyRepId: string | null = null;

        if (familyRelationships.length > 0) {
          const relationshipWithRep = familyRelationships.find(rel => rel.family_representative);
          if (relationshipWithRep) {
            const rep = relationshipWithRep.family_representative;
            familyRepId = typeof rep === 'string' ? rep : rep?._id || null;
          }
        }

        // 현재 고객이 가족대표인 경우에만 가족관계 추가 가능
        setCanAddFamilyRelation(familyRepId === customer._id);
      } catch (error) {
        console.error('[CustomerDetailView] 가족 관계 확인 실패:', error);
        setCanAddFamilyRelation(false);
      }
    };

    checkCanAddFamilyRelation();
  }, [customer._id, customer.insurance_info?.customer_type]);

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
        // Document-View 패턴: CustomerDocument를 통해 삭제
        const document = CustomerDocument.getInstance();
        await document.deleteCustomer(customer._id);
        if (import.meta.env.DEV) {
          console.log('[CustomerDetailView] Document를 통해 고객 삭제 완료 - 모든 View 자동 업데이트됨');
        }

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
    if (import.meta.env.DEV) {
      console.log('[CustomerDetailView] 고객 수정 완료 - Document가 자동으로 모든 View 업데이트함');
    }
    // Document-View 패턴: CustomerEditModal이 Document를 통해 저장하므로
    // 여기서는 아무것도 할 필요 없음. Document가 자동으로 모든 View에 알림.
    onRefresh?.();
  }, [onRefresh]);

  const handleFamilyRelationshipSuccess = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[CustomerDetailView] 가족 관계 추가 완료 - Document가 자동으로 모든 View 업데이트함');
    }
    // Document-View 패턴: FamilyRelationshipModal이 Document를 통해 저장하므로
    // 여기서는 아무것도 할 필요 없음. Document가 자동으로 모든 View에 알림.
    onRefresh?.();
  }, [onRefresh]);

  // 개인 고객인지 확인 (더 이상 사용하지 않음 - canAddFamilyRelation으로 대체)
  // const isPersonalCustomer = customer.insurance_info?.customer_type === '개인';

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

  // 법인 고객 여부 확인
  const isBusinessCustomer = customer.insurance_info?.customer_type === '법인';

  // 🍎 탭 정의 (순서: 기본정보, 관계(개인만), 문서, 상담이력, 계약)
  const tabs: Tab[] = useMemo(() => {
    const baseTabs: Tab[] = [
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
        key: 'documents',
        label: '문서',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2.5A1.5 1.5 0 014.5 1h5.586a1.5 1.5 0 011.06.44l2.415 2.414a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0112.5 15h-8A1.5 1.5 0 013 13.5v-11z"/>
          </svg>
        ),
        count: documentCount
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
        key: 'annual_report',
        label: 'Annual Report',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2 0v12h8V2H4zm1 2h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/>
          </svg>
        )
      }
    ]

    if (!isBusinessCustomer) {
      baseTabs.splice(1, 0, {
        key: 'relationships',
        label: '가족 관계',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM10.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1H2v-1zM10 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1h-7v-1z"/>
          </svg>
        )
      })
    }

    return baseTabs
  }, [isBusinessCustomer, documentCount]);

  // 🍎 탭 내용 렌더링
  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return <BasicInfoTab customer={customer} />;
      case 'documents':
        return (
          <DocumentsTab
            customer={customer}
            onDocumentCountChange={setDocumentCount}
            {...(onRefresh ? { onRefresh } : {})}
          />
        );
      case 'relationships':
        return (
          <RelationshipsTab
            customer={customer}
            {...(onSelectCustomer ? { onSelectCustomer } : {})}
            {...(onRefresh ? { onRelationshipsUpdated: onRefresh } : {})}
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
      case 'annual_report':
        return <AnnualReportTab customer={customer} />;
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
            {canAddFamilyRelation && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsFamilyModalVisible(true)}
                title="가족 구성원을 추가합니다 (가족대표만 가능)"
                leftIcon={<span>👥</span>}
              >
                가족 추가
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditClick}
              autoFocus
              leftIcon={<span>✏️</span>}
            >
              정보 수정
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteClick}
              leftIcon={<span>🗑️</span>}
            >
              고객 삭제
            </Button>
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

      {/* 가족 추가 모달 */}
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
