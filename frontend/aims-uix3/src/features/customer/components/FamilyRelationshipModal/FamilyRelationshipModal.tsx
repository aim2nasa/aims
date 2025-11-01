/**
 * AIMS UIX-3 Family Relationship Modal (V2 - Refactored)
 * @since 2025-11-01
 * @version 2.0.0
 *
 * 🍎 애플 디자인 철학 준수
 * - Progressive Disclosure
 * - 서브틀한 기본 상태
 * - RelationshipModal 공통 컴포넌트 사용
 */

import React from 'react';
import { RelationshipModal, type RelationshipType } from '../RelationshipModal/RelationshipModal';

// 가족관계등록부 범위 내 관계 유형만 허용
const FAMILY_RELATIONSHIP_TYPES: RelationshipType[] = [
  {
    value: 'spouse',
    label: '배우자',
    icon: '❤️',
    description: '결혼 관계, 동일 세대의 핵심 파트너'
  },
  {
    value: 'parent',
    label: '부모',
    icon: '👨‍👩',
    description: '상위 세대 보호자 및 법정 대리인'
  },
  {
    value: 'child',
    label: '자녀',
    icon: '👶',
    description: '하위 세대 피부양자 및 상속 대상'
  }
];

interface FamilyRelationshipModalProps {
  visible: boolean;
  onCancel: () => void;
  customerId: string;
  onSuccess?: () => void;
}

export const FamilyRelationshipModal: React.FC<FamilyRelationshipModalProps> = ({
  visible,
  onCancel,
  customerId,
  onSuccess
}) => {
  return (
    <RelationshipModal
      visible={visible}
      onCancel={onCancel}
      customerId={customerId}
      {...(onSuccess ? { onSuccess } : {})}
      title="가족 관계 추가"
      titleIcon={
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M7.646 1.146a.5.5 0 01.708 0l6 6A.5.5 0 0114 7.5h-.5V14a1 1 0 01-1 1h-3.5a.5.5 0 01-.5-.5V11H7.5v3.5a.5.5 0 01-.5.5H3.5a1 1 0 01-1-1V7.5H2a.5.5 0 01-.354-.854l6-6z"/>
        </svg>
      }
      memberLabel="가족 구성원"
      relationshipCategory="family"
      relationshipTypes={FAMILY_RELATIONSHIP_TYPES}
      allowCustomRelation={false}
      filterCustomerType="개인"
    />
  );
};

export default FamilyRelationshipModal;
