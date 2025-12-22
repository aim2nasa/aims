import { memo, useRef, useCallback } from 'react'
import { useRecentCustomersStore } from '../../shared/store/useRecentCustomersStore'
import Tooltip from '../../shared/ui/Tooltip'
import './RecentCustomers.css'

// 시계 아이콘 - CustomMenu와 동일한 구조 (16x16 SVG)
const ClockIcon = () => (
  <span className="recent-customers__icon-container">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z" />
      <path d="M8 3.5a.75.75 0 0 0-.75.75v4l2.72 2.72a.75.75 0 0 0 1.06-1.06L8.75 7.63V4.25A.75.75 0 0 0 8 3.5z" />
    </svg>
  </span>
)

interface RecentCustomersProps {
  collapsed?: boolean
  onCustomerClick?: (customerId: string) => void
  onCustomerDoubleClick?: (customerId: string) => void
}

// 개인/법인 고객 아이콘
const PersonIcon = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="recent-customer-icon--personal">
    <circle cx="10" cy="7" r="3" />
    <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
  </svg>
)

const BuildingIcon = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="recent-customer-icon--corporate">
    <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
  </svg>
)

const RecentCustomers = memo(({ collapsed = false, onCustomerClick, onCustomerDoubleClick }: RecentCustomersProps) => {
  const recentCustomers = useRecentCustomersStore((state) => state.recentCustomers)
  const clearRecentCustomers = useRecentCustomersStore((state) => state.clearRecentCustomers)

  // 클릭/더블클릭 구분을 위한 타이머 ref
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 싱글클릭 핸들러 (더블클릭과 구분하기 위해 딜레이)
  // React hooks는 반드시 조건부 return 전에 호출해야 함 (Rules of Hooks)
  const handleClick = useCallback((customerId: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = setTimeout(() => {
      onCustomerClick?.(customerId)
      clickTimerRef.current = null
    }, 300)
  }, [onCustomerClick])

  // 더블클릭 핸들러 (싱글클릭 타이머 취소)
  const handleDoubleClick = useCallback((customerId: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    onCustomerDoubleClick?.(customerId)
  }, [onCustomerDoubleClick])

  // 고객이 없거나 collapsed 상태면 숨김 (hooks 호출 후에 조건부 return)
  if (recentCustomers.length === 0 || collapsed) {
    return null
  }

  return (
    <div className="recent-customers">
      {/* 섹션 헤더 */}
      <div className="recent-customers__header">
        <ClockIcon />
        <span className="recent-customers__title">최근 검색 고객</span>
        <Tooltip content="목록 지우기" placement="top">
          <button
            type="button"
            className="recent-customers__clear-btn"
            onClick={(e) => {
              e.stopPropagation()
              clearRecentCustomers()
            }}
            aria-label="최근 검색 고객 목록 지우기"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l6 6M7 1L1 7" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* 고객 리스트 */}
      <div className="recent-customers__list">
        {recentCustomers.slice(0, 5).map((customer) => (
          <Tooltip
            key={customer._id}
            content={`${customer.name} (${customer.customerType})`}
            placement="right"
          >
            <div
              className="recent-customers__item"
              onClick={() => handleClick(customer._id)}
              onDoubleClick={() => handleDoubleClick(customer._id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClick(customer._id)
                }
              }}
            >
              <span className="recent-customers__item-icon">
                {customer.customerType === '법인' ? <BuildingIcon /> : <PersonIcon />}
              </span>
              <span className="recent-customers__item-name">{customer.name}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  )
})

RecentCustomers.displayName = 'RecentCustomers'

export default RecentCustomers
