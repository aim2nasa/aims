// src/components/UploadStatus.js
import React from 'react';
import { Card, List } from 'antd';

const UploadStatus = ({ uploadedFiles }) => {
  return (
    <Card title="업로드 파일 현황" style={{ width: '100%' }}>
      <List
        header={<div>업로드된 파일 목록</div>}
        bordered
        dataSource={uploadedFiles} // props로 받은 uploadedFiles 사용
        renderItem={item => <List.Item>{item}</List.Item>}
      />
    </Card>
  );
};

export default UploadStatus;