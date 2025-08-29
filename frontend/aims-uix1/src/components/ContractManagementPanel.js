import React, { useState } from 'react';
import { Table, Button, Form, Input, DatePicker, Select, Space, Modal, Tag, Empty, InputNumber } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Option } = Select;

const ContractManagementPanel = ({ customerId, onContractCreate }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form] = Form.useForm();

  const handleCreateContract = () => {
    setShowCreateModal(true);
  };

  const handleSubmit = (values) => {
    onContractCreate(values);
    setShowCreateModal(false);
    form.resetFields();
  };

  const mockContracts = [];

  const contractColumns = [
    {
      title: '계약번호',
      dataIndex: 'contractNumber',
      key: 'contractNumber'
    },
    {
      title: '보험상품',
      dataIndex: 'productName',
      key: 'productName'
    },
    {
      title: '계약일',
      dataIndex: 'contractDate',
      key: 'contractDate'
    },
    {
      title: '보험료',
      dataIndex: 'premium',
      key: 'premium',
      render: (amount) => amount && `₩${amount.toLocaleString()}`
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusConfig = {
          active: { color: 'green', text: '유효' },
          pending: { color: 'orange', text: '승인대기' },
          expired: { color: 'red', text: '만료' },
          cancelled: { color: 'default', text: '해지' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    }
  ];

  return (
    <div style={{ padding: '16px 0' }}>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <span>계약 현황 관리</span>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleCreateContract}
          size="small"
        >
          새 계약 생성
        </Button>
      </Space>

      {mockContracts.length > 0 ? (
        <Table
          columns={contractColumns}
          dataSource={mockContracts}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          size="small"
        />
      ) : (
        <Empty 
          description="진행 중인 계약이 없습니다"
          style={{ margin: '40px 0' }}
        />
      )}

      <Modal
        title="새 계약 생성"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item label="계약번호" name="contractNumber" rules={[{ required: true }]}>
            <Input placeholder="자동 생성되는 계약번호" />
          </Form.Item>
          
          <Form.Item label="보험상품" name="productName" rules={[{ required: true }]}>
            <Select placeholder="보험상품을 선택해주세요">
              <Option value="auto_insurance">자동차보험</Option>
              <Option value="health_insurance">건강보험</Option>
              <Option value="life_insurance">생명보험</Option>
              <Option value="fire_insurance">화재보험</Option>
            </Select>
          </Form.Item>
          
          <Form.Item label="계약일" name="contractDate" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          
          <Form.Item label="연간 보험료" name="premium" rules={[{ required: true }]}>
            <InputNumber 
              style={{ width: '100%' }}
              formatter={value => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/₩\s?|(,*)/g, '')}
              placeholder="0"
            />
          </Form.Item>
          
          <Form.Item label="보장금액" name="coverageAmount">
            <InputNumber 
              style={{ width: '100%' }}
              formatter={value => `₩ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/₩\s?|(,*)/g, '')}
              placeholder="0"
            />
          </Form.Item>
          
          <Form.Item label="특이사항" name="notes">
            <Input.TextArea rows={3} placeholder="계약 관련 특이사항이나 메모" />
          </Form.Item>
          
          <div style={{ textAlign: 'right', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setShowCreateModal(false)}>취소</Button>
              <Button type="primary" htmlType="submit">계약 생성</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ContractManagementPanel;