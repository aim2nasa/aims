/**
 * User Activity Page
 * 사용자 활동 현황 페이지
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

// AI 소스 라벨
const AI_SOURCE_LABELS: Record<string, string> = {
  chat: '채팅',
  embed: '임베딩',
  rag: 'RAG',
  summary: '요약',
  unknown: '기타',
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
  { value: 10, label: '10개씩' },
  { value: 20, label: '20개씩' },
  { value: 50, label: '50개씩' },
];

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

  // 사용량 비율 계산 (프로그레스바용)
  const getUsageLevel = (percent: number): 'normal' | 'warning' | 'danger' => {
    if (percent >= 100) return 'danger';
    if (percent >= 80) return 'warning';
    return 'normal';
  };

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
              {/* 카드 리스트 */}
              <div className="user-card-list">
                {users.map((user) => {
                  const isSelected = selectedUserId === user.user_id;
                  const hasErrors = user.error_count_7d > 0;
                  const creditLevel = getUsageLevel(user.credit_usage_percent);
                  const ocrLevel = getUsageLevel(user.ocr_usage_percent);
                  const storagePercent = user.storage_quota_bytes > 0
                    ? Math.round((user.storage_used_bytes / user.storage_quota_bytes) * 100)
                    : 0;
                  const storageLevel = getUsageLevel(storagePercent);

                  // AI 소스별 데이터
                  const aiSources = user.ai_by_source || {};
                  const hasAiUsage = Object.keys(aiSources).length > 0;

                  return (
                    <div
                      key={user.user_id}
                      className={`user-card ${isSelected ? 'user-card--selected' : ''} ${user.any_limit_exceeded ? 'user-card--exceeded' : ''} ${hasErrors ? 'user-card--has-errors' : ''}`}
                      onClick={() => handleRowClick(user)}
                    >
                      {/* 헤더: 이름 + 등급 */}
                      <div className="user-card__header">
                        <div className="user-card__info">
                          <span className="user-card__name">
                            {user.any_limit_exceeded && <span className="user-card__warning-icon">⚠</span>}
                            {user.name}
                          </span>
                          <span className="user-card__email">{user.email}</span>
                        </div>
                        <div className="user-card__badges">
                          <span className={`tier-badge tier-badge--${user.tier}`}>
                            {TIER_LABELS[user.tier] || user.tier}
                          </span>
                          {hasErrors && (
                            <span className="error-badge">오류 {user.error_count_7d}</span>
                          )}
                        </div>
                      </div>

                      {/* 크레딧 사용량 */}
                      <div className="user-card__section">
                        <div className="user-card__section-header">
                          <span className="user-card__section-label">크레딧</span>
                          <span className={`user-card__section-value user-card__section-value--${creditLevel}`}>
                            {formatCredits(user.credits_used)} / {user.credit_quota > 0 ? formatCredits(user.credit_quota) : '∞'}
                            {user.credit_quota > 0 && <span className="usage-percent">({user.credit_usage_percent}%)</span>}
                          </span>
                        </div>
                        {user.credit_quota > 0 && (
                          <div className="usage-bar">
                            <div
                              className={`usage-bar__fill usage-bar__fill--${creditLevel}`}
                              style={{ width: `${Math.min(100, user.credit_usage_percent)}%` }}
                            />
                          </div>
                        )}
                        <div className="user-card__credit-breakdown">
                          <span>AI: {formatCredits(user.credits_ai)}</span>
                          <span>OCR: {formatCredits(user.credits_ocr)}</span>
                        </div>
                      </div>

                      {/* AI 소스별 사용량 */}
                      <div className="user-card__section user-card__section--ai">
                        <div className="user-card__section-header">
                          <span className="user-card__section-label">AI 사용량 (30일)</span>
                          <span className="user-card__section-value">
                            {formatTokens(user.ai_tokens_30d)} 토큰
                          </span>
                        </div>
                        {hasAiUsage ? (
                          <div className="ai-source-grid">
                            {Object.entries(aiSources).map(([source, data]) => (
                              <div key={source} className="ai-source-item">
                                <span className="ai-source-item__label">{AI_SOURCE_LABELS[source] || source}</span>
                                <span className="ai-source-item__value">{formatTokens(data.tokens)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="user-card__no-data">사용 없음</div>
                        )}
                      </div>

                      {/* OCR + 스토리지 */}
                      <div className="user-card__row">
                        <div className="user-card__mini-section">
                          <span className="user-card__mini-label">OCR</span>
                          <span className={`user-card__mini-value user-card__mini-value--${ocrLevel}`}>
                            {user.ocr_pages_30d}페이지
                            {user.ocr_page_quota > 0 && ` / ${user.ocr_page_quota}`}
                          </span>
                        </div>
                        <div className="user-card__mini-section">
                          <span className="user-card__mini-label">스토리지</span>
                          <span className={`user-card__mini-value user-card__mini-value--${storageLevel}`}>
                            {formatBytes(user.storage_used_bytes)}
                            {user.storage_quota_bytes > 0 && ` / ${formatBytes(user.storage_quota_bytes)}`}
                          </span>
                        </div>
                        <div className="user-card__mini-section">
                          <span className="user-card__mini-label">최근활동</span>
                          <span className="user-card__mini-value">
                            {formatRelativeTime(user.last_activity_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
