import React from 'react';
import { Card, Button, Space, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import PDFViewer from './PDFViewer'; // PDFViewer 컴포넌트 임포트

const { Title, Paragraph, Text } = Typography;

const RightPane = ({ document, onClose }) => {
  if (!document) {
    return null;
  }

  const documentFileUrl = document.fileUrl;

  return (
    <Card
      title={document.name}
      extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      bordered={false}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
	  <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        <PDFViewer file={documentFileUrl} />
      </div>
	  
	  <Space direction="vertical" style={{ width: '100%' }}>
        <Paragraph>
          <Text strong>문서 유형:</Text> {document.type}
        </Paragraph>
        <Paragraph>
          <Text strong>업로드일:</Text> {document.date}
        </Paragraph>
      </Space>

      <Space style={{ marginTop: 16 }}>
        <Button type="primary">전체 문서 보기</Button>
        <Button>다운로드</Button>
      </Space>
    </Card>
  );
};

export default RightPane;