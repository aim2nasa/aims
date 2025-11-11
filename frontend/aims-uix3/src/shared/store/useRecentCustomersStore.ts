/**
 * Recent Customers Store
 * @since 2025-11-12
 *
 * 최근 선택한 고객 전역 상태 관리 (Zustand + localStorage)
 * aims-uix3 전체에서 고객 선택 기록을 공유
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Customer } from '@/entities/customer'

export interface RecentCustomer {
  _id: string
  name: string
  phone?: string
  address?: string
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

          // 새로운 고객 정보 생성
          const newRecentCustomer: RecentCustomer = {
            _id: customer._id,
            name: customer.personal_info?.name || '이름 없음',
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
      name: 'aims-recent-customers', // localStorage key
      version: 1
    }
  )
)
