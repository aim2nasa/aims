import { FC } from 'react'

interface ThemeToggleProps {
  theme: 'light' | 'dark'
  onToggle: () => void
}

const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark'

  return (
    <div className="theme-toggle-container">
      <span
        className="theme-icon theme-icon-sun"
        style={{ '--sun-color': !isDark ? 'var(--color-icon-orange)' : 'var(--color-text-tertiary)' } as any}
      >
        ☀️
      </span>
      <label className="theme-switch">
        <input
          type="checkbox"
          checked={isDark}
          onChange={onToggle}
          className="theme-switch-input"
        />
        <span className="theme-switch-slider"></span>
      </label>
      <span
        className="theme-icon theme-icon-moon"
        style={{ '--moon-color': isDark ? 'var(--color-icon-cyan)' : 'var(--color-text-tertiary)' } as any}
      >
        🌙
      </span>
    </div>
  )
}

export default ThemeToggle