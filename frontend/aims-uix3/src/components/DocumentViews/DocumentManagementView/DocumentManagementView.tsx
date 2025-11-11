/**
 * DocumentManagementView Component
 * @since 1.0.0
 *
 * 문서 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { QuickActionButton } from '@/shared/ui/QuickActionButton';
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import { getDocumentStatistics, getDocuments } from '@/services/DocumentService';
import './DocumentManagementView.css';

interface DocumentManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** View 변경 핸들러 */
  onNavigate: (view: string) => void;
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
  onNavigate,
}) => {
  // 문서 통계 API 연동
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['documentStatistics'],
    queryFn: getDocumentStatistics,
  });

  // 최근 문서 목록 조회
  const { data: recentDocuments, isLoading: isRecentLoading } = useQuery({
    queryKey: ['recentDocuments'],
    queryFn: () =>
      getDocuments({
        limit: 5,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  // 최근 활동 데이터 변환
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    if (!recentDocuments?.documents) return [];

    return recentDocuments.documents.slice(0, 5).map((doc) => {
      // 문서 상태에 따라 활동 종류 결정
      const getActivityInfo = (status: string) => {
        if (status === 'completed') {
          return {
            subtitle: '처리 완료',
            icon: <SFSymbol name="checkmark.circle.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
          };
        } else if (status === 'processing') {
          return {
            subtitle: '처리 중',
            icon: <SFSymbol name="arrow.clockwise" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
          };
        } else if (status === 'error') {
          return {
            subtitle: '처리 실패',
            icon: <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
          };
        } else {
          return {
            subtitle: '문서 등록',
            icon: <SFSymbol name="doc.fill" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />,
          };
        }
      };

      const activityInfo = getActivityInfo(doc.status || 'pending');

      return {
        id: doc._id || String(Math.random()),
        title: doc.filename || doc.originalName || '제목 없음',
        subtitle: activityInfo.subtitle,
        timestamp: doc.createdAt ? new Date(doc.createdAt) : new Date(),
        icon: activityInfo.icon,
      };
    });
  }, [recentDocuments]);

  // 빠른 액션 핸들러
  const handleDocumentRegister = () => {
    onNavigate('documents-register');
    onClose();
  };

  const handleDocumentSearch = () => {
    onNavigate('documents-search');
    onClose();
  };

  const handleDocumentLibrary = () => {
    onNavigate('documents-library');
    onClose();
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
              isLoading={isStatsLoading}
            />
            <StatCard
              title="처리 대기"
              value={stats?.pending ?? 0}
              icon={<SFSymbol name="clock" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="warning"
              isLoading={isStatsLoading}
            />
            <StatCard
              title="OCR 완료"
              value={stats?.stages.ocr ?? 0}
              icon={<SFSymbol name="doc.text" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isStatsLoading}
            />
            <StatCard
              title="태그 완료"
              value={stats?.completed ?? 0}
              icon={<SFSymbol name="tag.fill" size={SFSymbolSize.TITLE_2} weight={SFSymbolWeight.MEDIUM} />}
              color="success"
              isLoading={isStatsLoading}
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
            <RecentActivityList items={recentActivities} maxItems={5} isLoading={isRecentLoading} />
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default DocumentManagementView
