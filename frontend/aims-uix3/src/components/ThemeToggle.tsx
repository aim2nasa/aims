import { FC, memo } from 'react'
import { HAPTIC_TYPES } from '../hooks/useHapticFeedback'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from './SFSymbol'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: () => void
}

const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark'

  // 테마 토글 시 햅틱 피드백 추가
  const handleToggleWithHaptic = () => {
    if (window.aimsHaptic) {
      window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.LIGHT)
    }
    onToggle()
  }

  // 테마별 클래스명 동적 생성
  const containerClasses = [
    'theme-toggle-container',
    isDark ? 'theme-toggle-container--dark' : 'theme-toggle-container--light'
  ].filter(Boolean).join(' ')

  return (
    <div
      className={containerClasses}
      onClick={handleToggleWithHaptic}
      role="switch"
      aria-checked={isDark ? 'true' : 'false'}
      aria-label={`테마를 ${isDark ? '라이트' : '다크'} 모드로 변경`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleWithHaptic() } }}
    >
      <span className="theme-icon theme-icon-sun">
        <SFSymbol
          name="sun-max"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          color="var(--color-icon-orange)"
        />
      </span>
      <div className="theme-switch">
        <span className="theme-switch-slider"></span>
      </div>
      <span className="theme-icon theme-icon-moon">
        <SFSymbol
          name="moon-stars"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          color="var(--color-icon-cyan)"
        />
      </span>
    </div>
  )
}

export default memo(ThemeToggle)