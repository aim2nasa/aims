import React, { useEffect, useMemo, useState } from 'react';
import { Tree, Card, Space, Typography, Badge, Spin, Tag, Button, Modal, Select } from 'antd';
import { 
  FolderOutlined, 
  FolderOpenOutlined, 
  UserOutlined,
  HomeOutlined,
  BankOutlined,
  HeartOutlined,
  EditOutlined,
  IdcardOutlined
} from '@ant-design/icons';
import { useRelationship } from '../contexts/RelationshipContext';

const { Title, Text } = Typography;
const { Option } = Select;

const CustomerRelationshipTreeView = ({ onCustomerSelect, selectedCustomerId }) => {
  const {
    loading,
    allRelationshipsData,
    familyRepresentatives,
    loadAllRelationshipsData,
    setFamilyRepresentative
  } = useRelationship();
  
  const [expandedKeys, setExpandedKeys] = useState(['customers', 'family', 'corporate']);
  
  // 대표자 변경 관련 상태 (로컬 UI 상태만)
  const [representativeModal, setRepresentativeModal] = useState({
    visible: false,
    familyGroupKey: null,
    currentRepId: null,
    members: []
  });

  // 컴포넌트 마운트 시 모든 관계 데이터 로드
  useEffect(() => {
    loadAllRelationshipsData();
  }, [loadAllRelationshipsData]);

  // 대표자 변경 모달 열기
  const openRepresentativeModal = (familyGroupKey, currentRepId, members) => {
    setRepresentativeModal({
      visible: true,
      familyGroupKey: familyGroupKey,
      currentRepId: currentRepId,
      members: [...members] // 배열 복사로 참조 문제 방지
    });
  };

  // 대표자 변경 처리 (Context를 통해)
  const handleRepresentativeChange = (newRepId) => {
    const { familyGroupKey } = representativeModal;
    
    setFamilyRepresentative(familyGroupKey, newRepId);
    closeRepresentativeModal();
  };

  // 모달 닫기
  const closeRepresentativeModal = () => {
    setRepresentativeModal({
      visible: false,
      familyGroupKey: null,
      currentRepId: null,
      members: []
    });
  };

  // 가족 대표자 선정 함수 (사용자 설정 우선)
  const selectFamilyRepresentative = (familyMembers, groupKey) => {
    // 사용자가 수동으로 설정한 대표자가 있으면 우선 사용
    const userSetRepId = familyRepresentatives[groupKey];
    if (userSetRepId) {
      const userSetRep = familyMembers.find(member => member._id === userSetRepId);
      if (userSetRep) return userSetRep;
    }
    
    // 기본 알고리즘으로 대표자 선정
    return familyMembers.sort((a, b) => {
      // 1순위: 나이 (생년월일 있으면 - 오래된 날짜가 나이 많음)
      const aBirthDate = a.personal_info?.birth_date;
      const bBirthDate = b.personal_info?.birth_date;
      
      if (aBirthDate && bBirthDate) {
        return new Date(aBirthDate) - new Date(bBirthDate);
      }
      
      // 생년월일 중 하나라도 없으면 있는 사람이 우선
      if (aBirthDate && !bBirthDate) return -1;
      if (!aBirthDate && bBirthDate) return 1;
      
      // 2순위: 이름 가나다순 (한글 우선)
      const aName = a.personal_info?.name || '';
      const bName = b.personal_info?.name || '';
      
      if (aName !== bName) {
        return aName.localeCompare(bName, 'ko');
      }
      
      // 3순위: 등록 순서 (먼저 등록된 사람이 우선)
      const aCreated = a.meta?.created_at;
      const bCreated = b.meta?.created_at;
      
      if (aCreated && bCreated) {
        return new Date(aCreated) - new Date(bCreated);
      }
      
      return 0;
    })[0];
  };

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
      
      // 대표자 선정 (그룹 키 생성)
      const groupKey = Array.from(familyGroup).sort().join('-');
      const representative = selectFamilyRepresentative(familyMembers, groupKey);
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
          const typeLabels = {
            spouse: '배우자',
            parent: '부모', 
            child: '자녀',
            son: '아들',
            daughter: '딸',
            sibling: '형제자매',
            brother: '형/동생',
            sister: '누나/언니/여동생',
            grandparent: '조부모',
            grandchild: '손자/손녀'
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
        groupKey,
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
  }, [allRelationshipsData, familyRepresentatives, selectFamilyRepresentative]);

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
            const { groupKey, representative, members, relations } = groupData;
            
            return {
              title: (
                <Space>
                  {(() => {
                    const isIndividual = representative.insurance_info?.customer_type === '개인';
                    const CustomerIcon = isIndividual ? IdcardOutlined : BankOutlined;
                    const iconColor = isIndividual ? '#52c41a' : '#1890ff';
                    return <CustomerIcon style={{ color: iconColor }} />;
                  })()}
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
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    style={{ color: '#1890ff', fontSize: '14px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRepresentativeModal(groupKey, representative._id, members);
                    }}
                    title="대표자 변경"
                  />
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
                    const isIndividual = member.insurance_info?.customer_type === '개인';
                    const CustomerIcon = isIndividual ? IdcardOutlined : BankOutlined;
                    const iconColor = isIndividual ? '#52c41a' : '#1890ff';
                    
                    return {
                      title: (
                        <Space>
                          <CustomerIcon style={{ color: iconColor }} />
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
                        </Space>
                      ),
                      key: `family-member-${repName}-${index}`,
                      icon: <CustomerIcon style={{ color: iconColor }} />,
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
                const isIndividual = employee?.insurance_info?.customer_type === '개인';
                const CustomerIcon = isIndividual ? IdcardOutlined : BankOutlined;
                const iconColor = isIndividual ? '#52c41a' : '#1890ff';
                
                return {
                  title: (
                    <Space>
                      <CustomerIcon style={{ color: iconColor }} />
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
                    </Space>
                  ),
                  key: `corporate-${companyName}-${index}`,
                  icon: <CustomerIcon style={{ color: iconColor }} />,
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

      {/* 대표자 변경 모달 */}
      <Modal
        title="가족 대표자 변경"
        open={representativeModal.visible}
        onCancel={closeRepresentativeModal}
        footer={null}
        width={400}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>이 가족 그룹의 새로운 대표자를 선택해주세요:</Text>
        </div>
        
        <Select
          key={`${representativeModal.familyGroupKey}-${representativeModal.visible}`} // 모달 열림 상태까지 포함해서 완전히 새로운 키 생성
          style={{ width: '100%' }}
          placeholder="대표자 선택"
          defaultValue={representativeModal.currentRepId} // defaultValue 사용으로 변경
          onChange={handleRepresentativeChange}
        >
          {representativeModal.members.map(member => (
            <Option key={member._id} value={member._id}>
              <Space>
                <UserOutlined />
                <Text>{member.personal_info?.name || '이름없음'}</Text>
                {member.personal_info?.birth_date && (
                  <Text type="secondary">
                    ({new Date(member.personal_info.birth_date).getFullYear()}년생)
                  </Text>
                )}
                {member._id === representativeModal.currentRepId && (
                  <Tag size="small" color="blue">현재 대표</Tag>
                )}
              </Space>
            </Option>
          ))}
        </Select>
        
        <div style={{ marginTop: 16, color: '#666', fontSize: '12px' }}>
          💡 대표자는 나이, 이름 순서로 자동 선택되지만 필요시 직접 변경할 수 있습니다.
        </div>
      </Modal>
    </Card>
  );
};

export default CustomerRelationshipTreeView;