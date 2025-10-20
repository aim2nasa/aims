/**
 * usePersistedState Hook
 * @since 2025-10-20
 * @version 1.0.0
 *
 * LocalStorage와 동기화되는 React state hook
 * F5 새로고침 후에도 상태가 유지됨
 */

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * LocalStorage와 동기화되는 state를 생성
 *
 * @param key - LocalStorage 키 (앱 전체에서 고유해야 함)
 * @param initialValue - 초기값 (LocalStorage에 값이 없을 때 사용)
 * @returns [state, setState] - useState와 동일한 인터페이스
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = usePersistedState('customer-all-search', '');
 * const [sortBy, setSortBy] = usePersistedState('customer-all-sort', 'name');
 * const [expandedRows, setExpandedRows] = usePersistedState<string[]>('customer-all-expanded', []);
 * ```
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // LocalStorage에서 초기값 복원
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        return JSON.parse(item) as T;
      }
    } catch (error) {
      console.error(`[usePersistedState] "${key}" 복원 실패:`, error);
    }
    return initialValue;
  });

  // state 변경 시 LocalStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`[usePersistedState] "${key}" 저장 실패:`, error);
    }
  }, [key, state]);

  return [state, setState];
}

/**
 * LocalStorage 키를 삭제하고 초기값으로 리셋
 */
export function clearPersistedState(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[usePersistedState] "${key}" 삭제 실패:`, error);
  }
}

/**
 * 여러 View의 상태를 한번에 초기화 (디버깅용)
 */
export function clearAllViewStates(): void {
  const keys = [
    // Customer Views
    'customer-all-search',
    'customer-all-sort',
    'customer-all-expanded',
    'customer-all-page',
    'customer-regional-search',
    'customer-regional-sort',
    'customer-regional-region',
    'aims_relationship_expanded_nodes',

    // Document Views
    'document-library-search',
    'document-library-sort',
    'document-library-filter',
    'document-library-page',
    'document-search-query',
    'document-search-results',
    'document-status-filter',
    'document-status-sort',
    'document-status-page',
  ];

  keys.forEach(key => clearPersistedState(key));
  console.log('[usePersistedState] 모든 View 상태 초기화 완료');
}
