import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, DatePicker, 
  Space, message, Tag, Card,
  Tabs, Drawer, Row, Col
} from 'antd';
import { 
  PlusOutlined, UserOutlined, FileTextOutlined, PhoneOutlined,
  SearchOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import AddressSearchInput from './AddressSearchInput';

const { Option } = Select;
const { TabPane } = Tabs;

const CustomerManagement = ({ onCustomerClick, onRefreshCustomerListSet }) => {
  // 고객 목록 관리
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searchText, setSearchText] = useState('');

  // 통합 모달 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null); // null이면 새 등록, 데이터 있으면 수정
  const [currentAddress1, setCurrentAddress1] = useState('');
  const [addressSearchVisible, setAddressSearchVisible] = useState(false);
  
  // 기타
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [documentsDrawerVisible, setDocumentsDrawerVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCustomers();
  }, [pagination.current, pagination.pageSize, searchText]);

  // 컴포넌트 마운트 시 새로고침 콜백 등록
  useEffect(() => {
    if (onRefreshCustomerListSet) {
      onRefreshCustomerListSet(() => fetchCustomers);
    }
    
    return () => {
      if (onRefreshCustomerListSet) {
        onRefreshCustomerListSet(null);
      }
    };
  }, [onRefreshCustomerListSet]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`http://tars.giize.com:3010/api/customers`, {
        params: {
          page: pagination.current,
          limit: pagination.pageSize,
          search: searchText
        }
      });

      if (response.data.success) {
        setCustomers(response.data.data.customers);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.pagination.totalCount
        }));
      }
    } catch (error) {
      message.error('고객 목록 조회에 실패했습니다.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTableChange = (page, pageSize) => {
    setPagination({
      current: page,
      pageSize: pageSize,
      total: pagination.total
    });
  };

  // 통합 모달 열기 함수
  const openCustomerModal = (customer = null) => {
    setEditingCustomer(customer);
    setModalVisible(true);
    
    if (customer) {
      // 수정 모드: 기존 데이터 로드
      const address1 = customer.personal_info?.address?.address1 || '';
      setCurrentAddress1(address1);
      
      form.setFieldsValue({
        ...customer.personal_info,
        birth_date: customer.personal_info.birth_date ? dayjs(customer.personal_info.birth_date) : null,
        postal_code: customer.personal_info?.address?.postal_code,
        address1: address1,
        address2: customer.personal_info?.address?.address2,
        customer_type: customer.insurance_info?.customer_type,
        risk_level: customer.insurance_info?.risk_level,
        annual_premium: customer.insurance_info?.annual_premium,
        total_coverage: customer.insurance_info?.total_coverage
      });
    } else {
      // 새 등록 모드: 폼 초기화
      form.resetFields();
      setCurrentAddress1('');
    }
  };

  // 통합 모달 닫기 함수
  const closeCustomerModal = () => {
    setModalVisible(false);
    setEditingCustomer(null);
    setCurrentAddress1('');
    form.resetFields();
  };

  // 통합 제출 함수
  const handleSubmit = async (values) => {
    try {
      const customerData = {
        personal_info: {
          name: values.name,
          name_en: values.name_en,
          birth_date: values.birth_date ? values.birth_date.toDate() : null,
          gender: values.gender,
          phone: values.phone,
          email: values.email,
          address: {
            postal_code: values.postal_code,
            address1: values.address1,
            address2: values.address2
          }
        },
        insurance_info: {
          customer_type: values.customer_type,
          risk_level: values.risk_level,
          annual_premium: values.annual_premium,
          total_coverage: values.total_coverage
        },
        contracts: [],
        documents: [],
        consultations: []
      };

      let response;
      if (editingCustomer) {
        // 수정
        response = await axios.put(`http://tars.giize.com:3010/api/customers/${editingCustomer._id}`, customerData);
      } else {
        // 새 등록
        response = await axios.post('http://tars.giize.com:3010/api/customers', customerData);
      }

      if (response.data.success) {
        if (!editingCustomer && response.data.data.was_renamed) {
          message.warning(response.data.data.message, 5);
        } else {
          message.success(editingCustomer ? '고객 정보가 수정되었습니다.' : '고객이 등록되었습니다.');
        }
        
        closeCustomerModal();
        fetchCustomers();
      }
    } catch (error) {
      message.error('고객 정보 저장에 실패했습니다.');
      console.error(error);
    }
  };

  const deleteCustomer = async (id) => {
    try {
      const response = await axios.delete(`http://tars.giize.com:3010/api/customers/${id}`);
      if (response.data.success) {
        message.success('고객이 삭제되었습니다.');
        fetchCustomers();
      }
    } catch (error) {
      message.error('고객 삭제에 실패했습니다.');
      console.error(error);
    }
  };

  const showCustomerDocuments = async (customerId) => {
    try {
      setDocumentsDrawerVisible(true);
      
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}/documents`);
      if (response.data.success) {
        setCustomerDocuments(response.data.data.documents);
      }
    } catch (error) {
      message.error('고객 문서 조회에 실패했습니다.');
      console.error(error);
    }
  };

  const handleCustomerNameClick = (customerId) => {
    if (onCustomerClick) {
      onCustomerClick(customerId);
    }
  };

  const handleCustomerRowSelect = (customer) => {
    if (onCustomerClick) {
      onCustomerClick(customer._id);
    }
  };

  const columns = [
    {
      title: '고객명',
      dataIndex: ['personal_info', 'name'],
      key: 'name',
      width: 200,
      render: (name, record) => (
        <Space>
          <UserOutlined />
          <span 
            style={{ 
              fontWeight: 'bold', 
              color: '#1890ff', 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
            onClick={() => handleCustomerNameClick(record._id)}
          >
            {name}
          </span>
          {record.insurance_info?.risk_level === '고위험' && 
            <Tag color="red">고위험</Tag>
          }
        </Space>
      )
    },
    {
      title: '연락처',
      dataIndex: ['personal_info', 'phone'],
      key: 'phone',
      width: 150,
      render: phone => phone && (
        <Space>
          <PhoneOutlined />
          <span>{phone}</span>
        </Space>
      )
    },
    {
      title: '고객 유형',
      dataIndex: ['insurance_info', 'customer_type'],
      key: 'customer_type',
      width: 100,
      render: type => type && <Tag color={type === '법인' ? 'blue' : 'green'}>{type}</Tag>
    },
    {
      title: '문서 수',
      key: 'documents_count',
      width: 100,
      render: (_, record) => (
        <Button 
          type="link" 
          icon={<FileTextOutlined />}
          onClick={() => showCustomerDocuments(record._id)}
        >
          {record.documents?.length || 0}개
        </Button>
      )
    },
    {
      title: '상태',
      dataIndex: ['meta', 'status'],
      key: 'status',
      width: 80,
      render: status => {
        const color = status === 'active' ? 'green' : 'red';
        const text = status === 'active' ? '활성' : '비활성';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '등록일',
      dataIndex: ['meta', 'created_at'],
      key: 'created_at',
      width: 120,
      render: date => date && dayjs(date).format('YYYY-MM-DD')
    }
  ];

  const documentColumns = [
    {
      title: '파일명',
      dataIndex: 'originalName',
      key: 'originalName'
    },
    {
      title: '문서 유형',
      dataIndex: 'relationship',
      key: 'relationship',
      render: type => <Tag>{type}</Tag>
    },
    {
      title: '처리 상태',
      dataIndex: 'overallStatus',
      key: 'status',
      render: status => {
        const statusConfig = {
          completed: { color: 'green', text: '완료' },
          processing: { color: 'blue', text: '처리중' },
          error: { color: 'red', text: '오류' },
          pending: { color: 'orange', text: '대기' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '연결일',
      dataIndex: 'linkedAt',
      key: 'linkedAt',
      render: date => date && dayjs(date).format('YYYY-MM-DD')
    }
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <UserOutlined />
            고객 관리
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="고객명, 전화번호, 이메일 검색"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={fetchCustomers}
              style={{ width: 300 }}
              prefix={<SearchOutlined />}
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => openCustomerModal()}
            >
              새 고객 등록
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={customers}
          rowKey="_id"
          loading={loading}
          scroll={{ x: false }}
          tableLayout="fixed"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            onChange: handleTableChange,
            onShowSizeChange: handleTableChange
          }}
          onRow={(record) => ({
            onClick: () => handleCustomerRowSelect(record),
            style: {
              cursor: 'pointer'
            }
          })}
        />
      </Card>

      {/* 통합 고객 모달 */}
      <Modal
        title={editingCustomer ? "고객 정보 수정" : "새 고객 등록"}
        open={modalVisible}
        onCancel={closeCustomerModal}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Tabs defaultActiveKey="personal">
            <TabPane tab="기본 정보" key="personal">
              <Form.Item label="고객명" name="name" rules={[{ required: true, message: '고객명을 입력해주세요' }]}>
                <Input />
              </Form.Item>
              
              <Form.Item label="영문명" name="name_en">
                <Input />
              </Form.Item>
              
              <Form.Item label="생년월일" name="birth_date">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item label="성별" name="gender">
                <Select>
                  <Option value="M">남성</Option>
                  <Option value="F">여성</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="휴대폰번호" name="phone">
                <Input />
              </Form.Item>
              
              <Form.Item label="이메일" name="email">
                <Input type="email" />
              </Form.Item>
            </TabPane>
            
            <TabPane tab="주소 정보" key="address">
              <Form.Item label="주소">
                <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px', padding: '16px', backgroundColor: '#fafafa' }}>
                  {/* 주소 검색 영역 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>📍 주소 검색</div>
                    <Row gutter={8}>
                      <Col span={18}>
                        <Input
                          placeholder="도로명 또는 지번 주소를 검색하세요 (예: 테헤란로 123)"
                          onClick={() => setAddressSearchVisible(true)}
                          onFocus={(e) => {
                            e.target.blur();
                            setAddressSearchVisible(true);
                          }}
                          readOnly
                          style={{ cursor: 'pointer' }}
                        />
                      </Col>
                      <Col span={6}>
                        <Button 
                          type="primary" 
                          icon={<SearchOutlined />}
                          onClick={() => setAddressSearchVisible(true)}
                          block
                        >
                          검색
                        </Button>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* 검색 결과 표시 영역 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>🏠 검색된 주소</div>
                    <Row gutter={8}>
                      <Col span={8}>
                        <Form.Item name="postal_code" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="우편번호"
                            readOnly
                            style={{ backgroundColor: '#fff', color: '#595959' }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item name="address1" style={{ marginBottom: 0 }}>
                          <Input 
                            placeholder="주소를 검색하면 자동으로 채워집니다"
                            readOnly
                            style={{ backgroundColor: '#fff', color: '#595959' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* 상세주소 입력 영역 */}
                  <div>
                    <div style={{ marginBottom: '8px', fontWeight: '500', color: '#262626' }}>✏️ 상세주소 입력</div>
                    <Form.Item name="address2" style={{ marginBottom: 0 }}>
                      <Input 
                        placeholder={currentAddress1 ? "상세주소를 입력하세요 (동/호수, 건물명 등)" : "❌ 주소검색을 먼저 해주세요"}
                        style={{ 
                          backgroundColor: currentAddress1 ? '#fff' : '#f5f5f5',
                          border: currentAddress1 ? '2px solid #1890ff' : '1px solid #d9d9d9',
                          borderRadius: '6px',
                          color: currentAddress1 ? '#000' : '#999'
                        }}
                        disabled={!currentAddress1}
                        readOnly={!currentAddress1}
                      />
                    </Form.Item>
                  </div>
                </div>
              </Form.Item>
              
              {/* AddressSearchInput 숨김 컴포넌트 */}
              <div style={{ position: 'absolute', left: '-9999px', visibility: 'hidden' }}>
                <AddressSearchInput 
                  form={form} 
                  modalVisible={addressSearchVisible}
                  onModalVisibleChange={setAddressSearchVisible}
                  onChange={(address) => {
                    setCurrentAddress1(address.address1 || '');
                    form.setFieldsValue({
                      postal_code: address.postal_code,
                      address1: address.address1,
                      address2: address.address2
                    });
                  }}
                />
              </div>
            </TabPane>
            
            <TabPane tab="보험 정보" key="insurance">
              <Form.Item label="고객 유형" name="customer_type">
                <Select>
                  <Option value="개인">개인</Option>
                  <Option value="법인">법인</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="위험도" name="risk_level">
                <Select>
                  <Option value="저위험">저위험</Option>
                  <Option value="중위험">중위험</Option>
                  <Option value="고위험">고위험</Option>
                </Select>
              </Form.Item>
              
              <Form.Item label="연간 보험료" name="annual_premium">
                <Input type="number" addonAfter="원" />
              </Form.Item>
              
              <Form.Item label="총 보장금액" name="total_coverage">
                <Input type="number" addonAfter="원" />
              </Form.Item>
            </TabPane>
          </Tabs>
          
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={closeCustomerModal}>취소</Button>
              <Button type="primary" htmlType="submit">
                {editingCustomer ? '수정' : '등록'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 고객 문서 목록 Drawer */}
      <Drawer
        title="고객 관련 문서"
        placement="right"
        onClose={() => setDocumentsDrawerVisible(false)}
        open={documentsDrawerVisible}
        width={600}
      >
        <Table
          columns={documentColumns}
          dataSource={customerDocuments}
          rowKey="_id"
          pagination={false}
          size="small"
        />
      </Drawer>
    </div>
  );
};

export default CustomerManagement;