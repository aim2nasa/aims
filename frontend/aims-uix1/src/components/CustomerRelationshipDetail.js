import React, { useState, useEffect } from 'react';
import { 
  Card, Table, Tag, Space, Typography, Empty, Spin, Button, Modal, 
  Form, Select, Input, Switch, message, Popconfirm 
} from 'antd';
import { 
  TeamOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  HomeOutlined, BankOutlined, CoffeeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

// 관계 카테고리 아이콘 매핑
const CATEGORY_ICONS = {
  family: <HomeOutlined style={{ color: '#ff4d4f' }} />,
  relative: <TeamOutlined style={{ color: '#fa8c16' }} />,
  social: <CoffeeOutlined style={{ color: '#52c41a' }} />,
  professional: <BankOutlined style={{ color: '#1890ff' }} />,
  corporate: <BankOutlined style={{ color: '#722ed1' }} />
};

const CustomerRelationshipDetail = ({ customerId, onCustomerSelect }) => {
  const [relationships, setRelationships] = useState([]);
  const [relationshipTypes, setRelationshipTypes] = useState({});
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (customerId) {
      fetchRelationships();
      fetchRelationshipTypes();
      fetchAllCustomers();
    }
  }, [customerId]);

  const fetchRelationships = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}/relationships?include_details=true`);
      const result = await response.json();
      
      
      if (result.success) {
        setRelationships(result.data.relationships || []);
      }
    } catch (error) {
      console.error('관계 조회 실패:', error);
      message.error('관계 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelationshipTypes = async () => {
    try {
      const response = await fetch('http://tars.giize.com:3010/api/relationship-types');
      const result = await response.json();
      
      if (result.success) {
        setRelationshipTypes(result.data);
      }
    } catch (error) {
      console.error('관계 유형 조회 실패:', error);
    }
  };

  const fetchAllCustomers = async () => {
    try {
      const response = await fetch('http://tars.giize.com:3010/api/customers?limit=1000');
      const result = await response.json();
      
      if (result.success) {
        setCustomers(result.data.data.customers.filter(customer => customer._id !== customerId));
      }
    } catch (error) {
      console.error('고객 목록 조회 실패:', error);
    }
  };

  const handleAddRelationship = () => {
    setEditingRelationship(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditRelationship = (relationship) => {
    setEditingRelationship(relationship);
    form.setFieldsValue({
      to_customer_id: relationship.relationship_info.to_customer_id,
      relationship_type: relationship.relationship_info.relationship_type,
      strength: relationship.relationship_info.strength,
      description: relationship.relationship_details.description,
      contact_frequency: relationship.relationship_details.contact_frequency,
      influence_level: relationship.relationship_details.influence_level,
      is_beneficiary: relationship.insurance_relevance.is_beneficiary,
      cross_selling_opportunity: relationship.insurance_relevance.cross_selling_opportunity,
      referral_potential: relationship.insurance_relevance.referral_potential
    });
    setModalVisible(true);
  };

  const handleDeleteRelationship = async (relationshipId) => {
    try {
      const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}/relationships/${relationshipId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('관계가 삭제되었습니다.');
        fetchRelationships();
      } else {
        message.error(result.error || '관계 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('관계 삭제 실패:', error);
      message.error('관계 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const url = editingRelationship 
        ? `http://tars.giize.com:3010/api/customers/${customerId}/relationships/${editingRelationship._id}`
        : `http://tars.giize.com:3010/api/customers/${customerId}/relationships`;
      
      const method = editingRelationship ? 'PUT' : 'POST';
      
      const data = {
        to_customer_id: values.to_customer_id,
        relationship_type: values.relationship_type,
        strength: values.strength,
        relationship_details: {
          description: values.description,
          contact_frequency: values.contact_frequency,
          influence_level: values.influence_level
        },
        insurance_relevance: {
          is_beneficiary: values.is_beneficiary || false,
          cross_selling_opportunity: values.cross_selling_opportunity || false,
          referral_potential: values.referral_potential || 'medium'
        }
      };

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        message.success(editingRelationship ? '관계가 수정되었습니다.' : '관계가 추가되었습니다.');
        setModalVisible(false);
        fetchRelationships();
      } else {
        message.error(result.error || '관계 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('관계 저장 실패:', error);
      message.error('관계 저장 중 오류가 발생했습니다.');
    }
  };

  const columns = [
    {
      title: '관계 유형',
      dataIndex: ['relationship_info', 'relationship_category'],
      key: 'category',
      width: 100,
      render: (category, record) => (
        <Space>
          {CATEGORY_ICONS[category]}
          <Text>
            {record.display_relationship_label || 
             relationshipTypes.all_types?.[record.relationship_info.relationship_type]?.label || 
             record.relationship_info.relationship_type}
            {record.is_reversed && <Text type="secondary" style={{ fontSize: '12px', marginLeft: '4px' }}>(역방향)</Text>}
          </Text>
        </Space>
      )
    },
    {
      title: '관련 고객',
      dataIndex: 'related_customer',
      key: 'related_customer',
      render: (relatedCustomer, record) => (
        <Space>
          <Text 
            style={{ 
              color: '#1890ff', 
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
            onClick={() => onCustomerSelect?.(relatedCustomer?._id)}
          >
            {relatedCustomer?.personal_info?.name || '이름 없음'}
          </Text>
          <Text type="secondary">({relatedCustomer?.insurance_info?.customer_type})</Text>
        </Space>
      )
    },
    {
      title: '관계 강도',
      dataIndex: ['relationship_info', 'strength'],
      key: 'strength',
      width: 80,
      render: (strength) => {
        const colors = { strong: 'red', medium: 'orange', weak: 'blue' };
        const labels = { strong: '강함', medium: '보통', weak: '약함' };
        return <Tag color={colors[strength]}>{labels[strength]}</Tag>;
      }
    },
    {
      title: '연락 빈도',
      dataIndex: ['relationship_details', 'contact_frequency'],
      key: 'contact_frequency',
      width: 80,
      render: (frequency) => {
        const labels = { daily: '매일', weekly: '주간', monthly: '월간', rarely: '드물게', never: '없음' };
        return <Text>{labels[frequency] || frequency}</Text>;
      }
    },
    {
      title: '보험 연관성',
      key: 'insurance_relevance',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          {record.insurance_relevance.is_beneficiary && <Tag color="green" size="small">수익자</Tag>}
          {record.insurance_relevance.cross_selling_opportunity && <Tag color="purple" size="small">교차판매</Tag>}
          {record.insurance_relevance.referral_potential === 'high' && <Tag color="gold" size="small">추천가능</Tag>}
        </Space>
      )
    },
    {
      title: '등록일',
      dataIndex: ['meta', 'created_at'],
      key: 'created_at',
      width: 100,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '작업',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditRelationship(record)}
            title="관계 수정"
          />
          <Popconfirm
            title="관계 삭제"
            description="정말로 이 관계를 삭제하시겠습니까?"
            onConfirm={() => handleDeleteRelationship(record._id)}
            okText="삭제"
            cancelText="취소"
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              size="small"
              danger
              title="관계 삭제"
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card
        title={
          <Space>
            <TeamOutlined />
            <Title level={5} style={{ margin: 0 }}>고객 관계</Title>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={handleAddRelationship}
          >
            관계 추가
          </Button>
        }
        size="small"
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : relationships.length === 0 ? (
          <Empty 
            description="등록된 관계가 없습니다"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={relationships}
            rowKey="_id"
            size="small"
            pagination={false}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      {/* 관계 추가/수정 모달 */}
      <Modal
        title={editingRelationship ? "관계 수정" : "관계 추가"}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="관련 고객"
            name="to_customer_id"
            rules={[{ required: true, message: '관련 고객을 선택해주세요' }]}
          >
            <Select
              showSearch
              placeholder="관련 고객 선택"
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {customers.map(customer => (
                <Option key={customer._id} value={customer._id}>
                  {customer.personal_info?.name} ({customer.insurance_info?.customer_type})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="관계 유형"
            name="relationship_type"
            rules={[{ required: true, message: '관계 유형을 선택해주세요' }]}
          >
            <Select placeholder="관계 유형 선택">
              {Object.entries(relationshipTypes.all_types || {}).map(([type, config]) => (
                <Option key={type} value={type}>
                  {config.label} ({config.category})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="관계 강도"
            name="strength"
            initialValue="medium"
          >
            <Select>
              <Option value="strong">강함</Option>
              <Option value="medium">보통</Option>
              <Option value="weak">약함</Option>
            </Select>
          </Form.Item>

          <Form.Item label="설명" name="description">
            <Input.TextArea rows={3} placeholder="관계에 대한 상세 설명" />
          </Form.Item>

          <Form.Item label="연락 빈도" name="contact_frequency" initialValue="monthly">
            <Select>
              <Option value="daily">매일</Option>
              <Option value="weekly">주간</Option>
              <Option value="monthly">월간</Option>
              <Option value="rarely">드물게</Option>
              <Option value="never">없음</Option>
            </Select>
          </Form.Item>

          <Form.Item label="영향력 수준" name="influence_level" initialValue="medium">
            <Select>
              <Option value="high">높음</Option>
              <Option value="medium">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Form.Item>

          <Form.Item label="추천 잠재력" name="referral_potential" initialValue="medium">
            <Select>
              <Option value="high">높음</Option>
              <Option value="medium">보통</Option>
              <Option value="low">낮음</Option>
            </Select>
          </Form.Item>

          <Form.Item name="is_beneficiary" valuePropName="checked">
            <Switch /> <span style={{ marginLeft: 8 }}>수익자 관계</span>
          </Form.Item>

          <Form.Item name="cross_selling_opportunity" valuePropName="checked">
            <Switch /> <span style={{ marginLeft: 8 }}>교차판매 기회</span>
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>취소</Button>
              <Button type="primary" htmlType="submit">
                {editingRelationship ? '수정' : '추가'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerRelationshipDetail;