// src/components/PDFViewer.js

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Spin, Alert, Button, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

// PDF.js 워커 설정
// 경로를 public 폴더 바로 아래로 수정합니다.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

const PDFViewer = ({ file, onDownload }) => {
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
      <div style={{ marginTop: 16, width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
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
            <Button
                size="small"
                type="primary"
                onClick={onDownload}
                icon={<DownloadOutlined />}
            >
                <span style={{ fontSize: '10px' }}>다운로드</span>
            </Button>
        </Space>
      </div>
    </div>
  );
};

export default PDFViewer;