import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { creditsApi, type CreditTransaction } from '@/features/credits/api';
import './CreditHistoryPage.css';

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

interface FilterState {
  type: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export function CreditHistoryPage() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    type: '',
    userId: '',
    startDate: '',
    endDate: '',
  });

  const limit = 20;

  useEffect(() => {
    fetchTransactions();
  }, [page, filters]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = {
        skip: (page - 1) * limit,
        limit,
      };

      if (filters.type) params.type = filters.type;
      if (filters.userId) params.user_id = filters.userId;
      if (filters.startDate) params.from = filters.startDate;
      if (filters.endDate) params.to = filters.endDate;

      const response = await creditsApi.getTransactions(params);
      setTransactions(response.data.transactions);
      setTotalPages(Math.ceil(response.data.pagination.total / limit));
      setTotalCount(response.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({
      type: '',
      userId: '',
      startDate: '',
      endDate: '',
    });
    setPage(1);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/\. /g, '.').replace(/ /g, ' ');
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      purchase: '구매',
      admin_grant: '관리자 지급',
      usage: '사용',
      refund: '환불',
      adjustment: '조정',
    };
    return labels[type] || type;
  };

  const getTypeClass = (type: string) => {
    if (type === 'usage') return 'type-usage';
    if (type === 'refund' || type === 'adjustment') return 'type-adjustment';
    return 'type-grant';
  };

  return (
    <div className="credit-history-page">
      <div className="page-header">
        <h1>크레딧 관리</h1>
        <p className="page-description">
          전체 크레딧 충전 및 사용 이력을 조회합니다.
        </p>
      </div>

      <CreditTabs />

      {/* 필터 바 */}
      <div className="filter-bar">
        <select
          className="filter-select"
          value={filters.type}
          onChange={(e) => handleFilterChange('type', e.target.value)}
          title="거래 유형 필터"
        >
          <option value="">전체 유형</option>
          <option value="purchase">구매</option>
          <option value="admin_grant">관리자 지급</option>
          <option value="usage">사용</option>
          <option value="refund">환불</option>
          <option value="adjustment">조정</option>
        </select>

        <input
          type="text"
          className="filter-input"
          placeholder="사용자 ID"
          value={filters.userId}
          onChange={(e) => handleFilterChange('userId', e.target.value)}
        />

        <input
          type="date"
          className="filter-input"
          value={filters.startDate}
          onChange={(e) => handleFilterChange('startDate', e.target.value)}
          title="시작 날짜"
        />

        <span className="date-separator">~</span>

        <input
          type="date"
          className="filter-input"
          value={filters.endDate}
          onChange={(e) => handleFilterChange('endDate', e.target.value)}
          title="종료 날짜"
        />

        <button type="button" className="reset-btn" onClick={resetFilters}>
          필터 초기화
        </button>
      </div>

      {/* 결과 요약 */}
      <div className="result-summary">
        총 {totalCount.toLocaleString()}건의 이력
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="error-message">
          {error}
          <button type="button" onClick={fetchTransactions}>다시 시도</button>
        </div>
      )}

      {/* 테이블 */}
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>일시</th>
              <th>사용자</th>
              <th>유형</th>
              <th>금액</th>
              <th>잔액</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="loading-cell">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  이력이 없습니다.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr key={tx._id}>
                  <td className="date-cell">
                    {formatDate(tx.created_at)}
                  </td>
                  <td className="user-cell">
                    <span className="user-name">{tx.user?.name || '-'}</span>
                    <span className="user-email">{tx.user?.email || '-'}</span>
                  </td>
                  <td className="type-cell">
                    <span className={`type-badge ${getTypeClass(tx.type)}`}>
                      {getTypeLabel(tx.type)}
                    </span>
                  </td>
                  <td className={`amount-cell ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </td>
                  <td className="balance-cell">
                    {tx.balance_after.toLocaleString()}
                  </td>
                  <td className="detail-cell">
                    {tx.type === 'admin_grant' && tx.admin && (
                      <span className="detail-text">
                        {tx.admin.reason || '관리자 지급'}
                      </span>
                    )}
                    {tx.type === 'purchase' && tx.package && (
                      <span className="detail-text">
                        {tx.package.name} 패키지
                      </span>
                    )}
                    {tx.type === 'usage' && tx.usage && (
                      <span className="detail-text">
                        {tx.usage.resource_type}
                      </span>
                    )}
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
          <button
            type="button"
            className="page-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            이전
          </button>
          <span className="page-info">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
