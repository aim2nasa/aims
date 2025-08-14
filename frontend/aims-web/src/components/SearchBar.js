// src/components/SearchBar.js
import React, { useState } from 'react';
import { Input, Button, List, Space, Tag, Typography, message, Select } from 'antd';
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

  return (
    <div>
      <Space direction="horizontal">
        <Search
          placeholder="문서에서 키워드 검색 (예: 곽승철 p-47)"
          onChange={handleKeywordChange}
          value={keyword}
          style={{ width: 400 }}
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
          style={{ marginTop: '20px' }}
          bordered
          dataSource={searchResults}
          renderItem={item => (
            <List.Item>
              <Space direction="vertical">
                {/* ocr 객체가 존재하는 경우에만 데이터 렌더링 */}
                {item.ocr ? (
                  <>
                    <Text strong>{item.originalName}</Text>
                    <Text type="secondary">{item.ocr.summary}</Text>
                    {item.ocr.confidence && (
                      <Tag color="blue">OCR Confidence: {item.ocr.confidence}</Tag>
                    )}
                  </>
                ) : (
                  <>
                    {/* ocr 데이터가 없는 경우, 사용자에게 대체 정보를 제공 */}
                    <Text strong>{item.originalName}</Text>
                    <Text type="secondary">OCR 데이터가 존재하지 않는 문서입니다.</Text>
                  </>
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