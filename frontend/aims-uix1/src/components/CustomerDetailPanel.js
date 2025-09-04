import React, { useState, useEffect, useCallback } from 'react';
import { 
  Tabs, Descriptions, Card, Tag, Space, Typography, Avatar, 
  Button, message, Table, Empty, Divider, Tooltip, Popconfirm
} from 'antd';
import { 
  UserOutlined, FileTextOutlined, LinkOutlined,
  EditOutlined, HistoryOutlined, CloseOutlined, DeleteOutlined, ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { getCustomerTypeIconWithColor } from '../utils/customerUtils';
import axios from 'axios';
import dayjs from 'dayjs';
import DocumentPreviewModal from './DocumentPreviewModal';
import CustomerRelationshipDetail from './CustomerRelationshipDetail';
import FamilyRelationshipModal from './FamilyRelationshipModal';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const CustomerDetailPanel = ({ customerId, customer: initialCustomer, onClose, onResetRatio, onEdit, onDelete, onCustomerSelect }) => {
  const [customer, setCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  
  // 문서 프리뷰 모달 상태
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  // 가족 관계 모달 상태
  const [showFamilyRelationshipModal, setShowFamilyRelationshipModal] = useState(false);

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
    } else {
      setCustomer(null);
      setCustomerDocuments([]);
    }
  }, [customerId, initialCustomer, fetchCustomerDetail, fetchCustomerDocuments]);

  // initialCustomer가 변경될 때마다 customer 상태 업데이트 및 문서 목록 새로고침
  useEffect(() => {
    if (initialCustomer && customerId === initialCustomer._id) {
      setCustomer(initialCustomer);
      // 고객 정보가 업데이트되면 문서 목록도 새로고침
      fetchCustomerDocuments();
    }
  }, [initialCustomer, customerId, fetchCustomerDocuments]);

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
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span 
            style={{ 
              fontSize: '12px', 
              cursor: 'pointer', 
              color: '#1890ff'
            }}
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
        return <Tag color={config.color} style={{ fontSize: '10px' }}>{config.text}</Tag>;
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
        return <Tag color={config.color} style={{ fontSize: '10px' }}>{config.text}</Tag>;
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
            style={{ fontSize: '12px' }}
            title="문서 연결 해제"
            onClick={() => handleDeleteButtonClick(record)}
          />
        </Popconfirm>
      )
    }
  ];

  if (!customer) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--color-bg-secondary)'
        }}>
          <Title level={4} style={{ margin: 0 }}>고객 상세 정보</Title>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          backgroundColor: 'var(--color-bg-secondary)'
        }}>
          {loading ? '로딩 중...' : '고객을 선택해주세요'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg-secondary)' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px', 
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        backgroundColor: 'var(--color-bg-secondary)'
      }}>
        <Space direction="vertical" size={4} style={{ flex: 1 }}>
          <Space>
            <Avatar 
              size={32} 
              icon={React.createElement(getCustomerTypeIconWithColor(customer).Icon)} 
              style={{ backgroundColor: getCustomerTypeIconWithColor(customer).color }}
            />
            <div>
              <Title level={5} style={{ margin: 0, lineHeight: 1.2 }}>
                {customer.personal_info?.name}
              </Title>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {customer.insurance_info?.customer_type} • {customer.meta?.status === 'active' ? '활성' : '비활성'}
              </Text>
            </div>
          </Space>
        </Space>
        <Space>
          {customer.insurance_info?.customer_type === '개인' && (
            <Button 
              type="primary" 
              size="small" 
              icon={<TeamOutlined />}
              onClick={handleOpenFamilyRelationshipModal}
              style={{ fontSize: '11px', backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' }}
            >
              가족 관계
            </Button>
          )}
          {onEdit && (
            <Button 
              type="primary" 
              size="small" 
              icon={<EditOutlined />}
              onClick={() => onEdit(customer)}
              style={{ fontSize: '11px' }}
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
                danger 
                size="small" 
                icon={<DeleteOutlined />}
                style={{ fontSize: '11px' }}
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
                style={{ fontSize: '10px' }}
              />
            </Tooltip>
          )}
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--color-bg-secondary)' }}>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          size="small"
          style={{ height: '100%' }}
        >
          <TabPane 
            tab={<Space><UserOutlined />기본 정보</Space>}
            key="info"
          >
            <div style={{ padding: '16px' }}>
              <Card size="small" title="개인 정보" style={{ marginBottom: 12 }}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="고객명">
                    <Text strong>{customer.personal_info?.name}</Text>
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
                    {customer.personal_info?.phone || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="이메일">
                    {customer.personal_info?.email || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="주소">
                    {customer.personal_info?.address ? (
                      <div>
                        <div style={{ fontSize: '12px' }}>
                          [{customer.personal_info.address.postal_code}] {customer.personal_info.address.address1}
                        </div>
                        {customer.personal_info.address.address2 && (
                          <div style={{ fontSize: '12px' }}>{customer.personal_info.address.address2}</div>
                        )}
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
            <div style={{ padding: '16px' }}>
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
                  style={{ margin: '20px 0' }}
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
            <div style={{ padding: '16px' }}>
              <Empty 
                description="상담 이력이 없습니다"
                style={{ margin: '20px 0' }}
              />
            </div>
          </TabPane>

          <TabPane 
            tab={<Space><LinkOutlined />계약 (0)</Space>}
            key="contracts"
          >
            <div style={{ padding: '16px' }}>
              <Empty 
                description="진행 중인 계약이 없습니다"
                style={{ margin: '20px 0' }}
              />
            </div>
          </TabPane>
        </Tabs>
      </div>

      {/* Footer */}
      <Divider style={{ margin: '12px 0 8px 0' }} />
      <div style={{ 
        padding: '0 16px 12px 16px', 
        fontSize: '10px', 
        color: '#999', 
        textAlign: 'center' 
      }}>
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

    </div>
  );
};

export default CustomerDetailPanel;