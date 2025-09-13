import React, { useState, useEffect, useCallback } from 'react';
import { 
  Tabs, Descriptions, Card, Tag, Space, Typography, Avatar, 
  Button, message, Table, Empty, Divider, Tooltip, Popconfirm
} from 'antd';
import { 
  UserOutlined, FileTextOutlined, LinkOutlined,
  EditOutlined, HistoryOutlined, CloseOutlined, DeleteOutlined, ReloadOutlined,
  TeamOutlined, MobileOutlined, PhoneOutlined, BankOutlined
} from '@ant-design/icons';
import { getCustomerTypeIconWithColor } from '../utils/customerUtils';
import axios from 'axios';
import dayjs from 'dayjs';
import DocumentPreviewModal from './DocumentPreviewModal';
import CustomerRelationshipDetail from './CustomerRelationshipDetail';
import FamilyRelationshipModal from './FamilyRelationshipModal';
import AddressArchiveModal from './AddressArchiveModal';
import { useRelationship } from '../contexts/RelationshipContext';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const CustomerDetailPanel = ({ customerId, customer: initialCustomer, onClose, onResetRatio, onEdit, onDelete, onCustomerSelect }) => {
  const [customer, setCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [canAddFamilyRelation, setCanAddFamilyRelation] = useState(false);
  
  // Context에서 관계 데이터 사용
  const { allRelationshipsData, loadAllRelationshipsData } = useRelationship();
  
  // 문서 프리뷰 모달 상태
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  // 가족 관계 모달 상태
  const [showFamilyRelationshipModal, setShowFamilyRelationshipModal] = useState(false);

  // 주소 보관소 모달 상태
  const [addressArchiveVisible, setAddressArchiveVisible] = useState(false);

  const fetchCustomerDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}`);
      if (response.data.success) {
        setCustomer(response.data.data);
      }
    } catch (error) {
      message.error('고객 정보를 불러오는데 실패했습니다.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  const fetchCustomerDocuments = useCallback(async () => {
    try {
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}/documents`);
      if (response.data.success) {
        setCustomerDocuments(response.data.data.documents);
      }
    } catch (error) {
      console.error('고객 문서 조회 실패:', error);
    }
  }, [customerId]);

  useEffect(() => {
    if (customerId) {
      // initialCustomer가 있으면 사용하고, 없으면 API로 조회
      if (initialCustomer) {
        setCustomer(initialCustomer);
      } else {
        fetchCustomerDetail();
      }
      fetchCustomerDocuments();
      loadAllRelationshipsData(); // 관계 데이터 로드
    } else {
      setCustomer(null);
      setCustomerDocuments([]);
    }
  }, [customerId, initialCustomer, fetchCustomerDetail, fetchCustomerDocuments, loadAllRelationshipsData]);

  // initialCustomer가 변경될 때마다 customer 상태 업데이트 및 문서 목록 새로고침
  useEffect(() => {
    if (initialCustomer && customerId === initialCustomer._id) {
      setCustomer(initialCustomer);
      // 고객 정보가 업데이트되면 문서 목록도 새로고침
      fetchCustomerDocuments();
    }
  }, [initialCustomer, customerId, fetchCustomerDocuments]);

  // 가족관계 추가 가능 여부 확인
  useEffect(() => {
    if (!customerId) {
      setCanAddFamilyRelation(false);
      return;
    }

    // 새로 생성된 개인 고객의 경우 allRelationshipsData에 아직 없을 수 있음
    // 이런 경우 customer prop을 직접 확인
    if (customer && customer._id === customerId) {
      if (customer.insurance_info?.customer_type === '개인') {
        // allRelationshipsData가 아직 로드되지 않았거나 고객이 없는 경우
        if (!allRelationshipsData.customers.length || !allRelationshipsData.customers.find(c => c._id === customerId)) {
          setCanAddFamilyRelation(true); // 새로운 개인 고객은 가족관계 추가 가능
          return;
        }
      } else {
        setCanAddFamilyRelation(false); // 법인 고객은 불가능
        return;
      }
    }

    if (allRelationshipsData.customers.length > 0) {
      const { customers, relationships } = allRelationshipsData;
      
      // allRelationshipsData에서 현재 고객 찾기 (이미 위에서 개인 고객임을 확인함)
      const currentCustomer = customers.find(c => c._id === customerId);
      if (!currentCustomer) {
        // 데이터 불일치 - 새로운 고객이거나 데이터 로딩 중일 수 있음
        setCanAddFamilyRelation(false);
        return;
      }
      
      // 가족 관계 네트워크 구축
      const familyNetworks = new Map();
      
      // 가족 관계만 필터링 (개인-개인만)
      relationships.forEach(relationship => {
        const category = relationship.relationship_info.relationship_category;
        const fromCustomer = relationship.from_customer;
        const toCustomer = relationship.related_customer;
        
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
      
      // 현재 고객이 가족이 없는 경우 → 가족관계 추가 가능 (첫 가족대표가 됨)
      if (!familyNetworks.has(customerId)) {
        setCanAddFamilyRelation(true);
        return;
      }
      
      // 현재 고객이 가족이 있는 경우, 가족대표인지 확인
      const myFamilyMembers = new Set();
      const stack = [customerId];
      const visited = new Set();
      
      // DFS로 연결된 모든 가족 구성원 찾기
      while (stack.length > 0) {
        const currentId = stack.pop();
        if (visited.has(currentId)) continue;
        
        visited.add(currentId);
        myFamilyMembers.add(currentId);
        
        const connections = familyNetworks.get(currentId);
        if (connections) {
          connections.forEach(connectedId => {
            if (!visited.has(connectedId)) {
              stack.push(connectedId);
            }
          });
        }
      }
      
      // 이 가족의 관계들 수집하여 가족대표 찾기
      const familyRelationships = relationships.filter(rel => {
        const fromId = rel.from_customer?._id || rel.from_customer;
        const toId = rel.related_customer?._id || rel.related_customer;
        return myFamilyMembers.has(fromId) && myFamilyMembers.has(toId);
      });
      
      // 가족대표 찾기 (CustomerRelationshipTreeView와 동일한 로직 사용)
      let familyRepId = null;
      
      // DB에서 family_representative 찾기
      if (familyRelationships.length > 0) {
        const relationshipWithRep = familyRelationships.find(rel => rel.family_representative);
        if (relationshipWithRep) {
          const repId = relationshipWithRep.family_representative._id || relationshipWithRep.family_representative;
          familyRepId = repId;
        }
      }
      
      // 현재 고객이 가족대표인 경우에만 가족관계 추가 가능
      setCanAddFamilyRelation(familyRepId === customerId);
    } else {
      setCanAddFamilyRelation(false);
    }
  }, [customerId, allRelationshipsData, customer]);

  // 문서 클릭 시 상세 정보 조회 및 프리뷰 모달 표시
  const handleDocumentClick = async (documentRecord) => {
    try {
      setLoading(true);
      const response = await axios.post('https://n8nd.giize.com/webhook/smartsearch', {
        id: documentRecord._id
      });

      const fileData = response.data[0];
      
      // URL 경로 수정
      let fileUrl = '';
      if (fileData.upload?.destPath) {
        const correctPath = fileData.upload.destPath.replace('/data', '');
        fileUrl = `https://tars.giize.com${correctPath}`;
      }

      // 프리뷰용 문서 객체 생성
      const documentForPreview = {
        ...fileData,
        fileUrl: fileUrl,
      };

      setSelectedDocument(documentForPreview);
      setShowDocumentPreview(true);
      
    } catch (error) {
      message.error('문서 정보를 불러오는 중 오류가 발생했습니다.');
      console.error('Document fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDocumentPreview = () => {
    setShowDocumentPreview(false);
    setSelectedDocument(null);
  };

  // 가족 관계 모달 관련 핸들러
  const handleOpenFamilyRelationshipModal = () => {
    setShowFamilyRelationshipModal(true);
  };

  const handleCloseFamilyRelationshipModal = () => {
    setShowFamilyRelationshipModal(false);
  };

  const handleFamilyRelationshipSuccess = () => {
    // 가족 관계 추가 성공 시 관계 탭으로 자동 전환
    setActiveTab('relationships');
  };

  // 문서 해제 확인 Popconfirm 상태
  const [popconfirmOpen, setPopconfirmOpen] = useState(false);
  const [unlinkTargetDocument, setUnlinkTargetDocument] = useState(null);

  // 삭제 버튼 클릭 시 문서 프리뷰 먼저 열기
  const handleDeleteButtonClick = async (record) => {
    // 먼저 해당 문서의 프리뷰 모달 열기
    await handleDocumentClick(record);
    // 연결 해제 확인 Popconfirm 표시
    setUnlinkTargetDocument(record);
    setPopconfirmOpen(true);
  };

  // 문서 연결 해제 확인
  const handleConfirmUnlink = async () => {
    if (!unlinkTargetDocument) return;
    
    try {
      const response = await axios.delete(`http://tars.giize.com:3010/api/customers/${customerId}/documents/${unlinkTargetDocument._id}`);
      
      if (response.data.success) {
        message.success('문서 연결이 해제되었습니다.');
        
        // 문서 목록에서 해제된 문서 제거 (즉시 UI 업데이트)
        setCustomerDocuments(prev => prev.filter(doc => doc._id !== unlinkTargetDocument._id));
        
        // 검색 결과에 반영되도록 전역 함수 호출
        if (window.handleDocumentUnlinked) {
          window.handleDocumentUnlinked(unlinkTargetDocument._id);
        }
        
        // 고객 리스트 새로고침 (문서 개수 업데이트)
        if (window.refreshCustomerList) {
          setTimeout(() => {
            window.refreshCustomerList();
          }, 100);
        }
        
        // 해제된 문서가 현재 프리뷰 중인 문서라면 프리뷰 모달 닫기 (성공 후에)
        if (selectedDocument && selectedDocument._id === unlinkTargetDocument._id) {
          // 약간의 지연을 두고 모달 닫기 (사용자가 해제 완료를 인지할 수 있도록)
          setTimeout(() => {
            handleCloseDocumentPreview();
          }, 1000);
        }
      }
    } catch (error) {
      message.error('문서 연결 해제에 실패했습니다.');
      console.error('Document unlink error:', error);
    } finally {
      setPopconfirmOpen(false);
      setUnlinkTargetDocument(null);
    }
  };

  // 문서 연결 해제 취소
  const handleCancelUnlink = () => {
    setPopconfirmOpen(false);
    setUnlinkTargetDocument(null);
  };

  const documentColumns = [
    {
      title: '파일명',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (name, record) => (
        <Space>
          <FileTextOutlined className="text-primary" />
          <span 
            className="text-xs cursor-pointer text-primary"
            onClick={() => handleDocumentClick(record)}
          >
            {name}
          </span>
        </Space>
      )
    },
    {
      title: '유형',
      dataIndex: 'relationship',
      key: 'relationship',
      render: (type) => {
        const typeConfig = {
          contract: { color: 'blue', text: '계약서' },
          claim: { color: 'orange', text: '청구서' },
          proposal: { color: 'green', text: '제안서' },
          id_verification: { color: 'purple', text: '신분증' },
          medical: { color: 'red', text: '의료서류' },
          general: { color: 'default', text: '일반' }
        };
        const config = typeConfig[type] || { color: 'default', text: type };
        return <Tag color={config.color} className="text-xs">{config.text}</Tag>;
      }
    },
    {
      title: '상태',
      dataIndex: 'overallStatus',
      key: 'status',
      render: (status) => {
        const statusConfig = {
          completed: { color: 'green', text: '완료' },
          processing: { color: 'blue', text: '처리중' },
          error: { color: 'red', text: '오류' },
          pending: { color: 'orange', text: '대기' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color} className="text-xs">{config.text}</Tag>;
      }
    },
    {
      title: '작업',
      key: 'action',
      width: 60,
      render: (_, record) => (
        <Popconfirm
          title="문서 연결 해제"
          description="이 문서와 고객의 연결을 해제하시겠습니까?"
          open={popconfirmOpen && unlinkTargetDocument?._id === record._id}
          onConfirm={handleConfirmUnlink}
          onCancel={handleCancelUnlink}
          okText="해제"
          cancelText="취소"
          placement="topRight"
        >
          <Button 
            type="text" 
            size="small"
            icon={<DeleteOutlined />}
            danger
className="text-sm"
            title="문서 연결 해제"
            onClick={() => handleDeleteButtonClick(record)}
          />
        </Popconfirm>
      )
    }
  ];

  if (!customer) {
    return (
      <div className="h-full flex-column" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
        <div className="p-lg border-b border-border flex justify-between align-center" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
          <Title level={4} className="m-0">고객 상세 정보</Title>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div className="flex-1 flex-center text-tertiary" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
          {loading ? '로딩 중...' : '고객을 선택해주세요'}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-column" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
      {/* Header */}
      <div className="p-lg border-b flex justify-between items-start" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
        <Space direction="vertical" size={4} className="flex-auto">
          <Space>
            <Avatar 
              size={32} 
              icon={React.createElement(getCustomerTypeIconWithColor(customer).Icon)} 
              className="customer-type-icon"
              style={{ '--customer-type-color': getCustomerTypeIconWithColor(customer).color }}
            />
            <div>
              <Title level={5} className="m-0 leading-tight">
                {customer.personal_info?.name}
              </Title>
              <Text type="secondary" className="text-sm">
                {customer.insurance_info?.customer_type} • {customer.meta?.status === 'active' ? '활성' : '비활성'}
              </Text>
            </div>
          </Space>
        </Space>
        <Space className="customer-action-buttons">
          {canAddFamilyRelation && (
            <Button 
              size="small" 
              icon={<TeamOutlined className="icon-family-relation" />}
              onClick={handleOpenFamilyRelationshipModal}
              className="text-xs btn-add-relation btn-family-relation"
            >
              가족 관계
            </Button>
          )}
          {onEdit && (
            <Button 
              size="small" 
              icon={<EditOutlined className="icon-edit-action" />}
              onClick={() => onEdit(customer)}
              className="text-2xs btn-edit btn-edit-action"
            >
              수정
            </Button>
          )}
          {onDelete && (
            <Popconfirm
              title="고객 삭제"
              description="정말로 이 고객을 삭제하시겠습니까?"
              onConfirm={() => onDelete(customer._id)}
              okText="삭제"
              cancelText="취소"
              okType="danger"
            >
              <Button 
                size="small" 
                icon={<DeleteOutlined className="icon-delete-action" />}
                className="text-xs btn-delete btn-delete-action"
              >
                삭제
              </Button>
            </Popconfirm>
          )}
          {onResetRatio && (
            <Tooltip title="패널 크기 복원">
              <Button 
                type="text" 
                size="small" 
                icon={<ReloadOutlined />}
                onClick={onResetRatio}
                className="text-2xs btn-reload"
              />
            </Tooltip>
          )}
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} className="btn-close" />
        </Space>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{backgroundColor: 'var(--color-rightpane-bg)'}}>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          size="small"
          className="h-full"
        >
          <TabPane 
            tab={<Space><UserOutlined />기본 정보</Space>}
            key="info"
          >
            <div className="panel-padding">
              <Card size="small" title="개인 정보" className="mb-sm">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="고객명">
                    <Text>{customer.personal_info?.name}</Text>
                    {customer.personal_info?.name_en && (
                      <Text type="secondary"> ({customer.personal_info.name_en})</Text>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="생년월일">
                    {customer.personal_info?.birth_date 
                      ? dayjs(customer.personal_info.birth_date).format('YYYY-MM-DD')
                      : '-'
                    }
                  </Descriptions.Item>
                  <Descriptions.Item label="연락처">
                    {(() => {
                      const mobilePhone = customer.personal_info?.mobile_phone || customer.personal_info?.phone; // 호환성
                      const homePhone = customer.personal_info?.home_phone;
                      const workPhone = customer.personal_info?.work_phone;
                      
                      const contacts = [];
                      
                      if (mobilePhone) {
                        contacts.push(
                          <div key="mobile" className="flex items-center mb-xs">
                            <MobileOutlined className="text-success mr-xs" />
                            <span>{mobilePhone}</span>
                          </div>
                        );
                      }
                      
                      if (homePhone) {
                        contacts.push(
                          <div key="home" className="flex items-center mb-xs">
                            <PhoneOutlined className="text-warning mr-xs" />
                            <span>{homePhone}</span>
                          </div>
                        );
                      }
                      
                      if (workPhone) {
                        contacts.push(
                          <div key="work" className="flex items-center mb-xs">
                            <BankOutlined className="text-primary mr-xs" />
                            <span>{workPhone}</span>
                          </div>
                        );
                      }
                      
                      return contacts.length > 0 ? (
                        <div>
                          {contacts}
                        </div>
                      ) : '-';
                    })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="이메일">
                    {customer.personal_info?.email || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="주소">
                    {customer.personal_info?.address ? (
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs flex items-center gap-2">
                            <span>[{customer.personal_info.address.postal_code}] {customer.personal_info.address.address1}</span>
                            <Button 
                              variant="link"
                              size="small"
                              icon={<HistoryOutlined className="icon-archive-action" />}
                              onClick={() => setAddressArchiveVisible(true)}
                              className="px-1_5 py-0_5 text-4xs h-auto btn-archive-action"
                            >
                              보관소
                            </Button>
                          </div>
                          {customer.personal_info.address.address2 && (
                            <div className="text-xs">{customer.personal_info.address.address2}</div>
                          )}
                        </div>
                      </div>
                    ) : '-'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              <Card size="small" title="보험 정보">
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="고객 유형">
                    <Tag color={customer.insurance_info?.customer_type === '법인' ? 'blue' : 'green'}>
                      {customer.insurance_info?.customer_type || '-'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="위험도">
                    <Tag color={
                      customer.insurance_info?.risk_level === '고위험' ? 'red' : 
                      customer.insurance_info?.risk_level === '중위험' ? 'orange' : 'green'
                    }>
                      {customer.insurance_info?.risk_level || '-'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="연간 보험료">
                    {customer.insurance_info?.annual_premium 
                      ? `₩${customer.insurance_info.annual_premium.toLocaleString()}`
                      : '-'
                    }
                  </Descriptions.Item>
                  <Descriptions.Item label="총 보장금액">
                    {customer.insurance_info?.total_coverage 
                      ? `₩${customer.insurance_info.total_coverage.toLocaleString()}`
                      : '-'
                    }
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </div>
          </TabPane>

          <TabPane 
            tab={<Space><FileTextOutlined />문서 ({customerDocuments.length})</Space>}
            key="documents"
          >
            <div className="panel-padding">
              {customerDocuments.length > 0 ? (
                <Table
                  columns={documentColumns}
                  dataSource={customerDocuments}
                  rowKey="_id"
                  pagination={{ pageSize: 5 }}
                  size="small"
                  onRow={(record) => ({
                    onClick: (e) => {
                      // 삭제 버튼 자체 클릭이 아닌 경우에만 문서 프리뷰 열기
                      if (!e.target.closest('.ant-btn[title="문서 연결 해제"]')) {
                        handleDocumentClick(record);
                      }
                    },
                    style: { cursor: 'pointer' }
                  })}
                />
              ) : (
                <Empty 
                  description="연결된 문서가 없습니다"
className="my-lg"
                />
              )}
            </div>
          </TabPane>

          <TabPane 
            tab={<Space><TeamOutlined />관계</Space>}
            key="relationships"
          >
            <CustomerRelationshipDetail 
              customerId={customerId} 
              onCustomerSelect={onCustomerSelect}
            />
          </TabPane>

          <TabPane 
            tab={<Space><HistoryOutlined />상담 이력 (0)</Space>}
            key="consultations"
          >
            <div className="panel-padding">
              <Empty 
                description="상담 이력이 없습니다"
                className="section-margin"
              />
            </div>
          </TabPane>

          <TabPane 
            tab={<Space><LinkOutlined />계약 (0)</Space>}
            key="contracts"
          >
            <div className="panel-padding">
              <Empty 
                description="진행 중인 계약이 없습니다"
                className="section-margin"
              />
            </div>
          </TabPane>
        </Tabs>
      </div>

      {/* Footer */}
      <Divider className="divider-margin" />
      <div className="panel-footer">
        등록일: {customer.meta?.created_at && dayjs(customer.meta.created_at).format('YYYY-MM-DD HH:mm')} | 
        최종 수정: {customer.meta?.updated_at && dayjs(customer.meta.updated_at).format('YYYY-MM-DD HH:mm')}
      </div>

      {/* 문서 프리뷰 모달 */}
      <DocumentPreviewModal
        visible={showDocumentPreview}
        document={selectedDocument}
        onClose={handleCloseDocumentPreview}
      />

      {/* 가족 관계 추가 모달 */}
      <FamilyRelationshipModal
        visible={showFamilyRelationshipModal}
        onCancel={handleCloseFamilyRelationshipModal}
        customerId={customerId}
        onSuccess={handleFamilyRelationshipSuccess}
      />

      {/* 주소 보관소 모달 */}
      <AddressArchiveModal
        visible={addressArchiveVisible}
        onClose={() => setAddressArchiveVisible(false)}
        customerId={customerId}
        customerName={customer?.personal_info?.name}
      />

    </div>
  );
};

export default CustomerDetailPanel;