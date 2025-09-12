import React, { useState } from 'react';
import { Input, Space, Row, Col } from 'antd';
import { Button } from './common';
import { SearchOutlined } from '@ant-design/icons';
import AddressSearchModal from './AddressSearchModal';

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
  
  // Form의 값을 실시간으로 가져오기
  const currentAddress = form ? {
    postal_code: form.getFieldValue('postal_code') || '',
    address1: form.getFieldValue('address1') || '',
    address2: form.getFieldValue('address2') || ''
  } : (value || {});
  
  const { postal_code = '', address1 = '', address2 = '' } = currentAddress;
  

  // 주소 선택 핸들러
  const handleAddressSelect = (newAddress) => {
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
    
    // 모달 닫기
    setModalVisible(false);
  };

  // 주소 검색 버튼 클릭
  const handleAddressSearch = () => {
    setModalVisible(true);
  };

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
      <Space direction="vertical" className="space-full">
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
              variant="secondary"
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
          className="input-full"
        />
        
        {/* 상세주소 */}
        {address1 && address1.length > 0 ? (
          <Input 
            key="address2-enabled"
            value={address2}
            onChange={handleAddress2Change}
            placeholder="상세주소를 입력하세요"
            className="input-full"
          />
        ) : (
          <div 
            key="address2-disabled"
            className="w-full px-sm py-sm bg-tertiary border border-medium rounded text-tertiary cursor-not-allowed flex-center min-h-8"
          >
            ❌ 주소검색을 먼저 해주세요
          </div>
        )}
      </Space>

      {/* 주소 검색 모달 */}
      {modalVisible && (
        <AddressSearchModal
          key={Date.now()}
          visible={true}
          onClose={() => setModalVisible(false)}
          onAddressSelect={handleAddressSelect}
        />
      )}
    </div>
  );
};

export default AddressSearchInput;