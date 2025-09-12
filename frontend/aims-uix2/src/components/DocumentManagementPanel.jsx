import React, { useState } from 'react';
import { Table, Upload, Space, Tag, Modal, Select, message, Empty } from 'antd';
import { Button } from './common';
import { 
  UploadOutlined, LinkOutlined, FileTextOutlined, 
  PlusOutlined, DeleteOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;

const DocumentManagementPanel = ({ customerId, documents, onDocumentUpdate }) => {
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleDocumentLink = () => {
    setShowLinkModal(true);
  };

  const handleUpload = (info) => {
    if (info.file.status === 'done') {
      message.success(`${info.file.name} 파일 업로드 성공`);
      onDocumentUpdate();
    } else if (info.file.status === 'error') {
      message.error(`${info.file.name} 파일 업로드 실패`);
    }
  };

  const documentColumns = [
    {
      title: '파일명',
      dataIndex: 'originalName',
      key: 'originalName',
      render: (name) => (
        <Space>
          <FileTextOutlined className="text-blue-500" />
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
      title: '연결일',
      dataIndex: 'linkedAt',
      key: 'linkedAt',
      render: (date) => date && dayjs(date).format('YYYY-MM-DD')
    },
    {
      title: '작업',
      key: 'actions',
      render: (_, record) => (
        <Button 
          variant="danger" 
          size="small" 
          icon={<DeleteOutlined />}
          onClick={() => handleDocumentUnlink(record._id)}
        >
          연결해제
        </Button>
      )
    }
  ];

  const handleDocumentUnlink = async (documentId) => {
    Modal.confirm({
      title: '문서 연결을 해제하시겠습니까?',
      content: '고객과 문서의 연결만 해제되며, 문서 자체는 삭제되지 않습니다.',
      onOk: async () => {
        try {
          const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}/documents/${documentId}`, {
            method: 'DELETE'
          });
          
          if (response.ok) {
            message.success('문서 연결이 해제되었습니다.');
            onDocumentUpdate();
            
            // 검색 결과에 반영되도록 전역 함수 호출
            if (window.handleDocumentUnlinked) {
              window.handleDocumentUnlinked(documentId);
            }
          } else {
            throw new Error('문서 연결 해제 실패');
          }
        } catch (error) {
          message.error('문서 연결 해제에 실패했습니다.');
          console.error('Document unlink error:', error);
        }
      }
    });
  };

  return (
    <div className="py-lg">
      <Space className="mb-lg w-full justify-between">
        <span>고객 문서 관리</span>
        <Space>
          <Upload
            action={`http://tars.giize.com:3010/api/customers/${customerId}/documents/upload`}
            onChange={handleUpload}
            showUploadList={false}
          >
            <Button variant="secondary" icon={<UploadOutlined />} size="small">
              문서 업로드
            </Button>
          </Upload>
          <Button 
            variant="secondary"
            icon={<LinkOutlined />} 
            onClick={handleDocumentLink}
            size="small"
          >
            기존 문서 연결
          </Button>
        </Space>
      </Space>

      {documents && documents.length > 0 ? (
        <Table
          columns={documentColumns}
          dataSource={documents}
          rowKey="_id"
          pagination={{ pageSize: 8 }}
          size="small"
        />
      ) : (
        <Empty 
          description="연결된 문서가 없습니다"
          className="my-xl"
        />
      )}

      <Modal
        title="기존 문서 연결"
        open={showLinkModal}
        onCancel={() => setShowLinkModal(false)}
        footer={null}
        width={600}
      >
        <div className="text-center py-xl text-gray-400">
          기존 문서 연결 기능 구현 예정
        </div>
      </Modal>
    </div>
  );
};

export default DocumentManagementPanel;