import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/app/queryClient'
import { CustomerProvider } from '@/providers/CustomerProvider'
import { AppleConfirmProvider } from '@/contexts/AppleConfirmProvider'
import './index.css'
import './shared/design/tokens.css'
import './shared/design/theme.css'
import './shared/styles/utilities.css'
import './shared/styles/layout.css'
import './shared/styles/components.css'
import './shared/styles/document-badges.css'
import './shared/styles/column-resize.css'
import './shared/styles/tab-table.css'
import './shared/styles/document-alias.css'
import AppRouter from './AppRouter'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppleConfirmProvider>
          <CustomerProvider>
            <AppRouter />
          </CustomerProvider>
        </AppleConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
