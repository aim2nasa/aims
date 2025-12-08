/**
 * 인증 API 클라이언트
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

export interface User {
  _id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  authProvider?: string;
  profileCompleted?: boolean;
  hasOcrPermission?: boolean;  // 🆕 OCR 권한 (기본값: false)
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

/**
 * 카카오 로그인 시작 - 기존 계정으로 빠른 로그인
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startKakaoLogin = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/kakao?redirect=${redirectOrigin}`;
};

/**
 * 카카오 로그인 시작 - 다른 계정으로 로그인 (매번 로그인 화면 표시)
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startKakaoLoginSwitch = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/kakao/switch?redirect=${redirectOrigin}`;
};

/**
 * 현재 로그인한 사용자 정보 조회
 */
export const getCurrentUser = async (token: string): Promise<User> => {
  const response = await axios.get<AuthResponse>(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.data.success || !response.data.user) {
    throw new Error('사용자 정보를 가져올 수 없습니다');
  }

  return response.data.user;
};

/**
 * 프로필 업데이트 (이름 설정)
 */
export const updateProfile = async (token: string, name: string): Promise<User> => {
  const response = await axios.put<AuthResponse>(
    `${API_BASE_URL}/api/auth/profile`,
    { name },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.data.success || !response.data.user) {
    throw new Error('프로필 업데이트에 실패했습니다');
  }

  return response.data.user;
};

/**
 * JWT 토큰 갱신
 */
export const refreshToken = async (token: string): Promise<string> => {
  const response = await axios.post<AuthResponse>(
    `${API_BASE_URL}/api/auth/refresh`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.data.success || !response.data.token) {
    throw new Error('토큰 갱신에 실패했습니다');
  }

  return response.data.token;
};

/**
 * 로그아웃
 */
export const logout = async (): Promise<void> => {
  await axios.post<AuthResponse>(`${API_BASE_URL}/api/auth/logout`);
};

/**
 * 계정 완전 삭제 (개발/테스트용)
 */
export const deleteAccount = async (token: string): Promise<void> => {
  await axios.delete<AuthResponse>(`${API_BASE_URL}/api/auth/account`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
