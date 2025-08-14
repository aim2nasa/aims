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
  const [searchMode, setSearchMode] = useState('keyword'); // 'keyword' 또는 'semantic'
  const [keyword, setKeyword] = useState('');
  const [isSearched, setIsSearched] = useState(false);
  const [aiAnswer, setAiAnswer] = useState(''); // AI 답변 상태 추가

  const onSearch = async () => {
    if (!keyword) return;
    setIsSearched(true);
    setAiAnswer('');
    setSearchResults([]);

    try {
      let response;
      if (searchMode === 'keyword') {
        response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
          query: keyword,
          mode: searchLogic,
        });
        setSearchResults(response.data);
      } else if (searchMode === 'semantic') {
        response = await axios.post('https://tars.giize.com/search_api', {
          query: keyword,
          search_mode: 'semantic',
        });
        setSearchResults(response.data.search_results || []);
        setAiAnswer(response.data.answer || '');
      }
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
  
  const handleModeChange = (value) => {
    setSearchMode(value);
  };

  // 모든 파일을 originalName으로 다운로드하는 함수
  const handleDownloadAndOpen = async (item) => {
    let destPath = item.destPath || item.payload?.dest_path;
    const originalName = item.originalName || item.payload?.original_name;

    if (!destPath || !originalName) {
      message.error('파일 경로가 유효하지 않습니다.');
      return;
    }

    // URL에서 '/data' 부분을 제거
    const correctedPath = destPath.startsWith('/data/files/') ? destPath.replace('/data', '') : destPath;
    const fileUrl = `https://tars.giize.com${correctedPath}`;

    // originalName으로 다운로드
    try {
      const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('파일 다운로드에 실패했습니다. CORS 설정을 확인해주세요.');
      console.error('Download error:', error);
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
          defaultValue="keyword"
          style={{ width: 120 }}
          onChange={handleModeChange}
        >
          <Option value="keyword">키워드 검색</Option>
          <Option value="semantic">시맨틱 검색</Option>
        </Select>
        {searchMode === 'keyword' && (
          <Select
            defaultValue="AND"
            style={{ width: 80 }}
            onChange={handleLogicChange}
          >
            <Option value="AND">AND</Option>
            <Option value="OR">OR</Option>
          </Select>
        )}
        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={onSearch}
        >
          Search
        </Button>
      </Space>
      {isSearched && (
        <>
          <Typography.Text strong style={{ marginBottom: '10px' }}>
            총 {searchResults.length}건의 검색 결과가 발견되었습니다.
          </Typography.Text>
          {aiAnswer && (
            <div style={{ marginTop: '10px', padding: '15px', border: '1px solid #e8e8e8', borderRadius: '4px' }}>
              <Typography.Text strong>AI 답변:</Typography.Text>
              <Typography.Paragraph style={{ marginTop: '5px' }}>{aiAnswer}</Typography.Paragraph>
            </div>
          )}
          {searchResults.length > 0 && (
            <List
              bordered
              dataSource={searchResults}
              renderItem={item => (
                <List.Item>
                  <Space direction="vertical">
                    {item.ocr || item.payload ? (
                      <>
                        <Text 
                          strong 
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleDownloadAndOpen(item)}
                        >
                          {item.originalName || item.payload?.original_name}
                        </Text>
                        <Text type="secondary">{item.ocr?.summary || item.payload?.summary}</Text>
                        {item.ocr?.confidence && (
                          <Tag color="blue">OCR Confidence: {item.ocr.confidence}</Tag>
                        )}
                        {item.score && (
                           <Tag color="green">유사도: {item.score.toFixed(4)}</Tag>
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
        </>
      )}
    </Card>
  );
};

export default SearchBar;