import React, { useState, useEffect, useMemo } from 'react';
import { Tree, Card, Space, Typography, Badge, Spin, Tag } from 'antd';
import { 
  FolderOutlined, 
  FolderOpenOutlined, 
  UserOutlined,
  HomeOutlined,
  BankOutlined
} from '@ant-design/icons';
import CustomerService from '../services/customerService';

const { Title, Text } = Typography;

const CustomerRelationshipTreeView = ({ onCustomerSelect, selectedCustomerId }) => {
  const [customers, setCustomers] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(['customers', 'family', 'work']);

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

  // 새로운 구조로 데이터 그룹화
  const structuredData = useMemo(() => {
    const result = {
      고객: {
        개인고객: [],
        법인고객: []
      },
      가족: {},
      직장: {}
    };
    
    // 모든 고객을 개인/법인으로 분류
    customers.forEach(customer => {
      const customerType = customer.insurance_info?.customer_type;
      if (customerType === '법인') {
        result.고객.법인고객.push(customer);
      } else {
        result.고객.개인고객.push(customer);
      }
    });
    
    // 관계 정보 처리
    relationships.forEach(relationship => {
      const category = relationship.relationship_info.relationship_category;
      const relationshipType = relationship.relationship_info.relationship_type;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      
      // 가족 관계 처리
      if (category === 'family') {
        const fromName = fromCustomer.personal_info?.name || '이름없음';
        
        if (!result.가족[fromName]) {
          result.가족[fromName] = [];
        }
        
        // 관계 유형에 따른 라벨 매핑
        const typeLabels = {
          spouse: '배우자',
          parent: '부모', 
          child: '자녀',
          son: '아들',
          daughter: '딸',
          sibling: '형제자매',
          brother: '형/동생',
          sister: '누나/언니/여동생'
        };
        
        const relationLabel = typeLabels[relationshipType] || relationshipType;
        const toName = toCustomer?.personal_info?.name || '이름없음';
        
        const relationObj = {};
        relationObj[relationLabel] = toName;
        result.가족[fromName].push(relationObj);
      }
      
      // 직장 관계 처리 (법인 중심)
      else if (category === 'professional' || category === 'corporate') {
        // 법인 고객을 찾아서 직장 관계 설정
        let companyName, employeeName;
        
        if (fromCustomer.insurance_info?.customer_type === '법인') {
          companyName = fromCustomer.personal_info?.name || '회사명없음';
          employeeName = toCustomer?.personal_info?.name || '직원명없음';
        } else if (toCustomer?.insurance_info?.customer_type === '법인') {
          companyName = toCustomer.personal_info?.name || '회사명없음';
          employeeName = fromCustomer.personal_info?.name || '직원명없음';
        }
        
        if (companyName && employeeName) {
          if (!result.직장[companyName]) {
            result.직장[companyName] = [];
          }
          
          // 중복 체크 후 추가
          if (!result.직장[companyName].includes(employeeName)) {
            result.직장[companyName].push(employeeName);
          }
        }
      }
    });
    
    return result;
  }, [relationships, customers]);

  // 새로운 구조에 맞는 Tree 데이터 생성
  const treeData = useMemo(() => {
    const treeNodes = [];
    
    // 가족 관계 노드
    const familyEntries = Object.entries(structuredData.가족);
    if (familyEntries.length > 0) {
      const familyNode = {
        title: (
          <Space>
            <HomeOutlined style={{ color: '#ff4d4f' }} />
            <Text strong style={{ color: '#ff4d4f' }}>가족</Text>
            <Badge count={familyEntries.length} style={{ backgroundColor: '#ff4d4f' }} />
          </Space>
        ),
        key: 'family',
        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: familyEntries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([personName, relations]) => ({
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
                    // 고객 이름으로 찾아서 선택
                    const customer = customers.find(c => c.personal_info?.name === personName);
                    if (customer && onCustomerSelect) {
                      onCustomerSelect(customer._id);
                    }
                  }}
                >
                  {personName}
                </Text>
                <Badge count={relations.length} style={{ backgroundColor: '#ff4d4f', opacity: 0.8 }} />
              </Space>
            ),
            key: `family-${personName}`,
            icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: relations.map((relation, index) => {
              const relationKey = Object.keys(relation)[0];
              const relationValue = relation[relationKey];
              
              return {
                title: (
                  <Space>
                    <Tag size="small" color="red">{relationKey}</Tag>
                    <Text 
                      style={{ 
                        color: '#1890ff', 
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // 관련 고객 이름으로 찾아서 선택
                        const customer = customers.find(c => c.personal_info?.name === relationValue);
                        if (customer && onCustomerSelect) {
                          onCustomerSelect(customer._id);
                        }
                      }}
                    >
                      {relationValue}
                    </Text>
                  </Space>
                ),
                key: `family-${personName}-${index}`,
                icon: <UserOutlined />,
                isLeaf: true
              };
            })
          }))
      };
      
      treeNodes.push(familyNode);
    }
    
    // 직장 관계 노드
    const workEntries = Object.entries(structuredData.직장);
    if (workEntries.length > 0) {
      const workNode = {
        title: (
          <Space>
            <BankOutlined style={{ color: '#1890ff' }} />
            <Text strong style={{ color: '#1890ff' }}>직장</Text>
            <Badge count={workEntries.length} style={{ backgroundColor: '#1890ff' }} />
          </Space>
        ),
        key: 'work',
        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: workEntries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([companyName, employees]) => ({
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
                    // 회사 이름으로 찾아서 선택
                    const company = customers.find(c => c.personal_info?.name === companyName);
                    if (company && onCustomerSelect) {
                      onCustomerSelect(company._id);
                    }
                  }}
                >
                  {companyName}
                </Text>
                <Badge count={employees.length} style={{ backgroundColor: '#1890ff', opacity: 0.8 }} />
              </Space>
            ),
            key: `work-${companyName}`,
            icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: employees
              .sort((a, b) => a.localeCompare(b))
              .map((employeeName, index) => ({
                title: (
                  <Text 
                    style={{ 
                      color: '#1890ff', 
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 직원 이름으로 찾아서 선택
                      const employee = customers.find(c => c.personal_info?.name === employeeName);
                      if (employee && onCustomerSelect) {
                        onCustomerSelect(employee._id);
                      }
                    }}
                  >
                    {employeeName}
                  </Text>
                ),
                key: `work-${companyName}-${index}`,
                icon: <UserOutlined />,
                isLeaf: true
              }))
          }))
      };
      
      treeNodes.push(workNode);
    }
    
    return treeNodes;
  }, [structuredData, customers, onCustomerSelect]);

  const handleSelect = (selectedKeys, { node }) => {
    if (node.customerData && onCustomerSelect) {
      onCustomerSelect(node.customerData._id);
    }
  };

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
          <UserOutlined />
          <Title level={4} style={{ margin: 0 }}>관계별 고객 분류</Title>
        </Space>
      }
      size="small"
    >
      {treeData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          <UserOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
          <div>등록된 고객이 없습니다</div>
        </div>
      ) : (
        <Tree
          treeData={treeData}
          onSelect={handleSelect}
          expandedKeys={expandedKeys}
          onExpand={setExpandedKeys}
          showIcon
          style={{ marginTop: '16px' }}
        />
      )}
    </Card>
  );
};

export default CustomerRelationshipTreeView;