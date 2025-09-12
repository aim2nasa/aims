/**
 * DocumentStatusTable - 문서 상태 테이블 컴포넌트
 * DocumentStatusDashboard에서 분리한 테이블 전용 컴포넌트
 */

import React, { useState, useCallback } from "react";
import { Table, Space } from 'antd';
import { Eye, Copy } from "lucide-react";

// 개별 컴포넌트들도 함께 이동
const StatusBadge = ({ status, size = "medium", isCompact = false, rightPaneVisible = false }) => {
  const configs = {
    completed: { icon: CheckCircle, label: "Completed" },
    processing: { icon: Clock, label: "Processing" },
    error: { icon: XCircle, label: "Error" },
    pending: { icon: AlertCircle, label: "Pending" }
  };
  
  const config = configs[status] || configs.pending;
  const Icon = config.icon;
  
  const sizeClass = size === "small" ? "small" : size === "large" ? "large" : "";
  const statusClass = `status-${status}`;
  const iconSizeClass = size === "small" ? "icon-sm" : "icon-md";
  
  if (rightPaneVisible) {
    return <Icon className={iconSizeClass} />;
  }
  
  return (
    <span className={`status-badge ${statusClass} ${sizeClass}`}>
      <Icon className={iconSizeClass} />
      {!isCompact && config.label}
    </span>
  );
};

const ProgressBar = ({ progress, status }) => {
  return (
    <div className="progress-bar" style={{ height: '8px' }}>
      <div 
        className={`progress-bar-fill ${status}`} 
        style={{ 
          width: `${Math.min(progress || 0, 100)}%`,
          height: '8px',
          animation: status === "processing" ? "pulse 2s infinite" : "none"
        }} 
      />
      <div className="flex-between text-xs text-tertiary mt-xs">
        <span>{progress || 0}%</span>
        <span style={{ textTransform: 'capitalize' }}>{status || 'pending'}</span>
      </div>
    </div>
  );
};

const CopyableId = ({ id }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
    }
  }, [id]);

  const shortId = id?.length > 8 ? `${id.slice(0, 8)}...` : (id || 'N/A');

  return (
    <span className="flex-center gap-xs text-xs text-tertiary px-sm py-xs cursor-pointer rounded hover:bg-hover" onClick={handleCopy}>
      <code className="text-xs">{shortId}</code>
      <Copy className={`icon-xs ${copied ? 'text-success' : 'text-tertiary'}`} />
    </span>
  );
};

const DocumentStatusTable = ({ 
  documents, 
  loading, 
  selectedDoc, 
  onRowClick, 
  rightPaneVisible, 
  pagination, 
  onTableChange,
  extractFilename,
  extractSaveName 
}) => {

  const columns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: rightPaneVisible ? 60 : 120,
      render: (status) => (
        <StatusBadge 
          status={status} 
          size="small" 
          isCompact={rightPaneVisible}
          rightPaneVisible={rightPaneVisible}
        />
      ),
      filters: [
        { text: 'Completed', value: 'completed' },
        { text: 'Processing', value: 'processing' },
        { text: 'Error', value: 'error' },
        { text: 'Pending', value: 'pending' }
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'File',
      dataIndex: 'filename',
      key: 'filename',
      ellipsis: true,
      render: (_, record) => (
        <div className="flex-column gap-xs">
          <span className="font-medium text-primary cursor-pointer">
            {extractFilename(record)}
          </span>
          {!rightPaneVisible && (
            <span className="text-xs text-tertiary">
              {extractSaveName(record)}
            </span>
          )}
        </div>
      )
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      width: rightPaneVisible ? 80 : 120,
      render: (progress, record) => (
        <ProgressBar progress={progress} status={record.status} />
      )
    },
    {
      title: 'ID',
      dataIndex: '_id',
      key: '_id',
      width: rightPaneVisible ? 80 : 120,
      render: (id) => <CopyableId id={id} />
    },
    {
      title: 'Actions',
      key: 'actions',
      width: rightPaneVisible ? 50 : 80,
      render: (_, record) => (
        <Space size="small">
          <Eye 
            className="icon-sm cursor-pointer text-tertiary hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(record);
            }}
          />
        </Space>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      dataSource={documents}
      loading={loading}
      rowKey="_id"
      pagination={pagination}
      onChange={onTableChange}
      rowSelection={null}
      onRow={(record) => ({
        onClick: () => onRowClick(record),
        className: selectedDoc?._id === record._id ? 'ant-table-row-selected' : ''
      })}
      scroll={{ x: 600 }}
      size="small"
    />
  );
};

export default DocumentStatusTable;