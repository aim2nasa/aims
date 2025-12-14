import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';
import { Button } from '@/shared/ui/Button/Button';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { usePersistentTheme } from '@/hooks/usePersistentTheme';
import './App.css';

interface NavItem {
  path: string;
  label: string;
  children?: NavItem[];
}

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'aims_admin_sidebar_width';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = usePersistentTheme();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['/dashboard']);

  // 사이드바 리사이즈 상태
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }, [sidebarWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;
    const delta = e.clientX - resizeRef.current.startX;
    const newWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, resizeRef.current.startWidth + delta)
    );
    setSidebarWidth(newWidth);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeRef.current = null;
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // 리사이즈 이벤트 리스너
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  const navItems: NavItem[] = [
    {
      path: '/dashboard',
      label: '대시보드',
      children: [
        { path: '/dashboard/documents', label: '문서 처리' },
        { path: '/dashboard/storage', label: '스토리지' },
        { path: '/dashboard/tiers', label: '티어 관리' },
        { path: '/dashboard/system', label: '시스템 상태' },
        { path: '/dashboard/file-validation', label: '파일 검증' },
        { path: '/dashboard/ai-usage', label: 'AI 사용량' },
        { path: '/dashboard/ocr-usage', label: 'OCR 사용량' },
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
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <span className="app__user-name">{user?.name || user?.email || '관리자'}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </header>

      <div className="app__body">
        {/* Sidebar */}
        <aside className="app__sidebar" style={{ width: sidebarWidth }}>
          <nav className="app__nav">
            {navItems.map((item) => renderNavItem(item))}
          </nav>
        </aside>

        {/* Resize Handle */}
        <div
          className={`app__resize-handle ${isResizing ? 'app__resize-handle--active' : ''}`}
          onMouseDown={handleResizeStart}
          onDoubleClick={() => {
            setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
            localStorage.setItem(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH.toString());
          }}
          title="더블클릭으로 기본 너비 복원"
        />

        {/* Main Content */}
        <main className="app__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default App;
