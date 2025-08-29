import React, { useState, useEffect } from 'react';
import { 
  Modal, Form, Select, Input, Button, 
  Table, Space, message, Tag, Divider 
} from 'antd';
import { LinkOutlined, UserOutlined, FileTextOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
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
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchCustomers();
    }
  }, [visible]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://tars.giize.com:3010/api/customers', {
        params: { limit: 100 }
      });

      if (response.data.success) {
        setCustomers(response.data.data.customers);
      }
    } catch (error) {
      message.error('고객 목록을 불러오는데 실패했습니다.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    try {
      // 먼저 해당 고객의 문서 목록을 확인하여 중복 연결 체크
      const checkResponse = await axios.get(`http://tars.giize.com:3010/api/customers/${values.customer_id}/documents`);
      
      if (checkResponse.data.success) {
        const existingDocuments = checkResponse.data.data.documents || [];
        const isAlreadyLinked = existingDocuments.some(doc => doc._id === documentId);
        
        if (isAlreadyLinked) {
          setShowDuplicateAlert(true);
          return;
        }
      }

      const response = await axios.post(`http://tars.giize.com:3010/api/customers/${values.customer_id}/documents`, {
        document_id: documentId,
        relationship_type: values.relationship_type,
        notes: values.notes
      });

      if (response.data.success) {
        message.success('문서가 고객에게 성공적으로 연결되었습니다.');
        onLinkSuccess && onLinkSuccess();
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
  const handleCustomerSelect = async (customerId) => {
    try {
      const checkResponse = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}/documents`);
      
      if (checkResponse.data.success) {
        const existingDocuments = checkResponse.data.data.documents || [];
        const isAlreadyLinked = existingDocuments.some(doc => doc._id === documentId);
        
        if (isAlreadyLinked) {
          setShowDuplicateAlert(true);
          return;
        }
      }
      
      form.setFieldsValue({ customer_id: customerId });
    } catch (error) {
      console.error('고객 문서 확인 실패:', error);
      // 에러가 발생해도 선택은 가능하도록
      form.setFieldsValue({ customer_id: customerId });
    }
  };

  const customerColumns = [
    {
      title: '고객명',
      dataIndex: ['personal_info', 'name'],
      key: 'name',
      render: name => (
        <Space>
          <UserOutlined />
          {name}
        </Space>
      )
    },
    {
      title: '연락처',
      dataIndex: ['personal_info', 'phone'],
      key: 'phone'
    },
    {
      title: '고객 유형',
      dataIndex: ['insurance_info', 'customer_type'],
      key: 'customer_type',
      render: type => type && <Tag>{type}</Tag>
    },
    {
      title: '작업',
      key: 'action',
      render: (_, record) => (
        <Button 
          type="primary" 
          size="small"
          onClick={() => handleCustomerSelect(record._id)}
        >
          선택
        </Button>
      )
    }
  ];

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
    >
      <div style={{ marginBottom: 16 }}>
        <Space>
          <FileTextOutlined />
          <strong>연결할 문서:</strong>
          <Tag color="blue">{documentName}</Tag>
        </Space>
      </div>

      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          label="고객 선택"
          name="customer_id"
          rules={[{ required: true, message: '고객을 선택해주세요' }]}
        >
          <Select
            placeholder="고객을 선택하세요"
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {customers.map(customer => (
              <Option key={customer._id} value={customer._id}>
                {customer.personal_info.name} ({customer.personal_info.phone || '연락처 없음'})
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="문서 유형"
          name="relationship_type"
          rules={[{ required: true, message: '문서 유형을 선택해주세요' }]}
        >
          <Select placeholder="문서 유형을 선택하세요">
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
            <Button onClick={handleCancel}>취소</Button>
            <Button type="primary" htmlType="submit">
              연결하기
            </Button>
          </Space>
        </div>
      </Form>

      <Divider>또는 아래에서 고객을 선택하세요</Divider>

      <Table
        columns={customerColumns}
        dataSource={customers}
        rowKey="_id"
        loading={loading}
        size="small"
        pagination={{
          pageSize: 5,
          showSizeChanger: false
        }}
        style={{ marginTop: 16 }}
      />

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
          <Button key="ok" type="primary" onClick={() => setShowDuplicateAlert(false)}>
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