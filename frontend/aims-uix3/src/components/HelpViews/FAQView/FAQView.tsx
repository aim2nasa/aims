/**
 * FAQ 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState } from 'react';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
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

// FAQ 항목 타입
interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'general' | 'customer' | 'document' | 'contract' | 'account';
}

// 카테고리 라벨
const CATEGORY_LABELS: Record<FAQItem['category'], string> = {
  general: '일반',
  customer: '고객',
  document: '문서',
  contract: '계약',
  account: '계정',
};

// FAQ 데이터
const FAQ_DATA: FAQItem[] = [
  {
    id: '1',
    question: 'AIMS는 어떤 서비스인가요?',
    answer: 'AIMS(Agent Intelligent Management System)는 보험 설계사를 위한 지능형 문서 관리 시스템입니다. 고객 관리, 문서 관리, 계약 관리를 한 곳에서 효율적으로 수행할 수 있습니다.',
    category: 'general',
  },
  {
    id: '2',
    question: '고객 정보는 어떻게 등록하나요?',
    answer: '좌측 메뉴의 "빠른 작업 > 새 고객 등록"을 클릭하여 고객 정보를 입력할 수 있습니다. 개인 고객과 법인 고객 모두 등록 가능하며, 필수 항목(이름, 연락처)을 입력한 후 저장하면 됩니다.',
    category: 'customer',
  },
  {
    id: '3',
    question: '같은 이름의 고객을 여러 명 등록할 수 있나요?',
    answer: '아니요. 같은 설계사 내에서 고객명은 중복될 수 없습니다. 개인/법인 구분이나 활성/휴면 상태와 관계없이 동일한 이름의 고객은 등록할 수 없습니다. 동명이인의 경우 이름 뒤에 구분자를 추가해 주세요 (예: 홍길동A, 홍길동B).',
    category: 'customer',
  },
  {
    id: '4',
    question: '문서를 어떻게 업로드하나요?',
    answer: '고객을 선택한 상태에서 "새 문서 등록"을 클릭하거나, 파일을 직접 드래그 앤 드롭하여 업로드할 수 있습니다. PDF, 이미지(JPG, PNG), 문서 파일(DOC, DOCX) 등 다양한 형식을 지원합니다.',
    category: 'document',
  },
  {
    id: '5',
    question: '여러 고객의 문서를 한 번에 등록할 수 있나요?',
    answer: '네, "빠른 작업 > 문서 일괄등록" 기능을 사용하면 됩니다. 고객명으로 폴더를 만들고 해당 폴더에 문서를 정리한 후, 상위 폴더를 선택하면 자동으로 각 고객에게 문서가 매칭됩니다.',
    category: 'document',
  },
  {
    id: '6',
    question: '문서 검색은 어떻게 하나요?',
    answer: '"문서 > 상세 문서검색" 메뉴에서 다양한 조건으로 문서를 검색할 수 있습니다. 문서 유형, 등록 기간, 고객명, 키워드 등으로 필터링이 가능합니다.',
    category: 'document',
  },
  {
    id: '7',
    question: '계약 정보는 어떻게 등록하나요?',
    answer: '"빠른 작업 > 고객·계약 일괄등록" 기능을 통해 엑셀 파일로 계약 정보를 일괄 등록할 수 있습니다. 양식에 맞게 작성된 엑셀 파일을 업로드하면 자동으로 고객과 계약이 등록됩니다.',
    category: 'contract',
  },
  {
    id: '8',
    question: '계약 상태는 어떤 것들이 있나요?',
    answer: '계약 상태는 "정상", "완납", "실효", "해지", "만기" 등이 있습니다. 각 상태에 따라 계약 목록에서 다른 색상으로 표시됩니다.',
    category: 'contract',
  },
  {
    id: '9',
    question: '비밀번호를 변경하고 싶습니다.',
    answer: '우측 상단의 프로필 메뉴에서 "계정 설정"을 클릭하면 비밀번호를 변경할 수 있습니다.',
    category: 'account',
  },
  {
    id: '10',
    question: '로그아웃은 어떻게 하나요?',
    answer: '우측 상단의 프로필 메뉴에서 "로그아웃"을 클릭하면 됩니다.',
    category: 'account',
  },
];

export default function FAQView({
  visible,
  onClose,
}: FAQViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FAQItem['category'] | 'all'>('all');

  // 항목 토글
  const toggleItem = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // 필터된 FAQ
  const filteredFAQ = selectedCategory === 'all'
    ? FAQ_DATA
    : FAQ_DATA.filter(item => item.category === selectedCategory);

  return (
    <CenterPaneView
      visible={visible}
      title="자주 묻는 질문"
      titleIcon={<FAQIcon />}
      onClose={onClose}
      className="faq-view"
    >
      <div className="faq-view__content">
        {/* 카테고리 필터 */}
        <div className="faq-view__filters">
          <button
            className={`faq-view__filter ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            전체
          </button>
          {(Object.entries(CATEGORY_LABELS) as [FAQItem['category'], string][]).map(([key, label]) => (
            <button
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
              key={item.id}
              className={`faq-view__item ${expandedId === item.id ? 'expanded' : ''}`}
            >
              <div
                className="faq-view__question"
                onClick={() => toggleItem(item.id)}
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

              {expandedId === item.id && (
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
    </CenterPaneView>
  );
}
