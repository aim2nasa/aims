/**
 * CorporateRelationshipModal Component Unit Tests
 * @since 2025-11-01
 *
 * 테스트 범위:
 * 1. RelationshipModal에 올바른 props 전달
 * 2. 법인 관계 유형 (CEO, 임원, 직원)
 * 3. 타이틀 및 설정
 * 4. 개인 고객 필터링
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { CorporateRelationshipModal } from './CorporateRelationshipModal';
import * as RelationshipModalModule from '../RelationshipModal/RelationshipModal';

// Mock RelationshipModal
vi.mock('../RelationshipModal/RelationshipModal', () => ({
  RelationshipModal: vi.fn(() => <div data-testid="relationship-modal">Mocked RelationshipModal</div>),
}));

describe('CorporateRelationshipModal', () => {
  const mockOnCancel = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockCustomerId = 'company-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Props 전달', () => {
    it('RelationshipModal에 기본 props를 올바르게 전달해야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.visible).toBe(true);
      expect(callArgs?.customerId).toBe(mockCustomerId);
      // onCancel은 handleCancel로 래핑되므로 동작 검증
      expect(callArgs?.onCancel).toBeTypeOf('function');
      callArgs?.onCancel();
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('onSuccess prop이 제공되면 RelationshipModal에 전달해야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
          onSuccess={mockOnSuccess}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.onSuccess).toBe(mockOnSuccess);
    });

    it('onSuccess prop이 없으면 RelationshipModal에 전달하지 않아야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty('onSuccess');
    });
  });

  describe('법인 관계 설정', () => {
    it('title이 "법인 관계자 추가"여야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.title).toBe('법인 관계자 추가');
    });

    it('memberLabel이 "관계자"여야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.memberLabel).toBe('관계자');
    });

    it('relationshipCategory가 "corporate"여야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.relationshipCategory).toBe('corporate');
    });

    it('filterCustomerType이 "개인"이어야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.filterCustomerType).toBe('개인');
    });

    it('allowCustomRelation이 true여야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      expect(callArgs?.allowCustomRelation).toBe(true);
    });
  });

  describe('법인 관계 유형', () => {
    it('relationshipTypes에 CEO, 임원, 직원이 포함되어야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      const relationshipTypes = callArgs?.relationshipTypes;

      expect(relationshipTypes).toHaveLength(3);

      // CEO 타입 확인
      const ceoType = relationshipTypes?.find((type) => type.value === 'ceo');
      expect(ceoType).toBeDefined();
      expect(ceoType?.label).toBe('대표');
      expect(ceoType?.icon).toBe('👔');
      expect(ceoType?.description).toBe('법인의 대표이사');

      // 임원 타입 확인
      const executiveType = relationshipTypes?.find((type) => type.value === 'executive');
      expect(executiveType).toBeDefined();
      expect(executiveType?.label).toBe('임원');
      expect(executiveType?.icon).toBe('🎯');
      expect(executiveType?.description).toBe('법인의 임원');

      // 직원 타입 확인
      const employeeType = relationshipTypes?.find((type) => type.value === 'employee');
      expect(employeeType).toBeDefined();
      expect(employeeType?.label).toBe('직원');
      expect(employeeType?.icon).toBe('👤');
      expect(employeeType?.description).toBe('법인의 일반 직원');
    });
  });

  describe('타이틀 아이콘', () => {
    it('titleIcon이 SVG 엘리먼트여야 한다', () => {
      render(
        <CorporateRelationshipModal
          visible={true}
          onCancel={mockOnCancel}
          customerId={mockCustomerId}
        />
      );

      const callArgs = vi.mocked(RelationshipModalModule.RelationshipModal).mock.calls[0]?.[0];
      const titleIcon = callArgs?.titleIcon;

      // titleIcon이 존재하고 React 엘리먼트인지 확인
      expect(titleIcon).toBeDefined();
      expect(titleIcon).toHaveProperty('type', 'svg');
      expect(titleIcon).toHaveProperty('props');
      if (titleIcon && typeof titleIcon === 'object' && 'props' in titleIcon) {
        expect(titleIcon.props).toHaveProperty('width', '16');
        expect(titleIcon.props).toHaveProperty('height', '16');
        expect(titleIcon.props).toHaveProperty('aria-hidden', 'true');
        expect(titleIcon.props).toHaveProperty('focusable', 'false');
      }
    });
  });
});
