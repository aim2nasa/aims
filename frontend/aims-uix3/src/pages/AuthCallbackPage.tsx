/**
 * 인증 콜백 페이지 (카카오 로그인 후 리다이렉트)
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { processAuthToken } from '@/entities/auth/api';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
import { errorReporter } from '@/shared/lib/errorReporter';
import './AuthCallbackPage.css';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const { setToken, setUser, setLoading } = useAuthStore();
  const { updateCurrentUser } = useUserStore();

  useEffect(() => {
    const handleCallback = async () => {
      setLoading(true);

      try {
        const token = searchParams.get('token');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          throw new Error(
            errorParam === 'kakao_auth_failed'
              ? '카카오 로그인에 실패했습니다'
              : errorParam === 'naver_auth_failed'
                ? '네이버 로그인에 실패했습니다'
                : errorParam === 'google_auth_failed'
                  ? '구글 로그인에 실패했습니다'
                  : '인증에 실패했습니다'
          );
        }

        if (!token) {
          throw new Error('토큰을 받지 못했습니다');
        }

        // 공통 토큰 처리 (LoginPage와 동일 로직)
        await processAuthToken(token, {
          setToken, setUser, updateCurrentUser, syncUserIdFromStorage, navigate,
        });
      } catch (err) {
        console.error('인증 콜백 처리 오류:', err);
        errorReporter.reportApiError(err as Error, { component: 'AuthCallbackPage.handleCallback' });
        setError(err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다');

        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate, setToken, setUser, setLoading, updateCurrentUser]);

  if (error) {
    return (
      <div className="auth-callback-page">
        <div className="auth-callback-container">
          <div className="error-icon">⚠️</div>
          <h2>{error}</h2>
          <p>잠시 후 로그인 페이지로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-callback-page">
      <div className="auth-callback-container">
        <div className="loading-spinner" />
        <h2>로그인 처리 중...</h2>
        <p>잠시만 기다려주세요</p>
      </div>
    </div>
  );
}
