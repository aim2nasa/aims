import React, { useState, useRef, useEffect } from 'react';
import { Input, Space, Modal, List, Row, Col } from 'antd';
import { Button } from './common';
import { SearchOutlined, HomeOutlined } from '@ant-design/icons';
import AddressService from '../services/addressService';

const AddressSearchModal = ({ visible, onClose, onAddressSelect }) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const searchInputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef(null);
  const keyIntervalRef = useRef(null);

  // 도로명주소 API 검색
  const searchAddress = async (keyword, page = 1, append = false) => {
    setLoading(true);
    
    const result = await AddressService.searchAddress(keyword, page, 30);
    
    if (result.success) {
      const newResults = result.data.results;
      
      if (append) {
        setSearchResults(prev => [...prev, ...newResults]);
      } else {
        setSearchResults(newResults);
      }
      
      setTotalCount(result.data.total);
      setCurrentPage(result.data.page);
      setIsEnd(result.data.isEnd);
      
      if (!append && newResults.length > 0) {
        setSelectedIndex(0);
      }
    } else {
      if (!append) {
        setSearchResults([]);
      }
    }
    
    setLoading(false);
  };

  // 더 많은 결과 로드하기
  const loadMoreResults = async () => {
    if (!loading && !isEnd && searchKeyword.trim()) {
      await searchAddress(searchKeyword, currentPage + 1, true);
    }
  };

  // 주소 선택 핸들러
  const handleAddressSelect = (addressData) => {
    const newAddress = AddressService.formatAddressForForm(addressData);
    onAddressSelect(newAddress);
    onClose();
  };

  // 키보드 네비게이션 시 선택된 항목으로 자동 스크롤
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const listElement = listRef.current.querySelector('.ant-list-items');
      if (listElement) {
        const selectedElement = listElement.children[selectedIndex];
        if (selectedElement) {
          selectedElement.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }
    }
  }, [selectedIndex]);

  // 컴포넌트 언마운트 시 interval 정리
  useEffect(() => {
    return () => {
      if (keyIntervalRef.current) {
        clearInterval(keyIntervalRef.current);
      }
    };
  }, []);

  return (
    <Modal
      title={
        <Space>
          <HomeOutlined />
          주소 검색
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnClose={true}
      afterOpenChange={(open) => {
        if (open && searchInputRef.current) {
          setTimeout(() => {
            searchInputRef.current.focus();
          }, 100);
        }
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* 검색 입력 */}
        <Row gutter={8}>
          <Col span={18}>
            <Input
              ref={searchInputRef}
              placeholder="도로명주소 또는 지번주소를 입력하세요 (예: 테헤란로 123 또는 역삼동 123-45)"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={() => searchAddress(searchKeyword)}
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border)'
              }}
              onKeyDown={(e) => {
                if (searchResults.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => 
                      prev < searchResults.length - 1 ? prev + 1 : 0
                    );
                    // 키 반복을 위한 interval 설정 (더 빠르게)
                    if (!keyIntervalRef.current) {
                      keyIntervalRef.current = setInterval(() => {
                        setSelectedIndex(prev => 
                          prev < searchResults.length - 1 ? prev + 1 : 0
                        );
                      }, 150);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => 
                      prev > 0 ? prev - 1 : searchResults.length - 1
                    );
                    // 키 반복을 위한 interval 설정 (더 빠르게)
                    if (!keyIntervalRef.current) {
                      keyIntervalRef.current = setInterval(() => {
                        setSelectedIndex(prev => 
                          prev > 0 ? prev - 1 : searchResults.length - 1
                        );
                      }, 150);
                    }
                  } else if (e.key === 'Enter' && selectedIndex >= 0) {
                    e.preventDefault();
                    handleAddressSelect(searchResults[selectedIndex]);
                  }
                }
              }}
              onKeyUp={(e) => {
                // 키를 떼면 interval 정리
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  if (keyIntervalRef.current) {
                    clearInterval(keyIntervalRef.current);
                    keyIntervalRef.current = null;
                  }
                }
              }}
              size="large"
            />
          </Col>
          <Col span={6}>
            <Button 
              variant="primary" 
              icon={<SearchOutlined />}
              onClick={() => searchAddress(searchKeyword)}
              loading={loading}
              size="large"
              block
            >
              검색
            </Button>
          </Col>
        </Row>

        {/* 검색 결과 */}
        {searchResults.length > 0 && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>검색 결과 ({searchResults.length}건{totalCount > searchResults.length ? ` / 총 ${totalCount}건` : ''})</span>
              {!isEnd && (
                <Button 
                  variant="link" 
                  size="small"
                  onClick={loadMoreResults}
                  loading={loading}
                  style={{ padding: 0, height: 'auto' }}
                >
                  더보기 +
                </Button>
              )}
            </div>
            <List
              ref={listRef}
              size="small"
              bordered
              dataSource={searchResults}
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                backgroundColor: 'var(--color-bg-primary)'
              }}
              renderItem={(item, index) => (
                <List.Item 
                  key={`${item.roadAddr}-${index}`}
                  onClick={() => handleAddressSelect(item)}
                  style={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    margin: 0,
                    padding: '12px 16px',
                    backgroundColor: selectedIndex === index ? 'var(--color-primary-alpha-10)' : 'var(--color-bg-primary)',
                    border: selectedIndex === index ? '1px solid var(--color-primary)' : '1px solid transparent'
                  }}
                  className="address-search-item"
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      📮 {item.zipNo ? `${item.zipNo} | ` : ''}{item.roadAddrPart1}
                    </div>
                    {item.jibunAddr && item.jibunAddr !== item.roadAddrPart1 && (
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginBottom: '2px' }}>
                        지번: {item.jibunAddr}
                      </div>
                    )}
                    {item.building_name && (
                      <div style={{ color: 'var(--color-primary)', fontSize: '11px' }}>
                        🏢 {item.building_name}
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
            />
            
            {/* 하단 더보기 버튼 */}
            {!isEnd && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <Button 
                  variant="dashed"
                  onClick={loadMoreResults}
                  loading={loading}
                  block
                  style={{ height: '36px' }}
                >
                  {loading ? '로딩 중...' : `더 많은 결과 보기 (${totalCount - searchResults.length}건 더 있음)`}
                </Button>
              </div>
            )}
            
            {/* 전체 결과 로드 완료 */}
            {isEnd && totalCount > searchResults.length && (
              <div style={{ textAlign: 'center', marginTop: '8px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                전체 {totalCount}건 중 {searchResults.length}건 표시됨
              </div>
            )}
          </div>
        )}

        {/* 검색 가이드 */}
        {searchResults.length === 0 && searchKeyword === '' && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px', 
            color: 'var(--color-text-secondary)' 
          }}>
            <HomeOutlined style={{ fontSize: '24px', marginBottom: '12px', color: 'var(--color-text-tertiary)' }} />
            <div>도로명주소 또는 지번주소를 입력하여 검색해주세요.</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              예시: 테헤란로 123, 역삼동 123-45
            </div>
          </div>
        )}

        {/* 검색 결과 없음 */}
        {searchResults.length === 0 && searchKeyword !== '' && !loading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px', 
            color: 'var(--color-text-secondary)' 
          }}>
            <div>검색 결과가 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              다른 검색어로 다시 시도해보세요.
            </div>
          </div>
        )}
      </Space>

      <style jsx>{`
        .address-search-item:hover {
          background-color: var(--color-bg-tertiary) !important;
        }
      `}</style>
    </Modal>
  );
};

export default AddressSearchModal;