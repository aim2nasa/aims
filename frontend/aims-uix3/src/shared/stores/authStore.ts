/**
 * 인증 상태 관리 Store (Zustand)
 *
 * Phase 1: 동적 스토리지 전환
 * - 기본: sessionStorage (브라우저 닫으면 토큰 삭제 → 재로그인 필요)
 * - 기기 기억 O: localStorage (PIN 검증 후 진입)
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

/**
 * 기기 기억 여부에 따라 스토리지 동적 선택
 * - aims-remember-device=true → localStorage (PIN 인증 후 진입)
 * - 미설정/false → sessionStorage (브라우저 닫으면 토큰 삭제)
 * - Safari 개인정보 보호 모드 → sessionStorage fallback
 */
const getStorage = (): Storage => {
  try {
    const rememberDevice = localStorage.getItem('aims-remember-device');
    if (rememberDevice === 'true') {
      // localStorage 쓰기 가능 여부 테스트
      localStorage.setItem('aims-storage-test', '1');
      localStorage.removeItem('aims-storage-test');
      return localStorage;
    }
  } catch {
    console.warn('[Auth] localStorage 접근 불가, sessionStorage로 fallback');
  }
  return sessionStorage;
};

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

      // 로그아웃 — 모든 인증 관련 데이터 정리
      logout: () => {
        // 인증 관련 localStorage/sessionStorage 정리
        try {
          localStorage.removeItem('aims-remember-device');
          localStorage.removeItem('aims-remembered-user');
          localStorage.removeItem('auth-storage-v2');
        } catch { /* Safari 개인정보 보호 모드 */ }
        sessionStorage.removeItem('aims-session-token');
        sessionStorage.removeItem('auth-storage-v2');

        // 멀티탭 로그아웃 동기화
        try {
          const channel = new BroadcastChannel('aims-auth');
          channel.postMessage({ type: 'LOGOUT' });
          channel.close();
        } catch { /* BroadcastChannel 미지원 브라우저 */ }

        set({ token: null, user: null, isAuthenticated: false });
      },

      // 로딩 상태 설정
      setLoading: (loading: boolean) =>
        set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage-v2', // key 유지! 변경 시 기존 사용자 로그아웃됨
      partialize: (state) => ({
        token: state.token,
      }),
      // persist 복원 후 isAuthenticated 파생 (token → isAuthenticated)
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true;
        }
      },
      // 동적 스토리지 어댑터
      storage: {
        getItem: (name) => {
          const storage = getStorage();
          const value = storage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          const storage = getStorage();
          storage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          // 양쪽 모두에서 제거 (스토리지 전환 시 잔여 데이터 방지)
          try { localStorage.removeItem(name); } catch { /* ignore */ }
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);

// 멀티탭 로그아웃 동기화 리스너
try {
  const authChannel = new BroadcastChannel('aims-auth');
  authChannel.onmessage = (e) => {
    if (e.data?.type === 'LOGOUT' && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
  };
} catch { /* BroadcastChannel 미지원 */ }
