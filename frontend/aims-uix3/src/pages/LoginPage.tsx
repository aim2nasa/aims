/**
 * 로그인 페이지
 */

import { startKakaoLogin } from '@/entities/auth/api';
import './LoginPage.css';

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>AIMS</h1>
          <p>보험 문서 관리 시스템</p>
        </div>

        <div className="login-content">
          <button
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
        </div>
      </div>
    </div>
  );
}
