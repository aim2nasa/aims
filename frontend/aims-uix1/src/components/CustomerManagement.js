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

const { Option } = Select;
const { TabPane } = Tabs;

const CustomerManagement = ({ onCustomerClick, editModalVisible, editingCustomer, onEditModalClose, onCustomerUpdated, onRefreshCustomerListSet }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [documentsDrawerVisible, setDocumentsDrawerVisible] = useState(false);
  
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, [pagination.current, pagination.pageSize, searchText]);

  // 컴포넌트 마운트 시 새로고침 콜백 등록
  useEffect(() => {
    if (onRefreshCustomerListSet) {
      onRefreshCustomerListSet(() => fetchCustomers);
    }
    
    // 컴포넌트 언마운트 시 콜백 해제
    return () => {
      if (onRefreshCustomerListSet) {
        onRefreshCustomerListSet(null);
      }
    };
  }, [onRefreshCustomerListSet]);

  // 외부 수정 모달이 열릴 때 폼 필드 설정
  useEffect(() => {
    if (editModalVisible && editingCustomer) {
      form.setFieldsValue({
        ...editingCustomer.personal_info,
        birth_date: editingCustomer.personal_info.birth_date ? dayjs(editingCustomer.personal_info.birth_date) : null,
        postal_code: editingCustomer.personal_info.address?.postal_code,
        address1: editingCustomer.personal_info.address?.address1,
        address2: editingCustomer.personal_info.address?.address2,
        customer_type: editingCustomer.insurance_info?.customer_type,
        risk_level: editingCustomer.insurance_info?.risk_level,
        annual_premium: editingCustomer.insurance_info?.annual_premium,
        total_coverage: editingCustomer.insurance_info?.total_coverage
      });
    }
  }, [editModalVisible, editingCustomer, form]);

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
    if (customer) {
      // 외부에서 관리하는 수정 모달을 사용 (이 경우는 발생하지 않아야 함)
      console.warn('showModal with customer should not be called when using external modal');
    } else {
      // 새 고객 등록만 내부 모달 사용
      setModalVisible(true);
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
        // 새 고객 등록 시 이름 변경 알림 처리
        if (!editingCustomer && response.data.data.was_renamed) {
          message.warning(response.data.data.message, 5);
        } else {
          message.success(editingCustomer ? '고객 정보가 수정되었습니다.' : '고객이 등록되었습니다.');
        }
        
        if (editingCustomer) {
          // 외부 수정 모달 닫기 및 고객 업데이트 알림
          onCustomerUpdated && onCustomerUpdated();
        } else {
          // 내부 등록 모달 닫기
          setModalVisible(false);
        }
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

  // 고객 상세 핸들러 - Right 패널에 표시
  const handleCustomerNameClick = (customerId) => {
    if (onCustomerClick) {
      onCustomerClick(customerId);
    }
  };

  // 고객 행 클릭 핸들러 - Right 패널에 표시
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
              onClick={() => showModal()}
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

      {/* 새 고객 등록 모달 (내부 상태) */}
      <Modal
        title="새 고객 등록"
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
              <Button type="primary" htmlType="submit">등록</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 고객 수정 모달 (외부 상태) */}
      <Modal
        title="고객 정보 수정"
        open={editModalVisible}
        onCancel={onEditModalClose}
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
              <Button onClick={onEditModalClose}>취소</Button>
              <Button type="primary" htmlType="submit">수정</Button>
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