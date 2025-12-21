/**
 * Error Logs Page
 * 시스템 에러 로그 조회/관리 페이지
 * @since 2025-12-22
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  errorLogsApi,
  formatDateTime,
  formatRelativeTime,
  SEVERITY_LABELS,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  type ErrorLog,
  type GetErrorLogsParams,
} from '@/features/error-logs/api';
import { Button } from '@/shared/ui/Button/Button';
import './ErrorLogsPage.css';

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

const LIMIT_OPTIONS = [
  { value: 20, label: '20개씩' },
  { value: 50, label: '50개씩' },
  { value: 100, label: '100개씩' },
];

export const ErrorLogsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailLog, setDetailLog] = useState<ErrorLog | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // 에러 로그 목록 조회
  const params: GetErrorLogsParams = {
    page,
    limit,
    search: debouncedSearch || undefined,
    source: sourceFilter as 'frontend' | 'backend' | undefined,
    severity: severityFilter || undefined,
    category: categoryFilter || undefined,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'error-logs', params],
    queryFn: () => errorLogsApi.getList(params),
    refetchInterval: 60000,
  });

  // 통계 조회
  const { data: stats } = useQuery({
    queryKey: ['admin', 'error-logs', 'stats'],
    queryFn: () => errorLogsApi.getStats(7),
    refetchInterval: 60000,
  });

  // 삭제 mutation
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => errorLogsApi.deleteMany(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'error-logs'] });
      setSelectedIds(new Set());
    },
  });

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
    if (confirm(`${selectedIds.size}개의 에러 로그를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
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

  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <div className="error-logs-page">
      <div className="error-logs-page__header">
        <h1 className="error-logs-page__title">에러 로그</h1>
        <div className="error-logs-page__actions">
          <span className="error-logs-page__refresh-info">1분마다 자동 갱신</span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            새로고침
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="error-logs-page__stats">
          <div className="error-logs-page__stat-card">
            <span className="error-logs-page__stat-value">{stats.total}</span>
            <span className="error-logs-page__stat-label">총 에러 (7일)</span>
          </div>
          <div className="error-logs-page__stat-card error-logs-page__stat-card--critical">
            <span className="error-logs-page__stat-value">{stats.bySeverity?.critical || 0}</span>
            <span className="error-logs-page__stat-label">Critical</span>
          </div>
          <div className="error-logs-page__stat-card error-logs-page__stat-card--high">
            <span className="error-logs-page__stat-value">{stats.bySeverity?.high || 0}</span>
            <span className="error-logs-page__stat-label">High</span>
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
      )}

      {/* Filters */}
      <div className="error-logs-page__filters">
        <input
          type="text"
          className="error-logs-page__search"
          placeholder="에러 메시지 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
        {selectedIds.size > 0 && (
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
          <div className="error-logs-page__empty">에러 로그가 없습니다.</div>
        ) : (
          <>
            <div className="error-logs-page__table-container">
              <table className="error-logs-page__table">
                <thead>
                  <tr>
                    <th className="error-logs-page__th-check">
                      <input
                        type="checkbox"
                        checked={logs.length > 0 && selectedIds.size === logs.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="error-logs-page__th-time">시간</th>
                    <th className="error-logs-page__th-source">소스</th>
                    <th className="error-logs-page__th-severity">심각도</th>
                    <th className="error-logs-page__th-type">타입</th>
                    <th className="error-logs-page__th-message">메시지</th>
                    <th className="error-logs-page__th-user">사용자</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log._id}
                      className={`error-logs-page__row ${selectedIds.has(log._id) ? 'error-logs-page__row--selected' : ''}`}
                      onClick={() => setDetailLog(log)}
                    >
                      <td
                        className="error-logs-page__cell-check"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log._id)}
                          onChange={() => handleSelect(log._id)}
                        />
                      </td>
                      <td className="error-logs-page__cell-time">
                        {formatRelativeTime(log.timestamp)}
                      </td>
                      <td className="error-logs-page__cell-source">
                        <span className={`source-badge source-badge--${log.source.type}`}>
                          {SOURCE_LABELS[log.source.type] || log.source.type}
                        </span>
                      </td>
                      <td className="error-logs-page__cell-severity">
                        <span className={`severity-badge severity-badge--${log.error.severity}`}>
                          {SEVERITY_LABELS[log.error.severity] || log.error.severity}
                        </span>
                      </td>
                      <td className="error-logs-page__cell-type">{log.error.type}</td>
                      <td className="error-logs-page__cell-message">{log.error.message}</td>
                      <td className="error-logs-page__cell-user">
                        {log.actor.name || log.actor.user_id || '-'}
                      </td>
                    </tr>
                  ))}
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
        <div className="error-logs-page__modal-overlay" onClick={() => setDetailLog(null)}>
          <div className="error-logs-page__modal" onClick={(e) => e.stopPropagation()}>
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
                      {SOURCE_LABELS[detailLog.source.type] || detailLog.source.type}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">심각도</span>
                    <span className={`severity-badge severity-badge--${detailLog.error.severity}`}>
                      {SEVERITY_LABELS[detailLog.error.severity] || detailLog.error.severity}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">카테고리</span>
                    <span className="error-logs-detail__value">
                      {CATEGORY_LABELS[detailLog.error.category] || detailLog.error.category}
                    </span>
                  </div>
                </div>
              </div>

              {/* 에러 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">에러 정보</h3>
                <div className="error-logs-detail__item">
                  <span className="error-logs-detail__label">타입</span>
                  <span className="error-logs-detail__value">{detailLog.error.type}</span>
                </div>
                <div className="error-logs-detail__item">
                  <span className="error-logs-detail__label">메시지</span>
                  <span className="error-logs-detail__value error-logs-detail__value--message">
                    {detailLog.error.message}
                  </span>
                </div>
                {detailLog.error.stack && (
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">스택 트레이스</span>
                    <pre className="error-logs-detail__stack">{detailLog.error.stack}</pre>
                  </div>
                )}
              </div>

              {/* 소스 정보 */}
              <div className="error-logs-detail__section">
                <h3 className="error-logs-detail__section-title">소스 정보</h3>
                <div className="error-logs-detail__grid">
                  {detailLog.source.url && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">URL</span>
                      <span className="error-logs-detail__value">{detailLog.source.url}</span>
                    </div>
                  )}
                  {detailLog.source.endpoint && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">엔드포인트</span>
                      <span className="error-logs-detail__value">
                        {detailLog.source.method} {detailLog.source.endpoint}
                      </span>
                    </div>
                  )}
                  {detailLog.source.component && (
                    <div className="error-logs-detail__item">
                      <span className="error-logs-detail__label">컴포넌트</span>
                      <span className="error-logs-detail__value">{detailLog.source.component}</span>
                    </div>
                  )}
                  {detailLog.source.file && (
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
                      {detailLog.actor.user_id || '-'}
                    </span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">이름</span>
                    <span className="error-logs-detail__value">{detailLog.actor.name || '-'}</span>
                  </div>
                  <div className="error-logs-detail__item">
                    <span className="error-logs-detail__label">IP</span>
                    <span className="error-logs-detail__value">
                      {detailLog.actor.ip_address || '-'}
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
    </div>
  );
};
