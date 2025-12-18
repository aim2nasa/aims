/**
 * 사용 가이드 뷰
 * CenterPaneView 패턴 적용
 * @since 2025-12-18
 */

import { useState, ReactNode } from 'react';
import { CenterPaneView } from '../../CenterPaneView/CenterPaneView';
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

// 가이드 항목 타입
interface GuideItem {
  id: string;
  title: string;
  description: string;
  steps: string[];
}

// 가이드 카테고리 타입
interface GuideCategory {
  id: string;
  title: string;
  icon: ReactNode;
  colorClass: string;
  items: GuideItem[];
}

// 가이드 데이터
const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    id: 'customer',
    title: '고객 관리',
    icon: <CustomerIcon />,
    colorClass: 'customer',
    items: [
      {
        id: 'customer-register',
        title: '새 고객 등록하기',
        description: '새로운 고객 정보를 시스템에 등록하는 방법입니다.',
        steps: [
          '좌측 메뉴에서 "빠른 작업 > 새 고객 등록"을 클릭합니다.',
          '고객 유형(개인/법인)을 선택합니다.',
          '필수 정보(이름, 연락처 등)를 입력합니다.',
          '"등록" 버튼을 클릭하여 저장합니다.',
        ],
      },
      {
        id: 'customer-batch',
        title: '고객 일괄등록',
        description: '엑셀 파일로 여러 고객을 한 번에 등록합니다. 개인 고객만, 법인 고객만, 또는 둘 다 등록할 수 있습니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다.',
          '등록할 고객 유형에 맞는 시트를 작성합니다 (개인/법인/계약 중 선택).',
          '개인 고객만 등록: "개인" 시트만 작성',
          '법인 고객만 등록: "법인" 시트만 작성',
          '개인+법인 모두 등록: 두 시트 모두 작성',
          '작성된 엑셀 파일을 업로드하고 "등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'customer-search',
        title: '고객 검색하기',
        description: '등록된 고객을 검색하는 방법입니다.',
        steps: [
          '상단 검색창에 고객명, 전화번호, 또는 이메일을 입력합니다.',
          'Enter를 누르거나 검색 아이콘을 클릭합니다.',
          '검색 결과에서 원하는 고객을 선택합니다.',
        ],
      },
      {
        id: 'customer-filter',
        title: '고객 필터링',
        description: '조건에 맞는 고객만 보는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"를 선택합니다.',
          '상단 필터 옵션에서 조건을 선택합니다.',
          '활성/휴면, 개인/법인 등으로 필터링할 수 있습니다.',
        ],
      },
      {
        id: 'customer-map',
        title: '지역별 고객보기',
        description: '고객의 주소를 기반으로 지도에서 고객 위치를 확인합니다. 주소가 정상 등록된 고객만 표시됩니다.',
        steps: [
          '"고객 > 지역별 고객보기"를 선택합니다.',
          '지도에 고객 위치가 마커로 표시됩니다.',
          '마커를 클릭하면 해당 고객 정보를 볼 수 있습니다.',
          '지도를 확대/축소하여 특정 지역의 고객을 확인합니다.',
          '주소가 등록되지 않은 고객은 지도에 표시되지 않습니다.',
        ],
      },
      {
        id: 'customer-relation',
        title: '관계별 고객보기',
        description: '개인 고객은 가족 대표를 중심으로 가족 구성원을 한눈에 파악하고, 법인 고객은 해당 법인과 관계된 개인(대표, 임원, 직원 등)을 확인할 수 있습니다.',
        steps: [
          '"고객 > 관계별 고객보기"를 선택합니다.',
          '가족 폴더: 👑 가족 대표를 중심으로 배우자, 부모, 자녀 등 가족 구성원이 표시됩니다.',
          '법인 폴더: 법인명 아래에 관계된 개인 고객(대표, 임원, 직원)이 표시됩니다.',
          '고객 이름 클릭 → 상세 정보 확인, 더블클릭 → 전체보기로 이동합니다.',
          '⚠️ 미설정: 관계가 없는 고객은 클릭하여 빠른 등록 패널에서 관계를 설정합니다.',
          '활용: 가족 보험 설계 시 가족 구성 파악, 법인 단체보험 영업 시 관계자 확인에 유용합니다.',
        ],
      },
    ],
  },
  {
    id: 'document',
    title: '문서 관리',
    icon: <DocumentIcon />,
    colorClass: 'document',
    items: [
      {
        id: 'document-upload',
        title: '문서 등록하기',
        description: '고객에게 문서를 등록하는 방법입니다.',
        steps: [
          '고객을 선택한 후 "새 문서 등록"을 클릭합니다.',
          '파일을 드래그 앤 드롭하거나 "파일 선택"을 클릭합니다.',
          '문서 유형을 선택합니다.',
          '"등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'document-batch',
        title: '문서 일괄등록',
        description: '여러 고객의 문서를 폴더 구조로 한 번에 등록합니다. 폴더명이 고객명과 매칭됩니다.',
        steps: [
          '"빠른 작업 > 문서 일괄등록"을 선택합니다.',
          '폴더 구조 준비: 각 고객명으로 폴더를 만들고, 해당 폴더에 문서를 넣습니다.',
          '상위 폴더를 선택하면 시스템이 자동으로 고객명을 매칭합니다.',
          '매칭 결과를 확인하고, 미매칭 고객은 수동으로 지정합니다.',
          '문서 유형을 선택한 후 "일괄 등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'document-search',
        title: '문서 검색하기',
        description: '등록된 문서를 검색하는 방법입니다.',
        steps: [
          '"문서 > 상세 문서검색"을 선택합니다.',
          '검색 조건(문서 유형, 기간, 키워드 등)을 입력합니다.',
          '"검색" 버튼을 클릭합니다.',
        ],
      },
    ],
  },
  {
    id: 'contract',
    title: '계약 관리',
    icon: <ContractIcon />,
    colorClass: 'contract',
    items: [
      {
        id: 'contract-import',
        title: '고객·계약 일괄등록',
        description: '엑셀의 3개 시트(개인/법인/계약)를 선택하여 고객과 계약을 유연하게 등록합니다. 고객만 또는 계약만 등록도 가능합니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다 (개인/법인/계약 3개 시트 포함).',
          '필요한 시트만 작성합니다:',
          '  - 고객만 등록: 개인 또는 법인 시트만 작성',
          '  - 계약만 등록: 계약 시트만 작성 (기존 고객에 매칭)',
          '  - 고객+계약 등록: 모든 시트 작성',
          '작성된 엑셀 파일을 업로드합니다.',
          '미리보기에서 매칭 결과를 확인하고 "등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'contract-view',
        title: '계약 조회하기',
        description: '고객의 계약 정보를 조회하는 방법입니다.',
        steps: [
          '고객을 선택합니다.',
          '우측 패널에서 "계약" 탭을 선택합니다.',
          '계약 목록에서 상세 정보를 확인합니다.',
        ],
      },
    ],
  },
];

export default function UsageGuideView({
  visible,
  onClose,
}: UsageGuideViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['customer']);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

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

  return (
    <CenterPaneView
      visible={visible}
      title="사용 가이드"
      titleIcon={<BookIcon />}
      onClose={onClose}
      className="usage-guide-view"
    >
      <div className="usage-guide-view__content">
        {GUIDE_CATEGORIES.map(category => (
          <div key={category.id} className="usage-guide-view__category">
            <div
              className={`usage-guide-view__category-header usage-guide-view__category-header--${category.colorClass} ${expandedCategories.includes(category.id) ? 'expanded' : ''}`}
              onClick={() => toggleCategory(category.id)}
            >
              <span className={`usage-guide-view__category-icon usage-guide-view__category-icon--${category.colorClass}`}>
                {category.icon}
              </span>
              <span className="usage-guide-view__category-title">{category.title}</span>
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

            {expandedCategories.includes(category.id) && (
              <div className="usage-guide-view__items">
                {category.items.map(item => (
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
        ))}
      </div>
    </CenterPaneView>
  );
}
