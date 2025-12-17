import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { usersApi } from '@/features/users/api';
import { Button } from '@/shared/ui/Button/Button';
import type { User } from '@/features/auth/types';
import './UsersPage.css';

const TIER_OPTIONS = [
  { value: 'free_trial', label: '무료체험' },
  { value: 'standard', label: '일반' },
  { value: 'premium', label: '프리미엄' },
  { value: 'vip', label: 'VIP' },
] as const;

type SortKey = 'name' | 'email' | 'tier' | 'createdAt' | 'lastLogin';
type SortOrder = 'asc' | 'desc';

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\. /g, '.').replace(/:/g, ':');
};

export const UsersPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const limit = 10;

  // 검색어 debounce (300ms)
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'users', page, debouncedSearch],
    queryFn: () =>
      usersApi.getUsers({
        page,
        limit,
        search: debouncedSearch || undefined,
        // role 필터 제거 - 모든 사용자 조회 (admin, agent, user 포함)
      }),
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: string }) =>
      usersApi.updateUserTier(userId, tier),
    onMutate: ({ userId }) => {
      setUpdatingUserId(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onSettled: () => {
      setUpdatingUserId(null);
    },
    onError: (error) => {
      console.error('티어 변경 실패:', error);
      alert('티어 변경에 실패했습니다.');
    },
  });

  const handleTierChange = (userId: string, newTier: string) => {
    updateTierMutation.mutate({ userId, tier: newTier });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // 정렬된 사용자 목록
  const sortedUsers = useMemo(() => {
    const users = data?.users || [];
    return [...users].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortKey) {
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          break;
        case 'tier':
          aVal = a.storage?.tier || 'free_trial';
          bVal = b.storage?.tier || 'free_trial';
          break;
        case 'createdAt':
          aVal = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
          bVal = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
          break;
        case 'lastLogin':
          aVal = (a as any).lastLogin ? new Date((a as any).lastLogin).getTime() : 0;
          bVal = (b as any).lastLogin ? new Date((b as any).lastLogin).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data?.users, sortKey, sortOrder]);

  const pagination = data?.pagination;

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span className="sort-icon sort-icon--inactive">⇅</span>;
    }
    return (
      <span className="sort-icon sort-icon--active">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  if (isLoading) {
    return <div className="users-page__loading">사용자 목록을 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="users-page__error">
        <p>사용자 목록을 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="users-page">
      <div className="users-page__header">
        <h1 className="users-page__title">사용자 관리</h1>
        {pagination && (
          <span className="users-page__count">
            {debouncedSearch
              ? `검색 결과 ${pagination.total}명`
              : `전체 ${pagination.total}명`}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="users-page__filters">
        <input
          type="text"
          className="users-page__search"
          placeholder="이름 또는 이메일 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Table Container */}
      <div className="users-page__table-container">
        {sortedUsers.length === 0 ? (
          <div className="users-page__empty">검색 결과가 없습니다.</div>
        ) : (
          <table className="users-table">
            <thead className="users-table__head">
              <tr>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('name')}>
                  이름 <SortIcon columnKey="name" />
                </th>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('email')}>
                  이메일 <SortIcon columnKey="email" />
                </th>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('tier')}>
                  등급 <SortIcon columnKey="tier" />
                </th>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('createdAt')}>
                  가입일 <SortIcon columnKey="createdAt" />
                </th>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('lastLogin')}>
                  최근 로그인 <SortIcon columnKey="lastLogin" />
                </th>
              </tr>
            </thead>
            <tbody className="users-table__body">
              {sortedUsers.map((user) => {
                const isUpdating = updatingUserId === user._id;
                const tier = user.storage?.tier || 'free_trial';

                return (
                  <tr key={user._id} className="users-table__row">
                    <td className="users-table__td">{user.name || '-'}</td>
                    <td className="users-table__td">{user.email || '-'}</td>
                    <td className="users-table__td">
                      <select
                        className={`tier-select tier-select--${tier}`}
                        value={tier}
                        onChange={(e) => handleTierChange(user._id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={isUpdating}
                        aria-label="등급 변경"
                      >
                        {TIER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="users-table__td">{formatDate((user as any).createdAt)}</td>
                    <td className="users-table__td">{formatDate((user as any).lastLogin)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="users-page__pagination">
          <button
            type="button"
            className="users-page__pagination-button"
            onClick={() => handlePageChange(1)}
            disabled={page === 1}
          >
            «
          </button>
          <button
            type="button"
            className="users-page__pagination-button"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            ‹
          </button>

          {(() => {
            const pages: number[] = [];
            const maxVisible = 5;
            let start = Math.max(1, page - Math.floor(maxVisible / 2));
            let end = Math.min(pagination.totalPages, start + maxVisible - 1);

            if (end - start + 1 < maxVisible) {
              start = Math.max(1, end - maxVisible + 1);
            }

            for (let i = start; i <= end; i++) {
              pages.push(i);
            }

            return pages.map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                className={`users-page__pagination-button ${
                  page === pageNum ? 'users-page__pagination-button--active' : ''
                }`}
                onClick={() => handlePageChange(pageNum)}
              >
                {pageNum}
              </button>
            ));
          })()}

          <button
            type="button"
            className="users-page__pagination-button"
            onClick={() => handlePageChange(page + 1)}
            disabled={page === pagination.totalPages}
          >
            ›
          </button>
          <button
            type="button"
            className="users-page__pagination-button"
            onClick={() => handlePageChange(pagination.totalPages)}
            disabled={page === pagination.totalPages}
          >
            »
          </button>

          <span className="users-page__pagination-info">
            페이지 {page}/{pagination.totalPages}
          </span>
        </div>
      )}
    </div>
  );
};
