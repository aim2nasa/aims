import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { usersApi, type DeletePreviewResponse } from '@/features/users/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import type { User } from '@/features/auth/types';
import './UsersPage.css';

/**
 * 삭제 예정 시간까지 남은 시간 계산
 */
function getTimeRemaining(scheduledAt: string): { hours: number; minutes: number; text: string } | null {
  const scheduled = new Date(scheduledAt).getTime();
  const now = Date.now();
  const diff = scheduled - now;

  if (diff <= 0) return null;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return { hours, minutes, text: `${hours}시간 ${minutes}분 후 삭제` };
  }
  return { hours, minutes, text: `${minutes}분 후 삭제` };
}

const TIER_OPTIONS = [
  { value: 'free_trial', label: '무료체험' },
  { value: 'standard', label: '일반' },
  { value: 'premium', label: '프리미엄' },
  { value: 'vip', label: 'VIP' },
] as const;

type SortKey = 'name' | 'email' | 'tier' | 'createdAt' | 'lastLogin';
type SortOrder = 'asc' | 'desc';

const DANGER_MODE_TIMEOUT = 30000; // 30초 후 자동 해제
const INLINE_CONFIRM_TIMEOUT = 3000; // 3초 내 확인 필요

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
  const [deleteModalUser, setDeleteModalUser] = useState<User | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreviewResponse['preview'] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // [1] 관리 모드 (삭제 버튼 숨김)
  const [dangerMode, setDangerMode] = useState(false);
  const [dangerModeRemaining, setDangerModeRemaining] = useState(0);
  const dangerModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dangerModeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // [3] 2단계 클릭 - 인라인 확인
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const inlineConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // [4] 텍스트 입력 확인
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // 등급 변경 확인 모달 상태
  const [tierChangeModal, setTierChangeModal] = useState<{
    user: User;
    currentTier: string;
    newTier: string;
  } | null>(null);
  const limit = 10;

  // [1] 관리 모드 타이머 정리
  const clearDangerModeTimers = useCallback(() => {
    if (dangerModeTimerRef.current) {
      clearTimeout(dangerModeTimerRef.current);
      dangerModeTimerRef.current = null;
    }
    if (dangerModeIntervalRef.current) {
      clearInterval(dangerModeIntervalRef.current);
      dangerModeIntervalRef.current = null;
    }
  }, []);

  // [1] 관리 모드 토글
  const toggleDangerMode = useCallback(() => {
    if (dangerMode) {
      // 끄기
      setDangerMode(false);
      setDangerModeRemaining(0);
      clearDangerModeTimers();
    } else {
      // 켜기 - 30초 후 자동 해제
      setDangerMode(true);
      setDangerModeRemaining(DANGER_MODE_TIMEOUT / 1000);

      dangerModeIntervalRef.current = setInterval(() => {
        setDangerModeRemaining(prev => Math.max(0, prev - 1));
      }, 1000);

      dangerModeTimerRef.current = setTimeout(() => {
        setDangerMode(false);
        setDangerModeRemaining(0);
        clearDangerModeTimers();
      }, DANGER_MODE_TIMEOUT);
    }
  }, [dangerMode, clearDangerModeTimers]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      clearDangerModeTimers();
      if (inlineConfirmTimerRef.current) {
        clearTimeout(inlineConfirmTimerRef.current);
      }
    };
  }, [clearDangerModeTimers]);

  // [3] 인라인 확인 타이머 정리
  const clearInlineConfirmTimer = useCallback(() => {
    if (inlineConfirmTimerRef.current) {
      clearTimeout(inlineConfirmTimerRef.current);
      inlineConfirmTimerRef.current = null;
    }
    setPendingDeleteUserId(null);
  }, []);

  // 삭제 모달 열릴 때 미리보기 데이터 조회
  useEffect(() => {
    if (deleteModalUser) {
      setPreviewLoading(true);
      setDeletePreview(null);
      usersApi.getDeletePreview(deleteModalUser._id)
        .then((res) => {
          if (res.success) {
            setDeletePreview(res.preview);
          }
        })
        .catch((err) => {
          console.error('삭제 미리보기 조회 실패:', err);
        })
        .finally(() => {
          setPreviewLoading(false);
        });
    } else {
      setDeletePreview(null);
    }
  }, [deleteModalUser]);

  // 검색어 debounce (300ms)
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'users', page, debouncedSearch, sortKey, sortOrder],
    queryFn: () =>
      usersApi.getUsers({
        page,
        limit,
        search: debouncedSearch || undefined,
        sortBy: sortKey,
        sortOrder,
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
      setTierChangeModal(null);
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

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => usersApi.deleteUser(userId),
    onSuccess: (result) => {
      setDeleteModalUser(null);
      setDeleteConfirmText(''); // [4] 텍스트 입력 초기화
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // [5] 24시간 후 삭제 예약 완료 메시지
      alert(result.message || '사용자 삭제가 24시간 후로 예약되었습니다.');
    },
    onError: (error: any) => {
      console.error('사용자 삭제 예약 실패:', error);
      alert(error?.message || '사용자 삭제 예약에 실패했습니다.');
    },
  });

  // [5] 삭제 취소 mutation
  const cancelDeletionMutation = useMutation({
    mutationFn: (userId: string) => usersApi.cancelDeletion(userId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      alert(result.message || '삭제 예약이 취소되었습니다.');
    },
    onError: (error: any) => {
      console.error('삭제 취소 실패:', error);
      alert(error?.message || '삭제 취소에 실패했습니다.');
    },
  });

  // 등급 변경 시 확인 모달 표시
  const handleTierChange = (user: User, currentTier: string, newTier: string) => {
    if (currentTier === newTier) return; // 같은 등급이면 무시
    setTierChangeModal({ user, currentTier, newTier });
  };

  // 등급 변경 확인
  const handleTierChangeConfirm = () => {
    if (tierChangeModal) {
      updateTierMutation.mutate({
        userId: tierChangeModal.user._id,
        tier: tierChangeModal.newTier,
      });
    }
  };

  // [3] 1단계: 아이콘 클릭 → 인라인 확인 표시
  const handleDeleteIconClick = (user: User) => {
    // 이미 다른 사용자의 인라인 확인이 열려있으면 닫기
    clearInlineConfirmTimer();

    // 인라인 확인 표시
    setPendingDeleteUserId(user._id);

    // 3초 후 자동 취소
    inlineConfirmTimerRef.current = setTimeout(() => {
      setPendingDeleteUserId(null);
    }, INLINE_CONFIRM_TIMEOUT);
  };

  // [3] 2단계: 인라인 확인 클릭 → 모달 열기
  const handleInlineConfirm = (user: User) => {
    clearInlineConfirmTimer();
    setDeleteConfirmText(''); // [4] 텍스트 입력 초기화
    setDeleteModalUser(user);
  };

  // [3] 인라인 확인 취소
  const handleInlineCancel = () => {
    clearInlineConfirmTimer();
  };

  // [4] 삭제 확인 (텍스트 검증 후)
  const handleDeleteConfirm = () => {
    if (!deleteModalUser) return;

    // [4] 텍스트 입력 검증: "{사용자이름}삭제" 입력해야 함
    const requiredText = `${deleteModalUser.name || deleteModalUser.email}삭제`;
    if (deleteConfirmText !== requiredText) {
      alert(`삭제하려면 "${requiredText}"를 정확히 입력하세요.`);
      return;
    }

    deleteUserMutation.mutate(deleteModalUser._id);
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
    // 정렬 변경 시 첫 페이지로 이동
    setPage(1);
  };

  // DB에서 정렬된 사용자 목록 직접 사용
  const users = data?.users || [];

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

      {/* [1] 관리 모드 토글 + Search */}
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

        {/* [1] 관리 모드 토글 */}
        <button
          type="button"
          className={`users-page__danger-toggle ${dangerMode ? 'users-page__danger-toggle--active' : ''}`}
          onClick={toggleDangerMode}
          title={dangerMode ? '관리 모드 끄기' : '삭제 기능 활성화'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {dangerMode ? `관리 모드 (${dangerModeRemaining}초)` : '관리 모드'}
        </button>
      </div>

      {/* Table Container */}
      <div className="users-page__table-container">
        {users.length === 0 ? (
          <div className="users-page__empty">검색 결과가 없습니다.</div>
        ) : (
          <table className="users-table">
            <thead className="users-table__head">
              <tr>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('name')}>
                  이름 <SortIcon columnKey="name" />
                </th>
                <th className="users-table__th users-table__th--sortable users-table__th--hide-mobile" onClick={() => handleSort('email')}>
                  이메일 <SortIcon columnKey="email" />
                </th>
                <th className="users-table__th users-table__th--sortable" onClick={() => handleSort('tier')}>
                  등급 <SortIcon columnKey="tier" />
                </th>
                <th className="users-table__th users-table__th--sortable users-table__th--hide-mobile" onClick={() => handleSort('createdAt')}>
                  가입일 <SortIcon columnKey="createdAt" />
                </th>
                <th className="users-table__th users-table__th--sortable users-table__th--hide-mobile" onClick={() => handleSort('lastLogin')}>
                  최근 로그인 <SortIcon columnKey="lastLogin" />
                </th>
                <th className="users-table__th users-table__th--actions">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="users-table__body">
              {users.map((user) => {
                const isUpdating = updatingUserId === user._id;
                const tier = user.storage?.tier || 'free_trial';
                const isScheduledForDeletion = !!user.scheduledDeletionAt;
                const deletionTimeRemaining = user.scheduledDeletionAt ? getTimeRemaining(user.scheduledDeletionAt) : null;

                return (
                  <tr
                    key={user._id}
                    className={`users-table__row ${isScheduledForDeletion ? 'users-table__row--scheduled-deletion' : ''}`}
                  >
                    <td className="users-table__td">
                      {user.name || '-'}
                      {/* [5] 삭제 예정 배지 */}
                      {isScheduledForDeletion && deletionTimeRemaining && (
                        <span className="users-table__deletion-badge" title={`삭제 예정: ${new Date(user.scheduledDeletionAt!).toLocaleString('ko-KR')}`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          {deletionTimeRemaining.text}
                        </span>
                      )}
                    </td>
                    <td className="users-table__td users-table__td--hide-mobile">{user.email || '-'}</td>
                    <td className="users-table__td">
                      <select
                        className={`tier-select tier-select--${tier}`}
                        value={tier}
                        onChange={(e) => handleTierChange(user, tier, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={isUpdating || isScheduledForDeletion}
                        aria-label="등급 변경"
                      >
                        {TIER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="users-table__td users-table__td--hide-mobile">{formatDate((user as any).createdAt)}</td>
                    <td className="users-table__td users-table__td--hide-mobile">{formatDate((user as any).lastLogin)}</td>
                    <td className="users-table__td users-table__td--actions">
                      {user.role !== 'admin' && (
                        <>
                          {/* [5] 삭제 예약된 사용자: 취소 버튼 표시 */}
                          {isScheduledForDeletion ? (
                            <button
                              type="button"
                              className="users-table__cancel-deletion"
                              onClick={() => cancelDeletionMutation.mutate(user._id)}
                              disabled={cancelDeletionMutation.isPending}
                              title="삭제 예약 취소"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              취소
                            </button>
                          ) : (
                            <>
                              {/* [1] 관리 모드가 켜져있을 때만 삭제 UI 표시 */}
                              {dangerMode ? (
                                pendingDeleteUserId === user._id ? (
                                  /* [3] 인라인 확인 UI */
                                  <div className="users-table__inline-confirm">
                                    <span className="users-table__inline-confirm-text">삭제?</span>
                                    <button
                                      type="button"
                                      className="users-table__inline-confirm-btn users-table__inline-confirm-btn--yes"
                                      onClick={() => handleInlineConfirm(user)}
                                      title="삭제 진행"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      className="users-table__inline-confirm-btn users-table__inline-confirm-btn--no"
                                      onClick={handleInlineCancel}
                                      title="취소"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  /* [2] 회색 아이콘 버튼 (호버 시 빨간색) */
                                  <button
                                    type="button"
                                    className="users-table__delete-icon"
                                    onClick={() => handleDeleteIconClick(user)}
                                    disabled={deleteUserMutation.isPending}
                                    title="사용자 삭제"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                )
                              ) : (
                                /* [1] 관리 모드 꺼져있으면 빈 공간 */
                                <span className="users-table__no-action">-</span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </td>
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

      {/* 등급 변경 확인 모달 */}
      <Modal
        isOpen={tierChangeModal !== null}
        onClose={() => setTierChangeModal(null)}
        title="등급 변경 확인"
      >
        {tierChangeModal && (
          <div className="tier-change-modal">
            <p className="tier-change-modal__text">
              <strong>{tierChangeModal.user.name}</strong> ({tierChangeModal.user.email}) 사용자의 등급을 변경하시겠습니까?
            </p>
            <div className="tier-change-modal__change">
              <span className={`tier-badge tier-badge--${tierChangeModal.currentTier}`}>
                {TIER_OPTIONS.find(t => t.value === tierChangeModal.currentTier)?.label || tierChangeModal.currentTier}
              </span>
              <span className="tier-change-modal__arrow">→</span>
              <span className={`tier-badge tier-badge--${tierChangeModal.newTier}`}>
                {TIER_OPTIONS.find(t => t.value === tierChangeModal.newTier)?.label || tierChangeModal.newTier}
              </span>
            </div>
            <div className="tier-change-modal__actions">
              <Button
                variant="secondary"
                onClick={() => setTierChangeModal(null)}
                disabled={updateTierMutation.isPending}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleTierChangeConfirm}
                disabled={updateTierMutation.isPending}
              >
                {updateTierMutation.isPending ? '변경 중...' : '변경'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 삭제 확인 모달 - [4][5] 텍스트 입력 + 24시간 후 삭제 예약 */}
      <Modal
        isOpen={deleteModalUser !== null}
        onClose={() => {
          setDeleteModalUser(null);
          setDeleteConfirmText('');
        }}
        title="⚠️ 사용자 삭제 예약"
      >
        <div className="delete-user-modal">
          <div className="delete-user-modal__warning">
            {/* [5] 24시간 후 삭제 안내 */}
            <div className="delete-user-modal__schedule-notice">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span>삭제는 <strong>24시간 후</strong>에 실행됩니다</span>
            </div>

            <p className="delete-user-modal__text">
              <strong>{deleteModalUser?.name}</strong> ({deleteModalUser?.email}) 사용자의 삭제를 예약하시겠습니까?
            </p>
            <p className="delete-user-modal__caution">
              24시간 내에 취소하지 않으면 다음 데이터가 영구 삭제됩니다:
            </p>

            {previewLoading ? (
              <div className="delete-user-modal__loading">데이터 조회 중...</div>
            ) : deletePreview ? (
              <div className="delete-user-modal__preview">
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">문서</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.documents.count}개</span>
                </div>
                {deletePreview.documents.folders.length > 0 && (
                  <div className="delete-user-modal__preview-detail">
                    <span className="delete-user-modal__preview-sublabel">파일 위치:</span>
                    <ul className="delete-user-modal__folder-list">
                      {deletePreview.documents.folders.map((folder, idx) => (
                        <li key={idx}>{folder}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">고객</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.customers}명</span>
                </div>
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">계약</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.contracts}건</span>
                </div>
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">관계</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.relationships}건</span>
                </div>
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">임베딩 (AI 검색 데이터)</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.embeddings}개</span>
                </div>
                <div className="delete-user-modal__preview-item">
                  <span className="delete-user-modal__preview-label">AI 사용량 기록</span>
                  <span className="delete-user-modal__preview-value">{deletePreview.tokenUsage}건</span>
                </div>
              </div>
            ) : (
              <ul className="delete-user-modal__list">
                <li>사용자가 등록한 모든 문서 (물리 파일 포함)</li>
                <li>모든 고객 정보</li>
                <li>모든 계약 정보</li>
                <li>모든 관계 정보</li>
                <li>벡터 임베딩 (AI 검색 데이터)</li>
                <li>AI 사용량 기록</li>
              </ul>
            )}

            {/* [4] 텍스트 입력 확인 */}
            <div className="delete-user-modal__confirm-input">
              <label className="delete-user-modal__confirm-label">
                삭제를 예약하려면 <strong>{deleteModalUser?.name || deleteModalUser?.email}삭제</strong>를 입력하세요:
              </label>
              <input
                type="text"
                className="delete-user-modal__confirm-field"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={`${deleteModalUser?.name || deleteModalUser?.email}삭제`}
                disabled={deleteUserMutation.isPending}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="delete-user-modal__actions">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteModalUser(null);
                setDeleteConfirmText('');
              }}
              disabled={deleteUserMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={
                deleteUserMutation.isPending ||
                previewLoading ||
                deleteConfirmText !== `${deleteModalUser?.name || deleteModalUser?.email}삭제`
              }
            >
              {deleteUserMutation.isPending ? '예약 중...' : '24시간 후 삭제 예약'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
