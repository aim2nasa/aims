/**
 * User Activity Page
 * 사용자 활동 현황 페이지 - 컴팩트 테이블 레이아웃
 * @since 2025-12-14
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  userActivityApi,
  formatBytes,
  formatTokens,
  formatCredits,
  formatRelativeTime,
  type UserActivitySummary,
  type AISourceUsage,
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

// AI 소스 라벨 및 색상 (AIUsagePage와 동일한 키/색상 사용)
const AI_SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  chat: { label: '채팅', color: '#AF52DE' },           // Purple
  doc_embedding: { label: '임베딩', color: '#FF9500' }, // Orange
  rag_api: { label: 'RAG', color: '#007AFF' },         // Blue
  n8n_docsummary: { label: '요약', color: '#34C759' }, // Green
  unknown: { label: '기타', color: '#8E8E93' },
};

const SORT_OPTIONS = [
  { value: 'last_activity_at', label: '최근 활동순' },
  { value: 'credits_used', label: '크레딧 사용순' },
  { value: 'credit_usage_percent', label: '크레딧 사용률순' },
  { value: 'ai_tokens_30d', label: 'AI 사용량순' },
  { value: 'ocr_pages_30d', label: 'OCR 페이지순' },
  { value: 'error_count_7d', label: '오류 많은순' },
  { value: 'name', label: '이름순' },
];

const LIMIT_OPTIONS = [
  { value: 20, label: '20개씩' },
  { value: 50, label: '50개씩' },
  { value: 100, label: '100개씩' },
];

// 인라인 진행바 컴포넌트
const UsageBar = ({
  used,
  quota,
  percent,
  formatValue = (v: number) => v.toString(),
}: {
  used: number;
  quota: number;
  percent: number;
  formatValue?: (v: number) => string;
}) => {
  const level = percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : 'normal';
  const hasQuota = quota > 0;
  const isOverflow = percent > 100;

  // 사용량이 0이면 간단히 "-" 표시
  if (used === 0 && hasQuota) {
    return (
      <div className="usage-cell">
        <span className="usage-cell__empty">-</span>
      </div>
    );
  }

  return (
    <div className="usage-cell">
      {hasQuota && (
        <div className={`usage-bar-inline ${isOverflow ? 'usage-bar-inline--overflow' : ''}`}>
          <div
            className={`usage-bar-inline__fill usage-bar-inline__fill--${level}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      )}
      <span className={`usage-cell__text usage-cell__text--${level}`}>
        {hasQuota ? `${percent}%` : '∞'}
        {isOverflow && <span className="usage-cell__overflow-icon">!</span>}
      </span>
      <span className="usage-cell__values">
        ({formatValue(used)}{hasQuota ? `/${formatValue(quota)}` : ''})
      </span>
    </div>
  );
};

// AI 소스 스택바 컴포넌트
const AISourceStackBar = ({
  sources,
  totalTokens
}: {
  sources: Record<string, AISourceUsage>;
  totalTokens: number;
}) => {
  if (totalTokens === 0 || Object.keys(sources).length === 0) {
    return <span className="ai-stack__empty">-</span>;
  }

  // 소스별 비율 계산 및 정렬 (많은 순)
  const sortedSources = Object.entries(sources)
    .map(([key, data]) => ({
      key,
      tokens: data.tokens,
      percent: Math.round((data.tokens / totalTokens) * 100),
      config: AI_SOURCE_CONFIG[key] || AI_SOURCE_CONFIG.unknown,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const topSource = sortedSources[0];

  return (
    <div className="ai-stack">
      <div className="ai-stack__bar">
        {sortedSources.map(({ key, percent, config }) => (
          <div
            key={key}
            className="ai-stack__segment"
            style={{
              width: `${percent}%`,
              backgroundColor: config.color,
            }}
            title={`${config.label}: ${percent}%`}
          />
        ))}
      </div>
      <span className="ai-stack__label">
        <span
          className="ai-stack__dot"
          style={{ backgroundColor: topSource.config.color }}
        />
        {topSource.config.label} {topSource.percent}%
      </span>
      <span className="ai-stack__total">{formatTokens(totalTokens)}</span>
    </div>
  );
};

export const UserActivityPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [sortBy, setSortBy] = useState('last_activity_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // 검색어 debounce (300ms)
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'user-activity', 'list', page, limit, debouncedSearch, tierFilter, sortBy, sortOrder],
    queryFn: () =>
      userActivityApi.getList({
        page,
        limit,
        search: debouncedSearch || undefined,
        tier: tierFilter || undefined,
        sortBy,
        sortOrder,
      }),
    refetchInterval: 60000,
  });

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
            <option key={opt.value} value={opt.value}>{opt.label}</option>
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
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="user-activity-page__sort-order"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Content */}
      <div className="user-activity-page__content">
        <div className="user-activity-page__main">
          {users.length === 0 ? (
            <div className="user-activity-page__empty">검색 결과가 없습니다.</div>
          ) : (
            <>
              {/* 테이블 */}
              <div className="user-table-wrapper">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th className="user-table__th user-table__th--user">사용자</th>
                      <th className="user-table__th user-table__th--tier">등급</th>
                      <th className="user-table__th user-table__th--credit">크레딧</th>
                      <th className="user-table__th user-table__th--ai">
                        <span>AI 사용량 (30일)</span>
                        <div className="ai-legend">
                          <span className="ai-legend__item" title="채팅">
                            <span className="ai-legend__dot ai-legend__dot--chat" />
                            <span className="ai-legend__text">채팅</span>
                          </span>
                          <span className="ai-legend__item" title="임베딩">
                            <span className="ai-legend__dot ai-legend__dot--embed" />
                            <span className="ai-legend__text">임베딩</span>
                          </span>
                          <span className="ai-legend__item" title="RAG">
                            <span className="ai-legend__dot ai-legend__dot--rag" />
                            <span className="ai-legend__text">RAG</span>
                          </span>
                          <span className="ai-legend__item" title="요약">
                            <span className="ai-legend__dot ai-legend__dot--summary" />
                            <span className="ai-legend__text">요약</span>
                          </span>
                        </div>
                      </th>
                      <th className="user-table__th user-table__th--ocr">OCR</th>
                      <th className="user-table__th user-table__th--storage">스토리지</th>
                      <th className="user-table__th user-table__th--activity">최근활동</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelected = selectedUserId === user.user_id;
                      const hasErrors = user.error_count_7d > 0;
                      const storagePercent = user.storage_quota_bytes > 0
                        ? Math.round((user.storage_used_bytes / user.storage_quota_bytes) * 100)
                        : 0;

                      return (
                        <tr
                          key={user.user_id}
                          className={`user-table__row ${isSelected ? 'user-table__row--selected' : ''} ${user.any_limit_exceeded ? 'user-table__row--exceeded' : ''} ${hasErrors ? 'user-table__row--has-errors' : ''}`}
                          onClick={() => handleRowClick(user)}
                        >
                          {/* 사용자 */}
                          <td className="user-table__td user-table__td--user">
                            <div className="user-cell">
                              {user.any_limit_exceeded && <span className="user-cell__warning">⚠</span>}
                              <div className="user-cell__info">
                                <span className="user-cell__name">{user.name}</span>
                                <span className="user-cell__email">{user.email}</span>
                              </div>
                              {hasErrors && (
                                <span className="user-cell__error">오류 {user.error_count_7d}</span>
                              )}
                            </div>
                          </td>

                          {/* 등급 */}
                          <td className="user-table__td user-table__td--tier">
                            <span className={`tier-badge tier-badge--${user.tier}`}>
                              {TIER_LABELS[user.tier] || user.tier}
                            </span>
                          </td>

                          {/* 크레딧 */}
                          <td className="user-table__td user-table__td--credit">
                            <UsageBar
                              used={user.credits_used}
                              quota={user.credit_quota}
                              percent={user.credit_usage_percent}
                              formatValue={formatCredits}
                            />
                          </td>

                          {/* AI 사용량 */}
                          <td className="user-table__td user-table__td--ai">
                            <AISourceStackBar
                              sources={user.ai_by_source || {}}
                              totalTokens={user.ai_tokens_30d}
                            />
                          </td>

                          {/* OCR */}
                          <td className="user-table__td user-table__td--ocr">
                            <UsageBar
                              used={user.ocr_pages_30d}
                              quota={user.ocr_page_quota}
                              percent={user.ocr_usage_percent}
                              formatValue={(v) => `${v}p`}
                            />
                          </td>

                          {/* 스토리지 */}
                          <td className="user-table__td user-table__td--storage">
                            <UsageBar
                              used={user.storage_used_bytes}
                              quota={user.storage_quota_bytes}
                              percent={storagePercent}
                              formatValue={formatBytes}
                            />
                          </td>

                          {/* 최근활동 */}
                          <td className="user-table__td user-table__td--activity">
                            {formatRelativeTime(user.last_activity_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="user-activity-page__pagination">
                <select
                  className="user-activity-page__limit-select"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="페이지당 항목 수"
                >
                  {LIMIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                {pagination && pagination.totalPages > 1 && (
                  <>
                    <button
                      type="button"
                      className="user-activity-page__pagination-button"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      이전
                    </button>

                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
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
                  </>
                )}

                {pagination && (
                  <span className="user-activity-page__pagination-info">
                    전체 {pagination.total}명
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Detail Panel */}
        {selectedUserId && (
          <UserDetailPanel
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
          />
        )}
      </div>
    </div>
  );
};
