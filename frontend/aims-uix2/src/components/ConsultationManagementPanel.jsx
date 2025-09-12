import React, { useState } from 'react';
import { Table, Form, Input, DatePicker, Select, Space, Modal, Tag, Empty } from 'antd';
import { Button } from './common';
import { PlusOutlined, CalendarOutlined, CommentOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;

const ConsultationManagementPanel = ({ customerId, onConsultationAdd }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [form] = Form.useForm();

  const handleAddConsultation = () => {
    setShowAddModal(true);
  };

  const handleSubmit = (values) => {
    onConsultationAdd(values);
    setShowAddModal(false);
    form.resetFields();
  };

  const mockConsultations = []; // 임시 빈 배열

  const consultationColumns = [
    {
      title: '상담일',
      dataIndex: 'consultationDate',
      key: 'consultationDate'
    },
    {
      title: '상담 유형',
      dataIndex: 'type',
      key: 'type',
      render: (type) => {
        const typeConfig = {
          inquiry: { color: 'blue', text: '문의' },
          claim: { color: 'orange', text: '보상청구' },
          contract: { color: 'green', text: '계약상담' },
          complaint: { color: 'red', text: '불만접수' }
        };
        const config = typeConfig[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '제목',
      dataIndex: 'title',
      key: 'title'
    },
    {
      title: '담당자',
      dataIndex: 'consultant',
      key: 'consultant'
    }
  ];

  return (
    <div className="py-lg">
      <Space className="mb-lg w-full justify-between">
        <span>상담 이력 관리</span>
        <Button 
          variant="primary" 
          icon={<PlusOutlined />} 
          onClick={handleAddConsultation}
          size="small"
        >
          새 상담 등록
        </Button>
      </Space>

      {mockConsultations.length > 0 ? (
        <Table
          columns={consultationColumns}
          dataSource={mockConsultations}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          size="small"
        />
      ) : (
        <Empty 
          description="상담 이력이 없습니다"
          className="my-xl"
        />
      )}

      <Modal
        title="새 상담 등록"
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-lg"
        >
          <Form.Item label="상담일" name="consultationDate" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          
          <Form.Item label="상담 유형" name="type" rules={[{ required: true }]}>
            <Select placeholder="상담 유형을 선택해주세요">
              <Option value="inquiry">문의</Option>
              <Option value="claim">보상청구</Option>
              <Option value="contract">계약상담</Option>
              <Option value="complaint">불만접수</Option>
            </Select>
          </Form.Item>
          
          <Form.Item label="상담 제목" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          
          <Form.Item label="상담 내용" name="content">
            <TextArea rows={4} />
          </Form.Item>
          
          <Form.Item label="담당자" name="consultant">
            <Input />
          </Form.Item>
          
          <div className="text-right mt-xl">
            <Space>
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>취소</Button>
              <Button variant="primary" htmlType="submit">등록</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ConsultationManagementPanel;