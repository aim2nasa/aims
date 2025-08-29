import React, { useState, useEffect } from 'react';
import { Modal, Button, Space, message, Spin, Alert, Typography } from 'antd';
import { CloseOutlined, DownloadOutlined, LeftOutlined, RightOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import axios from 'axios';

const { Text } = Typography;

// PDF.js 워커 설정
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const DocumentPreviewModal = ({ visible, document, onClose }) => {
  // PDF 관련 상태
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  
  // 이미지 관련 상태  
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!visible) {
      setNumPages(null);
      setPageNumber(1);
      setScale(1.0);
      setImageLoading(true);
      setImageError(false);
    }
  }, [visible]);

  if (!document) {
    return null;
  }

  const documentFileUrl = document.fileUrl;
  const isPdf = documentFileUrl && documentFileUrl.toLowerCase().endsWith('.pdf');
  const isImage = documentFileUrl && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(documentFileUrl.toLowerCase());

  // PDF 관련 함수들
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  // 이미지 관련 함수들
  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const handleDownload = async () => {
    const destPath = document.upload?.destPath || document.payload?.dest_path || document.destPath;
    const originalName = document.upload?.originalName || document.payload?.original_name || document.originalName;

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

  const documentName = document.upload?.originalName || document.payload?.original_name || document.originalName || '문서';

  return (
    <Modal
      title={documentName}
      open={visible}
      onCancel={onClose}
      footer={[
        // PDF 컨트롤
        isPdf && (
          <div key="pdf-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Button size="small" disabled={pageNumber <= 1} onClick={previousPage} icon={<LeftOutlined />}>
                이전
              </Button>
              <Text>페이지 {pageNumber} / {numPages || '--'}</Text>
              <Button size="small" disabled={pageNumber >= numPages} onClick={nextPage} icon={<RightOutlined />}>
                다음
              </Button>
            </Space>
            <Space>
              <Button size="small" onClick={zoomOut} icon={<MinusOutlined />} />
              <Text>{Math.round(scale * 100)}%</Text>
              <Button size="small" onClick={zoomIn} icon={<PlusOutlined />} />
              <Button type="primary" onClick={handleDownload} icon={<DownloadOutlined />}>
                다운로드
              </Button>
            </Space>
          </div>
        ),
        // 이미지 컨트롤
        isImage && (
          <div key="image-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div></div>
            <Space>
              <Button size="small" onClick={zoomOut} icon={<MinusOutlined />} />
              <Text>{Math.round(scale * 100)}%</Text>
              <Button size="small" onClick={zoomIn} icon={<PlusOutlined />} />
              <Button type="primary" onClick={handleDownload} icon={<DownloadOutlined />}>
                다운로드
              </Button>
            </Space>
          </div>
        ),
        // 기타 파일 컨트롤
        !isPdf && !isImage && (
          <Button key="close" onClick={onClose}>
            닫기
          </Button>
        )
      ]}
      width="40%"
      style={{ top: 20 }}
      destroyOnClose={true}
      bodyStyle={{ 
        padding: 0, 
        height: '70vh', 
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5'
      }}
    >
      {isPdf ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          <Document
            file={documentFileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<Spin tip="문서를 불러오는 중입니다..." />}
            error={<Alert message="문서 로딩 오류" description="PDF 파일을 불러오는 데 실패했습니다." type="error" showIcon />}
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              scale={scale}
              width={Math.min(window.innerWidth * 0.36, 550)}
            />
          </Document>
        </div>
      ) : isImage ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          {imageLoading && <Spin tip="이미지를 불러오는 중입니다..." />}
          {imageError && (
            <Alert 
              message="이미지 로딩 오류" 
              description="이미지 파일을 불러오는 데 실패했습니다." 
              type="error" 
              showIcon 
            />
          )}
          <img
            src={documentFileUrl}
            alt="Preview"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: imageLoading || imageError ? 'none' : 'block'
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 0',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <p>이 문서는 미리보기를 지원하지 않는 형식입니다.</p>
          <Button type="primary" onClick={handleDownload}>
            {documentName} 다운로드
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default DocumentPreviewModal;