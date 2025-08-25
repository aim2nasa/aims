// src/components/ImageViewer.js

import React, { useState } from 'react';
import { Button, Space, Typography, Spin, Alert } from 'antd';
import { DownloadOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ImageViewer = ({ file, onDownload }) => {
  const [scale, setScale] = useState(1.0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));   // 최대 300%
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5)); // 최소 50%

  const handleImageLoad = () => {
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
    <div style={{ position: 'relative', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {imageLoading && (
        <Spin tip="이미지를 불러오는 중입니다..." style={{ marginTop: '50px' }} />
      )}
      
      <div style={{ 
        flex: 1, 
        overflow: 'auto', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        width: '100%'
      }}>
        <img
          src={file}
          alt="Preview"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center',
            maxWidth: 'none',
            maxHeight: 'none',
            display: imageLoading ? 'none' : 'block'
          }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>

      {/* 컨트롤 패널 */}
      <div style={{ marginTop: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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