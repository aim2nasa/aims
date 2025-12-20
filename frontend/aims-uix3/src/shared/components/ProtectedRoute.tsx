/**
 * 인증이 필요한 라우트 보호 컴포넌트
 * - 토큰이 있으면 자동으로 사용자 정보를 서버에서 가져옴
 */

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { getCurrentUser } from '@/entities/auth/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, setUser, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      // 토큰이 있지만 사용자 정보가 없으면 서버에서 가져옴
      if (token && !user) {
        try {
          const userData = await getCurrentUser(token);
          setUser(userData);
        } catch (error) {
          console.error('Failed to fetch user:', error);
          logout();
        }
      }
      setIsLoading(false);
    };

    fetchUser();
  }, [token, user, setUser, logout]);

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

  return <>{children}</>;
}
