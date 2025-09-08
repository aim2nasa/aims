// src/components/PDFViewer.js

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Spin, Alert, Space, Typography } from 'antd';
import { Button } from './common';
import { LeftOutlined, RightOutlined, DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

// PDF.js 워커 설정 - 로컬 파일 사용으로 안정성과 성능 향상
// CDN 의존성 제거하여 오프라인 지원 및 즉시 로딩 가능
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

const PDFViewer = ({ file, onDownload }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0); // 이미지와 동일하게 1.0으로 시작
  const [containerWidth, setContainerWidth] = useState(600);
  const [error, setError] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
    setIsRetrying(false);
  }, []);

  const handleWorkerFallback = useCallback(async () => {
    setIsRetrying(true);
    console.log('Trying CDN fallback for worker...');
    
    try {
      // CDN으로 워커 재설정
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      
      // 약간의 지연 후 재시도 알림
      setTimeout(() => {
        setError(null);
      }, 1000);
      
    } catch (fallbackError) {
      console.error('CDN fallback also failed:', fallbackError);
      setError('PDF 워커를 불러올 수 없습니다. 네트워크 연결을 확인해주세요.');
      setIsRetrying(false);
    }
  }, []);

  const onDocumentLoadError = useCallback((error) => {
    console.error('PDF load error:', error);
    setError(error.message || 'PDF 파일을 불러오는 데 실패했습니다.');
    
    // Worker 관련 오류인 경우 CDN fallback 시도
    if (error.message?.includes('worker') && !isRetrying) {
      handleWorkerFallback();
    }
  }, [isRetrying, handleWorkerFallback]);

  // 수동 재시도 함수
  const handleRetry = useCallback(() => {
    setError(null);
    setIsRetrying(false);
    // 페이지를 다시 렌더링하도록 강제
    setPageNumber(prev => prev);
  }, []);

  const changePage = useCallback((offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  }, []);

  const previousPage = useCallback(() => changePage(-1), [changePage]);
  const nextPage = useCallback(() => changePage(1), [changePage]);

  const zoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.25, 3.0)), []);   // 최대 300%
  const zoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.25, 0.5)), []); // 최소 50%

  // 컨테이너 크기 변경에 따른 PDF 너비 동적 조정
  useEffect(() => {
    const updateContainerWidth = () => {
      // RightPane의 현재 너비를 기준으로 PDF 너비 계산
      const rightPane = document.querySelector('[data-testid="right-pane"]');
      if (rightPane) {
        const paneWidth = rightPane.offsetWidth;
        // 최대 제한 제거하고 pane 너비에 비례해서 동적 조정
        const optimalWidth = paneWidth * 0.85; // 85%로 여유 공간 확보
        setContainerWidth(optimalWidth);
      }
    };

    updateContainerWidth();
    
    // ResizeObserver를 사용해서 크기 변화 감지
    const rightPane = document.querySelector('[data-testid="right-pane"]');
    if (rightPane) {
      const resizeObserver = new ResizeObserver(updateContainerWidth);
      resizeObserver.observe(rightPane);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  return (
    <div style={{ position: 'relative', overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--color-bg-secondary)', padding: '10px' }}>
      <div style={{ 
        flexShrink: 0,
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'flex-start', // center에서 flex-start로 변경하여 상단 정렬
        width: '100%',
        height: 'calc(100vh - 260px)', // CenterPane 페이지네이션 위치에 정확히 맞춤
        overflow: 'auto',
        padding: '10px'
      }}>
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Spin size="large" tip={isRetrying ? "CDN으로 재시도 중입니다..." : "문서를 불러오는 중입니다..."} />
            </div>
          }
          error={
            <Alert 
              message={isRetrying ? "재시도 중입니다" : "문서 로딩 오류"} 
              description={
                <div>
                  <p>{error || "PDF 파일을 불러오는 데 실패했습니다."}</p>
                  {!isRetrying && (
                    <div style={{ marginTop: '10px' }}>
                      <Button variant="primary" size="small" onClick={handleRetry}>
                        다시 시도
                      </Button>
                    </div>
                  )}
                  <details style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                    <summary>기술 정보</summary>
                    <p>파일 URL: {file}</p>
                    <p>Worker: {pdfjs.GlobalWorkerOptions.workerSrc}</p>
                    <p>PDF.js 버전: {pdfjs.version}</p>
                  </details>
                </div>
              } 
              type={isRetrying ? "info" : "error"} 
              showIcon 
            />
          }
        >
          <div style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--color-bg-primary)',
            margin: '5px'
          }}>
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              scale={scale}
              width={containerWidth}
            />
          </div>
        </Document>
      </div>

      {/* 컨트롤 패널 */}
      <div style={{ flexShrink: 0, marginTop: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        {/* 페이지 이동 */}
        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Space>
            <Button
              size="small"
              variant="secondary"
              disabled={pageNumber <= 1}
              onClick={previousPage}
              icon={<LeftOutlined />}
            >
              <span style={{ fontSize: '10px' }}>이전</span>
            </Button>
            <Text style={{ margin: '0 8px', fontSize: '10px', color: 'var(--color-text-primary)' }}>
              페이지 {pageNumber} / {numPages || '--'}
            </Text>
            <Button
              size="small"
              variant="secondary"
              disabled={pageNumber >= numPages}
              onClick={nextPage}
              icon={<RightOutlined />}
            >
              <span style={{ fontSize: '10px' }}>다음</span>
            </Button>
          </Space>
        </div>

        {/* 확대/축소 */}
        <Space style={{ marginLeft: 16 }}>
          <Button variant="ghost" size="small" onClick={zoomOut} icon={<MinusOutlined />} />
          <Text style={{ fontSize: '10px', color: 'var(--color-text-primary)' }}>{Math.round(scale * 100)}%</Text>
          <Button variant="ghost" size="small" onClick={zoomIn} icon={<PlusOutlined />} />
        </Space>

        {/* 다운로드 */}
        <Button
          size="small"
          variant="primary"
          onClick={onDownload}
          icon={<DownloadOutlined />}
        >
          <span style={{ fontSize: '10px' }}>다운로드</span>
        </Button>
      </div>
    </div>
  );
};

// React.memo로 불필요한 리렌더링 방지
export default memo(PDFViewer);
