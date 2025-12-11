import { FC, memo } from 'react';
import './ThemeToggle.css';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

/**
 * 테마 토글 컴포넌트
 * 라이트/다크 모드 전환을 위한 스위치 UI
 */
const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';

  const containerClasses = [
    'theme-toggle-container',
    isDark ? 'theme-toggle-container--dark' : 'theme-toggle-container--light',
  ].join(' ');

  return (
    <div className={containerClasses}>
      {/* Sun Icon */}
      <span className="theme-icon theme-icon-sun">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>

      {/* Toggle Switch */}
      <label className="theme-switch">
        <input
          type="checkbox"
          checked={isDark}
          onChange={onToggle}
          className="theme-switch-input"
          aria-label={`테마를 ${isDark ? '라이트' : '다크'} 모드로 변경`}
        />
        <span className="theme-switch-slider" />
      </label>

      {/* Moon Icon */}
      <span className="theme-icon theme-icon-moon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </div>
  );
};

export default memo(ThemeToggle);
