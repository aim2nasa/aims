/**
 * 인증이 필요한 라우트 보호 컴포넌트
 * - 토큰이 있으면 자동으로 사용자 정보를 서버에서 가져옴
 * - 기기 기억 O + 세션 토큰 없음 → PIN 입력 페이지로 리다이렉트
 */

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { getCurrentUser } from '@/entities/auth/api';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
import { errorReporter } from '@/shared/lib/errorReporter';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, setUser, logout } = useAuthStore();
  const { updateCurrentUser } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);

  // 기기 기억 + 세션 토큰 확인
  const rememberDevice = localStorage.getItem('aims-remember-device') === 'true';
  const sessionToken = sessionStorage.getItem('aims-session-token');

  useEffect(() => {
    const fetchUser = async () => {
      if (token && !user) {
        try {
          const userData = await getCurrentUser(token);
          setUser(userData);
          // useUserStore 동기화
          updateCurrentUser({
            id: userData._id,
            name: userData.name || '',
            email: userData.email || '',
            role: userData.role,
            avatarUrl: userData.avatarUrl || undefined,
          });
          localStorage.setItem('aims-current-user-id', userData._id);
          syncUserIdFromStorage();
        } catch (error) {
          console.error('Failed to fetch user:', error);
          errorReporter.reportApiError(error as Error, { component: 'ProtectedRoute.fetchUser' });
          logout();
        }
      }
      setIsLoading(false);
    };

    fetchUser();
  }, [token, user, setUser, updateCurrentUser, logout]);

  // 로딩 중
  if (isLoading && token && !user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        로딩 중...
      </div>
    );
  }

  // 토큰이 없으면 로그인 페이지로
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 기기 기억 O + 세션 토큰 없음 → PIN 입력 페이지
  if (rememberDevice && !sessionToken) {
    return <Navigate to="/login?mode=pin" replace />;
  }

  return <>{children}</>;
}
