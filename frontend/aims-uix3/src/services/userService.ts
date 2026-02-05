/**
 * AIMS UIX-3 User Service
 * @since 2025-11-07
 * @version 2.0.0
 *
 * 사용자 정보 관리 서비스
 * 계정 설정, 프로필 조회/수정에 사용
 *
 * 변경사항 (2.0.0):
 * - /api/auth/me 사용으로 변경 (JWT 기반)
 * - profileCompleted 필드 추가
 */

import { api } from '@/shared/lib/api'

/**
 * 사용자 정보 타입
 */
export interface User {
  id: string
  name: string
  email: string
  phone?: string
  department?: string
  position?: string
  role?: string
  avatarUrl?: string
  authProvider?: string
  profileCompleted?: boolean
}

/**
 * /api/auth/me 응답 타입
 */
interface AuthMeResponse {
  success: boolean
  user: {
    _id: string
    name: string | null
    email: string | null
    phone: string | null
    department: string | null
    position: string | null
    avatarUrl: string | null
    role: string
    authProvider: string
    profileCompleted: boolean
  }
}

/**
 * 현재 로그인한 사용자 정보 조회
 * JWT 토큰 기반으로 /api/auth/me 호출
 */
export async function getCurrentUser(): Promise<User> {
  const response = await api.get<AuthMeResponse>('/api/auth/me')

  if (!response.success) {
    throw new Error('사용자 정보 조회 실패')
  }

  // API 응답을 User 타입으로 변환 (null 처리)
  const user: User = {
    id: response.user._id,
    name: response.user.name || '',
    email: response.user.email || '',
    role: response.user.role,
    authProvider: response.user.authProvider,
    profileCompleted: response.user.profileCompleted
  }

  if (response.user.phone) {
    user.phone = response.user.phone
  }
  if (response.user.department) {
    user.department = response.user.department
  }
  if (response.user.position) {
    user.position = response.user.position
  }
  if (response.user.avatarUrl) {
    user.avatarUrl = response.user.avatarUrl
  }

  return user
}

/**
 * 특정 사용자 정보 조회 (관리자용)
 * @deprecated 일반 사용자는 getCurrentUser() 사용
 */
export async function getUser(_userId: string): Promise<User> {
  // 현재 사용자면 /api/auth/me 사용
  return getCurrentUser()
}

/**
 * 스토리지 정보 타입
 */
export interface StorageInfo {
  tier: string
  tierName: string
  quota_bytes: number
  used_bytes: number
  remaining_bytes: number
  usage_percent: number
  is_unlimited: boolean
  formatted?: {
    quota: string
    used: string
    remaining: string
    credit_quota?: string
  }

  // 크레딧 정보 (신규 - TIER_PRICING_POLICY.md 참고)
  credit_quota: number                    // 월 크레딧 한도 (일할 계산 적용)
  credit_quota_full?: number              // 원래 월간 한도 (참고용)
  credits_used: number                    // 사용한 크레딧
  credits_remaining: number               // 남은 월정액 크레딧
  credit_usage_percent: number            // 사용률 (%)
  credit_is_unlimited: boolean            // 무제한 여부

  // 추가 크레딧 (Bonus Credits) - BONUS_CREDIT_IMPLEMENTATION.md 참고
  bonus_balance: number                   // 추가 크레딧 잔액
  total_available: number                 // 총 사용가능 (월정액 남은 + 추가)
  credit_breakdown: {
    ocr: { pages: number; credits: number }
    ai: { tokens: number; credits: number }
  }
  credit_cycle_start: string              // "YYYY-MM-DD" (매월 1일)
  credit_cycle_end: string                // "YYYY-MM-DD" (해당 월 말일)
  credit_days_until_reset: number         // 리셋까지 남은 일수

  // 일할 계산 정보 (Pro-rata) - SAAS_BILLING_POLICY.md 참고
  is_first_month?: boolean                // 첫 달 여부
  pro_rata_ratio?: number                 // 일할 계산 비율 (0~1)
  total_days_in_cycle?: number            // 해당 월 총 일수
  remaining_days_in_cycle?: number        // 사이클 내 남은 일수

  // OCR 정보 (페이지 기반 - deprecated, 하위호환)
  has_ocr_permission: boolean
  ocr_page_quota: number          // 페이지 한도
  ocr_pages_used: number          // 사용 페이지 수
  ocr_docs_count: number          // 문서 수 (참고용)
  ocr_remaining: number           // 남은 페이지 수
  ocr_is_unlimited: boolean
  // 사이클 정보
  ocr_cycle_start: string         // "YYYY-MM-DD"
  ocr_cycle_end: string           // "YYYY-MM-DD"
  ocr_days_until_reset: number    // 리셋까지 남은 일수
  // 하위 호환성 (deprecated)
  ocr_quota: number
  ocr_used_this_month: number
  // 일괄 업로드 제한 (bytes, -1이면 무제한)
  max_batch_upload_bytes: number
}

/**
 * 스토리지 API 응답 타입
 */
interface StorageResponse {
  success: boolean
  data: StorageInfo
}

/**
 * 현재 사용자의 스토리지 사용량 조회
 */
export async function getMyStorageInfo(): Promise<StorageInfo> {
  const response = await api.get<StorageResponse>('/api/users/me/storage')

  if (!response.success) {
    throw new Error('스토리지 정보 조회 실패')
  }

  return response.data
}

/**
 * 사용자 정보 업데이트
 * @param _userId 사용자 ID (미사용, JWT에서 추출)
 * @param updates 업데이트할 필드
 * @returns 업데이트된 사용자 정보
 */
export async function updateUser(
  _userId: string,
  updates: Partial<Omit<User, 'id' | 'role'>>
): Promise<User> {
  // 프로필 업데이트 (이름, 이메일, 전화번호, 지점, 직급, 아바타)
  const updatePayload: { name?: string; email?: string; phone?: string; department?: string; position?: string; avatarUrl?: string } = {}

  if (updates.name !== undefined) {
    updatePayload.name = updates.name
  }
  if (updates.email !== undefined) {
    updatePayload.email = updates.email
  }
  if (updates.phone !== undefined) {
    updatePayload.phone = updates.phone
  }
  if (updates.department !== undefined) {
    updatePayload.department = updates.department
  }
  if (updates.position !== undefined) {
    updatePayload.position = updates.position
  }
  if (updates.avatarUrl !== undefined) {
    updatePayload.avatarUrl = updates.avatarUrl
  }

  // 업데이트할 내용이 있으면 API 호출
  if (Object.keys(updatePayload).length > 0) {
    const response = await api.put<AuthMeResponse>('/api/auth/profile', updatePayload)

    if (!response.success) {
      throw new Error('프로필 업데이트 실패')
    }

    const user: User = {
      id: response.user._id,
      name: response.user.name || '',
      email: response.user.email || '',
      role: response.user.role,
      authProvider: response.user.authProvider,
      profileCompleted: response.user.profileCompleted
    }

    if (response.user.phone) {
      user.phone = response.user.phone
    }
    if (response.user.department) {
      user.department = response.user.department
    }
    if (response.user.position) {
      user.position = response.user.position
    }
    if (response.user.avatarUrl) {
      user.avatarUrl = response.user.avatarUrl
    }

    return user
  }

  // 업데이트할 필드가 없으면 현재 사용자 정보 반환
  return getCurrentUser()
}
