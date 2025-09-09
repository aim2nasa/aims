import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, Form, Select, Input, 
  Space, message, Tag, Divider, List, Avatar, Spin
} from 'antd';
import { Button } from './common';
import { LinkOutlined, UserOutlined, FileTextOutlined, ExclamationCircleOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;

const DocumentLinkModal = ({ 
  visible, 
  onCancel, 
  documentId, 
  documentName,
  onLinkSuccess 
}) => {
  const [customers, setCustomers] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);

  useEffect(() => {
    if (visible) {
      setSearchTerm('');
      setSelectedCustomerId(null);
      setCustomers([]);
      setPagination({ current: 1, pageSize: 20, total: 0 });
      // 처음에는 빈 상태로 시작 - 사용자가 검색해야 함
    }
  }, [visible]);

  // 검색 함수
  const performSearch = useCallback(async (searchValue, page = 1) => {
      if (!searchValue.trim()) {
        setCustomers([]);
        setPagination({ current: 1, pageSize: 20, total: 0 });
        return;
      }

      setSearchLoading(true);
      try {
        const response = await axios.get('http://tars.giize.com:3010/api/customers', {
          params: { 
            search: searchValue,
            page: page,
            limit: 20
          }
        });

        if (response.data.success) {
          setCustomers(response.data.data.customers);
          setPagination({
            current: page,
            pageSize: 20,
            total: response.data.data.total || response.data.data.customers.length
          });
        }
      } catch (error) {
        message.error('고객 검색에 실패했습니다.');
        console.error(error);
      } finally {
        setSearchLoading(false);
      }
  }, []);


  const handleSearch = (value) => {
    setSearchTerm(value);
    performSearch(value, 1);
  };

  const handleSubmit = async (values) => {
    const customerId = values.customer_id || selectedCustomerId;
    
    if (!customerId) {
      message.error('고객을 선택해주세요.');
      return;
    }

    try {
      // 먼저 해당 고객의 문서 목록을 확인하여 중복 연결 체크
      const checkResponse = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}/documents`);
      
      if (checkResponse.data.success) {
        const existingDocuments = checkResponse.data.data.documents || [];
        const isAlreadyLinked = existingDocuments.some(doc => doc._id === documentId);
        
        if (isAlreadyLinked) {
          setShowDuplicateAlert(true);
          return;
        }
      }

      const response = await axios.post(`http://tars.giize.com:3010/api/customers/${customerId}/documents`, {
        document_id: documentId,
        relationship_type: values.relationship_type,
        notes: values.notes
      });

      if (response.data.success) {
        message.success('문서가 고객에게 성공적으로 연결되었습니다.');
        
        // 연결된 고객 정보 구성
        const customerInfo = {
          customer_id: customerId,
          relationship_type: values.relationship_type,
          assigned_by: null,
          assigned_at: new Date().toISOString(),
          notes: values.notes || ""
        };
        
        onLinkSuccess && onLinkSuccess(documentId, customerInfo);
        handleCancel();
      }
    } catch (error) {
      // 서버에서 중복 연결 오류가 발생한 경우도 처리
      if (error.response?.status === 400 && error.response?.data?.message?.includes('이미 연결')) {
        message.warning('이 문서는 이미 선택한 고객과 연결되어 있습니다.');
      } else {
        message.error('문서 연결에 실패했습니다.');
      }
      console.error(error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSearchTerm('');
    setSelectedCustomerId(null);
    setCustomers([]);
    onCancel();
  };

  const relationshipTypes = [
    { value: 'contract', label: '계약서', color: 'blue' },
    { value: 'claim', label: '보험금청구서', color: 'orange' },
    { value: 'proposal', label: '제안서', color: 'green' },
    { value: 'id_verification', label: '신분증명서', color: 'purple' },
    { value: 'medical', label: '의료서류', color: 'red' },
    { value: 'general', label: '일반문서', color: 'default' }
  ];

  // 고객 선택 시 중복 체크
  const handleCustomerSelect = async (customer) => {
    try {
      const checkResponse = await axios.get(`http://tars.giize.com:3010/api/customers/${customer._id}/documents`);
      
      if (checkResponse.data.success) {
        const existingDocuments = checkResponse.data.data.documents || [];
        const isAlreadyLinked = existingDocuments.some(doc => doc._id === documentId);
        
        if (isAlreadyLinked) {
          setShowDuplicateAlert(true);
          return;
        }
      }
      
      setSelectedCustomerId(customer._id);
      form.setFieldsValue({ customer_id: customer._id });
    } catch (error) {
      console.error('고객 문서 확인 실패:', error);
      // 에러가 발생해도 선택은 가능하도록
      setSelectedCustomerId(customer._id);
      form.setFieldsValue({ customer_id: customer._id });
    }
  };

  // 페이지네이션 변경
  const handlePageChange = (page) => {
    performSearch(searchTerm, page);
  };

  // 선택된 고객 정보 찾기
  const selectedCustomer = customers.find(c => c._id === selectedCustomerId);

  return (
    <Modal
      title={
        <Space>
          <LinkOutlined />
          문서를 고객에게 연결
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={800}
      footer={null}
      style={{ top: 20 }}
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <FileTextOutlined />
          <strong>연결할 문서:</strong>
          <Tag color="blue">{documentName}</Tag>
        </Space>
      </div>

      <Divider />

      {/* 고객 검색 섹션 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <strong>고객 검색</strong>
          <span style={{ color: '#666', fontSize: '12px', marginLeft: 8 }}>
            이름 또는 연락처로 검색하세요 (더 구체적으로 검색하면 빠릅니다)
          </span>
        </div>
        <Input.Search
          placeholder="예: '김철수', '010-1234', '김철' 등 (최소 2글자)"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ marginBottom: 16 }}
          size="large"
          prefix={<SearchOutlined />}
          loading={searchLoading}
        />
        
        {/* 검색 결과 수 및 안내 */}
        {searchTerm && pagination.total > 0 && (
          <div style={{ 
            marginBottom: 12, 
            padding: '8px 12px', 
            backgroundColor: 'var(--color-success-bg)', 
            border: '1px solid var(--color-success-border)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--color-text-primary)'
          }}>
            <Space>
              <span>검색 결과: <strong>{pagination.total}명</strong></span>
              {pagination.total > 100 && (
                <span style={{ color: 'var(--color-warning)' }}>
                  • 결과가 많습니다. 더 구체적인 검색어를 사용해보세요
                </span>
              )}
            </Space>
          </div>
        )}

        {/* 선택된 고객 표시 */}
        {selectedCustomer && (
          <div style={{ 
            background: '#f0f9ff', 
            border: '1px solid #bae6fd', 
            borderRadius: '6px', 
            padding: '12px',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space>
                <Avatar icon={<UserOutlined />} size="small" style={{ backgroundColor: '#0ea5e9' }} />
                <div>
                  <div style={{ fontWeight: 500 }}>{selectedCustomer.personal_info?.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {selectedCustomer.personal_info?.phone} • {selectedCustomer.insurance_info?.customer_type}
                  </div>
                </div>
              </Space>
              <Button 
                size="small" 
                variant="ghost" 
                onClick={() => {
                  setSelectedCustomerId(null);
                  form.setFieldsValue({ customer_id: null });
                }}
              >
                선택 해제
              </Button>
            </div>
          </div>
        )}

        {/* 검색 결과 리스트 */}
        {searchTerm && (
          <div style={{ 
            border: '1px solid var(--color-border)', 
            borderRadius: '6px',
            maxHeight: '280px',
            overflow: 'auto',
            backgroundColor: 'var(--color-bg-primary)'
          }}>
            <Spin spinning={searchLoading}>
              {customers.length > 0 ? (
                <List
                  dataSource={customers}
                  renderItem={(customer) => (
                    <List.Item
                      key={customer._id}
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: selectedCustomerId === customer._id ? 'var(--color-primary-bg)' : 'var(--color-bg-primary)',
                        padding: '12px 16px',
                        color: 'var(--color-text-primary)'
                      }}
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} size="small" />}
                        title={
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-primary)' }}>
                            <span>{customer.personal_info?.name}</span>
                            {selectedCustomerId === customer._id && (
                              <Tag color="blue" size="small">선택됨</Tag>
                            )}
                          </div>
                        }
                        description={
                          <Space split={<span style={{ color: 'var(--color-text-secondary)' }}>•</span>}>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{customer.personal_info?.phone || '연락처 없음'}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{customer.insurance_info?.customer_type || '유형 없음'}</span>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                  {searchLoading ? '검색 중...' : '검색 결과가 없습니다.'}
                </div>
              )}
            </Spin>
            
            {/* 페이지네이션 */}
            {pagination.total > pagination.pageSize && (
              <div style={{ 
                padding: '12px 16px', 
                borderTop: '1px solid #f0f0f0', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#fafafa'
              }}>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {((pagination.current - 1) * pagination.pageSize) + 1} - {Math.min(pagination.current * pagination.pageSize, pagination.total)} / {pagination.total}명
                </div>
                <Space>
                  <Button 
                    size="small"
                    variant="secondary"
                    disabled={pagination.current <= 1}
                    onClick={() => handlePageChange(pagination.current - 1)}
                  >
                    이전
                  </Button>
                  <Button size="small" variant="ghost" disabled style={{ minWidth: '60px' }}>
                    {pagination.current} / {Math.ceil(pagination.total / pagination.pageSize)}
                  </Button>
                  <Button 
                    size="small"
                    variant="secondary"
                    disabled={pagination.current >= Math.ceil(pagination.total / pagination.pageSize)}
                    onClick={() => handlePageChange(pagination.current + 1)}
                  >
                    다음
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}

        {!searchTerm && (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center', 
            color: '#999',
            border: '1px dashed #d9d9d9',
            borderRadius: '6px'
          }}>
            위의 검색창에서 고객을 검색해주세요
          </div>
        )}
      </div>

      <Divider />

      {/* 문서 연결 폼 */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item name="customer_id" style={{ display: 'none' }}>
          <Input />
        </Form.Item>

        <Form.Item
          label="문서 유형"
          name="relationship_type"
          rules={[{ required: true, message: '문서 유형을 선택해주세요' }]}
        >
          <Select placeholder="문서 유형을 선택하세요" size="large">
            {relationshipTypes.map(type => (
              <Option key={type.value} value={type.value}>
                <Tag color={type.color}>{type.label}</Tag>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="메모"
          name="notes"
        >
          <TextArea
            rows={3}
            placeholder="이 문서와 고객의 관계에 대한 추가 설명을 입력하세요"
          />
        </Form.Item>

        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={handleCancel} variant="secondary" size="large">취소</Button>
            <Button 
              type="submit"
              variant="primary" 
              htmlType="submit" 
              size="large"
              disabled={!selectedCustomerId}
            >
              연결하기
            </Button>
          </Space>
        </div>
      </Form>

      {/* 중복 연결 알림 모달 */}
      <Modal
        open={showDuplicateAlert}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: '18px' }} />
            <span>중복 연결</span>
          </div>
        }
        onCancel={() => setShowDuplicateAlert(false)}
        footer={[
          <Button key="ok" variant="primary" onClick={() => setShowDuplicateAlert(false)}>
            확인
          </Button>
        ]}
        centered
        width={400}
      >
        <div style={{ padding: '16px 0', fontSize: '14px' }}>
          이 문서는 이미 선택한 고객과 연결되어 있습니다.
        </div>
      </Modal>
    </Modal>
  );
};

export default DocumentLinkModal;