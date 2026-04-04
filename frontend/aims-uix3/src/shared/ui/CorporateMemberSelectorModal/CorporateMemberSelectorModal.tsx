/**
 * AIMS UIX-3 Corporate Member Selector Modal
 * @since 2025-12-04
 * @version 1.0.0
 *
 * 법인 구성원 선택 모달 컴포넌트
 * - CustomerSelectorModal을 상속
 * - 이미 법인 관계자로 등록된 고객은 선택 불가
 * - 개인 고객만 선택 가능
 */

import React, { useState, useEffect } from 'react';
import type { Customer } from '@/entities/customer/model';
import { CustomerSelectorModal } from '../CustomerSelectorModal';
import { RelationshipService } from '@/services/relationshipService';
import { errorReporter } from '@/shared/lib/errorReporter';

export interface CorporateMemberSelectorModalProps {
  /** 모달 표시 여부 */
  visible: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 고객 선택 완료 핸들러 */
  onSelect: (customer: Customer) => void;
  /** 법인 고객 ID (해당 법인의 기존 관계자는 제외) */
  corporateId?: string;
}

/**
 * 법인 구성원 선택 모달
 *
 * CustomerSelectorModal의 기능을 그대로 사용하되,
 * 이미 해당 법인의 관계자로 등록된 고객은 선택할 수 없도록 제한
 *
 * 사용법:
 * ```tsx
 * <CorporateMemberSelectorModal
 *   visible={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSelect={(customer) => {
 *     console.log('선택된 구성원:', customer);
 *     setIsOpen(false);
 *   }}
 *   corporateId="corporate_customer_id"
 * />
 * ```
 */
export const CorporateMemberSelectorModal: React.FC<CorporateMemberSelectorModalProps> = ({
  visible,
  onClose,
  onSelect,
  corporateId,
}) => {
  const [corporateMemberIds, setCorporateMemberIds] = useState<Set<string>>(new Set());

  // 해당 법인의 기존 관계자 ID 목록 로드
  useEffect(() => {
    if (!visible) return;

    const loadCorporateMembers = async () => {
      try {
        const { relationships } = await RelationshipService.getAllRelationshipsWithCustomers();

        const memberIds = new Set<string>();

        // corporate 카테고리의 관계에서 해당 법인과 연결된 모든 개인 고객 수집
        relationships.forEach(relationship => {
          if (relationship.relationship_info.relationship_category === 'corporate') {
            const fromCustomer = relationship.from_customer;
            const toCustomer = relationship.related_customer;

            // corporateId가 지정된 경우 해당 법인의 관계자만 제외
            if (corporateId) {
              // fromCustomer가 해당 법인인 경우
              if (typeof fromCustomer === 'object' && fromCustomer?._id === corporateId) {
                if (typeof toCustomer === 'object' && toCustomer?.insurance_info?.customer_type === '개인') {
                  memberIds.add(toCustomer._id);
                }
              }
              // toCustomer가 해당 법인인 경우
              if (typeof toCustomer === 'object' && toCustomer?._id === corporateId) {
                if (typeof fromCustomer === 'object' && fromCustomer?.insurance_info?.customer_type === '개인') {
                  memberIds.add(fromCustomer._id);
                }
              }
            }
          }
        });

        console.log('[CorporateMemberSelectorModal] 기존 법인 관계자 수:', memberIds.size);
        setCorporateMemberIds(memberIds);
      } catch (error) {
        console.error('[CorporateMemberSelectorModal] 법인 관계 로드 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'CorporateMemberSelectorModal.loadCorporateMembers' });
        setCorporateMemberIds(new Set());
      }
    };

    loadCorporateMembers();
  }, [visible, corporateId]);

  // CustomerSelectorModal에 전달
  return (
    <CustomerSelectorModal
      visible={visible}
      onClose={onClose}
      onSelect={onSelect}
      disabledCustomerIds={corporateMemberIds}
      disabledTooltip="이미 이 법인의 관계자로 등록된 고객입니다"
      title="구성원 선택"
      filterCustomerType="개인"
    />
  );
};

