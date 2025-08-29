import React, { useState, useEffect } from 'react';
import { 
  Modal, Tabs, Descriptions, Card, List, Tag, Space, 
  Typography, Avatar, Button, message, Table, Empty,
  Divider, Tooltip
} from 'antd';
import { 
  UserOutlined, PhoneOutlined, MailOutlined, 
  FileTextOutlined, CalendarOutlined, HomeOutlined,
  DollarOutlined, SafetyOutlined, LinkOutlined,
  EditOutlined, HistoryOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const CustomerDetailModal = ({ visible, onCancel, customerId }) => {
  const [customer, setCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  useEffect(() => {
    if (visible && customerId) {
      fetchCustomerDetail();
      fetchCustomerDocuments();
    }
  }, [visible, customerId]);

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

  const handleModalClose = () => {
    setCustomer(null);
    setCustomerDocuments([]);
    setActiveTab('info');
    onCancel();
  };

  if (!customer) {
    return (
      <Modal
        title="고객 상세 정보"
        open={visible}
        onCancel={handleModalClose}
        footer={null}
        width={900}
        loading={loading}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          로딩 중...
        </div>
      </Modal>
    );
  }

  const documentColumns = [
    {
      title: '파일명',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (name) => (
        <Space>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span>{name}</span>
        </Space>
      )
    },
    {
      title: '문서 유형',
      dataIndex: 'relationship',
      key: 'relationship',
      render: (type) => {
        const typeConfig = {
          contract: { color: 'blue', text: '계약서' },
          claim: { color: 'orange', text: '보험금청구서' },
          proposal: { color: 'green', text: '제안서' },
          id_verification: { color: 'purple', text: '신분증명서' },
          medical: { color: 'red', text: '의료서류' },
          general: { color: 'default', text: '일반문서' }
        };
        const config = typeConfig[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '처리 상태',
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
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '업로드일',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      render: (date) => date && dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '연결일',
      dataIndex: 'linkedAt',
      key: 'linkedAt',
      render: (date) => date && dayjs(date).format('YYYY-MM-DD')
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <Avatar 
            size={40} 
            icon={<UserOutlined />} 
            style={{ backgroundColor: '#1890ff' }}
          />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {customer.personal_info?.name} 고객 상세정보
            </Title>
            <Text type="secondary">
              {customer.insurance_info?.customer_type} • {customer.meta?.status === 'active' ? '활성' : '비활성'}
            </Text>
          </div>
        </Space>
      }
      open={visible}
      onCancel={handleModalClose}
      width={1000}
      footer={[
        <Button key="edit" type="primary" icon={<EditOutlined />}>
          정보 수정
        </Button>,
        <Button key="close" onClick={handleModalClose}>
          닫기
        </Button>
      ]}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane 
          tab={
            <Space>
              <UserOutlined />
              기본 정보
            </Space>
          } 
          key="info"
        >
          <div style={{ padding: '0 8px' }}>
            <Card title="개인 정보" style={{ marginBottom: 16 }}>
              <Descriptions bordered column={2}>
                <Descriptions.Item 
                  label={<Space><UserOutlined />고객명</Space>}
                  span={1}
                >
                  <Text strong>{customer.personal_info?.name}</Text>
                  {customer.personal_info?.name_en && (
                    <Text type="secondary"> ({customer.personal_info.name_en})</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><CalendarOutlined />생년월일</Space>}
                >
                  {customer.personal_info?.birth_date 
                    ? dayjs(customer.personal_info.birth_date).format('YYYY-MM-DD')
                    : '-'
                  }
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><PhoneOutlined />연락처</Space>}
                >
                  {customer.personal_info?.phone || '-'}
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><MailOutlined />이메일</Space>}
                >
                  {customer.personal_info?.email || '-'}
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><HomeOutlined />주소</Space>}
                  span={2}
                >
                  {customer.personal_info?.address ? (
                    <div>
                      <div>
                        [{customer.personal_info.address.postal_code}] {customer.personal_info.address.address1}
                      </div>
                      {customer.personal_info.address.address2 && (
                        <div>{customer.personal_info.address.address2}</div>
                      )}
                    </div>
                  ) : '-'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card title="보험 정보">
              <Descriptions bordered column={2}>
                <Descriptions.Item 
                  label="고객 유형"
                >
                  <Tag color={customer.insurance_info?.customer_type === '법인' ? 'blue' : 'green'}>
                    {customer.insurance_info?.customer_type || '-'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><SafetyOutlined />위험도</Space>}
                >
                  <Tag color={
                    customer.insurance_info?.risk_level === '고위험' ? 'red' : 
                    customer.insurance_info?.risk_level === '중위험' ? 'orange' : 'green'
                  }>
                    {customer.insurance_info?.risk_level || '-'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item 
                  label={<Space><DollarOutlined />연간 보험료</Space>}
                >
                  {customer.insurance_info?.annual_premium 
                    ? `₩${customer.insurance_info.annual_premium.toLocaleString()}`
                    : '-'
                  }
                </Descriptions.Item>
                <Descriptions.Item 
                  label="총 보장금액"
                >
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
          tab={
            <Space>
              <FileTextOutlined />
              관련 문서 ({customerDocuments.length})
            </Space>
          } 
          key="documents"
        >
          {customerDocuments.length > 0 ? (
            <Table
              columns={documentColumns}
              dataSource={customerDocuments}
              rowKey="_id"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          ) : (
            <Empty 
              description="연결된 문서가 없습니다"
              style={{ margin: '40px 0' }}
            />
          )}
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <HistoryOutlined />
              상담 이력 (0)
            </Space>
          } 
          key="consultations"
        >
          <Empty 
            description="상담 이력이 없습니다"
            style={{ margin: '40px 0' }}
          />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <LinkOutlined />
              계약 현황 (0)
            </Space>
          } 
          key="contracts"
        >
          <Empty 
            description="진행 중인 계약이 없습니다"
            style={{ margin: '40px 0' }}
          />
        </TabPane>
      </Tabs>

      <Divider />
      
      <div style={{ fontSize: '12px', color: '#999', textAlign: 'center' }}>
        등록일: {customer.meta?.created_at && dayjs(customer.meta.created_at).format('YYYY-MM-DD HH:mm')} | 
        최종 수정: {customer.meta?.updated_at && dayjs(customer.meta.updated_at).format('YYYY-MM-DD HH:mm')}
      </div>
    </Modal>
  );
};

export default CustomerDetailModal;