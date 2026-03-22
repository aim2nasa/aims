import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/authStore';
import { Button } from '@/shared/ui/Button/Button';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { usePersistentTheme } from '@/hooks/usePersistentTheme';
import { useInquiryNotifications } from '@/shared/hooks/useInquiryNotifications';
import './App.css';

// 문의 알림 컨텍스트 (하위 컴포넌트에서 접근 가능)
interface InquiryNotificationContextType {
  unreadCount: number;
  unreadIds: Set<string>;
  isUnread: (id: string) => boolean;
  markAsRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const InquiryNotificationContext = createContext<InquiryNotificationContextType | null>(null);

export function useInquiryNotificationContext() {
  const ctx = useContext(InquiryNotificationContext);
  if (!ctx) {
    throw new Error('useInquiryNotificationContext must be used within App');
  }
  return ctx;
}

interface NavItem {
  path: string;
  label: string;
  badge?: number;
  children?: NavItem[];
}

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_WIDTH_KEY = 'aims_admin_sidebar_width';
const EXPANDED_MENUS_KEY = 'aims_admin_expanded_menus';

/**
 * 현재 시간을 YYYY.MM.DD HH:mm:ss 형식으로 반환
 */
function formatCurrentTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 헤더 시계 (독립 컴포넌트)
 *
 * App에 직접 setState를 두면 1초마다 전체 트리(Outlet 포함)가 리렌더되어
 * SystemHealthPage의 Recharts가 매초 SVG를 재구성 → OOM.
 * 별도 컴포넌트로 분리하면 시계만 리렌더되고 Outlet은 영향 없음.
 */
function HeaderClock() {
  const [time, setTime] = useState(formatCurrentTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatCurrentTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return <span className="app__current-time">{time}</span>;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = usePersistentTheme();

  // 문의 알림 관리 (SSE 실시간 알림)
  const inquiryNotifications = useInquiryNotifications();

  // 모바일 감지
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 모바일 사이드바 상태
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 네비게이션 변경 시 사이드바 닫기
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const saved = localStorage.getItem(EXPANDED_MENUS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return ['/dashboard'];
      }
    }
    return ['/dashboard'];
  });

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
        { path: '/dashboard/credits', label: '크레딧 관리' },
        { path: '/dashboard/system', label: '시스템 상태' },
        { path: '/dashboard/file-validation', label: '파일 검증' },
        { path: '/dashboard/ai-usage', label: 'AI/OCR 사용량' },
        { path: '/dashboard/error-logs', label: '시스템 로그' },
      ],
    },
    {
      path: '/users',
      label: '사용자 관리',
      children: [
        { path: '/users', label: '사용자 목록' },
        { path: '/users/activity', label: '사용자 활동' },
      ],
    },
    {
      path: '/help',
      label: '도움말 관리',
      children: [
        { path: '/help/notices', label: '공지사항' },
        { path: '/help/guides', label: '사용 가이드' },
        { path: '/help/faqs', label: 'FAQ' },
        { path: '/inquiries', label: '1:1 문의', badge: inquiryNotifications.unreadCount },
      ],
    },
    {
      path: '/system',
      label: '시스템 관리',
      children: [
        { path: '/system/document-types', label: '문서 유형' },
        { path: '/system/parsing-settings', label: '파싱 설정' },
        { path: '/system/backup', label: '백업 관리' },
        { path: '/system/shadow-monitor', label: 'Shadow Monitor' },
        { path: '/system/virus-scan', label: '바이러스 검사' },
      ],
    },
  ];

  const toggleMenu = (path: string) => {
    setExpandedMenus((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      localStorage.setItem(EXPANDED_MENUS_KEY, JSON.stringify(next));
      return next;
    });
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
          <span className="app__nav-item-label">
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="app__nav-item-badge">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </span>
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
    <InquiryNotificationContext.Provider value={inquiryNotifications}>
      <div className="app">
        {/* Header */}
        <header className="app__header">
          <div className="app__header-left">
            <button
              type="button"
              className="app__hamburger"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="메뉴 열기"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <h1 className="app__logo">AIMS Admin</h1>
          </div>
          <div className="app__header-right">
            <HeaderClock />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="app__user-name">{user?.name || user?.email || '관리자'}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </header>

        <div className="app__body">
          {/* 모바일 오버레이 */}
          {sidebarOpen && (
            <div
              className="app__sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside
            className={`app__sidebar ${sidebarOpen ? 'app__sidebar--open' : ''}`}
            style={isMobile ? undefined : { width: sidebarWidth }}
          >
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
    </InquiryNotificationContext.Provider>
  );
}

export default App;
