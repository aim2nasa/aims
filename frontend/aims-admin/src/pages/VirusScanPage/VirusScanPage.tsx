/**
 * 바이러스 검사 관리 페이지
 * @since 2025-12-30
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  virusScanApi,
  formatDateTime,
  formatRelativeTime,
  SCAN_STATUS_LABELS,
  SCAN_TYPE_LABELS,
  INFECTED_ACTION_LABELS,
  type VirusScanStats,
  type VirusScanStatus,
  type VirusScanSettings,
  type InfectedFile,
  type VirusScanLog,
  type ScanProgress,
  type SystemInfo,
} from '@/features/virus-scan/api';
import { useVirusScanSSE } from '@/shared/hooks/useVirusScanSSE';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import './VirusScanPage.css';

type TabType = 'infected' | 'logs' | 'settings';

export function VirusScanPage() {
  const [activeTab, setActiveTab] = useState<TabType>('infected');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const queryClient = useQueryClient();

  // SSE 연결
  const { isConnected, events, lastVirusDetected, scanProgress: sseProgress } = useVirusScanSSE();

  // 서비스 상태 조회
  const { data: status } = useQuery({
    queryKey: ['virus-scan', 'status'],
    queryFn: virusScanApi.getStatus,
    refetchInterval: 30000, // 30초마다 갱신
  });

  // 통계 조회
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['virus-scan', 'stats'],
    queryFn: virusScanApi.getStats,
    refetchInterval: 60000, // 1분마다 갱신
  });

  // 설정 조회
  const { data: settings } = useQuery({
    queryKey: ['virus-scan', 'settings'],
    queryFn: virusScanApi.getSettings,
  });

  // 감염 파일 목록
  const { data: infectedData, isLoading: infectedLoading } = useQuery({
    queryKey: ['virus-scan', 'infected'],
    queryFn: () => virusScanApi.getInfectedFiles({ includeDeleted: true }),
    enabled: activeTab === 'infected',
  });

  // 스캔 로그
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['virus-scan', 'logs', logPage],
    queryFn: () => virusScanApi.getLogs({ page: logPage, limit: 50 }),
    enabled: activeTab === 'logs',
  });

  // 스캔 진행률 조회
  const { data: scanProgress } = useQuery({
    queryKey: ['virus-scan', 'progress'],
    queryFn: virusScanApi.getScanProgress,
    refetchInterval: sseProgress?.is_running ? 2000 : false,
    enabled: sseProgress?.is_running || false,
  });

  // 전체 스캔 시작
  const startScanMutation = useMutation({
    mutationFn: virusScanApi.startFullScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
  });

  // 스캔 중지
  const stopScanMutation = useMutation({
    mutationFn: virusScanApi.stopFullScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
  });

  // 감염 파일 삭제
  const deleteMutation = useMutation({
    mutationFn: ({ id, source }: { id: string; source: 'files' | 'personal_files' }) =>
      virusScanApi.deleteInfectedFile(id, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
  });

  // DB 업데이트
  const updateDbMutation = useMutation({
    mutationFn: virusScanApi.updateVirusDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
  });

  // 설정 저장
  const saveSettingsMutation = useMutation({
    mutationFn: virusScanApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan', 'settings'] });
      setShowSettingsModal(false);
    },
  });

  // 바이러스 감지 시 알림 권한 요청
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const isScanning = scanProgress?.is_running || sseProgress?.is_running || false;

  return (
    <div className="virus-scan-page">
      <div className="page-header">
        <div className="page-title">
          <h1>바이러스 검사</h1>
          <div className="service-status">
            <span className={`status-dot ${status?.status === 'ok' ? 'online' : status?.status === 'degraded' ? 'degraded' : 'offline'}`} />
            <span className="status-text">
              {status?.status === 'ok' ? 'ClamAV 정상' : status?.status === 'degraded' ? '일부 문제' : '오프라인'}
            </span>
            {status?.clam_version && (
              <span className="version-text">{status.clam_version}</span>
            )}
          </div>
        </div>
        <div className="page-actions">
          {isScanning ? (
            <Button
              variant="destructive"
              onClick={() => stopScanMutation.mutate()}
              disabled={stopScanMutation.isPending}
            >
              스캔 중지
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => startScanMutation.mutate()}
              disabled={startScanMutation.isPending || status?.status === 'offline'}
            >
              전체 스캔
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => updateDbMutation.mutate()}
            disabled={updateDbMutation.isPending}
          >
            DB 업데이트
          </Button>
          <Button variant="ghost" onClick={() => setShowSettingsModal(true)}>
            설정
          </Button>
        </div>
      </div>

      {/* yuri 시스템 상태 패널 */}
      {status && (
        <SystemStatusPanel status={status} isConnected={isConnected} />
      )}

      {/* 스캔 진행률 표시 */}
      {isScanning && scanProgress && (
        <div className="scan-progress-bar">
          <div className="progress-info">
            <span>전체 스캔 중... {scanProgress.scanned_files}/{scanProgress.total_files}</span>
            <span>{scanProgress.progress_percent?.toFixed(1)}%</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${scanProgress.progress_percent || 0}%` }}
            />
          </div>
          {scanProgress.current_file && (
            <div className="current-file">{scanProgress.current_file}</div>
          )}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.statusCounts?.clean || 0}</div>
          <div className="stat-label">정상 파일</div>
        </div>
        <div className="stat-card infected">
          <div className="stat-value">{stats?.statusCounts?.infected || 0}</div>
          <div className="stat-label">감염 파일</div>
        </div>
        <div className="stat-card deleted">
          <div className="stat-value">{stats?.statusCounts?.deleted || 0}</div>
          <div className="stat-label">삭제됨</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-value">{stats?.statusCounts?.notScanned || 0}</div>
          <div className="stat-label">미스캔</div>
        </div>
        <div className="stat-card today">
          <div className="stat-value">{stats?.todayScans || 0}</div>
          <div className="stat-label">오늘 스캔</div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'infected' ? 'active' : ''}`}
          onClick={() => setActiveTab('infected')}
        >
          감염 파일 ({infectedData?.files?.length || 0})
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          스캔 로그
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          설정
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="tab-content">
        {activeTab === 'infected' && (
          <InfectedFilesTab
            files={infectedData?.files || []}
            isLoading={infectedLoading}
            onDelete={(id, source) => deleteMutation.mutate({ id, source })}
            isDeleting={deleteMutation.isPending}
          />
        )}

        {activeTab === 'logs' && (
          <ScanLogsTab
            logs={logsData?.logs || []}
            pagination={logsData?.pagination}
            isLoading={logsLoading}
            page={logPage}
            onPageChange={setLogPage}
          />
        )}

        {activeTab === 'settings' && settings && (
          <SettingsTab settings={settings} />
        )}
      </div>

      {/* 실시간 이벤트 로그 */}
      <div className="realtime-events">
        <div className="events-header">
          <h3>실시간 활동</h3>
          <span className={`sse-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '연결됨' : '연결 끊김'}
          </span>
        </div>
        <div className="events-list">
          {events.slice(-10).reverse().map((event, index) => (
            <div key={index} className={`event-item ${event.type}`}>
              <span className="event-time">
                {event.timestamp.toLocaleTimeString()}
              </span>
              <span className="event-type">{event.type}</span>
              {event.type === 'virus-detected' && (
                <span className="event-threat">
                  {(event.data as { threatName?: string }).threatName}
                </span>
              )}
            </div>
          ))}
          {events.length === 0 && (
            <div className="no-events">이벤트 대기 중...</div>
          )}
        </div>
      </div>

      {/* 설정 모달 */}
      {showSettingsModal && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSave={(newSettings) => saveSettingsMutation.mutate(newSettings)}
          isSaving={saveSettingsMutation.isPending}
        />
      )}
    </div>
  );
}

// 감염 파일 탭
function InfectedFilesTab({
  files,
  isLoading,
  onDelete,
  isDeleting,
}: {
  files: InfectedFile[];
  isLoading: boolean;
  onDelete: (id: string, source: 'files' | 'personal_files') => void;
  isDeleting: boolean;
}) {
  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (files.length === 0) {
    return <div className="empty-state">감염된 파일이 없습니다.</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>파일명</th>
          <th>위협명</th>
          <th>발견일</th>
          <th>상태</th>
          <th>소유자</th>
          <th>작업</th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <tr key={file._id}>
            <td className="filename">
              {file.upload?.originalName || file.name || file.filename || '-'}
            </td>
            <td className="threat-name">{file.virusScan?.threatName || '-'}</td>
            <td>{formatRelativeTime(file.virusScan?.scannedAt)}</td>
            <td>
              <span className={`status-badge ${file.virusScan?.status}`}>
                {SCAN_STATUS_LABELS[file.virusScan?.status] || file.virusScan?.status}
              </span>
            </td>
            <td>{file.ownerId || file.userId || '-'}</td>
            <td>
              {file.virusScan?.status === 'infected' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(file._id, file.source)}
                  disabled={isDeleting}
                >
                  삭제
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 스캔 로그 탭
function ScanLogsTab({
  logs,
  pagination,
  isLoading,
  page,
  onPageChange,
}: {
  logs: VirusScanLog[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (logs.length === 0) {
    return <div className="empty-state">스캔 로그가 없습니다.</div>;
  }

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th>시간</th>
            <th>유형</th>
            <th>파일 경로</th>
            <th>결과</th>
            <th>위협명</th>
            <th>소요시간</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log._id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>
                <span className="scan-type-badge">
                  {SCAN_TYPE_LABELS[log.scanType] || log.scanType}
                </span>
              </td>
              <td className="file-path" title={log.filePath}>
                {log.filePath?.split('/').pop() || '-'}
              </td>
              <td>
                <span className={`status-badge ${log.result?.status}`}>
                  {SCAN_STATUS_LABELS[log.result?.status] || log.result?.status}
                </span>
              </td>
              <td className="threat-name">{log.result?.threatName || '-'}</td>
              <td>{log.result?.scanDurationMs ? `${log.result.scanDurationMs}ms` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pagination && pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            이전
          </button>
          <span>{page} / {pagination.totalPages}</span>
          <button
            disabled={page >= pagination.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}

// 설정 탭
function SettingsTab({ settings }: { settings: VirusScanSettings }) {
  return (
    <div className="settings-view">
      <div className="settings-section">
        <h3>실시간 스캔</h3>
        <div className="setting-item">
          <span className="setting-label">상태</span>
          <span className={`setting-value ${settings.realtimeScan?.enabled ? 'enabled' : 'disabled'}`}>
            {settings.realtimeScan?.enabled ? '활성화' : '비활성화'}
          </span>
        </div>
        <div className="setting-item">
          <span className="setting-label">대상 컬렉션</span>
          <span className="setting-value">
            {settings.realtimeScan?.collections?.join(', ') || '-'}
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h3>정기 스캔</h3>
        <div className="setting-item">
          <span className="setting-label">상태</span>
          <span className={`setting-value ${settings.scheduledScan?.enabled ? 'enabled' : 'disabled'}`}>
            {settings.scheduledScan?.enabled ? '활성화' : '비활성화'}
          </span>
        </div>
        <div className="setting-item">
          <span className="setting-label">스케줄</span>
          <span className="setting-value">{settings.scheduledScan?.cronExpression || '-'}</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">마지막 실행</span>
          <span className="setting-value">
            {formatDateTime(settings.scheduledScan?.lastRunAt) || '없음'}
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h3>감염 파일 처리</h3>
        <div className="setting-item">
          <span className="setting-label">처리 방식</span>
          <span className="setting-value">
            {INFECTED_ACTION_LABELS[settings.onInfectedAction] || settings.onInfectedAction}
          </span>
        </div>
        <div className="setting-item">
          <span className="setting-label">관리자 알림</span>
          <span className={`setting-value ${settings.notifyAdmin ? 'enabled' : 'disabled'}`}>
            {settings.notifyAdmin ? '활성화' : '비활성화'}
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h3>바이러스 DB</h3>
        <div className="setting-item">
          <span className="setting-label">자동 업데이트</span>
          <span className={`setting-value ${settings.freshclam?.autoUpdate ? 'enabled' : 'disabled'}`}>
            {settings.freshclam?.autoUpdate ? '활성화' : '비활성화'}
          </span>
        </div>
        <div className="setting-item">
          <span className="setting-label">마지막 업데이트</span>
          <span className="setting-value">
            {formatDateTime(settings.freshclam?.lastUpdateAt) || '없음'}
          </span>
        </div>
      </div>
    </div>
  );
}

// 시스템 상태 패널 (yuri RPi5)
function SystemStatusPanel({
  status,
  isConnected,
}: {
  status: VirusScanStatus;
  isConnected: boolean;
}) {
  const system = status.system;

  // 바이트를 GB로 변환
  const formatBytes = (bytes: number) => {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1);
  };

  // 초를 일/시간/분으로 변환
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}일 ${hours}시간`;
    if (hours > 0) return `${hours}시간 ${mins}분`;
    return `${mins}분`;
  };

  // CPU 온도 색상
  const getTempColor = (temp?: number) => {
    if (!temp) return 'normal';
    if (temp >= 80) return 'critical';
    if (temp >= 70) return 'warning';
    return 'normal';
  };

  // 사용률 색상
  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'critical';
    if (percent >= 70) return 'warning';
    return 'normal';
  };

  return (
    <div className="system-status-panel">
      <div className="system-header">
        <div className="system-title">
          <span className="system-icon">🍓</span>
          <span className="system-name">{system?.hostname || 'yuri'}</span>
          <span className="system-platform">{system?.platform || 'Raspberry Pi 5'}</span>
        </div>
        <div className="system-connection">
          <span className={`connection-dot ${status.status === 'ok' ? 'online' : 'offline'}`} />
          <span className="connection-text">
            {status.status === 'ok' ? '연결됨' : '오프라인'}
          </span>
          <span className={`sse-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            SSE {isConnected ? '●' : '○'}
          </span>
        </div>
      </div>

      {system && !system.error ? (
        <div className="system-metrics">
          {/* CPU */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">CPU</span>
              {system.cpu?.temperature && (
                <span className={`metric-temp ${getTempColor(system.cpu.temperature)}`}>
                  {system.cpu.temperature.toFixed(1)}°C
                </span>
              )}
            </div>
            <div className="metric-value">
              <span className={`load-value ${getUsageColor(system.cpu?.load_1m * 100 / (system.cpu?.cores || 1))}`}>
                {system.cpu?.load_1m?.toFixed(2) || '-'}
              </span>
              <span className="load-detail">
                / {system.cpu?.load_5m?.toFixed(2)} / {system.cpu?.load_15m?.toFixed(2)}
              </span>
            </div>
            <div className="metric-sub">{system.cpu?.cores || 0} cores</div>
          </div>

          {/* Memory */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">메모리</span>
              <span className={`metric-percent ${getUsageColor(system.memory?.percent || 0)}`}>
                {system.memory?.percent?.toFixed(0)}%
              </span>
            </div>
            <div className="metric-bar">
              <div
                className={`metric-bar-fill ${getUsageColor(system.memory?.percent || 0)}`}
                style={{ width: `${system.memory?.percent || 0}%` }}
              />
            </div>
            <div className="metric-sub">
              {formatBytes(system.memory?.used || 0)} / {formatBytes(system.memory?.total || 0)} GB
            </div>
          </div>

          {/* Disk */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">디스크</span>
              <span className={`metric-percent ${getUsageColor(system.disk?.percent || 0)}`}>
                {system.disk?.percent?.toFixed(0)}%
              </span>
            </div>
            <div className="metric-bar">
              <div
                className={`metric-bar-fill ${getUsageColor(system.disk?.percent || 0)}`}
                style={{ width: `${system.disk?.percent || 0}%` }}
              />
            </div>
            <div className="metric-sub">
              {formatBytes(system.disk?.used || 0)} / {formatBytes(system.disk?.total || 0)} GB
              <span className="mount-path">{system.disk?.mount_path}</span>
            </div>
          </div>

          {/* Uptime & Mount */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-label">업타임</span>
            </div>
            <div className="metric-value uptime">
              {system.uptime ? formatUptime(system.uptime) : '-'}
            </div>
            <div className="metric-sub">
              <span className={`mount-status ${status.mount_available ? 'mounted' : 'unmounted'}`}>
                {status.mount_available ? '● tars 마운트됨' : '○ 마운트 없음'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="system-error">
          {system?.error || '시스템 정보를 가져올 수 없습니다'}
        </div>
      )}
    </div>
  );
}

// 설정 모달
function SettingsModal({
  settings,
  onClose,
  onSave,
  isSaving,
}: {
  settings: VirusScanSettings;
  onClose: () => void;
  onSave: (settings: Partial<VirusScanSettings>) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState({
    enabled: settings.enabled,
    realtimeScanEnabled: settings.realtimeScan?.enabled ?? true,
    scheduledScanEnabled: settings.scheduledScan?.enabled ?? true,
    onInfectedAction: settings.onInfectedAction || 'delete',
    notifyAdmin: settings.notifyAdmin ?? true,
    freshclamAutoUpdate: settings.freshclam?.autoUpdate ?? true,
  });

  const handleSave = () => {
    onSave({
      enabled: formData.enabled,
      realtimeScan: {
        enabled: formData.realtimeScanEnabled,
        collections: settings.realtimeScan?.collections || ['files', 'personal_files', 'inquiries'],
      },
      scheduledScan: {
        enabled: formData.scheduledScanEnabled,
        cronExpression: settings.scheduledScan?.cronExpression || '0 4 * * *',
        lastRunAt: settings.scheduledScan?.lastRunAt || null,
        nextRunAt: settings.scheduledScan?.nextRunAt || null,
      },
      freshclam: {
        autoUpdate: formData.freshclamAutoUpdate,
        lastUpdateAt: settings.freshclam?.lastUpdateAt || null,
        updateSchedule: settings.freshclam?.updateSchedule || '0 3 * * *',
      },
      onInfectedAction: formData.onInfectedAction as 'delete' | 'quarantine' | 'notify_only',
      notifyAdmin: formData.notifyAdmin,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title="바이러스 스캔 설정">
      <div className="settings-modal-content">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            바이러스 스캔 활성화
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.realtimeScanEnabled}
              onChange={(e) => setFormData({ ...formData, realtimeScanEnabled: e.target.checked })}
            />
            실시간 스캔 (파일 업로드 시)
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.scheduledScanEnabled}
              onChange={(e) => setFormData({ ...formData, scheduledScanEnabled: e.target.checked })}
            />
            정기 스캔 (매일 새벽 4시)
          </label>
        </div>

        <div className="form-group">
          <label>감염 파일 처리</label>
          <select
            value={formData.onInfectedAction}
            onChange={(e) => setFormData({ ...formData, onInfectedAction: e.target.value })}
          >
            <option value="delete">즉시 삭제</option>
            <option value="quarantine">격리</option>
            <option value="notify_only">알림만</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.notifyAdmin}
              onChange={(e) => setFormData({ ...formData, notifyAdmin: e.target.checked })}
            />
            관리자 알림
          </label>
        </div>

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.freshclamAutoUpdate}
              onChange={(e) => setFormData({ ...formData, freshclamAutoUpdate: e.target.checked })}
            />
            바이러스 DB 자동 업데이트
          </label>
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
