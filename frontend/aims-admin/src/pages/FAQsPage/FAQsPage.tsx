/**
 * FAQ 관리 페이지
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/useDebounce';
import {
  helpContentApi,
  type FAQ,
  type FAQCategoryInfo,
} from '@/features/help-content/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import './FAQsPage.css';

interface FAQFormData {
  question: string;
  answer: string;
  category: string;
  order: number;
  isPublished: boolean;
}

const initialFormData: FAQFormData = {
  question: '',
  answer: '',
  category: 'general',
  order: 0,
  isPublished: true,
};

export const FAQsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [publishedFilter, setPublishedFilter] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [formData, setFormData] = useState<FAQFormData>(initialFormData);

  const debouncedSearch = useDebounce(search, 300);

  // FAQ 카테고리 목록 조회 (DB에서 동적으로)
  const { data: categories = [] } = useQuery({
    queryKey: ['admin', 'faq-categories'],
    queryFn: helpContentApi.getFAQCategories,
  });

  // 카테고리 라벨 맵 생성
  const categoryLabelMap = categories.reduce((acc, cat) => {
    acc[cat.key] = cat.label;
    return acc;
  }, {} as Record<string, string>);

  // FAQ 목록 조회
  const { data: faqs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'faqs', debouncedSearch, categoryFilter, publishedFilter],
    queryFn: () =>
      helpContentApi.getFAQs({
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        isPublished: publishedFilter === '' ? undefined : publishedFilter === 'true',
      }),
  });

  // FAQ 생성
  const createMutation = useMutation({
    mutationFn: helpContentApi.createFAQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'faq-categories'] });
      closeModal();
    },
  });

  // FAQ 수정
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FAQFormData> }) =>
      helpContentApi.updateFAQ(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'faq-categories'] });
      closeModal();
    },
  });

  // FAQ 삭제
  const deleteMutation = useMutation({
    mutationFn: helpContentApi.deleteFAQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'faq-categories'] });
    },
  });

  const openCreateModal = () => {
    setEditingFaq(null);
    const maxOrder = faqs ? Math.max(0, ...faqs.map(f => f.order)) : 0;
    setFormData({
      ...initialFormData,
      order: maxOrder + 1,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (faq: FAQ) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      order: faq.order,
      isPublished: faq.isPublished,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFaq(null);
    setFormData(initialFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question.trim() || !formData.answer.trim()) {
      alert('질문과 답변을 입력해주세요.');
      return;
    }

    if (editingFaq) {
      updateMutation.mutate({ id: editingFaq._id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (faq: FAQ) => {
    if (window.confirm(`"${faq.question}" FAQ를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(faq._id);
    }
  };

  const handleTogglePublished = (faq: FAQ) => {
    updateMutation.mutate({
      id: faq._id,
      data: { isPublished: !faq.isPublished },
    });
  };

  // 카테고리별 그룹화
  const groupedFaqs = faqs?.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>) || {};

  // 카테고리 순서 (DB에서 가져온 순서 사용)
  const sortedCategories = categories.map(cat => cat.key);

  if (isLoading) {
    return <div className="faqs-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="faqs-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="faqs-page">
      <div className="faqs-page__header">
        <div>
          <h1 className="faqs-page__title">FAQ 관리</h1>
        </div>
        <div className="faqs-page__actions">
          <Button onClick={openCreateModal}>새 FAQ 추가</Button>
          <span className="faqs-page__count">총 {faqs?.length || 0}건</span>
        </div>
      </div>

      <div className="faqs-page__filters">
        <input
          type="text"
          className="faqs-page__search"
          placeholder="질문, 답변 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="faqs-page__select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">전체 카테고리</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
        <select
          className="faqs-page__select"
          value={publishedFilter}
          onChange={(e) => setPublishedFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="true">게시됨</option>
          <option value="false">미게시</option>
        </select>
      </div>

      <div className="faqs-page__list">
        {categoryFilter ? (
          // 필터링된 경우 테이블로 표시
          <div className="faqs-page__table-container">
            <table className="faqs-page__table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>순서</th>
                  <th style={{ width: '80px' }}>카테고리</th>
                  <th>질문</th>
                  <th style={{ width: '80px' }}>상태</th>
                  <th style={{ width: '100px' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {faqs?.sort((a, b) => a.order - b.order).map((faq) => (
                  <tr key={faq._id}>
                    <td className="faqs-page__order">{faq.order}</td>
                    <td>
                      <span className={`faqs-page__category faqs-page__category--${faq.category}`}>
                        {categoryLabelMap[faq.category] || faq.category}
                      </span>
                    </td>
                    <td className="faqs-page__question">{faq.question}</td>
                    <td>
                      <button
                        className={`faqs-page__toggle ${faq.isPublished ? 'faqs-page__toggle--published' : 'faqs-page__toggle--unpublished'}`}
                        onClick={() => handleTogglePublished(faq)}
                      >
                        {faq.isPublished ? '게시' : '미게시'}
                      </button>
                    </td>
                    <td>
                      <div className="faqs-page__action-buttons">
                        <button
                          className="faqs-page__action-btn faqs-page__action-btn--edit"
                          onClick={() => openEditModal(faq)}
                        >
                          수정
                        </button>
                        <button
                          className="faqs-page__action-btn faqs-page__action-btn--delete"
                          onClick={() => handleDelete(faq)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // 전체 표시 시 카테고리별 그룹화
          sortedCategories.map((category) => {
            const categoryFaqs = groupedFaqs[category];
            if (!categoryFaqs || categoryFaqs.length === 0) return null;

            return (
              <div key={category} className="faqs-page__category-group">
                <h2 className="faqs-page__category-title">
                  <span className={`faqs-page__category-badge faqs-page__category-badge--${category}`}>
                    {categoryLabelMap[category] || category}
                  </span>
                  <span className="faqs-page__category-count">{categoryFaqs.length}개</span>
                </h2>
                <div className="faqs-page__category-items">
                  {categoryFaqs.sort((a, b) => a.order - b.order).map((faq) => (
                    <div key={faq._id} className="faqs-page__item">
                      <div className="faqs-page__item-header">
                        <span className="faqs-page__item-order">{faq.order}</span>
                        <span className="faqs-page__item-question">{faq.question}</span>
                        <div className="faqs-page__item-actions">
                          <button
                            className={`faqs-page__toggle ${faq.isPublished ? 'faqs-page__toggle--published' : 'faqs-page__toggle--unpublished'}`}
                            onClick={() => handleTogglePublished(faq)}
                          >
                            {faq.isPublished ? '게시' : '미게시'}
                          </button>
                          <button
                            className="faqs-page__action-btn faqs-page__action-btn--edit"
                            onClick={() => openEditModal(faq)}
                          >
                            수정
                          </button>
                          <button
                            className="faqs-page__action-btn faqs-page__action-btn--delete"
                            onClick={() => handleDelete(faq)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      <div className="faqs-page__item-answer">{faq.answer}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {faqs?.length === 0 && (
          <div className="faqs-page__empty">
            FAQ가 없습니다.
          </div>
        )}
      </div>

      {/* FAQ 생성/수정 모달 */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingFaq ? 'FAQ 수정' : '새 FAQ'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="faqs-page__form">
          <div className="faqs-page__form-row faqs-page__form-row--two-col">
            <div className="faqs-page__form-col">
              <label className="faqs-page__form-label">카테고리</label>
              <select
                className="faqs-page__form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div className="faqs-page__form-col">
              <label className="faqs-page__form-label">순서</label>
              <input
                type="number"
                className="faqs-page__form-input"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="faqs-page__form-row">
            <label className="faqs-page__form-label">질문</label>
            <input
              type="text"
              className="faqs-page__form-input"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              placeholder="자주 묻는 질문"
            />
          </div>

          <div className="faqs-page__form-row">
            <label className="faqs-page__form-label">답변</label>
            <textarea
              className="faqs-page__form-textarea"
              value={formData.answer}
              onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              placeholder="답변 내용"
              rows={6}
            />
          </div>

          <div className="faqs-page__form-row">
            <label className="faqs-page__form-checkbox">
              <input
                type="checkbox"
                checked={formData.isPublished}
                onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
              />
              게시
            </label>
          </div>

          <div className="faqs-page__form-actions">
            <Button type="button" variant="secondary" onClick={closeModal}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingFaq ? '수정' : '등록'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default FAQsPage;
