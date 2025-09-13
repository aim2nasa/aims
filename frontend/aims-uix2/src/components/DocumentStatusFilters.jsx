/**
 * DocumentStatusFilters - 문서 상태 필터 컴포넌트
 * DocumentStatusDashboard에서 분리한 필터 전용 컴포넌트
 */

import React from "react";
import { Input, Select, Button, Space, Tooltip } from 'antd';
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
          
          <Tooltip title="문서 상태 정보를 새로고침합니다">
            <Button
              icon={<RefreshCw className="icon-sm" />}
              onClick={onRefresh}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
          </Tooltip>
          
          {!isConnected && (
            <Tooltip title="서버와 연결을 다시 시도합니다">
              <Button
                onClick={onReconnect}
                size="small"
                type="primary"
              >
                Reconnect
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-md items-center">
        <div className="flex-center gap-xs">
          <Search className="icon-sm text-tertiary" />
          <Tooltip title="문서 이름으로 검색합니다">
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-64"
              allowClear
            />
          </Tooltip>
        </div>

        <Tooltip title="문서 처리 상태로 필터링합니다">
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
        </Tooltip>

        <Tooltip title={isConnected ? "자동 새로고침이 활성화되어 있습니다" : "자동 새로고침이 비활성화되어 있습니다"}>
          <div className="flex-center gap-xs text-sm text-tertiary">
            <span>Auto-refresh:</span>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
            <span>{isConnected ? 'ON' : 'OFF'}</span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default DocumentStatusFilters;