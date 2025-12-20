/**
 * 인증 상태 관리 Store (Zustand)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OAuthProfile {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface User {
  _id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  authProvider?: string;
  profileCompleted?: boolean;
  oauthProfile?: OAuthProfile | null;
}

interface AuthState {
  // 상태
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // 액션
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // 초기 상태
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,

      // 토큰 설정
      setToken: (token: string) =>
        set({ token, isAuthenticated: true }),

      // 사용자 정보 설정
      setUser: (user: User) =>
        set({ user, isAuthenticated: true }),

      // 로그아웃
      logout: () =>
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        }),

      // 로딩 상태 설정
      setLoading: (loading: boolean) =>
        set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage', // localStorage 키
      // 토큰만 저장 (사용자 정보는 매번 서버에서 가져옴)
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);
