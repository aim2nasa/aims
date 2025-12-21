/**
 * 인증 콜백 페이지 (카카오 로그인 후 리다이렉트)
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { getCurrentUser } from '@/entities/auth/api';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
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
        // URL에서 토큰 추출
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

        // 토큰 저장
        setToken(token);

        // 사용자 정보 조회
        const user = await getCurrentUser(token);
        setUser(user);

        // useUserStore에 사용자 정보 동기화 (AccountSettings 등에서 즉시 사용)
        updateCurrentUser({
          id: user._id,
          name: user.name || '',
          email: user.email || '',
          role: user.role,
          avatarUrl: user.avatarUrl || undefined,
        });

        // 레거시 API용 사용자 ID 저장 및 동기화
        localStorage.setItem('aims-current-user-id', user._id);
        syncUserIdFromStorage();

        // 메인 페이지로 리다이렉트
        navigate('/', { replace: true });
      } catch (err) {
        console.error('인증 콜백 처리 오류:', err);
        setError(err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다');

        // 3초 후 로그인 페이지로 리다이렉트
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
