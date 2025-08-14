// src/components/SearchBar.js
import React, { useState } from 'react';
import { Input, Button, List, Space, Tag, Typography, message, Select, Card } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;
const { Text } = Typography;
const { Option } = Select;

const SearchBar = () => {
  const [searchResults, setSearchResults] = useState([]);
  const [searchLogic, setSearchLogic] = useState('AND');
  const [keyword, setKeyword] = useState('');

  const onSearch = async () => {
    if (!keyword) return;

    try {
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        query: keyword,
        mode: searchLogic,
      });
      setSearchResults(response.data);
    } catch (e) {
      message.error('검색 중 오류가 발생했습니다.');
    }
  };

  const handleKeywordChange = (e) => {
    setKeyword(e.target.value);
  };

  const handleLogicChange = (value) => {
    setSearchLogic(value);
  };

  // 파일 확장자에 따라 동작을 다르게 하고, originalName으로 다운로드하는 함수
  const handleDownloadAndOpen = async (item) => {
    let destPath = item.destPath;
    const originalName = item.originalName;

    if (!destPath || !originalName) {
      message.error('파일 경로가 유효하지 않습니다.');
      return;
    }

    // URL에서 '/data' 부분을 제거
    const correctedPath = destPath.startsWith('/data/files/') ? destPath.replace('/data', '') : destPath;
    const fileUrl = `https://tars.giize.com${correctedPath}`;

    // 파일 확장자를 추출
    const extension = originalName.split('.').pop().toLowerCase();
    
    // 브라우저에서 직접 열 수 있는 파일 확장자 목록
    const displayableExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

    if (displayableExtensions.includes(extension)) {
      // 새 탭에서 파일 열기
      window.open(fileUrl, '_blank');
    } else {
      // 그 외 파일은 originalName으로 다운로드
      try {
        // Blob 형태로 파일 다운로드
        const response = await axios({
          url: fileUrl,
          method: 'GET',
          responseType: 'blob', // 응답 타입을 'blob'으로 설정
        });

        // Blob 데이터를 기반으로 가상 URL 생성
        const url = window.URL.createObjectURL(new Blob([response.data]));
        
        // 가상 링크를 생성하여 다운로드 실행
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', originalName); // originalName으로 다운로드 설정
        document.body.appendChild(link);
        link.click();
        
        // 사용 완료 후 가상 URL 해제 및 링크 제거
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        message.error('파일 다운로드에 실패했습니다. CORS 설정을 확인해주세요.');
        console.error('Download error:', error);
      }
    }
  };

  return (
    <Card title="문서 검색" style={{ width: '100%', minHeight: '100%' }}>
      <Space direction="horizontal" style={{ marginBottom: '20px', width: '100%' }}>
        <Search
          placeholder="문서에서 키워드 검색 (예: 곽승철 p-47)"
          onChange={handleKeywordChange}
          value={keyword}
          style={{ flex: 1 }}
          onPressEnter={onSearch}
        />
        <Select
          defaultValue="AND"
          style={{ width: 80 }}
          onChange={handleLogicChange}
        >
          <Option value="AND">AND</Option>
          <Option value="OR">OR</Option>
        </Select>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={onSearch}
        >
          Search
        </Button>
      </Space>
      {searchResults.length > 0 && (
        <List
          bordered
          dataSource={searchResults}
          renderItem={item => (
            <List.Item>
              <Space direction="vertical">
                {item.ocr ? (
                  <>
                    <Text 
                      strong 
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleDownloadAndOpen(item)}
                    >
                      {item.originalName}
                    </Text>
                    <Text type="secondary">{item.ocr.summary}</Text>
                    {item.ocr.confidence && (
                      <Tag color="blue">OCR Confidence: {item.ocr.confidence}</Tag>
                    )}
                  </>
                ) : (
                  <>
                    <Text 
                      strong 
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleDownloadAndOpen(item)}
                    >
                      {item.originalName}
                    </Text>
                    <Text type="secondary">OCR 데이터가 존재하지 않는 문서입니다.</Text>
                  </>
                )}
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

export default SearchBar;