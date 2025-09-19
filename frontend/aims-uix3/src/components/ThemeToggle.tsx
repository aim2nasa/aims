import { FC, memo } from 'react'
import { HAPTIC_TYPES } from '../hooks/useHapticFeedback'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from './SFSymbol'

interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'system'
  onToggle: () => void
}

const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  // 테마 토글 시 햅틱 피드백 추가
  const handleToggleWithHaptic = () => {
    if (window.aimsHaptic) {
      window.aimsHaptic.triggerHaptic(HAPTIC_TYPES.MEDIUM)
    }
    onToggle()
  }

  // 테마별 클래스명 동적 생성
  const containerClasses = [
    'theme-toggle-container',
    `theme-toggle-container--${theme}`
  ].filter(Boolean).join(' ')

  // 현재 테마에 따른 아이콘과 설명 선택
  const getThemeInfo = () => {
    switch (theme) {
      case 'light':
        return {
          icon: 'sun-max',
          color: 'var(--color-icon-orange)',
          label: '라이트 모드 (다크로 전환)',
          text: '☀️'
        }
      case 'dark':
        return {
          icon: 'moon-stars',
          color: 'var(--color-icon-cyan)',
          label: '다크 모드 (시스템으로 전환)',
          text: '🌙'
        }
      case 'system':
        return {
          icon: 'gear',
          color: 'var(--color-text-secondary)',
          label: '시스템 모드 (라이트로 전환)',
          text: '⚙️'
        }
      default:
        return {
          icon: 'gear',
          color: 'var(--color-text-secondary)',
          label: '시스템 모드',
          text: '⚙️'
        }
    }
  }

  const themeInfo = getThemeInfo()

  return (
    <button
      className={`theme-toggle-button haptic-enabled ${containerClasses}`}
      onClick={handleToggleWithHaptic}
      aria-label={themeInfo.label}
      title={themeInfo.label}
    >
      <span className="theme-current-icon">
        <SFSymbol
          name={themeInfo.icon}
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          color={themeInfo.color}
        />
      </span>
      <span className="theme-current-text">{theme.toUpperCase()}</span>
    </button>
  )
}

export default memo(ThemeToggle)