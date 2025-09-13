import React from 'react';
import { Menu, Tooltip } from 'antd';
import { DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined, FileTextOutlined } from '@ant-design/icons';

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount, collapsed }) => {
  // collapsed 상태에 따라 다른 메뉴 구조
  const menuItems = collapsed ? [
    // collapsed 상태일 때의 메뉴 구조
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: ``,
      tooltipTitle: `검색 결과 (${searchResultsCount || 0}개)`,
      className: 'menu-item-search-results'
    }] : []),
    
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: '',
      tooltipTitle: '고객 관리',
      className: 'menu-item-customers'
    },
    {
      key: 'customers-all',
      icon: <UnorderedListOutlined />,
      label: '',
      tooltipTitle: '모든 고객을 보여줍니다',
      style: { paddingLeft: '12px' },
      className: 'menu-item-customers-all'
    },
    {
      key: 'customers-regional',
      icon: <EnvironmentOutlined />,
      label: '',
      tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
      style: { paddingLeft: '12px' },
      className: 'menu-item-customers-regional'
    },
    {
      key: 'customers-relationship',
      icon: <TeamOutlined />,
      label: '',
      tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
      style: { paddingLeft: '12px' },
      className: 'menu-item-customers-relationship'
    },
    {
      key: 'documents',
      icon: <FileTextOutlined />,
      label: '',
      tooltipTitle: '문서 관리',
      className: 'menu-item-documents'
    },
    {
      key: 'dsd',
      icon: <DashboardOutlined />,
      label: '',
      tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
      style: { paddingLeft: '12px' },
      className: 'menu-item-dsd'
    },
  ] : [
    // 펼쳐진 상태일 때의 메뉴 구조
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: `검색 결과 (${searchResultsCount || 0}개)`,
      tooltipTitle: `검색 결과 (${searchResultsCount || 0}개)`,
      className: 'menu-item-search-results'
    }] : []),
    
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: '고객 관리',
      tooltipTitle: '고객 관리',
      onTitleClick: ({ key }) => onMenuClick && onMenuClick(key),
      className: 'menu-item-customers',
      children: [
        {
          key: 'customers-all',
          icon: <UnorderedListOutlined />,
          label: '전체보기',
          tooltipTitle: '모든 고객을 보여줍니다',
          className: 'menu-item-customers-all'
        },
        {
          key: 'customers-regional',
          icon: <EnvironmentOutlined />,
          label: '지역별 보기',
          tooltipTitle: '지역별로 고객을 분류하여 보여줍니다',
          className: 'menu-item-customers-regional'
        },
        {
          key: 'customers-relationship',
          icon: <TeamOutlined />,
          label: '관계별 보기',
          tooltipTitle: '가족 관계별로 고객을 분류하여 보여줍니다',
          className: 'menu-item-customers-relationship'
        }
      ],
    },
    {
      key: 'documents',
      icon: <FileTextOutlined />,
      label: '문서 관리',
      tooltipTitle: '문서 관리',
      onTitleClick: ({ key }) => onMenuClick && onMenuClick(key),
      className: 'menu-item-documents',
      children: [
        {
          key: 'dsd',
          icon: <DashboardOutlined />,
          label: '문서 처리 현황',
          tooltipTitle: '문서 처리 상태와 통계를 확인합니다',
          className: 'menu-item-dsd'
        }
      ],
    },
  ];

  // 커스텀 메뉴 아이템 렌더링 함수
  const renderMenuItem = (item) => {
    if (item.children) {
      return {
        key: item.key,
        icon: item.icon,
        className: item.className,
        onTitleClick: item.onTitleClick,
        children: item.children.map(child => ({
          key: child.key,
          icon: child.icon,
          className: child.className,
          style: child.style,
          label: (
            <Tooltip title={child.tooltipTitle} placement="right">
              <span>{child.label}</span>
            </Tooltip>
          )
        })),
        label: (
          <Tooltip title={item.tooltipTitle} placement="right">
            <span>{item.label}</span>
          </Tooltip>
        )
      };
    }
    
    return {
      key: item.key,
      icon: item.icon,
      className: item.className,
      style: item.style,
      label: (
        <Tooltip title={item.tooltipTitle} placement="right">
          <span>{item.label || ''}</span>
        </Tooltip>
      )
    };
  };

  // 메뉴 아이템들에 툴팁 적용
  const processedMenuItems = menuItems.map(renderMenuItem);

  return (
    <div>
      <Menu 
        items={processedMenuItems} 
        mode="inline" 
        defaultSelectedKeys={['dsd']} 
        openKeys={collapsed ? [] : ['customers', 'documents']}
        onOpenChange={() => {}}
        onClick={({ key }) => onMenuClick && onMenuClick(key)}
        expandIcon={() => null}
        className="leftpane-menu"
        style={{
          backgroundColor: 'transparent',
          border: 'none'
        }}
      />
    </div>
  );
};

export default LeftPane;