/**
 * 최근 선택한 고객 관리 유틸리티
 * @since 1.0.0
 */

import type { Customer } from '@/entities/customer'
import { errorReporter } from '@/shared/lib/errorReporter'

const STORAGE_KEY = 'aims_recent_customers'
const MAX_RECENT_CUSTOMERS = 5

export interface RecentCustomer {
  id: string
  name: string
  timestamp: number
}

/**
 * 최근 선택한 고객 목록 가져오기
 */
export function getRecentCustomers(): RecentCustomer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const customers = JSON.parse(stored) as RecentCustomer[]
    // 타임스탬프 기준 내림차순 정렬 (최신순)
    return customers.sort((a, b) => b.timestamp - a.timestamp)
  } catch (error) {
    console.error('Failed to load recent customers:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentCustomers.getRecentCustomers' })
    return []
  }
}

/**
 * 최근 선택한 고객에 추가
 */
export function addRecentCustomer(customer: Customer): void {
  try {
    const recentCustomers = getRecentCustomers()
    const customerId = customer._id

    // 중복 제거 (같은 ID가 있으면 제거)
    const filtered = recentCustomers.filter(c => c.id !== customerId)

    // 새 고객을 맨 앞에 추가
    const updated: RecentCustomer[] = [
      {
        id: customerId,
        name: customer.personal_info?.name || customerId,
        timestamp: Date.now()
      },
      ...filtered
    ]

    // 최대 5개까지만 유지
    const trimmed = updated.slice(0, MAX_RECENT_CUSTOMERS)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    console.log('[addRecentCustomer] 저장됨:', trimmed)
  } catch (error) {
    console.error('Failed to save recent customer:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentCustomers.addRecentCustomer' })
  }
}

/**
 * 최근 선택한 고객 목록 초기화
 */
export function clearRecentCustomers(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear recent customers:', error)
    errorReporter.reportApiError(error as Error, { component: 'recentCustomers.clearRecentCustomers' })
  }
}
