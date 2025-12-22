import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, API_BASE_URL } from '../services/api';
import { User, AuthResponse } from '../types';

const TOKEN_KEY = 'aims_auth_token';
const USER_KEY = 'aims_user_data';

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

      if (token && userJson) {
        const user = JSON.parse(userJson) as User;
        api.setToken(token);

        // 토큰 유효성 검증 (선택적)
        try {
          await api.get('/api/auth/me');
          set({ token, user, isAuthenticated: true, isLoading: false });
        } catch {
          // 토큰 만료 - 로그아웃 처리
          await get().logout();
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
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json() as AuthResponse;

      if (!response.ok || !data.success) {
        set({
          error: data.message || '로그인에 실패했습니다.',
          isLoading: false
        });
        return false;
      }

      const { token, user } = data;

      // SecureStore에 저장
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

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
      api.setToken(null);

      set({
        token: null,
        user: null,
        isAuthenticated: false,
        error: null
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  // 에러 클리어
  clearError: () => {
    set({ error: null });
  },
}));
