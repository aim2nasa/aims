import React, { useState, useEffect, useMemo } from 'react';
import { Tree, Card, Space, Typography, Badge, Spin, Tag } from 'antd';
import { 
  FolderOutlined, 
  FolderOpenOutlined, 
  UserOutlined,
  TeamOutlined,
  HeartOutlined,
  HomeOutlined,
  BankOutlined,
  CoffeeOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import CustomerService from '../services/customerService';

const { Title, Text } = Typography;

// 관계 카테고리별 아이콘 및 색상 정의
const RELATIONSHIP_CONFIG = {
  family: {
    icon: <HomeOutlined />,
    color: '#ff4d4f',
    label: '가족',
    types: {
      spouse: '배우자',
      parent: '부모',
      child: '자녀', 
      sibling: '형제자매',
      grandparent: '조부모',
      grandchild: '손자녀'
    }
  },
  relative: {
    icon: <TeamOutlined />,
    color: '#fa8c16',
    label: '친척',
    types: {
      uncle_aunt: '삼촌/이모',
      nephew_niece: '조카',
      cousin: '사촌',
      in_law: '처가/시가'
    }
  },
  social: {
    icon: <CoffeeOutlined />,
    color: '#52c41a',
    label: '사회적 관계',
    types: {
      friend: '친구',
      acquaintance: '지인',
      neighbor: '이웃'
    }
  },
  professional: {
    icon: <BankOutlined />,
    color: '#1890ff',
    label: '직장 관계',
    types: {
      supervisor: '상사',
      subordinate: '부하',
      colleague: '동료',
      business_partner: '사업파트너',
      client: '클라이언트',
      service_provider: '서비스제공자'
    }
  },
  corporate: {
    icon: <BankOutlined />,
    color: '#722ed1',
    label: '법인 관계',
    types: {
      ceo: '대표이사',
      executive: '임원',
      employee: '직원',
      shareholder: '주주',
      director: '이사',
      company: '회사',
      employer: '고용주'
    }
  }
};

const CustomerRelationshipTreeView = ({ onCustomerSelect, selectedCustomerId }) => {
  const [customers, setCustomers] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(['no-relationships']);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 모든 고객 조회
      const customersResult = await CustomerService.getCustomers({ 
        page: 1, 
        limit: 1000 
      });
      
      if (customersResult.success) {
        const customersData = customersResult.data.customers;
        setCustomers(customersData);
        
        // 각 고객의 관계 정보 조회
        const allRelationships = [];
        for (const customer of customersData) {
          try {
            const response = await fetch(`http://tars.giize.com:3010/api/customers/${customer._id}/relationships`);
            const relationshipResult = await response.json();
            
            if (relationshipResult.success) {
              relationshipResult.data.relationships.forEach(rel => {
                allRelationships.push({
                  ...rel,
                  from_customer: customer
                });
              });
            }
          } catch (error) {
            console.warn(`고객 ${customer.personal_info?.name}의 관계 조회 실패:`, error);
          }
        }
        
        setRelationships(allRelationships);
      }
    } catch (error) {
      console.error('데이터 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 관계별로 고객들을 그룹화 (1:N 관계 지원)
  const relationshipGroups = useMemo(() => {
    const groups = {};
    const customersWithRelationships = new Set();
    const customersWithoutRelationships = [];
    
    // 1:N 관계를 위한 그룹화
    const customerRelationshipMap = new Map();
    
    relationships.forEach(relationship => {
      const category = relationship.relationship_info.relationship_category;
      const type = relationship.relationship_info.relationship_type;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      
      // 기본 그룹 구조 생성
      if (!groups[category]) {
        groups[category] = {};
      }
      if (!groups[category][type]) {
        groups[category][type] = new Map();
      }
      
      // from 고객을 키로 하여 관련 고객들 그룹화
      const fromCustomerKey = `${fromCustomer._id}-${fromCustomer.personal_info?.name}`;
      
      if (!groups[category][type].has(fromCustomerKey)) {
        groups[category][type].set(fromCustomerKey, {
          fromCustomer,
          relatedCustomers: [],
          relationships: []
        });
      }
      
      const group = groups[category][type].get(fromCustomerKey);
      group.relatedCustomers.push(toCustomer);
      group.relationships.push(relationship);
      
      customersWithRelationships.add(fromCustomer._id);
      if (toCustomer) {
        customersWithRelationships.add(toCustomer._id);
      }
    });
    
    // Map을 배열로 변환
    Object.keys(groups).forEach(category => {
      Object.keys(groups[category]).forEach(type => {
        groups[category][type] = Array.from(groups[category][type].values());
      });
    });
    
    // 관계가 없는 고객들 찾기
    customers.forEach(customer => {
      if (!customersWithRelationships.has(customer._id)) {
        customersWithoutRelationships.push(customer);
      }
    });
    
    return { groups, customersWithoutRelationships };
  }, [relationships, customers]);

  // Tree 데이터 생성
  const treeData = useMemo(() => {
    const { groups, customersWithoutRelationships } = relationshipGroups;
    const treeNodes = [];
    
    // 관계가 없는 고객들 그룹
    if (customersWithoutRelationships.length > 0) {
      treeNodes.push({
        title: (
          <Space>
            <QuestionCircleOutlined style={{ color: '#999' }} />
            <Text style={{ color: '#999' }}>관계 미설정</Text>
            <Badge count={customersWithoutRelationships.length} style={{ backgroundColor: '#999' }} />
          </Space>
        ),
        key: 'no-relationships',
        icon: <QuestionCircleOutlined />,
        children: customersWithoutRelationships.map(customer => ({
          title: <Text>{customer.personal_info?.name || '이름 없음'}</Text>,
          key: `customer-no-rel-${customer._id}`,
          icon: <UserOutlined />,
          isLeaf: true,
          customerData: customer
        }))
      });
    }
    
    // 관계 카테고리별 그룹
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([category, types]) => {
        const config = RELATIONSHIP_CONFIG[category] || {
          icon: <TeamOutlined />,
          color: '#666',
          label: category
        };
        
        const categoryCustomerCount = Object.values(types).reduce(
          (sum, customerGroups) => sum + customerGroups.length, 0
        );
        
        const categoryNode = {
          title: (
            <Space>
              {React.cloneElement(config.icon, { style: { color: config.color } })}
              <Text strong style={{ color: config.color }}>{config.label}</Text>
              <Badge count={categoryCustomerCount} style={{ backgroundColor: config.color }} />
            </Space>
          ),
          key: `category-${category}`,
          icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
          children: Object.entries(types)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([type, customerGroups]) => {
              const typeLabel = config.types?.[type] || type;
              
              return {
                title: (
                  <Space>
                    <TeamOutlined style={{ color: config.color, opacity: 0.7 }} />
                    <Text>{typeLabel}</Text>
                    <Badge count={customerGroups.length} style={{ backgroundColor: config.color, opacity: 0.8 }} />
                  </Space>
                ),
                key: `type-${category}-${type}`,
                icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                children: customerGroups
                  .sort((a, b) => 
                    (a.fromCustomer.personal_info?.name || '').localeCompare(
                      b.fromCustomer.personal_info?.name || ''
                    )
                  )
                  .map((customerGroup, groupIndex) => {
                    const fromCustomer = customerGroup.fromCustomer;
                    const relatedCustomers = customerGroup.relatedCustomers;
                    const relationships = customerGroup.relationships;
                    
                    // 1:N 관계인 경우
                    if (relatedCustomers.length > 1) {
                      return {
                        title: (
                          <Space>
                            <Text 
                              strong 
                              style={{ 
                                color: '#1890ff', 
                                cursor: 'pointer',
                                textDecoration: 'underline'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onCustomerSelect) {
                                  onCustomerSelect(fromCustomer._id);
                                }
                              }}
                            >
                              {fromCustomer.personal_info?.name || '이름 없음'}
                            </Text>
                            <Badge count={relatedCustomers.length} style={{ backgroundColor: config.color }} />
                          </Space>
                        ),
                        key: `customer-group-${category}-${type}-${fromCustomer._id}`,
                        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
                        children: relatedCustomers.map((toCustomer, relIndex) => {
                          const relationship = relationships[relIndex];
                          
                          return {
                            title: (
                              <Space direction="vertical" size={4}>
                                <Space>
                                  <Text 
                                    style={{ 
                                      color: '#1890ff', 
                                      cursor: 'pointer',
                                      textDecoration: 'underline'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toCustomer && onCustomerSelect) {
                                        onCustomerSelect(toCustomer._id);
                                      }
                                    }}
                                  >
                                    {toCustomer?.personal_info?.name || '이름 없음'}
                                  </Text>
                                </Space>
                                <Space size={4}>
                                  <Tag 
                                    size="small" 
                                    color={
                                      relationship.relationship_info.strength === 'strong' ? 'red' :
                                      relationship.relationship_info.strength === 'medium' ? 'orange' : 'blue'
                                    }
                                  >
                                    {relationship.relationship_info.strength === 'strong' ? '강함' :
                                     relationship.relationship_info.strength === 'medium' ? '보통' : '약함'}
                                  </Tag>
                                  {relationship.insurance_relevance.is_beneficiary && (
                                    <Tag size="small" color="green">수익자</Tag>
                                  )}
                                  {relationship.insurance_relevance.cross_selling_opportunity && (
                                    <Tag size="small" color="purple">교차판매</Tag>
                                  )}
                                </Space>
                              </Space>
                            ),
                            key: `related-customer-${category}-${type}-${fromCustomer._id}-${relIndex}`,
                            icon: <UserOutlined />,
                            isLeaf: true,
                            customerData: toCustomer,
                            relationshipData: relationship
                          };
                        })
                      };
                    } else {
                      // 1:1 관계인 경우 (기존 방식 유지)
                      const toCustomer = relatedCustomers[0];
                      const relationship = relationships[0];
                      
                      return {
                        title: (
                          <Space direction="vertical" size={4}>
                            <Space>
                              <Text 
                                strong 
                                style={{ 
                                  color: '#1890ff', 
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onCustomerSelect) {
                                    onCustomerSelect(fromCustomer._id);
                                  }
                                }}
                              >
                                {fromCustomer.personal_info?.name || '이름 없음'}
                              </Text>
                              <Text type="secondary">→</Text>
                              <Text 
                                style={{ 
                                  color: '#1890ff', 
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (toCustomer && onCustomerSelect) {
                                    onCustomerSelect(toCustomer._id);
                                  }
                                }}
                              >
                                {toCustomer?.personal_info?.name || '이름 없음'}
                              </Text>
                            </Space>
                            <Space size={4}>
                              <Tag 
                                size="small" 
                                color={
                                  relationship.relationship_info.strength === 'strong' ? 'red' :
                                  relationship.relationship_info.strength === 'medium' ? 'orange' : 'blue'
                                }
                              >
                                {relationship.relationship_info.strength === 'strong' ? '강함' :
                                 relationship.relationship_info.strength === 'medium' ? '보통' : '약함'}
                              </Tag>
                              {relationship.insurance_relevance.is_beneficiary && (
                                <Tag size="small" color="green">수익자</Tag>
                              )}
                              {relationship.insurance_relevance.cross_selling_opportunity && (
                                <Tag size="small" color="purple">교차판매</Tag>
                              )}
                            </Space>
                          </Space>
                        ),
                        key: `relationship-${category}-${type}-${fromCustomer._id}-${groupIndex}`,
                        icon: <UserOutlined />,
                        isLeaf: true,
                        customerData: fromCustomer,
                        relationshipData: relationship
                      };
                    }
                  })
              };
            })
        };
        
        treeNodes.push(categoryNode);
      });
    
    return treeNodes;
  }, [relationshipGroups]);

  const handleSelect = (selectedKeys, { node }) => {
    if (node.customerData && onCustomerSelect) {
      onCustomerSelect(node.customerData._id);
    }
  };

  const handleExpand = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
  };

  // 선택된 고객의 키 찾기
  const selectedKeys = useMemo(() => {
    if (!selectedCustomerId) return [];
    // 관계 있는 고객과 관계 없는 고객 모두에서 찾기
    const keys = treeData.reduce((acc, node) => {
      if (node.children) {
        node.children.forEach(child => {
          if (child.children) {
            child.children.forEach(grandchild => {
              if (grandchild.customerData?._id === selectedCustomerId) {
                acc.push(grandchild.key);
              }
            });
          } else if (child.customerData?._id === selectedCustomerId) {
            acc.push(child.key);
          }
        });
      }
      return acc;
    }, []);
    return keys;
  }, [selectedCustomerId, treeData]);

  // 통계 정보
  const stats = useMemo(() => {
    const { groups, customersWithoutRelationships } = relationshipGroups;
    const totalRelationships = relationships.length;
    const categoriesCount = Object.keys(groups).length;
    const typesCount = Object.values(groups).reduce(
      (sum, types) => sum + Object.keys(types).length, 0
    );
    const uniqueCustomersWithRelationships = new Set();
    
    relationships.forEach(rel => {
      uniqueCustomersWithRelationships.add(rel.from_customer._id);
      if (rel.related_customer) {
        uniqueCustomersWithRelationships.add(rel.related_customer._id);
      }
    });
    
    return {
      totalCustomers: customers.length,
      totalRelationships,
      categoriesCount,
      typesCount,
      customersWithRelationships: uniqueCustomersWithRelationships.size,
      customersWithoutRelationships: customersWithoutRelationships.length
    };
  }, [relationshipGroups, relationships, customers.length]);

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>고객 관계 데이터를 불러오는 중...</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <Title level={4} style={{ margin: 0 }}>관계별 고객 분류</Title>
        </Space>
      }
      size="small"
    >
      {/* 통계 정보 */}
      <div style={{ 
        backgroundColor: '#f0f2f5', 
        padding: '12px', 
        borderRadius: '6px', 
        marginBottom: '16px' 
      }}>
        <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Text>
            <strong>전체 고객:</strong> {stats.totalCustomers}명
          </Text>
          <Text>
            <strong>관계 수:</strong> {stats.totalRelationships}개
          </Text>
          <Text>
            <strong>카테고리:</strong> {stats.categoriesCount}개
          </Text>
          <Text>
            <strong>관계 유형:</strong> {stats.typesCount}개
          </Text>
          <Text type="success">
            <strong>관계 보유:</strong> {stats.customersWithRelationships}명
          </Text>
          {stats.customersWithoutRelationships > 0 && (
            <Text type="warning">
              <strong>관계 미설정:</strong> {stats.customersWithoutRelationships}명
            </Text>
          )}
        </Space>
      </div>
      
      {/* 트리 뷰 */}
      <Tree
        showLine
        showIcon
        expandedKeys={expandedKeys}
        selectedKeys={selectedKeys}
        onSelect={handleSelect}
        onExpand={handleExpand}
        treeData={treeData}
        height={600}
        style={{
          backgroundColor: '#fafafa',
          padding: '8px',
          borderRadius: '6px',
          border: '1px solid #e8e8e8'
        }}
      />
    </Card>
  );
};

export default CustomerRelationshipTreeView;