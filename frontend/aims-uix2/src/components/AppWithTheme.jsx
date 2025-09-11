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
      colorPrimary: isDark ? '#60a5fa' : '#3b82f6',
      colorBgContainer: isDark ? '#1f2937' : '#ffffff',
      colorBgElevated: isDark ? '#374151' : '#ffffff',
      colorBgLayout: isDark ? '#111827' : '#f9fafb',
      colorText: isDark ? '#f9fafb' : '#111827',
      colorTextSecondary: isDark ? '#d1d5db' : '#4b5563',
      colorBorder: isDark ? '#4b5563' : '#e5e7eb',
      colorBorderSecondary: isDark ? '#374151' : '#f0f0f0',
      colorSuccess: isDark ? '#34d399' : '#10b981',
      colorWarning: isDark ? '#fbbf24' : '#f59e0b',
      colorError: isDark ? '#f87171' : '#ef4444',
      colorInfo: isDark ? '#60a5fa' : '#3b82f6',
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