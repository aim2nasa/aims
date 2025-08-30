import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Space, Modal, List, message, Row, Col } from 'antd';
import { SearchOutlined, HomeOutlined } from '@ant-design/icons';

const AddressSearchInput = ({ 
  value = {}, 
  onChange, 
  form, 
  style, 
  modalVisible: externalModalVisible, 
  onModalVisibleChange 
}) => {
  const [internalModalVisible, setInternalModalVisible] = useState(false);
  
  // 외부에서 모달 상태를 제어하거나 내부적으로 제어
  const modalVisible = externalModalVisible !== undefined ? externalModalVisible : internalModalVisible;
  const setModalVisible = onModalVisibleChange || setInternalModalVisible;
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const searchInputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  // Form의 값을 실시간으로 가져오기
  const currentAddress = form ? {
    postal_code: form.getFieldValue('postal_code') || '',
    address1: form.getFieldValue('address1') || '',
    address2: form.getFieldValue('address2') || ''
  } : (value || {});
  
  const { postal_code = '', address1 = '', address2 = '' } = currentAddress;

  // 도로명주소 API 검색 (페이징 지원)
  const searchAddress = async (keyword, page = 1, append = false) => {
    if (!keyword.trim()) {
      message.warning('검색어를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      // 더 많은 결과를 위해 size를 30으로 증가
      const response = await fetch(`http://tars.giize.com:3010/api/address/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=30`);
      const data = await response.json();

      if (data.success) {
        const newResults = data.data.results || [];
        
        if (append) {
          // 기존 결과에 추가 (더보기)
          setSearchResults(prev => [...prev, ...newResults]);
        } else {
          // 새 검색 결과로 교체
          setSearchResults(newResults);
        }
        
        setTotalCount(data.data.total || newResults.length);
        setCurrentPage(page);
        setIsEnd(data.data.is_end || newResults.length < 30);
        
        // 새 검색 시 첫 번째 항목 선택
        if (!append && newResults.length > 0) {
          setSelectedIndex(0);
        }
      } else {
        message.error(data.error || '주소 검색에 실패했습니다.');
        if (!append) {
          setSearchResults([]);
        }
      }
      
    } catch (error) {
      console.error('주소 검색 오류:', error);
      message.error('주소 검색 중 오류가 발생했습니다.');
      if (!append) {
        setSearchResults([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // 더 많은 결과 로드하기
  const loadMoreResults = async () => {
    if (!loading && !isEnd && searchKeyword.trim()) {
      await searchAddress(searchKeyword, currentPage + 1, true);
    }
  };

  // 주소 선택 핸들러
  const handleAddressSelect = (addressData) => {
    const newAddress = {
      postal_code: addressData.zipNo || '',
      address1: addressData.roadAddrPart1 || addressData.roadAddr || '',
      address2: ''
    };

    // Form 필드 업데이트
    if (form) {
      form.setFieldsValue({
        postal_code: newAddress.postal_code,
        address1: newAddress.address1,
        address2: newAddress.address2
      });
    }
    
    // 부모 컴포넌트에 변경사항 알림
    if (onChange) {
      onChange(newAddress);
    }

    // 모달 닫기 및 검색 결과 초기화
    setModalVisible(false);
    setSearchKeyword('');
    setSearchResults([]);
    setCurrentPage(1);
    setTotalCount(0);
    setIsEnd(false);
    setSelectedIndex(-1);
  };

  // 주소 검색 버튼 클릭
  const handleAddressSearch = () => {
    setModalVisible(true);
    setSearchKeyword('');
    setSearchResults([]);
    setCurrentPage(1);
    setTotalCount(0);
    setIsEnd(false);
    setSelectedIndex(-1);
  };

  // 모달이 열릴 때 검색창에 자동 포커스
  useEffect(() => {
    if (modalVisible && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 100);
    }
  }, [modalVisible]);

  // 상세주소 변경 핸들러
  const handleAddress2Change = (e) => {
    const newValue = e.target.value;
    
    const newAddress = {
      ...currentAddress,
      address2: newValue
    };
    
    if (form) {
      form.setFieldsValue({
        address2: newValue
      });
    }
    
    if (onChange) {
      onChange(newAddress);
    }
  };

  return (
    <div style={style}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* 우편번호 + 주소검색 버튼 */}
        <Row gutter={8}>
          <Col span={8}>
            <Input 
              value={postal_code}
              placeholder="우편번호"
              readOnly
            />
          </Col>
          <Col span={16}>
            <Button 
              icon={<SearchOutlined />}
              onClick={handleAddressSearch}
              type="default"
              block
            >
              주소검색
            </Button>
          </Col>
        </Row>
        
        {/* 기본주소 */}
        <Input 
          value={address1}
          placeholder="기본주소 (주소검색 버튼을 클릭하세요)"
          readOnly
          style={{ width: '100%' }}
        />
        
        {/* 상세주소 */}
        <Input 
          value={address2}
          onChange={handleAddress2Change}
          placeholder="상세주소를 입력하세요"
          style={{ width: '100%' }}
        />
      </Space>

      {/* 주소 검색 모달 */}
      <Modal
        title={
          <Space>
            <HomeOutlined />
            주소 검색
          </Space>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setSearchKeyword('');
          setSearchResults([]);
          setCurrentPage(1);
          setTotalCount(0);
          setIsEnd(false);
          setSelectedIndex(-1);
        }}
        footer={null}
        width={700}
        destroyOnClose
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
                onKeyDown={(e) => {
                  if (searchResults.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedIndex(prev => 
                        prev < searchResults.length - 1 ? prev + 1 : 0
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedIndex(prev => 
                        prev > 0 ? prev - 1 : searchResults.length - 1
                      );
                    } else if (e.key === 'Enter' && selectedIndex >= 0) {
                      e.preventDefault();
                      handleAddressSelect(searchResults[selectedIndex]);
                    }
                  }
                }}
                size="large"
              />
            </Col>
            <Col span={6}>
              <Button 
                type="primary" 
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
                    type="link" 
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
                size="small"
                bordered
                dataSource={searchResults}
                style={{
                  maxHeight: '400px', // 최대 높이 설정
                  overflowY: 'auto', // 수직 스크롤
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px'
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
                      backgroundColor: selectedIndex === index ? '#e6f7ff' : 'transparent',
                      border: selectedIndex === index ? '1px solid #1890ff' : '1px solid transparent'
                    }}
                    className="address-search-item"
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '14px' }}>
                        📮 {item.zipNo ? `${item.zipNo} | ` : ''}{item.roadAddrPart1}
                      </div>
                      {item.jibunAddr && item.jibunAddr !== item.roadAddrPart1 && (
                        <div style={{ color: '#666', fontSize: '12px', marginBottom: '2px' }}>
                          지번: {item.jibunAddr}
                        </div>
                      )}
                      {item.building_name && (
                        <div style={{ color: '#1890ff', fontSize: '11px' }}>
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
                    type="dashed"
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
                <div style={{ textAlign: 'center', marginTop: '8px', color: '#999', fontSize: '12px' }}>
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
              color: '#666' 
            }}>
              <HomeOutlined style={{ fontSize: '24px', marginBottom: '12px' }} />
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
              color: '#666' 
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
            background-color: #f5f5f5 !important;
          }
        `}</style>
      </Modal>
    </div>
  );
};

export default AddressSearchInput;