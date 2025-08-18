import React from 'react';
import { Card, Button, Space, Typography, message } from 'antd';
import { CloseOutlined, DownloadOutlined } from '@ant-design/icons';
import PDFViewer from './PDFViewer';
import axios from 'axios';

const { Title, Paragraph, Text } = Typography;

const RightPane = ({ document, onClose }) => {
  if (!document) {
    return null;
  }

  const documentFileUrl = document.fileUrl;
  const isPdf = documentFileUrl && documentFileUrl.toLowerCase().endsWith('.pdf');

  const handleDownload = async () => {
    // API 응답 필드명에 따라 destPath와 originalName을 추출
    const destPath = document.destPath || document.payload?.dest_path;
    const originalName = document.originalName || document.payload?.original_name;

    if (!destPath || !originalName) {
      message.error('파일 경로가 유효하지 않습니다.');
      return;
    }

    // URL에서 '/data' 부분을 제거하고 올바른 URL을 생성
    const correctedPath = destPath.startsWith('/data/files/') ? destPath.replace('/data', '') : destPath;
    const fileUrl = `https://tars.giize.com${correctedPath}`;

    try {
      const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'blob',
      });

      // ✅ 수정된 부분: document 객체 유효성 검사 추가
      if (typeof window !== 'undefined' && window.document) {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        
        const link = window.document.createElement('a');
        link.href = url;
        link.setAttribute('download', originalName);
        window.document.body.appendChild(link);
        link.click();
        
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
        message.success(`${originalName} 파일 다운로드가 시작됩니다.`);
      } else {
        message.error('브라우저 환경이 아니거나 document 객체를 사용할 수 없습니다.');
      }
    } catch (error) {
      message.error('파일 다운로드에 실패했습니다. 네트워크 오류를 확인해주세요.');
      console.error('Download error:', error);
    }
  };

  return (
    <Card
      title={document.name}
      extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      bordered={false}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {isPdf ? (
          <PDFViewer file={documentFileUrl} />
        ) : (
          <p>이 문서는 PDF가 아닙니다.</p>
        )}
      </div>

      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={5}>문서 정보</Title>
        <Paragraph>
          <Text strong>문서 유형:</Text> {document.type}
        </Paragraph>
        <Paragraph>
          <Text strong>업로드일:</Text> {document.date}
        </Paragraph>
      </Space>

      <Space style={{ marginTop: 16 }}>
        <Button onClick={handleDownload} icon={<DownloadOutlined />}>다운로드</Button>
      </Space>
    </Card>
  );
};

export default RightPane;