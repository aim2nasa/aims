// src/pages/MainPage.js
import React, { useState } from 'react';
import { Row, Col, Space, Card, Typography } from 'antd';
import SearchBar from '../components/SearchBar';
import FileUploader from '../components/FileUploader';
import UploadStatus from '../components/UploadStatus';

const { Title } = Typography;

const MainPage = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleUploadSuccess = (file) => {
    // onUploadSuccess 함수가 호출되면, 업로드된 파일 목록을 업데이트합니다.
    setUploadedFiles(prevFiles => [...prevFiles, file.name]);
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      <Title level={2} style={{ textAlign: 'center', marginBottom: '24px' }}>AIMS 문서 관리 시스템</Title>
      <Row gutter={[24, 24]}>
        {/* 왼쪽 섹션: 문서 업로드 + 업로드 파일 현황 */}
        <Col span={6}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card title="문서 업로드" style={{ width: '100%' }}>
              {/* onUploadSuccess prop을 FileUploader에 전달 */}
              <FileUploader onUploadSuccess={handleUploadSuccess} />
            </Card>
            {/* UploadStatus에 업로드된 파일 목록을 전달 */}
            <UploadStatus uploadedFiles={uploadedFiles} />
          </Space>
        </Col>
        
        {/* 오른쪽 섹션: 문서 검색 */}
        <Col span={18}>
          <Card title="문서 검색" style={{ width: '100%', minHeight: '100%' }}>
            <SearchBar />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MainPage;