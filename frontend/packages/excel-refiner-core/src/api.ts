/**
 * @aims/excel-refiner-core/api
 * xlsx-free API 전용 엔트리포인트
 *
 * ProductSearchModal 등 xlsx 불필요한 컴포넌트에서 사용
 * → 번들 사이즈 최적화 (xlsx ~300KB 제거)
 */

import type { InsuranceProduct } from './types/excel'

export type { InsuranceProduct }

// 보험상품 API URL (Vite 프록시를 통해 tars.giize.com:3010으로 전달)
const INSURANCE_PRODUCTS_API = '/api/insurance-products'

/**
 * 보험상품 목록 가져오기
 */
export async function fetchInsuranceProducts(): Promise<InsuranceProduct[]> {
  try {
    const response = await fetch(INSURANCE_PRODUCTS_API)
    const data = await response.json()
    if (data.success && data.data) {
      return data.data
    }
    return []
  } catch (error) {
    console.error('보험상품 조회 오류:', error)
    return []
  }
}
