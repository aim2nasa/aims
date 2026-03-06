/**
 * 사용 가이드 뷰
 * CenterPaneView 패턴 적용
 * 검색 기능 및 동적 카테고리 지원
 * @since 2025-12-18
 * @updated 2025-12-19 - 검색 기능, 추가 카테고리 아이콘
 */

import { useState, ReactNode, useMemo } from 'react';
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

// 카테고리 아이콘들
const GettingStartedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0.85"/>
  </svg>
);

const CustomerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <circle cx="12" cy="8" r="4" opacity="0.85"/>
    <path d="M12 14c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z" opacity="0.85"/>
  </svg>
);

const ContractIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M20 7h-4V3c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v4H4c-.55 0-1 .45-1 1v12c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V8c0-.55-.45-1-1-1zM9 4h6v3H9V4z" opacity="0.85"/>
  </svg>
);

const DocumentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity="0.85"/>
    <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const BatchImportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" opacity="0.85"/>
  </svg>
);

const AdvancedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" opacity="0.85"/>
  </svg>
);

const AccountIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" opacity="0.85"/>
  </svg>
);

const TipsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" opacity="0.85"/>
  </svg>
);

const TerminologyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" opacity="0.85"/>
  </svg>
);

// 고객·계약·문서 등록 (AR 업로드)
const DocRegisterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" opacity="0.85"/>
    <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 18v-6m-3 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// 고객 수동등록
const CustomerRegisterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <circle cx="9" cy="7" r="4" opacity="0.85"/>
    <path d="M9 13c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z" opacity="0.85"/>
    <path d="M19 8v6m-3-3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// 고객 일괄등록 (엑셀)
const ExcelImportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" opacity="0.85"/>
    <path d="M7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm6 0h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="1"/>
  </svg>
);

// 문서 일괄등록 (폴더)
const BatchDocumentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" opacity="0.85"/>
    <path d="M12 17v-6m-3 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// 전체고객보기
const CustomersAllIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <circle cx="9" cy="7" r="3" opacity="0.85"/>
    <path d="M9 12c-3.5 0-6 1.5-6 4v1h12v-1c0-2.5-2.5-4-6-4z" opacity="0.85"/>
    <circle cx="17" cy="8" r="2.5" opacity="0.6"/>
    <path d="M17 12c2 0 4 1 4 3v1h-4" opacity="0.6"/>
  </svg>
);

// 전체문서보기
const DocumentsAllIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M4 4h5v5H4zm6 0h5v5h-5zm6 0h5v5h-5zM4 10h5v5H4zm6 0h5v5h-5zm6 0h5v5h-5zM4 16h5v5H4zm6 0h5v5h-5zm6 0h5v5h-5z" opacity="0.85"/>
  </svg>
);

// 고객별 문서함
const DocExplorerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" opacity="0.85"/>
    <path d="M6 14h12M6 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// AutoClicker - LeftPane CustomMenu 아이콘 동일
const AutoClickerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <path d="M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z"/>
    <circle cx="19" cy="5" r="1.5" opacity="0.5"/>
    <circle cx="21" cy="10" r="1" opacity="0.35"/>
  </svg>
);

// AR Annual Report - 고객·계약·문서 등록 페이지 아이콘 동일
const AnnualReportIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="usage-guide-view__category-svg">
    <path d="M3 3V21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 16L12 11L15 14L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 8H21V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// CRS 변액리포트 - 고객·계약·문서 등록 페이지 아이콘 동일
const CrsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="usage-guide-view__category-svg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// 가족·법인계약 (그룹 아이콘)
const FamilyContractIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <circle cx="9" cy="6" r="3" opacity="0.85"/>
    <circle cx="17" cy="7" r="2.5" opacity="0.6"/>
    <path d="M9 11c-3.5 0-6 1.5-6 4v1h12v-1c0-2.5-2.5-4-6-4z" opacity="0.85"/>
    <path d="M17 11c2.5 0 4 1 4 3v1h-5" opacity="0.6"/>
    <path d="M12 18h6v1c0 .5-.2 1-.8 1.2l-2.2.8-2.2-.8c-.6-.2-.8-.7-.8-1.2v-1z" opacity="0.5"/>
  </svg>
);

// AI 어시스턴트 - 헤더 AI 버튼 아이콘 동일 (말풍선 + AI 텍스트)
const AiAssistantIcon = () => (
  <svg width="18" height="18" viewBox="0 0 36 26" fill="none" className="usage-guide-view__category-svg">
    <path d="M8 2C4.68629 2 2 4.68629 2 8V14C2 17.3137 4.68629 20 8 20H9V24L15 20H28C31.3137 20 34 17.3137 34 14V8C34 4.68629 31.3137 2 28 2H8Z" fill="currentColor" opacity="0.85"/>
    <text x="18" y="12" textAnchor="middle" dominantBaseline="middle" fill="var(--color-bg-primary, white)" fontSize="12" fontWeight="800" fontFamily="system-ui, -apple-system, sans-serif">AI</text>
  </svg>
);

