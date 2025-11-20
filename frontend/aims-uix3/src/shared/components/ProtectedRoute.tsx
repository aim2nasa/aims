/**
 * 인증이 필요한 라우트 보호 컴포넌트
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    // 인증되지 않은 경우 로그인 페이지로 리다이렉트
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
