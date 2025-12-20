/**
 * 인증 API 클라이언트
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

export interface OAuthProfile {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface User {
  _id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  authProvider?: string;
  profileCompleted?: boolean;
  hasOcrPermission?: boolean;  // 🆕 OCR 권한 (기본값: false)
  oauthProfile?: OAuthProfile | null;  // 소셜 로그인에서 받아온 초기 프로필 정보
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

/**
 * 카카오 로그인 시작 - 기존 세션 유지
 * 카카오에 이미 로그인되어 있으면 자동으로 진행 (빠른 로그인)
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
 * 네이버 로그인 시작 - 기존 세션 유지
 * 네이버에 이미 로그인되어 있으면 자동으로 진행 (빠른 로그인)
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startNaverLogin = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/naver?redirect=${redirectOrigin}`;
};

/**
 * 네이버 로그인 시작 - 다른 계정으로 로그인 (매번 로그인 화면 표시)
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startNaverLoginSwitch = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/naver/switch?redirect=${redirectOrigin}`;
};

/**
 * 구글 로그인 시작 - 기존 세션 유지
 * 구글에 이미 로그인되어 있으면 자동으로 진행 (빠른 로그인)
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startGoogleLogin = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/google?redirect=${redirectOrigin}`;
};

/**
 * 구글 로그인 시작 - 다른 계정으로 로그인 (매번 로그인 화면 표시)
 * 현재 origin을 redirect 파라미터로 전달하여 개발/상용 서버 모두 지원
 */
export const startGoogleLoginSwitch = () => {
  const redirectOrigin = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE_URL}/api/auth/google/switch?redirect=${redirectOrigin}`;
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

export interface ProfileUpdateData {
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

/**
 * 프로필 업데이트 (이름, 이메일, 프로필 사진)
 */
export const updateProfile = async (token: string, data: ProfileUpdateData): Promise<User> => {
  const response = await axios.put<AuthResponse>(
    `${API_BASE_URL}/api/auth/profile`,
    data,
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
