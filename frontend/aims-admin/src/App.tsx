import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';
import { Button } from '@/shared/ui/Button/Button';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: '대시보드' },
    { path: '/users', label: '사용자 관리' },
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="app__header">
        <div className="app__header-left">
          <h1 className="app__logo">AIMS Admin</h1>
        </div>
        <div className="app__header-right">
          <span className="app__user-name">{user?.name || user?.email || '관리자'}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </header>

      <div className="app__body">
        {/* Sidebar */}
        <aside className="app__sidebar">
          <nav className="app__nav">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`app__nav-item ${location.pathname === item.path ? 'app__nav-item--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="app__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default App;
