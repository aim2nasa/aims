// src/components/SearchBar.js
import React, { useState } from 'react';
import { Input, Button, List, Space, Tag, Typography, message } from 'antd'; // <-- message 추가
import { SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;
const { Text } = Typography;

const SearchBar = () => {
  const [searchResults, setSearchResults] = useState([]);

  const onSearch = async (value) => {
    if (!value) return;

    try {
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        query: value,
        mode: 'AND',
      });
      setSearchResults(response.data);
    } catch (e) {
      message.error('검색 중 오류가 발생했습니다.'); // <-- message 컴포넌트 사용
    }
  };

  return (
    <div>
      <Search
        placeholder="문서에서 키워드 검색 (예: 곽승철 p-47)"
        onSearch={onSearch}
        enterButton={<Button type="primary" icon={<SearchOutlined />} />}
      />
      {searchResults.length > 0 && (
        <List
          style={{ marginTop: '20px' }}
          bordered
          dataSource={searchResults}
          renderItem={item => (
            <List.Item>
              <Space direction="vertical">
                <Text strong>{item.originalName}</Text>
                <Text type="secondary">{item.ocr.summary}</Text>
                {/* ocr.confidence가 존재할 경우에만 Tag를 표시합니다. */}
                {item.ocr.confidence && (
                  <Tag color="blue">OCR Confidence: {item.ocr.confidence}</Tag>
                )}
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default SearchBar;