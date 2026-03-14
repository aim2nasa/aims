/**
 * 인증이 필요한 라우트 보호 컴포넌트
 * - 토큰이 있으면 자동으로 사용자 정보를 서버에서 가져옴
 * - 기기 기억 O + 세션 토큰 없거나 무효 → PIN 입력 페이지로 리다이렉트
 */

import { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { getCurrentUser } from '@/entities/auth/api';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
import { errorReporter } from '@/shared/lib/errorReporter';
import axios from 'axios';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, setUser, logout } = useAuthStore();
  const { updateCurrentUser } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const sessionVerifiedRef = useRef(false);

  // BroadcastChannel로 PIN_VERIFIED 수신 (팝업 탭에서 세션 토큰 공유)
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('aims-auth');
      ch.onmessage = (e) => {
        if (e.data?.type === 'PIN_VERIFIED' && e.data.sessionToken) {
          sessionStorage.setItem('aims-session-token', e.data.sessionToken);
          setSessionValid(true);
        }
      };
    } catch { /* BroadcastChannel 미지원 */ }
    return () => { ch?.close(); };
  }, []);

  // 기기 기억 + 세션 토큰 확인
  const rememberDevice = localStorage.getItem('aims-remember-device') === 'true';
  const sessionToken = sessionStorage.getItem('aims-session-token');

  // Idle Timeout: PC 30분, 모바일 10분 미사용 시 세션 토큰 삭제 → PIN 재입력
  useEffect(() => {
    if (!rememberDevice || !sessionToken) return;
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    const IDLE_MS = isMobile ? 10 * 60_000 : 30 * 60_000;
    let lastActivity = Date.now();

    const resetTimer = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_MS) {
        sessionStorage.removeItem('aims-session-token');
        setSessionValid(false);
      }
    }, 60_000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
      clearInterval(interval);
    };
  }, [rememberDevice, sessionToken]);

  useEffect(() => {
    const init = async () => {
      // 사용자 정보 로드
      if (token && !user) {
        try {
          const userData = await getCurrentUser(token);
          setUser(userData);
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
          setIsLoading(false);
          return;
        }
      }

      // 세션 토큰 서버 검증 (기기 기억 시, 마운트 1회만)
      if (rememberDevice && sessionToken && token && !sessionVerifiedRef.current) {
        sessionVerifiedRef.current = true;
        try {
          const res = await axios.post(`${API_BASE_URL}/api/auth/verify-session`, { sessionToken }, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setSessionValid(res.data.valid === true);
          if (!res.data.valid) {
            sessionStorage.removeItem('aims-session-token');
          }
        } catch {
          setSessionValid(false);
          sessionStorage.removeItem('aims-session-token');
        }
      } else if (!rememberDevice || !sessionToken) {
        setSessionValid(null); // 기기 기억 안 함 → 검증 불필요
      }

      setIsLoading(false);
    };

    init();
  }, [token, user, setUser, updateCurrentUser, logout, rememberDevice, sessionToken]);

  // 로딩 중
  if (isLoading && token && !user) {
    return (
      <div className="protected-route-loading">로딩 중...</div>
    );
  }

  // 토큰 없음 → 소셜 로그인 (로그아웃 또는 미인증)
  // JWT가 없으면 PIN 검증 불가능하므로 소셜 로그인부터 시작
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 토큰 있음 + 기기 기억 O + (세션 토큰 없음 또는 서버 검증 실패) → PIN
  if (rememberDevice && (!sessionToken || sessionValid === false)) {
    return <Navigate to="/login?mode=pin" replace />;
  }

  return <>{children}</>;
}
