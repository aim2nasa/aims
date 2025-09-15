import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/app/queryClient'
import { CustomerProvider } from '@/providers/CustomerProvider'
import './index.css'
import './shared/design/tokens.css'
import './shared/design/theme.css'
import './shared/styles/utilities.css'
import './shared/styles/layout.css'
import './shared/styles/components.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CustomerProvider>
        <App />
      </CustomerProvider>
    </QueryClientProvider>
  </StrictMode>,
)
