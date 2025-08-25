// src/components/ImageViewer.js

import React, { useState, useRef } from 'react';
import { Button, Space, Typography, Spin, Alert } from 'antd';
import { DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ImageViewer = ({ file, onDownload }) => {
  const [scale, setScale] = useState(1.0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef(null);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));   // 최대 300%
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.2)); // 최소 20%까지 축소 허용

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
        alignItems: 'center',
        width: '100%',
        height: 'calc(100vh - 250px)', // PDF와 동일한 높이로 맞춤
        overflow: 'auto',
        padding: '10px'
      }}>
        <div style={{
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          margin: '5px',
          display: imageLoading ? 'none' : 'inline-block'
        }}>
          <img
            src={file}
            alt="Preview"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center',
              maxWidth: '65vw',
              maxHeight: 'calc(100vh - 300px)',
              width: 'auto',
              height: 'auto',
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