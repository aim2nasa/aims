/**
 * UsageQuotaWidget Component
 * @since 2025-12-19
 *
 * 스토리지 + OCR 파이 차트 아이콘
 * - 두 개의 원형 프로그레스로 사용률 시각화
 * - AIMS 스타일 툴팁
 * - 클릭 시 상세 페이지로 이동
 */

import React from 'react'
import type { StorageInfo } from '@/services/userService'
import type { AIUsageData } from '@/services/aiUsageService'
import { formatFileSize } from '@/features/batch-upload/utils/fileValidation'
import Tooltip from '@/shared/ui/Tooltip'
import './UsageQuotaWidget.css'

export interface UsageQuotaWidgetProps {
  storageInfo: StorageInfo | null
  aiUsage: AIUsageData | null
  loading?: boolean
  collapsed?: boolean
  onClick?: () => void
}

interface PieChartProps {
  percent: number
  level: 'normal' | 'warning' | 'danger'
  icon: 'storage' | 'ocr'
  tooltip: string
  size?: number
}

const PieChart: React.FC<PieChartProps> = ({ percent, level, icon, tooltip, size = 28 }) => {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference

  return (
    <Tooltip content={tooltip} placement="top">
      <div className={`usage-pie usage-pie--${level}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* 배경 원 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="usage-pie__bg"
          />
          {/* 프로그레스 원 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="usage-pie__progress"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          {/* 중앙 아이콘 - 스토리지: 하드드라이브 */}
          {icon === 'storage' && (
            <g transform={`translate(${size / 2 - 5}, ${size / 2 - 4}) scale(0.42)`} className="usage-pie__icon usage-pie__icon--storage">
              <rect x="2" y="6" width="20" height="12" rx="2" fill="currentColor" />
              <circle cx="6" cy="12" r="1.5" fill="var(--color-bg-primary)" />
            </g>
          )}
          {/* 중앙 아이콘 - OCR: 스캔 프레임 */}
          {icon === 'ocr' && (
            <g transform={`translate(${size / 2 - 5}, ${size / 2 - 5}) scale(0.42)`} className="usage-pie__icon usage-pie__icon--ocr">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </g>
          )}
        </svg>
      </div>
    </Tooltip>
  )
}

const UsageQuotaWidget: React.FC<UsageQuotaWidgetProps> = ({
  storageInfo,
  loading = false,
  onClick
}) => {
  // 스토리지 사용률 계산
  const getStoragePercent = (): number => {
    if (!storageInfo || storageInfo.is_unlimited || storageInfo.quota_bytes <= 0) return 0
    return Math.min((storageInfo.used_bytes / storageInfo.quota_bytes) * 100, 100)
  }

  // OCR 사용률 계산 (페이지 기반)
  const getOcrPercent = (): number => {
    if (!storageInfo || !storageInfo.has_ocr_permission || storageInfo.ocr_is_unlimited || storageInfo.ocr_page_quota <= 0) return 0
    return Math.min((storageInfo.ocr_pages_used / storageInfo.ocr_page_quota) * 100, 100)
  }

  // 경고 레벨 결정
  const getLevel = (percent: number): 'normal' | 'warning' | 'danger' => {
    if (percent >= 95) return 'danger'
    if (percent >= 80) return 'warning'
    return 'normal'
  }

  const storagePercent = getStoragePercent()
  const ocrPercent = getOcrPercent()

  // 로딩 상태
  if (loading) {
    return (
      <div className="usage-widget-container usage-widget-container--loading">
        <div className="usage-pie usage-pie--loading"><div className="usage-pie__skeleton" /></div>
        <div className="usage-pie usage-pie--loading"><div className="usage-pie__skeleton" /></div>
      </div>
    )
  }

  // 데이터 없음
  if (!storageInfo) {
    return null
  }

  // 툴팁 콘텐츠 (소수점 2자리까지 표시)
  const storageTooltip = `저장공간: ${formatFileSize(storageInfo.used_bytes)} / ${storageInfo.is_unlimited ? '무제한' : formatFileSize(storageInfo.quota_bytes)} (${storagePercent.toFixed(2)}%)`

  // OCR 사이클 날짜 포맷 (MM/DD 형식)
  const formatCycleDate = (dateStr: string) => {
    if (!dateStr) return ''
    return dateStr.slice(5).replace('-', '/')
  }

  const ocrTooltip = storageInfo.has_ocr_permission
    ? `OCR: ${storageInfo.ocr_pages_used}p / ${storageInfo.ocr_is_unlimited ? '무제한' : `${storageInfo.ocr_page_quota}p`} (${storageInfo.ocr_docs_count}건)\n사이클: ${formatCycleDate(storageInfo.ocr_cycle_start)} ~ ${formatCycleDate(storageInfo.ocr_cycle_end)}\n리셋까지: ${storageInfo.ocr_days_until_reset}일`
    : 'OCR 권한 없음'

  return (
    <button
      type="button"
      className="usage-widget-container"
      onClick={onClick}
      aria-label="사용량 상세 보기"
    >
      <PieChart
        percent={storagePercent}
        level={getLevel(storagePercent)}
        icon="storage"
        tooltip={storageTooltip}
      />
      {storageInfo.has_ocr_permission && (
        <PieChart
          percent={ocrPercent}
          level={getLevel(ocrPercent)}
          icon="ocr"
          tooltip={ocrTooltip}
        />
      )}
    </button>
  )
}

export default UsageQuotaWidget
