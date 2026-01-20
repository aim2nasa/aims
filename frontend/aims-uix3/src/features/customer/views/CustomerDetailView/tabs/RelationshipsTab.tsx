/**
 * AIMS UIX-3 Customer Detail - Relationships Tab
 * @since 2025-10-20
 * @updated 2025-10-10 - 아이콘 크기 개선
 *
 * 고객 관계 정보를 aims-uix2와 동일한 로직으로 표시합니다.
 * - 관계 목록 테이블
 * - 관계 삭제
 * - 관련 고객 상세 보기 이동
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Customer } from '@/entities/customer/model';
import { useCustomerRelationshipsController } from '@/controllers/useCustomerRelationshipsController';
import type { Relationship } from '@/services/relationshipService';
import { formatDate } from '@/shared/lib/timeUtils';
import Button from '@/shared/ui/Button';
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolVariant,
  SFSymbolWeight,
} from '../../../../../components/SFSymbol';
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import Tooltip from '@/shared/ui/Tooltip';
import './RelationshipsTab.css';


type ExtendedRelationship = Relationship & {
  related_customer?: Customer;
  from_customer?: Customer;
};

interface RelationshipsTabProps {
  customer: Customer;
  /** 싱글클릭: RightPane에 고객 요약보기 표시 */
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void;
  /** 더블클릭: 고객 전체보기로 화면 이동 */
  onNavigateToFullDetail?: (customerId: string, customerData?: Customer) => void;
  onRelationshipsUpdated?: () => void;
  onRelationshipsCountChange?: (count: number) => void;
}

