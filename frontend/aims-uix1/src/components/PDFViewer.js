// src/components/PDFViewer.js

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Spin, Alert, Button, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

// PDF.js 워커 설정
// 경로를 public 폴더 바로 아래로 수정합니다.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const PDFViewer = ({ file }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const changePage = (offset) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<Spin tip="문서를 불러오는 중입니다..." style={{ marginTop: '50px' }} />}
        error={<Alert message="문서 로딩 오류" description="PDF 파일을 불러오는 데 실패했습니다." type="error" showIcon />}
      >
        <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} width={window.innerWidth * 0.3} />
      </Document>
      <div style={{ marginTop: 16 }}>
        <Space>
          <Button
            type="primary"
            disabled={pageNumber <= 1}
            onClick={previousPage}
            icon={<LeftOutlined />}
          >
            이전 페이지
          </Button>
          <span style={{ margin: '0 8px' }}>
            페이지 {pageNumber} / {numPages || '--'}
          </span>
          <Button
            type="primary"
            disabled={pageNumber >= numPages}
            onClick={nextPage}
            icon={<RightOutlined />}
          >
            다음 페이지
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default PDFViewer;