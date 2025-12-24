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
  }
  // OCR 정보
  has_ocr_permission: boolean
  ocr_quota: number
  ocr_used_this_month: number
  ocr_remaining: number
  ocr_is_unlimited: boolean
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
