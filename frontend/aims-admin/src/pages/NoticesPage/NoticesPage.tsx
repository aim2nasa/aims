/**
 * 공지사항 관리 페이지
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  helpContentApi,
  NOTICE_CATEGORY_LABELS,
  type Notice,
  type NoticeCategory,
} from '@/features/help-content/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import './NoticesPage.css';

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

interface NoticeFormData {
  title: string;
  content: string;
  category: NoticeCategory;
  isNew: boolean;
  isPublished: boolean;
}

const initialFormData: NoticeFormData = {
  title: '',
  content: '',
  category: 'system',
  isNew: false,
  isPublished: true,
};

export const NoticesPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<NoticeCategory | ''>('');
  const [publishedFilter, setPublishedFilter] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [formData, setFormData] = useState<NoticeFormData>(initialFormData);
  const limit = 20;

  const debouncedSearch = useDebounce(search, 300);

  // 공지사항 목록 조회
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'notices', page, debouncedSearch, categoryFilter, publishedFilter],
    queryFn: () =>
      helpContentApi.getNotices({
        page,
        limit,
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        isPublished: publishedFilter === '' ? undefined : publishedFilter === 'true',
      }),
  });

  // 공지사항 생성
  const createMutation = useMutation({
    mutationFn: helpContentApi.createNotice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] });
      closeModal();
    },
  });

  // 공지사항 수정
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NoticeFormData> }) =>
      helpContentApi.updateNotice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] });
      closeModal();
    },
  });

  // 공지사항 삭제
  const deleteMutation = useMutation({
    mutationFn: helpContentApi.deleteNotice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] });
    },
  });

  const openCreateModal = () => {
    setEditingNotice(null);
    setFormData(initialFormData);
    setIsModalOpen(true);
  };

  const openEditModal = (notice: Notice) => {
    setEditingNotice(notice);
    setFormData({
      title: notice.title,
      content: notice.content,
      category: notice.category,
      isNew: notice.isNew,
      isPublished: notice.isPublished,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingNotice(null);
    setFormData(initialFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    if (editingNotice) {
      updateMutation.mutate({ id: editingNotice._id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (notice: Notice) => {
    if (window.confirm(`"${notice.title}" 공지사항을 삭제하시겠습니까?`)) {
      deleteMutation.mutate(notice._id);
    }
  };

  const handleToggleNew = (notice: Notice) => {
    updateMutation.mutate({
      id: notice._id,
      data: { isNew: !notice.isNew },
    });
  };

  const handleTogglePublished = (notice: Notice) => {
    updateMutation.mutate({
      id: notice._id,
      data: { isPublished: !notice.isPublished },
    });
  };

  const pagination = data?.pagination;
  const notices = data?.notices || [];

  if (isLoading) {
    return <div className="notices-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="notices-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="notices-page">
      <div className="notices-page__header">
        <div>
          <h1 className="notices-page__title">공지사항 관리</h1>
        </div>
        <div className="notices-page__actions">
          <Button onClick={openCreateModal}>새 공지 추가</Button>
          <span className="notices-page__count">총 {pagination?.total || 0}건</span>
        </div>
      </div>

      <div className="notices-page__filters">
        <input
          type="text"
          className="notices-page__search"
          placeholder="제목, 내용 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="notices-page__select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as NoticeCategory | '')}
        >
          <option value="">전체 카테고리</option>
          {Object.entries(NOTICE_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className="notices-page__select"
          value={publishedFilter}
          onChange={(e) => setPublishedFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="true">게시됨</option>
          <option value="false">미게시</option>
        </select>
      </div>

      <div className="notices-page__table-container">
        <table className="notices-page__table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>카테고리</th>
              <th>제목</th>
              <th style={{ width: '80px' }}>NEW</th>
              <th style={{ width: '80px' }}>상태</th>
              <th style={{ width: '150px' }}>등록일</th>
              <th style={{ width: '120px' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 ? (
              <tr>
                <td colSpan={6} className="notices-page__empty">
                  공지사항이 없습니다.
                </td>
              </tr>
            ) : (
              notices.map((notice) => (
                <tr key={notice._id}>
                  <td>
                    <span className={`notices-page__category notices-page__category--${notice.category}`}>
                      {NOTICE_CATEGORY_LABELS[notice.category]}
                    </span>
                  </td>
                  <td className="notices-page__title-cell">
                    {notice.title}
                  </td>
                  <td>
                    <button
                      className={`notices-page__toggle ${notice.isNew ? 'notices-page__toggle--active' : ''}`}
                      onClick={() => handleToggleNew(notice)}
                      title={notice.isNew ? 'NEW 해제' : 'NEW 설정'}
                    >
                      {notice.isNew ? 'NEW' : '-'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`notices-page__toggle ${notice.isPublished ? 'notices-page__toggle--published' : 'notices-page__toggle--unpublished'}`}
                      onClick={() => handleTogglePublished(notice)}
                      title={notice.isPublished ? '게시 해제' : '게시'}
                    >
                      {notice.isPublished ? '게시' : '미게시'}
                    </button>
                  </td>
                  <td>{formatDate(notice.createdAt)}</td>
                  <td>
                    <div className="notices-page__action-buttons">
                      <button
                        className="notices-page__action-btn notices-page__action-btn--edit"
                        onClick={() => openEditModal(notice)}
                      >
                        수정
                      </button>
                      <button
                        className="notices-page__action-btn notices-page__action-btn--delete"
                        onClick={() => handleDelete(notice)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="notices-page__pagination">
          <button
            className="notices-page__page-btn"
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            «
          </button>
          <button
            className="notices-page__page-btn"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            ‹
          </button>
          {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
            const pageNum = Math.max(1, Math.min(page - 2, pagination.totalPages - 4)) + i;
            if (pageNum > pagination.totalPages) return null;
            return (
              <button
                key={pageNum}
                className={`notices-page__page-btn ${pageNum === page ? 'notices-page__page-btn--active' : ''}`}
                onClick={() => setPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            className="notices-page__page-btn"
            onClick={() => setPage(page + 1)}
            disabled={page === pagination.totalPages}
          >
            ›
          </button>
          <button
            className="notices-page__page-btn"
            onClick={() => setPage(pagination.totalPages)}
            disabled={page === pagination.totalPages}
          >
            »
          </button>
        </div>
      )}

      {/* 공지사항 생성/수정 모달 */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingNotice ? '공지사항 수정' : '새 공지사항'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="notices-page__form">
          <div className="notices-page__form-row">
            <label className="notices-page__form-label">카테고리</label>
            <select
              className="notices-page__form-select"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as NoticeCategory })}
            >
              {Object.entries(NOTICE_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="notices-page__form-row">
            <label className="notices-page__form-label">제목</label>
            <input
              type="text"
              className="notices-page__form-input"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="공지사항 제목"
            />
          </div>

          <div className="notices-page__form-row">
            <label className="notices-page__form-label">내용</label>
            <textarea
              className="notices-page__form-textarea"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="공지사항 내용"
              rows={10}
            />
          </div>

          <div className="notices-page__form-row notices-page__form-row--inline">
            <label className="notices-page__form-checkbox">
              <input
                type="checkbox"
                checked={formData.isNew}
                onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
              />
              NEW 뱃지 표시
            </label>
            <label className="notices-page__form-checkbox">
              <input
                type="checkbox"
                checked={formData.isPublished}
                onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
              />
              게시
            </label>
          </div>

          <div className="notices-page__form-actions">
            <Button type="button" variant="secondary" onClick={closeModal}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingNotice ? '수정' : '등록'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default NoticesPage;
