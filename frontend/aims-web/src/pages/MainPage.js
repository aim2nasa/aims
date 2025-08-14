// src/App.js
import React, { useState } from 'react';
import { Card, Divider, message, Button } from 'antd';
import 'antd/dist/reset.css'; // Ant Design의 기본 스타일시트
import FileUploader from '../components/FileUploader';
import FileList from '../components/FileList';
import SearchBar from '../components/SearchBar';

const MainPage = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // FileUploader에서 업로드가 성공했을 때 호출될 함수
  const handleUploadSuccess = (file) => {
    // 업로드된 파일 목록에 추가하고, 초기 상태를 'processing'으로 설정
    setUploadedFiles(prevFiles => [
      ...prevFiles,
      {
        uid: file.uid,
        name: file.name,
        status: 'processing', // 초기 상태: 처리 중
      },
    ]);
    message.success(`${file.name} 파일 업로드가 시작되었습니다.`);
    
    // 이 부분은 추후에 WebSocket을 통해 실시간 상태 업데이트를 받도록 고도화됩니다.
    // 임시로 5초 후 'completed' 상태로 변경하는 로직을 추가
    setTimeout(() => {
        setUploadedFiles(prevFiles => 
            prevFiles.map(f => 
                f.uid === file.uid ? { ...f, status: 'completed' } : f
            )
        );
        message.success(`${file.name} 파일 처리가 완료되었습니다.`);
    }, 5000); // 5초 후에 상태 변경 시뮬레이션
  };

  return (
    <div style={{ padding: '50px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>AIMS 문서 관리 시스템</h1>
      <Card title="문서 업로드" style={{ marginBottom: '20px' }}>
        <FileUploader onUploadSuccess={handleUploadSuccess} />
      </Card>
      
      <Card title="업로드 파일 현황" style={{ marginBottom: '20px' }}>
        <FileList files={uploadedFiles} />
      </Card>
      
      <Divider />
      
      <Card title="문서 검색">
        <SearchBar />
      </Card>
    </div>
  );
};

export default MainPage;