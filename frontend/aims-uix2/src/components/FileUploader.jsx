// src/components/FileUploader.js
import React from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Dragger } = Upload;

const FileUploader = ({ onUploadSuccess }) => {
  const customRequest = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', 'rossi.kwak@gmail.com');

    try {
      await axios.post('https://n8nd.giize.com/webhook/docprep-main', formData);
      onSuccess();
      onUploadSuccess(file);
    } catch (e) {
      onError(e);
      message.error(`${file.name} 업로드에 실패했습니다.`);
    }
  };

  const props = {
    name: 'file',
    multiple: true,
    customRequest,
    onChange(info) {
      const { status } = info.file;
      if (status === 'done') {
        message.success(`${info.file.name} 파일 업로드가 완료되었습니다.`);
      } else if (status === 'error') {
        message.error(`${info.file.name} 파일 업로드에 실패했습니다.`);
      }
    },
  };

  return (
    <Dragger {...props}>
      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
      <p className="ant-upload-text">여기로 파일을 드래그하거나 클릭하여 업로드하세요</p>
      <p className="ant-upload-hint">여러 파일을 한 번에 업로드할 수 있습니다.</p>
    </Dragger>
  );
};

export default FileUploader;