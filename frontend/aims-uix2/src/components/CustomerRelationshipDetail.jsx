import React, { useEffect, useMemo } from 'react';
import { 
  Card, Table, Tag, Space, Typography, Empty, Spin, Button, 
  Popconfirm 
} from 'antd';
import { 
  TeamOutlined, DeleteOutlined,
  HomeOutlined, BankOutlined, CoffeeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useRelationship } from '../contexts/RelationshipContext';

const { Title, Text } = Typography;

// 관계 카테고리 아이콘 매핑
const CATEGORY_ICONS = {
  family: <HomeOutlined className="text-red-500" />,
  relative: <TeamOutlined className="text-orange-500" />,
  social: <CoffeeOutlined className="text-green-500" />,
  professional: <BankOutlined className="text-blue-500" />,
  corporate: <BankOutlined className="text-purple-500" />
};

const CustomerRelationshipDetail = ({ customerId, onCustomerSelect }) => {
  const {
    loading,
    relationshipTypes,
    customerRelationships,
    loadCustomerRelationships,
    deleteRelationship
  } = useRelationship();

  // 현재 고객의 관계 데이터 가져오기
  const relationships = useMemo(() => {
    if (!customerId) return [];
    const cached = customerRelationships.get(customerId);
    return cached?.relationships || [];
  }, [customerId, customerRelationships]);

  // 고객 ID가 변경되면 해당 고객의 관계 데이터 로드
  useEffect(() => {
    if (customerId) {
      loadCustomerRelationships(customerId);
    }
  }, [customerId, loadCustomerRelationships]);

  // 관계 삭제 처리 (Context를 통해 - 자동 새로고침)
  const handleDeleteRelationship = async (relationshipId) => {
    await deleteRelationship(customerId, relationshipId);
    // Context에서 자동으로 관련 고객들의 데이터를 새로고침하므로 추가 호출 불필요
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
            {record.is_reversed && <Text type="secondary" className="text-xs ml-1">(역방향)</Text>}
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
            className="text-blue-500 cursor-pointer underline"
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
    <div className="p-md">
      <Card
        title={
          <Space>
            <TeamOutlined />
            <Title level={5} className="m-0">고객 관계</Title>
          </Space>
        }
        size="small"
      >
        {loading ? (
          <div className="text-center py-10">
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