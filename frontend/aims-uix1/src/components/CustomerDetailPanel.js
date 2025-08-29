import React, { useState, useEffect } from 'react';
import { 
  Tabs, Descriptions, Card, Tag, Space, Typography, Avatar, 
  Button, message, Table, Empty, Divider, Tooltip
} from 'antd';
import { 
  UserOutlined, PhoneOutlined, MailOutlined, 
  FileTextOutlined, CalendarOutlined, HomeOutlined,
  DollarOutlined, SafetyOutlined, LinkOutlined,
  EditOutlined, HistoryOutlined, CloseOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import DocumentPreviewModal from './DocumentPreviewModal';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const CustomerDetailPanel = ({ customerId, customer: initialCustomer, onClose, onResetRatio }) => {
  const [customer, setCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  
  // 문서 프리뷰 모달 상태
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

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
  }, [customerId, initialCustomer]);

  // initialCustomer가 변경될 때마다 customer 상태 업데이트 및 문서 목록 새로고침
  useEffect(() => {
    if (initialCustomer && customerId === initialCustomer._id) {
      setCustomer(initialCustomer);
      // 고객 정보가 업데이트되면 문서 목록도 새로고침
      fetchCustomerDocuments();
    }
  }, [initialCustomer]);

  const fetchCustomerDetail = async () => {
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
  };

  const fetchCustomerDocuments = async () => {
    try {
      const response = await axios.get(`http://tars.giize.com:3010/api/customers/${customerId}/documents`);
      if (response.data.success) {
        setCustomerDocuments(response.data.data.documents);
      }
    } catch (error) {
      console.error('고객 문서 조회 실패:', error);
    }
  };

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
    }
  ];

  if (!customer) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Title level={4} style={{ margin: 0 }}>고객 상세 정보</Title>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#999' 
        }}>
          {loading ? '로딩 중...' : '고객을 선택해주세요'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        <Space direction="vertical" size={4} style={{ flex: 1 }}>
          <Space>
            <Avatar 
              size={32} 
              icon={<UserOutlined />} 
              style={{ backgroundColor: '#1890ff' }}
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
          {onResetRatio && (
            <Tooltip title="패널 크기 초기화">
              <Button 
                type="text" 
                size="small" 
                onClick={onResetRatio}
                style={{ fontSize: '10px' }}
              >
                초기화
              </Button>
            </Tooltip>
          )}
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
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
                    onClick: () => handleDocumentClick(record),
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
    </div>
  );
};

export default CustomerDetailPanel;