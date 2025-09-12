import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Empty, Spin, Tag, Typography, Space } from 'antd';
import { HomeOutlined, HistoryOutlined } from '@ant-design/icons';

const { Text } = Typography;

const AddressArchiveModal = ({ visible, onClose, customerId, customerName }) => {
  const [addressHistory, setAddressHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // 주소 이력 조회
  const fetchAddressHistory = useCallback(async () => {
    if (!customerId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}/address-history`);
      const data = await response.json();
      
      if (data.success) {
        setAddressHistory(data.data || []);
      }
    } catch (error) {
      console.error('주소 이력 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (visible && customerId) {
      fetchAddressHistory();
    }
  }, [visible, customerId, fetchAddressHistory]);

  // 주소 포맷팅
  const formatAddress = (address) => {
    if (!address) return '주소 없음';
    
    const parts = [];
    if (address.postal_code) parts.push(`[${address.postal_code}]`);
    if (address.address1) parts.push(address.address1);
    if (address.address2) parts.push(address.address2);
    
    return parts.join(' ') || '주소 없음';
  };

  // 변경 이유 태그 색상
  const getReasonTagColor = (reason) => {
    switch (reason) {
      case '고객 요청': return 'blue';
      case '이사': return 'green';
      case '데이터 수정': return 'orange';
      case '시스템 수정': return 'red';
      default: return 'default';
    }
  };

  // 현재 주소와 이전 주소 비교
  const getAddressChanges = (current, previous) => {
    const changes = [];
    
    if (current?.postal_code !== previous?.postal_code) {
      changes.push('우편번호');
    }
    if (current?.address1 !== previous?.address1) {
      changes.push('기본주소');
    }
    if (current?.address2 !== previous?.address2) {
      changes.push('상세주소');
    }
    
    return changes;
  };

  return (
    <Modal
      title={
        <Space>
          <HomeOutlined />
          <span>{customerName}님의 주소 보관소</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnClose={true}
    >
      <div className="py-xs">
        {loading ? (
          <div className="loading-container">
            <Spin size="large" />
            <div className="loading-text">주소 이력을 불러오는 중...</div>
          </div>
        ) : addressHistory.length === 0 ? (
          <Empty
            image={<HomeOutlined className="empty-state-icon" />}
            description={
              <div>
                <div>주소 변경 이력이 없습니다.</div>
                <div className="text-xs mt-xs text-tertiary">
                  고객 주소를 변경하면 이전 주소가 여기에 보관됩니다.
                </div>
              </div>
            }
          />
        ) : (
          <div>
            <div className="mb-md p-sm bg-secondary rounded border">
              <Text type="secondary" className="text-xs">
                <HistoryOutlined /> 총 {addressHistory.length}건의 주소 변경 이력이 있습니다.
              </Text>
            </div>

            <div>
              {addressHistory.map((item, index) => {
                const isFirst = index === 0;
                const changes = index < addressHistory.length - 1 
                  ? getAddressChanges(item.address, addressHistory[index + 1].address)
                  : [];

                return (
                  <div key={item._id || index} className="flex mb-lg">
                    {/* 날짜/시간 */}
                    <div className="text-right text-xs pr-lg pt-xs flex-shrink-0 w-140">
                      <div className="text-secondary">
                        {new Date(item.changed_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'numeric', 
                          day: 'numeric'
                        })} {new Date(item.changed_at).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>

                    {/* 아이콘 */}
                    <div className={`address-icon ${
                      isFirst ? 'address-icon-current' : 'address-icon-history'
                    }`}>
                      {isFirst ? <HomeOutlined /> : <HistoryOutlined />}
                    </div>

                    {/* 주소 내용 */}
                    <div className="flex-1">
                      {isFirst && (
                        <Tag color="green" className="mb-xs text-xs">현재 주소</Tag>
                      )}
                      
                      <div className="font-bold text-sm text-primary mb-1_5 leading-tight">
                        📍 {formatAddress(item.address)}
                      </div>
                      
                      {item.reason && item.reason !== '현재 주소' && (
                        <div className="mb-xs">
                          <Tag color={getReasonTagColor(item.reason)} className="text-3xs">
                            {item.reason}
                          </Tag>
                        </div>
                      )}
                      
                      {changes.length > 0 && !isFirst && (
                        <div className="mb-xs">
                          <Text type="secondary" className="text-2xs">
                            변경사항: {changes.join(', ')}
                          </Text>
                        </div>
                      )}
                      
                      {item.notes && (
                        <div className="text-2xs text-secondary mt-1 italic">
                          메모: {item.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </Modal>
  );
};

export default AddressArchiveModal;