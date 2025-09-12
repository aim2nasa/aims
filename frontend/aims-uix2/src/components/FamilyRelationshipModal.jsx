import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, Form, Select, message, Space, Typography, Avatar, Tag, Input, AutoComplete, Spin 
} from 'antd';
import { 
  HomeOutlined, UserOutlined, HeartOutlined, SearchOutlined 
} from '@ant-design/icons';
import { Button } from './common';
import CustomerService from '../services/customerService';
import { useRelationship } from '../contexts/RelationshipContext';

const { Option } = Select;
const { Text } = Typography;

// 가족관계등록부 범위 내 관계 유형만 허용
const FAMILY_RELATIONSHIP_TYPES = {
  spouse: { label: '배우자', icon: '💑' },
  parent: { label: '부모', icon: '👨‍👩‍👧‍👦' },
  child: { label: '자녀', icon: '👶' }
};

const FamilyRelationshipModal = ({ 
  visible, 
  onCancel, 
  customerId, 
  onSuccess 
}) => {
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState([]);
  const [selectedRelationType, setSelectedRelationType] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [alreadyFamiliedCustomers, setAlreadyFamiliedCustomers] = useState(new Set());
  
  // Context에서 관계 생성 기능 및 관계 데이터 사용
  const { loading, createRelationship, allRelationshipsData } = useRelationship();

  // 고객 검색 (고객 관리와 동일한 방식)
  const searchCustomers = useCallback(async (searchValue = '') => {
    if ((!searchValue || !searchValue.trim()) && searchValue !== '') {
      setCustomers([]);
      return;
    }
    
    try {
      setSearchLoading(true);
      const result = await CustomerService.getCustomers({
        page: 1,
        limit: 50, // 검색 결과는 50개로 제한
        search: searchValue
      });
      
      if (result.success) {
        // 개인 고객만 필터링하고 현재 고객 제외, 그리고 이미 가족이 있는 고객 제외
        const individualCustomers = result.data.customers.filter(customer => 
          customer._id !== customerId && 
          customer.insurance_info?.customer_type === '개인' &&
          !alreadyFamiliedCustomers.has(customer._id)
        );
        
        setCustomers(individualCustomers);
      }
    } catch (error) {
      console.error('개인 고객 검색 실패:', error);
      message.error('고객 검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  }, [customerId, alreadyFamiliedCustomers]);

  // 이미 가족이 있는 고객들을 식별하는 함수
  const identifyFamiliedCustomers = useCallback(() => {
    if (!allRelationshipsData.customers.length) return;

    const { relationships } = allRelationshipsData;
    const familiedCustomers = new Set();
    
    // 가족 관계만 필터링 (개인-개인만)
    relationships.forEach(relationship => {
      const category = relationship.relationship_info.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      
      if (category === 'family' && 
          fromCustomer?.insurance_info?.customer_type === '개인' && 
          toCustomer?.insurance_info?.customer_type === '개인') {
        
        familiedCustomers.add(fromCustomer._id);
        familiedCustomers.add(toCustomer._id);
      }
    });
    
    // 현재 고객이 가족이 없는 경우에만 다른 사람을 가족으로 추가할 수 있음
    // 현재 고객은 제외 (자기 자신은 가족 대표자인 경우 추가 가능)
    familiedCustomers.delete(customerId);
    
    setAlreadyFamiliedCustomers(familiedCustomers);
  }, [allRelationshipsData, customerId]);

  const resetForm = useCallback(() => {
    form.resetFields();
    setSelectedRelationType(null);
    setSelectedCustomer(null);
    setSearchText('');
    setCustomers([]);
  }, [form]);

  useEffect(() => {
    if (visible) {
      resetForm();
      identifyFamiliedCustomers();
    }
  }, [visible, customerId, identifyFamiliedCustomers, resetForm]);

  // 가족구성원과 가족관계가 모두 선택되었는지 확인
  const isFormValid = selectedCustomer && selectedRelationType;

  const handleSubmit = async (values) => {
    try {
      // 폼 검증 확인
      if (!values.to_customer_id) {
        message.error('가족 구성원을 선택해주세요');
        return;
      }
      
      if (!values.relationship_type) {
        message.error('가족 관계를 선택해주세요');
        return;
      }
      
      // 자기 자신과의 관계 방지
      if (customerId === values.to_customer_id) {
        message.error('자기 자신과는 관계를 설정할 수 없습니다');
        return;
      }

      // 이미 가족이 있는 고객과의 관계 방지
      if (alreadyFamiliedCustomers.has(values.to_customer_id)) {
        message.error('선택한 고객은 이미 다른 가족에 속해 있습니다. 가족이 없는 고객만 선택할 수 있습니다.');
        return;
      }

      const relationshipTypeValue = values.relationship_type;
      const relationshipLabel = FAMILY_RELATIONSHIP_TYPES[values.relationship_type]?.label;

      const relationshipData = {
        relationship_type: relationshipTypeValue,
        relationship_category: 'family', // 가족 관계 모달이므로 family로 통일
        strength: 'strong',
        relationship_details: {
          description: `가족 관계 - ${relationshipLabel}`,
          contact_frequency: 'weekly',
          influence_level: 'high'
        },
        insurance_relevance: {
          is_beneficiary: false,
          cross_selling_opportunity: true,
          referral_potential: 'high'
        }
      };

      // Context를 통해 관계 생성 (자동으로 구독자 알림됨)
      await createRelationship(customerId, values.to_customer_id, relationshipData);
      
      // 성공 시 콜백 호출 및 모달 닫기
      onSuccess?.();
      onCancel();
    } catch (error) {
      
      // 더 상세하고 사용자 친화적인 에러 메시지 제공
      if (error.message.includes('유효하지 않은 관계 유형')) {
        message.error('선택한 관계 유형이 지원되지 않습니다. 다른 관계를 선택해주세요.');
      } else if (error.message.includes('이미 존재하는 관계')) {
        message.error('이미 설정된 관계입니다. 기존 관계를 삭제한 후 다시 시도해주세요.');
      } else if (error.message.includes('자기 자신')) {
        message.error('자기 자신과는 관계를 설정할 수 없습니다.');
      } else if (error.message.includes('이미 가족') || error.message.includes('다른 가족')) {
        message.error('선택한 고객은 이미 다른 가족에 속해 있습니다. 가족이 없는 고객만 선택할 수 있습니다.');
      } else if (error.message) {
        message.error(`관계 추가 실패: ${error.message}`);
      } else {
        message.error('가족 관계 추가 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
  };

  return (
    <Modal
      title={
        <Space>
          <HomeOutlined className="text-error" />
          <Text>가족 관계 추가</Text>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
    >
      <div className="mb-md">
        <Text type="secondary" className="text-sm">
          개인 고객과의 가족 관계를 설정할 수 있습니다. 법인 고객이나 이미 다른 가족에 속한 고객은 선택할 수 없습니다.
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onFinishFailed={() => {
          message.error('입력 값을 확인해주세요');
        }}
      >
        {/* Hidden form field for customer ID */}
        <Form.Item
          name="to_customer_id"
          rules={[{ required: true, message: '가족 구성원을 선택해주세요' }]}
className="hidden"
        >
          <Input />
        </Form.Item>

        {/* Visible AutoComplete field */}
        <div>
          <div className="mb-xs">
            <Space>
              <UserOutlined />
              <Text>가족 구성원 선택</Text>
            </Space>
          </div>
          <AutoComplete
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              if (!value || !value.trim()) {
                setCustomers([]);
                setSelectedCustomer(null);
                form.setFieldValue('to_customer_id', undefined);
              } else {
                searchCustomers(value);
              }
            }}
            onSelect={(value) => {
              const customer = customers.find(c => c._id === value);
              setSelectedCustomer(customer);
              setSearchText(customer?.personal_info?.name || '');
              form.setFieldValue('to_customer_id', value);
            }}
            placeholder="고객 이름을 입력하여 검색하세요"
            size="large"
            style={{ width: '100%' }}
            allowClear
            onClear={() => {
              setSearchText('');
              setCustomers([]);
              setSelectedCustomer(null);
              form.setFieldValue('to_customer_id', undefined);
            }}
            suffixIcon={<SearchOutlined />}
            notFoundContent={searchLoading ? <Spin size="small" /> : searchText ? '검색 결과가 없습니다' : '고객 이름을 입력하세요'}
          >
            {customers.map(customer => (
              <Option 
                key={customer._id} 
                value={customer._id}
              >
                <Space>
                  <Avatar 
                    size={24} 
                    icon={<UserOutlined />} 
className="bg-success"
                  />
                  <Text>
                    {customer.personal_info?.name}
                  </Text>
                  <Tag color="green" size="small">개인</Tag>
                  {customer.personal_info?.birth_date && (
                    <Text type="secondary" className="text-xs">
                      ({new Date(customer.personal_info.birth_date).getFullYear()}년생)
                    </Text>
                  )}
                </Space>
              </Option>
            ))}
          </AutoComplete>
        </div>

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
            placeholder={selectedCustomer ? "가족 관계를 선택하세요" : "먼저 가족 구성원을 선택해주세요"}
            size="large"
            onChange={(value) => setSelectedRelationType(value)}
            listHeight={600}
            showSearch
            optionFilterProp="children"
            disabled={!selectedCustomer}
          >
            {Object.entries(FAMILY_RELATIONSHIP_TYPES).map(([type, config]) => (
              <Option key={type} value={type}>
                <Space>
                  <span className="text-base">{config.icon}</span>
                  <Text>{config.label}</Text>
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <div className="bg-success-bg border border-success rounded p-sm mb-md">
          <Text className="text-xs text-success">
            💡 <strong>자동 설정:</strong> 가족 관계는 강한 관계 강도, 주간 연락 빈도, 높은 영향력으로 자동 설정되며, 
            교차판매 기회와 높은 추천 잠재력이 활성화됩니다.
          </Text>
        </div>

        <div className="text-right mt-lg">
          <Space>
            <Button 
              variant="secondary" 
              onClick={onCancel} 
              disabled={loading}
            >
              취소
            </Button>
            <Button 
              variant="primary"
              onClick={() => form.submit()}
              loading={loading}
              disabled={!isFormValid}
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