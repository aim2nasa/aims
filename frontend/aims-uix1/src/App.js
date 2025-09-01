import React from 'react';
import AppLayout from './components/AppLayout';
import ComponentShowcase from './components/ComponentShowcase';
import { ThemeProvider } from './contexts/ThemeContext';
import 'antd/dist/reset.css'; // Ant Design 최신 스타일시트 경로
import './styles/themes.css';
import './styles/layout.css';
import './index.css';

function App() {
  // Phase 2 검증을 위한 컴포넌트 쇼케이스
  // 테스트 완료 후 이 부분을 원래대로 되돌리세요
  const showComponentTest = window.location.search.includes('test=components');
  
  if (showComponentTest) {
    return (
      <ThemeProvider>
        <ComponentShowcase />
      </ThemeProvider>
    );
  }
  
  return (
    <ThemeProvider>
      <AppLayout />
    </ThemeProvider>
  );
}

export default App;