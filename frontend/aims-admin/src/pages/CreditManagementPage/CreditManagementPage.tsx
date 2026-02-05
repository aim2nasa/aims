/**
 * 크레딧 관리 페이지
 * @see docs/BONUS_CREDIT_IMPLEMENTATION.md
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { creditsApi, type UserWithCredits, type CreditPackage } from '@/features/credits/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { StatCard } from '@/shared/ui/StatCard/StatCard';
import './CreditManagementPage.css';

const TIER_LABELS: Record<string, string> = {
  free_trial: '무료체험',
  standard: '일반',
  premium: '프리미엄',
  vip: 'VIP',
  admin: '관리자',
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
    hour12: false,
  }).replace(/\. /g, '.').replace(/:/g, ':');
};

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString();
};

// 크레딧 페이지 탭 네비게이션
const CreditTabs = () => {
  const location = useLocation();
  const tabs = [
    { path: '/dashboard/credits', label: '사용자 크레딧' },
    { path: '/dashboard/credits/history', label: '이력 조회' },
    { path: '/dashboard/credits/packages', label: '패키지 관리' },
  ];

  return (
    <div className="credit-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`credit-tab ${location.pathname === tab.path ? 'active' : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

export const CreditManagementPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [hasBonusFilter, setHasBonusFilter] = useState(false);
  const [grantModal, setGrantModal] = useState<UserWithCredits | null>(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const limit = 20;

  // 크레딧 현황 요약 조회
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['credits', 'overview'],
    queryFn: () => creditsApi.getOverview(),
    refetchInterval: 30000,
  });

  // 사용자 목록 조회
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['credits', 'users', page, debouncedSearch, tierFilter, hasBonusFilter],
    queryFn: () => creditsApi.getUsersWithCredits({
      limit,
      skip: page * limit,
      search: debouncedSearch || undefined,
      tier: tierFilter || undefined,
      has_bonus: hasBonusFilter || undefined,
    }),
  });

  // 패키지 목록 조회 (모달용)
  const { data: packagesData } = useQuery({
    queryKey: ['credits', 'packages'],
    queryFn: () => creditsApi.getPackages(),
    enabled: !!grantModal,
  });

  // 크레딧 부여 mutation
  const grantMutation = useMutation({
    mutationFn: ({
      userId,
      amount,
      reason,
      packageCode,
    }: {
      userId: string;
      amount: number;
      reason: string;
      packageCode?: string;
    }) => creditsApi.grantCredits(userId, amount, reason, packageCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
      setGrantModal(null);
      setGrantAmount('');
      setGrantReason('');
      setSelectedPackage('');
    },
  });

  const overview = overviewData?.data;
  const users = usersData?.data?.users || [];
  const pagination = usersData?.data?.pagination;
  const packages = packagesData?.data || [];

  const handleGrant = useCallback(() => {
    if (!grantModal || !grantAmount || !grantReason) return;

    const amount = parseInt(grantAmount, 10);
    if (isNaN(amount) || amount <= 0) return;

    grantMutation.mutate({
      userId: grantModal.id,
      amount,
      reason: grantReason,
      packageCode: selectedPackage || undefined,
    });
  }, [grantModal, grantAmount, grantReason, selectedPackage, grantMutation]);

  const handlePackageSelect = useCallback((pkg: CreditPackage) => {
    setSelectedPackage(pkg.code);
    setGrantAmount(String(pkg.credits));
    setGrantReason(`${pkg.name} 패키지 구매 - 입금확인`);
  }, []);

  const totalPages = pagination ? Math.ceil(pagination.total / limit) : 0;

  return (
    <div className="credit-management-page">
      <div className="page-header">
        <h1>크레딧 관리</h1>
        <p className="page-description">사용자별 추가 크레딧 현황 조회 및 부여</p>
      </div>

      <CreditTabs />

      {/* 현황 요약 카드 */}
      <div className="overview-cards">
        <StatCard
          title="총 추가 크레딧 잔액"
          value={overviewLoading ? '...' : (overview ? formatNumber(overview.total_balance) + 'C' : '-')}
          subtitle={`${formatNumber(overview?.users_with_balance || 0)}명 보유`}
        />
        <StatCard
          title="이달 부여"
          value={overviewLoading ? '...' : (overview ? formatNumber(overview.month_granted) + 'C' : '-')}
          subtitle={`${formatNumber(overview?.month_grant_count || 0)}건`}
        />
        <StatCard
          title="이달 사용"
          value={overviewLoading ? '...' : (overview ? formatNumber(overview.month_used) + 'C' : '-')}
          subtitle={`${formatNumber(overview?.month_usage_count || 0)}건`}
        />
      </div>

      {/* 필터 바 */}
      <div className="filter-bar">
        <input
          type="text"
          className="search-input"
          placeholder="이름 또는 이메일 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          className="tier-filter"
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">전체 티어</option>
          <option value="free_trial">무료체험</option>
          <option value="standard">일반</option>
          <option value="premium">프리미엄</option>
          <option value="vip">VIP</option>
        </select>
        <label className="bonus-filter">
          <input
            type="checkbox"
            checked={hasBonusFilter}
            onChange={(e) => {
              setHasBonusFilter(e.target.checked);
              setPage(0);
            }}
          />
          추가 크레딧 보유자만
        </label>
      </div>

      {/* 사용자 목록 테이블 */}
      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>티어</th>
              <th>월정액 잔여</th>
              <th>추가 크레딧</th>
              <th>총 사용가능</th>
              <th>마지막 충전</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {usersLoading ? (
              <tr>
                <td colSpan={8} className="loading-cell">로딩 중...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-cell">사용자가 없습니다</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="name-cell">{user.name || '-'}</td>
                  <td className="email-cell">{user.email}</td>
                  <td className="tier-cell">
                    <span className={`tier-badge tier-${user.tier}`}>
                      {TIER_LABELS[user.tier] || user.tier}
                    </span>
                  </td>
                  <td className="credit-cell">
                    {user.monthly_remaining !== undefined
                      ? `${formatNumber(user.monthly_remaining)} / ${formatNumber(user.monthly_quota)}`
                      : '-'}
                  </td>
                  <td className="credit-cell bonus">
                    {user.bonus_balance > 0 ? (
                      <span className="bonus-badge">{formatNumber(user.bonus_balance)}C</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="credit-cell total">
                    {user.total_available !== undefined
                      ? `${formatNumber(user.total_available)}C`
                      : '-'}
                  </td>
                  <td className="date-cell">{formatDate(user.last_purchase_at)}</td>
                  <td className="action-cell">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setGrantModal(user)}
                    >
                      크레딧 부여
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="pagination">
          <Button
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="page-info">
            {page + 1} / {totalPages} ({pagination?.total}명)
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}

      {/* 크레딧 부여 모달 */}
      {grantModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setGrantModal(null);
            setGrantAmount('');
            setGrantReason('');
            setSelectedPackage('');
          }}
          title="크레딧 부여"
        >
          <div className="grant-modal-content">
            <div className="user-info">
              <strong>{grantModal.name}</strong>
              <span>{grantModal.email}</span>
              <span className={`tier-badge tier-${grantModal.tier}`}>
                {TIER_LABELS[grantModal.tier] || grantModal.tier}
              </span>
            </div>

            <div className="current-credits">
              <span>현재 추가 크레딧: </span>
              <strong>{formatNumber(grantModal.bonus_balance)}C</strong>
            </div>

            {/* 패키지 선택 */}
            <div className="package-section">
              <label>패키지 선택 (선택사항)</label>
              <div className="package-buttons">
                {packages.filter(p => p.is_active).map((pkg) => (
                  <button
                    key={pkg.code}
                    type="button"
                    className={`package-btn ${selectedPackage === pkg.code ? 'selected' : ''}`}
                    onClick={() => handlePackageSelect(pkg)}
                  >
                    <span className="pkg-name">{pkg.name}</span>
                    <span className="pkg-credits">{formatNumber(pkg.credits)}C</span>
                    <span className="pkg-price">{formatNumber(pkg.price_krw)}원</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="grant-amount">부여할 크레딧</label>
              <input
                id="grant-amount"
                type="number"
                min="1"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                placeholder="크레딧 수량 입력"
              />
            </div>

            <div className="form-group">
              <label htmlFor="grant-reason">부여 사유 (필수)</label>
              <textarea
                id="grant-reason"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="예: 기본 패키지 구매 - 입금확인 완료"
                rows={3}
              />
            </div>

            <div className="modal-actions">
              <Button
                variant="ghost"
                onClick={() => {
                  setGrantModal(null);
                  setGrantAmount('');
                  setGrantReason('');
                  setSelectedPackage('');
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleGrant}
                disabled={
                  !grantAmount ||
                  parseInt(grantAmount, 10) <= 0 ||
                  !grantReason.trim() ||
                  grantMutation.isPending
                }
              >
                {grantMutation.isPending ? '처리 중...' : '부여'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CreditManagementPage;