// 모바일 (스마트폰 아이콘)
const MobileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="usage-guide-view__category-svg">
    <rect x="5" y="1" width="14" height="22" rx="3" opacity="0.85"/>
    <rect x="7" y="4" width="10" height="14" rx="1" fill="currentColor" opacity="0.3"/>
    <circle cx="12" cy="20" r="1" fill="currentColor" opacity="0.4"/>
  </svg>
);

interface UsageGuideViewProps {
  visible: boolean;
  onClose: () => void;
}

// 카테고리 아이콘 매핑 (확장됨)
const CATEGORY_ICONS: Record<string, ReactNode> = {
  'getting-started': <GettingStartedIcon />,
  'doc-register': <DocRegisterIcon />,
  'customer-register': <CustomerRegisterIcon />,
  'excel-import': <ExcelImportIcon />,
  'batch-document': <BatchDocumentIcon />,
  'customers-all': <CustomersAllIcon />,
  'documents-all': <DocumentsAllIcon />,
  'doc-explorer': <DocExplorerIcon />,
  terminology: <TerminologyIcon />,
  autoclicker: <AutoClickerIcon />,
  ar: <AnnualReportIcon />,
  crs: <CrsIcon />,
  'family-contract': <FamilyContractIcon />,
  'ai-assistant': <AiAssistantIcon />,
  mobile: <MobileIcon />,
};


export default function UsageGuideView({
  visible,
  onClose,
}: UsageGuideViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // 검색 필터링된 가이드
  const filteredGuides = useMemo(() => {
    let result = [...guides].sort((a, b) => a.order - b.order);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.map(guide => {
        // 아이템 필터링: 제목, 설명, 단계에서 검색
        const filteredItems = (guide.items || []).filter(item => {
          const titleMatch = item.title?.toLowerCase().includes(query);
          const descMatch = item.description?.toLowerCase().includes(query);
          const stepsMatch = (item.steps || []).some(step =>
            step.toLowerCase().includes(query)
          );
          return titleMatch || descMatch || stepsMatch;
        });

        return {
          ...guide,
          items: filteredItems
        };
      }).filter(guide => guide.items.length > 0);

      // 검색 결과가 있으면 모든 카테고리/아이템 자동 펼침
      if (result.length > 0) {
        const allCategoryIds = result.map(g => g.categoryId);
        const allItemIds = result.flatMap(g => g.items.map(i => i.id));

        // 자동 펼침 (한 번만)
        if (!expandedCategories.some(id => allCategoryIds.includes(id))) {
          setExpandedCategories(allCategoryIds);
          setExpandedItems(allItemIds);
        }
      }
    }

    return result;
  }, [guides, searchQuery]);

  // 검색어 클리어 시 접기
  const handleClearSearch = () => {
    setSearchQuery('');
    setExpandedCategories([]);
    setExpandedItems([]);
  };

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
          {/* 검색 입력 */}
          <div className="usage-guide-view__search">
            <svg className="usage-guide-view__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              className="usage-guide-view__search-input"
              placeholder="가이드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="usage-guide-view__search-clear"
                onClick={handleClearSearch}
                title="검색어 지우기"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>

          {/* 검색 결과 카운트 */}
          {searchQuery && (
            <div className="usage-guide-view__search-result">
              {filteredGuides.length > 0 ? (
                <span>
                  {filteredGuides.reduce((sum, g) => sum + g.items.length, 0)}개의 가이드를 찾았습니다.
                </span>
              ) : (
                <span>검색 결과가 없습니다.</span>
              )}
            </div>
          )}

          {/* 가이드 목록 */}
          {filteredGuides.length === 0 ? (
            <div className="usage-guide-view__empty">
              {searchQuery
                ? `"${searchQuery}"에 대한 검색 결과가 없습니다.`
                : '등록된 사용 가이드가 없습니다.'}
            </div>
          ) : (
            filteredGuides.map(category => (
                <div key={category._id} className="usage-guide-view__category">
                  <div
                    className={`usage-guide-view__category-header ${expandedCategories.includes(category.categoryId) ? 'expanded' : ''}`}
                    onClick={() => toggleCategory(category.categoryId)}
                  >
                    <span className={`usage-guide-view__category-icon usage-guide-view__category-icon--${category.categoryId}`}>
                      {CATEGORY_ICONS[category.categoryId] || <DocumentIcon />}
                    </span>
                    <span className="usage-guide-view__category-title">{category.categoryTitle}</span>
                    <span className="usage-guide-view__category-count">{category.items.length}</span>
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
                              {item.steps && item.steps.length > 0 && (
                                <ol className="usage-guide-view__steps">
                                  {item.steps.map((step, index) => (
                                    <li key={index} className="usage-guide-view__step">{step}</li>
                                  ))}
                                </ol>
                              )}
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
