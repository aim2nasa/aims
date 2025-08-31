import React, { useState, useEffect } from 'react';
import { 
  Card, Table, Tag, Space, Typography, Empty, Spin, Button, 
  message, Popconfirm 
} from 'antd';
import { 
  TeamOutlined, DeleteOutlined,
  HomeOutlined, BankOutlined, CoffeeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

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

  useEffect(() => {
    if (customerId) {
      fetchRelationships();
      fetchRelationshipTypes();
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

    </div>
  );
};

export default CustomerRelationshipDetail;