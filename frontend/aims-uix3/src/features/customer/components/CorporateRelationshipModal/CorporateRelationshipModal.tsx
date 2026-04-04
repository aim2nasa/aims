/**
 * AIMS UIX-3 Corporate Relationship Modal
 * @since 2025-11-01
 * @version 2.0.0
 *
 * 🍎 애플 디자인 철학 준수
 * - Progressive Disclosure
 * - 서브틀한 기본 상태
 * - RelationshipModal 공통 컴포넌트 사용
 */

import React, { useState, useCallback } from 'react';
import { RelationshipModal, type RelationshipType } from '../RelationshipModal/RelationshipModal';
import { CorporateMemberSelectorModal } from '@/shared/ui/CorporateMemberSelectorModal';
import type { Customer } from '@/entities/customer/model';

// 법인 관계자 관계 유형 정의
const CORPORATE_RELATIONSHIP_TYPES: RelationshipType[] = [
  {
    value: 'ceo',
    label: '대표',
    icon: '👔',
    description: '법인의 대표이사'
  },
  {
    value: 'executive',
    label: '임원',
    icon: '🎯',
    description: '법인의 임원'
  },
  {
    value: 'employee',
    label: '직원',
    icon: '👤',
    description: '법인의 일반 직원'
  }
];

interface CorporateRelationshipModalProps {
  visible: boolean;
  onCancel: () => void;
  customerId: string;  // 법인 고객 ID
  onSuccess?: () => void;
}

export const CorporateRelationshipModal: React.FC<CorporateRelationshipModalProps> = ({
  visible,
  onCancel,
  customerId,
  onSuccess
}) => {
  // 구성원 선택 모달 표시 여부
  const [showMemberSelector, setShowMemberSelector] = useState(false);
  // 선택된 고객 (RelationshipModal에 전달하기 위해)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // 구성원 선택 버튼 클릭 핸들러
  const handleSelectorButtonClick = useCallback(() => {
    setShowMemberSelector(true);
  }, []);

  // 구성원 선택 완료 핸들러
  const handleMemberSelect = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setShowMemberSelector(false);
  }, []);

  // 모달 닫기 시 상태 초기화
  const handleCancel = useCallback(() => {
    setSelectedCustomer(null);
    setShowMemberSelector(false);
    onCancel();
  }, [onCancel]);

  return (
    <>
      <RelationshipModal
        visible={visible}
        onCancel={handleCancel}
        customerId={customerId}
        {...(onSuccess ? { onSuccess } : {})}
        title="법인 관계자 추가"
        titleIcon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/>
            <path d="M4 5h8v1H4V5z"/>
            <path d="M4 7h8v1H4V7z"/>
            <path d="M4 9h5v1H4V9z"/>
          </svg>
        }
        memberLabel="관계자"
        relationshipCategory="corporate"
        relationshipTypes={CORPORATE_RELATIONSHIP_TYPES}
        allowCustomRelation={true}
        filterCustomerType="개인"
        useSelectorModal={true}
        onSelectorButtonClick={handleSelectorButtonClick}
        selectorButtonLabel="구성원 선택"
        selectedCustomerFromExternal={selectedCustomer}
      />

      {/* 구성원 선택 모달 */}
      <CorporateMemberSelectorModal
        visible={showMemberSelector}
        onClose={() => setShowMemberSelector(false)}
        onSelect={handleMemberSelect}
        corporateId={customerId}
      />
    </>
  );
};

