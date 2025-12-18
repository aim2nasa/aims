/**
 * FAQ 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
import { helpApi, FAQ_CATEGORY_LABELS, type FAQ } from '@/features/help/api';
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

type FAQCategory = FAQ['category'];

export default function FAQView({
  visible,
  onClose,
}: FAQViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FAQCategory | 'all'>('all');

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

  // 필터된 FAQ (order 기준 정렬)
  const filteredFAQ = (selectedCategory === 'all'
    ? faqs
    : faqs.filter(item => item.category === selectedCategory)
  ).sort((a, b) => a.order - b.order);

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
          {/* 카테고리 필터 */}
          <div className="faq-view__filters">
            <button
              type="button"
              className={`faq-view__filter ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              전체
            </button>
            {(Object.entries(FAQ_CATEGORY_LABELS) as [FAQCategory, string][]).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={`faq-view__filter ${selectedCategory === key ? 'active' : ''}`}
                onClick={() => setSelectedCategory(key)}
              >
                {label}
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
              해당 카테고리에 등록된 질문이 없습니다.
            </div>
          )}
        </div>
      )}
    </CenterPaneView>
  );
}
