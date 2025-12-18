/**
 * FAQ 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { helpApi, type FAQ, type FAQCategory } from '@/features/help/api';
import './FAQView.css';

// FAQ 아이콘 (말풍선 물음표)
const FAQIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="faq-view__title-icon">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" opacity="0.85"/>
    <text x="12" y="13" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--color-bg-primary, white)">?</text>
  </svg>
);

interface FAQViewProps {
  visible: boolean;
  onClose: () => void;
}

export default function FAQView({
  visible,
  onClose,
}: FAQViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // FAQ 카테고리 목록 조회 (DB에서 동적으로)
  const { data: categories = [] } = useQuery({
    queryKey: ['faq-categories'],
    queryFn: helpApi.getFAQCategories,
    enabled: visible,
  });

  // FAQ 목록 조회
  const { data: faqs = [], isLoading, isError } = useQuery({
    queryKey: ['faqs'],
    queryFn: helpApi.getFAQs,
    enabled: visible,
  });

  // 항목 토글
  const toggleItem = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // 필터된 FAQ (카테고리 + 검색어 + order 기준 정렬)
  const filteredFAQ = faqs
    .filter(item => {
      // 카테고리 필터
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // 검색어 필터
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => a.order - b.order);

  return (
    <CenterPaneView
      visible={visible}
      title="자주 묻는 질문"
      titleIcon={<FAQIcon />}
      onClose={onClose}
      className="faq-view"
    >
      {isLoading ? (
        <div className="faq-view__empty">
          불러오는 중...
        </div>
      ) : isError ? (
        <div className="faq-view__empty">
          FAQ를 불러오는데 실패했습니다.
        </div>
      ) : (
        <div className="faq-view__content">
          {/* 검색 입력 */}
          <div className="faq-view__search">
            <svg className="faq-view__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              className="faq-view__search-input"
              placeholder="질문 또는 답변 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="faq-view__search-clear"
                onClick={() => setSearchQuery('')}
                title="검색어 지우기"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>

          {/* 카테고리 필터 (DB에서 동적으로) */}
          <div className="faq-view__filters">
            <button
              type="button"
              className={`faq-view__filter ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.key}
                className={`faq-view__filter ${selectedCategory === cat.key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* FAQ 목록 */}
          <div className="faq-view__list">
            {filteredFAQ.map(item => (
              <div
                key={item._id}
                className={`faq-view__item ${expandedId === item._id ? 'expanded' : ''}`}
              >
                <div
                  className="faq-view__question"
                  onClick={() => toggleItem(item._id)}
                >
                  <span className="faq-view__question-icon">Q</span>
                  <span className="faq-view__question-text">{item.question}</span>
                  <svg
                    className="faq-view__chevron"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                  </svg>
                </div>

                {expandedId === item._id && (
                  <div className="faq-view__answer">
                    <span className="faq-view__answer-icon">A</span>
                    <span className="faq-view__answer-text">{item.answer}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredFAQ.length === 0 && (
            <div className="faq-view__empty">
              {searchQuery
                ? `"${searchQuery}"에 대한 검색 결과가 없습니다.`
                : '해당 카테고리에 등록된 질문이 없습니다.'}
            </div>
          )}
        </div>
      )}
    </CenterPaneView>
  );
}
