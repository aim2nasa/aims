import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';
import * as authService from '../services/authService';
import { User } from '../types';

const TOKEN_KEY = 'aims_auth_token';
const USER_KEY = 'aims_user_data';
const TOKEN_EXPIRY_KEY = 'aims_token_expiry';

// 토큰 만료 시간 (7일, 밀리초)
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
// 토큰 갱신 임계값 (1일 전)
const TOKEN_REFRESH_THRESHOLD_MS = 1 * 24 * 60 * 60 * 1000;

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // 액션
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshTokenIfNeeded: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  // 앱 시작 시 저장된 토큰 로드
  initialize: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      const expiryStr = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);

      if (token && userJson) {
        const user = JSON.parse(userJson) as User;
        const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;

        // 토큰 만료 확인
        if (expiry && Date.now() > expiry) {
          console.log('Token expired, logging out');
          await get().logout();
          set({ isLoading: false });
          return;
        }

        api.setToken(token);

        // 토큰 유효성 검증
        try {
          const { valid } = await authService.verifyToken();
          if (valid) {
            set({ token, user, isAuthenticated: true, isLoading: false });

            // 토큰 갱신 필요 여부 확인
            await get().refreshTokenIfNeeded();
          } else {
            await get().logout();
          }
        } catch {
          // 네트워크 오류 시에도 로컬 토큰으로 진행 (오프라인 지원)
          set({ token, user, isAuthenticated: true, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isLoading: false });
    }
  },

  // 로그인
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      const data = await authService.login(email, password);
      const { token, user } = data;

      // 만료 시간 계산
      const expiry = Date.now() + TOKEN_EXPIRY_MS;

      // SecureStore에 저장
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, expiry.toString());

      // API 클라이언트에 토큰 설정
      api.setToken(token);

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그인 중 오류가 발생했습니다.';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  // 로그아웃
  logout: async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
      api.setToken(null);

      set({
        token: null,
        user: null,
        isAuthenticated: false,
        error: null,
        isLoading: false
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  // 토큰 갱신 (만료 임박 시)
  refreshTokenIfNeeded: async () => {
    try {
      const expiryStr = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);
      if (!expiryStr) return;

      const expiry = parseInt(expiryStr, 10);
      const timeUntilExpiry = expiry - Date.now();

      // 갱신 임계값 이하면 토큰 갱신
      if (timeUntilExpiry < TOKEN_REFRESH_THRESHOLD_MS) {
        console.log('Token refresh needed, refreshing...');

        const { token: newToken } = await authService.refreshToken();
        const newExpiry = Date.now() + TOKEN_EXPIRY_MS;

        await SecureStore.setItemAsync(TOKEN_KEY, newToken);
        await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, newExpiry.toString());

        api.setToken(newToken);
        set({ token: newToken });

        console.log('Token refreshed successfully');
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      // 갱신 실패해도 기존 토큰으로 계속 진행
    }
  },

  // 사용자 정보 업데이트
  updateUser: (userData: Partial<User>) => {
    const { user } = get();
    if (user) {
      const updatedUser = { ...user, ...userData };
      set({ user: updatedUser });
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
    }
  },

  // 에러 클리어
  clearError: () => {
    set({ error: null });
  },
}));
