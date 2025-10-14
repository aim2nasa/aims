import React from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import AppWithTheme from './components/AppWithTheme';
import 'antd/dist/reset.css'; // Ant Design 최신 스타일시트 경로
import './index.css';
import './styles/variables.css';
import './styles/themes.css';
import './styles/layout.css';

function App() {
  return (
    <ThemeProvider>
      <AppWithTheme />
    </ThemeProvider>
  );
}

export default App;