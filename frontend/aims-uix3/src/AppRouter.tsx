/**
 * 앱 라우터 - 인증 라우팅 처리
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import LoginPage from '@/pages/LoginPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import App from './App';

export default function AppRouter() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* 공개 라우트 */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* 보호된 라우트 (인증 필요) */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
