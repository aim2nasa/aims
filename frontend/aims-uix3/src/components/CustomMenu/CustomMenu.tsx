import { useState, ReactNode, useMemo, memo, useEffect } from 'react'
import { useNavigation } from '../../hooks/useNavigation'
import { getAllNavigableKeys } from '../../utils/navigationUtils'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import Tooltip from '../../shared/ui/Tooltip'
import './CustomMenu.css'
import './CustomMenuTooltip.css'

// SF Symbol 기반 아이콘 컴포넌트들 (애플 디자인 표준 준수)
const MenuIcons = {
  User: () => (
    <SFSymbol
      name="person"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  List: () => (
    <SFSymbol
      name="list-bullet"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  Location: () => (
    <SFSymbol
      name="location"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  Team: () => (
    <SFSymbol
      name="heart-fill"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  FileText: () => (
    <SFSymbol
      name="doc"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  Dashboard: ({ style }: { style?: React.CSSProperties } = {}) => (
    <SFSymbol
      name="chart-bar"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
      {...(style ? { style } : {})}
    />
  ),
  Search: () => (
    <SFSymbol
      name="magnifyingglass"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  ChevronDown: () => (
    <SFSymbol
      name="chevron-down"
      size={SFSymbolSize.FOOTNOTE}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  SearchBold: ({ style }: { style?: React.CSSProperties } = {}) => (
    <SFSymbol
      name="search-bold"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
      {...(style ? { style } : {})}
    />
  ),
  Library: ({ style }: { style?: React.CSSProperties } = {}) => (
    <SFSymbol
      name="books-vertical"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
      {...(style ? { style } : {})}
    />
  ),
  Folder: () => (
    <SFSymbol
      name="folder"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  // 계약 관리 아이콘
  Contract: () => (
    <SFSymbol
      name="briefcase-fill"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  ContractAll: () => (
    <SFSymbol
      name="tablecells"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),
  ContractImport: () => (
    <SFSymbol
      name="tablecells"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  )
}

// 메뉴 아이템 타입 정의
export interface MenuItem {
  key: string
  icon: ReactNode
  label: string
  tooltipTitle: string
  children?: MenuItem[] | undefined
}

// 컴포넌트 Props 타입 정의
interface CustomMenuProps {
  onMenuClick?: (key: string) => void
  hasSearchResults?: boolean
  searchResultsCount?: number
  collapsed?: boolean
  selectedKey?: string // 외부에서 제어되는 선택된 키
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
  const handleMainMenuClick = () => {
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

  const menuContent = (
    <div
      className={className}
      onClick={handleMainMenuClick}
      onDoubleClick={handleDoubleClick}
      data-menu-key={item.key}
      id={`menu-item-${item.key}`}
      role="menuitem"
      aria-selected={isSelected}
      aria-label={item.tooltipTitle}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-haspopup={hasChildren ? 'menu' : undefined}
      aria-current={isSelected ? 'page' : undefined}
      tabIndex={-1}
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

  const content = collapsed ? (
    <Tooltip content={item.tooltipTitle} placement="right">
      {menuContent}
    </Tooltip>
  ) : (
    menuContent
  )

  return (
    <div key={item.key}>
      {content}
      {hasChildren && !collapsed && (
        <div
          className={`sub-menu-container ${isExpanded ? 'expanded' : ''}`}
          role="menu"
          aria-label={`${item.label} 하위 메뉴`}
        >
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
  collapsed = false,
  selectedKey: externalSelectedKey = 'dsd' // 외부에서 제어, 기본값은 'dsd'
}: CustomMenuProps) => {
  const selectedKey = externalSelectedKey // 외부 제어 키 사용
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  // 🍎 collapsed 상태 변화 감지 및 계층적 Progressive Disclosure
  useEffect(() => {
    if (!collapsed) {
      // 햄버거 버튼으로 펼침: 무조건 모든 서브메뉴 접기에서 시작
      if (import.meta.env.DEV) {
        console.log('[CustomMenu] LeftPane 펼침 - 계층적 애니메이션 시작')
      }
      setExpandedKeys([]) // 강제로 모든 서브메뉴 접기

      // 1단계: 200ms 후 자주 사용 펼침
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[CustomMenu] 1단계 - 자주 사용 펼침')
        }
        setExpandedKeys(['quick-actions'])
      }, 200)

      // 2단계: 400ms 후 고객도 펼침
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[CustomMenu] 2단계 - 고객 추가 펼침')
        }
        setExpandedKeys(['quick-actions', 'customers'])
      }, 400)

      // 3단계: 600ms 후 계약도 펼침
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[CustomMenu] 3단계 - 계약 추가 펼침')
        }
        setExpandedKeys(['quick-actions', 'customers', 'contracts'])
      }, 600)

      // 4단계: 800ms 후 문서도 펼침
      setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[CustomMenu] 4단계 - 문서 추가 펼침')
        }
        setExpandedKeys(['quick-actions', 'customers', 'contracts', 'documents'])
      }, 800)
    }
  }, [collapsed]) // collapsed 상태 변화만 감지

  // 메뉴 데이터 구조 - UX 최적화된 새로운 구조
  const menuItems: MenuItem[] = useMemo(() => [
    // 검색 결과 (동적 표시)
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <MenuIcons.Search />,
      label: collapsed ? '' : `검색 결과 (${searchResultsCount}개)`,
      tooltipTitle: `검색 결과 (${searchResultsCount}개)`,
    }] : []),

    // ━━━ 빠른 작업 ━━━
    {
      key: 'quick-actions',
      icon: <span className="menu-icon-orange"><SFSymbol name="bolt-fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>,
      label: collapsed ? '' : '빠른 작업',
      tooltipTitle: '빠른 작업',
      children: collapsed ? undefined : [
        {
          key: 'customers-register',
          icon: <SFSymbol name="person-fill-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
          label: '새 고객 등록',
          tooltipTitle: '새로운 고객을 등록합니다',
        },
        {
          key: 'documents-register',
          icon: <span className="menu-icon-orange"><SFSymbol name="doc-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>,
          label: '새 문서 등록',
          tooltipTitle: '새로운 문서를 등록합니다',
        },
        {
          key: 'contracts-import',
          icon: <span className="menu-icon-green"><MenuIcons.ContractImport /></span>,
          label: '계약 가져오기',
          tooltipTitle: '엑셀 파일에서 계약 정보를 가져옵니다',
        }
      ]
    },

    // collapsed 상태에서 자주 사용 서브메뉴 표시
    ...(collapsed ? [
      {
        key: 'customers-register',
        icon: <SFSymbol name="person-fill-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
        label: '',
        tooltipTitle: '새로운 고객을 등록합니다',
      },
      {
        key: 'documents-register',
        icon: <span className="menu-icon-orange"><SFSymbol name="doc-badge-plus" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} /></span>,
        label: '',
        tooltipTitle: '새로운 문서를 등록합니다',
      },
      {
        key: 'contracts-import',
        icon: <span className="menu-icon-green"><MenuIcons.ContractImport /></span>,
        label: '',
        tooltipTitle: '엑셀 파일에서 계약 정보를 가져옵니다',
      }
    ] : []),

    // ━━━ 고객 ━━━
    {
      key: 'customers',
      icon: <MenuIcons.User />,
      label: collapsed ? '' : '고객',
      tooltipTitle: '고객',
      children: collapsed ? undefined : [
        {
          key: 'customers-all',
          icon: <MenuIcons.List />,
          label: '전체 고객 보기',
          tooltipTitle: '모든 고객을 보여줍니다',
        },
        {
          key: 'customers-regional',
          icon: <MenuIcons.Location />,
          label: '지역별 고객 보기',
          tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
        },
        {
          key: 'customers-relationship',
          icon: <span className="menu-icon-pink"><MenuIcons.Team /></span>,
          label: '관계별 고객 보기',
          tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
        }
      ]
    },

    // collapsed 상태에서 고객 서브메뉴 표시
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
        icon: <span className="menu-icon-pink"><MenuIcons.Team /></span>,
        label: '',
        tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
      }
    ] : []),

    // ━━━ 계약 ━━━
    {
      key: 'contracts',
      icon: <span className="menu-icon-blue"><MenuIcons.Contract /></span>,
      label: collapsed ? '' : '계약',
      tooltipTitle: '계약',
      children: collapsed ? undefined : [
        {
          key: 'contracts-all',
          icon: <span className="menu-icon-purple"><MenuIcons.ContractAll /></span>,
          label: '전체 계약 보기',
          tooltipTitle: '모든 계약을 보여줍니다',
        }
      ]
    },

    // collapsed 상태에서 계약 서브메뉴 표시
    ...(collapsed ? [
      {
        key: 'contracts-all',
        icon: <span className="menu-icon-purple"><MenuIcons.ContractAll /></span>,
        label: '',
        tooltipTitle: '모든 계약을 보여줍니다',
      }
    ] : []),

    // ━━━ 문서 ━━━
    {
      key: 'documents',
      icon: <MenuIcons.FileText />,
      label: collapsed ? '' : '문서',
      tooltipTitle: '문서',
      children: collapsed ? undefined : [
        {
          key: 'documents-library',
          icon: <span className="menu-icon-purple"><MenuIcons.Library /></span>,
          label: '전체 문서 보기',
          tooltipTitle: '모든 문서를 보여줍니다',
        },
        {
          key: 'documents-search',
          icon: <span className="menu-icon-blue"><MenuIcons.SearchBold /></span>,
          label: '문서 검색',
          tooltipTitle: '문서를 검색합니다',
        }
      ]
    },

    // collapsed 상태에서 문서 서브메뉴 표시
    ...(collapsed ? [
      {
        key: 'documents-library',
        icon: <span className="menu-icon-purple"><MenuIcons.Library /></span>,
        label: '',
        tooltipTitle: '모든 문서를 보여줍니다',
      },
      {
        key: 'documents-search',
        icon: <span className="menu-icon-blue"><MenuIcons.SearchBold /></span>,
        label: '',
        tooltipTitle: '문서를 검색합니다',
      }
    ] : [])
  ], [collapsed, hasSearchResults, searchResultsCount])

  // 네비게이션 가능한 키 추출 (메뉴 구조 변경 시 자동 업데이트)
  const navigableKeys = useMemo(() =>
    getAllNavigableKeys(menuItems, collapsed, expandedKeys),
    [menuItems, collapsed, expandedKeys]
  )

  // 메뉴 클릭 핸들러
  const handleMenuClick = (key: string) => {
    // 선택 변경 시 모든 메뉴 아이템의 포커스 제거 (시각적 흔적 방지)
    const menuItems = document.querySelectorAll('.custom-menu-item')
    menuItems.forEach(item => {
      if (item instanceof HTMLElement) {
        item.blur()
      }
    })

    // 메뉴 컨테이너에 포커스를 주어 키보드 네비게이션 활성화
    const menuContainer = document.querySelector('.custom-menu') as HTMLElement
    if (menuContainer) {
      menuContainer.focus()
    }

    // selectedKey는 외부에서 제어되므로 setSelectedKey 제거
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

  // 네비게이션 훅 통합 (휠 + 키보드)
  const navigation = useNavigation({
    items: navigableKeys,
    selectedKey,
    onSelectionChange: handleMenuClick,
    disabled: false,
    scrollSensitivity: 50, // 더 민감하게 조정 (빠른 반응)
    circular: true,
    enableKeyboard: true,
    onEnter: (key: string) => {
      // Enter 키로 메뉴 아이템 활성화
      handleMenuClick(key)
    },
    onEscape: () => {
      // Escape 키로 첫 번째 메뉴로 복귀 (선택사항)
      if (navigableKeys.length > 0 && navigableKeys[0]) {
        handleMenuClick(navigableKeys[0])
      }
    }
  })

  // 메뉴 컨테이너 클릭 시 포커스 설정
  const handleMenuContainerClick = (e: React.MouseEvent) => {
    // 메뉴 아이템 클릭이 아닌 컨테이너 직접 클릭일 때만
    if (e.target === e.currentTarget) {
      const menuContainer = e.currentTarget as HTMLElement
      menuContainer.focus()
    }
  }

  // 마우스 호버 시 자동 포커스 (애플 스타일 Progressive Enhancement)
  const handleMenuContainerMouseEnter = () => {
    const menuContainer = document.querySelector('.custom-menu') as HTMLElement
    if (menuContainer) {
      menuContainer.focus()
    }
  }

  return (
    <div
      className="custom-menu"
      onWheel={navigation.onWheel}
      onKeyDown={navigation.onKeyDown}
      onClick={handleMenuContainerClick}
      onMouseEnter={handleMenuContainerMouseEnter}
      tabIndex={0}
      role="menu"
      aria-label="메인 메뉴"
      aria-activedescendant={`menu-item-${selectedKey}`}
      aria-orientation="vertical"
      aria-expanded="true"
    >
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

export default memo(CustomMenu)
