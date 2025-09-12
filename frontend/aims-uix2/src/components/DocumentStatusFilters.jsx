/**
 * DocumentStatusFilters - 문서 상태 필터 컴포넌트
 * DocumentStatusDashboard에서 분리한 필터 전용 컴포넌트
 */

import React from "react";
import { Input, Select, Button, Space } from 'antd';
import { RefreshCw, Search, Settings } from "lucide-react";

const { Option } = Select;

const DocumentStatusFilters = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  isConnected,
  onRefresh,
  onReconnect,
  loading
}) => {

  return (
    <div className="flex-column gap-lg p-lg bg-surface-1 border-b">
      {/* Header */}
      <div className="flex-between">
        <div className="flex-center gap-sm">
          <Settings className="icon-lg text-primary" />
          <h1 className="text-2xl font-bold text-primary m-0">Document Status Dashboard</h1>
        </div>
        
        <div className="flex-center gap-sm">
          <div className={`flex-center gap-xs px-sm py-xs rounded ${isConnected ? 'status-completed' : 'status-error'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
            <span className="text-xs">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          <Button
            icon={<RefreshCw className="icon-sm" />}
            onClick={onRefresh}
            loading={loading}
            size="small"
          >
            Refresh
          </Button>
          
          {!isConnected && (
            <Button
              onClick={onReconnect}
              size="small"
              type="primary"
            >
              Reconnect
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-md items-center">
        <div className="flex-center gap-xs">
          <Search className="icon-sm text-tertiary" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-64"
            allowClear
          />
        </div>

        <Select
          placeholder="Filter by status"
          value={statusFilter}
          onChange={onStatusFilterChange}
          className="w-40"
          allowClear
        >
          <Option value="all">All Status</Option>
          <Option value="completed">Completed</Option>
          <Option value="processing">Processing</Option>
          <Option value="error">Error</Option>
          <Option value="pending">Pending</Option>
        </Select>

        <div className="flex-center gap-xs text-sm text-tertiary">
          <span>Auto-refresh:</span>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
          <span>{isConnected ? 'ON' : 'OFF'}</span>
        </div>
      </div>
    </div>
  );
};

export default DocumentStatusFilters;