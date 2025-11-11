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
import { RecentActivityList } from '@/shared/ui/RecentActivityList';
import type { RecentActivityItem } from '@/shared/ui/RecentActivityList';
import { UsageGuide } from '@/shared/ui/UsageGuide';
import type { GuideSection } from '@/shared/ui/UsageGuide';
import { RefreshButton } from '../../RefreshButton/RefreshButton';
import { getDocumentStatistics } from '@/services/DocumentService';
import { DocumentStatusService } from '@/services/DocumentStatusService';
import { DocumentUtils } from '@/entities/document';
import { Tooltip } from '@/shared/ui';
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
  /**
   * OCR 신뢰도를 5단계로 분류
   */
  const getOcrConfidenceLevel = (confidence: number): {
    color: string
    label: string
  } => {
    if (confidence >= 0.95) {
      return { color: 'excellent', label: '매우 높음' }
    } else if (confidence >= 0.85) {
      return { color: 'high', label: '높음' }
    } else if (confidence >= 0.70) {
      return { color: 'medium', label: '보통' }
    } else if (confidence >= 0.50) {
      return { color: 'low', label: '낮음' }
    } else {
      return { color: 'very-low', label: '매우 낮음' }
    }
  }

  /**
   * Document에서 OCR confidence 추출
   */
  const getOcrConfidence = (document: any): number | null => {
    // 1. document.ocr?.confidence 먼저 시도
    if (document.ocr && typeof document.ocr !== 'string') {
      const directConfidence = document.ocr.confidence
      if (directConfidence) {
        const parsed = parseFloat(directConfidence)
        if (!isNaN(parsed)) return parsed
      }
    }

    // 2. stages.ocr.message에서 파싱 시도
    const stageOcr = document.stages?.ocr
    if (stageOcr && typeof stageOcr !== 'string') {
      const ocrMessage = stageOcr.message
      if (ocrMessage && typeof ocrMessage === 'string') {
        const match = ocrMessage.match(/신뢰도:\s*([\d.]+)/)
        if (match && match[1]) {
          const parsed = parseFloat(match[1])
          if (!isNaN(parsed)) return parsed
        }
      }
    }

    return null
  }

  // 문서 통계 API 연동
  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats
  } = useQuery({
    queryKey: ['documentStatistics'],
    queryFn: getDocumentStatistics,
  });

  // 최근 문서 목록 조회 (DocumentStatusService 사용)
  const {
    data: recentDocuments,
    isLoading: isRecentLoading,
    isError: isRecentError,
    refetch: refetchRecent
  } = useQuery({
    queryKey: ['recentDocuments'],
    queryFn: () =>
      DocumentStatusService.getRecentDocuments(1, 5, 'uploadTime_desc'),
  });

  // 최근 활동 데이터 변환
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    if (!recentDocuments?.documents) return [];

    return recentDocuments.documents.slice(0, 5).map((doc) => {
      // 파일 타입 아이콘 생성 (문서 라이브러리와 동일)
      const fileIcon = DocumentUtils.getFileIcon(doc.mimeType, doc.filename || doc.originalName);
      const fileTypeClass = DocumentUtils.getFileTypeClass(doc.mimeType, doc.filename || doc.originalName);

      // 문서 상태에 따라 활동 종류 결정
      const getActivityInfo = (status: string) => {
        if (status === 'completed') {
          return {
            subtitle: '처리 완료',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-success)' }}>
                <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
                <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            ),
          };
        } else if (status === 'processing') {
          return {
            subtitle: '처리 중',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" style={{ color: 'var(--color-text-secondary)' }}>
                <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3"/>
                <path d="M10 2 A 8 8 0 0 1 18 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 10 10"
                    to="360 10 10"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </path>
              </svg>
            ),
          };
        } else if (status === 'error') {
          return {
            subtitle: '처리 실패',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-error)' }}>
                <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
                <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ),
          };
        } else {
          return {
            subtitle: '문서 등록',
            icon: (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-text-secondary)' }}>
                <rect x="4" y="2" width="10" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="7" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="7" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="15" cy="15" r="4" fill="var(--color-success)"/>
                <path d="M15 13v4M13 15h4" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            ),
          };
        }
      };

      const activityInfo = getActivityInfo(doc.status || 'pending');

      // AR 뱃지 확인 (상단)
      const isAnnualReport = doc.is_annual_report === true;

      // 하단 뱃지: OCR 또는 TXT 중 하나만
      const ocrConfidence = getOcrConfidence(doc);
      const ocrLevel = ocrConfidence !== null ? getOcrConfidenceLevel(ocrConfidence) : null;

      // TXT 뱃지 확인 (OCR이 없을 때만, DocumentStatusList와 동일한 로직)
      const typeLabel = ocrConfidence === null ? DocumentUtils.getDocumentTypeLabel(doc) : null;
      const showTxtBadge = typeLabel === 'TXT';

      return {
        id: doc._id || String(Math.random()),
        title: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <div className="document-icon-wrapper">
              <div className={`document-icon ${fileTypeClass}`}>
                <SFSymbol
                  name={fileIcon}
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              </div>

              {/* 상단 뱃지: AR */}
              {isAnnualReport && (
                <Tooltip content="Annual Report">
                  <div className="document-ar-badge">
                    AR
                  </div>
                </Tooltip>
              )}

              {/* 하단 뱃지: OCR 또는 TXT 중 하나만 */}
              {ocrConfidence !== null && ocrLevel ? (
                <Tooltip content={`OCR 신뢰도: ${(ocrConfidence * 100).toFixed(1)}% (${ocrLevel.label})`}>
                  <div className={`document-ocr-badge ocr-${ocrLevel.color}`}>
                    OCR
                  </div>
                </Tooltip>
              ) : showTxtBadge ? (
                <Tooltip content="TXT 기반 문서">
                  <div className="document-txt-badge">
                    TXT
                  </div>
                </Tooltip>
              ) : null}
            </div>
            {doc.filename || doc.originalName || '제목 없음'}
          </span>
        ),
        subtitle: activityInfo.subtitle,
        timestamp: doc.created_at ? new Date(doc.created_at) : doc.uploaded_at ? new Date(doc.uploaded_at) : new Date(),
        icon: activityInfo.icon,
      };
    });
  }, [recentDocuments]);

  // 새로고침 핸들러
  const handleRefresh = async () => {
    await Promise.all([
      refetchStats(),
      refetchRecent()
    ]);
  };

  // 사용 가이드 섹션
  const guideSections: GuideSection[] = [
    {
      icon: (
        <SFSymbol
          name="doc-badge-plus"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-warning)' }}
        />
      ),
      title: '문서 등록',
      description: '새로운 문서를 업로드하고 자동 분류 및 OCR 처리를 시작합니다. PDF, 이미지, 텍스트 파일 등 다양한 형식을 지원합니다.',
    },
    {
      icon: (
        <SFSymbol
          name="books-vertical"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-purple)' }}
        />
      ),
      title: '문서 라이브러리',
      description: '등록된 모든 문서를 검색하고 관리합니다. 파일명, 태그, 고객 연결 등 다양한 조건으로 필터링하고 정렬할 수 있습니다.',
    },
    {
      icon: (
        <SFSymbol
          name="search-bold"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-primary)' }}
        />
      ),
      title: '문서 검색',
      description: '키워드, 태그, 고객, 문서 유형 등 다양한 조건으로 문서를 검색합니다. AI 기반 시맨틱 검색으로 정확한 문서를 빠르게 찾을 수 있습니다.',
    },
  ];

  return (
    <CenterPaneView
      visible={visible}
      title="문서 관리"
      titleIcon={<SFSymbol name="doc" size={SFSymbolSize.CALLOUT} weight={SFSymbolWeight.MEDIUM} />}
      titleAccessory={
        <RefreshButton
          onClick={handleRefresh}
          size="small"
          tooltip="문서 통계 새로고침"
        />
      }
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
            <svg width="14" height="14" viewBox="0 0 20 20">
              <rect x="2" y="12" width="4" height="6" rx="1" fill="var(--color-primary-500)"/>
              <rect x="8" y="7" width="4" height="11" rx="1" fill="var(--color-primary-500)"/>
              <rect x="14" y="3" width="4" height="15" rx="1" fill="var(--color-primary-500)"/>
            </svg>
            문서 통계
          </h2>
          <div className="document-management-view__stats-grid">
            <StatCard
              title="전체 문서"
              value={stats?.total ?? 0}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="4" y="4" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
                  <rect x="2" y="2" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="primary"
              isLoading={isStatsLoading}
              {...(isStatsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="처리 대기"
              value={stats?.pending ?? 0}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 5v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <circle cx="10" cy="10" r="1.5"/>
                </svg>
              }
              color="warning"
              isLoading={isStatsLoading}
              {...(isStatsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="OCR 완료"
              value={stats?.stages.ocr ?? 0}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="3" y="2" width="14" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="6" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="6" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="6" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              color="success"
              isLoading={isStatsLoading}
              {...(isStatsError && { error: '통계 조회 실패' })}
            />
            <StatCard
              title="태그 완료"
              value={stats?.completed ?? 0}
              icon={
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 2l8 0 8 8-8 8-8-8z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="7" cy="7" r="1.5"/>
                  <circle cx="15" cy="15" r="4" fill="var(--color-success)"/>
                  <path d="M13.5 15l1 1 2.5-2.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              }
              color="success"
              isLoading={isStatsLoading}
              {...(isStatsError && { error: '통계 조회 실패' })}
            />
          </div>
        </section>

        {/* 사용 가이드 */}
        <UsageGuide
          title="문서관리 사용 가이드"
          sections={guideSections}
          defaultExpanded={true}
        />

        {/* 최근 활동 섹션 */}
        <section className="document-management-view__section">
          <h2 className="document-management-view__section-title">
            <svg width="14" height="14" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
              <path d="M10 5v5l3.5 3.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
            최근 활동
          </h2>
          <div className="document-management-view__recent-activity">
            <RecentActivityList
              items={recentActivities}
              maxItems={5}
              isLoading={isRecentLoading}
              {...(isRecentError && { error: '최근 활동 조회 실패' })}
            />
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default DocumentManagementView
