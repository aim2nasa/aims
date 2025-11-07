/**
 * AIMS UIX-3 User Service
 * @since 2025-11-07
 * @version 1.0.0
 *
 * 사용자 정보 관리 서비스
 * 계정 설정, 프로필 조회/수정에 사용
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
}

/**
 * API 응답 타입
 */
interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

/**
 * 특정 사용자 정보 조회
 * @param userId 사용자 ID
 * @returns 사용자 정보
 */
export async function getUser(userId: string): Promise<User> {
  const response = await api.get<ApiResponse<User>>(`/api/users/${userId}`)

  if (!response.success) {
    throw new Error(response.error || '사용자 정보 조회 실패')
  }

  return response.data
}

/**
 * 사용자 정보 업데이트
 * @param userId 사용자 ID
 * @param updates 업데이트할 필드
 * @returns 업데이트된 사용자 정보
 */
export async function updateUser(
  userId: string,
  updates: Partial<Omit<User, 'id' | 'role'>>
): Promise<User> {
  const response = await api.put<ApiResponse<User>>(`/api/users/${userId}`, updates)

  if (!response.success) {
    throw new Error(response.error || '사용자 정보 업데이트 실패')
  }

  return response.data
}

/**
 * 현재 로그인한 사용자 정보 조회
 * localStorage에서 현재 사용자 ID를 가져와 조회
 */
export async function getCurrentUser(): Promise<User> {
  const currentUserId = localStorage.getItem('aims-current-user-id') || 'tester'
  return getUser(currentUserId)
}
