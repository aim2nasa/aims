import React from 'react';
import { Input, Tree, Menu, Typography } from 'antd';
import { SolutionOutlined, FolderOutlined, StarOutlined, HistoryOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { Search } = Input;

const LeftPane = () => {
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
      <Menu items={menuItems} mode="inline" defaultSelectedKeys={['1']} />
    </div>
  );
};

export default LeftPane;