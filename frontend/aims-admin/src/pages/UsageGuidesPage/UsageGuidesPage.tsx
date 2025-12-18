/**
 * 사용 가이드 관리 페이지
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  helpContentApi,
  GUIDE_CATEGORY_LABELS,
  type UsageGuide,
  type GuideItem,
} from '@/features/help-content/api';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import './UsageGuidesPage.css';

interface GuideItemFormData {
  itemId: string;
  title: string;
  description: string;
  steps: string[];
  order: number;
}

const initialItemFormData: GuideItemFormData = {
  itemId: '',
  title: '',
  description: '',
  steps: [''],
  order: 0,
};

export const UsageGuidesPage = () => {
  const queryClient = useQueryClient();
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState<UsageGuide | null>(null);
  const [editingItem, setEditingItem] = useState<GuideItem | null>(null);
  const [itemFormData, setItemFormData] = useState<GuideItemFormData>(initialItemFormData);

  // 사용 가이드 조회
  const { data: guides, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'usage-guides'],
    queryFn: helpContentApi.getUsageGuides,
  });

  // 가이드 수정 (게시 상태 등)
  const updateGuideMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof helpContentApi.updateUsageGuide>[1] }) =>
      helpContentApi.updateUsageGuide(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'usage-guides'] });
    },
  });

  // 항목 추가
  const addItemMutation = useMutation({
    mutationFn: ({ guideId, data }: { guideId: string; data: Parameters<typeof helpContentApi.addGuideItem>[1] }) =>
      helpContentApi.addGuideItem(guideId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'usage-guides'] });
      closeItemModal();
    },
  });

  // 항목 수정
  const updateItemMutation = useMutation({
    mutationFn: ({ guideId, itemId, data }: { guideId: string; itemId: string; data: Parameters<typeof helpContentApi.updateGuideItem>[2] }) =>
      helpContentApi.updateGuideItem(guideId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'usage-guides'] });
      closeItemModal();
    },
  });

  // 항목 삭제
  const deleteItemMutation = useMutation({
    mutationFn: ({ guideId, itemId }: { guideId: string; itemId: string }) =>
      helpContentApi.deleteGuideItem(guideId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'usage-guides'] });
    },
  });

  const toggleExpand = (guideId: string) => {
    setExpandedGuide(prev => prev === guideId ? null : guideId);
  };

  const openAddItemModal = (guide: UsageGuide) => {
    setEditingGuide(guide);
    setEditingItem(null);
    const maxOrder = Math.max(0, ...guide.items.map(i => i.order));
    setItemFormData({
      ...initialItemFormData,
      order: maxOrder + 1,
    });
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (guide: UsageGuide, item: GuideItem) => {
    setEditingGuide(guide);
    setEditingItem(item);
    setItemFormData({
      itemId: item.id,
      title: item.title,
      description: item.description,
      steps: item.steps.length > 0 ? item.steps : [''],
      order: item.order,
    });
    setIsItemModalOpen(true);
  };

  const closeItemModal = () => {
    setIsItemModalOpen(false);
    setEditingGuide(null);
    setEditingItem(null);
    setItemFormData(initialItemFormData);
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGuide || !itemFormData.title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    const cleanedSteps = itemFormData.steps.filter(s => s.trim());

    if (editingItem) {
      updateItemMutation.mutate({
        guideId: editingGuide._id,
        itemId: editingItem.id,
        data: {
          title: itemFormData.title,
          description: itemFormData.description,
          steps: cleanedSteps,
          order: itemFormData.order,
        },
      });
    } else {
      if (!itemFormData.itemId.trim()) {
        alert('항목 ID를 입력해주세요.');
        return;
      }
      addItemMutation.mutate({
        guideId: editingGuide._id,
        data: {
          itemId: itemFormData.itemId,
          title: itemFormData.title,
          description: itemFormData.description,
          steps: cleanedSteps,
          order: itemFormData.order,
        },
      });
    }
  };

  const handleDeleteItem = (guide: UsageGuide, item: GuideItem) => {
    if (window.confirm(`"${item.title}" 항목을 삭제하시겠습니까?`)) {
      deleteItemMutation.mutate({ guideId: guide._id, itemId: item.id });
    }
  };

  const handleTogglePublished = (guide: UsageGuide) => {
    updateGuideMutation.mutate({
      id: guide._id,
      data: { isPublished: !guide.isPublished },
    });
  };

  const addStep = () => {
    setItemFormData(prev => ({
      ...prev,
      steps: [...prev.steps, ''],
    }));
  };

  const removeStep = (index: number) => {
    setItemFormData(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  };

  const updateStep = (index: number, value: string) => {
    setItemFormData(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? value : s),
    }));
  };

  if (isLoading) {
    return <div className="usage-guides-page__loading">데이터를 불러오는 중...</div>;
  }

  if (isError) {
    return (
      <div className="usage-guides-page__error">
        <p>데이터를 불러오는데 실패했습니다.</p>
        <p>{error instanceof Error ? error.message : '알 수 없는 오류'}</p>
        <Button onClick={() => refetch()}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="usage-guides-page">
      <div className="usage-guides-page__header">
        <h1 className="usage-guides-page__title">사용 가이드 관리</h1>
        <span className="usage-guides-page__count">
          {guides?.length || 0}개 카테고리, {guides?.reduce((sum, g) => sum + g.items.length, 0) || 0}개 항목
        </span>
      </div>

      <div className="usage-guides-page__list">
        {guides?.map((guide) => (
          <div key={guide._id} className="usage-guides-page__category">
            <div
              className={`usage-guides-page__category-header ${expandedGuide === guide._id ? 'expanded' : ''}`}
              onClick={() => toggleExpand(guide._id)}
            >
              <div className="usage-guides-page__category-info">
                <span className={`usage-guides-page__category-icon usage-guides-page__category-icon--${guide.colorClass}`}>
                  {GUIDE_CATEGORY_LABELS[guide.categoryId] || guide.categoryTitle}
                </span>
                <span className="usage-guides-page__category-count">
                  {guide.items.length}개 항목
                </span>
              </div>
              <div className="usage-guides-page__category-actions">
                <button
                  className={`usage-guides-page__toggle ${guide.isPublished ? 'usage-guides-page__toggle--published' : 'usage-guides-page__toggle--unpublished'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePublished(guide);
                  }}
                >
                  {guide.isPublished ? '게시' : '미게시'}
                </button>
                <span className="usage-guides-page__chevron">
                  {expandedGuide === guide._id ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {expandedGuide === guide._id && (
              <div className="usage-guides-page__items">
                <div className="usage-guides-page__items-header">
                  <Button size="sm" onClick={() => openAddItemModal(guide)}>
                    + 항목 추가
                  </Button>
                </div>

                {guide.items.length === 0 ? (
                  <div className="usage-guides-page__empty-items">
                    등록된 항목이 없습니다.
                  </div>
                ) : (
                  <table className="usage-guides-page__items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>순서</th>
                        <th style={{ width: '150px' }}>ID</th>
                        <th>제목</th>
                        <th style={{ width: '60px' }}>단계</th>
                        <th style={{ width: '120px' }}>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guide.items
                        .sort((a, b) => a.order - b.order)
                        .map((item) => (
                          <tr key={item.id}>
                            <td className="usage-guides-page__item-order">{item.order}</td>
                            <td className="usage-guides-page__item-id">{item.id}</td>
                            <td className="usage-guides-page__item-title">{item.title}</td>
                            <td>{item.steps.length}개</td>
                            <td>
                              <div className="usage-guides-page__item-actions">
                                <button
                                  className="usage-guides-page__action-btn usage-guides-page__action-btn--edit"
                                  onClick={() => openEditItemModal(guide, item)}
                                >
                                  수정
                                </button>
                                <button
                                  className="usage-guides-page__action-btn usage-guides-page__action-btn--delete"
                                  onClick={() => handleDeleteItem(guide, item)}
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 항목 추가/수정 모달 */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={closeItemModal}
        title={editingItem ? '가이드 항목 수정' : '새 가이드 항목'}
        size="lg"
      >
        <form onSubmit={handleItemSubmit} className="usage-guides-page__form">
          {!editingItem && (
            <div className="usage-guides-page__form-row">
              <label className="usage-guides-page__form-label">항목 ID</label>
              <input
                type="text"
                className="usage-guides-page__form-input"
                value={itemFormData.itemId}
                onChange={(e) => setItemFormData({ ...itemFormData, itemId: e.target.value })}
                placeholder="예: customer-register"
              />
            </div>
          )}

          <div className="usage-guides-page__form-row">
            <label className="usage-guides-page__form-label">제목</label>
            <input
              type="text"
              className="usage-guides-page__form-input"
              value={itemFormData.title}
              onChange={(e) => setItemFormData({ ...itemFormData, title: e.target.value })}
              placeholder="예: 새 고객 등록하기"
            />
          </div>

          <div className="usage-guides-page__form-row">
            <label className="usage-guides-page__form-label">설명</label>
            <textarea
              className="usage-guides-page__form-textarea"
              value={itemFormData.description}
              onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
              placeholder="간단한 설명"
              rows={2}
            />
          </div>

          <div className="usage-guides-page__form-row">
            <label className="usage-guides-page__form-label">순서</label>
            <input
              type="number"
              className="usage-guides-page__form-input usage-guides-page__form-input--short"
              value={itemFormData.order}
              onChange={(e) => setItemFormData({ ...itemFormData, order: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div className="usage-guides-page__form-row">
            <label className="usage-guides-page__form-label">단계별 안내</label>
            <div className="usage-guides-page__steps-list">
              {itemFormData.steps.map((step, index) => (
                <div key={index} className="usage-guides-page__step-row">
                  <span className="usage-guides-page__step-number">{index + 1}</span>
                  <input
                    type="text"
                    className="usage-guides-page__form-input"
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder={`${index + 1}단계 설명`}
                  />
                  <button
                    type="button"
                    className="usage-guides-page__step-remove"
                    onClick={() => removeStep(index)}
                    disabled={itemFormData.steps.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="usage-guides-page__step-add"
                onClick={addStep}
              >
                + 단계 추가
              </button>
            </div>
          </div>

          <div className="usage-guides-page__form-actions">
            <Button type="button" variant="secondary" onClick={closeItemModal}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={addItemMutation.isPending || updateItemMutation.isPending}
            >
              {editingItem ? '수정' : '추가'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UsageGuidesPage;
