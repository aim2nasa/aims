import React, { useState } from 'react';
import { Card, List, Typography, Button, Space, Tag, Select, Tree } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, FileTextOutlined, FolderOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const mockTreeDocuments = [
  {
    title: '2025년 계약 문서',
    key: '0-0',
    icon: <FolderOutlined />,
    children: [
      {
        title: '2025년 보험 가입 설계서',
        key: '0-0-0',
        icon: <FileTextOutlined />,
        data: { id: 1, name: '2025년 보험 가입 설계서', type: '계약서', date: '2025-08-15', status: '정상', fileUrl: '/test.pdf' },
      },
      {
        title: '주택 화재 보험 계약서',
        key: '0-0-1',
        icon: <FileTextOutlined />,
        data: { id: 4, name: '주택 화재 보험 계약서', type: '계약서', date: '2025-07-20', status: '정상', fileUrl: '/test.pdf' },
      },
    ],
  },
  {
    title: '기타 문서',
    key: '0-1',
    icon: <FolderOutlined />,
    children: [
      {
        title: '치과 진료비 청구서',
        key: '0-1-0',
        icon: <FileTextOutlined />,
        data: { id: 2, name: '치과 진료비 청구서', type: '청구서', date: '2025-08-10', status: '처리중', fileUrl: '/test.pdf' },
      },
      {
        title: '자동차 보험증권',
        key: '0-1-1',
        icon: <FileTextOutlined />,
        data: { id: 3, name: '자동차 보험증권', type: '보험증권', date: '2025-07-28', status: '정상', fileUrl: '/test.pdf' },
      },
    ],
  },
];

const mockListDocuments = [
  { id: 1, name: '2025년 보험 가입 설계서', type: '계약서', date: '2025-08-15', status: '정상', fileUrl: '/test.pdf' },
  { id: 2, name: '치과 진료비 청구서', type: '청구서', date: '2025-08-10', status: '처리중', fileUrl: '/test.pdf' },
  { id: 3, name: '자동차 보험증권', type: '보험증권', date: '2025-07-28', status: '정상', fileUrl: '/test.pdf' },
  { id: 4, name: '주택 화재 보험 계약서', type: '계약서', date: '2025-07-20', status: '정상', fileUrl: '/test.pdf' },
];

const CenterPane = ({ onDocumentClick }) => {
  const [viewMode, setViewMode] = React.useState('list');

  const onTreeSelect = (selectedKeys, info) => {
    if (info.node.data) {
      onDocumentClick(info.node.data);
    }
  };

  const filteredDocuments = mockListDocuments; // 필터링 로직 제거

  return (
    <Card
      title={<Title level={4}>문서 목록</Title>}
      extra={
        <Space>
          <Select defaultValue="업로드일" style={{ width: 120 }}>
            <Option value="업로드일">업로드일</Option>
            <Option value="문서명">문서명</Option>
            <Option value="상태">상태</Option>
          </Select>
          <Button.Group>
            <Button icon={<FileTextOutlined />} onClick={() => setViewMode('tree')} />
            <Button icon={<UnorderedListOutlined />} onClick={() => setViewMode('list')} />
            <Button icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} disabled />
          </Button.Group>
        </Space>
      }
      style={{ minHeight: '100%', borderRadius: 8 }}
    >
      {viewMode === 'list' && (
        <List
          itemLayout="horizontal"
          dataSource={filteredDocuments}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              onClick={() => onDocumentClick(item)}
              style={{ cursor: 'pointer', padding: '12px 0' }}
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                title={
                  <Space>
                    <Text>{item.name}</Text>
                    <Tag color="blue">{item.type}</Tag>
                  </Space>
                }
                description={
                  <Space size="middle">
                    <Text type="secondary">업로드일: {item.date}</Text>
                    <Text type="secondary">상태: {item.status}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
      
      {viewMode === 'tree' && (
        <Tree
          showIcon
          defaultExpandAll
          onSelect={onTreeSelect}
          treeData={mockTreeDocuments}
          style={{ cursor: 'pointer' }}
        />
      )}
    </Card>
  );
};

export default CenterPane;