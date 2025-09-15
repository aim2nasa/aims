import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './shared/design/tokens.css'
import './shared/design/theme.css'
import './shared/styles/utilities.css'
import './shared/styles/layout.css'
import './shared/styles/components.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
