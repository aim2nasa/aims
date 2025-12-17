/**
 * 관리자 문의 관리 페이지
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  inquiriesApi,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type InquiryStatus,
  type InquiryCategory,
} from '@/features/inquiries/api';
import { Button } from '@/shared/ui/Button/Button';
import './InquiriesPage.css';

const formatDate = (dateString: string) => {
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

export const InquiriesPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<InquiryCategory | ''>('');
  const limit = 20;

  const debouncedSearch = useDebounce(search, 300);

  // 문의 목록 조회
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'inquiries', page, debouncedSearch, statusFilter, categoryFilter],
    queryFn: () =>
      inquiriesApi.getInquiries({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  // 문의 통계
  const { data: stats } = useQuery({
    queryKey: ['admin', 'inquiries', 'stats'],
    queryFn: inquiriesApi.getInquiryStats,
  });

  const handleRowClick = (inquiryId: string) => {
    navigate(`/inquiries/${inquiryId}`);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const pagination = data?.pagination;
  const inquiries = data?.inquiries || [];

  if (isLoading) {
    return <div className="inquiries-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="inquiries-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="inquiries-page">
      <div className="inquiries-page__header">
        <div>
          <h1 className="inquiries-page__title">문의 관리</h1>
          {stats && (
            <div className="inquiries-page__stats">
              <span className="stat-badge stat-badge--pending">대기 {stats.pending}</span>
              <span className="stat-badge stat-badge--in-progress">처리중 {stats.inProgress}</span>
              <span className="stat-badge stat-badge--resolved">해결 {stats.resolved}</span>
              <span className="stat-badge stat-badge--closed">종료 {stats.closed}</span>
            </div>
          )}
        </div>
        <span className="inquiries-page__count">총 {pagination?.total || 0}건</span>
      </div>

      <div className="inquiries-page__filters">
        <input
          type="text"
          className="inquiries-page__search"
          placeholder="제목, 작성자 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="inquiries-page__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InquiryStatus | '')}
        >
          <option value="">전체 상태</option>
          <option value="pending">대기중</option>
          <option value="in_progress">처리중</option>
          <option value="resolved">해결됨</option>
          <option value="closed">종료</option>
        </select>
        <select
          className="inquiries-page__select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as InquiryCategory | '')}
        >
          <option value="">전체 유형</option>
          <option value="bug">버그 신고</option>
          <option value="feature">기능 제안</option>
          <option value="question">사용 문의</option>
          <option value="other">기타</option>
        </select>
      </div>

      {inquiries.length === 0 ? (
        <div className="inquiries-page__empty">
          등록된 문의가 없습니다.
        </div>
      ) : (
        <div className="inquiries-page__table-container">
          <table className="inquiries-table">
            <thead className="inquiries-table__head">
              <tr>
                <th className="inquiries-table__th">상태</th>
                <th className="inquiries-table__th">유형</th>
                <th className="inquiries-table__th">제목</th>
                <th className="inquiries-table__th">작성자</th>
                <th className="inquiries-table__th">메시지</th>
                <th className="inquiries-table__th">등록일</th>
                <th className="inquiries-table__th">최근 활동</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inquiry) => (
                <tr
                  key={inquiry._id}
                  className="inquiries-table__row"
                  onClick={() => handleRowClick(inquiry._id)}
                >
                  <td className="inquiries-table__td">
                    <span className={`status-badge status-badge--${inquiry.status}`}>
                      {STATUS_LABELS[inquiry.status]}
                    </span>
                  </td>
                  <td className="inquiries-table__td">
                    <span className={`category-badge category-badge--${inquiry.category}`}>
                      {CATEGORY_LABELS[inquiry.category]}
                    </span>
                  </td>
                  <td className="inquiries-table__td inquiries-table__td--title">
                    {inquiry.title}
                  </td>
                  <td className="inquiries-table__td">
                    <div className="user-info">
                      <span className="user-info__name">{inquiry.userName}</span>
                      <span className="user-info__email">{inquiry.userEmail}</span>
                    </div>
                  </td>
                  <td className="inquiries-table__td">
                    {inquiry.messageCount || inquiry.messages?.length || 0}
                  </td>
                  <td className="inquiries-table__td">
                    {formatDate(inquiry.createdAt)}
                  </td>
                  <td className="inquiries-table__td">
                    {formatDate(inquiry.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="inquiries-page__pagination">
          <button
            className="inquiries-page__pagination-button"
            onClick={() => handlePageChange(1)}
            disabled={page === 1}
          >
            ≪
          </button>
          <button
            className="inquiries-page__pagination-button"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            ＜
          </button>

          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === pagination.totalPages || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => (
              <span key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="inquiries-page__pagination-ellipsis">...</span>}
                <button
                  className={`inquiries-page__pagination-button ${page === p ? 'inquiries-page__pagination-button--active' : ''}`}
                  onClick={() => handlePageChange(p)}
                >
                  {p}
                </button>
              </span>
            ))}

          <button
            className="inquiries-page__pagination-button"
            onClick={() => handlePageChange(page + 1)}
            disabled={page === pagination.totalPages}
          >
            ＞
          </button>
          <button
            className="inquiries-page__pagination-button"
            onClick={() => handlePageChange(pagination.totalPages)}
            disabled={page === pagination.totalPages}
          >
            ≫
          </button>

          <span className="inquiries-page__pagination-info">
            페이지 {page}/{pagination.totalPages}
          </span>
        </div>
      )}
    </div>
  );
};
