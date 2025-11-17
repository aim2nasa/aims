/**
 * AIMS UIX-3 Family Selector Modal
 * @since 2025-11-17
 * @version 1.0.0
 *
 * 가족 선택 모달 컴포넌트
 * - CustomerSelectorModal을 상속
 * - 이미 가족을 이루고 있는 고객은 선택 불가
 * - 가족이 없는 고객만 선택 가능
 */

import React, { useState, useEffect } from 'react';
import type { Customer } from '@/entities/customer/model';
import { CustomerSelectorModal } from '../CustomerSelectorModal';
import { RelationshipService } from '@/services/relationshipService';

export interface FamilySelectorModalProps {
  /** 모달 표시 여부 */
  visible: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 완료 핸들러 */
  onSelect: (customer: Customer) => void;
}

/**
 * 가족 선택 모달
 *
 * CustomerSelectorModal의 기능을 그대로 사용하되,
 * 이미 가족을 이루고 있는 고객은 선택할 수 없도록 제한
 *
 * 사용법:
 * ```tsx
 * <FamilySelectorModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSelect={(customer) => {
 *     console.log('선택된 고객:', customer);
 *     setIsOpen(false);
 *   }}
 * />
 * ```
 */
export const FamilySelectorModal: React.FC<FamilySelectorModalProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const [familyCustomerIds, setFamilyCustomerIds] = useState<Set<string>>(new Set());

  // 가족 관계가 있는 고객 ID 목록 로드
  useEffect(() => {
    if (!visible) return;

    const loadFamilyCustomers = async () => {
      try {
        const { relationships } = await RelationshipService.getAllRelationshipsWithCustomers();

        const familyIds = new Set<string>();

        // family 카테고리의 관계가 있는 모든 고객 수집
        relationships.forEach(relationship => {
          if (relationship.relationship_info.relationship_category === 'family') {
            const fromCustomer = relationship.from_customer;
            const toCustomer = relationship.related_customer;

            // from_customer ID 추가
            if (typeof fromCustomer === 'string') {
              familyIds.add(fromCustomer);
            } else if (fromCustomer && typeof fromCustomer === 'object' && '_id' in fromCustomer) {
              familyIds.add(fromCustomer._id);
            }

            // to_customer ID 추가
            if (typeof toCustomer === 'string') {
              familyIds.add(toCustomer);
            } else if (toCustomer && typeof toCustomer === 'object' && '_id' in toCustomer) {
              familyIds.add(toCustomer._id);
            }
          }
        });

        console.log('[FamilySelectorModal] 가족 관계가 있는 고객 수:', familyIds.size);
        setFamilyCustomerIds(familyIds);
      } catch (error) {
        console.error('[FamilySelectorModal] 가족 관계 로드 실패:', error);
        setFamilyCustomerIds(new Set());
      }
    };

    loadFamilyCustomers();
  }, [visible]);

  // CustomerSelectorModal에 전달
  return (
    <CustomerSelectorModal
      visible={visible}
      onClose={onClose}
      onSelect={onSelect}
      disabledCustomerIds={familyCustomerIds}
      disabledTooltip="이미 가족 관계가 있는 고객입니다"
      title="가족 선택"
      filterCustomerType="개인"
    />
  );
};

export default FamilySelectorModal;
