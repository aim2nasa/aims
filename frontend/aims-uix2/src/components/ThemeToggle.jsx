import React from 'react';
import { Switch, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  

  return (
    <Tooltip title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}>
      <div className="theme-toggle-container">
        <SunOutlined 
          className="theme-icon theme-icon-sun"
          style={{ '--sun-color': !isDark ? 'var(--color-icon-orange)' : 'var(--color-text-tertiary)' }}
        />
        <Switch
          checked={isDark}
          onChange={toggleTheme}
          className="theme-switch"
          style={{ '--switch-bg-color': isDark ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
        />
        <MoonOutlined 
          className="theme-icon theme-icon-moon"
          style={{ '--moon-color': isDark ? 'var(--color-icon-cyan)' : 'var(--color-text-tertiary)' }}
        />
      </div>
    </Tooltip>
  );
};

export default ThemeToggle;