/**
 * useCustomerRelationshipsController
 * @since 2025-10-20
 *
 * 고객 관계 탭의 비즈니스 로직을 담당하는 Controller Hook.
 * Document-Controller-View 아키텍처 원칙을 준수하며
 * RelationshipService를 통해 데이터 로딩/삭제를 수행한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RelationshipService,
  type Relationship,
  type RelationshipTypeData,
} from '@/services/relationshipService';
interface UseCustomerRelationshipsControllerOptions {
  /** 대상 고객 ID */
  customerId?: string;
  /** 마운트 시 자동 로드 여부 */
  autoLoad?: boolean;
}

export interface CustomerRelationshipsState {
  relationships: Relationship[];
  relationshipTypes: RelationshipTypeData;
  isLoading: boolean;
  error: string | null;
}

export interface CustomerRelationshipsActions {
  /** 관계 데이터 로드 */
  loadRelationships: (options?: { silent?: boolean }) => Promise<void>;
  /** 관계 유형 캐시 강제 갱신 */
  refreshRelationshipTypes: () => Promise<void>;
  /** 관계 삭제 */
  deleteRelationship: (relationshipId: string) => Promise<void>;
  /** 관계 라벨 조회 */
  getRelationshipTypeLabel: (relationship: Relationship) => string;
}

export interface CustomerRelationshipsController {
  state: CustomerRelationshipsState;
  actions: CustomerRelationshipsActions;
}

const FALLBACK_RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: '배우자',
  parent: '부모',
  child: '자녀',
  sibling: '형제자매',
  friend: '친구',
  colleague: '동료',
};

/**
 * 고객 관계 컨트롤러 훅
 */
export const useCustomerRelationshipsController = (
  { customerId, autoLoad = true }: UseCustomerRelationshipsControllerOptions,
): CustomerRelationshipsController => {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeData>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadRelationshipTypes = useCallback(async () => {
    const types = await RelationshipService.getRelationshipTypes();
    setRelationshipTypes(types);
    return types;
  }, []);

  const loadRelationships = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!customerId) {
        setRelationships([]);
        return;
      }

      try {
        if (!options?.silent) {
          setIsLoading(true);
        }
        setError(null);

        const shouldFetchTypes =
          !relationshipTypes.all_types && !relationshipTypes.categories;

        const [types, relations] = await Promise.all([
          shouldFetchTypes ? loadRelationshipTypes() : Promise.resolve(relationshipTypes),
          RelationshipService.getCustomerRelationships(customerId),
        ]);

        if (shouldFetchTypes && types !== relationshipTypes) {
          setRelationshipTypes(types);
        }
        setRelationships(relations);
      } catch (err) {
        console.error('[useCustomerRelationshipsController] Failed to load relationships:', err);
        setError(
          err instanceof Error
            ? err.message
            : '고객 관계 정보를 불러오는데 실패했습니다.',
        );
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [customerId, loadRelationshipTypes, relationshipTypes],
  );

  const deleteRelationship = useCallback(
    async (relationshipId: string) => {
      if (!customerId) return;
      try {
        setIsLoading(true);
        await RelationshipService.deleteRelationship(customerId, relationshipId);
        await loadRelationships({ silent: true });
      } catch (err) {
        console.error('[useCustomerRelationshipsController] Failed to delete relationship:', err);
        setError('관계 삭제에 실패했습니다. 다시 시도해 주세요.');
      } finally {
        setIsLoading(false);
      }
    },
    [customerId, loadRelationships],
  );

  const getRelationshipTypeLabel = useCallback(
    (relationship: Relationship) => {
      if (relationship.display_relationship_label) {
        return relationship.display_relationship_label;
      }

      const typeKey = relationship.relationship_info?.relationship_type;
      if (!typeKey) return '관계';

      const labelFromTypes =
        relationshipTypes?.all_types?.[typeKey]?.label ??
        relationshipTypes?.categories?.[typeKey]?.label;

      return labelFromTypes ?? FALLBACK_RELATIONSHIP_LABELS[typeKey] ?? typeKey;
    },
    [relationshipTypes],
  );

  // 관계 변경 이벤트 대응
  useEffect(() => {
    if (!customerId) return undefined;

    const handleRelationshipChanged = () => {
      loadRelationships({ silent: true }).catch((error) =>
        console.warn('[useCustomerRelationshipsController] relationshipChanged handler error:', error),
      );
    };

    window.addEventListener('relationshipChanged', handleRelationshipChanged);
    return () => {
      window.removeEventListener('relationshipChanged', handleRelationshipChanged);
    };
  }, [customerId, loadRelationships]);

  // 초기 로드
  useEffect(() => {
    if (autoLoad) {
      loadRelationships().catch((error) =>
        console.warn('[useCustomerRelationshipsController] initial load error:', error),
      );
    }
  }, [autoLoad, loadRelationships]);

  const controllerState: CustomerRelationshipsState = useMemo(
    () => ({
      relationships,
      relationshipTypes,
      isLoading,
      error,
    }),
    [relationships, relationshipTypes, isLoading, error],
  );

  const controllerActions: CustomerRelationshipsActions = useMemo(
    () => ({
      loadRelationships,
      refreshRelationshipTypes: loadRelationshipTypes,
      deleteRelationship,
      getRelationshipTypeLabel,
    }),
    [loadRelationships, loadRelationshipTypes, deleteRelationship, getRelationshipTypeLabel],
  );

  return {
    state: controllerState,
    actions: controllerActions,
  };
};

export default useCustomerRelationshipsController;
