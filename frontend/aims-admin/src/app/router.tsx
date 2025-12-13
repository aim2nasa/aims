import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage/LoginPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage/UnauthorizedPage';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';
import { DocumentProcessingPage } from '@/pages/DocumentProcessingPage';
import { StoragePage } from '@/pages/StoragePage';
import { TierManagementPage } from '@/pages/TierManagementPage';
import { SystemHealthPage } from '@/pages/SystemHealthPage';
import { FileValidationPage } from '@/pages/FileValidationPage';
import { AIUsagePage } from '@/pages/AIUsagePage';
import { UsersPage } from '@/pages/UsersPage/UsersPage';
import App from '../App';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'dashboard/documents',
        element: <DocumentProcessingPage />,
      },
      {
        path: 'dashboard/storage',
        element: <StoragePage />,
      },
      {
        path: 'dashboard/tiers',
        element: <TierManagementPage />,
      },
      {
        path: 'dashboard/system',
        element: <SystemHealthPage />,
      },
      {
        path: 'dashboard/file-validation',
        element: <FileValidationPage />,
      },
      {
        path: 'dashboard/ai-usage',
        element: <AIUsagePage />,
      },
      {
        path: 'users',
        element: <UsersPage />,
      },
    ],
  },
]);
