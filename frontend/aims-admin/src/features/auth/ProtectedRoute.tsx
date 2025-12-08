import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const { token, isAdmin } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
