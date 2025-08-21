// src/components/PDFViewer.js

import React, { useState } from 'react';
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
  const [scale, setScale] = useState(1.0); // ✅ 확대/축소 상태 추가

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

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<Spin tip="문서를 불러오는 중입니다..." style={{ marginTop: '50px' }} />}
        error={<Alert message="문서 로딩 오류" description="PDF 파일을 불러오는 데 실패했습니다." type="error" showIcon />}
      >
        {/* ✅ width 대신 scale 사용 */}
        <Page
          pageNumber={pageNumber}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          scale={scale}
        />
      </Document>

      {/* 컨트롤 패널 */}
      <div style={{ marginTop: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