// 🍎 정렬 필드 타입
type SortField = 'relationshipType' | 'relatedCustomer' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export const RelationshipsTab: React.FC<RelationshipsTabProps> = ({
  customer,
  onSelectCustomer,
  onNavigateToFullDetail,
  onRelationshipsUpdated,
  onRelationshipsCountChange,
}) => {
  const confirmController = useAppleConfirmController();
  const {
    state: { relationships, isLoading, error },
    actions: { loadRelationships, deleteRelationship, getRelationshipTypeLabel },
  } = useCustomerRelationshipsController({ customerId: customer?._id, autoLoad: true });

  // 🍎 정렬 상태
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const relationshipsCount = relationships.length;

  // 🍎 관계 개수 변경 시 부모에게 알림
  useEffect(() => {
    onRelationshipsCountChange?.(relationshipsCount);
  }, [relationshipsCount, onRelationshipsCountChange]);

  const handleCustomerSelect = useCallback(
    (relatedCustomer?: Customer) => {
      if (!relatedCustomer?._id) return;
      onSelectCustomer?.(relatedCustomer._id, relatedCustomer);
    },
    [onSelectCustomer],
  );

  const handleCustomerDoubleClick = useCallback(
    (relatedCustomer?: Customer) => {
      if (!relatedCustomer?._id) return;
      onNavigateToFullDetail?.(relatedCustomer._id, relatedCustomer);
    },
    [onNavigateToFullDetail],
  );

  // 🍎 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // 같은 필드 클릭 시 방향 토글
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭 시 해당 필드로 변경, 기본 내림차순
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const handleDelete = useCallback(
    async (relationshipId: string) => {
      const confirmed = await confirmController.actions.openModal({
        title: '관계 삭제',
        message: '선택한 관계를 삭제하시겠습니까?',
        confirmText: '삭제',
        cancelText: '취소',
        confirmStyle: 'destructive',
        showCancel: true,
        iconType: 'warning',
      });

      if (!confirmed) return;

      await deleteRelationship(relationshipId);
      onRelationshipsUpdated?.();
    },
    [confirmController.actions, deleteRelationship, onRelationshipsUpdated],
  );

  useEffect(() => {
    if (!onRelationshipsUpdated) return undefined;

    const handleExternalChange = () => {
      onRelationshipsUpdated();
    };

    window.addEventListener('relationshipChanged', handleExternalChange);
    return () => {
      window.removeEventListener('relationshipChanged', handleExternalChange);
    };
  }, [onRelationshipsUpdated]);

  const rows = useMemo(() => {
    // 관계별 보기와 동일한 이모지 아이콘 사용
    const getRelationIcon = (type: string) => {
      switch (type) {
        case 'spouse': return '❤️';       // 배우자 (하트)
        case 'child': return '👶';        // 자녀
        case 'parent': return '👨‍👩';     // 부모 (부모 세대)
        default: return '👥';             // 기타
      }
    };

    const mappedRows = (relationships as ExtendedRelationship[]).map((relationship) => {
      const relatedCustomer =
        (relationship.related_customer as Customer | undefined) ?? undefined;
      const category = relationship.relationship_info?.relationship_category ?? 'default';
      const relationshipType = relationship.relationship_info?.relationship_type ?? '';
      const createdAt =
        relationship.meta?.created_at ?? relationship.created_at ?? '';
      const createdAtLabel = formatDate(createdAt);
      const relatedCustomerName = relatedCustomer?.personal_info?.name || '';

      return {
        key: relationship._id,
        category,
        relationshipType,
        relationIcon: getRelationIcon(relationshipType),
        relationship,
        relatedCustomer,
        relatedCustomerName,
        createdAt: createdAtLabel,
        createdAtRaw: createdAt, // 정렬용 원본 날짜
        isReversed: relationship.is_reversed ?? false,
      };
    });

    // 🍎 정렬 적용
    return mappedRows.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'relationshipType':
          comparison = a.relationshipType.localeCompare(b.relationshipType, 'ko');
          break;
        case 'relatedCustomer':
          comparison = a.relatedCustomerName.localeCompare(b.relatedCustomerName, 'ko');
          break;
        case 'createdAt':
          comparison = new Date(a.createdAtRaw).getTime() - new Date(b.createdAtRaw).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [relationships, sortField, sortDirection]);

  const renderState = () => {
    if (isLoading && relationshipsCount === 0) {
      return (
        <div className="relationships-state">
          <SFSymbol
            name="arrow.triangle.2.circlepath"
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>관계 정보를 불러오는 중입니다...</span>
        </div>
      );
    }

    if (error && relationshipsCount === 0) {
      return (
        <div className="relationships-state relationships-state--error">
          <SFSymbol
            name="exclamationmark.triangle.fill"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
            variant={SFSymbolVariant.FILL}
          />
          <span>{error}</span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => loadRelationships()}
            className="relationships-retry"
          >
            다시 시도
          </Button>
        </div>
      );
    }

    if (!isLoading && relationshipsCount === 0) {
      return (
        <div className="relationships-state relationships-state--empty">
          <SFSymbol
            name="person.2.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>등록된 관계가 없습니다.</span>
        </div>
      );
    }

    return null;
  };

  // 법인 고객 여부 확인
  const isBusinessCustomer = customer.insurance_info?.customer_type === '법인';
  const deleteHeaderLabel = isBusinessCustomer ? '관계 삭제' : '가족 삭제';

  return (
    <div className="form-section">
      <div className="form-section__content">
        {renderState()}

        {rows.length > 0 && (
          <div className="relationships-table-wrapper">
            <table className="relationships-table">
              <thead>
                <tr>
                  <th
                    className="relationships-table__sortable"
                    onClick={() => handleSort('relationshipType')}
                  >
                    <span className="relationships-table__header-content">
                      관계 유형
                      <span className={`relationships-table__sort-icon ${sortField === 'relationshipType' ? 'relationships-table__sort-icon--active' : ''}`}>
                        {sortField === 'relationshipType' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
                      </span>
                      {relationshipsCount > 0 && (
                        <span className="relationships-table__count-badge">{relationshipsCount}</span>
                      )}
                    </span>
                  </th>
                  <th
                    className="relationships-table__sortable"
                    onClick={() => handleSort('relatedCustomer')}
                  >
                    <span className="relationships-table__header-content">
                      관련 고객
                      <span className={`relationships-table__sort-icon ${sortField === 'relatedCustomer' ? 'relationships-table__sort-icon--active' : ''}`}>
                        {sortField === 'relatedCustomer' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
                      </span>
                    </span>
                  </th>
                  <th
                    className="relationships-table__sortable"
                    onClick={() => handleSort('createdAt')}
                  >
                    <span className="relationships-table__header-content">
                      등록일
                      <span className={`relationships-table__sort-icon ${sortField === 'createdAt' ? 'relationships-table__sort-icon--active' : ''}`}>
                        {sortField === 'createdAt' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
                      </span>
                    </span>
                  </th>
                  <th className="relationships-table__delete-header">{deleteHeaderLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  return (
                    <tr key={row.key}>
                      <td>
                        <div className={`relationships-category relationships-category--${row.category}`}>
                          <span className="relationships-category__icon relationships-category__icon--emoji">
                            {row.relationIcon}
                          </span>
                          <span className="relationships-category__label">
                            {getRelationshipTypeLabel(row.relationship)}
                            {row.isReversed && (
                              <span className="relationships-category__reverse">(역방향)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        {row.relatedCustomer ? (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => handleCustomerSelect(row.relatedCustomer)}
                            onDoubleClick={() => handleCustomerDoubleClick(row.relatedCustomer)}
                            className="relationships-link"
                          >
                            {row.relatedCustomer.personal_info?.name || '이름 없음'}
                          </Button>
                        ) : (
                          <span>알 수 없음</span>
                        )}
                      </td>
                      <td>{row.createdAt}</td>
                      <td>
                        <Tooltip content="관계 삭제">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(row.key)}
                            className="relationships-action relationships-action--danger"
                            aria-label="관계 삭제"
                          >
                            <SFSymbol
                              name="trash"
                              size={SFSymbolSize.TITLE_3}
                              weight={SFSymbolWeight.SEMIBOLD}
                              decorative
                            />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppleConfirmModal state={confirmController.state} actions={confirmController.actions} />
    </div>
  );
};

export default RelationshipsTab;
