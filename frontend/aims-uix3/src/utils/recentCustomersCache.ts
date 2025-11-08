/**
 * 최근 선택한 고객 캐시 관리 유틸리티
 * localStorage를 사용하여 최근 선택한 고객 정보를 저장
 */

export interface RecentCustomer {
  _id: string
  name: string
  phone?: string
  address?: string
  selectedAt: string // ISO 날짜 문자열
}

const STORAGE_KEY = 'aims-recent-customers'
const MAX_RECENT_CUSTOMERS = 5

/**
 * 최근 선택한 고객 목록 가져오기
 */
export function getRecentCustomers(): RecentCustomer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const customers = JSON.parse(stored) as RecentCustomer[]
    // 최신순으로 정렬하여 반환
    return customers
      .sort((a, b) => new Date(b.selectedAt).getTime() - new Date(a.selectedAt).getTime())
      .slice(0, MAX_RECENT_CUSTOMERS)
  } catch (error) {
    console.error('Failed to load recent customers:', error)
    return []
  }
}

/**
 * 고객을 최근 선택 목록에 추가
 */
export function addRecentCustomer(customer: any): void {
  try {
    const recentCustomers = getRecentCustomers()

    // 동일한 고객이 이미 있으면 제거 (중복 방지)
    const filtered = recentCustomers.filter(rc => rc._id !== customer._id)

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

    // 맨 앞에 추가
    const updated = [newRecentCustomer, ...filtered].slice(0, MAX_RECENT_CUSTOMERS)

    // localStorage에 저장
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to add recent customer:', error)
  }
}

/**
 * 특정 고객을 최근 선택 목록에서 제거
 */
export function removeRecentCustomer(customerId: string): void {
  try {
    const recentCustomers = getRecentCustomers()
    const filtered = recentCustomers.filter(rc => rc._id !== customerId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to remove recent customer:', error)
  }
}

/**
 * 최근 선택 목록 초기화
 */
export function clearRecentCustomers(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear recent customers:', error)
  }
}