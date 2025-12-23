/**
 * AIMS UIX-3 Customer Detail View
 * @since 2025-10-03
 * @version 6.0.0
 *
 * 🍎 탭 기반 고객 정보 보기
 * - 기본정보, 가족관계(개인만), 문서, Annual Report
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BaseViewer from '../../../../components/BaseViewer/BaseViewer';
import CustomerEditModal from '../CustomerEditModal';
import FamilyRelationshipModal from '../../components/FamilyRelationshipModal';
import CorporateRelationshipModal from '../../components/CorporateRelationshipModal';
import { useAppleConfirmController } from '../../../../controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { Button } from '../../../../shared/ui/Button';
import { Tabs, type Tab } from '../../../../components/Tabs';
import { BasicInfoTab } from './tabs/BasicInfoTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';
import { ContractsTab } from './tabs/ContractsTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { AnnualReportTab } from './tabs/AnnualReportTab';
import type { Customer } from '@/entities/customer/model';
import { CustomerDocument } from '@/stores/CustomerDocument';
import { RelationshipService } from '@/services/relationshipService';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { Tooltip } from '@/shared/ui/Tooltip';
import { errorReporter } from '@/shared/lib/errorReporter';
import './CustomerDetailView.css';

interface CustomerDetailViewProps {
  customer: Customer;
  onClose: () => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void;
  onOpenFullDetail?: (customerId: string) => void;
  onDocumentLibraryRefresh?: () => Promise<void>;
  /** RightPane visibility 변경 시 새로고침 트리거 */
  refreshTrigger?: number;
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
  onOpenFullDetail,
  onDocumentLibraryRefresh,
  refreshTrigger,
  gapLeft = 2,
  gapRight = 2,
  gapTop = 2,
  gapBottom = 2,
}) => {
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isFamilyModalVisible, setIsFamilyModalVisible] = useState(false);
  const [isCorporateModalVisible, setIsCorporateModalVisible] = useState(false);
  const [customerData, setCustomerData] = useState<Customer>(customer);
  const [annualReportRefreshTrigger, setAnnualReportRefreshTrigger] = useState(0);

  // 🍎 개발자 모드 (Ctrl+Alt+D)
  const { isDevMode } = useDevModeStore();

  // URL에서 활성 탭 복원 (초기 마운트 시에만)
  const [activeTab, setActiveTab] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlTab = urlParams.get('tab');
    return urlTab || 'info';
  });

  const [canAddFamilyRelation, setCanAddFamilyRelation] = useState(false);
  const [relationshipsCount, setRelationshipsCount] = useState(0);
  const [contractCount, setContractCount] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [annualReportCount, setAnnualReportCount] = useState(0);
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
        errorReporter.reportApiError(error as Error, { component: 'CustomerDetailView.checkCanAddFamilyRelation', payload: { customerId: customer._id } });
        setCanAddFamilyRelation(false);
      }
    };

    checkCanAddFamilyRelation();
  }, [customer._id, customer.insurance_info?.customer_type]);

  const handleEditClick = useCallback(() => {
    setIsEditModalVisible(true);
  }, []);

  const handleSoftDeleteClick = useCallback(async () => {
    const confirmed = await confirmController.actions.openModal({
      title: '고객 휴면 처리',
      message: `"${customer.personal_info?.name}" 고객을 휴면 처리하시겠습니까?\n\n휴면 처리된 고객은 언제든지 휴면 해제할 수 있습니다.`,
      confirmText: '휴면 처리',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    });

    if (confirmed) {
      try {
        // Document-View 패턴: CustomerDocument를 통해 소프트 삭제
        const document = CustomerDocument.getInstance();
        await document.deleteCustomer(customer._id);
        if (import.meta.env.DEV) {
          console.log('[CustomerDetailView] 고객 휴면 처리 완료 - 모든 View 자동 업데이트됨');
        }

        onDelete?.();
        onClose();
      } catch (error) {
        console.error('[CustomerDetailView] 휴면 처리 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'CustomerDetailView.handleSoftDelete', payload: { customerId: customer._id } });
        await confirmController.actions.openModal({
          title: '휴면 처리 실패',
          message: error instanceof Error ? error.message : '고객 휴면 처리에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        });
      }
    }
  }, [customer, onClose, onDelete, confirmController]);

  const handlePermanentDeleteClick = useCallback(async () => {
    const confirmed = await confirmController.actions.openModal({
      title: '영구 삭제',
      message: `"${customer.personal_info?.name}" 고객과 연결된 모든 데이터를 영구 삭제합니다.\n\n이 작업은 되돌릴 수 없습니다.\n\n삭제될 데이터:\n- 고객 정보\n- 연결된 모든 문서\n- 연결된 모든 계약\n- 연결된 모든 관계`,
      confirmText: '영구 삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'error'
    });

    if (confirmed) {
      try {
        // Document-View 패턴: CustomerDocument를 통해 영구 삭제
        const document = CustomerDocument.getInstance();
        const result = await document.permanentDeleteCustomer(customer._id);

        if (import.meta.env.DEV) {
          console.log('[CustomerDetailView] 고객 영구 삭제 완료:', result);
        }

        // 삭제 결과 요약 표시
        await confirmController.actions.openModal({
          title: '영구 삭제 완료',
          message: `고객이 영구 삭제되었습니다.\n\n삭제된 데이터:\n- 관계: ${result.deletedRelationships}개\n- 계약: ${result.deletedContracts}개\n- 문서: ${result.deletedDocuments}개`,
          confirmText: '확인',
          confirmStyle: 'primary',
          showCancel: false,
          iconType: 'success'
        });

        onDelete?.();
        onClose();
      } catch (error) {
        console.error('[CustomerDetailView] 영구 삭제 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'CustomerDetailView.handlePermanentDelete', payload: { customerId: customer._id } });
        await confirmController.actions.openModal({
          title: '영구 삭제 실패',
          message: error instanceof Error ? error.message : '고객 영구 삭제에 실패했습니다.',
          confirmText: '확인',
          confirmStyle: 'destructive',
          showCancel: false,
          iconType: 'error'
        });
      }
    }
  }, [customer, onClose, onDelete, confirmController]);

  const handleRestoreClick = useCallback(async () => {
    const confirmed = await confirmController.actions.openModal({
      title: '휴면 해제',
      message: `"${customer.personal_info?.name}" 고객을 활성 상태로 변경하시겠습니까?`,
      confirmText: '휴면 해제',
      cancelText: '취소',
      confirmStyle: 'primary',
      showCancel: true,
      iconType: 'info'
    });

    if (confirmed) {
      try {
        // Document-View 패턴: CustomerDocument를 통해 휴면 해제
        const document = CustomerDocument.getInstance();
        await document.restoreCustomer(customer._id);

        if (import.meta.env.DEV) {
          console.log('[CustomerDetailView] 고객 휴면 해제 완료');
        }

        await confirmController.actions.openModal({
          title: '휴면 해제 완료',
          message: `"${customer.personal_info?.name}" 고객이 활성 상태로 변경되었습니다.`,
          confirmText: '확인',
          confirmStyle: 'primary',
          showCancel: false,
          iconType: 'success'
        });

        onDelete?.(); // View 새로고침 트리거
        onClose();
      } catch (error) {
        console.error('[CustomerDetailView] 휴면 해제 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'CustomerDetailView.handleRestore', payload: { customerId: customer._id } });
        await confirmController.actions.openModal({
          title: '휴면 해제 실패',
          message: error instanceof Error ? error.message : '휴면 해제에 실패했습니다.',
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

  const handleCorporateRelationshipSuccess = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[CustomerDetailView] 법인 관계자 추가 완료 - Document가 자동으로 모든 View 업데이트함');
    }
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

  // 아이콘과 이름을 조합한 타이틀 (전체보기 버튼 포함)
  const customerTitle = (
    <span className="customer-detail-title">
      {getCustomerTypeIcon()}
      <span className="customer-detail-name">{customer.personal_info?.name || '고객 정보'}</span>
      {/* 전체보기 전환 버튼 */}
      {onOpenFullDetail && (
        <Tooltip content="전체 보기로 전환">
          <button
            type="button"
            className="view-switch-button view-switch-button--full"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullDetail(customer._id);
            }}
            aria-label="전체 보기"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {/* 그리드 아이콘 (전체 보기) */}
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
        </Tooltip>
      )}
    </span>
  );

  // 법인 고객 여부 확인
  const isBusinessCustomer = customer.insurance_info?.customer_type === '법인';

  // 🍎 탭 정의 (순서: 기본정보, 가족관계(개인만)/관계인(법인만), 문서, Annual Report)
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
      }
    ];

    // 관계 탭 추가 (개인: 가족 관계, 법인: 관계인)
    if (isBusinessCustomer) {
      baseTabs.push({
        key: 'relationships',
        label: '관계인',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM10.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1H2v-1zM10 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1h-7v-1z"/>
          </svg>
        ),
        count: relationshipsCount
      });
    } else {
      baseTabs.push({
        key: 'relationships',
        label: '가족 관계',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM10.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1H2v-1zM10 12.5c0-1.5 1-2.5 3.5-2.5s3.5 1 3.5 2.5v1h-7v-1z"/>
          </svg>
        ),
        count: relationshipsCount
      });
    }

    // 보험 계약 탭 추가
    baseTabs.push({
      key: 'contracts',
      label: '보험 계약',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="2"/>
          <path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      ),
      count: contractCount
    });

    // 문서, Annual Report 탭 추가
    baseTabs.push(
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
        key: 'annual_report',
        label: 'Annual Report',
        icon: (
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              '--icon-bg': 'var(--color-success-overlay-bg)',
              '--icon-color': 'var(--color-success-overlay-icon)'
            } as React.CSSProperties}
          >
            {/* Document background */}
            <rect x="2" y="1" width="12" height="14" rx="1.5" fill="var(--icon-bg)"/>
            {/* Chart bars */}
            <rect x="4" y="9" width="1.5" height="4" rx="0.5" fill="var(--icon-color)"/>
            <rect x="7" y="7" width="1.5" height="6" rx="0.5" fill="var(--icon-color)"/>
            <rect x="10" y="5" width="1.5" height="8" rx="0.5" fill="var(--icon-color)"/>
          </svg>
        ),
        count: annualReportCount
      }
    );

    return baseTabs;
  }, [isBusinessCustomer, relationshipsCount, contractCount, documentCount, annualReportCount]);

  // 🍎 탭 내용 렌더링 (개수 업데이트를 위해 모든 탭을 숨김 상태로 렌더링)
  const renderTabContent = () => {
    return (
      <>
        {/* 기본 정보 탭 */}
        <div className={`customer-detail-view__tab-panel ${activeTab === 'info' ? 'customer-detail-view__tab-panel--active' : ''}`}>
          <BasicInfoTab customer={customer} />
        </div>

        {/* 문서 탭 - 항상 렌더링하여 개수 표시 */}
        <div className={`customer-detail-view__tab-panel ${activeTab === 'documents' ? 'customer-detail-view__tab-panel--active' : ''}`}>
          <DocumentsTab
            customer={customer}
            onDocumentCountChange={setDocumentCount}
            refreshTrigger={refreshTrigger}
            {...(onRefresh ? { onRefresh } : {})}
            {...(onDocumentLibraryRefresh ? { onDocumentLibraryRefresh } : {})}
            onAnnualReportNeedRefresh={() => setAnnualReportRefreshTrigger(prev => prev + 1)}
          />
        </div>

        {/* 관계 탭 - 항상 렌더링하여 개수 표시 */}
        <div className={`customer-detail-view__tab-panel ${activeTab === 'relationships' ? 'customer-detail-view__tab-panel--active' : ''}`}>
          <RelationshipsTab
            customer={customer}
            onRelationshipsCountChange={setRelationshipsCount}
            {...(onSelectCustomer ? { onSelectCustomer } : {})}
            {...(onRefresh ? { onRelationshipsUpdated: onRefresh } : {})}
          />
        </div>

        {/* 보험 계약 탭 - 항상 렌더링하여 개수 표시 */}
        <div className={`customer-detail-view__tab-panel ${activeTab === 'contracts' ? 'customer-detail-view__tab-panel--active' : ''}`}>
          <ContractsTab
            customer={customer}
            onContractCountChange={setContractCount}
          />
        </div>

        {/* Annual Report 탭 - 항상 렌더링하여 개수 표시 */}
        <div className={`customer-detail-view__tab-panel ${activeTab === 'annual_report' ? 'customer-detail-view__tab-panel--active' : ''}`}>
          <AnnualReportTab
            customer={customer}
            onAnnualReportCountChange={setAnnualReportCount}
            refreshTrigger={(refreshTrigger || 0) + annualReportRefreshTrigger}
          />
        </div>
      </>
    );
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
            {isBusinessCustomer && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCorporateModalVisible(true)}
                title="법인 관계자를 추가합니다"
                leftIcon={<span>👤</span>}
              >
                관계자 추가
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
            {customer.meta?.status === 'inactive' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleRestoreClick}
                leftIcon={<span>♻️</span>}
                title="휴면 고객을 활성 상태로 변경합니다"
              >
                휴면 해제
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleSoftDeleteClick}
                leftIcon={<span>💤</span>}
                title="고객을 휴면 처리합니다 (휴면 해제 가능)"
              >
                휴면 처리
              </Button>
            )}
            {isDevMode && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handlePermanentDeleteClick}
                leftIcon={<span>🗑️</span>}
                title="고객과 연결된 모든 데이터를 영구 삭제합니다"
              >
                영구 삭제
              </Button>
            )}
            {/* 전체 보기 버튼은 제목 옆으로 이동됨 */}
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

      {/* 법인 관계자 추가 모달 */}
      <CorporateRelationshipModal
        visible={isCorporateModalVisible}
        onCancel={() => setIsCorporateModalVisible(false)}
        customerId={customer._id}
        onSuccess={handleCorporateRelationshipSuccess}
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
