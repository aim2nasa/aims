import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';
import { Button } from '@/shared/ui/Button/Button';
import './App.css';

interface NavItem {
  path: string;
  label: string;
  children?: NavItem[];
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['/dashboard']);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems: NavItem[] = [
    {
      path: '/dashboard',
      label: '대시보드',
      children: [
        { path: '/dashboard/documents', label: '문서 처리' },
        { path: '/dashboard/storage', label: '스토리지' },
        { path: '/dashboard/tiers', label: '티어 관리' },
        { path: '/dashboard/system', label: '시스템 상태' },
      ],
    },
    { path: '/users', label: '사용자 관리' },
  ];

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const isActive = (path: string) => location.pathname === path;
  const isParentActive = (item: NavItem) => {
    if (isActive(item.path)) return true;
    if (item.children) {
      return item.children.some((child) => isActive(child.path));
    }
    return false;
  };

  const renderNavItem = (item: NavItem, isChild = false) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.path);
    const active = isChild ? isActive(item.path) : isParentActive(item);

    return (
      <div key={item.path} className="app__nav-group">
        <button
          type="button"
          className={`app__nav-item ${active ? 'app__nav-item--active' : ''} ${isChild ? 'app__nav-item--child' : ''}`}
          onClick={() => {
            if (hasChildren) {
              toggleMenu(item.path);
            }
            navigate(item.path);
          }}
        >
          <span className="app__nav-item-label">{item.label}</span>
          {hasChildren && (
            <span className={`app__nav-item-arrow ${isExpanded ? 'app__nav-item-arrow--expanded' : ''}`}>
              ›
            </span>
          )}
        </button>
        {hasChildren && isExpanded && (
          <div className="app__nav-children">
            {item.children!.map((child) => renderNavItem(child, true))}
          </div>
        )}
      </div>
    );
  };

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
            {navItems.map((item) => renderNavItem(item))}
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
