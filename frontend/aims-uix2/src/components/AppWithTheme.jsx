import React from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import { useTheme } from '../contexts/ThemeContext';
import AppLayout from './AppLayout';
import ComponentShowcase from './ComponentShowcase';

const AppWithTheme = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const antdTheme = {
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      // CSS 변수를 통해 동적 테마 값 참조 - 하드코딩 제거
      colorPrimary: 'var(--color-primary)',
      colorBgContainer: 'var(--color-bg-primary)',
      colorBgElevated: 'var(--color-surface-1)',
      colorBgLayout: 'var(--color-bg-secondary)',
      colorText: 'var(--color-text-primary)',
      colorTextSecondary: 'var(--color-text-secondary)',
      colorBorder: 'var(--color-border-medium)',
      colorBorderSecondary: 'var(--color-border-light)',
      colorSuccess: 'var(--color-success)',
      colorWarning: 'var(--color-warning)',
      colorError: 'var(--color-error)',
      colorInfo: 'var(--color-info)',
    },
  };
  
  const showComponentTest = window.location.search.includes('test=components');
  
  return (
    <ConfigProvider theme={antdTheme}>
      {showComponentTest ? <ComponentShowcase /> : <AppLayout />}
    </ConfigProvider>
  );
};

export default AppWithTheme;