import React from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import AppWithTheme from './components/AppWithTheme';
import 'antd/dist/reset.css'; // Ant Design 최신 스타일시트 경로
import './styles.css'; // 통합 스타일 시스템

function App() {
  return (
    <ThemeProvider>
      <AppWithTheme />
    </ThemeProvider>
  );
}

export default App;