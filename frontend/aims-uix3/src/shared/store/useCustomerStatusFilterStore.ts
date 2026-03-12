/**
 * 고객 상태 필터 전역 Store
 *
 * customerStatusFilterChange 이벤트를 Zustand store로 대체
 * 휴면 처리/복원 시 고객 목록의 상태 필터를 외부에서 변경할 때 사용
 */

import { create } from 'zustand';

/** 고객 상태 필터 타입 */
export type CustomerStatusFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'active-personal'
  | 'active-corporate'
  | 'inactive-personal'
  | 'inactive-corporate';

interface CustomerStatusFilterStore {
  /** 필터 변경 요청 (null이면 변경 요청 없음) */
  pendingFilter: CustomerStatusFilter | null;

  /** 필터 변경 요청 발행 (서비스 레이어에서 호출) */
  requestFilterChange: (filter: CustomerStatusFilter) => void;

  /** 필터 변경 요청 소비 (AllCustomersView에서 호출 후 null로 리셋) */
  consumeFilterChange: () => CustomerStatusFilter | null;
}

export const useCustomerStatusFilterStore = create<CustomerStatusFilterStore>((set, get) => ({
  pendingFilter: null,

  requestFilterChange: (filter: CustomerStatusFilter) => {
    set({ pendingFilter: filter });
  },

  consumeFilterChange: () => {
    const current = get().pendingFilter;
    if (current !== null) {
      set({ pendingFilter: null });
    }
    return current;
  },
}));
