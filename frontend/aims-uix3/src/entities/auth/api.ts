/**
 * 인증 API 클라이언트
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || 'http://tars.giize.com:3010';

export interface User {
  id: string;
  kakaoId?: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

/**
 * 카카오 로그인 시작 (백엔드로 리다이렉트)
 */
export const startKakaoLogin = () => {
  window.location.href = `${API_BASE_URL}/api/auth/kakao`;
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
