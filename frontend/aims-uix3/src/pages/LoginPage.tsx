/**
 * 로그인 페이지
 */

import { useNavigate } from 'react-router-dom';
import { startKakaoLogin, startKakaoLoginSwitch } from '@/entities/auth/api';
import { useAuthStore } from '@/shared/stores/authStore';
import { syncUserIdFromStorage } from '@/stores/user';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  /**
   * 개발 환경 전용: 로그인 건너뛰기
   * - 백엔드에 dev-user 계정 자동 생성/조회
   * - 카카오 OAuth 없이 바로 메인 페이지로 진입
   */
  const handleDevLogin = async () => {
    try {
      // 1. localStorage 완전히 클리어 (이전 세션 정보 제거)
      localStorage.clear();

      // 2. 백엔드에 개발 전용 계정 생성/조회 요청
      const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';
      const response = await fetch(`${API_BASE_URL}/api/dev/ensure-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('개발 계정 생성/조회 실패');
      }

      const data = await response.json();

      if (!data.success || !data.user || !data.token) {
        throw new Error('개발 계정 정보 없음');
      }

      // 3. 백엔드에서 발급한 실제 JWT 토큰과 사용자 정보 사용
      const devUser = {
        _id: data.user._id,
        name: data.user.name,
        email: data.user.email,
        avatarUrl: data.user.avatarUrl,
        role: data.user.role,
        authProvider: 'dev',
        profileCompleted: true,
      };

      // 4. Zustand store에 저장 (실제 JWT 토큰 사용)
      setToken(data.token);
      setUser(devUser);

      // 5. 레거시 API용 사용자 ID 저장
      localStorage.setItem('aims-current-user-id', devUser._id);
      syncUserIdFromStorage();

      // 6. 메인 페이지로 이동
      navigate('/', { replace: true });
    } catch (error) {
      console.error('개발용 로그인 실패:', error);
      alert('개발용 로그인에 실패했습니다. 백엔드 서버를 확인해주세요.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>AIMS</h1>
          <p>보험 문서 관리 시스템</p>
        </div>

        <div className="login-content">
          {/* 기존 계정으로 빠른 로그인 */}
          <button
            type="button"
            className="kakao-login-button"
            onClick={startKakaoLogin}
            aria-label="카카오 로그인"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9 0C4.029 0 0 3.285 0 7.333c0 2.627 1.727 4.929 4.318 6.209-.178.656-.657 2.432-.748 2.828 0 0-.055.44.23.606.285.166.625.024.625.024 1.023-.131 4.715-3.083 5.471-3.585.368.048.743.074 1.125.074 4.971 0 9-3.285 9-7.333S13.971 0 9 0z"
                fill="#371D1E"
              />
            </svg>
            <span>카카오 로그인</span>
          </button>

          {/* 다른 계정으로 로그인 */}
          <button
            type="button"
            className="kakao-login-button kakao-login-button--secondary"
            onClick={startKakaoLoginSwitch}
            aria-label="다른 계정으로 로그인"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9 0C4.029 0 0 3.285 0 7.333c0 2.627 1.727 4.929 4.318 6.209-.178.656-.657 2.432-.748 2.828 0 0-.055.44.23.606.285.166.625.024.625.024 1.023-.131 4.715-3.083 5.471-3.585.368.048.743.074 1.125.074 4.971 0 9-3.285 9-7.333S13.971 0 9 0z"
                fill="#371D1E"
              />
            </svg>
            <span>다른 계정으로 로그인</span>
          </button>

          {/* 개발 환경 전용: 로그인 건너뛰기 */}
          {import.meta.env.DEV && (
            <button
              type="button"
              className="kakao-login-button dev-login-button"
              onClick={handleDevLogin}
              aria-label="개발용 로그인 건너뛰기"
            >
              <span className="dev-icon">🔧</span>
              <span>개발용 로그인 건너뛰기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
