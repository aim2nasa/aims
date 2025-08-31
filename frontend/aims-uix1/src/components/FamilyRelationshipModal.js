import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, Form, Select, Button, message, Space, Typography, Avatar, Tag, Input 
} from 'antd';
import { 
  HomeOutlined, UserOutlined, HeartOutlined 
} from '@ant-design/icons';

const { Option } = Select;
const { Text } = Typography;

// 가족 관계 유형 정의
const FAMILY_RELATIONSHIP_TYPES = {
  spouse: { label: '배우자', icon: '💑' },
  parent: { label: '부모', icon: '👨‍👩‍👧‍👦' },
  child: { label: '자녀', icon: '👶' },
  son: { label: '아들', icon: '👦' },
  daughter: { label: '딸', icon: '👧' },
  sibling: { label: '형제자매', icon: '👫' },
  brother: { label: '형/동생', icon: '👨‍👦' },
  sister: { label: '누나/언니/여동생', icon: '👩‍👧' },
  grandparent: { label: '조부모', icon: '👴👵' },
  grandchild: { label: '손자/손녀', icon: '👶' },
  other: { label: '기타', icon: '👥' }
};

const FamilyRelationshipModal = ({ 
  visible, 
  onCancel, 
  customerId, 
  onSuccess 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [selectedRelationType, setSelectedRelationType] = useState(null);

  // 개인 고객만 가져오기
  const fetchIndividualCustomers = useCallback(async () => {
    try {
      const response = await fetch('http://tars.giize.com:3010/api/customers?limit=1000');
      const result = await response.json();
      
      if (result.success) {
        // 개인 고객만 필터링하고 현재 고객 제외
        const individualCustomers = result.data.data.customers.filter(customer => 
          customer._id !== customerId && 
          customer.insurance_info?.customer_type === '개인'
        );
        setCustomers(individualCustomers);
      }
    } catch (error) {
      console.error('개인 고객 목록 조회 실패:', error);
      message.error('고객 목록을 불러오는데 실패했습니다.');
    }
  }, [customerId]);

  useEffect(() => {
    if (visible) {
      fetchIndividualCustomers();
      form.resetFields();
      setSelectedRelationType(null);
    }
  }, [visible, form, fetchIndividualCustomers]);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // 기타 관계일 때 사용자 입력값 사용, 아니면 미리 정의된 값 사용
      const relationshipTypeValue = values.relationship_type === 'other' 
        ? values.custom_relationship_type 
        : values.relationship_type;

      const relationshipLabel = values.relationship_type === 'other'
        ? values.custom_relationship_type
        : FAMILY_RELATIONSHIP_TYPES[values.relationship_type]?.label;

      const data = {
        to_customer_id: values.to_customer_id,
        relationship_type: relationshipTypeValue,
        strength: 'strong', // 가족 관계는 기본적으로 강한 관계
        relationship_details: {
          description: `가족 관계 - ${relationshipLabel}`,
          contact_frequency: 'weekly', // 가족은 주간 연락으로 기본 설정
          influence_level: 'high' // 가족은 높은 영향력으로 기본 설정
        },
        insurance_relevance: {
          is_beneficiary: false,
          cross_selling_opportunity: true, // 가족은 교차판매 기회로 설정
          referral_potential: 'high' // 가족은 높은 추천 잠재력
        }
      };

      const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}/relationships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        message.success('가족 관계가 추가되었습니다.');
        onSuccess?.();
        onCancel();
      } else {
        message.error(result.error || '가족 관계 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('가족 관계 추가 실패:', error);
      message.error('가족 관계 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <HomeOutlined style={{ color: '#ff4d4f' }} />
          <Text>가족 관계 추가</Text>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: '14px' }}>
          개인 고객과의 가족 관계를 설정할 수 있습니다. 법인 고객은 선택할 수 없습니다.
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          label={
            <Space>
              <UserOutlined />
              <Text>가족 구성원 선택</Text>
            </Space>
          }
          name="to_customer_id"
          rules={[{ required: true, message: '가족 구성원을 선택해주세요' }]}
        >
          <Select
            showSearch
            placeholder="개인 고객 중에서 가족 구성원을 선택하세요"
            optionFilterProp="children"
            filterOption={(input, option) => {
              const customer = customers.find(c => c._id === option.value);
              return customer?.personal_info?.name?.toLowerCase().indexOf(input.toLowerCase()) >= 0;
            }}
            size="large"
          >
            {customers.map(customer => (
              <Option key={customer._id} value={customer._id}>
                <Space>
                  <Avatar 
                    size={24} 
                    icon={<UserOutlined />} 
                    style={{ backgroundColor: '#52c41a' }}
                  />
                  <Text>{customer.personal_info?.name}</Text>
                  <Tag color="green" size="small">개인</Tag>
                  {customer.personal_info?.birth_date && (
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      ({new Date(customer.personal_info.birth_date).getFullYear()}년생)
                    </Text>
                  )}
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label={
            <Space>
              <HeartOutlined />
              <Text>가족 관계</Text>
            </Space>
          }
          name="relationship_type"
          rules={[{ required: true, message: '가족 관계를 선택해주세요' }]}
        >
          <Select 
            placeholder="가족 관계를 선택하세요" 
            size="large"
            onChange={(value) => setSelectedRelationType(value)}
          >
            {Object.entries(FAMILY_RELATIONSHIP_TYPES).map(([type, config]) => (
              <Option key={type} value={type}>
                <Space>
                  <span style={{ fontSize: '16px' }}>{config.icon}</span>
                  <Text>{config.label}</Text>
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 기타 관계 선택시 직접 입력 필드 */}
        {selectedRelationType === 'other' && (
          <Form.Item
            label={
              <Space>
                <HeartOutlined />
                <Text>기타 가족 관계 입력</Text>
              </Space>
            }
            name="custom_relationship_type"
            rules={[
              { required: true, message: '가족 관계를 입력해주세요' },
              { max: 20, message: '관계명은 20자 이내로 입력해주세요' }
            ]}
          >
            <Input 
              placeholder="예: 사촌, 시부모, 장인/장모, 며느리, 사위 등" 
              size="large"
              maxLength={20}
            />
          </Form.Item>
        )}

        <div style={{ 
          backgroundColor: '#f6ffed', 
          border: '1px solid #b7eb8f', 
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '16px'
        }}>
          <Text style={{ fontSize: '12px', color: '#389e0d' }}>
            💡 <strong>자동 설정:</strong> 가족 관계는 강한 관계 강도, 주간 연락 빈도, 높은 영향력으로 자동 설정되며, 
            교차판매 기회와 높은 추천 잠재력이 활성화됩니다.
          </Text>
        </div>

        <div style={{ textAlign: 'right', marginTop: 24 }}>
          <Space>
            <Button onClick={onCancel} disabled={loading}>
              취소
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              icon={<HomeOutlined />}
            >
              가족 관계 추가
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default FamilyRelationshipModal;