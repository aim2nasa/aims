// src/components/ImageViewer.js

import React, { useState, useRef, useEffect } from 'react';
import { Button, Space, Typography, Spin, Alert } from 'antd';
import { DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ImageViewer = ({ file, onDownload }) => {
  const [scale, setScale] = useState(1.0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [maxImageWidth, setMaxImageWidth] = useState('65vw');
  const [maxImageHeight, setMaxImageHeight] = useState('calc(100vh - 300px)');
  const [containerHeight, setContainerHeight] = useState('calc(100vh - 250px)');
  const containerRef = useRef(null);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));   // 최대 300%
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.2)); // 최소 20%까지 축소 허용

  // 컨테이너 크기 변경에 따른 이미지 최대 너비 동적 조정
  useEffect(() => {
    const updateImageSize = () => {
      const rightPane = document.querySelector('[data-testid="right-pane"]');
      if (rightPane) {
        const paneWidth = rightPane.offsetWidth;
        const paneHeight = rightPane.offsetHeight;
        // 폭이 넓어지면 이미지도 실제로 더 크게 표시되도록
        setMaxImageWidth(`${paneWidth * 0.9}px`); // 90%로 더 크게
        setMaxImageHeight(`${paneHeight * 2}px`); // 높이 제한을 크게 늘려서 스크롤 허용
        setContainerHeight(`${paneHeight - 100}px`);
      }
    };

    updateImageSize();
    
    // ResizeObserver를 사용해서 크기 변화 감지
    const rightPane = document.querySelector('[data-testid="right-pane"]');
    if (rightPane) {
      const resizeObserver = new ResizeObserver(updateImageSize);
      resizeObserver.observe(rightPane);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  const handleImageLoad = (event) => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  if (imageError) {
    return (
      <Alert 
        message="이미지 로딩 오류" 
        description="이미지 파일을 불러오는 데 실패했습니다." 
        type="error" 
        showIcon 
      />
    );
  }

  return (
    <div 
      ref={containerRef}
      style={{ position: 'relative', overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#f5f5f5', padding: '10px' }}
    >
      {imageLoading && (
        <Spin tip="이미지를 불러오는 중입니다..." style={{ marginTop: '50px' }} />
      )}
      
      <div style={{ 
        flexShrink: 0,
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'flex-start', // center에서 flex-start로 변경하여 상단 정렬
        width: '100%',
        height: containerHeight, // 동적으로 계산된 높이 사용
        overflow: 'auto',
        padding: '10px'
      }}>
        <div style={{
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          backgroundColor: '#ffffff',
          margin: '5px',
          display: imageLoading ? 'none' : 'inline-block',
          maxWidth: '100%'
        }}>
          <img
            src={file}
            alt="Preview"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center',
              width: maxImageWidth, // pane 크기에 비례한 실제 크기
              height: 'auto', // 비율 유지
              display: 'block'
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div style={{ flexShrink: 0, marginTop: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 빈 공간 (PDF의 페이지 네비게이션과 균형 맞추기 위함) */}
        <div style={{ flexGrow: 1 }}></div>

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

export default ImageViewer;