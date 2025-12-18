/**
 * 사용 가이드 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { helpApi, type UsageGuide } from '@/features/help/api';
import './UsageGuideView.css';

// 책 아이콘 (타이틀용)
const BookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__title-icon">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" opacity="0.85"/>
  </svg>
);

// 카테고리 아이콘들 (LeftPane과 동일)
const CustomerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <circle cx="12" cy="8" r="4" opacity="0.85"/>
    <path d="M12 14c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z" opacity="0.85"/>
  </svg>
);

const DocumentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity="0.85"/>
    <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const ContractIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M20 7h-4V3c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v4H4c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V8c0-.55-.45-1-1-1zM9 4h6v3H9V4z" opacity="0.85"/>
  </svg>
);

interface UsageGuideViewProps {
  visible: boolean;
  onClose: () => void;
}

// 카테고리 아이콘 매핑
const CATEGORY_ICONS: Record<string, ReactNode> = {
  customer: <CustomerIcon />,
  document: <DocumentIcon />,
  contract: <ContractIcon />,
};

export default function UsageGuideView({
  visible,
  onClose,
}: UsageGuideViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['customer']);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // 사용 가이드 목록 조회
  const { data: guides = [], isLoading, isError } = useQuery({
    queryKey: ['usage-guides'],
    queryFn: helpApi.getUsageGuides,
    enabled: visible,
  });

  // 카테고리 토글
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // 아이템 토글
  const toggleItem = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // order 기준 정렬
  const sortedGuides = [...guides].sort((a, b) => a.order - b.order);

  return (
    <CenterPaneView
      visible={visible}
      title="사용 가이드"
      titleIcon={<BookIcon />}
      onClose={onClose}
      className="usage-guide-view"
    >
      {isLoading ? (
        <div className="usage-guide-view__empty">
          불러오는 중...
        </div>
      ) : isError ? (
        <div className="usage-guide-view__empty">
          사용 가이드를 불러오는데 실패했습니다.
        </div>
      ) : (
        <div className="usage-guide-view__content">
          {sortedGuides.length === 0 ? (
            <div className="usage-guide-view__empty">
              등록된 사용 가이드가 없습니다.
            </div>
          ) : (
            sortedGuides.map(category => (
              <div key={category._id} className="usage-guide-view__category">
                <div
                  className={`usage-guide-view__category-header usage-guide-view__category-header--${category.colorClass} ${expandedCategories.includes(category.categoryId) ? 'expanded' : ''}`}
                  onClick={() => toggleCategory(category.categoryId)}
                >
                  <span className={`usage-guide-view__category-icon usage-guide-view__category-icon--${category.colorClass}`}>
                    {CATEGORY_ICONS[category.categoryId] || <DocumentIcon />}
                  </span>
                  <span className="usage-guide-view__category-title">{category.categoryTitle}</span>
                  <svg
                    className="usage-guide-view__chevron"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                  </svg>
                </div>

                {expandedCategories.includes(category.categoryId) && (
                  <div className="usage-guide-view__items">
                    {[...category.items].sort((a, b) => a.order - b.order).map(item => (
                      <div key={item.id} className="usage-guide-view__item">
                        <div
                          className={`usage-guide-view__item-header ${expandedItems.includes(item.id) ? 'expanded' : ''}`}
                          onClick={() => toggleItem(item.id)}
                        >
                          <span className="usage-guide-view__item-title">{item.title}</span>
                          <svg
                            className="usage-guide-view__chevron"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                          </svg>
                        </div>

                        {expandedItems.includes(item.id) && (
                          <div className="usage-guide-view__item-content">
                            <p className="usage-guide-view__item-description">{item.description}</p>
                            <ol className="usage-guide-view__steps">
                              {item.steps.map((step, index) => (
                                <li key={index} className="usage-guide-view__step">{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </CenterPaneView>
  );
}
