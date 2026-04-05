/**
 * Recent Customers Store
 * @since 2025-11-12
 * @modified 2025-12-10 - 계정별 데이터 격리 적용 (userId 기반 동적 키)
 *
 * 최근 선택한 고객 전역 상태 관리 (Zustand + localStorage)
 * aims-uix3 전체에서 고객 선택 기록을 공유
 */

import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Customer } from '@/entities/customer'

const STORAGE_KEY_PREFIX = 'aims-recent-customers'

/**
 * 현재 사용자 ID 기반 storage key 생성
 * 개발자 모드 계정 전환 지원
 */
function getStorageKey(): string {
  const userId = localStorage.getItem('aims-current-user-id')
  if (userId) {
    return `${STORAGE_KEY_PREFIX}_${userId}`
  }
  return STORAGE_KEY_PREFIX
}

/**
 * 사용자별 격리된 localStorage 스토리지
 * 동적으로 userId 기반 키를 사용
 */
const userIsolatedStorage: StateStorage = {
  getItem: (_name: string): string | null => {
    // name은 무시하고 동적 키 사용
    return localStorage.getItem(getStorageKey())
  },
  setItem: (_name: string, value: string): void => {
    localStorage.setItem(getStorageKey(), value)
  },
  removeItem: (_name: string): void => {
    localStorage.removeItem(getStorageKey())
  },
}

export interface RecentCustomer {
  _id: string
  name: string
  phone?: string
  address?: string
  customerType: '개인' | '법인'  // 고객 유형
  selectedAt: string // ISO 날짜 문자열
}

interface RecentCustomersState {
  /** 최근 선택한 고객 목록 (최대 5개) */
  recentCustomers: RecentCustomer[]
  /** 고객을 최근 선택 목록에 추가 */
  addRecentCustomer: (customer: Customer) => void
  /** 특정 고객을 최근 선택 목록에서 제거 */
  removeRecentCustomer: (customerId: string) => void
  /** 최근 선택 목록 초기화 */
  clearRecentCustomers: () => void
  /** 최근 선택한 고객 가져오기 (정렬된 목록) */
  getRecentCustomers: () => RecentCustomer[]
}

const MAX_RECENT_CUSTOMERS = 5

export const useRecentCustomersStore = create<RecentCustomersState>()(
  persist(
    (set, get) => ({
      recentCustomers: [],

      addRecentCustomer: (customer: Customer) => {
        set((state) => {
          // 동일한 고객이 이미 있으면 제거 (중복 방지)
          const filtered = state.recentCustomers.filter(rc => rc._id !== customer._id)

          // 전화번호 추출 (우선순위: mobile_phone > home_phone > work_phone)
          const phone = customer.personal_info?.mobile_phone ||
                       customer.personal_info?.home_phone ||
                       customer.personal_info?.work_phone

          // 주소 조합
          const addressParts = [
            customer.personal_info?.address?.address1,
            customer.personal_info?.address?.address2
          ].filter(Boolean)
          const address = addressParts.length > 0 ? addressParts.join(' ') : undefined

          // 고객 유형 추출 (기본값: 개인)
          const customerType = (customer.insurance_info?.customer_type as '개인' | '법인') || '개인'

          // 새로운 고객 정보 생성
          const newRecentCustomer: RecentCustomer = {
            _id: customer._id,
            name: customer.personal_info?.name || '이름 없음',
            customerType,
            selectedAt: new Date().toISOString(),
            ...(phone && { phone }),
            ...(address && { address })
          }

          // 맨 앞에 추가하고 최대 5개까지만 유지
          const updated = [newRecentCustomer, ...filtered].slice(0, MAX_RECENT_CUSTOMERS)

          console.log('[useRecentCustomersStore] 고객 추가:', newRecentCustomer.name, updated)

          return { recentCustomers: updated }
        })
      },

      removeRecentCustomer: (customerId: string) => {
        set((state) => ({
          recentCustomers: state.recentCustomers.filter(rc => rc._id !== customerId)
        }))
      },

      clearRecentCustomers: () => {
        set({ recentCustomers: [] })
      },

      getRecentCustomers: () => {
        const { recentCustomers } = get()
        // 최신순으로 정렬하여 반환
        return [...recentCustomers]
          .sort((a, b) => new Date(b.selectedAt).getTime() - new Date(a.selectedAt).getTime())
          .slice(0, MAX_RECENT_CUSTOMERS)
      }
    }),
    {
      name: 'aims-recent-customers', // 기본 key (userIsolatedStorage에서 동적 키로 대체됨)
      version: 2,  // v2: customerType 필드 추가
      storage: createJSONStorage(() => userIsolatedStorage),
    }
  )
)
