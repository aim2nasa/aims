import React, { useState, useEffect, useMemo } from 'react';
import { Tree, Card, Space, Typography, Badge, Spin } from 'antd';
import { 
  FolderOutlined, 
  FolderOpenOutlined, 
  EnvironmentOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { getCustomerTypeIconWithColor } from '../utils/customerUtils';
import CustomerService from '../services/customerService';

const { Title, Text } = Typography;

const CustomerRegionalTreeView = ({ onCustomerSelect, selectedCustomerId }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(['no-address']);

  useEffect(() => {
    fetchAllCustomers();
  }, []);

  const fetchAllCustomers = async () => {
    setLoading(true);
    try {
      const result = await CustomerService.getCustomers({ 
        page: 1, 
        limit: 1000 
      });
      
      if (result.success) {
        setCustomers(result.data.customers);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
    }
  };

  // 고객을 지역별로 그룹화
  const regionalGroups = useMemo(() => {
    const groups = {};
    const noAddressCustomers = [];
    
    customers.forEach(customer => {
      const address = customer.personal_info?.address?.address1;
      
      if (!address) {
        noAddressCustomers.push(customer);
        return;
      }
      
      // 주소에서 도시와 구 추출
      const parts = address.split(' ');
      const city = parts[0] || '기타';
      const district = parts[1] || '기타구';
      
      if (!groups[city]) {
        groups[city] = {};
      }
      
      if (!groups[city][district]) {
        groups[city][district] = [];
      }
      
      groups[city][district].push(customer);
    });
    
    return { groups, noAddressCustomers };
  }, [customers]);

  // Tree 데이터 생성
  const treeData = useMemo(() => {
    const { groups, noAddressCustomers } = regionalGroups;
    const treeNodes = [];
    
    // 주소 없는 고객들 그룹
    if (noAddressCustomers.length > 0) {
      treeNodes.push({
        title: (
          <Space>
            <QuestionCircleOutlined style={{ color: '#ff4d4f' }} />
            <Text>주소 미등록</Text>
            <Badge count={noAddressCustomers.length} style={{ backgroundColor: '#ff4d4f' }} />
          </Space>
        ),
        key: 'no-address',
        icon: <QuestionCircleOutlined />,
        children: noAddressCustomers.map(customer => {
          const { Icon, color } = getCustomerTypeIconWithColor(customer);
          
          return {
            title: <Text>{customer.personal_info?.name || '이름 없음'}</Text>,
            key: `customer-${customer._id}`,
            icon: <Icon style={{ color }} />,
            isLeaf: true,
            customerData: customer
          };
        })
      });
    }
    
    // 지역별 그룹
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([city, districts]) => {
        const cityCustomerCount = Object.values(districts).reduce((sum, customers) => sum + customers.length, 0);
        
        const cityNode = {
          title: (
            <Space>
              <EnvironmentOutlined style={{ color: '#1890ff' }} />
              <Text strong>{city}</Text>
              <Badge count={cityCustomerCount} style={{ backgroundColor: '#1890ff' }} />
            </Space>
          ),
          key: `city-${city}`,
          icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
          children: Object.entries(districts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([district, customers]) => ({
              title: (
                <Space>
                  <EnvironmentOutlined style={{ color: '#52c41a' }} />
                  <Text>{district}</Text>
                  <Badge count={customers.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              ),
              key: `district-${city}-${district}`,
              icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
              children: customers
                .sort((a, b) => (a.personal_info?.name || '').localeCompare(b.personal_info?.name || ''))
                .map(customer => {
                  const { Icon, color } = getCustomerTypeIconWithColor(customer);
                  
                  return {
                    title: <Text>{customer.personal_info?.name || '이름 없음'}</Text>,
                    key: `customer-${customer._id}`,
                    icon: <Icon style={{ color }} />,
                    isLeaf: true,
                    customerData: customer
                  };
                })
            }))
        };
        
        treeNodes.push(cityNode);
      });
    
    return treeNodes;
  }, [regionalGroups]);

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
    return [`customer-${selectedCustomerId}`];
  }, [selectedCustomerId]);

  // 통계 정보
  const stats = useMemo(() => {
    const { groups, noAddressCustomers } = regionalGroups;
    const totalCustomers = customers.length;
    const citiesCount = Object.keys(groups).length;
    const districtsCount = Object.values(groups).reduce((sum, districts) => sum + Object.keys(districts).length, 0);
    
    return {
      totalCustomers,
      citiesCount,
      districtsCount,
      noAddressCount: noAddressCustomers.length
    };
  }, [regionalGroups, customers.length]);

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>고객 데이터를 불러오는 중...</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ 
      height: 'calc(100vh - 160px)', // 브라우저 뷰포트 기준으로 높이 계산
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            <Title level={4} style={{ margin: 0 }}>지역별 고객 분류</Title>
          </Space>
        }
        size="small"
        bodyStyle={{
          height: 'calc(100vh - 217px)', // 뷰포트에서 헤더들 높이 제외
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflow: 'hidden'
        }}
        style={{ height: '100%' }}
      >
        {/* 통계 정보 */}
        <div style={{ 
          backgroundColor: 'var(--color-bg-tertiary)', 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '16px',
          flex: '0 0 auto'
        }}>
        <Space split={<span style={{ color: 'var(--color-border-dark)' }}>|</span>}>
          <Text>
            <strong>전체 고객:</strong> {stats.totalCustomers}명
          </Text>
          <Text>
            <strong>지역:</strong> {stats.citiesCount}개
          </Text>
          <Text>
            <strong>구/군:</strong> {stats.districtsCount}개
          </Text>
          {stats.noAddressCount > 0 && (
            <Text type="warning">
              <strong>주소 미등록:</strong> {stats.noAddressCount}명
            </Text>
          )}
        </Space>
        </div>
        
        {/* 트리 뷰 */}
        <div style={{ 
          flex: '1 1 auto', 
          overflow: 'auto',
          backgroundColor: 'var(--color-bg-tertiary)',
          padding: '8px',
          borderRadius: '6px',
          border: '1px solid var(--color-border-light)'
        }}>
          <Tree
            showLine
            showIcon
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onSelect={handleSelect}
            onExpand={handleExpand}
            treeData={treeData}
            style={{
              minHeight: '100%'
            }}
          />
        </div>
      </Card>
    </div>
  );
};

export default CustomerRegionalTreeView;