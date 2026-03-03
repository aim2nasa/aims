/**
 * DocumentManagementView Component
 * @since 1.0.0
 *
 * 문서 관리 대시보드
 * 통계, 빠른 액션, 최근 활동을 포함
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CenterPaneView from '../../CenterPaneView/CenterPaneView';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../SFSymbol';
import { StatCard } from '@/shared/ui/StatCard';
import { UsageGuide } from '@/shared/ui/UsageGuide';
import type { GuideSection } from '@/shared/ui/UsageGuide';
import { getDocumentStatistics } from '@/services/DocumentService';
import { DocumentStatusService } from '@/services/DocumentStatusService';
import { DocumentUtils, type DocumentTypeInput } from '@/entities/document';
import { Tooltip } from '@/shared/ui';
import { FileTypePieChart } from '@/shared/ui/FileTypePieChart';
import type { FileTypeData } from '@/shared/ui/FileTypePieChart';
import HorizontalBarChart from '@/shared/ui/HorizontalBarChart';
import { Dropdown } from '@/shared/ui/Dropdown';
import { formatDate } from '@/shared/lib/timeUtils';
import './DocumentManagementView.css';

type ActivityPeriod = '1week' | '1month' | '3months' | '6months' | '1year';

interface DocumentManagementViewProps {
  /** View 표시 여부 */
  visible: boolean;
  /** View 닫기 핸들러 */
  onClose: () => void;
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void;
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
  // 최근 활동 기간 선택 상태
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('1month');

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
  const getOcrConfidence = (document: DocumentTypeInput): number | null => {
    // 1. document.ocr?.confidence 먼저 시도
    if (document.ocr && typeof document.ocr !== 'string') {
      const directConfidence = document.ocr.confidence
      if (directConfidence) {
        const parsed = parseFloat(String(directConfidence))
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
  } = useQuery({
    queryKey: ['documentStatistics'],
    queryFn: getDocumentStatistics,
    enabled: visible,
  });

  // 전체 문서 목록 조회 (문서 유형 통계 및 최근 활동용)
  const {
    data: allDocuments,
    isLoading: isRecentLoading,
    isError: isRecentError,
  } = useQuery({
    queryKey: ['allDocumentsForStats'],
    queryFn: () =>
      DocumentStatusService.getRecentDocuments(1, 10000, 'uploadTime_desc'), // 전체 조회
    enabled: visible,
  });


  /**
   * 문서 활동 정보 생성
   */
  const getActivityInfo = (status: string) => {
    if (status === 'completed') {
      return {
        text: '처리 완료',
        icon: (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-success)' }}>
            <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
            <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        ),
      };
    } else if (status === 'processing') {
      return {
        text: '처리 중',
        icon: (
          <svg width="13" height="13" viewBox="0 0 20 20" style={{ color: 'var(--color-text-secondary)' }}>
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
        text: '처리 실패',
        icon: (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-error)' }}>
            <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.2"/>
            <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ),
      };
    } else {
      return {
        text: '문서 등록',
        icon: (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-text-secondary)' }}>
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

  /**
   * 문서의 날짜 추출 (created_at, uploaded_at, 또는 MongoDB ObjectId에서)
   */
  const getDocumentDate = (doc: DocumentTypeInput): Date | null => {
    // 1. created_at 시도
    if (doc.created_at) {
      return new Date(doc.created_at);
    }

    // 2. uploaded_at 시도
    if (doc.uploaded_at) {
      return new Date(doc.uploaded_at);
    }

    // 3. MongoDB ObjectId에서 타임스탬프 추출
    if (doc._id && typeof doc._id === 'string' && doc._id.length === 24) {
      const timestamp = parseInt(doc._id.substring(0, 8), 16) * 1000; // 밀리초로 변환
      return new Date(timestamp);
    }

    return null;
  };

  /**
   * 기간별 문서 개수 계산
   */
  const getDocumentCountByPeriod = (period: ActivityPeriod): number => {
    if (!allDocuments?.documents) return 0;

    const now = new Date();
    const cutoff = new Date();

    switch (period) {
      case '1week':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '1month':
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case '6months':
        cutoff.setMonth(now.getMonth() - 6);
        break;
      case '1year':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
    }

    return allDocuments.documents.filter((doc) => {
      const docDate = getDocumentDate(doc as any);
      if (!docDate) return false;
      return docDate >= cutoff;
    }).length;
  };

  /**
   * 최근 문서 목록 (테이블 표시용, 기간 필터링 적용)
   */
  const recentDocumentList = useMemo(() => {
    if (!allDocuments?.documents) return [];

    // 기간 계산
    const now = new Date();
    const cutoffDate = new Date();

    switch (activityPeriod) {
      case '1week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '1month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case '6months':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '1year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // 기간 내 문서 필터링 및 정렬 (최신순)
    const filtered = allDocuments.documents.filter((doc) => {
      const docDate = getDocumentDate(doc as any);
      if (!docDate) return false;
      return docDate >= cutoffDate;
    });

    // 날짜 기준 내림차순 정렬 (최신이 위로)
    return filtered.sort((a, b) => {
      const dateA = getDocumentDate(a as any);
      const dateB = getDocumentDate(b as any);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [allDocuments, activityPeriod]);

  /**
   * 시간 표시 포맷 (상대 시간)
   */
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;

    return formatDate(date);
  };

  /**
   * 파일 크기 포맷 (바이트 → KB/MB)
   */
  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes || bytes === 0) return '-';

    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  };

  /**
   * 문서 타입 분류 헬퍼 - 확장자 기반
   */
  const getFileTypeCategory = (mimeType: string | undefined, filename: string | undefined): string => {
    const name = (filename || '').toLowerCase();

    // 확장자 추출
    const match = name.match(/\.([a-z0-9]+)$/);
    if (match && match[1]) {
      return match[1].toUpperCase(); // 'pdf' -> 'PDF', 'docx' -> 'DOCX'
    }

    // 확장자 없으면 MIME type으로 추정
    const mime = (mimeType || '').toLowerCase();
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('word')) return 'DOCX';
    if (mime.includes('excel')) return 'XLSX';
    if (mime.includes('powerpoint')) return 'PPTX';
    if (mime.includes('image/')) return 'IMAGE';

    return 'UNKNOWN';
  };

  // 문서 유형 파이 차트 데이터
  const fileTypePieData: FileTypeData[] = useMemo(() => {
    if (!stats?.badgeTypes) return [];

    return [
      {
        label: 'TXT',
        count: stats.badgeTypes.TXT ?? 0,
        color: 'var(--color-success)',
        description: '텍스트 추출 가능 문서'
      },
      {
        label: 'OCR',
        count: stats.badgeTypes.OCR ?? 0,
        color: 'var(--color-primary-500)',
        description: '이미지 문서로 OCR 처리됨, 신뢰도별 색상 표시'
      },
      {
        label: 'BIN',
        count: stats.badgeTypes.BIN ?? 0,
        color: 'var(--color-neutral-600)',
        description: '텍스트 추출 불가능한 바이너리 파일'
      }
    ];
  }, [stats]);

  // 처리 상태 파이 차트 데이터
  const statusPieData: FileTypeData[] = useMemo(() => {
    if (!stats) return [];

    return [
      {
        label: '완료',
        count: stats.completed ?? 0,
        color: 'var(--color-success)',
        description: '모든 처리 단계가 완료된 문서'
      },
      {
        label: '처리중',
        count: stats.processing ?? 0,
        color: 'var(--color-primary-500)',
        description: '현재 처리 중인 문서'
      },
      {
        label: '대기',
        count: stats.pending ?? 0,
        color: 'var(--color-warning)',
        description: '처리 대기 중인 문서'
      },
      {
        label: '실패',
        count: stats.error ?? 0,
        color: 'var(--color-error)',
        description: '처리 실패한 문서'
      }
    ].filter(item => item.count > 0); // 0인 항목은 제외
  }, [stats]);

  // 실제 문서 타입 데이터 (MIME type 기반)
  const actualFileTypePieData: FileTypeData[] = useMemo(() => {
    if (!allDocuments?.documents) return [];

    const typeCounts: Record<string, number> = {};

    allDocuments.documents.forEach(doc => {
      const fileType = getFileTypeCategory(doc.mimeType, doc.filename || doc.originalName);
      typeCounts[fileType] = (typeCounts[fileType] || 0) + 1;
    });

    const typeColors: Record<string, string> = {
      // PDF
      'PDF': 'var(--color-error)',
      // Word 계열 - 파란색
      'DOCX': 'var(--color-primary-500)',
      'DOC': 'var(--color-ios-blue)',
      // Excel 계열 - 녹색
      'XLSX': 'var(--color-success)',
      'XLS': 'var(--color-ios-green)',
      // PowerPoint 계열 - 주황색
      'PPTX': 'var(--color-warning)',
      'PPT': 'var(--color-ios-orange)',
      // 이미지 계열 - 하늘색/보라색
      'JPG': 'var(--color-ios-blue)',
      'JPEG': 'var(--color-ios-blue)',
      'PNG': 'var(--color-ios-teal)',
      'GIF': 'var(--color-ios-purple)',
      'BMP': 'var(--color-ios-indigo)',
      'WEBP': 'var(--color-ios-cyan)',
      'TIFF': 'var(--color-ios-purple)',
      'IMAGE': 'var(--color-ios-blue)',
      // 압축 파일 계열 - 보라색
      'ZIP': 'var(--color-ios-purple)',
      'RAR': 'var(--color-ios-purple)',
      '7Z': 'var(--color-ios-purple)',
      'TAR': 'var(--color-ios-indigo)',
      'GZ': 'var(--color-ios-indigo)',
      // PostScript
      'PS': 'var(--color-ios-orange)',
      'EPS': 'var(--color-ios-orange)',
      // 텍스트
      'TXT': 'var(--color-neutral-600)',
      // 기타
      'UNKNOWN': 'var(--color-text-tertiary)'
    };

    return Object.entries(typeCounts)
      .map(([label, count]) => ({
        label,
        count,
        color: typeColors[label] || 'var(--color-text-tertiary)',
        description: `${label.toLowerCase()} 파일`
      }))
      .sort((a, b) => b.count - a.count) // 개수 많은 순으로 정렬
      .filter(item => item.count > 0);
  }, [allDocuments]);

  // 사용 가이드 섹션
  const guideSections: GuideSection[] = [
    {
      icon: (
        <SFSymbol
          name="doc-badge-plus"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-icon-doc-register)' }}
        />
      ),
      title: '문서 등록',
      description: '새로운 문서를 업로드하고 자동 분류 및 OCR 처리를 시작합니다. PDF, 이미지, 텍스트 파일 등 다양한 형식을 지원합니다.',
      ...(onNavigate && { onClick: () => onNavigate('documents-register') }),
    },
    {
      icon: (
        <SFSymbol
          name="books-vertical"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-icon-doc-library)' }}
        />
      ),
      title: '문서 라이브러리',
      description: '등록된 모든 문서를 검색하고 관리합니다. 파일명, 태그, 고객 연결 등 다양한 조건으로 필터링하고 정렬할 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('documents-library') }),
    },
    {
      icon: (
        <SFSymbol
          name="search-bold"
          size={SFSymbolSize.CALLOUT}
          weight={SFSymbolWeight.MEDIUM}
          style={{ color: 'var(--color-icon-doc-search)' }}
        />
      ),
      title: '상세 문서검색',
      description: '키워드, 태그, 고객, 문서 유형 등 다양한 조건으로 문서를 검색합니다. AI 기반 시맨틱 검색으로 정확한 문서를 빠르게 찾을 수 있습니다.',
      ...(onNavigate && { onClick: () => onNavigate('documents-search') }),
    },
  ];

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
              value={stats?.badgeTypes.OCR ?? 0}
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

          {/* 파이 차트 그리드 */}
          {!isStatsLoading && !isStatsError && stats && stats.total > 0 && (
            <div className="document-management-view__pie-charts-grid">
              {/* 문서 유형 차트 */}
              {fileTypePieData.length > 0 && (
                <div className="pie-chart-item">
                  <h3 className="pie-chart-title">문서 유형</h3>
                  <FileTypePieChart
                    data={fileTypePieData}
                    size={150}
                    innerRadius={38}
                  />
                </div>
              )}

              {/* 처리 상태 차트 */}
              {statusPieData.length > 0 && (
                <div className="pie-chart-item">
                  <h3 className="pie-chart-title">처리 상태</h3>
                  <FileTypePieChart
                    data={statusPieData}
                    size={150}
                    innerRadius={38}
                  />
                </div>
              )}

              {/* 문서 타입 차트 */}
              {actualFileTypePieData.length > 0 && (
                <div className="pie-chart-item">
                  <h3 className="pie-chart-title">문서 타입</h3>
                  <HorizontalBarChart
                    categories={[
                      {
                        title: '문서 타입',
                        data: actualFileTypePieData
                      }
                    ]}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* 사용 가이드 */}
        <UsageGuide
          title="문서관리 사용 가이드"
          sections={guideSections}
          defaultExpanded={true}
        />

        {/* 최근 활동 섹션 */}
        <section className="document-management-view__section">
          <div className="document-management-view__section-header">
            <h2 className="document-management-view__section-title">
              <svg width="14" height="14" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9" fill="var(--color-success)"/>
                <path d="M10 5v5l3.5 3.5" stroke="var(--color-text-inverse)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
              최근 활동 ({getDocumentCountByPeriod(activityPeriod)}개)
            </h2>
            <Dropdown
              value={activityPeriod}
              onChange={(value) => setActivityPeriod(value as ActivityPeriod)}
              options={[
                { value: '1week', label: '최근 1주일' },
                { value: '1month', label: '최근 1개월' },
                { value: '3months', label: '최근 3개월' },
                { value: '6months', label: '최근 6개월' },
                { value: '1year', label: '최근 1년' }
              ]}
            />
          </div>
          <div className="document-management-view__recent-activity">
            {isRecentLoading ? (
              <div className="recent-activity-loading">최근 활동을 불러오는 중...</div>
            ) : isRecentError ? (
              <div className="recent-activity-error">최근 활동 조회 실패</div>
            ) : recentDocumentList.length === 0 ? (
              <div className="recent-activity-empty">최근 활동이 없습니다</div>
            ) : (
              <div className="recent-activity-table">
                {/* 테이블 헤더 */}
                <div className="recent-activity-header">
                  <div className="recent-header-activity">활동</div>
                  <div className="recent-header-name">문서명</div>
                  <div className="recent-header-size">크기</div>
                  <div className="recent-header-type">유형</div>
                  <div className="recent-header-customer">고객</div>
                  <div className="recent-header-time">시간</div>
                </div>

                {/* 데이터 행 */}
                {recentDocumentList.map((doc) => {
                  const fileIcon = DocumentUtils.getFileIcon(doc.mimeType, doc.filename || doc.originalName);
                  const fileTypeClass = DocumentUtils.getFileTypeClass(doc.mimeType, doc.filename || doc.originalName);
                  const activityInfo = getActivityInfo(doc.status || 'pending');
                  const fileType = getFileTypeCategory(doc.mimeType, doc.filename || doc.originalName);
                  const timestamp = getDocumentDate(doc as any) || new Date();

                  // 파일 크기 추출 (여러 소스에서 시도)
                  const fileSize = doc.size || doc.fileSize || doc.file_size;

                  // 연결된 고객 정보
                  const linkedCustomer = doc.customer_relation?.customer_name || null;

                  // AR 뱃지 확인
                  const isAnnualReport = doc.is_annual_report === true;

                  // OCR/TXT/BIN 뱃지 확인
                  const ocrConfidence = getOcrConfidence(doc as any);
                  const ocrLevel = ocrConfidence !== null ? getOcrConfidenceLevel(ocrConfidence) : null;
                  const typeLabel = ocrConfidence === null ? DocumentUtils.getDocumentTypeLabel(doc as any) : null;
                  const showTxtBadge = typeLabel === 'TXT';
                  const showBinBadge = typeLabel === 'BIN';

                  return (
                    <div key={doc._id || String(Math.random())} className="recent-activity-row">
                      {/* 활동 (아이콘 + 텍스트) */}
                      <div className="recent-cell-activity">
                        {activityInfo.icon}
                        <span className="activity-text">{activityInfo.text}</span>
                      </div>

                      {/* 문서명 (파일 아이콘 + 뱃지 포함) */}
                      <div className="recent-cell-name">
                        <div className="document-icon-wrapper">
                          <div className={`document-icon ${fileTypeClass}`}>
                            <SFSymbol
                              name={fileIcon}
                              size={SFSymbolSize.CAPTION_1}
                              weight={SFSymbolWeight.REGULAR}
                              decorative={true}
                            />
                          </div>

                          {/* AR 뱃지 */}
                          {isAnnualReport && (
                            <Tooltip content="Annual Report">
                              <div className="document-ar-badge">
                                AR
                              </div>
                            </Tooltip>
                          )}

                          {/* CR 뱃지 */}
                          {doc.is_customer_review === true && !isAnnualReport && (
                            <Tooltip content="변액 리포트">
                              <div className="document-cr-badge">
                                CR
                              </div>
                            </Tooltip>
                          )}

                          {/* OCR, TXT, BIN 뱃지 */}
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
                          ) : showBinBadge ? (
                            <Tooltip content="BIN 기반 문서 (텍스트 추출 불가)">
                              <div className="document-bin-badge">
                                BIN
                              </div>
                            </Tooltip>
                          ) : null}
                        </div>
                        <span className="document-filename">
                          {doc.filename || doc.originalName || '제목 없음'}
                        </span>
                      </div>

                      {/* 파일크기 */}
                      <div className="recent-cell-size">{formatFileSize(fileSize)}</div>

                      {/* 유형 */}
                      <div className="recent-cell-type">{fileType}</div>

                      {/* 연결고객 */}
                      <div className="recent-cell-customer">
                        {linkedCustomer || '-'}
                      </div>

                      {/* 시간 */}
                      <div className="recent-cell-time">
                        {formatRelativeTime(timestamp)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </CenterPaneView>
  );
};

export default DocumentManagementView
