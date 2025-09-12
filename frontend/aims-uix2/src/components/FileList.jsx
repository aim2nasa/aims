// src/components/FileList.js
import React from 'react';
import { List, Typography, Space } from 'antd';
import { FilePdfOutlined, CheckCircleTwoTone, SyncOutlined, LoadingOutlined } from '@ant-design/icons';

const { Text } = Typography;

const FileList = ({ files }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'processing':
        return <SyncOutlined spin className="processing-icon" />;
      case 'completed':
        return <CheckCircleTwoTone twoToneColor="#52c41a" />;
      default:
        return <LoadingOutlined />;
    }
  };

  return (
    <List
      header={<div className="file-header">업로드된 파일 목록</div>}
      bordered
      dataSource={files}
      renderItem={item => (
        <List.Item>
          <Space>
            <FilePdfOutlined />
            <Text>{item.upload.originalName}</Text>
          </Space>
          <Space>
            <Text>{item.status === 'completed' ? '처리 완료' : '처리 중...'}</Text>
            {getStatusIcon(item.status)}
          </Space>
        </List.Item>
      )}
    />
  );
};

export default FileList;