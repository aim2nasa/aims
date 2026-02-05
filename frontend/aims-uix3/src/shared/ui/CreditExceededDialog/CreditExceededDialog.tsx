/**
 * CreditExceededDialog Component
 * @since 2026-01-10
 * @version 1.0.0
 *
 * 크레딧 한도 초과 경고 다이얼로그
 * - 공통 Modal 컴포넌트 사용
 * - 현재 사용량/할당량 표시
 * - 다음 리셋까지 남은 일수 표시
 * - 해결책 버튼: 티어 업그레이드, 크레딧 충전 (추후 활성화)
 */

import Modal from '@/shared/ui/Modal'
import Button from '@/shared/ui/Button'
import type { CreditExceededInfo } from '@/shared/hooks/useChatSSE'
import './CreditExceededDialog.css'

interface CreditExceededDialogProps {
  visible: boolean
  onClose: () => void
  creditInfo: CreditExceededInfo
}

// 버튼용 인라인 SVG 아이콘
const CreditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/>
  </svg>
)

const UpgradeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
  </svg>
)

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
  </svg>
)

/**
 * 크레딧 포맷팅
 */
function formatCredits(credits: number): string {
  if (credits === -1) return '무제한'
  return `${Math.round(credits).toLocaleString()}C`
}

/**
 * 티어명 한글 변환
 */
function getTierDisplayName(tier?: string, tierName?: string): string {
  if (tierName) return tierName

  const tierMap: Record<string, string> = {
    'free_trial': '무료체험',
    'standard': '일반',
    'premium': '프리미엄',
    'vip': 'VIP',
    'admin': '관리자'
  }
  return tierMap[tier || ''] || tier || '알 수 없음'
}

export default function CreditExceededDialog({
  visible,
  onClose,
  creditInfo
}: CreditExceededDialogProps) {
  if (!visible) return null

  const tierDisplayName = getTierDisplayName(creditInfo.tier, creditInfo.tier_name)

  // Footer with action buttons
  const footer = (
    <div className="credit-exceeded-actions">
      <Button
        variant="ghost"
        size="md"
        disabled
        title="추후 지원 예정"
        className="credit-exceeded-btn-purchase"
      >
        <CreditIcon />
        <span>크레딧 충전</span>
      </Button>
      <Button
        variant="ghost"
        size="md"
        disabled
        title="추후 지원 예정"
        className="credit-exceeded-btn-upgrade"
      >
        <UpgradeIcon />
        <span>티어 업그레이드</span>
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={onClose}
        className="credit-exceeded-btn-close"
      >
        확인
      </Button>
    </div>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="크레딧 한도 초과"
      size="sm"
      backdropClosable={true}
      className="credit-exceeded-modal"
      footer={footer}
      ariaLabel="크레딧 한도 초과 알림"
    >
      <div className="credit-exceeded-content">
        {/* 경고 아이콘 */}
        <div className="credit-exceeded-warning-icon">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        </div>

        {/* 메시지 */}
        <p className="credit-exceeded-message">
          이번 달 크레딧을 모두 사용했습니다.<br/>
          AI 기능을 사용하시려면 크레딧 리셋을 기다리거나<br/>
          티어를 업그레이드해주세요.
        </p>

        {/* 크레딧 정보 */}
        <div className="credit-exceeded-info">
          <div className="credit-exceeded-info-row">
            <span className="credit-exceeded-label">현재 티어</span>
            <span className="credit-exceeded-value tier-badge">
              {tierDisplayName}
            </span>
          </div>
          <div className="credit-exceeded-info-row">
            <span className="credit-exceeded-label">크레딧 사용량</span>
            <span className="credit-exceeded-value">
              {formatCredits(creditInfo.credits_used)} / {formatCredits(creditInfo.credit_quota)}
              {(creditInfo.bonus_balance ?? 0) > 0 && (
                <span className="credit-exceeded-bonus"> + {formatCredits(creditInfo.bonus_balance ?? 0)}</span>
              )}
            </span>
          </div>
          {(creditInfo.bonus_balance ?? 0) > 0 && (
            <div className="credit-exceeded-info-row">
              <span className="credit-exceeded-label">추가 크레딧</span>
              <span className="credit-exceeded-value bonus">
                {formatCredits(creditInfo.bonus_balance ?? 0)}
              </span>
            </div>
          )}
          <div className="credit-exceeded-info-row">
            <span className="credit-exceeded-label">사용률</span>
            <span className="credit-exceeded-value exceeded">
              {creditInfo.credit_usage_percent.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 프로그레스 바 */}
        <div className="credit-exceeded-progress">
          <div
            className="credit-exceeded-progress-bar"
            style={{ width: `${Math.min(creditInfo.credit_usage_percent, 100)}%` }}
          />
        </div>

        {/* 리셋 정보 */}
        <div className="credit-exceeded-reset-info">
          <CalendarIcon />
          <span>
            {creditInfo.days_until_reset}일 후 크레딧이 리셋됩니다
          </span>
        </div>
      </div>
    </Modal>
  )
}
