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
          '고객명(필수)과 연락처, 이메일, 주소 등을 입력합니다.',
          '"등록하기" 버튼을 클릭하여 저장합니다.',
          '💡 입력 중 페이지를 벗어나도 임시저장되어 다음에 이어서 작성할 수 있습니다.',
        ],
      },
      {
        id: 'customer-batch',
        title: '고객 일괄등록',
        description: '엑셀 파일로 여러 고객을 한 번에 등록합니다. 개인 고객만, 법인 고객만, 또는 둘 다 등록할 수 있습니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다 (개인고객/법인고객/계약 3개 시트 포함).',
          '등록할 고객 유형에 맞는 시트를 작성합니다:',
          '  • 개인 고객만: "개인고객" 시트만 작성',
          '  • 법인 고객만: "법인고객" 시트만 작성',
          '  • 개인+법인 모두: 두 시트 모두 작성',
          '작성된 엑셀 파일을 업로드합니다.',
          '"검증" 버튼을 클릭하여 데이터를 확인합니다.',
          '검증 완료 후 "일괄등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'customer-search',
        title: '고객 검색하기',
        description: '등록된 고객을 검색하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"를 선택합니다.',
          '상단 검색창에 고객명, 전화번호, 또는 이메일을 입력합니다.',
          'Enter를 누르면 검색 결과가 표시됩니다.',
          '원하는 고객을 클릭하면 우측에 상세 정보가 표시됩니다.',
        ],
      },
      {
        id: 'customer-filter',
        title: '고객 필터링',
        description: '조건에 맞는 고객만 보는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"를 선택합니다.',
          '상단의 필터 옵션에서 조건을 선택합니다:',
          '  • 상태 필터: 전체 / 활성 / 휴면',
          '  • 정렬: 고객명, 등록일, 연락처 등',
          '  • 페이지당 표시 개수: 10 / 15 / 20 / 50 / 100개',
        ],
      },
      {
        id: 'customer-detail',
        title: '고객 상세보기',
        description: '고객의 상세 정보를 확인하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"에서 고객을 클릭합니다.',
          '우측 패널에 고객의 상세 정보가 표시됩니다.',
          '기본 정보, 연락처, 주소, 계약, 문서 등 탭을 클릭하여 확인합니다.',
          '💡 고객을 더블클릭하면 전체 화면으로 상세 정보를 볼 수 있습니다.',
        ],
      },
      {
        id: 'customer-edit',
        title: '고객 정보 수정',
        description: '등록된 고객 정보를 수정하는 방법입니다.',
        steps: [
          '고객을 선택하여 상세 정보를 엽니다.',
          '수정할 정보가 있는 탭으로 이동합니다.',
          '"수정" 버튼을 클릭하여 편집 모드로 전환합니다.',
          '정보를 수정한 후 "저장" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'customer-map',
        title: '지역별 고객보기',
        description: '고객의 주소를 기반으로 지역별로 분류하여 보여줍니다. 주소가 등록된 고객만 해당 지역에 표시됩니다.',
        steps: [
          '"고객 > 지역별 고객 보기"를 선택합니다.',
          '왼쪽 트리에서 시/도를 클릭하면 하위 시/군/구가 펼쳐집니다.',
          '지역을 선택하면 해당 지역의 고객 목록이 표시됩니다.',
          '폴더 옆 숫자는 해당 지역의 고객 수입니다.',
          '주소가 등록되지 않은 고객은 "기타" 폴더에 표시됩니다.',
          '고객 이름을 클릭하면 상세 정보를 볼 수 있습니다.',
        ],
      },
      {
        id: 'customer-relation',
        title: '관계별 고객보기',
        description: '가족 관계나 법인 소속을 기준으로 고객을 그룹화하여 보여줍니다.',
        steps: [
          '"고객 > 관계별 고객 보기"를 선택합니다.',
          '가족 폴더: 가족 대표(👑)를 중심으로 배우자, 자녀 등이 함께 표시됩니다.',
          '법인 폴더: 법인명 아래에 소속 직원/임원이 표시됩니다.',
          '고객 이름을 클릭하면 우측에 상세 정보가 표시됩니다.',
          '고객 이름을 더블클릭하면 전체 고객 보기로 이동합니다.',
          '"⚠️ 미설정" 폴더: 관계가 설정되지 않은 고객입니다.',
          '미설정 고객을 클릭하면 빠른 등록 패널에서 관계를 설정할 수 있습니다.',
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
          '"빠른 작업 > 새 문서 등록"을 클릭합니다.',
          '먼저 문서를 등록할 고객을 선택합니다.',
          '파일을 드래그 앤 드롭하거나 클릭하여 파일을 선택합니다.',
          '문서 유형을 선택하고 필요시 메모를 입력합니다.',
          '업로드가 완료되면 "처리 상태 보기"를 클릭하여 결과를 확인합니다.',
          '💡 PDF, 이미지(JPG, PNG), 문서 파일(DOC, DOCX) 등을 지원합니다.',
        ],
      },
      {
        id: 'document-batch',
        title: '문서 일괄등록',
        description: '여러 고객의 문서를 폴더 구조로 한 번에 등록합니다. 폴더명이 고객명과 자동 매칭됩니다.',
        steps: [
          '"빠른 작업 > 문서 일괄등록"을 선택합니다.',
          '폴더 구조 준비: 각 고객명으로 폴더를 만들고, 해당 폴더 안에 문서 파일을 넣습니다.',
          '준비된 폴더를 드래그 앤 드롭하거나 클릭하여 선택합니다.',
          '폴더명과 고객명이 자동으로 매칭됩니다.',
          '매칭되지 않은 폴더는 드롭다운에서 고객을 직접 선택합니다.',
          '문서 유형을 선택한 후 "업로드 시작" 버튼을 클릭합니다.',
          '업로드 완료 후 결과 요약을 확인합니다.',
        ],
      },
      {
        id: 'document-search',
        title: '문서 검색하기',
        description: '등록된 문서를 검색하는 방법입니다.',
        steps: [
          '"문서 > 상세 문서검색"을 선택합니다.',
          '검색어를 입력합니다.',
          '특정 고객의 문서만 검색하려면 "고객선택" 버튼을 클릭합니다.',
          '검색 모드를 선택합니다: 키워드 검색 또는 AI 검색(실험적)',
          '"검색" 버튼을 클릭합니다.',
          '검색 결과에서 문서를 클릭하면 미리보기를 볼 수 있습니다.',
        ],
      },
      {
        id: 'document-library',
        title: '전체 문서 보기',
        description: '등록된 모든 문서를 한눈에 확인합니다.',
        steps: [
          '"문서 > 전체 문서 보기"를 선택합니다.',
          '등록된 모든 문서가 목록으로 표시됩니다.',
          '문서를 클릭하면 미리보기가 표시됩니다.',
          '문서 유형, 등록일 등으로 정렬할 수 있습니다.',
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
        description: '엑셀의 3개 시트(개인고객/법인고객/계약)를 사용하여 고객과 계약을 유연하게 등록합니다.',
        steps: [
          '"빠른 작업 > 고객·계약 일괄등록"을 선택합니다.',
          '엑셀 양식을 다운로드합니다 (개인고객/법인고객/계약 3개 시트 포함).',
          '필요한 시트만 작성합니다:',
          '  • 고객만 등록: 개인고객 또는 법인고객 시트만 작성',
          '  • 계약만 등록: 계약 시트만 작성 (기존 고객명과 매칭)',
          '  • 고객+계약 함께 등록: 해당 시트 모두 작성',
          '작성된 엑셀 파일을 드래그 앤 드롭하거나 클릭하여 업로드합니다.',
          '"검증" 버튼을 클릭합니다 (개인→법인→계약 순서로 검증).',
          '오류가 있으면 수정 후 다시 검증합니다.',
          '검증 완료 후 "일괄등록" 버튼을 클릭합니다.',
        ],
      },
      {
        id: 'contract-view',
        title: '계약 조회하기',
        description: '고객의 계약 정보를 조회하는 방법입니다.',
        steps: [
          '"고객 > 전체 고객 보기"에서 고객을 선택합니다.',
          '우측 패널에서 "계약" 탭을 클릭합니다.',
          '해당 고객의 계약 목록이 표시됩니다 (상품명, 계약일, 증권번호, 보험료, 납입상태 등).',
          '💡 또는 "계약 > 전체 계약 보기"에서 모든 계약을 한눈에 볼 수 있습니다.',
        ],
      },
      {
        id: 'contract-all',
        title: '전체 계약 보기',
        description: '등록된 모든 계약을 한눈에 확인합니다.',
        steps: [
          '"계약 > 전체 계약 보기"를 선택합니다.',
          '모든 고객의 계약이 목록으로 표시됩니다.',
          '고객명을 클릭하면 해당 고객의 상세 정보로 이동합니다.',
          '상품명, 계약일, 보험료, 납입상태 등으로 정렬할 수 있습니다.',
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
