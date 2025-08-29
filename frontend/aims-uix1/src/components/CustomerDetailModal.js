import React, { useState, useEffect } from 'react';
import { 
  Modal, Tabs, Typography, Avatar, message, Space, Divider
} from 'antd';
import { 
  FileTextOutlined, LinkOutlined, EditOutlined, HistoryOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import CustomerEditForm from './CustomerEditForm';
import DocumentManagementPanel from './DocumentManagementPanel';
import ConsultationManagementPanel from './ConsultationManagementPanel';
import ContractManagementPanel from './ContractManagementPanel';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const CustomerDetailModal = ({ visible, onCancel, customerId }) => {
  const [customer, setCustomer] = useState(null);
  const [customerDocuments, setCustomerDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('edit');

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
    setActiveTab('edit');
    onCancel();
  };

  const handleCustomerUpdate = async (updatedData) => {
    // 고객 정보 업데이트 로직 구현 예정
    message.success('고객 정보가 수정되었습니다.');
    fetchCustomerDetail();
  };

  const handleNewConsultation = () => {
    // 새 상담 등록 로직 구현 예정
    message.success('상담이 등록되었습니다.');
  };

  const handleNewContract = () => {
    // 새 계약 생성 로직 구현 예정
    message.success('계약이 생성되었습니다.');
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


  return (
    <Modal
      title={
        <Space>
          <Avatar 
            size={40} 
            icon={<EditOutlined />} 
            style={{ backgroundColor: '#52c41a' }}
          />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {customer.personal_info?.name} 고객 관리
            </Title>
            <Text type="secondary">
              정보 수정 • 문서 연결 • 상담/계약 관리
            </Text>
          </div>
        </Space>
      }
      open={visible}
      onCancel={handleModalClose}
      width={1000}
      footer={null}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane 
          tab={
            <Space>
              <EditOutlined />
              정보 수정
            </Space>
          } 
          key="edit"
        >
          <CustomerEditForm 
            customer={customer} 
            onSave={handleCustomerUpdate}
            onCancel={handleModalClose}
          />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <FileTextOutlined />
              문서 관리 ({customerDocuments.length})
            </Space>
          } 
          key="documents"
        >
          <DocumentManagementPanel 
            customerId={customerId}
            documents={customerDocuments}
            onDocumentUpdate={fetchCustomerDocuments}
          />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <HistoryOutlined />
              상담 관리 (0)
            </Space>
          } 
          key="consultations"
        >
          <ConsultationManagementPanel 
            customerId={customerId}
            onConsultationAdd={handleNewConsultation}
          />
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <LinkOutlined />
              계약 관리 (0)
            </Space>
          } 
          key="contracts"
        >
          <ContractManagementPanel 
            customerId={customerId}
            onContractCreate={handleNewContract}
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default CustomerDetailModal;