/**
 * Geocoding API Service
 * 주소를 좌표로 변환하는 서비스
 */

import { api } from '@/shared/lib/api'

export interface GeocodeResult {
  address: string
  latitude: number
  longitude: number
  roadAddress: string
  jibunAddress: string
}

interface GeocodeApiResponse {
  success: boolean
  data?: GeocodeResult
  error?: string
}

/**
 * 주소를 좌표로 변환
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const response = await api.post<GeocodeApiResponse>(
      '/api/geocode',
      { address }
    )

    // api 클라이언트가 이미 { success: true, data: {...} }에서 data를 추출함
    if (response.data && typeof response.data === 'object') {
      return response.data as GeocodeResult
    }

    return null
  } catch (error) {
    console.error('[Geocode] 주소 변환 실패:', error)
    return null
  }
}
