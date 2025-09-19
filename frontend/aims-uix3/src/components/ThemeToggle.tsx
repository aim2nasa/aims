import { FC, memo } from 'react'
import { HapticType, withHaptic } from '../services/hapticService'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from './SFSymbol'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: () => void
}

const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark'

  // 테마 토글 시 햅틱 피드백 추가
  const handleToggleWithHaptic = withHaptic(HapticType.LIGHT, onToggle)

  // 테마별 클래스명 동적 생성
  const containerClasses = [
    'theme-toggle-container',
    isDark ? 'theme-toggle-container--dark' : 'theme-toggle-container--light'
  ].filter(Boolean).join(' ')

  return (
    <div className={containerClasses}>
      <span className="theme-icon theme-icon-sun">
        <SFSymbol
          name="sun-max"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          color="var(--color-icon-orange)"
        />
      </span>
      <label className="theme-switch haptic-enabled">
        <input
          type="checkbox"
          checked={isDark}
          onChange={handleToggleWithHaptic}
          className="theme-switch-input"
          aria-label={`테마를 ${isDark ? '라이트' : '다크'} 모드로 변경`}
        />
        <span className="theme-switch-slider"></span>
      </label>
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