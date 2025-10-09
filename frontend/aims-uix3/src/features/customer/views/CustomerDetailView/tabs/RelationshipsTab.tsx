/**
 * AIMS UIX-3 Customer Detail - Relationships Tab
 * @since 2025-10-20
 *
 * 고객 관계 정보를 aims-uix2와 동일한 로직으로 표시합니다.
 * - 관계 목록 테이블
 * - 관계 삭제
 * - 관련 고객 상세 보기 이동
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import type { Customer } from '@/entities/customer/model';
import { useCustomerRelationshipsController } from '@/controllers/useCustomerRelationshipsController';
import type { Relationship } from '@/services/relationshipService';
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolVariant,
  SFSymbolWeight,
} from '../../../../../components/SFSymbol/SFSymbol';
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import './RelationshipsTab.css';


type ExtendedRelationship = Relationship & {
  related_customer?: Customer;
  from_customer?: Customer;
};

interface RelationshipsTabProps {
  customer: Customer;
  onSelectCustomer?: (customerId: string, customerData?: Customer) => void;
  onRelationshipsUpdated?: () => void;
}

const CATEGORY_SYMBOLS: Record<string, string> = {
  family: 'house.fill',
  relative: 'person.2.fill',
  social: 'person.3.fill',
  professional: 'briefcase.fill',
  corporate: 'building.2.fill',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const RelationshipsTab: React.FC<RelationshipsTabProps> = ({
  customer,
  onSelectCustomer,
  onRelationshipsUpdated,
}) => {
  const confirmController = useAppleConfirmController();
  const {
    state: { relationships, isLoading, error },
    actions: { loadRelationships, deleteRelationship, getRelationshipTypeLabel },
  } = useCustomerRelationshipsController({ customerId: customer?._id, autoLoad: true });

  const relationshipsCount = relationships.length;

  const handleCustomerSelect = useCallback(
    (relatedCustomer?: Customer) => {
      if (!relatedCustomer?._id) return;
      onSelectCustomer?.(relatedCustomer._id, relatedCustomer);
    },
    [onSelectCustomer],
  );

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
    return (relationships as ExtendedRelationship[]).map((relationship) => {
      const relatedCustomer =
        (relationship.related_customer as Customer | undefined) ?? undefined;
      const category = relationship.relationship_info?.relationship_category ?? 'default';
      const createdAt =
        relationship.meta?.created_at ?? relationship.created_at ?? '';
      const createdAtLabel = createdAt ? DATE_FORMATTER.format(new Date(createdAt)) : '-';

      return {
        key: relationship._id,
        category,
        relationship,
        relatedCustomer,
        createdAt: createdAtLabel,
        isReversed: relationship.is_reversed ?? false,
      };
    });
  }, [relationships]);

  const renderState = () => {
    if (isLoading && relationshipsCount === 0) {
      return (
        <div className="relationships-card__state">
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
        <div className="relationships-card__state relationships-card__state--error">
          <SFSymbol
            name="exclamationmark.triangle.fill"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
            variant={SFSymbolVariant.FILL}
          />
          <span>{error}</span>
          <button
            type="button"
            className="relationships-card__retry"
            onClick={() => loadRelationships()}
          >
            다시 시도
          </button>
        </div>
      );
    }

    if (!isLoading && relationshipsCount === 0) {
      return (
        <div className="relationships-card__state relationships-card__state--empty">
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

  return (
    <div className="relationships-tab">
      <div className="relationships-card">
        <header className="relationships-card__header">
          <div className="relationships-card__title">
            <SFSymbol name="person.2" weight={SFSymbolWeight.SEMIBOLD} size={SFSymbolSize.CALLOUT} />
            <span>고객 관계</span>
            <span className="relationships-card__count">{relationshipsCount}</span>
          </div>
          <div className="relationships-card__hint">
            관계 유형을 클릭하면 관련 고객 상세로 이동할 수 있습니다.
          </div>
        </header>

        {renderState()}

        {rows.length > 0 && (
          <div className="relationships-table-wrapper">
            <table className="relationships-table">
              <thead>
                <tr>
                  <th>관계 유형</th>
                  <th>관련 고객</th>
                  <th>등록일</th>
                  <th aria-label="작업 열" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const symbolName = CATEGORY_SYMBOLS[row.category] ?? 'person.crop.circle';
                  return (
                    <tr key={row.key}>
                      <td>
                        <div className={`relationships-category relationships-category--${row.category}`}>
                          <span className="relationships-category__icon">
                            <SFSymbol
                              name={symbolName}
                              size={SFSymbolSize.CAPTION_1}
                              weight={SFSymbolWeight.SEMIBOLD}
                            />
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
                          <button
                            type="button"
                            className="relationships-link"
                            onClick={() => handleCustomerSelect(row.relatedCustomer)}
                          >
                            {row.relatedCustomer.personal_info?.name || '이름 없음'}
                          </button>
                        ) : (
                          <span>알 수 없음</span>
                        )}
                        <span className="relationships-link__type">
                          ({row.relatedCustomer?.insurance_info?.customer_type ?? '-'})
                        </span>
                      </td>
                      <td>{row.createdAt}</td>
                      <td>
                        <button
                          type="button"
                          className="relationships-action relationships-action--danger"
                          onClick={() => handleDelete(row.key)}
                          aria-label="관계 삭제"
                          title="관계 삭제"
                        >
                          <SFSymbol
                            name="trash"
                            size={SFSymbolSize.CAPTION_1}
                            weight={SFSymbolWeight.SEMIBOLD}
                          />
                        </button>
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
