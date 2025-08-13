import React from 'react';
import { Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css'; // Ant Design의 기본 스타일시트

const { Dragger } = Upload;

const App = () => {
  const props = {
    name: 'file', // 서버에서 파일을 받을 때 사용할 이름
    multiple: false, // 여러 파일 업로드 허용 여부 (false로 설정)
    action: 'https://n8nd.giize.com/webhook/docupload', // 파일을 보낼 엔드포인트
    onChange(info) {
      const { status } = info.file;
      if (status !== 'uploading') {
        console.log(info.file, info.fileList);
      }
      if (status === 'done') {
        message.success(`${info.file.name} 파일 업로드가 성공적으로 완료되었습니다.`);
      } else if (status === 'error') {
        message.error(`${info.file.name} 파일 업로드에 실패했습니다.`);
      }
    },
    beforeUpload(file) {
      // 업로드 전 특정 파일 형식을 거부할 수 있습니다.
      // const isPDF = file.type === 'application/pdf';
      // if (!isPDF) {
      //   message.error('PDF 파일만 업로드할 수 있습니다.');
      // }
      // return isPDF;
      return true; // true를 반환하면 업로드가 진행됩니다.
    },
  };

  return (
    <div style={{ padding: '50px' }}>
      <h1>문서 업로드</h1>
      <Dragger {...props}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">여기로 파일을 드래그하거나 클릭하여 업로드하세요</p>
        <p className="ant-upload-hint">
          단일 파일 업로드를 지원합니다.
        </p>
      </Dragger>
    </div>
  );
};

export default App;