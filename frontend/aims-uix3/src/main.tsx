import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/shared/design/tokens.css'
import '@/shared/design/theme.css'
import './index.css'
import { AppRouter } from '@/app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
