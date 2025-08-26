// src/components/PDFViewer.js

import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Spin, Alert, Button, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined, DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

// PDF.js 워커 설정
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const PDFViewer = ({ file, onDownload }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0); // 이미지와 동일하게 1.0으로 시작
  const [containerWidth, setContainerWidth] = useState(600);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));   // 최대 300%
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5)); // 최소 50%

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
    <div style={{ position: 'relative', overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f5f5f5', padding: '10px' }}>
      <div style={{ 
        flexShrink: 0,
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        width: '100%',
        height: 'calc(100vh - 260px)', // CenterPane 페이지네이션 위치에 정확히 맞춤
        overflow: 'auto',
        padding: '10px'
      }}>
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<Spin tip="문서를 불러오는 중입니다..." style={{ marginTop: '50px' }} />}
          error={<Alert message="문서 로딩 오류" description="PDF 파일을 불러오는 데 실패했습니다." type="error" showIcon />}
        >
          <div style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '1px solid #d9d9d9',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
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
      <div style={{ flexShrink: 0, marginTop: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 페이지 이동 */}
        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Space>
            <Button
              size="small"
              type="primary"
              disabled={pageNumber <= 1}
              onClick={previousPage}
              icon={<LeftOutlined />}
            >
              <span style={{ fontSize: '10px' }}>이전</span>
            </Button>
            <Text style={{ margin: '0 8px', fontSize: '10px' }}>
              페이지 {pageNumber} / {numPages || '--'}
            </Text>
            <Button
              size="small"
              type="primary"
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
          <Button size="small" onClick={zoomOut} icon={<MinusOutlined />} />
          <Text style={{ fontSize: '10px' }}>{Math.round(scale * 100)}%</Text>
          <Button size="small" onClick={zoomIn} icon={<PlusOutlined />} />
        </Space>

        {/* 다운로드 */}
        <Button
          size="small"
          type="primary"
          onClick={onDownload}
          icon={<DownloadOutlined />}
        >
          <span style={{ fontSize: '10px' }}>다운로드</span>
        </Button>
      </div>
    </div>
  );
};

export default PDFViewer;
