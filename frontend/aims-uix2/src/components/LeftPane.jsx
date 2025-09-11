import React from 'react';
import { Menu } from 'antd';
import { DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined, FileTextOutlined } from '@ant-design/icons';

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount, collapsed }) => {
  // collapsed 상태에 따라 다른 메뉴 구조
  const menuItems = collapsed ? [
    // collapsed 상태일 때의 메뉴 구조
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: ``,
      title: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
    
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: '',
      title: '고객 관리',
    },
    {
      key: 'customers-all',
      icon: <UnorderedListOutlined />,
      label: '',
      title: '전체보기',
      style: { paddingLeft: '12px' }
    },
    {
      key: 'customers-regional',
      icon: <EnvironmentOutlined />,
      label: '',
      title: '지역별 보기',
      style: { paddingLeft: '12px' }
    },
    {
      key: 'customers-relationship',
      icon: <TeamOutlined />,
      label: '',
      title: '관계별 보기',
      style: { paddingLeft: '12px' }
    },
    {
      key: 'documents',
      icon: <FileTextOutlined />,
      label: '',
      title: '문서 관리',
    },
    {
      key: 'dsd',
      icon: <DashboardOutlined />,
      label: '',
      title: '문서 처리 현황',
      style: { paddingLeft: '12px' }
    },
  ] : [
    // 펼쳐진 상태일 때의 메뉴 구조
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
    
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: '고객 관리',
      onTitleClick: ({ key }) => onMenuClick && onMenuClick(key),
      children: [
        {
          key: 'customers-all',
          icon: <UnorderedListOutlined />,
          label: '전체보기',
        },
        {
          key: 'customers-regional',
          icon: <EnvironmentOutlined />,
          label: '지역별 보기',
        },
        {
          key: 'customers-relationship',
          icon: <TeamOutlined />,
          label: '관계별 보기',
        }
      ],
    },
    {
      key: 'documents',
      icon: <FileTextOutlined />,
      label: '문서 관리',
      onTitleClick: ({ key }) => onMenuClick && onMenuClick(key),
      children: [
        {
          key: 'dsd',
          icon: <DashboardOutlined />,
          label: '문서 처리 현황',
        }
      ],
    },
  ];

  return (
    <div>
      <Menu 
        items={menuItems} 
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