/**
 * 앱 라우터 - 인증 라우팅 처리
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import LoginPage from '@/pages/LoginPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import ProfileSetupModal from '@/shared/components/ProfileSetupModal';
import App from './App';

// AI 어시스턴트 팝업 페이지 (lazy loading)
const AIAssistantPage = lazy(() => import('@/pages/AIAssistantPage'));
// Annual Report 팝업 페이지 (lazy loading)
const AnnualReportPage = lazy(() => import('@/pages/AnnualReportPage'));
// Customer Review 팝업 페이지 (lazy loading)
const CustomerReviewPage = lazy(() => import('@/pages/CustomerReviewPage'));

export default function AppRouter() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [showProfileSetup, setShowProfileSetup] = useState(false);

  // PIN 모드이면 인증 상태와 관계없이 LoginPage 표시
  const isPinMode = searchParams.get('mode') === 'pin';

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

  // 프로필 설정 취소 핸들러 (로그아웃 후 로그인 페이지로)
  const handleProfileCancel = () => {
    setShowProfileSetup(false);
    logout();
    // navigate() 대신 강제 새로고침으로 확실한 로그아웃 처리
    // (Zustand 상태 변경이 비동기로 처리되어 navigate가 먼저 실행될 수 있음)
    window.location.href = '/login';
  };

  return (
    <>
      <Routes>
        {/* 공개 라우트 */}
        <Route
          path="/login"
          element={
            (isAuthenticated && !isPinMode && !(localStorage.getItem('aims-remember-device') === 'true' && !sessionStorage.getItem('aims-session-token')))
              ? <Navigate to="/" replace />
              : <LoginPage />
          }
        />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* AI 어시스턴트 팝업 전용 라우트 (메인 앱 레이아웃 없이 독립 렌더링) */}
        <Route
          path="/ai-assistant"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <AIAssistantPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Annual Report 팝업 전용 라우트 (메인 앱 레이아웃 없이 독립 렌더링) */}
        <Route
          path="/annual-report"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <AnnualReportPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Customer Review 팝업 전용 라우트 (메인 앱 레이아웃 없이 독립 렌더링) */}
        <Route
          path="/customer-review"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <CustomerReviewPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

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
        onCancel={handleProfileCancel}
      />
    </>
  );
}
