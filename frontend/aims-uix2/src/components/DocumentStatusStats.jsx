/**
 * DocumentStatusStats - 문서 상태 통계 컴포넌트
 * DocumentStatusDashboard에서 분리한 통계 전용 컴포넌트
 */

import React from "react";
import { FileText, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";

const DocumentStatusStats = ({ documents, isConnected }) => {
  const stats = React.useMemo(() => {
    const statusCounts = documents.reduce((acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      acc.total += 1;
      return acc;
    }, { total: 0, completed: 0, processing: 0, error: 0, pending: 0 });

    const completionRate = statusCounts.total > 0 
      ? Math.round((statusCounts.completed / statusCounts.total) * 100)
      : 0;

    return { ...statusCounts, completionRate };
  }, [documents]);

  const statItems = [
    {
      key: 'total',
      label: 'Total Documents',
      value: stats.total,
      icon: FileText,
      className: 'bg-surface-1 border-medium'
    },
    {
      key: 'completed',
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle,
      className: 'status-completed'
    },
    {
      key: 'processing', 
      label: 'Processing',
      value: stats.processing,
      icon: Clock,
      className: 'status-processing'
    },
    {
      key: 'error',
      label: 'Errors',
      value: stats.error,
      icon: XCircle,
      className: 'status-error'
    },
    {
      key: 'pending',
      label: 'Pending',
      value: stats.pending,
      icon: AlertCircle,
      className: 'status-pending'
    }
  ];

  return (
    <div className="flex flex-column gap-lg p-lg">
      {/* Connection Status */}
      <div className="flex-center gap-sm p-sm rounded border">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-error'}`} />
        <span className="text-sm text-secondary">
          {isConnected ? 'Connected to WebSocket' : 'Disconnected'}
        </span>
      </div>

      {/* Completion Rate */}
      <div className="p-lg bg-surface-1 rounded border">
        <div className="flex-between mb-sm">
          <span className="text-base font-medium text-primary">Completion Rate</span>
          <span className="text-lg font-bold text-success">{stats.completionRate}%</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-bar-fill completed" 
            style={{ width: `${stats.completionRate}%` }}
          />
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-2 gap-md">
        {statItems.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.key} className={`p-md rounded border ${item.className}`}>
              <div className="flex-between mb-xs">
                <Icon className="icon-md" />
                <span className="text-lg font-bold">{item.value}</span>
              </div>
              <span className="text-xs">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentStatusStats;