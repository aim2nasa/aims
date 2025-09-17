import { FC } from 'react'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: () => void
}

const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark'

  // 테마별 클래스명 동적 생성
  const containerClasses = [
    'theme-toggle-container',
    isDark ? 'theme-toggle-container--dark' : 'theme-toggle-container--light'
  ].filter(Boolean).join(' ')

  return (
    <div className={containerClasses}>
      <span className="theme-icon theme-icon-sun">
        ☀️
      </span>
      <label className="theme-switch">
        <input
          type="checkbox"
          checked={isDark}
          onChange={onToggle}
          className="theme-switch-input"
          aria-label={`테마를 ${isDark ? '라이트' : '다크'} 모드로 변경`}
        />
        <span className="theme-switch-slider"></span>
      </label>
      <span className="theme-icon theme-icon-moon">
        🌙
      </span>
    </div>
  )
}

export default ThemeToggle