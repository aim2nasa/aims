/**
 * Error Logs Page
 * 시스템 에러 로그 조회/관리 페이지 (SSE 실시간 스트림 지원)
 * @since 2025-12-22
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useErrorLogSSE } from '@/shared/hooks/useErrorLogSSE';
import {
  errorLogsApi,
  formatDateTime,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  LEVEL_LABELS,
  type ErrorLog,
  type GetErrorLogsParams,
  type SortField,
  type SortOrder,
  type LogType,
} from '@/features/error-logs/api';
import { Button } from '@/shared/ui/Button/Button';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { errorReporter } from '@/shared/lib/errorReporter';
import './ErrorLogsPage.css';

// 모달 상태 타입
interface ModalState {
  type: 'retention' | 'deleteAll' | 'deleteSelected' | null;
  data?: { hours?: number; label?: string; currentLabel?: string };
}

const LEVEL_OPTIONS = [
  { value: '', label: '전체 레벨' },
  { value: 'error', label: '에러' },
  { value: 'warn', label: '경고' },
  { value: 'info', label: '정보' },
  { value: 'debug', label: '디버그' },
  { value: 'warn,error', label: '경고+에러' }, // 기본값
];

const SEVERITY_OPTIONS = [
  { value: '', label: '전체 심각도' },
  { value: 'critical', label: '치명적' },
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: '전체 카테고리' },
  { value: 'api', label: 'API' },
  { value: 'network', label: '네트워크' },
  { value: 'timeout', label: '타임아웃' },
  { value: 'validation', label: '유효성검사' },
  { value: 'runtime', label: '런타임' },
  { value: 'unhandled', label: '처리안됨' },
];

const SOURCE_OPTIONS = [
  { value: '', label: '전체 소스' },
  { value: 'frontend', label: '프론트엔드' },
  { value: 'backend', label: '백엔드' },
];

const LOG_TYPE_OPTIONS = [
  { value: 'all', label: '전체 로그' },
  { value: 'activity', label: '활동 로그' },
  { value: 'system', label: '시스템 로그' },
];

const LIMIT_OPTIONS = [
  { value: 20, label: '20개씩' },
  { value: 50, label: '50개씩' },
  { value: 100, label: '100개씩' },
];

const PERIOD_OPTIONS = [
  { value: 1, label: '오늘' },
  { value: 7, label: '최근 7일' },
  { value: 30, label: '최근 30일' },
  { value: 90, label: '최근 90일' },
  { value: 365, label: '최근 1년' },
  { value: 0, label: '전체 기간' },
];

// 보존 기간 옵션 (시간 단위)
const RETENTION_OPTIONS = [
  { value: 1 / 60, label: '1분' },
  { value: 5 / 60, label: '5분' },
  { value: 10 / 60, label: '10분' },
  { value: 0.25, label: '15분' },
  { value: 0.5, label: '30분' },
  { value: 1, label: '1시간' },
  { value: 2, label: '2시간' },
  { value: 6, label: '6시간' },
  { value: 12, label: '12시간' },
  { value: 24, label: '1일' },
  { value: 72, label: '3일' },
  { value: 168, label: '7일' },
  { value: 336, label: '14일' },
  { value: 720, label: '30일' },
  { value: 1440, label: '60일' },
  { value: 2160, label: '90일' },
];

/**
 * 부동소수점 값을 가장 가까운 RETENTION_OPTIONS 값으로 매핑
 * (JavaScript 부동소수점 비교 문제 해결)
 */
function normalizeRetentionHours(hours: number): number {
  const tolerance = 0.001; // 0.1% 허용 오차
  const matched = RETENTION_OPTIONS.find(opt =>
    Math.abs(opt.value - hours) < tolerance ||
    Math.abs(opt.value - hours) / Math.max(opt.value, hours) < tolerance
  );
  return matched?.value ?? hours;
}

// localStorage 키
const STORAGE_KEY = 'aims-admin-error-logs-settings';

// 저장할 설정 타입
interface ErrorLogsSettings {
  limit: number;
  levelFilter: string;
  sourceFilter: string;
  severityFilter: string;
  categoryFilter: string;
  logTypeFilter: LogType;
  sortBy: SortField;
  sortOrder: SortOrder;
  statsPeriod: number;  // 통계 기간 (일수, 0=전체)
}

