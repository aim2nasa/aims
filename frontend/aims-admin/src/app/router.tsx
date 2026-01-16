import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { LoginPage } from '@/pages/LoginPage/LoginPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage/UnauthorizedPage';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';
import { DocumentProcessingPage } from '@/pages/DocumentProcessingPage';
import { StoragePage } from '@/pages/StoragePage';
import { TierManagementPage } from '@/pages/TierManagementPage';
import { SystemHealthPage } from '@/pages/SystemHealthPage';
import { FileValidationPage } from '@/pages/FileValidationPage';
import { AIUsagePage } from '@/pages/AIUsagePage';
import { OCRUsagePage } from '@/pages/OCRUsagePage';
import { UsersPage } from '@/pages/UsersPage/UsersPage';
import { UserActivityPage } from '@/pages/UserActivityPage';
import { ErrorLogsPage } from '@/pages/ErrorLogsPage';
import { InquiriesPage } from '@/pages/InquiriesPage/InquiriesPage';
import { InquiryDetailPage } from '@/pages/InquiryDetailPage/InquiryDetailPage';
import { NoticesPage } from '@/pages/NoticesPage/NoticesPage';
import { UsageGuidesPage } from '@/pages/UsageGuidesPage/UsageGuidesPage';
import { FAQsPage } from '@/pages/FAQsPage/FAQsPage';
import { DocumentTypesPage } from '@/pages/DocumentTypesPage/DocumentTypesPage';
import { BackupPage } from '@/pages/BackupPage';
import { ShadowMonitorPage } from '@/pages/ShadowMonitorPage';
import { VirusScanPage } from '@/pages/VirusScanPage';
import { ParsingSettingsPage } from '@/pages/ParsingSettingsPage';
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
      <ErrorBoundary>
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      </ErrorBoundary>
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
        path: 'dashboard/ocr-usage',
        element: <OCRUsagePage />,
      },
      {
        path: 'dashboard/error-logs',
        element: <ErrorLogsPage />,
      },
      {
        path: 'users',
        element: <UsersPage />,
      },
      {
        path: 'users/activity',
        element: <UserActivityPage />,
      },
      {
        path: 'inquiries',
        element: <InquiriesPage />,
      },
      {
        path: 'inquiries/:id',
        element: <InquiryDetailPage />,
      },
      {
        path: 'help',
        element: <Navigate to="/help/notices" replace />,
      },
      {
        path: 'help/notices',
        element: <NoticesPage />,
      },
      {
        path: 'help/guides',
        element: <UsageGuidesPage />,
      },
      {
        path: 'help/faqs',
        element: <FAQsPage />,
      },
      {
        path: 'system',
        element: <Navigate to="/system/document-types" replace />,
      },
      {
        path: 'system/document-types',
        element: <DocumentTypesPage />,
      },
      {
        path: 'system/parsing-settings',
        element: <ParsingSettingsPage />,
      },
      {
        path: 'system/backup',
        element: <BackupPage />,
      },
      {
        path: 'system/shadow-monitor',
        element: <ShadowMonitorPage />,
      },
      {
        path: 'system/virus-scan',
        element: <VirusScanPage />,
      },
    ],
  },
]);
