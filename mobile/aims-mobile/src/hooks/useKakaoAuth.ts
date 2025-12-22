import { useState, useCallback, useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { api, API_BASE_URL } from '../services/api';
import { User } from '../types';

const TOKEN_KEY = 'aims_auth_token';
const USER_KEY = 'aims_user_data';
const TOKEN_EXPIRY_KEY = 'aims_token_expiry';

// 토큰 만료 시간 (7일, 밀리초)
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

interface UseKakaoAuthReturn {
  isLoading: boolean;
  error: string | null;
  login: () => Promise<boolean>;
  clearError: () => void;
}

// WebBrowser warm up for better performance
WebBrowser.maybeCompleteAuthSession();

export function useKakaoAuth(onSuccess: (token: string, user: User) => void): UseKakaoAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 딥링크 리스너 설정
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const { url } = event;

      // aims-mobile:// 스킴으로 시작하는 URL 처리
      if (url.startsWith('aims-mobile://')) {
        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        const errorMatch = url.match(/[?&]error=([^&]+)/);

        if (errorMatch) {
          setError(decodeURIComponent(errorMatch[1]));
          setIsLoading(false);
          return;
        }

        if (tokenMatch) {
          const token = tokenMatch[1];

          try {
            // API 클라이언트에 토큰 설정
            api.setToken(token);

            // 사용자 정보 가져오기
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
              throw new Error(data.message || '사용자 정보를 가져올 수 없습니다.');
            }

            const user = data.user as User;

            // 만료 시간 계산
            const expiry = Date.now() + TOKEN_EXPIRY_MS;

            // SecureStore에 저장
            await SecureStore.setItemAsync(TOKEN_KEY, token);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
            await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, expiry.toString());

            setIsLoading(false);
            onSuccess(token, user);
          } catch (err) {
            const message = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.';
            setError(message);
            setIsLoading(false);
          }
        }
      }
    };

    // 딥링크 리스너 등록
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // 앱이 딥링크로 열린 경우 초기 URL 처리
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onSuccess]);

  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 리다이렉트 URL (딥링크 스킴)
      const redirectUrl = 'aims-mobile://';

      // 카카오 로그인 URL 생성
      const authUrl = `${API_BASE_URL}/api/auth/kakao?redirect=${encodeURIComponent(redirectUrl)}`;

      // 브라우저 열기
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        redirectUrl,
        {
          showInRecents: true,
          preferEphemeralSession: false, // 세션 유지 (기존 카카오 로그인 상태 사용)
        }
      );

      console.log('[KakaoAuth] Result:', JSON.stringify(result));

      if (result.type === 'cancel' || result.type === 'dismiss') {
        setIsLoading(false);
        return false;
      }

      // 성공 시 URL에서 토큰 추출
      if (result.type === 'success' && result.url) {
        const url = result.url;
        console.log('[KakaoAuth] Redirect URL:', url);

        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        const errorMatch = url.match(/[?&]error=([^&]+)/);

        if (errorMatch) {
          setError(decodeURIComponent(errorMatch[1]));
          setIsLoading(false);
          return false;
        }

        if (tokenMatch) {
          const token = tokenMatch[1];

          try {
            // API 클라이언트에 토큰 설정
            api.setToken(token);

            // 사용자 정보 가져오기
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
              throw new Error(data.message || '사용자 정보를 가져올 수 없습니다.');
            }

            const user = data.user as User;

            // 만료 시간 계산
            const expiry = Date.now() + TOKEN_EXPIRY_MS;

            // SecureStore에 저장
            await SecureStore.setItemAsync(TOKEN_KEY, token);
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
            await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, expiry.toString());

            setIsLoading(false);
            onSuccess(token, user);
            return true;
          } catch (err) {
            const message = err instanceof Error ? err.message : '로그인 처리 중 오류가 발생했습니다.';
            setError(message);
            setIsLoading(false);
            return false;
          }
        }
      }

      setIsLoading(false);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : '카카오 로그인 중 오류가 발생했습니다.';
      setError(message);
      setIsLoading(false);
      return false;
    }
  }, [onSuccess]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    login,
    clearError,
  };
}
