import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Modal, Form, Input, Select, DatePicker, 
  Space, message, Popconfirm, Tag, Card,
  Tabs, Drawer
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, 
  UserOutlined, FileTextOutlined, PhoneOutlined,
  MailOutlined, SearchOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import CustomerDetailModal from './CustomerDetailModal';
import CustomerDetailPanel from './CustomerDetailPanel';

const { Option } = Select;
const { TabPane } = Tabs;

const CustomerManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [documentsDrawerVisible, setDocumentsDrawerVisible] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  
  // 고객 상세 모달 관련 상태
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCustomerIdForDetail, setSelectedCustomerIdForDetail] = useState(null);
  
  // 고객 선택 관련 상태 (3-pane layout)
  const [selectedCustomerForPanel, setSelectedCustomerForPanel] = useState(null);
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  
  // 리사이즈 관련 상태
  const OPTIMAL_CUSTOMER_PANEL_WIDTH = 40;
  const [customerPanelWidth, setCustomerPanelWidth] = useState(OPTIMAL_CUSTOMER_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searchText, setSearchText] = useState('');
  
  // 리사이즈 마우스 이벤트 리스너 등록
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!isResizing) return;
      
      const containerElement = document.querySelector('[data-testid="customer-container"]');
      if (!containerElement) return;
      
      const containerRect = containerElement.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      
      const newCustomerPanelWidth = ((containerWidth - mouseX) / containerWidth) * 100;
      const clampedWidth = Math.max(25, Math.min(70, newCustomerPanelWidth));
      setCustomerPanelWidth(clampedWidth);
    };

    const handleGlobalMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    fetchCustomers();
  }, [pagination.current, pagination.pageSize, searchText]);

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

  const showModal = (customer = null) => {
    setEditingCustomer(customer);
    setModalVisible(true);
    
    if (customer) {
      form.setFieldsValue({
        ...customer.personal_info,
        birth_date: customer.personal_info.birth_date ? dayjs(customer.personal_info.birth_date) : null,
        postal_code: customer.personal_info.address?.postal_code,
        address1: customer.personal_info.address?.address1,
        address2: customer.personal_info.address?.address2,
        customer_type: customer.insurance_info?.customer_type,
        risk_level: customer.insurance_info?.risk_level,
        annual_premium: customer.insurance_info?.annual_premium,
        total_coverage: customer.insurance_info?.total_coverage
      });
    } else {
      form.resetFields();
    }
  };

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
        response = await axios.put(`http://tars.giize.com:3010/api/customers/${editingCustomer._id}`, customerData);
      } else {
        response = await axios.post('http://tars.giize.com:3010/api/customers', customerData);
      }

      if (response.data.success) {
        message.success(editingCustomer ? '고객 정보가 수정되었습니다.' : '고객이 등록되었습니다.');
        setModalVisible(false);
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
      setSelectedCustomerId(customerId);
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

  // 고객 상세 모달 핸들러
  const handleCustomerNameClick = (customerId) => {
    setSelectedCustomerIdForDetail(customerId);
    setShowDetailModal(true);
  };

  const handleDetailModalClose = () => {
    setShowDetailModal(false);
    setSelectedCustomerIdForDetail(null);
  };
  
  // 고객 행 클릭 핸들러 (3-pane layout)
  const handleCustomerRowSelect = (customer) => {
    setSelectedCustomerForPanel(customer._id);
    setShowCustomerPanel(true);
  };
  
  // 고객 패널 닫기
  const handleCustomerPanelClose = () => {
    setSelectedCustomerForPanel(null);
    setShowCustomerPanel(false);
  };
  
  // 최적 비율로 리셋
  const resetToOptimalRatio = () => {
    setCustomerPanelWidth(OPTIMAL_CUSTOMER_PANEL_WIDTH);
  };
  
  // 리사이즈 핸들러
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const columns = [
    {
      title: '고객명',
      dataIndex: ['personal_info', 'name'],
      key: 'name',
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
      render: phone => phone && (
        <Space>
          <PhoneOutlined />
          <span>{phone}</span>
        </Space>
      )
    },
    {
      title: '이메일',
      dataIndex: ['personal_info', 'email'],
      key: 'email',
      render: email => email && (
        <Space>
          <MailOutlined />
          <span>{email}</span>
        </Space>
      )
    },
    {
      title: '고객 유형',
      dataIndex: ['insurance_info', 'customer_type'],
      key: 'customer_type',
      render: type => type && <Tag color={type === '법인' ? 'blue' : 'green'}>{type}</Tag>
    },
    {
      title: '연간 보험료',
      dataIndex: ['insurance_info', 'annual_premium'],
      key: 'annual_premium',
      render: premium => premium && `₩${premium.toLocaleString()}`
    },
    {
      title: '문서 수',
      key: 'documents_count',
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
      render: date => date && dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '작업',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => showModal(record)}
          >
            수정
          </Button>
          <Popconfirm
            title="고객을 삭제하시겠습니까?"
            onConfirm={() => deleteCustomer(record._id)}
            okText="예"
            cancelText="아니요"
          >
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              size="small"
            >
              삭제
            </Button>
          </Popconfirm>
        </Space>
      )
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
    <>
      <div 
        data-testid="customer-container"
        style={{ height: '100%', display: 'flex', position: 'relative' }}
      >
        {/* Left Section - Customer Table */}
        <div style={{ 
          width: showCustomerPanel ? `${100 - customerPanelWidth}%` : '100%',
          marginRight: showCustomerPanel ? 12 : 0,
          transition: isResizing ? 'none' : 'width 0.3s ease'
        }}>
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
                  style={{ width: 250 }}
                  prefix={<SearchOutlined />}
                />
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => showModal()}
                >
                  새 고객 등록
                </Button>
              </Space>
            }
            style={{ height: '100%' }}
            bodyStyle={{ height: 'calc(100% - 65px)', overflow: 'auto' }}
          >
            <Table
              columns={columns}
              dataSource={customers}
              rowKey="_id"
              loading={loading}
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
                  cursor: 'pointer',
                  backgroundColor: selectedCustomerForPanel === record._id ? '#e6f7ff' : 'transparent'
                }
              })}
              rowClassName={(record) => 
                selectedCustomerForPanel === record._id ? 'ant-table-row-selected' : ''
              }
            />
          </Card>
        </div>

        {/* Resize Handle */}
        {showCustomerPanel && (
          <div
            onMouseDown={handleMouseDown}
            style={{
              width: '4px',
              cursor: 'col-resize',
              background: isResizing ? '#1890ff' : 'transparent',
              borderRadius: '2px',
              margin: '0 6px',
              transition: 'background 0.2s ease',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{
              width: '12px',
              height: '40px',
              background: '#d9d9d9',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '2px',
                height: '20px',
                background: '#8c8c8c',
                borderRadius: '1px',
                margin: '0 1px'
              }}></div>
              <div style={{
                width: '2px',
                height: '20px',
                background: '#8c8c8c',
                borderRadius: '1px',
                margin: '0 1px'
              }}></div>
            </div>
          </div>
        )}

        {/* Right Section - Customer Detail Panel */}
        {showCustomerPanel && (
          <div style={{ 
            width: `${customerPanelWidth}%`,
            minWidth: '350px',
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
            transition: isResizing ? 'none' : 'width 0.3s ease'
          }}>
            <CustomerDetailPanel
              customerId={selectedCustomerForPanel}
              onClose={handleCustomerPanelClose}
              onResetRatio={resetToOptimalRatio}
            />
          </div>
        )}
      </div>

      {/* 고객 등록/수정 모달 */}
      <Modal
        title={editingCustomer ? '고객 정보 수정' : '새 고객 등록'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
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
              <Form.Item label="우편번호" name="postal_code">
                <Input />
              </Form.Item>
              
              <Form.Item label="기본주소" name="address1">
                <Input />
              </Form.Item>
              
              <Form.Item label="상세주소" name="address2">
                <Input />
              </Form.Item>
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
              <Button onClick={() => setModalVisible(false)}>취소</Button>
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

      {/* 고객 상세 정보 모달 */}
      <CustomerDetailModal
        visible={showDetailModal}
        onCancel={handleDetailModalClose}
        customerId={selectedCustomerIdForDetail}
      />
    </>
  );
};

export default CustomerManagement;