import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage/LoginPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage/UnauthorizedPage';
import App from './App';

// 페이지들은 추후 구현
const DashboardPage = () => <div>Dashboard (구현 예정)</div>;
const UsersPage = () => <div>Users (구현 예정)</div>;

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
        path: 'users',
        element: <UsersPage />,
      },
    ],
  },
]);
