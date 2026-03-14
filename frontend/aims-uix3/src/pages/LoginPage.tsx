/**
 * 로그인 페이지
 * Phase 1: 소셜 로그인 + "다음에 PIN으로 빠르게 로그인" 체크박스 (disabled)
 * Phase 2: PIN 입력 모드 (?mode=pin)
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { startKakaoLogin, startKakaoLoginSwitch, startNaverLogin, startNaverLoginSwitch, startGoogleLogin, startGoogleLoginSwitch, verifyPin, setPin, getPinStatus, processAuthToken } from '@/entities/auth/api';
import { useAuthStore } from '@/shared/stores/authStore';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider';
import { syncUserIdFromStorage, useUserStore } from '@/stores/user';
import { errorReporter } from '@/shared/lib/errorReporter';
import PinInput from '@/shared/components/PinInput';
import './LoginPage.css';

interface RememberedUser {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  authProvider: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setToken, setUser, token: authToken, logout: authLogout } = useAuthStore();
  const { updateCurrentUser } = useUserStore();
  const { isDevMode, toggleDevMode } = useDevModeStore();
  const { showAlert } = useAppleConfirm();
  const [isProcessing, setIsProcessing] = useState(false);

  // PIN 모드 상태
  const mode = searchParams.get('mode');
  const isPinMode = mode === 'pin' || mode === 'pin-setup';
  const [pinError, setPinError] = useState<string | null>(null);
  const [rememberedUser, setRememberedUser] = useState<RememberedUser | null>(null);

  // PIN 설정 플로우 상태
  const [pinSetupStep, setPinSetupStep] = useState<'check' | 'input' | 'setup-enter' | 'setup-confirm'>('check');
  const [setupPin, setSetupPin] = useState('');

  // 기억된 사용자 정보 로드 + PIN 설정 여부 확인
  useEffect(() => {
    if (!isPinMode) return;
    try {
      const stored = localStorage.getItem('aims-remembered-user');
      if (stored) setRememberedUser(JSON.parse(stored));
    } catch { /* ignore */ }

    // pin-setup 모드: 바로 설정 화면 진입 (프로필 메뉴 PIN 변경)
    if (mode === 'pin-setup') {
      setPinSetupStep('setup-enter');
      return;
    }

    // pin 모드: 서버에서 PIN 설정 여부 확인
    if (authToken) {
      getPinStatus(authToken).then(res => {
        setPinSetupStep(res.hasPin ? 'input' : 'setup-enter');
      }).catch(() => {
        setPinSetupStep('setup-enter');
      });
    } else {
      // authToken 없음 (재방문, 세션 만료) — rememberedUser가 있으면 PIN 입력 화면 표시
      // PIN 입력 시점에 소셜 로그인으로 토큰을 재획득하는 것이 아니라,
      // PIN 화면을 보여주고, 실패 시 소셜 로그인으로 전환
      const stored = localStorage.getItem('aims-remembered-user');
      if (stored) {
        setPinSetupStep('input');
      }
      // rememberedUser도 없으면 pinSetupStep='check' → 소셜 로그인 화면 표시 (정상)
    }
  }, [isPinMode, mode, authToken]);

  // 로그인 페이지 배경 — html/body/#root 배경색 통일 (다크 모드 흰색 방지)
  useEffect(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-primary').trim();
    const els = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[];
    const originals = els.map(el => el.style.background);
    els.forEach(el => { el.style.background = bg; });
    return () => {
      els.forEach((el, i) => { el.style.background = originals[i]; });
    };
  }, []);

  // 개발자 모드 단축키 핸들러
  useEffect(() => {
    if (import.meta.env.PROD) return;
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
   * OAuth 콜백 처리
   */
  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || isProcessing) return;

    // URL에서 토큰 즉시 제거 (브라우저 히스토리/Referer 노출 방지)
    setSearchParams({}, { replace: true });

    const isValidJWT = (t: string) =>
      t.length < 2000 &&
      /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(t);

    if (!isValidJWT(token)) {
      console.error('[LoginPage] 유효하지 않은 토큰 형식');
      showAlert({ title: '로그인 실패', message: '인증 토큰 형식이 올바르지 않습니다.', iconType: 'error' });
      return;
    }

    setIsProcessing(true);

    const processToken = async () => {
      try {
        // 공통 토큰 처리 (AuthCallbackPage와 동일 로직)
        await processAuthToken(token, {
          setToken, setUser, updateCurrentUser, syncUserIdFromStorage, navigate,
        });
        setIsProcessing(false);
      } catch (error) {
        console.error('[LoginPage] 토큰 처리 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'LoginPage.processToken' });
        showAlert({ title: '로그인 실패', message: '인증 토큰 처리에 실패했습니다. 다시 시도해주세요.', iconType: 'error' });
        setIsProcessing(false);
      }
    };

    processToken();
  }, [searchParams, isProcessing, setToken, setUser, navigate, showAlert]);

  /**
   * 개발 환경 전용: 로그인 건너뛰기
   */
  const handleDevLogin = async () => {
    if (import.meta.env.PROD) {
      console.error('[보안] 프로덕션 환경에서 개발 로그인 시도 차단됨');
      return;
    }

    try {
      localStorage.clear();
      const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';
      const response = await fetch(`${API_BASE_URL}/api/dev/ensure-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('개발 계정 생성/조회 실패');
      const data = await response.json();
      if (!data.success || !data.user || !data.token) throw new Error('개발 계정 정보 없음');

      const devUser = {
        _id: data.user._id, name: data.user.name, email: data.user.email,
        avatarUrl: data.user.avatarUrl, role: data.user.role,
        authProvider: 'dev', profileCompleted: true,
      };

      setToken(data.token);
      setUser(devUser);
      updateCurrentUser({
        id: devUser._id, name: devUser.name || '', email: devUser.email || '',
        role: devUser.role, avatarUrl: devUser.avatarUrl || undefined,
      });
      localStorage.setItem('aims-current-user-id', devUser._id);
      syncUserIdFromStorage();
      navigate('/', { replace: true });
    } catch (error) {
      console.error('개발용 로그인 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'LoginPage.handleDevLogin' });
      showAlert({ title: '로그인 실패', message: '개발용 로그인에 실패했습니다. 백엔드 서버를 확인해주세요.', iconType: 'error' });
    }
  };

  // PIN 모드 → 소셜 로그인 모드로 전환
  const switchToSocialLogin = useCallback(() => {
    // 완전 초기화 + 해당 소셜 로그인 switch(강제 재인증)로 바로 이동
    authLogout();
    localStorage.removeItem('aims-remember-device');
    localStorage.removeItem('aims-remembered-user');
    localStorage.removeItem('aims-current-user-id');
    setPinError(null);

    // 기억된 사용자의 소셜 로그인 provider로 바로 이동 (강제 재인증)
    const provider = rememberedUser?.authProvider;
    if (provider === 'kakao') { startKakaoLoginSwitch(); return; }
    if (provider === 'naver') { startNaverLoginSwitch(); return; }
    if (provider === 'google') { startGoogleLoginSwitch(); return; }
    // provider 없으면 소셜 로그인 페이지로
    setSearchParams({});
  }, [authLogout, setSearchParams, rememberedUser]);

  // PIN 입력 완료 핸들러 — 서버 검증
  const handlePinComplete = useCallback(async (pin: string) => {
    const { token } = useAuthStore.getState();
    if (!token) {
      // 로그아웃 후 재방문: JWT 없음 → 소셜 로그인으로 토큰 재획득 필요
      setPinError('소셜 로그인 후 이용 가능합니다');
      return;
    }

    try {
      const result = await verifyPin(token, pin);
      if (result.success && result.sessionToken) {
        sessionStorage.setItem('aims-session-token', result.sessionToken);
        // 팝업 탭에 PIN 검증 완료 전파
        try {
          const ch = new BroadcastChannel('aims-auth');
          ch.postMessage({ type: 'PIN_VERIFIED', sessionToken: result.sessionToken });
          ch.close();
        } catch { /* BroadcastChannel 미지원 */ }
        navigate('/', { replace: true });
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string; locked?: boolean } } };
      const data = axiosError?.response?.data;
      if (data?.locked) {
        // 5회 실패 잠금 → 기기 기억 해제 + 소셜 로그인으로 전환
        localStorage.removeItem('aims-remember-device');
        localStorage.removeItem('aims-remembered-user');
        setPinError(null);
        showAlert({
          title: '비밀번호 입력 잠김',
          message: '카카오/네이버/구글 로그인 후 다시 설정할 수 있습니다.',
          iconType: 'error'
        });
        switchToSocialLogin();
        return;
      }
      setPinError(data?.message || '비밀번호가 올바르지 않습니다');
    }
  }, [navigate, showAlert, switchToSocialLogin]);

  // PIN 설정: 첫 번째 입력 완료
  const handleSetupEnter = useCallback((pin: string) => {
    setSetupPin(pin);
    setPinSetupStep('setup-confirm');
    setPinError(null);
  }, []);

  // PIN 설정: 확인 입력 완료
  const handleSetupConfirm = useCallback(async (confirmPin: string) => {
    if (confirmPin !== setupPin) {
      setPinError('비밀번호가 일치하지 않습니다');
      setPinSetupStep('setup-enter');
      setSetupPin('');
      return;
    }

    const { token } = useAuthStore.getState();
    if (!token) {
      switchToSocialLogin();
      return;
    }

    try {
      const result = await setPin(token, setupPin);
      if (result.success) {
        // PIN 설정 완료 → PIN 검증으로 전환 (바로 입력 가능)
        const verifyResult = await verifyPin(token, setupPin);
        if (verifyResult.success && verifyResult.sessionToken) {
          sessionStorage.setItem('aims-session-token', verifyResult.sessionToken);
          try {
            const ch = new BroadcastChannel('aims-auth');
            ch.postMessage({ type: 'PIN_VERIFIED', sessionToken: verifyResult.sessionToken });
            ch.close();
          } catch { /* BroadcastChannel 미지원 */ }
          navigate('/', { replace: true });
        }
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      setPinError(axiosError?.response?.data?.message || '비밀번호 설정에 실패했습니다');
      setPinSetupStep('setup-enter');
      setSetupPin('');
    }
  }, [setupPin, navigate, switchToSocialLogin]);

  // PIN 설정은 필수 — "나중에 설정하기" 제거됨

  // 토큰 처리 중
  if (isProcessing) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header"><p>로그인 처리 중...</p></div>
        </div>
      </div>
    );
  }

  // PIN 모드
  if (isPinMode && rememberedUser && pinSetupStep !== 'check') {
    // PIN 설정 화면 (setup-enter / setup-confirm)
    if (pinSetupStep === 'setup-enter' || pinSetupStep === 'setup-confirm') {
      return (
        <div className="login-page">
          <div className="login-container">
            <div className="login-pin-container">
              <p className="login-pin-name">
                {pinSetupStep === 'setup-enter'
                  ? '간편 비밀번호를 설정하세요'
                  : '한번 더 입력하세요'}
              </p>
              <p className="login-pin-message">
                {pinSetupStep === 'setup-enter'
                  ? '다음 방문 시 빠르게 로그인할 수 있습니다'
                  : '확인을 위해 한번 더 입력해주세요'}
              </p>

              <PinInput
                key={pinSetupStep}
                onComplete={pinSetupStep === 'setup-enter' ? handleSetupEnter : handleSetupConfirm}
                error={pinError}
              />

              <p className="login-pin-error">{pinError || '\u00A0'}</p>

            </div>
          </div>
        </div>
      );
    }

    // PIN 입력 화면 (기존 PIN 검증)
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-pin-container">
            <div className="login-pin-avatar">
              {rememberedUser.avatarUrl
                ? <img src={rememberedUser.avatarUrl} alt={rememberedUser.name} />
                : <span>{rememberedUser.name.charAt(0)}</span>
              }
            </div>
            <p className="login-pin-name">{rememberedUser.name} 님</p>
            <p className="login-pin-message">간편 비밀번호를 입력하세요</p>

            <PinInput
              onComplete={handlePinComplete}
              error={pinError}
            />

            <p className="login-pin-error">{pinError || '\u00A0'}</p>

            <button type="button" className="login-pin-switch" onClick={switchToSocialLogin}>
              다른 계정으로 로그인
            </button>
            <button
              type="button"
              className="login-pin-switch"
              onClick={() => showAlert({
                title: '비밀번호 재설정',
                message: '카카오/네이버/구글 로그인 후 새로 만들 수 있습니다.',
                iconType: 'info'
              })}
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 소셜 로그인 모드 (기본)
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/assets/logo/aims-logo-full-light.svg" alt="AIMS" className="login-logo-full" />
          <p>보험 설계사를 위한 AI-Powered 업무 플랫폼</p>
        </div>

        <div className="login-content">
          {/* 소셜 로그인 버튼 그룹 */}
          <div className="social-login-buttons">
            <button type="button" className="social-login-button kakao-login-button" onClick={startKakaoLogin} aria-label="카카오 로그인">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M9 0C4.029 0 0 3.285 0 7.333c0 2.627 1.727 4.929 4.318 6.209-.178.656-.657 2.432-.748 2.828 0 0-.055.44.23.606.285.166.625.024.625.024 1.023-.131 4.715-3.083 5.471-3.585.368.048.743.074 1.125.074 4.971 0 9-3.285 9-7.333S13.971 0 9 0z" fill="#371D1E" />
              </svg>
              <span>카카오 로그인</span>
            </button>

            <button type="button" className="social-login-button naver-login-button" onClick={startNaverLogin} aria-label="네이버 로그인">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M12.1875 9.5625L5.4375 0H0V18H5.8125V8.4375L12.5625 18H18V0H12.1875V9.5625Z" fill="#FFFFFF" />
              </svg>
              <span>네이버 로그인</span>
            </button>

            <button type="button" className="social-login-button google-login-button" onClick={startGoogleLogin} aria-label="구글 로그인">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
              <span>구글 로그인</span>
            </button>
          </div>

          {/* 다른 계정으로 로그인 섹션 */}
          <div className="switch-account-section">
            <button type="button" className="switch-account-button" onClick={startKakaoLoginSwitch} aria-label="다른 카카오 계정으로 로그인">다른 카카오 계정</button>
            <span className="switch-account-divider">|</span>
            <button type="button" className="switch-account-button" onClick={startNaverLoginSwitch} aria-label="다른 네이버 계정으로 로그인">다른 네이버 계정</button>
            <span className="switch-account-divider">|</span>
            <button type="button" className="switch-account-button" onClick={startGoogleLoginSwitch} aria-label="다른 구글 계정으로 로그인">다른 구글 계정</button>
          </div>

          {/* 개발자 모드 전용 */}
          {!import.meta.env.PROD && isDevMode && (
            <button type="button" className="social-login-button dev-login-button" onClick={handleDevLogin} aria-label="개발용 로그인 건너뛰기">
              <span className="dev-icon">🔧</span>
              <span>개발용 로그인 건너뛰기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
