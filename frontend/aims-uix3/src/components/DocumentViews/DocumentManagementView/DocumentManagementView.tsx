/**
 * DocumentManagementView Component
 * @since 1.0.0
 *
 * 문서 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { QuickActionButton } from '@/shared/ui/QuickActionButton';
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import { getDocumentStatistics } from '@/services/DocumentService';
import './DocumentManagementView.css';

interface DocumentManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
}

/**
 * DocumentManagementView React 컴포넌트
 *
 * 문서 관리 대시보드 - Mock 데이터 사용 (Phase 1)
 * Phase 2에서 실제 API 연동 예정
 *
 * @example
 * ```tsx
 * <DocumentManagementView
 *   visible={isVisible}
 *   onClose={handleClose}
 * />
 * ```
 */
export const DocumentManagementView: React.FC<DocumentManagementViewProps> = ({
  visible,
  onClose,
}) => {
  // 문서 통계 API 연동
  const { data: stats, isLoading } = useQuery({
    queryKey: ['documentStatistics'],
    queryFn: getDocumentStatistics,
  });

  const mockRecentActivities: RecentActivityItem[] = [
    {
      id: '1',
      title: '보험청구서.pdf',
      subtitle: '문서 등록',
      timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5분 전
      icon: <SFSymbol name="doc.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '2',
      title: '계약서_2025.pdf',
      subtitle: 'OCR 처리 완료',
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30분 전
      icon: <SFSymbol name="doc.text" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '3',
      title: '진단서.jpg',
      subtitle: '태그 분류 완료',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2시간 전
      icon: <SFSymbol name="tag.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '4',
      title: '영수증_스캔.pdf',
      subtitle: '문서 등록',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5시간 전
      icon: <SFSymbol name="doc.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
    {
      id: '5',
      title: '증명서.pdf',
      subtitle: 'OCR 처리 완료',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1일 전
      icon: <SFSymbol name="doc.text" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
    },
  ];

  // 빠른 액션 핸들러 (Phase 2에서 실제 네비게이션 추가)
  const handleDocumentRegister = () => {
    console.log('[DocumentManagementView] 문서 등록 클릭 (Phase 2에서 구현)');
  };

  const handleDocumentSearch = () => {
    console.log('[DocumentManagementView] 문서 검색 클릭 (Phase 2에서 구현)');
  };

  const handleDocumentLibrary = () => {
    console.log('[DocumentManagementView] 문서 라이브러리 클릭 (Phase 2에서 구현)');
  };

  return (
    <CenterPaneView
      visible={visible}
      title="문서 관리"
      titleIcon={<SFSymbol name="doc" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="document-management-view"
    >
      <div className="document-management-view__content">
        {/* 통계 섹션 */}
        <section className="document-management-view__section">
          <h2 className="document-management-view__section-title">
            <SFSymbol name="chart.bar" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            문서 통계
          </h2>
          <div className="document-management-view__stats-grid">
            <StatCard
              title="전체 문서"
              value={stats?.total ?? 0}
              icon={<SFSymbol name="doc.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="primary"
              isLoading={isLoading}
            />
            <StatCard
              title="처리 대기"
              value={stats?.pending ?? 0}
              icon={<SFSymbol name="clock" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="warning"
              isLoading={isLoading}
            />
            <StatCard
              title="OCR 완료"
              value={stats?.stages.ocr ?? 0}
              icon={<SFSymbol name="doc.text" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isLoading}
            />
            <StatCard
              title="태그 완료"
              value={stats?.completed ?? 0}
              icon={<SFSymbol name="tag.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* 빠른 액션 섹션 */}
        <section className="document-management-view__section">
          <h2 className="document-management-view__section-title">
            <SFSymbol name="bolt.fill" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            빠른 액션
          </h2>
          <div className="document-management-view__actions-grid">
            <QuickActionButton
              icon={<SFSymbol name="plus.circle.fill" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="문서 등록"
              onClick={handleDocumentRegister}
              variant="primary"
            />
            <QuickActionButton
              icon={<SFSymbol name="magnifyingglass" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="문서 검색"
              onClick={handleDocumentSearch}
            />
            <QuickActionButton
              icon={<SFSymbol name="folder.fill" size={SFSymbolSize.TITLE_1} weight={SFSymbolWeight.MEDIUM} />}
              label="문서 라이브러리"
              onClick={handleDocumentLibrary}
            />
          </div>
        </section>

        {/* 최근 활동 섹션 */}
        <section className="document-management-view__section">
          <h2 className="document-management-view__section-title">
            <SFSymbol name="clock.fill" size={SFSymbolSize.BODY} weight={SFSymbolWeight.SEMIBOLD} />
            최근 활동
          </h2>
          <div className="document-management-view__recent-activity">
            <RecentActivityList items={mockRecentActivities} maxItems={5} />
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default DocumentManagementView
