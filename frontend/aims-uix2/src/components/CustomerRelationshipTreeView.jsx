import React, { useEffect, useMemo, useState } from 'react';
import { Tree, Card, Space, Typography, Badge, Spin, Tag } from 'antd';
import { 
  FolderOutlined, 
  FolderOpenOutlined, 
  UserOutlined,
  HomeOutlined,
  BankOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { getCustomerTypeIconWithColor } from '../utils/customerUtils';
import { useRelationship } from '../contexts/RelationshipContext';

const { Title, Text } = Typography;

const CustomerRelationshipTreeView = ({ onCustomerSelect, selectedCustomerId }) => {
  const {
    loading,
    allRelationshipsData,
    loadAllRelationshipsData
  } = useRelationship();
  
  const [expandedKeys, setExpandedKeys] = useState(['customers', 'family', 'corporate']);

  // 컴포넌트 마운트 시 모든 관계 데이터 로드
  useEffect(() => {
    loadAllRelationshipsData();
  }, [loadAllRelationshipsData]);



  // Context에서 받은 데이터 구조화
  const structuredData = useMemo(() => {
    const { customers, relationships } = allRelationshipsData;
    
    if (!customers.length || !relationships.length) {
      return { 가족그룹: {}, 법인: {} };
    }
    
    const result = {
      가족그룹: {},  // 가족 그룹별 데이터
      법인: {}
    };
    
    // 가족 관계 네트워크 구축
    const familyNetworks = new Map(); // customerId -> Set(연결된 가족 구성원들)
    const processed = new Set(); // 이미 처리된 고객 ID들
    
    // 1단계: 가족 관계 매핑 구축 (개인-개인만)
    relationships.forEach(relationship => {
      const category = relationship.relationship_info.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      
      // 가족 관계이고 둘 다 개인인 경우만 처리
      if (category === 'family' && 
          fromCustomer?.insurance_info?.customer_type === '개인' && 
          toCustomer?.insurance_info?.customer_type === '개인') {
        
        const fromId = fromCustomer._id;
        const toId = toCustomer._id;
        
        // 양방향 관계 설정
        if (!familyNetworks.has(fromId)) {
          familyNetworks.set(fromId, new Set());
        }
        if (!familyNetworks.has(toId)) {
          familyNetworks.set(toId, new Set());
        }
        
        familyNetworks.get(fromId).add(toId);
        familyNetworks.get(toId).add(fromId);
      }
    });
    
    // 2단계: 가족 그룹별로 구성원 수집 및 대표자 선정
    familyNetworks.forEach((connections, customerId) => {
      if (processed.has(customerId)) return;
      
      // 이 가족 그룹의 모든 구성원 수집 (DFS)
      const familyGroup = new Set();
      const stack = [customerId];
      
      while (stack.length > 0) {
        const currentId = stack.pop();
        if (familyGroup.has(currentId)) continue;
        
        familyGroup.add(currentId);
        processed.add(currentId);
        
        const currentConnections = familyNetworks.get(currentId);
        if (currentConnections) {
          currentConnections.forEach(connectedId => {
            if (!familyGroup.has(connectedId)) {
              stack.push(connectedId);
            }
          });
        }
      }
      
      // 가족 구성원 객체들 수집
      const familyMembers = Array.from(familyGroup).map(id => 
        customers.find(c => c._id === id)
      ).filter(Boolean);
      
      // 2명 이상의 가족 구성원이 있는 경우만 처리
      if (familyMembers.length < 2) return;
      
      // 이 가족 그룹의 관계들 수집 (대표자 선정에 필요)
      const groupRelationships = relationships.filter(rel => {
        const fromId = rel.from_customer?._id || rel.from_customer;
        const toId = rel.related_customer?._id || rel.related_customer;
        return familyGroup.has(fromId) && familyGroup.has(toId);
      });
      
      // 대표자 선정: DB에 저장된 family_representative 사용
      let representative = null;
      
      // DB에서 family_representative 찾기
      if (groupRelationships.length > 0) {
        const relationshipWithRep = groupRelationships.find(rel => rel.family_representative);
        if (relationshipWithRep) {
          const repId = relationshipWithRep.family_representative._id || relationshipWithRep.family_representative;
          representative = familyMembers.find(member => member._id === repId);
        }
      }
      
      // fallback: DB에 family_representative가 없으면 첫 번째 멤버를 대표로
      if (!representative) {
        representative = familyMembers[0];
      }
      
      const repName = representative.personal_info?.name || '이름없음';
      
      // 대표자의 모든 관계 수집
      const familyRelations = [];
      
      relationships.forEach(relationship => {
        const category = relationship.relationship_info.relationship_category;
        const relationshipType = relationship.relationship_info.relationship_type;
        const fromCustomer = relationship.from_customer;
        const toCustomer = relationship.related_customer;
        
        if (category === 'family' && 
            familyGroup.has(fromCustomer._id) && familyGroup.has(toCustomer._id) &&
            fromCustomer?.insurance_info?.customer_type === '개인' && 
            toCustomer?.insurance_info?.customer_type === '개인') {
          // 관계 유형 라벨 매핑
          // 가족관계등록부 범위 내 관계 유형만 허용
          const typeLabels = {
            spouse: '배우자',
            parent: '부모', 
            child: '자녀'
          };
          
          const relationLabel = typeLabels[relationshipType] || relationshipType;
          const fromName = fromCustomer.personal_info?.name || '이름없음';
          const toName = toCustomer.personal_info?.name || '이름없음';
          
          // 중복 방지를 위한 체크
          const relationKey = `${fromName}-${toName}-${relationLabel}`;
          if (!familyRelations.some(r => r.key === relationKey)) {
            familyRelations.push({
              key: relationKey,
              fromName,
              toName,
              relationLabel,
              fromCustomer,
              toCustomer
            });
          }
        }
      });
      
      result.가족그룹[repName] = {
        representative,
        members: familyMembers,
        relations: familyRelations
      };
    });
    
    // 법인 관계 처리 (기존 로직 유지)
    relationships.forEach(relationship => {
      const category = relationship.relationship_info.relationship_category;
      const fromCustomer = relationship.from_customer;
      const toCustomer = relationship.related_customer;
      
      if (category === 'professional' || category === 'corporate') {
        let companyName, employeeName;
        
        if (fromCustomer.insurance_info?.customer_type === '법인' && 
            toCustomer?.insurance_info?.customer_type === '개인') {
          companyName = fromCustomer.personal_info?.name || '회사명없음';
          employeeName = toCustomer?.personal_info?.name || '직원명없음';
        } else if (fromCustomer.insurance_info?.customer_type === '개인' && 
                   toCustomer?.insurance_info?.customer_type === '법인') {
          companyName = toCustomer.personal_info?.name || '회사명없음';
          employeeName = fromCustomer.personal_info?.name || '직원명없음';
        }
        
        if (companyName && employeeName) {
          if (!result.법인[companyName]) {
            result.법인[companyName] = [];
          }
          
          if (!result.법인[companyName].includes(employeeName)) {
            result.법인[companyName].push(employeeName);
          }
        }
      }
    });
    
    return result;
  }, [allRelationshipsData]);

  // 새로운 구조에 맞는 Tree 데이터 생성
  const treeData = useMemo(() => {
    const treeNodes = [];
    
    // 가족 관계 노드 (대표자 중심) - 항상 표시
    const familyGroups = Object.entries(structuredData.가족그룹);
    
    const familyNode = {
        title: (
          <Space>
            <HomeOutlined style={{ color: '#ff4d4f' }} />
            <Text strong style={{ color: '#ff4d4f' }}>가족</Text>
            <Badge count={familyGroups.length} showZero style={{ backgroundColor: '#ff4d4f' }} />
          </Space>
        ),
        key: 'family',
        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: familyGroups
          .sort(([a], [b]) => a.localeCompare(b, 'ko'))
          .map(([repName, groupData]) => {
            const { representative, members, relations } = groupData;
            
            return {
              title: (
                <Space>
                  {React.createElement(getCustomerTypeIconWithColor(representative).Icon, {
                    style: { color: getCustomerTypeIconWithColor(representative).color }
                  })}
                  <Text 
                    strong
                    style={{ 
                      color: '#1890ff', 
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (representative && onCustomerSelect) {
                        onCustomerSelect(representative._id);
                      }
                    }}
                  >
                    👑 {repName} (대표)
                  </Text>
                  <Badge count={members.length} style={{ backgroundColor: '#52c41a', opacity: 0.8 }} />
                </Space>
              ),
              key: `family-group-${repName}`,
              icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
              children: [
                // 가족 구성원들
                ...members
                  .filter(member => member._id !== representative._id) // 대표자 제외
                  .sort((a, b) => (a.personal_info?.name || '').localeCompare(b.personal_info?.name || '', 'ko'))
                  .map((member, index) => {
                    const { Icon, color } = getCustomerTypeIconWithColor(member);
                    
                    return {
                      title: (
                        <Text 
                          style={{ 
                            color: '#1890ff', 
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onCustomerSelect) {
                              onCustomerSelect(member._id);
                            }
                          }}
                        >
                          {member.personal_info?.name || '이름없음'}
                        </Text>
                      ),
                      key: `family-member-${repName}-${index}`,
                      icon: <Icon style={{ color }} />,
                      isLeaf: true
                    };
                  }),
                // 관계 정보들
                ...(relations.length > 0 ? relations.map((relation, index) => ({
                  title: (
                    <Space>
                      <Tag size="small" color="red">{relation.relationLabel}</Tag>
                      <Text style={{ color: '#666' }}>
                        {relation.fromName} → {relation.toName}
                      </Text>
                    </Space>
                  ),
                  key: `family-relation-${repName}-${index}`,
                  icon: <HeartOutlined style={{ color: '#ff4d4f' }} />,
                  isLeaf: true
                })) : [{
                  title: (
                    <Text style={{ color: '#999', fontStyle: 'italic' }}>
                      가족 관계 없음 (0)
                    </Text>
                  ),
                  key: `family-no-relation-${repName}`,
                  icon: <HeartOutlined style={{ color: '#ccc' }} />,
                  isLeaf: true
                }])
              ]
            };
          })
      };
    
    treeNodes.push(familyNode);
    
    // 법인 관계 노드
    const corporateEntries = Object.entries(structuredData.법인);
    if (corporateEntries.length > 0) {
      const corporateNode = {
        title: (
          <Space>
            <BankOutlined style={{ color: '#1890ff' }} />
            <Text strong style={{ color: '#1890ff' }}>법인</Text>
            <Badge count={corporateEntries.length} style={{ backgroundColor: '#1890ff' }} />
          </Space>
        ),
        key: 'corporate',
        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: corporateEntries
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
                    const company = allRelationshipsData.customers.find(c => c.personal_info?.name === companyName);
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
            key: `corporate-${companyName}`,
            icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
            children: employees
              .sort((a, b) => a.localeCompare(b))
              .map((employeeName, index) => {
                const employee = allRelationshipsData.customers.find(c => c.personal_info?.name === employeeName);
                const { Icon, color } = getCustomerTypeIconWithColor(employee);
                
                return {
                  title: (
                    <Text 
                      style={{ 
                        color: '#1890ff', 
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (employee && onCustomerSelect) {
                          onCustomerSelect(employee._id);
                        }
                      }}
                    >
                      {employeeName}
                    </Text>
                  ),
                  key: `corporate-${companyName}-${index}`,
                  icon: <Icon style={{ color }} />,
                  isLeaf: true
                };
              })
          }))
      };
      
      treeNodes.push(corporateNode);
    }
    
    return treeNodes;
  }, [structuredData, allRelationshipsData.customers, onCustomerSelect]);

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