import React, { useState, useEffect } from 'react';
import { Modal, Empty, Spin, Tag, Typography, Space } from 'antd';
import { HomeOutlined, HistoryOutlined } from '@ant-design/icons';

const { Text } = Typography;

const AddressArchiveModal = ({ visible, onClose, customerId, customerName }) => {
  const [addressHistory, setAddressHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // 주소 이력 조회
  const fetchAddressHistory = async () => {
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
  };

  useEffect(() => {
    if (visible && customerId) {
      fetchAddressHistory();
    }
  }, [visible, customerId]);

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
      <div style={{ padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>주소 이력을 불러오는 중...</div>
          </div>
        ) : addressHistory.length === 0 ? (
          <Empty
            image={<HomeOutlined style={{ fontSize: '48px', color: 'var(--color-text-tertiary)' }} />}
            description={
              <div>
                <div>주소 변경 이력이 없습니다.</div>
                <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--color-text-tertiary)' }}>
                  고객 주소를 변경하면 이전 주소가 여기에 보관됩니다.
                </div>
              </div>
            }
          />
        ) : (
          <div>
            <div style={{ 
              marginBottom: '16px', 
              padding: '8px 12px', 
              backgroundColor: 'var(--color-bg-secondary)', 
              borderRadius: '6px',
              border: '1px solid var(--color-border)'
            }}>
              <Text type="secondary" style={{ fontSize: '13px' }}>
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
                  <div key={item._id || index} style={{ display: 'flex', marginBottom: '20px' }}>
                    {/* 날짜/시간 */}
                    <div style={{ width: '140px', textAlign: 'right', fontSize: '11px', paddingRight: '20px', paddingTop: '4px', flexShrink: 0 }}>
                      <div style={{ color: 'var(--color-text-secondary)' }}>
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
                    <div style={{ 
                      width: '24px', 
                      height: '24px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      backgroundColor: isFirst ? 'green' : '#1890ff',
                      borderRadius: '50%',
                      color: 'white',
                      fontSize: '12px',
                      marginRight: '16px',
                      flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      {isFirst ? <HomeOutlined /> : <HistoryOutlined />}
                    </div>

                    {/* 주소 내용 */}
                    <div style={{ flex: 1 }}>
                      {isFirst && (
                        <Tag color="green" style={{ marginBottom: '8px', fontSize: '11px' }}>현재 주소</Tag>
                      )}
                      
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '14px',
                        color: 'var(--color-text-primary)',
                        marginBottom: '6px',
                        lineHeight: '1.4'
                      }}>
                        📍 {formatAddress(item.address)}
                      </div>
                      
                      {item.reason && item.reason !== '현재 주소' && (
                        <div style={{ marginBottom: '6px' }}>
                          <Tag color={getReasonTagColor(item.reason)} style={{ fontSize: '11px' }}>
                            {item.reason}
                          </Tag>
                        </div>
                      )}
                      
                      {changes.length > 0 && !isFirst && (
                        <div style={{ marginBottom: '6px' }}>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            변경사항: {changes.join(', ')}
                          </Text>
                        </div>
                      )}
                      
                      {item.notes && (
                        <div style={{ 
                          fontSize: '12px', 
                          color: 'var(--color-text-secondary)',
                          marginTop: '4px',
                          fontStyle: 'italic'
                        }}>
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