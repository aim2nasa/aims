import React, { useState } from 'react';
import { Menu, Typography } from 'antd';
import { DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined } from '@ant-design/icons';

const { Title } = Typography;

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount }) => {
  const [customerManagementExpanded, setCustomerManagementExpanded] = useState(false);

  const menuItems = [
    // 검색 결과 (동적으로 표시)
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
    
    // 고객 관리 (접을 수 있는 메뉴)
    {
      key: 'customers',
      icon: <UserOutlined />,
      label: (
        <span onClick={(e) => {
          e.stopPropagation();
          setCustomerManagementExpanded(!customerManagementExpanded);
        }}>
          고객 관리
        </span>
      ),
      children: customerManagementExpanded ? [
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
      ] : undefined,
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
      <Title level={4} style={{ marginTop: 24 }}>문서 유형별</Title>
      <Menu 
        items={menuItems} 
        mode="inline" 
        defaultSelectedKeys={['dsd']} 
        onClick={({ key }) => onMenuClick && onMenuClick(key)}
      />
    </div>
  );
};

export default LeftPane;