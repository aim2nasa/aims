import React, { useState } from 'react';
import { Input, Tree, Menu, Typography } from 'antd';
import { SolutionOutlined, FolderOutlined, StarOutlined, HistoryOutlined, DashboardOutlined, SearchOutlined, UserOutlined, UnorderedListOutlined, TeamOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { Search } = Input;

const LeftPane = ({ onMenuClick, hasSearchResults, searchResultsCount }) => {
  const [customerManagementExpanded, setCustomerManagementExpanded] = useState(false);
  
  const onSelect = (selectedKeys, info) => {
    console.log('선택된 항목:', selectedKeys, info);
  };

  const treeData = [
    {
      title: '즐겨찾기 고객',
      key: 'favorites',
      icon: <StarOutlined />,
      children: [
        { title: '김민준 고객', key: 'kim-min-jun' },
        { title: '박서준 고객', key: 'park-seo-jun' },
      ],
    },
    {
      title: '최근 고객',
      key: 'recent',
      icon: <HistoryOutlined />,
      children: [
        { title: '최유리 고객', key: 'choi-yoo-ri' },
      ],
    },
    {
      title: '전체 고객',
      key: 'all',
      icon: <SolutionOutlined />,
      children: [
        { title: '이재원 고객', key: 'lee-jae-won' },
        { title: '한지아 고객', key: 'han-ji-a' },
      ],
    },
  ];

  const menuItems = [
    // 검색 결과가 있을 때만 "검색 결과" 메뉴 표시
    ...(hasSearchResults ? [{
      key: 'search-results',
      icon: <SearchOutlined />,
      label: `검색 결과 (${searchResultsCount || 0}개)`,
    }] : []),
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
          key: 'customers-relationship',
          icon: <TeamOutlined />,
          label: '관계별 보기',
        }
      ] : undefined,
    },
    {
      key: 'dsd',
      icon: <DashboardOutlined />,
      label: '문서 처리 현황',
    },
    {
      key: '1',
      icon: <FolderOutlined />,
      label: '보험증권',
    },
    {
      key: '2',
      icon: <FolderOutlined />,
      label: '계약서',
    },
    {
      key: '3',
      icon: <FolderOutlined />,
      label: '청구서',
    },
  ];

  return (
    <div>
      <Title level={4}>고객 탐색</Title>
      <Search
        placeholder="고객 검색"
        style={{ marginBottom: 16 }}
        onSearch={(value) => console.log('고객 검색:', value)}
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
        defaultSelectedKeys={['1']} 
        onClick={({ key }) => onMenuClick && onMenuClick(key)}
      />
    </div>
  );
};

export default LeftPane;