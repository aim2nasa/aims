import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/features/users/api';
import { Table } from '@/shared/ui/Table/Table';
import { Button } from '@/shared/ui/Button/Button';
import type { User } from '@/features/auth/types';
import './UsersPage.css';

const TIER_OPTIONS = [
  { value: 'free_trial', label: '무료체험' },
  { value: 'standard', label: '일반' },
  { value: 'premium', label: '프리미엄' },
  { value: 'vip', label: 'VIP' },
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  agent: '설계사',
  user: '일반',
  system: '시스템',
};

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '무제한';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

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
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [ocrFilter, setOcrFilter] = useState<string>('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'users', page, search, roleFilter, ocrFilter],
    queryFn: () =>
      usersApi.getUsers({
        page,
        limit: 50,
        search: search || undefined,
        role: roleFilter || undefined,
        hasOcrPermission: ocrFilter === '' ? undefined : ocrFilter === 'true',
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

  const updateOcrMutation = useMutation({
    mutationFn: ({ userId, hasOcrPermission }: { userId: string; hasOcrPermission: boolean }) =>
      usersApi.updateOcrPermission(userId, hasOcrPermission),
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
      console.error('OCR 권한 변경 실패:', error);
      alert('OCR 권한 변경에 실패했습니다.');
    },
  });

  const handleTierChange = (userId: string, newTier: string) => {
    updateTierMutation.mutate({ userId, tier: newTier });
  };

  const handleOcrToggle = (userId: string, currentPermission: boolean) => {
    updateOcrMutation.mutate({ userId, hasOcrPermission: !currentPermission });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const users = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="users-page">
      <h1 className="users-page__title">사용자 관리</h1>

      {/* Filters */}
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
        <select
          className="users-page__select"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          aria-label="역할 필터"
        >
          <option value="">전체 역할</option>
          <option value="admin">관리자</option>
          <option value="agent">설계사</option>
          <option value="user">일반</option>
          <option value="system">시스템</option>
        </select>
        <select
          className="users-page__select"
          value={ocrFilter}
          onChange={(e) => {
            setOcrFilter(e.target.value);
            setPage(1);
          }}
          aria-label="OCR 권한 필터"
        >
          <option value="">전체 OCR 권한</option>
          <option value="true">권한 있음</option>
          <option value="false">권한 없음</option>
        </select>
      </div>

      {/* Table */}
      {users.length === 0 ? (
        <div className="users-page__empty">검색 결과가 없습니다.</div>
      ) : (
        <>
          <Table
            columns={[
              {
                key: 'name',
                label: '이름',
                render: (user: User) => user.name || '-',
              },
              {
                key: 'email',
                label: '이메일',
                render: (user: User) => user.email || '-',
              },
              {
                key: 'role',
                label: '역할',
                render: (user: User) => (
                  <span className={`badge badge--${user.role}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                ),
              },
              {
                key: 'hasOcrPermission',
                label: 'OCR 권한',
                render: (user: User) => {
                  const isUpdating = updatingUserId === user._id;
                  return (
                    <button
                      type="button"
                      className={`ocr-toggle ${user.hasOcrPermission ? 'ocr-toggle--enabled' : 'ocr-toggle--disabled'} ${isUpdating ? 'ocr-toggle--updating' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isUpdating) {
                          handleOcrToggle(user._id, user.hasOcrPermission);
                        }
                      }}
                      disabled={isUpdating}
                      title={user.hasOcrPermission ? 'OCR 권한 해제' : 'OCR 권한 부여'}
                    >
                      <span className="ocr-toggle__indicator" />
                      <span className="ocr-toggle__label">
                        {isUpdating ? '변경중...' : user.hasOcrPermission ? '있음' : '없음'}
                      </span>
                    </button>
                  );
                },
              },
              {
                key: 'storage',
                label: '스토리지',
                render: (user: User) => {
                  if (!user.storage) return '-';
                  const { used_bytes, quota_bytes, usage_percent, tier } = user.storage;
                  const isUnlimited = quota_bytes < 0;
                  const isAdmin = tier === 'admin';
                  const warningClass = usage_percent >= 95 ? 'storage--danger' :
                    usage_percent >= 80 ? 'storage--warning' : '';
                  const isUpdating = updatingUserId === user._id;
                  return (
                    <div className={`storage-cell ${warningClass}`}>
                      <span className="storage-cell__usage">
                        {formatBytes(used_bytes)}
                        {!isUnlimited && ` / ${formatBytes(quota_bytes)}`}
                      </span>
                      {isAdmin ? (
                        <span className={`tier-badge tier-badge--${tier}`}>
                          {TIER_LABELS[tier] || tier}
                        </span>
                      ) : (
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
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'createdAt',
                label: '가입일',
                render: (user: User) => formatDate((user as any).createdAt),
              },
              {
                key: 'lastLogin',
                label: '최근 로그인',
                render: (user: User) => formatDate((user as any).lastLogin),
              },
            ]}
            data={users}
            onRowClick={(user) => console.log('사용자 상세 (Phase 2 구현 예정):', user)}
          />

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="users-page__pagination">
              <button
                type="button"
                className="users-page__pagination-button"
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
                    className={`users-page__pagination-button ${
                      page === pageNum ? 'users-page__pagination-button--active' : ''
                    }`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                className="users-page__pagination-button"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === pagination.totalPages}
              >
                다음
              </button>

              <span className="users-page__pagination-info">
                전체 {pagination.total}명 (페이지 {page}/{pagination.totalPages})
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
