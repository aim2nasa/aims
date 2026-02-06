/**
 * 로그인 페이지
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startKakaoLogin, startKakaoLoginSwitch, startNaverLogin, startNaverLoginSwitch, startGoogleLogin, startGoogleLoginSwitch } from '@/entities/auth/api';
import { useAuthStore } from '@/shared/stores/authStore';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
import { errorReporter } from '@/shared/lib/errorReporter';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setToken, setUser } = useAuthStore();
  const { updateCurrentUser } = useUserStore();
  const { isDevMode, toggleDevMode } = useDevModeStore();
  const { showAlert } = useAppleConfirm();
  const [isProcessing, setIsProcessing] = useState(false);

  // 개발자 모드 단축키 핸들러 (Ctrl+Alt+Shift+D)
  // 🔒 보안: 프로덕션 환경에서는 개발자 모드 비활성화
  useEffect(() => {
    if (import.meta.env.PROD) {
      return; // 프로덕션에서는 개발자 모드 단축키 비활성화
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyE') {
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
   * 🔒 보안: JWT 토큰 형식 검증 추가
   */
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || isProcessing) return;

    // 🔒 보안: JWT 토큰 기본 형식 검증
    // JWT는 3개의 Base64URL 인코딩된 부분으로 구성 (header.payload.signature)
    const isValidJWT = (t: string) =>
      t.length < 2000 && // 최대 길이 제한
      /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(t);

    if (!isValidJWT(token)) {
      console.error('[LoginPage] 유효하지 않은 토큰 형식');
      showAlert({
        title: '로그인 실패',
        message: '인증 토큰 형식이 올바르지 않습니다.',
        iconType: 'error'
      });
      return;
    }

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
          oauthProfile: data.user.oauthProfile || null,
        };

        // 3. Zustand store에 사용자 정보 저장
        setUser(user);

        // 4. useUserStore에 사용자 정보 동기화 (AccountSettings 등에서 즉시 사용)
        updateCurrentUser({
          id: user._id,
          name: user.name || '',
          email: user.email || '',
          role: user.role,
          avatarUrl: user.avatarUrl || undefined,
        });

        // 5. 레거시 API용 사용자 ID 저장
        localStorage.setItem('aims-current-user-id', user._id);
        syncUserIdFromStorage();

        console.log(`[LoginPage] ${user.authProvider} 로그인 성공:`, user.name);

        // 5. 메인 페이지로 이동 (URL 파라미터 제거)
        navigate('/', { replace: true });
      } catch (error) {
        console.error('[LoginPage] 토큰 처리 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'LoginPage.processToken' });
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
   * 🔒 보안: 프로덕션 환경에서는 호출 불가
   */
  const handleDevLogin = async () => {
    // 🔒 보안: 프로덕션 환경에서 개발 로그인 차단
    if (import.meta.env.PROD) {
      console.error('[보안] 프로덕션 환경에서 개발 로그인 시도 차단됨');
      return;
    }

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

      // 5. useUserStore에 사용자 정보 동기화 (AccountSettings 등에서 즉시 사용)
      updateCurrentUser({
        id: devUser._id,
        name: devUser.name || '',
        email: devUser.email || '',
        role: devUser.role,
        avatarUrl: devUser.avatarUrl || undefined,
      });

      // 6. 레거시 API용 사용자 ID 저장
      localStorage.setItem('aims-current-user-id', devUser._id);
      syncUserIdFromStorage();

      // 7. 메인 페이지로 이동
      navigate('/', { replace: true });
    } catch (error) {
      console.error('개발용 로그인 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'LoginPage.handleDevLogin' });
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
          <p>보험 문서 AI 플랫폼</p>
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

            {/* 구글 로그인 */}
            <button
              type="button"
              className="social-login-button google-login-button"
              onClick={startGoogleLogin}
              aria-label="구글 로그인"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              <span>구글 로그인</span>
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
            <span className="switch-account-divider">|</span>
            <button
              type="button"
              className="switch-account-button"
              onClick={startGoogleLoginSwitch}
              aria-label="다른 구글 계정으로 로그인"
            >
              다른 구글 계정
            </button>
          </div>

          {/* 개발자 모드 전용: 로그인 건너뛰기 (Ctrl+Alt+Shift+D로 활성화) */}
          {/* 🔒 보안: 프로덕션 환경에서는 개발 모드 UI 숨김 */}
          {!import.meta.env.PROD && isDevMode && (
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
