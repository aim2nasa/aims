import React from 'react';
import { Card, Button, message, Space } from 'antd';
import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import PDFViewer from './PDFViewer';
import ImageViewer from './ImageViewer';
import CustomerDetailPanel from './CustomerDetailPanel';
import axios from 'axios';


const RightPane = ({ contentType, document, customer, onClose, onResetRatio }) => {
  if (!contentType || (!document && !customer)) {
    return null;
  }

  // 고객 정보 표시
  if (contentType === 'customer' && customer) {
    return (
      <CustomerDetailPanel
        customerId={customer._id}
        onClose={onClose}
        onResetRatio={onResetRatio}
      />
    );
  }

  // 문서 정보 표시 (기존 로직)
  if (contentType === 'document' && document) {
    return <DocumentViewer document={document} onClose={onClose} onResetRatio={onResetRatio} />;
  }

  return null;
};

const DocumentViewer = ({ document, onClose, onResetRatio }) => {
  if (!document) {
    return null;
  }

  const documentFileUrl = document.fileUrl;
  const isPdf = documentFileUrl && documentFileUrl.toLowerCase().endsWith('.pdf');
  const isImage = documentFileUrl && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(documentFileUrl.toLowerCase());

  const handleDownload = async () => {
    const destPath = document.upload.destPath || document.payload?.dest_path;
    const originalName = document.upload.originalName || document.payload?.original_name;

    if (!destPath || !originalName) {
      message.error('파일 경로가 유효하지 않습니다.');
      return;
    }

    const correctedPath = destPath.startsWith('/data/files/') ? destPath.replace('/data', '') : destPath;
    const fileUrl = `https://tars.giize.com${correctedPath}`;

    try {
      const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'blob',
      });

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
      title={document.upload.originalName}
      extra={
        <Space>
          <Button 
            type="text" 
            icon={<ReloadOutlined />} 
            onClick={onResetRatio}
            title="최적 비율로 리셋"
          />
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      }
      bordered={false}
      style={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {isPdf ? (
          <PDFViewer file={documentFileUrl} onDownload={handleDownload} />
        ) : isImage ? (
          <ImageViewer file={documentFileUrl} onDownload={handleDownload} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p>이 문서는 미리보기를 지원하지 않는 형식입니다.</p>
            <Button type="primary" onClick={handleDownload}>
              {document.upload.originalName} 다운로드
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default RightPane;