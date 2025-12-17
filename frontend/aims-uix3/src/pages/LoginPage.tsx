/**
 * 로그인 페이지
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startKakaoLogin, startKakaoLoginSwitch, startNaverLogin, startNaverLoginSwitch } from '@/entities/auth/api';
import { useAuthStore } from '@/shared/stores/authStore';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import { syncUserIdFromStorage } from '@/stores/user';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setToken, setUser } = useAuthStore();
  const { isDevMode, toggleDevMode } = useDevModeStore();
  const { showAlert } = useAppleConfirm();
  const [isProcessing, setIsProcessing] = useState(false);

  // 개발자 모드 단축키 핸들러 (Ctrl+Alt+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDevMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDevMode]);

  /**
   * OAuth 콜백 처리: URL에서 token 파라미터 추출 및 저장
   * - 토큰 저장 후 /api/auth/me 호출하여 정확한 사용자 정보 가져오기
   */
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || isProcessing) return;

    setIsProcessing(true);

    const processToken = async () => {
      try {
        // 1. 먼저 토큰 저장
        setToken(token);

        // 2. /api/auth/me API 호출하여 정확한 사용자 정보 가져오기
        // (JWT atob 디코딩은 UTF-8 한글이 깨지므로 API 사용)
        const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('사용자 정보 조회 실패');
        }

        const data = await response.json();
        if (!data.success || !data.user) {
          throw new Error('사용자 정보 없음');
        }

        const user = {
          _id: data.user._id,
          name: data.user.name,
          email: data.user.email,
          avatarUrl: data.user.avatarUrl || null,
          role: data.user.role,
          authProvider: data.user.authProvider || 'kakao',
          profileCompleted: data.user.profileCompleted ?? true,
        };

        // 3. Zustand store에 사용자 정보 저장
        setUser(user);

        // 4. 레거시 API용 사용자 ID 저장
        localStorage.setItem('aims-current-user-id', user._id);
        syncUserIdFromStorage();

        console.log(`[LoginPage] ${user.authProvider} 로그인 성공:`, user.name);

        // 5. 메인 페이지로 이동 (URL 파라미터 제거)
        navigate('/', { replace: true });
      } catch (error) {
        console.error('[LoginPage] 토큰 처리 실패:', error);
        showAlert({
          title: '로그인 실패',
          message: '인증 토큰 처리에 실패했습니다. 다시 시도해주세요.',
          iconType: 'error'
        });
        setIsProcessing(false);
      }
    };

    processToken();
  }, [searchParams, isProcessing, setToken, setUser, navigate, showAlert]);

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
      showAlert({
        title: '로그인 실패',
        message: '개발용 로그인에 실패했습니다. 백엔드 서버를 확인해주세요.',
        iconType: 'error'
      });
    }
  };

  // 토큰 처리 중일 때 로딩 표시
  if (isProcessing) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <h1>AIMS</h1>
            <p>로그인 처리 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>AIMS</h1>
          <p>보험 문서 관리 시스템</p>
        </div>

        <div className="login-content">
          {/* 소셜 로그인 버튼 그룹 */}
          <div className="social-login-buttons">
            {/* 카카오 로그인 */}
            <button
              type="button"
              className="social-login-button kakao-login-button"
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

            {/* 네이버 로그인 */}
            <button
              type="button"
              className="social-login-button naver-login-button"
              onClick={startNaverLogin}
              aria-label="네이버 로그인"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M12.1875 9.5625L5.4375 0H0V18H5.8125V8.4375L12.5625 18H18V0H12.1875V9.5625Z"
                  fill="#FFFFFF"
                />
              </svg>
              <span>네이버 로그인</span>
            </button>
          </div>

          {/* 다른 계정으로 로그인 섹션 */}
          <div className="switch-account-section">
            <button
              type="button"
              className="switch-account-button"
              onClick={startKakaoLoginSwitch}
              aria-label="다른 카카오 계정으로 로그인"
            >
              다른 카카오 계정
            </button>
            <span className="switch-account-divider">|</span>
            <button
              type="button"
              className="switch-account-button"
              onClick={startNaverLoginSwitch}
              aria-label="다른 네이버 계정으로 로그인"
            >
              다른 네이버 계정
            </button>
          </div>

          {/* 개발자 모드 전용: 로그인 건너뛰기 (Ctrl+Alt+Shift+D로 활성화) */}
          {isDevMode && (
            <button
              type="button"
              className="social-login-button dev-login-button"
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
