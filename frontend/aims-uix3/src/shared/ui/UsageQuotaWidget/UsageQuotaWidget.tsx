/**
 * UsageQuotaWidget Component
 * @since 2025-12-19
 * @updated 2026-01-06 - OCR → 크레딧 표시로 전환
 *
 * 스토리지 + 크레딧 파이 차트 아이콘
 * - 두 개의 원형 프로그레스로 사용률 시각화
 * - AIMS 스타일 툴팁
 * - 클릭 시 상세 페이지로 이동
 */

import React from 'react'
import type { StorageInfo } from '@/services/userService'
import { formatFileSize } from '@/shared/lib/fileValidation/constants'
import Tooltip from '@/shared/ui/Tooltip'
import './UsageQuotaWidget.css'

export interface UsageQuotaWidgetProps {
  storageInfo: StorageInfo | null
  loading?: boolean
  collapsed?: boolean
  onClick?: () => void
}

interface PieChartProps {
  percent: number
  level: 'normal' | 'warning' | 'danger'
  icon: 'storage' | 'credit'
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
          {/* 중앙 아이콘 - 크레딧: 코인 "C" */}
          {icon === 'credit' && (
            <g transform={`translate(${size / 2 - 5}, ${size / 2 - 5}) scale(0.42)`} className="usage-pie__icon usage-pie__icon--credit">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
              <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor">C</text>
            </g>
          )}
        </svg>
      </div>
    </Tooltip>
  )
}

export const UsageQuotaWidget: React.FC<UsageQuotaWidgetProps> = ({
  storageInfo,
  loading = false,
  onClick
}) => {
  // 스토리지 사용률 계산
  const getStoragePercent = (): number => {
    if (!storageInfo || storageInfo.is_unlimited || storageInfo.quota_bytes <= 0) return 0
    return Math.min((storageInfo.used_bytes / storageInfo.quota_bytes) * 100, 100)
  }

  // 크레딧 사용률 계산 (월정액 + 추가 크레딧 기준)
  const getCreditPercent = (): number => {
    if (!storageInfo || storageInfo.credit_is_unlimited) return 0
    // 총 크레딧 풀 = 월정액 + 추가 크레딧
    const bonusBalance = storageInfo.bonus_balance ?? 0
    const totalPool = (storageInfo.credit_quota || 0) + bonusBalance
    if (totalPool <= 0) return 0
    return Math.min((storageInfo.credits_used / totalPool) * 100, 100)
  }

  // 경고 레벨 결정
  const getLevel = (percent: number): 'normal' | 'warning' | 'danger' => {
    if (percent >= 95) return 'danger'
    if (percent >= 80) return 'warning'
    return 'normal'
  }

  const storagePercent = getStoragePercent()
  const creditPercent = getCreditPercent()

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

  // 크레딧 사이클 날짜 포맷 (M/D 형식)
  const formatCycleDate = (dateStr: string) => {
    if (!dateStr) return ''
    const [, month, day] = dateStr.split('-')
    return `${parseInt(month)}/${parseInt(day)}`
  }

  // 첫 달 표시 (일할 계산 적용 시)
  const isFirstMonth = storageInfo.is_first_month ?? false
  const proRataPercent = storageInfo.pro_rata_ratio ? Math.round(storageInfo.pro_rata_ratio * 100) : 100

  // 추가 크레딧 정보
  const bonusBalance = storageInfo.bonus_balance ?? 0
  const totalPool = (storageInfo.credit_quota || 0) + bonusBalance

  // 크레딧 툴팁 (월정액 + 추가 크레딧 표시) - 소수점 제거
  const creditsUsedInt = Math.floor(storageInfo.credits_used ?? 0)
  const creditTooltip = storageInfo.credit_is_unlimited
    ? '크레딧: 무제한'
    : bonusBalance > 0
      ? `크레딧: ${creditsUsedInt.toLocaleString()} / ${totalPool.toLocaleString()} (월정액 ${storageInfo.credit_quota?.toLocaleString()}+추가 ${bonusBalance.toLocaleString()}) ~${formatCycleDate(storageInfo.credit_cycle_end)}`
      : `크레딧: ${creditsUsedInt.toLocaleString()} / ${storageInfo.credit_quota?.toLocaleString() ?? 0} (${creditPercent.toFixed(0)}%)${isFirstMonth ? ` [첫 달 ${proRataPercent}%]` : ''} ~${formatCycleDate(storageInfo.credit_cycle_end)}`

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
      <PieChart
        percent={creditPercent}
        level={getLevel(creditPercent)}
        icon="credit"
        tooltip={creditTooltip}
      />
    </button>
  )
}

