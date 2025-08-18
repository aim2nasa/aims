import React from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography; // 'Text' 추가

const RightPane = ({ document, onClose }) => {
  if (!document) {
    return null;
  }

  return (
    <Card
      title={document.name}
      extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      bordered={false}
      style={{ height: '100%' }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={5}>문서 정보</Title>
        <Paragraph>
          <Text strong>문서 유형:</Text> {document.type}
        </Paragraph>
        <Paragraph>
          <Text strong>업로드일:</Text> {document.date}
        </Paragraph>

        <Title level={5} style={{ marginTop: 24 }}>문서 내용 미리보기</Title>
        <div style={{ height: '60vh', background: '#f0f2f5', border: '1px solid #d9d9d9', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Button type="primary">PDF/이미지 뷰어 컴포넌트 자리</Button>
        </div>

        <Space style={{ marginTop: 16 }}>
          <Button type="primary">전체 문서 보기</Button>
          <Button>다운로드</Button>
        </Space>
      </Space>
    </Card>
  );
};

export default RightPane;