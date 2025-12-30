/**
 * 바이러스 검사 관리 페이지 (컴팩트 레이아웃)
 * @since 2025-12-30
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  virusScanApi,
  formatDateTime,
  formatRelativeTime,
  SCAN_STATUS_LABELS,
  SCAN_TYPE_LABELS,
  INFECTED_ACTION_LABELS,
  type VirusScanSettings,
  type InfectedFile,
  type VirusScanLog,
} from '@/features/virus-scan/api';
import { useVirusScanSSE } from '@/shared/hooks/useVirusScanSSE';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import './VirusScanPage.css';

// 정렬 타입
type SortDirection = 'asc' | 'desc';
type InfectedSortKey = 'filename' | 'threatName' | 'scannedAt' | 'status';
type LogSortKey = 'createdAt' | 'scanType' | 'ownerName' | 'customerName' | 'originalName' | 'status' | 'duration';

type TabType = 'infected' | 'logs' | 'settings';

export function VirusScanPage() {
  const [activeTab, setActiveTab] = useState<TabType>('logs');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [isScanStarted, setIsScanStarted] = useState(false);
  const queryClient = useQueryClient();

  // SSE 연결
  const { isConnected, scanProgress: sseProgress } = useVirusScanSSE();

  // 서비스 상태 조회
  const { data: status } = useQuery({
    queryKey: ['virus-scan', 'status'],
    queryFn: virusScanApi.getStatus,
    refetchInterval: 30000,
  });

  // 통계 조회
  const { data: stats } = useQuery({
    queryKey: ['virus-scan', 'stats'],
    queryFn: virusScanApi.getStats,
    refetchInterval: 10000, // 스캔 중 빠른 갱신을 위해 10초
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
    queryFn: () => virusScanApi.getLogs({ page: logPage, limit: 30 }),
    enabled: activeTab === 'logs',
    refetchInterval: isScanStarted ? 3000 : false, // 스캔 중 자동 갱신
  });

  // 스캔 진행률 조회
  const { data: scanProgress } = useQuery({
    queryKey: ['virus-scan', 'progress'],
    queryFn: virusScanApi.getScanProgress,
    refetchInterval: isScanStarted ? 1000 : false,
    enabled: isScanStarted,
  });

  // 스캔 완료 감지
  useEffect(() => {
    if (isScanStarted && scanProgress && !scanProgress.is_running) {
      setIsScanStarted(false);
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    }
  }, [scanProgress, isScanStarted, queryClient]);

  // 전체 스캔 시작
  const startScanMutation = useMutation({
    mutationFn: virusScanApi.startFullScan,
    onSuccess: (data) => {
      setIsScanStarted(true);
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
      alert(`전체 스캔이 시작되었습니다.\n${data.message || ''}`);
    },
    onError: (error: Error) => {
      alert(`전체 스캔 시작 실패: ${error.message}`);
    },
  });

  // 미스캔 파일만 스캔
  const scanUnscannedMutation = useMutation({
    mutationFn: virusScanApi.scanUnscanned,
    onSuccess: (data) => {
      if (data.file_count > 0) {
        setIsScanStarted(true);
        alert(`미스캔 파일 ${data.file_count}개 스캔이 시작되었습니다.`);
      } else {
        alert('스캔할 미스캔 파일이 없습니다.');
      }
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
    onError: (error: Error) => {
      alert(`미스캔 스캔 시작 실패: ${error.message}`);
    },
  });

  // 스캔 중지
  const stopScanMutation = useMutation({
    mutationFn: virusScanApi.stopFullScan,
    onSuccess: () => {
      setIsScanStarted(false);
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
    },
    onError: (error: Error) => {
      alert(`스캔 중지 실패: ${error.message}`);
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['virus-scan'] });
      if (data.success) {
        const output = data.output || '';
        if (output.toLowerCase().includes('up-to-date')) {
          alert('바이러스 DB가 이미 최신 상태입니다.');
        } else {
          alert(`바이러스 DB 업데이트 완료!\n\n${output}`);
        }
      } else {
        alert('수동 업데이트 실패\n\n바이러스 DB는 매일 새벽 3시에 자동 업데이트됩니다.');
      }
    },
    onError: () => {
      alert('수동 업데이트 실패\n\n바이러스 DB는 매일 새벽 3시에 자동 업데이트됩니다.');
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

  const isScanning = isScanStarted || scanProgress?.is_running || sseProgress?.is_running || false;
  const system = status?.system;

  return (
    <div className="virus-scan-page compact">
      {/* 헤더 */}
      <div className="page-header">
        <div className="header-left">
          <h1>바이러스 검사</h1>
          <div className="service-status">
            <span className={`status-dot ${status?.status === 'ok' ? 'online' : 'offline'}`} />
            <span>{status?.status === 'ok' ? 'ClamAV 정상' : '오프라인'}</span>
          </div>
          {system && (
            <div className="yuri-summary">
              <span className="yuri-label">yuri</span>
              {system.cpu?.temperature && (
                <span className={`yuri-metric ${system.cpu.temperature >= 70 ? 'warning' : ''}`}>
                  {system.cpu.temperature.toFixed(0)}°C
                </span>
              )}
              <span className={`yuri-metric ${(system.memory?.percent || 0) >= 70 ? 'warning' : ''}`}>
                메모리 {system.memory?.percent?.toFixed(0)}%
              </span>
              <span className={`yuri-metric ${(system.disk?.percent || 0) >= 70 ? 'warning' : ''}`}>
                디스크 {system.disk?.percent?.toFixed(0)}%
              </span>
              <span className={`sse-dot ${isConnected ? 'connected' : ''}`} title={isConnected ? 'SSE 연결됨' : 'SSE 끊김'} />
            </div>
          )}
        </div>
        <div className="page-actions">
          {isScanning ? (
            <Button variant="destructive" onClick={() => stopScanMutation.mutate()} disabled={stopScanMutation.isPending}>
              스캔 중지
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => scanUnscannedMutation.mutate()}
                disabled={scanUnscannedMutation.isPending || status?.status === 'offline' || (stats?.statusCounts?.notScanned || 0) === 0}
              >
                {scanUnscannedMutation.isPending ? '스캔 시작 중...' : `미스캔 스캔 (${stats?.statusCounts?.notScanned || 0})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => startScanMutation.mutate()}
                disabled={startScanMutation.isPending || status?.status === 'offline'}
              >
                {startScanMutation.isPending ? '스캔 시작 중...' : '전체 스캔'}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => updateDbMutation.mutate()} disabled={updateDbMutation.isPending}>
            {updateDbMutation.isPending ? 'DB 업데이트 중...' : 'DB 업데이트'}
          </Button>
          <Button variant="ghost" onClick={() => setShowSettingsModal(true)}>
            설정
          </Button>
        </div>
      </div>

      {/* 통계 바 + 진행률 */}
      <div className="stats-bar">
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-value">{stats?.statusCounts?.clean || 0}</span>
            <span className="stat-label">정상</span>
          </div>
          <div className="stat-item infected">
            <span className="stat-value">{stats?.statusCounts?.infected || 0}</span>
            <span className="stat-label">감염</span>
          </div>
          <div className="stat-item deleted">
            <span className="stat-value">{stats?.statusCounts?.deleted || 0}</span>
            <span className="stat-label">삭제</span>
          </div>
          <div className="stat-item pending">
            <span className="stat-value">{stats?.statusCounts?.notScanned || 0}</span>
            <span className="stat-label">미스캔</span>
          </div>
          <div className="stat-item today">
            <span className="stat-value">{stats?.todayScans || 0}</span>
            <span className="stat-label">오늘</span>
          </div>
        </div>
        {isScanning && (
          <div className="scan-progress">
            <div className="progress-text">
              스캔 중... {scanProgress?.scanned_files || 0}/{scanProgress?.total_files || '?'}
              {scanProgress?.progress_percent !== undefined && ` (${scanProgress.progress_percent.toFixed(0)}%)`}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${scanProgress?.progress_percent || 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <div className="main-content">
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'infected' ? 'active' : ''}`} onClick={() => setActiveTab('infected')}>
            감염 파일 ({infectedData?.files?.length || 0})
          </button>
          <button className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            스캔 로그
          </button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            설정
          </button>
        </div>

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

// 정렬 헤더 컴포넌트
function SortableHeader<T extends string>({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
}: {
  label: string;
  sortKey: T;
  currentSort: T | null;
  currentDirection: SortDirection;
  onSort: (key: T) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th className="sortable" onClick={() => onSort(sortKey)}>
      {label}
      <span className={`sort-icon ${isActive ? 'active' : ''}`}>
        {isActive ? (currentDirection === 'asc' ? '▲' : '▼') : '▽'}
      </span>
    </th>
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
  const [sortKey, setSortKey] = useState<InfectedSortKey | null>('scannedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: InfectedSortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedFiles = useMemo(() => {
    if (!sortKey) return files;
    return [...files].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortKey) {
        case 'filename':
          aVal = a.upload?.originalName || a.name || a.filename || '';
          bVal = b.upload?.originalName || b.name || b.filename || '';
          break;
        case 'threatName':
          aVal = a.virusScan?.threatName || '';
          bVal = b.virusScan?.threatName || '';
          break;
        case 'scannedAt':
          aVal = a.virusScan?.scannedAt ? new Date(a.virusScan.scannedAt).getTime() : 0;
          bVal = b.virusScan?.scannedAt ? new Date(b.virusScan.scannedAt).getTime() : 0;
          break;
        case 'status':
          aVal = a.virusScan?.status || '';
          bVal = b.virusScan?.status || '';
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [files, sortKey, sortDirection]);

  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (files.length === 0) {
    return <div className="empty-state">감염된 파일이 없습니다.</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <SortableHeader label="파일명" sortKey="filename" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="위협명" sortKey="threatName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="발견일" sortKey="scannedAt" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="상태" sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map((file) => (
            <tr key={file._id}>
              <td className="filename">{file.upload?.originalName || file.name || file.filename || '-'}</td>
              <td className="threat-name">{file.virusScan?.threatName || '-'}</td>
              <td>{formatRelativeTime(file.virusScan?.scannedAt)}</td>
              <td>
                <span className={`status-badge ${file.virusScan?.status}`}>
                  {SCAN_STATUS_LABELS[file.virusScan?.status] || file.virusScan?.status}
                </span>
              </td>
              <td>
                {file.virusScan?.status === 'infected' && (
                  <Button variant="destructive" size="sm" onClick={() => onDelete(file._id, file.source)} disabled={isDeleting}>
                    삭제
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [sortKey, setSortKey] = useState<LogSortKey | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: LogSortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedLogs = useMemo(() => {
    if (!sortKey) return logs;
    return [...logs].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortKey) {
        case 'createdAt':
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case 'scanType':
          aVal = a.scanType || '';
          bVal = b.scanType || '';
          break;
        case 'ownerName':
          aVal = a.ownerName || '';
          bVal = b.ownerName || '';
          break;
        case 'customerName':
          aVal = a.customerName || '';
          bVal = b.customerName || '';
          break;
        case 'originalName':
          aVal = a.originalName || '';
          bVal = b.originalName || '';
          break;
        case 'status':
          aVal = a.result?.status || '';
          bVal = b.result?.status || '';
          break;
        case 'duration':
          aVal = a.result?.scanDurationMs || 0;
          bVal = b.result?.scanDurationMs || 0;
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, sortKey, sortDirection]);

  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (logs.length === 0) {
    return <div className="empty-state">스캔 로그가 없습니다.</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table compact">
        <thead>
          <tr>
            <SortableHeader label="시간" sortKey="createdAt" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="유형" sortKey="scanType" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="설계사" sortKey="ownerName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="고객" sortKey="customerName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="파일명" sortKey="originalName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="결과" sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
            <SortableHeader label="소요" sortKey="duration" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedLogs.map((log) => (
            <tr key={log._id} className={log.result?.status === 'infected' ? 'infected-row' : ''}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>
                <span className="scan-type-badge">{SCAN_TYPE_LABELS[log.scanType] || log.scanType}</span>
              </td>
              <td className="owner-name" title={log.ownerName || ''}>{log.ownerName || '-'}</td>
              <td className="customer-name" title={log.customerName || ''}>{log.customerName || '-'}</td>
              <td className="original-name" title={log.originalName || ''}>{log.originalName || '-'}</td>
              <td>
                <span className={`status-badge ${log.result?.status}`}>
                  {SCAN_STATUS_LABELS[log.result?.status] || log.result?.status}
                </span>
              </td>
              <td>{log.result?.scanDurationMs ? `${log.result.scanDurationMs}ms` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && pagination.totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>이전</button>
          <span>{page} / {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => onPageChange(page + 1)}>다음</button>
        </div>
      )}
    </div>
  );
}

// 설정 탭
function SettingsTab({ settings }: { settings: VirusScanSettings }) {
  return (
    <div className="settings-view compact">
      <table className="settings-table">
        <tbody>
          <tr>
            <th>실시간 스캔</th>
            <td>
              <span className={`status-indicator ${settings.realtimeScan?.enabled ? 'on' : 'off'}`}>
                {settings.realtimeScan?.enabled ? 'ON' : 'OFF'}
              </span>
              <span className="setting-desc">파일 업로드 시 자동 스캔</span>
            </td>
          </tr>
          <tr>
            <th>정기 스캔</th>
            <td>
              <span className={`status-indicator ${settings.scheduledScan?.enabled ? 'on' : 'off'}`}>
                {settings.scheduledScan?.enabled ? 'ON' : 'OFF'}
              </span>
              <span className="setting-desc">매일 새벽 4시</span>
              {settings.scheduledScan?.lastRunAt && (
                <span className="setting-meta">마지막: {formatDateTime(settings.scheduledScan.lastRunAt)}</span>
              )}
            </td>
          </tr>
          <tr>
            <th>감염 파일 처리</th>
            <td>
              <span className="setting-value">{INFECTED_ACTION_LABELS[settings.onInfectedAction] || settings.onInfectedAction}</span>
            </td>
          </tr>
          <tr>
            <th>바이러스 DB 자동 업데이트</th>
            <td>
              <span className={`status-indicator ${settings.freshclam?.autoUpdate ? 'on' : 'off'}`}>
                {settings.freshclam?.autoUpdate ? 'ON' : 'OFF'}
              </span>
              <span className="setting-desc">매일 새벽 3시</span>
              {settings.freshclam?.lastUpdateAt && (
                <span className="setting-meta">마지막: {formatDateTime(settings.freshclam.lastUpdateAt)}</span>
              )}
            </td>
          </tr>
          <tr>
            <th>관리자 알림</th>
            <td>
              <span className={`status-indicator ${settings.notifyAdmin ? 'on' : 'off'}`}>
                {settings.notifyAdmin ? 'ON' : 'OFF'}
              </span>
              <span className="setting-desc">감염 발견 시 알림</span>
            </td>
          </tr>
          <tr>
            <th>스캔 로그 보관</th>
            <td>
              <span className="setting-value">{settings.logRetentionDays || 30}일</span>
              <span className="setting-desc">이후 자동 삭제</span>
            </td>
          </tr>
        </tbody>
      </table>
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
  const [formData, setFormData] = useState<{
    realtimeScanEnabled: boolean;
    scheduledScanEnabled: boolean;
    onInfectedAction: 'delete' | 'quarantine' | 'notify_only';
    notifyAdmin: boolean;
    logRetentionDays: number;
  }>({
    realtimeScanEnabled: settings.realtimeScan?.enabled ?? true,
    scheduledScanEnabled: settings.scheduledScan?.enabled ?? true,
    onInfectedAction: settings.onInfectedAction || 'delete',
    notifyAdmin: settings.notifyAdmin ?? true,
    logRetentionDays: settings.logRetentionDays || 30,
  });

  const handleSave = () => {
    onSave({
      realtimeScan: { ...settings.realtimeScan, enabled: formData.realtimeScanEnabled },
      scheduledScan: { ...settings.scheduledScan, enabled: formData.scheduledScanEnabled },
      onInfectedAction: formData.onInfectedAction,
      notifyAdmin: formData.notifyAdmin,
      logRetentionDays: formData.logRetentionDays,
    });
  };

  return (
    <Modal isOpen={true} title="바이러스 검사 설정" onClose={onClose} size="md">
      <div className="settings-form">
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
          <label htmlFor="onInfectedAction">감염 파일 처리</label>
          <select
            id="onInfectedAction"
            value={formData.onInfectedAction}
            onChange={(e) => setFormData({ ...formData, onInfectedAction: e.target.value as 'delete' | 'quarantine' | 'notify_only' })}
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
            감염 발견 시 관리자 알림
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="logRetentionDays">스캔 로그 보관 기간</label>
          <select
            id="logRetentionDays"
            value={formData.logRetentionDays}
            onChange={(e) => setFormData({ ...formData, logRetentionDays: parseInt(e.target.value, 10) })}
          >
            <option value={7}>7일</option>
            <option value={14}>14일</option>
            <option value={30}>30일</option>
            <option value={60}>60일</option>
            <option value={90}>90일</option>
            <option value={180}>180일</option>
            <option value={365}>365일</option>
          </select>
        </div>

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
