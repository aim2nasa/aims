/**
 * 앱 라우터 - 인증 라우팅 처리
 */

import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import LoginPage from '@/pages/LoginPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import ProfileSetupModal from '@/shared/components/ProfileSetupModal';
import App from './App';

export default function AppRouter() {
  const { isAuthenticated, user } = useAuthStore();
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  // 로그인 후 profileCompleted 체크
  useEffect(() => {
    if (isAuthenticated && user && user.profileCompleted === false) {
      setShowProfileSetup(true);
    }
  }, [isAuthenticated, user]);

  // 프로필 설정 완료 핸들러
  const handleProfileComplete = () => {
    setShowProfileSetup(false);
  };

  return (
    <>
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

      {/* 프로필 설정 모달 (profileCompleted: false일 때 표시) */}
      <ProfileSetupModal
        isOpen={showProfileSetup}
        onComplete={handleProfileComplete}
      />
    </>
  );
}
