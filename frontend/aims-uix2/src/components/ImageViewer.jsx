// src/components/ImageViewer.js

import React, { useState, useRef, useEffect } from 'react';
import { Space, Typography, Spin, Alert } from 'antd';
import { Button } from './common';
import { DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ImageViewer = ({ file, onDownload }) => {
  const [scale, setScale] = useState(1.0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [maxImageWidth, setMaxImageWidth] = useState('65vw');
  const containerRef = useRef(null);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));   // 최대 300%
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.2)); // 최소 20%까지 축소 허용

  // 컨테이너 크기 변경에 따른 이미지 최대 너비 동적 조정
  useEffect(() => {
    const updateImageSize = () => {
      const rightPane = document.querySelector('[data-testid="right-pane"]');
      if (rightPane) {
        const paneWidth = rightPane.offsetWidth;
        // 폭이 넓어지면 이미지도 실제로 더 크게 표시되도록
        setMaxImageWidth(`${paneWidth * 0.9}px`); // 90%로 더 크게
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
      className="relative overflow-auto h-full flex flex-col items-center bg-gray-100 p-2_5"
    >
      {imageLoading && (
        <Spin tip="이미지를 불러오는 중입니다..." className="mt-12_5" />
      )}
      
      <div className="flex-shrink-0 flex justify-center items-start w-full overflow-auto p-2_5 h-screen-260">
        <div 
          className={`border border-gray-300 rounded-lg bg-white m-1_25 max-w-full ${imageLoading ? 'image-display-hidden shadow-xl' : 'image-display-block shadow-xl'}`}
          >
          <img
            src={file}
            alt="Preview"
            className="block h-auto image-transform"
            style={{
              '--image-transform': `scale(${scale})`,
              width: maxImageWidth
            }}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      </div>

      {/* 컨트롤 패널 */}
      <div className="flex-shrink-0 mt-lg w-full flex justify-between items-center">
        {/* 빈 공간 (PDF의 페이지 네비게이션과 균형 맞추기 위함) */}
        <div className="flex-grow"></div>

        {/* 확대/축소 */}
        <Space className="ml-md">
          <Button variant="ghost" size="small" onClick={zoomOut} icon={<MinusOutlined />} />
          <Text className="zoom-text">{Math.round(scale * 100)}%</Text>
          <Button variant="ghost" size="small" onClick={zoomIn} icon={<PlusOutlined />} />
        </Space>

        {/* 다운로드 */}
        <Button
          size="small"
          variant="primary"
          onClick={onDownload}
          icon={<DownloadOutlined />}
        >
          <span className="download-text">다운로드</span>
        </Button>
      </div>
    </div>
  );
};

export default ImageViewer;