// 기본 설정
const DEFAULT_SETTINGS: ErrorLogsSettings = {
  limit: 20,
  levelFilter: '',
  sourceFilter: '',
  severityFilter: '',
  categoryFilter: '',
  logTypeFilter: 'all',
  sortBy: 'timestamp',
  sortOrder: 'desc',
  statsPeriod: 7,  // 기본 7일
};

// localStorage에서 설정 불러오기
const loadSettings = (): ErrorLogsSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('[ErrorLogsPage] localStorage 로드 실패:', e);
  }
  return DEFAULT_SETTINGS;
};

// localStorage에 설정 저장
const saveSettings = (settings: Partial<ErrorLogsSettings>) => {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[ErrorLogsPage] localStorage 저장 실패:', e);
  }
};

export const ErrorLogsPage = () => {
  const queryClient = useQueryClient();

  // localStorage에서 초기값 로드
  const initialSettings = useMemo(() => loadSettings(), []);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialSettings.limit);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState(initialSettings.levelFilter);
  const [sourceFilter, setSourceFilter] = useState(initialSettings.sourceFilter);
  const [severityFilter, setSeverityFilter] = useState(initialSettings.severityFilter);
  const [categoryFilter, setCategoryFilter] = useState(initialSettings.categoryFilter);
  const [logTypeFilter, setLogTypeFilter] = useState<LogType>(initialSettings.logTypeFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailLog, setDetailLog] = useState<ErrorLog | null>(null);
  const [sortBy, setSortBy] = useState<SortField>(initialSettings.sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSettings.sortOrder);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState(initialSettings.statsPeriod);
  const [confirmModal, setConfirmModal] = useState<ModalState>({ type: null });

  // 설정 변경 시 localStorage에 저장
  useEffect(() => {
    saveSettings({ limit, levelFilter, sourceFilter, severityFilter, categoryFilter, logTypeFilter, sortBy, sortOrder, statsPeriod });
  }, [limit, levelFilter, sourceFilter, severityFilter, categoryFilter, logTypeFilter, sortBy, sortOrder, statsPeriod]);

  const debouncedSearch = useDebounce(search, 300);

  // 보존 기간 설정 조회 (SSE 훅보다 먼저 선언)
  const { data: retentionData } = useQuery({
    queryKey: ['admin', 'error-logs', 'retention'],
    queryFn: () => errorLogsApi.getRetention(),
  });
  const [localRetentionHours, setLocalRetentionHours] = useState<number | null>(null);
  const retentionHours = normalizeRetentionHours(localRetentionHours ?? retentionData?.hours ?? 168);

  // SSE 실시간 스트림 연결 (retentionHours 전달하여 자동 정리)
  const { isConnected, stats: sseStats, newLogs, clearNewLogs, clearStats } = useErrorLogSSE(true, retentionHours);

  // 이전 필터 상태 추적 (필터 변경 시 newLogs 클리어)
  const prevFiltersRef = useRef({ levelFilter, sourceFilter, logTypeFilter, search: debouncedSearch });

  // 에러 로그 목록 조회
  const params: GetErrorLogsParams = {
    page,
    limit,
    search: debouncedSearch || undefined,
    level: levelFilter || undefined,
    source: sourceFilter as 'frontend' | 'backend' | undefined,
    severity: severityFilter || undefined,
    category: categoryFilter || undefined,
    sortBy,
    sortOrder,
    logType: logTypeFilter,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'error-logs', params],
    queryFn: () => errorLogsApi.getList(params),
    // SSE가 연결되어 있으면 폴링 비활성화, 아니면 fallback으로 60초 폴링
    refetchInterval: isConnected ? false : 60000,
  });

  // 통계 조회 - 조회 기간에 맞춰 조회
  const { data: apiStats } = useQuery({
    queryKey: ['admin', 'error-logs', 'stats', statsPeriod],
    queryFn: () => errorLogsApi.getStats(statsPeriod || 9999),  // 0이면 전체 기간
    // SSE가 연결되어 있으면 초기 로드만, 아니면 폴링
    refetchInterval: isConnected ? false : 60000,
  });

  // SSE stats 우선, fallback으로 API stats 사용
  const stats = sseStats || apiStats;

  // 보존 기간 설정 변경 - 모달 열기
  const handleRetentionChange = (hours: number) => {
    if (hours === retentionHours) return;

    const label = RETENTION_OPTIONS.find(opt => opt.value === hours)?.label || `${hours}시간`;
    const currentLabel = RETENTION_OPTIONS.find(opt => opt.value === retentionHours)?.label || `${retentionHours}시간`;

    setConfirmModal({
      type: 'retention',
      data: { hours, label, currentLabel },
    });
  };

  // 보존 기간 설정 확정
  const confirmRetentionChange = async () => {
    const hours = confirmModal.data?.hours;
    if (!hours) return;

    setLocalRetentionHours(hours);
    setConfirmModal({ type: null });

    try {
      await errorLogsApi.setRetention(hours, true);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs', 'retention'] });
    } catch (err) {
      console.error('보존 기간 설정 실패:', err);
      errorReporter.reportApiError(err as Error, { component: 'ErrorLogsPage.confirmRetentionChange' });
      setLocalRetentionHours(null);
    }
  };

  // 필터 변경 감지 시 newLogs 클리어
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.levelFilter !== levelFilter ||
      prev.sourceFilter !== sourceFilter ||
      prev.logTypeFilter !== logTypeFilter ||
      prev.search !== debouncedSearch
    ) {
      clearNewLogs();
      prevFiltersRef.current = { levelFilter, sourceFilter, logTypeFilter, search: debouncedSearch };
    }
  }, [levelFilter, sourceFilter, logTypeFilter, debouncedSearch, clearNewLogs]);

  // SSE로 받은 새 로그를 현재 필터에 맞게 필터링
  const filteredNewLogs = useMemo(() => {
    if (page !== 1) return []; // 첫 페이지에서만 새 로그 표시

    return newLogs.filter((log) => {
      // 로그 타입 필터
      if (logTypeFilter === 'activity' && log.logType !== 'activity') return false;
      if (logTypeFilter === 'system' && log.logType === 'activity') return false;

      // 레벨 필터
      if (levelFilter) {
        const levels = levelFilter.split(',').map((l) => l.trim());
        if (!levels.includes(log.level || 'error')) return false;
      }

      // 소스 필터
      if (sourceFilter && log.source?.type !== sourceFilter) return false;

      // 심각도 필터
      if (severityFilter && log.error?.severity !== severityFilter) return false;

      // 카테고리 필터
      if (categoryFilter && log.error?.category !== categoryFilter) return false;

      // 검색어 필터
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const messageMatch = (log.message || log.error?.message || '').toLowerCase().includes(searchLower);
        const componentMatch = (log.source?.component || '').toLowerCase().includes(searchLower);
        const typeMatch = (log.error?.type || log.activity?.action_type || '').toLowerCase().includes(searchLower);
        if (!messageMatch && !componentMatch && !typeMatch) return false;
      }

      return true;
    });
  }, [newLogs, page, logTypeFilter, levelFilter, sourceFilter, severityFilter, categoryFilter, debouncedSearch]);

  // API 데이터와 새 로그 병합 (중복 제거)
  const mergedLogs = useMemo(() => {
    const apiLogs = data?.logs || [];
    if (filteredNewLogs.length === 0) return apiLogs;

    // API 로그 ID Set
    const apiLogIds = new Set(apiLogs.map((log) => log._id));

    // 새 로그 중 API 결과에 없는 것만 추가
    const uniqueNewLogs = filteredNewLogs.filter((log) => !apiLogIds.has(log._id));

    // 새 로그를 상단에 추가
    return [...uniqueNewLogs, ...apiLogs];
  }, [data?.logs, filteredNewLogs]);

  // 삭제 mutation
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => errorLogsApi.deleteMany(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
      setSelectedIds(new Set());
    },
  });

  // 전체 삭제 mutation
  const deleteAllMutation = useMutation({
    mutationFn: () => errorLogsApi.deleteAll(),
    onSuccess: () => {
      // 1. 먼저 로컬 상태 초기화 (UI 즉시 반영)
      clearNewLogs();
      clearStats();

      // 2. 그 다음 서버 데이터 새로 가져오기
      queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });

      setConfirmModal({ type: null });
    },
    onError: () => {
      setConfirmModal({ type: null });
    },
  });

  const handleDeleteAll = () => {
    setConfirmModal({ type: 'deleteAll' });
  };

  const confirmDeleteAll = () => {
    deleteAllMutation.mutate();
  };

  const handleSelectAll = () => {
    if (!data?.logs) return;
    if (selectedIds.size === data.logs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.logs.map((log) => log._id)));
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setConfirmModal({ type: 'deleteSelected' });
  };

  const confirmDeleteSelected = () => {
    deleteMutation.mutate(Array.from(selectedIds));
    setConfirmModal({ type: null });
  };

  const handleToggleDeleteMode = () => {
    if (isDeleteMode) {
      // 삭제 모드 해제 시 선택 초기화
      setSelectedIds(new Set());
    }
    setIsDeleteMode(!isDeleteMode);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      // 같은 필드 클릭 시 방향 토글
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭 시 해당 필드로 변경, desc로 시작
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <span className="sort-icon sort-icon--inactive">⇅</span>;
    }
    return (
      <span className="sort-icon sort-icon--active">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  if (isLoading) {
    return <div className="error-logs-page__loading">에러 로그를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="error-logs-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  const logs = mergedLogs;
  const pagination = data?.pagination;
  const hasNewLogs = filteredNewLogs.length > 0;

  return (
    <div className="error-logs-page">
      <div className="error-logs-page__header">
        <h1 className="error-logs-page__title">
          시스템 로그
          {hasNewLogs && (
            <span className="error-logs-page__new-badge">+{filteredNewLogs.length} 실시간</span>
          )}
        </h1>
        <div className="error-logs-page__actions">
          <span className={`error-logs-page__connection-status ${isConnected ? 'error-logs-page__connection-status--connected' : ''}`}>
            {isConnected ? '실시간 연결됨' : '연결 중...'}
          </span>
          <div className="error-logs-page__retention-setting">
            <span className="error-logs-page__retention-icon" title="자동 삭제 설정">⚙</span>
            <select
              className="error-logs-page__retention-select"
              value={retentionHours}
              onChange={(e) => handleRetentionChange(Number(e.target.value))}
              aria-label="로그 자동 삭제 기간"
            >
              {RETENTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} 후
                </option>
              ))}
            </select>
          </div>
          {isDeleteMode && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={deleteAllMutation.isPending || !stats?.total}
            >
              {deleteAllMutation.isPending ? '삭제 중...' : '전체 삭제'}
            </Button>
          )}
          <Button
            variant={isDeleteMode ? 'destructive' : 'secondary'}
            size="sm"
            onClick={handleToggleDeleteMode}
          >
            {isDeleteMode ? '삭제 모드 해제' : '삭제'}
          </Button>
          <Button variant="secondary" size="sm" onClick={async () => {
            clearStats();  // SSE 통계 초기화 → 0으로 표시
            clearNewLogs(); // SSE 새 로그 초기화
            // 모든 관련 쿼리 무효화 후 자동으로 새로고침됨
            await queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
          }}>
            새로고침
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="error-logs-page__stats-section">
          <div className="error-logs-page__stats">
            <div className="error-logs-page__stat-card">
              <span className="error-logs-page__stat-value">{stats.total}</span>
              <span className="error-logs-page__stat-label">총 로그</span>
            </div>
            <div className="error-logs-page__stat-card error-logs-page__stat-card--activity">
              <span className="error-logs-page__stat-value">{stats.byLevel?.activity || stats.bySource?.activity || 0}</span>
              <span className="error-logs-page__stat-label">Activity</span>
            </div>
            <div className="error-logs-page__stat-card error-logs-page__stat-card--error">
              <span className="error-logs-page__stat-value">{stats.byLevel?.error || 0}</span>
              <span className="error-logs-page__stat-label">Error</span>
            </div>
            <div className="error-logs-page__stat-card error-logs-page__stat-card--warn">
              <span className="error-logs-page__stat-value">{stats.byLevel?.warn || 0}</span>
              <span className="error-logs-page__stat-label">Warn</span>
            </div>
            <div className="error-logs-page__stat-card error-logs-page__stat-card--info">
              <span className="error-logs-page__stat-value">{stats.byLevel?.info || 0}</span>
              <span className="error-logs-page__stat-label">Info</span>
            </div>
            <div className="error-logs-page__stat-card">
              <span className="error-logs-page__stat-value">{stats.bySource?.frontend || 0}</span>
              <span className="error-logs-page__stat-label">Frontend</span>
            </div>
            <div className="error-logs-page__stat-card">
              <span className="error-logs-page__stat-value">{stats.bySource?.backend || 0}</span>
              <span className="error-logs-page__stat-label">Backend</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="error-logs-page__filters">
        <input
          type="text"
          className="error-logs-page__search"
          placeholder="로그 메시지 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="error-logs-page__select"
          value={logTypeFilter}
          onChange={(e) => {
            setLogTypeFilter(e.target.value as LogType);
            setPage(1);
          }}
        >
          {LOG_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="error-logs-page__select"
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setPage(1);
          }}
        >
          {LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="error-logs-page__select"
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setPage(1);
          }}
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="error-logs-page__select"
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPage(1);
          }}
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="error-logs-page__select"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="error-logs-page__select"
          value={statsPeriod}
          onChange={(e) => setStatsPeriod(Number(e.target.value))}
          aria-label="조회 기간"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isDeleteMode && selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? '삭제 중...' : `선택 삭제 (${selectedIds.size})`}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="error-logs-page__content">
        {logs.length === 0 ? (
          <div className="error-logs-page__empty">시스템 로그가 없습니다.</div>
        ) : (
          <>
            <div className="error-logs-page__table-container">
              <table className="error-logs-page__table">
                <thead>
                  <tr>
                    {isDeleteMode && (
                      <th className="error-logs-page__th-check">
                        <input
                          type="checkbox"
                          aria-label="전체 선택"
                          checked={logs.length > 0 && selectedIds.size === logs.length}
                          onChange={handleSelectAll}
                        />
                      </th>
                    )}
                    <th
                      className="error-logs-page__th-time error-logs-page__th--sortable"
                      onClick={() => handleSort('timestamp')}
                    >
                      시간 {renderSortIcon('timestamp')}
                    </th>
                    <th
                      className="error-logs-page__th-level error-logs-page__th--sortable"
                      onClick={() => handleSort('level')}
                    >
                      레벨 {renderSortIcon('level')}
                    </th>
                    <th
                      className="error-logs-page__th-source error-logs-page__th--sortable"
                      onClick={() => handleSort('source')}
                    >
                      소스 {renderSortIcon('source')}
                    </th>
                    <th
                      className="error-logs-page__th-severity error-logs-page__th--sortable"
                      onClick={() => handleSort('severity')}
                    >
                      심각도 {renderSortIcon('severity')}
                    </th>
                    <th
                      className="error-logs-page__th-type error-logs-page__th--sortable"
                      onClick={() => handleSort('type')}
                    >
                      타입 {renderSortIcon('type')}
                    </th>
                    <th
                      className="error-logs-page__th-message error-logs-page__th--sortable"
                      onClick={() => handleSort('message')}
                    >
                      메시지 {renderSortIcon('message')}
                    </th>
                    <th
                      className="error-logs-page__th-user error-logs-page__th--sortable"
                      onClick={() => handleSort('user')}
                    >
                      사용자 {renderSortIcon('user')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isNewLog = filteredNewLogs.some((nl) => nl._id === log._id);
                    return (
                    <tr
                      key={log._id}
                      className={`error-logs-page__row ${selectedIds.has(log._id) ? 'error-logs-page__row--selected' : ''} ${isNewLog ? 'error-logs-page__row--new' : ''}`}
                      onClick={() => setDetailLog(log)}
                    >
                      {isDeleteMode && (
                        <td
                          className="error-logs-page__cell-check"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label="로그 선택"
                            checked={selectedIds.has(log._id)}
                            onChange={() => handleSelect(log._id)}
                          />
                        </td>
                      )}
                      <td className="error-logs-page__cell-time">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="error-logs-page__cell-level">
                        {log.logType === 'activity' ? (
                          <span className="level-badge level-badge--activity">활동</span>
                        ) : (
                          <span className={`level-badge level-badge--${log.level || 'error'}`}>
                            {LEVEL_LABELS[log.level] || log.level || 'error'}
                          </span>
                        )}
                      </td>
                      <td className="error-logs-page__cell-source">
                        <span className={`source-badge source-badge--${log.source?.type || 'unknown'}`}>
                          {log.source?.component || SOURCE_LABELS[log.source?.type || ''] || log.source?.type || '-'}
                        </span>
                      </td>
                      <td className="error-logs-page__cell-severity">
                        {log.error?.severity ? (
                          <span className={`severity-badge severity-badge--${log.error.severity}`}>
                            {SEVERITY_LABELS[log.error.severity] || log.error.severity}
                          </span>
                        ) : (
                          <span className="severity-badge severity-badge--low">-</span>
                        )}
                      </td>
                      <td className="error-logs-page__cell-type">
                        {log.error?.type || log.activity?.action_type || '-'}
                      </td>
                      <td className="error-logs-page__cell-message">
                        {log.message || log.error?.message || '-'}
                      </td>
                      <td
                        className="error-logs-page__cell-user"
                        title={log.actor?.user_id ? `${log.actor.user_id} (우클릭하여 복사)` : undefined}
                        onContextMenu={(e) => {
                          if (log.actor?.user_id) {
                            e.preventDefault();
                            navigator.clipboard.writeText(log.actor.user_id);
                          }
                        }}
                      >
                        {log.actor?.name || (log.actor?.user_id ? log.actor.user_id.slice(0, 8) + '...' : '-')}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="error-logs-page__pagination">
                <select
                  className="error-logs-page__limit-select"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="페이지당 항목 수"
                >
                  {LIMIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <button
                  className="error-logs-page__pagination-button"
                  onClick={() => handlePageChange(1)}
                  disabled={page === 1}
                >
                  «
                </button>
                <button
                  className="error-logs-page__pagination-button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                >
                  ‹
                </button>

                <span className="error-logs-page__pagination-info">
                  {page} / {pagination.totalPages} (총 {pagination.total}개)
                </span>

                <button
                  className="error-logs-page__pagination-button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === pagination.totalPages}
                >
                  ›
                </button>
                <button
                  className="error-logs-page__pagination-button"
                  onClick={() => handlePageChange(pagination.totalPages)}
                  disabled={page === pagination.totalPages}
                >
                  »
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailLog && (
        <div className="error-logs-page__modal-overlay">
          <div className="error-logs-page__modal">
            <div className="error-logs-page__modal-header">
              <h2>에러 상세</h2>
              <button className="error-logs-page__modal-close" onClick={() => setDetailLog(null)}>
                ×
              </button>
            </div>
            <div className="error-logs-page__modal-content">
              {/* 기본 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">기본 정보</h3>
                <div className="error-logs-detail__grid">
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">시간</span>
                    <span className="error-logs-detail__value">
                      {formatDateTime(detailLog.timestamp)}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">소스</span>
                    <span className="error-logs-detail__value">
                      {detailLog.source?.type ? (SOURCE_LABELS[detailLog.source.type] || detailLog.source.type) : '-'}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">심각도</span>
                    <span className={`severity-badge severity-badge--${detailLog.error?.severity || 'low'}`}>
                      {detailLog.error?.severity ? (SEVERITY_LABELS[detailLog.error.severity] || detailLog.error.severity) : '-'}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">카테고리</span>
                    <span className="error-logs-detail__value">
                      {detailLog.error?.category ? (CATEGORY_LABELS[detailLog.error.category] || detailLog.error.category) : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 로그 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">
                  {detailLog.logType === 'activity' ? '활동 정보' : '에러 정보'}
                </h3>
                {detailLog.logType === 'activity' ? (
                  <>
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">액션</span>
                      <span className="error-logs-detail__value">
                        {detailLog.activity?.action_type || '-'}
                      </span>
                    </div>
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">카테고리</span>
                      <span className="error-logs-detail__value">
                        {detailLog.activity?.category || '-'}
                      </span>
                    </div>
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">메시지</span>
                      <span className="error-logs-detail__value">
                        {detailLog.message || '-'}
                      </span>
                    </div>
                    {detailLog.activity?.success !== undefined && (
                      <div className="error-logs-detail__item">
                        <span className="error-logs-detail__label">결과</span>
                        <span className="error-logs-detail__value">
                          {detailLog.activity.success ? '성공' : '실패'}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">타입</span>
                      <span className="error-logs-detail__value">{detailLog.error?.type || '-'}</span>
                    </div>
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">메시지</span>
                      <span className="error-logs-detail__value error-logs-detail__value--message">
                        {detailLog.error?.message || detailLog.message || '-'}
                      </span>
                    </div>
                    {detailLog.error?.stack && (
                      <div className="error-logs-detail__item">
                        <span className="error-logs-detail__label">스택 트레이스</span>
                        <pre className="error-logs-detail__stack">{detailLog.error.stack}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 소스 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">소스 정보</h3>
                <div className="error-logs-detail__grid">
                  {detailLog.source?.url && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">URL</span>
                      <span className="error-logs-detail__value">{detailLog.source.url}</span>
                    </div>
                  )}
                  {detailLog.source?.endpoint && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">엔드포인트</span>
                      <span className="error-logs-detail__value">
                        {detailLog.source.method} {detailLog.source.endpoint}
                      </span>
                    </div>
                  )}
                  {detailLog.source?.component && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">컴포넌트</span>
                      <span className="error-logs-detail__value">{detailLog.source.component}</span>
                    </div>
                  )}
                  {detailLog.source?.file && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">파일</span>
                      <span className="error-logs-detail__value">
                        {detailLog.source.file}
                        {detailLog.source.line && `:${detailLog.source.line}`}
                        {detailLog.source.column && `:${detailLog.source.column}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 사용자 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">사용자 정보</h3>
                <div className="error-logs-detail__grid">
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">사용자 ID</span>
                    <span className="error-logs-detail__value">
                      {detailLog.actor?.user_id || '-'}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">이름</span>
                    <span className="error-logs-detail__value">{detailLog.actor?.name || '-'}</span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">IP</span>
                    <span className="error-logs-detail__value">
                      {detailLog.actor?.ip_address || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 컨텍스트 */}
              {detailLog.context && (
                <div className="error-logs-detail__section">
                  <h3 className="error-logs-detail__section-title">컨텍스트</h3>
                  <div className="error-logs-detail__grid">
                    {detailLog.context.browser && (
                      <div className="error-logs-detail__item">
                        <span className="error-logs-detail__label">브라우저</span>
                        <span className="error-logs-detail__value error-logs-detail__value--small">
                          {detailLog.context.browser}
                        </span>
                      </div>
                    )}
                    {detailLog.context.version && (
                      <div className="error-logs-detail__item">
                        <span className="error-logs-detail__label">앱 버전</span>
                        <span className="error-logs-detail__value">
                          {detailLog.context.version}
                        </span>
                      </div>
                    )}
                    {detailLog.context.response_status && (
                      <div className="error-logs-detail__item">
                        <span className="error-logs-detail__label">응답 상태</span>
                        <span className="error-logs-detail__value">
                          {detailLog.context.response_status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 보존 기간 변경 확인 모달 */}
      <ConfirmModal
        isOpen={confirmModal.type === 'retention'}
        onClose={() => setConfirmModal({ type: null })}
        onConfirm={confirmRetentionChange}
        title="자동 삭제 기간 변경"
        variant="warning"
        confirmText="변경"
        message={
          <>
            <div className="confirm-modal__row">
              <span className="confirm-modal__label">현재:</span>{' '}
              <strong>{confirmModal.data?.currentLabel}</strong> 후 삭제
            </div>
            <div className="confirm-modal__row--last">
              <span className="confirm-modal__label">변경:</span>{' '}
              <strong className="confirm-modal__value--primary">{confirmModal.data?.label}</strong> 후 삭제
            </div>
            <div className="confirm-modal__hint confirm-modal__hint--warning">
              변경 시 새 기간보다 오래된 로그는 즉시 삭제됩니다.
            </div>
          </>
        }
      />

      {/* 전체 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={confirmModal.type === 'deleteAll'}
        onClose={() => setConfirmModal({ type: null })}
        onConfirm={confirmDeleteAll}
        title="전체 로그 삭제"
        variant="danger"
        confirmText="전체 삭제"
        confirmInput="삭제"
        isLoading={deleteAllMutation.isPending}
        message={
          <>
            <div className="confirm-modal__row">
              총 <strong className="confirm-modal__value--danger">{stats?.total || 0}개</strong>의 로그를 삭제합니다.
            </div>
            <div className="confirm-modal__hint confirm-modal__hint--danger">
              이 작업은 되돌릴 수 없습니다.
            </div>
          </>
        }
      />

      {/* 선택 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={confirmModal.type === 'deleteSelected'}
        onClose={() => setConfirmModal({ type: null })}
        onConfirm={confirmDeleteSelected}
        title="선택 로그 삭제"
        variant="danger"
        confirmText="삭제"
        isLoading={deleteMutation.isPending}
        message={
          <>
            선택한 <strong className="confirm-modal__value--danger">{selectedIds.size}개</strong>의 로그를 삭제하시겠습니까?
          </>
        }
      />
    </div>
  );
};
