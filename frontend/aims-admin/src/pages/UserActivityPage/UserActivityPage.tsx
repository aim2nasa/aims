/**
 * User Activity Page
 * 사용자 활동 현황 페이지
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  userActivityApi,
  formatBytes,
  formatTokens,
  formatRelativeTime,
  type UserActivitySummary,
} from '@/features/users/userActivityApi';
import { Button } from '@/shared/ui/Button/Button';
import { UserDetailPanel } from './UserDetailPanel';
import './UserActivityPage.css';

const TIER_OPTIONS = [
  { value: '', label: '전체 등급' },
  { value: 'free_trial', label: '무료체험' },
  { value: 'standard', label: '일반' },
  { value: 'premium', label: '프리미엄' },
  { value: 'vip', label: 'VIP' },
];

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
};

const SORT_OPTIONS = [
  { value: 'last_activity_at', label: '최근 활동순' },
  { value: 'error_count_7d', label: '오류 많은순' },
  { value: 'document_count', label: '문서 많은순' },
  { value: 'customer_count', label: '고객 많은순' },
  { value: 'ai_tokens_30d', label: 'AI 사용량순' },
  { value: 'ocr_count_30d', label: 'OCR 사용량순' },
  { value: 'storage_used_bytes', label: '스토리지순' },
  { value: 'tier', label: '등급순' },
  { value: 'name', label: '이름순' },
];

export const UserActivityPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortBy, setSortBy] = useState('last_activity_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'user-activity', 'list', page, search, tierFilter, sortBy, sortOrder],
    queryFn: () =>
      userActivityApi.getList({
        page,
        limit: 50,
        search: search || undefined,
        tier: tierFilter || undefined,
        sortBy,
        sortOrder,
      }),
    refetchInterval: 60000, // 1분마다 갱신
  });

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  const handleRowClick = (user: UserActivitySummary) => {
    setSelectedUserId(selectedUserId === user.user_id ? null : user.user_id);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedUserId(null);
  };

  if (isLoading) {
    return <div className="user-activity-page__loading">사용자 활동 데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="user-activity-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  const users = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="user-activity-page">
      <div className="user-activity-page__header">
        <h1 className="user-activity-page__title">사용자 활동 현황</h1>
        <div className="user-activity-page__actions">
          <span className="user-activity-page__refresh-info">1분마다 자동 갱신</span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            새로고침
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="user-activity-page__filters">
        <input
          type="text"
          className="user-activity-page__search"
          placeholder="이름 또는 이메일 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="user-activity-page__select"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          aria-label="등급 필터"
        >
          {TIER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="user-activity-page__select"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
          aria-label="정렬 기준"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="user-activity-page__sort-order"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Table */}
      {users.length === 0 ? (
        <div className="user-activity-page__empty">검색 결과가 없습니다.</div>
      ) : (
        <>
          <div className="user-activity-page__table-container">
            <table className="user-activity-page__table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('name')}>
                    이름 {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('tier')}>
                    등급 {sortBy === 'tier' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('document_count')}>
                    문서 {sortBy === 'document_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('customer_count')}>
                    고객 {sortBy === 'customer_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('ai_tokens_30d')}>
                    AI {sortBy === 'ai_tokens_30d' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('ocr_count_30d')}>
                    OCR {sortBy === 'ocr_count_30d' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('storage_used_bytes')}>
                    스토리지 {sortBy === 'storage_used_bytes' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('error_count_7d')}>
                    오류 {sortBy === 'error_count_7d' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('last_activity_at')}>
                    최근활동 {sortBy === 'last_activity_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const storagePercent =
                    user.storage_quota_bytes > 0
                      ? (user.storage_used_bytes / user.storage_quota_bytes) * 100
                      : 0;
                  const storageWarning = storagePercent >= 80;
                  const hasErrors = user.error_count_7d > 0;
                  const isSelected = selectedUserId === user.user_id;

                  return (
                    <tr
                      key={user.user_id}
                      className={`user-activity-page__row ${isSelected ? 'user-activity-page__row--selected' : ''} ${hasErrors ? 'user-activity-page__row--has-errors' : ''}`}
                      onClick={() => handleRowClick(user)}
                    >
                      <td className="user-activity-page__cell-user">
                        <span className="user-activity-page__user-name">{user.name}</span>
                        <span className="user-activity-page__user-email">{user.email}</span>
                      </td>
                      <td>
                        <span className={`tier-badge tier-badge--${user.tier}`}>
                          {TIER_LABELS[user.tier] || user.tier}
                        </span>
                      </td>
                      <td className="user-activity-page__cell-number">
                        {user.document_count.toLocaleString()}
                      </td>
                      <td className="user-activity-page__cell-number">
                        {user.customer_count.toLocaleString()}
                      </td>
                      <td className="user-activity-page__cell-number">
                        {formatTokens(user.ai_tokens_30d)}
                      </td>
                      <td className="user-activity-page__cell-number">{user.ocr_count_30d}</td>
                      <td
                        className={`user-activity-page__cell-storage ${storageWarning ? 'user-activity-page__cell-storage--warning' : ''}`}
                      >
                        <span className="storage-used">{formatBytes(user.storage_used_bytes)}</span>
                        <span className="storage-quota">
                          /{' '}
                          {user.storage_quota_bytes < 0
                            ? '무제한'
                            : formatBytes(user.storage_quota_bytes)}
                        </span>
                      </td>
                      <td
                        className={`user-activity-page__cell-error ${hasErrors ? 'user-activity-page__cell-error--has-errors' : ''}`}
                      >
                        {user.error_count_7d}
                        {hasErrors && <span className="error-indicator">!</span>}
                      </td>
                      <td className="user-activity-page__cell-time">
                        {formatRelativeTime(user.last_activity_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="user-activity-page__pagination">
              <button
                type="button"
                className="user-activity-page__pagination-button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
              >
                이전
              </button>

              {Array.from({ length: Math.min(10, pagination.totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`user-activity-page__pagination-button ${page === pageNum ? 'user-activity-page__pagination-button--active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                className="user-activity-page__pagination-button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === pagination.totalPages}
              >
                다음
              </button>

              <span className="user-activity-page__pagination-info">
                전체 {pagination.total}명 (페이지 {page}/{pagination.totalPages})
              </span>
            </div>
          )}
        </>
      )}

      {/* Detail Panel */}
      {selectedUserId && (
        <UserDetailPanel
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
};
