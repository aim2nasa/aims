import React, { useState } from 'react';
import { Card, List, Typography, Button, Space, Tag, Select, Tree, Spin, Empty } from 'antd';
import { UnorderedListOutlined, AppstoreOutlined, FileTextOutlined, FolderOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

// ✅ 향후 테스트를 위해 Mock 데이터는 그대로 유지합니다.
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
        data: { id: 1, name: '2025년 보험 가입 설계서', type: '계약서', date: '2025-08-15', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.95 } },
      },
      {
        title: '주택 화재 보험 계약서',
        key: '0-0-1',
        icon: <FileTextOutlined />,
        data: { id: 4, name: '주택 화재 보험 계약서', type: '계약서', date: '2025-07-20', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.88 } },
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
        data: { id: 2, name: '치과 진료비 청구서', type: '청구서', date: '2025-08-10', status: '처리중', fileUrl: '/test.pdf', ocr: { confidence: 0.72 } },
      },
      {
        title: '자동차 보험증권',
        key: '0-1-1',
        icon: <FileTextOutlined />,
        data: { id: 3, name: '자동차 보험증권', type: '보험증권', date: '2025-07-28', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.99 } },
      },
    ],
  },
];

const mockListDocuments = [
  { id: 1, name: '2025년 보험 가입 설계서', type: '계약서', date: '2025-08-15', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.95 } },
  { id: 2, name: '치과 진료비 청구서', type: '청구서', date: '2025-08-10', status: '처리중', fileUrl: '/test.pdf', ocr: { confidence: 0.72 } },
  { id: 3, name: '자동차 보험증권', type: '보험증권', date: '2025-07-28', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.99 } },
  { id: 4, name: '주택 화재 보험 계약서', type: '계약서', date: '2025-07-20', status: '정상', fileUrl: '/test.pdf', ocr: { confidence: 0.88 } },
];

const CenterPane = ({ onDocumentClick, searchResults, isLoading }) => {
  const [viewMode, setViewMode] = useState('list');

  const onTreeSelect = (selectedKeys, info) => {
    if (info.node.data) {
      onDocumentClick(info.node.data);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <p style={{ marginTop: '20px', color: 'rgba(0, 0, 0, 0.45)' }}>
            문서를 검색 중입니다...
          </p>
        </div>
      );
    }

    if (searchResults.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Empty description="검색 결과가 없습니다." />
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <List
          itemLayout="horizontal"
          dataSource={searchResults}
          renderItem={(item) => (
            <List.Item
              key={item.id || item.payload?.doc_id}
              onClick={() => onDocumentClick(item)}
              style={{ cursor: 'pointer', padding: '12px 0' }}
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                title={
                  <Space>
                    <Text>{item.originalName || item.payload?.original_name || item.name || '이름 없음'}</Text>
                    {item.type && (
                       <Tag color="blue">{item.type}</Tag>
                    )}
                    {/* ✅ 수정된 부분: Confidence를 제목 옆에 위치시키고 문구를 태그 안에 포함 */}
                    {item.ocr?.confidence && (
                        <Tag color="blue">Confidence: {item.ocr.confidence}</Tag>
                    )}
                  </Space>
                }
                description={
                  <Space size="middle">
                    <Text type="secondary">{item.ocr?.summary || item.payload?.summary || '요약 정보: 없음'}</Text>
                    {item.score && (
                       <Text type="secondary">유사도: <Tag color="green">{item.score.toFixed(4)}</Tag></Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      );
    }

    if (viewMode === 'tree') {
      return (
        <Tree
          showIcon
          defaultExpandAll
          onSelect={onTreeSelect}
          treeData={mockTreeDocuments}
          style={{ cursor: 'pointer' }}
        />
      );
    }
  };

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
      {renderContent()}
    </Card>
  );
};

export default CenterPane;