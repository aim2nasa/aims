import React, { useState } from 'react';
import { Input, Tree, Menu, Typography } from 'antd';
import { SolutionOutlined, StarOutlined, HistoryOutlined, DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined, EnvironmentOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { Search } = Input;

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount }) => {
  const [customerManagementExpanded, setCustomerManagementExpanded] = useState(false);
  
  const onSelect = (selectedKeys, info) => {
    // Tree 항목 선택 처리
  };

  const treeData = [
    {
      title: '즐겨찾기 고객',
      key: 'favorites',
      icon: <StarOutlined />,
      children: [
        // 실제 데이터는 props나 API를 통해 받아올 예정
      ],
    },
    {
      title: '최근 고객',
      key: 'recent',
      icon: <HistoryOutlined />,
      children: [
        // 실제 데이터는 props나 API를 통해 받아올 예정
      ],
    },
    {
      title: '전체 고객',
      key: 'all',
      icon: <SolutionOutlined />,
      children: [
        // 실제 데이터는 props나 API를 통해 받아올 예정
      ],
    },
  ];

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
      <Title level={4}>고객 탐색</Title>
      <Search
        placeholder="고객 검색"
        style={{ marginBottom: 16 }}
        onSearch={(value) => {
          // 고객 검색 처리
        }}
      />
      <Tree
        showIcon
        defaultExpandAll
        onSelect={onSelect}
        treeData={treeData}
      />
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