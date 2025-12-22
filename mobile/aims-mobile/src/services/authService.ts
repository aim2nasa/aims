import { api, API_BASE_URL, ApiError } from './api';
import { AuthResponse, User } from '../types';

/**
 * 로그인
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new ApiError(response.status, data.message || '로그인에 실패했습니다.');
  }

  return data as AuthResponse;
}

/**
 * 현재 사용자 정보 조회
 */
export async function getCurrentUser(): Promise<User> {
  return api.get<User>('/api/auth/me');
}

/**
 * 토큰 갱신
 */
export async function refreshToken(): Promise<{ token: string }> {
  return api.post<{ token: string }>('/api/auth/refresh');
}

/**
 * 토큰 검증
 */
export async function verifyToken(): Promise<{ valid: boolean; user: User }> {
  try {
    const user = await getCurrentUser();
    return { valid: true, user };
  } catch {
    return { valid: false, user: null as unknown as User };
  }
}

/**
 * 비밀번호 변경
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return api.post('/api/auth/change-password', {
    currentPassword,
    newPassword,
  });
}
