import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Space, message, Spin, Alert, Typography } from 'antd';
import { DownloadOutlined, LeftOutlined, RightOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { Button } from './common';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import axios from 'axios';

const { Text } = Typography;

// PDF.js 워커 설정 - 로컬 파일 우선, CDN fallback
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

const DocumentPreviewModal = ({ visible, document, onClose }) => {
  // PDF 관련 상태
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // 이미지 관련 상태  
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!visible) {
      setNumPages(null);
      setPageNumber(1);
      setScale(1.0);
      setPdfError(null);
      setIsRetrying(false);
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

  // PDF fallback 메커니즘
  const handleWorkerFallback = useCallback(async () => {
    setIsRetrying(true);
    
    try {
      // CDN으로 워커 재설정
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      setPdfError(null);
    } catch (fallbackError) {
      setPdfError('PDF 워커를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
      setIsRetrying(false);
    }
  }, []);

  // PDF 관련 함수들
  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setPdfError(null);
    setIsRetrying(false);
  }, []);

  const onDocumentLoadError = useCallback((error) => {
    setPdfError(error.message || 'PDF 파일을 불러오는 데 실패했습니다.');
    
    // Worker 관련 오류인 경우 CDN fallback 시도
    if (error.message?.includes('worker') && !isRetrying) {
      handleWorkerFallback();
    }
  }, [isRetrying, handleWorkerFallback]);

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
          <div key="pdf-controls" className="controls-container">
            <Space>
              <Button 
                size="small" 
                variant="secondary"
                disabled={pageNumber <= 1} 
                onClick={previousPage} 
                icon={<LeftOutlined />}
              >
                이전
              </Button>
              <Text>페이지 {pageNumber} / {numPages || '--'}</Text>
              <Button 
                size="small" 
                variant="secondary"
                disabled={pageNumber >= numPages} 
                onClick={nextPage} 
                icon={<RightOutlined />}
              >
                다음
              </Button>
            </Space>
            <Space>
              <Button 
                size="small" 
                variant="ghost"
                onClick={zoomOut} 
                icon={<MinusOutlined />} 
              />
              <Text>{Math.round(scale * 100)}%</Text>
              <Button 
                size="small" 
                variant="ghost"
                onClick={zoomIn} 
                icon={<PlusOutlined />} 
              />
              <Button 
                variant="primary" 
                onClick={handleDownload} 
                icon={<DownloadOutlined />}
              >
                다운로드
              </Button>
            </Space>
          </div>
        ),
        // 이미지 컨트롤
        isImage && (
          <div key="image-controls" className="controls-container">
            <div></div>
            <Space>
              <Button 
                size="small" 
                variant="ghost"
                onClick={zoomOut} 
                icon={<MinusOutlined />} 
              />
              <Text>{Math.round(scale * 100)}%</Text>
              <Button 
                size="small" 
                variant="ghost"
                onClick={zoomIn} 
                icon={<PlusOutlined />} 
              />
              <Button 
                variant="primary" 
                onClick={handleDownload} 
                icon={<DownloadOutlined />}
              >
                다운로드
              </Button>
            </Space>
          </div>
        ),
        // 기타 파일 컨트롤
        !isPdf && !isImage && (
          <Button 
            key="close" 
            variant="secondary"
            onClick={onClose}
          >
            닫기
          </Button>
        )
      ]}
      width="40%"
      className="modal-top-20"
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
        <div className="preview-container">
          {pdfError ? (
            <Alert
              message="PDF 로딩 실패"
              description={
                <div>
                  <p>{pdfError}</p>
                  {!isRetrying && (
                    <div style={{ marginTop: '8px' }}>
                      <Button size="small" onClick={handleWorkerFallback}>
                        다시 시도
                      </Button>
                      <details style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                        <summary>기술 정보</summary>
                        <p>파일 URL: {documentFileUrl}</p>
                        <p>Worker: {pdfjs.GlobalWorkerOptions.workerSrc}</p>
                        <p>PDF.js 버전: {pdfjs.version}</p>
                      </details>
                    </div>
                  )}
                </div>
              }
              type="error"
              showIcon
            />
          ) : (
            <Document
              file={documentFileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={<Spin tip={isRetrying ? "재시도 중입니다..." : "문서를 불러오는 중입니다..."} />}
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                scale={scale}
                width={Math.min(window.innerWidth * 0.36, 550)}
              />
            </Document>
          )}
        </div>
      ) : isImage ? (
        <div className="preview-container">
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
            className={`image-transform max-w-full max-h-full object-contain ${
              imageLoading || imageError ? 'hidden' : 'block'
            }`}
            style={{
              '--image-transform': `scale(${scale})`
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      ) : (
        <div className="no-preview-full">
          <p>이 문서는 미리보기를 지원하지 않는 형식입니다.</p>
          <Button 
            variant="primary" 
            onClick={handleDownload}
            icon={<DownloadOutlined />}
          >
            {documentName} 다운로드
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default DocumentPreviewModal;