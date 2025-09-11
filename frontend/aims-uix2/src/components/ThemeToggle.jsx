import React from 'react';
import { Switch, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  

  return (
    <Tooltip title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        padding: '0 16px',
        borderLeft: '1px solid var(--color-border-light)'
      }}>
        <SunOutlined style={{ 
          fontSize: '16px', 
          color: !isDark ? 'var(--color-warning)' : 'var(--color-text-tertiary)' 
        }} />
        <Switch
          checked={isDark}
          onChange={toggleTheme}
          style={{
            backgroundColor: isDark ? 'var(--color-primary)' : 'var(--color-text-tertiary)'
          }}
        />
        <MoonOutlined style={{ 
          fontSize: '16px', 
          color: isDark ? 'var(--color-primary)' : 'var(--color-text-tertiary)' 
        }} />
      </div>
    </Tooltip>
  );
};

export default ThemeToggle;