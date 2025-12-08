import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { useAuthStore } from '@/shared/store/authStore';
import type { User } from '@/features/auth/types';
import './LoginPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    // URL에서 token 추출 (카카오 콜백 후)
    const token = searchParams.get('token');

    if (token) {
      try {
        // JWT에서 사용자 정보 추출
        const decoded = jwtDecode<User>(token);
        setAuth(token, decoded);

        // 관리자 권한 확인
        if (decoded.role === 'admin') {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/unauthorized', { replace: true });
        }
      } catch (error) {
        console.error('토큰 디코딩 실패:', error);
      }
    }
  }, [searchParams, setAuth, navigate]);

  const handleKakaoLogin = () => {
    // aims-uix3와 동일한 카카오 로그인 사용
    const redirectOrigin = encodeURIComponent(window.location.origin);
    window.location.href = `${API_BASE_URL}/api/auth/kakao?redirect=${redirectOrigin}`;
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__logo">
          <h1>AIMS Admin</h1>
          <p>관리자 전용 대시보드</p>
        </div>
        <button className="login-card__button" onClick={handleKakaoLogin}>
          카카오 로그인
        </button>
        <p className="login-card__note">
          관리자 권한이 있는 계정만 접근 가능합니다
        </p>
      </div>
    </div>
  );
};
