/**
 * AI 어시스턴트 팝업 윈도우 전용 페이지
 * @since 2025-12-22
 *
 * window.open()으로 열리는 독립 팝업 창에서 AI 어시스턴트를 사용할 수 있게 함
 * 브라우저 밖으로 이동 가능하며, 다른 앱 위에 띄울 수 있음
 */

import { useEffect, useState } from 'react';
import { getAuthToken } from '@/shared/lib/api';
import { ChatPanel } from '@/components/ChatPanel';
import './AIAssistantPage.css';
import './AIAssistantPage.mobile.css';

/**
 * 🔒 보안: JWT 토큰 형식 검증
 * - 길이 제한 (2000자 미만)
 * - JWT 형식 (header.payload.signature)
 */
const isValidJWT = (token: string): boolean =>
  token.length < 2000 &&
  /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token);

export default function AIAssistantPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 인증 상태 확인
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  // 팝업 창 식별 + 팝업 열림 상태 관리
  useEffect(() => {
    document.body.classList.add('ai-assistant-popup');
    document.title = 'AI 어시스턴트';

    // 팝업 열림 상태 설정
    localStorage.setItem('aims-ai-popup-open', 'true');

    // 창 닫힐 때 상태 정리
    const handleBeforeUnload = () => {
      localStorage.removeItem('aims-ai-popup-open');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.body.classList.remove('ai-assistant-popup');
      localStorage.removeItem('aims-ai-popup-open');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 부모 창과 동기화 (세션 ID, 토큰 등)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 🔒 보안: 동일 출처 검증 (XSS 공격 방지)
      if (event.origin !== window.location.origin) {
        console.warn('[AIAssistantPage] 허용되지 않은 출처에서 메시지 수신:', event.origin);
        return;
      }

      if (event.data?.type === 'AIMS_AUTH_SYNC') {
        // 부모 창에서 인증 정보 동기화
        const token = event.data.token;
        if (token && typeof token === 'string') {
          // 🔒 보안: JWT 형식 검증 (악의적 토큰 주입 방지)
          if (!isValidJWT(token)) {
            console.warn('[AIAssistantPage] 유효하지 않은 토큰 형식:', token.substring(0, 20) + '...');
            return;
          }
          localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { token } }));
          setIsAuthenticated(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 🔴 ChatPanel 마운트 후 부모 창에 준비 완료 알림
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    // ChatPanel이 렌더링된 후 약간의 딜레이를 주고 준비 완료 알림
    const timer = setTimeout(() => {
      if (window.opener && !window.opener.closed) {
        console.log('[AIAssistantPage] 팝업 준비 완료, 부모에 알림');
        // 🔒 보안: 명시적 출처 지정 (메시지 탈취 방지)
        window.opener.postMessage({ type: 'AIMS_POPUP_READY' }, window.location.origin);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading]);

  // 창 닫기 핸들러
  const handleClose = () => {
    window.close();
  };

  if (isLoading) {
    return (
      <div className="ai-assistant-page ai-assistant-page--loading">
        <div className="ai-assistant-page__spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="ai-assistant-page ai-assistant-page--auth-required">
        <div className="ai-assistant-page__auth-message">
          <h2>로그인이 필요합니다</h2>
          <p>AI 어시스턴트를 사용하려면 먼저 로그인해주세요.</p>
          <button
            type="button"
            className="ai-assistant-page__auth-button"
            onClick={handleClose}
          >
            창 닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-assistant-page">
      <ChatPanel isOpen={true} onClose={handleClose} isPopup={true} />
    </div>
  );
}
