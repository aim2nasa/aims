import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { useAuthStore } from '@/shared/store/authStore';
import type { User } from '@/features/auth/types';
import './LoginPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdminLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '로그인에 실패했습니다');
      }

      // JWT에서 사용자 정보 추출
      const decoded = jwtDecode<User>(data.token);
      setAuth(data.token, decoded);

      // 관리자 권한 확인
      if (decoded.role === 'admin') {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/unauthorized', { replace: true });
      }
    } catch (err) {
      console.error('Admin 로그인 실패:', err);
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__logo">
          <h1>AIMS Admin</h1>
          <p>관리자 전용 대시보드</p>
        </div>
        {error && <p className="login-card__error">{error}</p>}
        <button
          className="login-card__button login-card__button--admin"
          onClick={handleAdminLogin}
          disabled={isLoading}
        >
          {isLoading ? '로그인 중...' : '관리자 로그인'}
        </button>
        <p className="login-card__note">
          시스템 관리자 전용
        </p>
      </div>
    </div>
  );
};
