import React from 'react';
import { Menu } from 'antd';
import { DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined } from '@ant-design/icons';

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount }) => {
  const menuItems = [
    // 검색 결과 (동적으로 표시)
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
    
    // 고객 관리 (항상 펼쳐진 메뉴)
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: '고객 관리',
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
    
    // 문서 처리 현황
    {
      key: 'dsd',
      icon: <DashboardOutlined />,
      label: '문서 처리 현황',
    },
  ];

  return (
    <div>
      <Menu 
        items={menuItems} 
        mode="inline" 
        defaultSelectedKeys={['dsd']} 
        openKeys={['customers']}
        onOpenChange={() => {}}
        onClick={({ key }) => onMenuClick && onMenuClick(key)}
        expandIcon={() => null}
      />
    </div>
  );
};

export default LeftPane;