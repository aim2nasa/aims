/**
 * AIMS UIX-3 Router Configuration
 * @since 2025-09-15
 * @version 1.0.0
 *
 * React Router와 코드 스플리팅을 위한 라우터 설정
 * 지연 로딩과 Suspense를 활용한 성능 최적화
 */

import React, { Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LoadingSkeleton } from '@/shared/ui/LoadingSkeleton';
import { queryClient } from './queryClient';
import { errorReporter } from '@/shared/lib/errorReporter';

// 페이지 컴포넌트 지연 로딩
const HomePage = React.lazy(() => import('@/pages/home'));
const AIAssistantPage = React.lazy(() => import('@/pages/AIAssistantPage'));
const AnnualReportPage = React.lazy(() => import('@/pages/AnnualReportPage'));
const CustomerReviewPage = React.lazy(() => import('@/pages/CustomerReviewPage'));

/**
 * 페이지 로딩 스켈레톤
 */
const PageLoadingSkeleton: React.FC = () => (
  <div style={{ padding: 'var(--spacing-6)' }}>
    <div style={{ marginBottom: 'var(--spacing-6)' }}>
      <LoadingSkeleton variant="text" width="200px" height="32px" />
    </div>
    <div style={{ display: 'grid', gap: 'var(--spacing-4)' }}>
      <LoadingSkeleton variant="rectangle" width="100%" height="120px" />
      <LoadingSkeleton variant="rectangle" width="100%" height="120px" />
      <LoadingSkeleton variant="rectangle" width="100%" height="120px" />
    </div>
  </div>
);

/**
 * 에러 바운더리 컴포넌트
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren<object>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<object>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 에러 로깅 서비스에 전송
    errorReporter.reportComponentError(error, 'RouterErrorBoundary', {
      componentStack: errorInfo.componentStack || undefined
    });
    console.error('Router Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 'var(--spacing-6)',
            textAlign: 'center',
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
          }}
        >
          <h1 style={{ marginBottom: 'var(--spacing-4)', fontSize: 'var(--font-size-2xl)' }}>
            앗! 문제가 발생했습니다
          </h1>
          <p style={{ marginBottom: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>
            페이지를 로드하는 중 오류가 발생했습니다. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: 'var(--spacing-3) var(--spacing-6)',
              backgroundColor: 'var(--color-button-primary-bg)',
              color: 'var(--color-button-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              fontWeight: 'var(--font-weight-medium)',
            }}
          >
            페이지 새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 404 Not Found 페이지
 */
const NotFoundPage: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 'var(--spacing-6)',
      textAlign: 'center',
      backgroundColor: 'var(--color-bg-primary)',
      color: 'var(--color-text-primary)',
    }}
  >
    <h1 style={{ marginBottom: 'var(--spacing-4)', fontSize: 'var(--font-size-4xl)' }}>
      404
    </h1>
    <p style={{ marginBottom: 'var(--spacing-6)', fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)' }}>
      찾을 수 없는 페이지입니다
    </p>
    <a
      href="/"
      style={{
        padding: 'var(--spacing-3) var(--spacing-6)',
        backgroundColor: 'var(--color-button-primary-bg)',
        color: 'var(--color-button-primary-text)',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        fontSize: 'var(--font-size-base)',
        fontWeight: 'var(--font-weight-medium)',
      }}
    >
      홈으로 돌아가기
    </a>
  </div>
);

/**
 * 기본 레이아웃 컴포넌트
 */
const Layout: React.FC = () => {
  return (
    <div>
      <main>
        <ErrorBoundary>
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};

/**
 * 라우터 정의
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  // AI 어시스턴트 팝업 전용 라우트 (레이아웃 없이 독립)
  {
    path: '/ai-assistant',
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoadingSkeleton />}>
          <AIAssistantPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  // Annual Report 팝업 전용 라우트 (레이아웃 없이 독립)
  {
    path: '/annual-report',
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoadingSkeleton />}>
          <AnnualReportPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  // Customer Review 팝업 전용 라우트 (레이아웃 없이 독립)
  {
    path: '/customer-review',
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoadingSkeleton />}>
          <CustomerReviewPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
]);

/**
 * 앱 라우터 컴포넌트
 */
export const AppRouter: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

