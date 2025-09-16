import { useState, ReactNode } from 'react'
import './CustomMenu.css'

// CSS로 구현한 벡터 아이콘 컴포넌트들 (하드코딩 금지 원칙 준수)
const MenuIcons = {
  User: () => (
    <div className="menu-icon icon-user">
      <div className="icon-shape"></div>
    </div>
  ),
  List: () => (
    <div className="menu-icon icon-list">
      <div className="icon-shape"></div>
    </div>
  ),
  Location: () => (
    <div className="menu-icon icon-location">
      <div className="icon-shape"></div>
    </div>
  ),
  Team: () => (
    <div className="menu-icon icon-team">
      <div className="icon-shape"></div>
    </div>
  ),
  FileText: () => (
    <div className="menu-icon icon-file">
      <div className="icon-shape"></div>
    </div>
  ),
  Dashboard: () => (
    <div className="menu-icon icon-dashboard">
      <div className="icon-shape"></div>
    </div>
  ),
  Search: () => (
    <div className="menu-icon icon-search">
      <div className="icon-shape"></div>
    </div>
  ),
  ChevronDown: () => (
    <div className="menu-icon icon-chevron">
      <div className="icon-shape"></div>
    </div>
  )
}

// 메뉴 아이템 타입 정의
export interface MenuItem {
  key: string
  icon: ReactNode
  label: string
  tooltipTitle: string
  children?: MenuItem[]
}

// 컴포넌트 Props 타입 정의
interface CustomMenuProps {
  onMenuClick?: (key: string) => void
  hasSearchResults?: boolean
  searchResultsCount?: number
  collapsed?: boolean
}

interface CustomMenuItemProps {
  item: MenuItem
  isSubMenu?: boolean
  collapsed?: boolean
  selectedKey: string
  expandedKeys: string[]
  onMenuClick: (key: string) => void
  onToggleExpand: (key: string, e: React.MouseEvent) => void
}

// 개별 메뉴 아이템 컴포넌트
const CustomMenuItem = ({
  item,
  isSubMenu = false,
  collapsed = false,
  selectedKey,
  expandedKeys,
  onMenuClick,
  onToggleExpand
}: CustomMenuItemProps) => {
  const isSelected = selectedKey === item.key
  const isExpanded = expandedKeys.includes(item.key)
  const hasChildren = item.children && item.children.length > 0

  // 메인 메뉴 영역 클릭 시 - 선택만 처리
  const handleMainMenuClick = (e: React.MouseEvent) => {
    onMenuClick(item.key)
  }

  // chevron 아이콘 클릭 시 - 선택 + 토글 처리
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation() // 메인 메뉴 클릭 이벤트 방지
    onMenuClick(item.key) // 선택 상태 변경
    onToggleExpand(item.key, e) // 토글 처리
  }

  // 더블클릭 시 - 서브메뉴 토글 (펼치기/접기)
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault() // 기본 더블클릭 동작 방지

    // 메뉴 선택
    onMenuClick(item.key)

    // 서브메뉴가 있고 축소 모드가 아닐 때, 토글 처리
    if (hasChildren && !collapsed) {
      onToggleExpand(item.key, e)
    }
  }

  const className = `custom-menu-item ${
    isSubMenu ? 'sub-menu' : ''
  } ${collapsed ? 'collapsed' : ''} ${
    isSelected ? 'selected' : ''
  } ${hasChildren ? 'has-children' : ''}`

  const content = (
    <div
      className={className}
      onClick={handleMainMenuClick}
      onDoubleClick={handleDoubleClick}
      title={collapsed ? item.tooltipTitle : ''}
    >
      {item.icon}
      {!collapsed && <span className="custom-menu-item-text">{item.label}</span>}
      {hasChildren && !collapsed && (
        <div onClick={handleChevronClick}>
          <MenuIcons.ChevronDown />
        </div>
      )}
    </div>
  )

  return (
    <div key={item.key}>
      {content}
      {hasChildren && !collapsed && isExpanded && (
        <div className="sub-menu-container">
          {item.children!.map(child => (
            <CustomMenuItem
              key={child.key}
              item={child}
              isSubMenu={true}
              collapsed={collapsed}
              selectedKey={selectedKey}
              expandedKeys={expandedKeys}
              onMenuClick={onMenuClick}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 메인 CustomMenu 컴포넌트
const CustomMenu = ({
  onMenuClick,
  hasSearchResults = false,
  searchResultsCount = 0,
  collapsed = false
}: CustomMenuProps) => {
  const [selectedKey, setSelectedKey] = useState('dsd')
  const [expandedKeys, setExpandedKeys] = useState<string[]>(
    collapsed ? [] : ['customers', 'documents']
  )

  // 메뉴 클릭 핸들러
  const handleMenuClick = (key: string) => {
    setSelectedKey(key)
    if (onMenuClick) {
      onMenuClick(key)
    }
  }

  // 메인 메뉴 확장/축소 핸들러
  const handleToggleExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (collapsed) return

    setExpandedKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  // 메뉴 데이터 구조 - color.png와 완전 동일한 구조
  const menuItems: MenuItem[] = [
    // 검색 결과 (동적 표시)
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <MenuIcons.Search />,
      label: collapsed ? '' : `검색 결과 (${searchResultsCount}개)`,
      tooltipTitle: `검색 결과 (${searchResultsCount}개)`,
    }] : []),

    // 고객 관리 - color.png의 파란색 섹션
    {
      key: 'customers',
      icon: <MenuIcons.User />,
      label: collapsed ? '' : '고객 관리',
      tooltipTitle: '고객 관리',
      children: collapsed ? undefined : [
        {
          key: 'customers-all',
          icon: <MenuIcons.List />,
          label: '전체보기',
          tooltipTitle: '모든 고객을 보여줍니다',
        },
        {
          key: 'customers-regional',
          icon: <MenuIcons.Location />,
          label: '지역별 보기',
          tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
        },
        {
          key: 'customers-relationship',
          icon: <MenuIcons.Team />,
          label: '관계별 보기',
          tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
        }
      ]
    },

    // collapsed 상태에서 서브메뉴들을 개별적으로 표시
    ...(collapsed ? [
      {
        key: 'customers-all',
        icon: <MenuIcons.List />,
        label: '',
        tooltipTitle: '모든 고객을 보여줍니다',
      },
      {
        key: 'customers-regional',
        icon: <MenuIcons.Location />,
        label: '',
        tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
      },
      {
        key: 'customers-relationship',
        icon: <MenuIcons.Team />,
        label: '',
        tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
      }
    ] : []),

    // 문서 관리 - color.png의 청록색 섹션
    {
      key: 'documents',
      icon: <MenuIcons.FileText />,
      label: collapsed ? '' : '문서 관리',
      tooltipTitle: '문서 관리',
      children: collapsed ? undefined : [
        {
          key: 'dsd',
          icon: <MenuIcons.Dashboard />,
          label: '문서 처리 현황',
          tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
        }
      ]
    },

    // collapsed 상태에서 문서 서브메뉴 표시
    ...(collapsed ? [{
      key: 'dsd',
      icon: <MenuIcons.Dashboard />,
      label: '',
      tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
    }] : [])
  ]

  return (
    <div className="custom-menu">
      {menuItems.map(item => (
        <CustomMenuItem
          key={item.key}
          item={item}
          collapsed={collapsed}
          selectedKey={selectedKey}
          expandedKeys={expandedKeys}
          onMenuClick={handleMenuClick}
          onToggleExpand={handleToggleExpand}
        />
      ))}
    </div>
  )
}

export default CustomMenu