import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/features/auth/types';

interface AuthState {
  token: string | null;
  user: User | null;
  isAdmin: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAdmin: false,
      setAuth: (token: string, user: User) => {
        localStorage.setItem('aims-admin-token', token);
        set({
          token,
          user,
          isAdmin: user.role === 'admin',
        });
      },
      logout: () => {
        localStorage.removeItem('aims-admin-token');
        set({
          token: null,
          user: null,
          isAdmin: false,
        });
      },
    }),
    {
      name: 'aims-admin-auth',
    }
  )
);
