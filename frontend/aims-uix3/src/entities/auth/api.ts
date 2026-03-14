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

/**
 * OAuth 토큰 처리 공통 함수
 * LoginPage와 AuthCallbackPage 모두에서 사용
 */
export interface ProcessTokenDeps {
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  updateCurrentUser: (u: { id: string; name: string; email: string; role: string; avatarUrl?: string }) => void;
  syncUserIdFromStorage: () => void;
  navigate: (path: string, opts?: { replace?: boolean }) => void;
}

export const processAuthToken = async (token: string, deps: ProcessTokenDeps) => {
  deps.setToken(token);
  const user = await getCurrentUser(token);
  deps.setUser(user);
  deps.updateCurrentUser({
    id: user._id, name: user.name || '', email: user.email || '',
    role: user.role, avatarUrl: user.avatarUrl || undefined,
  });
  localStorage.setItem('aims-current-user-id', user._id);
  deps.syncUserIdFromStorage();

  const rememberDevice = localStorage.getItem('aims-remember-device') === 'true';
  if (rememberDevice) {
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: user._id,
      name: user.name || '',
      authProvider: user.authProvider || 'kakao',
    }));
    deps.navigate('/login?mode=pin', { replace: true });
  } else {
    deps.navigate('/', { replace: true });
  }

  return user;
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

// ========== Phase 3: PIN 간편 비밀번호 API ==========

export interface PinVerifyResponse {
  success: boolean;
  sessionToken?: string;
  message?: string;
  failCount?: number;
  remaining?: number;
  locked?: boolean;
}

export interface PinStatusResponse {
  success: boolean;
  hasPin: boolean;
  locked: boolean;
}

/** PIN 설정 */
export const setPin = async (token: string, pin: string): Promise<{ success: boolean; message?: string }> => {
  const response = await axios.post(`${API_BASE_URL}/api/auth/set-pin`, { pin }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

/** PIN 검증 → 세션 토큰 반환 */
export const verifyPin = async (token: string, pin: string): Promise<PinVerifyResponse> => {
  const response = await axios.post(`${API_BASE_URL}/api/auth/verify-pin`, { pin }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

/** PIN 재설정 (소셜 로그인 인증 후) */
export const resetPin = async (token: string, newPin: string): Promise<{ success: boolean; message?: string }> => {
  const response = await axios.post(`${API_BASE_URL}/api/auth/reset-pin`, { newPin }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

/** PIN 삭제 + 기기 기억 해제 */
export const deletePin = async (token: string): Promise<{ success: boolean }> => {
  const response = await axios.delete(`${API_BASE_URL}/api/auth/pin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

/** PIN 설정 여부 확인 */
export const getPinStatus = async (token: string): Promise<PinStatusResponse> => {
  const response = await axios.get(`${API_BASE_URL}/api/auth/pin-status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
