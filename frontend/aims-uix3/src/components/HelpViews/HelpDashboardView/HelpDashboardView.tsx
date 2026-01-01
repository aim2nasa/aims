/**
 * HelpDashboardView Component
 * @since 2025-12-18
 *
 * 도움말 대시보드
 * 공지사항, 사용 가이드, FAQ, 1:1 문의로 빠르게 이동할 수 있는 허브 페이지
 */

import React from 'react'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import './HelpDashboardView.css'

// 아이콘 컴포넌트들
const HelpIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="help-dashboard__title-icon">
    <circle cx="12" cy="12" r="10" opacity="0.15"/>
    <text x="12" y="16" textAnchor="middle" fontSize="14" fontWeight="bold">?</text>
  </svg>
)

const BellIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" opacity="0.85"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const BookIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" opacity="0.85"/>
  </svg>
)

const FAQIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" opacity="0.85"/>
    <text x="12" y="13" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--color-bg-primary, white)">?</text>
  </svg>
)

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3C6.5 3 2 6.58 2 11c0 2.13 1.02 4.05 2.67 5.47L4 21l4.88-2.33C9.86 18.89 10.91 19 12 19c5.5 0 10-3.58 10-8s-4.5-8-10-8z" opacity="0.85"/>
  </svg>
)

interface HelpDashboardViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
  /** 메뉴 네비게이션 핸들러 */
  onNavigate?: (menuKey: string) => void
  /** 공지사항 새 글 여부 */
  noticeHasNew?: boolean
  /** 1:1 문의 미확인 개수 */
  inquiryUnreadCount?: number
}

/**
 * HelpDashboardView React 컴포넌트
 *
 * 도움말 대시보드 - 도움말 기능으로 빠르게 이동
 */
export const HelpDashboardView: React.FC<HelpDashboardViewProps> = ({
  visible,
  onClose,
  onNavigate,
  noticeHasNew = false,
  inquiryUnreadCount = 0,
}) => {
  return (
    <CenterPaneView
      visible={visible}
      title="도움말"
      titleIcon={<HelpIcon />}
      onClose={onClose}
      marginTop={5}
      marginBottom={5}
      marginLeft={5}
      marginRight={5}
      className="help-dashboard-view"
    >
      <div className="help-dashboard-view__content">
        {/* 도움말 메뉴 섹션 */}
        <section className="help-dashboard-view__section">
          <h2 className="help-dashboard-view__section-title">
            <HelpIcon />
            도움이 필요하신가요?
          </h2>
          <p className="help-dashboard-view__section-description">
            서비스 사용에 관한 다양한 도움을 받으실 수 있습니다.
          </p>

          <div className="help-dashboard-view__cards">
            {/* 공지사항 카드 */}
            <button
              type="button"
              className="help-dashboard-view__card help-dashboard-view__card--notice"
              onClick={() => onNavigate?.('help-notice')}
            >
              <div className="help-dashboard-view__card-icon">
                <BellIcon />
                {noticeHasNew && <span className="help-dashboard-view__badge">N</span>}
              </div>
              <div className="help-dashboard-view__card-content">
                <span className="help-dashboard-view__card-title">공지사항</span>
                <span className="help-dashboard-view__card-description">
                  상품 변경, 정책 안내, 시스템 점검 등의 소식을 확인하세요
                </span>
              </div>
              <svg className="help-dashboard-view__card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
              </svg>
            </button>

            {/* 사용 가이드 카드 */}
            <button
              type="button"
              className="help-dashboard-view__card help-dashboard-view__card--guide"
              onClick={() => onNavigate?.('help-guide')}
            >
              <div className="help-dashboard-view__card-icon">
                <BookIcon />
              </div>
              <div className="help-dashboard-view__card-content">
                <span className="help-dashboard-view__card-title">사용 가이드</span>
                <span className="help-dashboard-view__card-description">
                  기능별 튜토리얼과 사용 방법을 단계별로 안내해 드립니다
                </span>
              </div>
              <svg className="help-dashboard-view__card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
              </svg>
            </button>

            {/* FAQ 카드 */}
            <button
              type="button"
              className="help-dashboard-view__card help-dashboard-view__card--faq"
              onClick={() => onNavigate?.('help-faq')}
            >
              <div className="help-dashboard-view__card-icon">
                <FAQIcon />
              </div>
              <div className="help-dashboard-view__card-content">
                <span className="help-dashboard-view__card-title">자주 묻는 질문 (FAQ)</span>
                <span className="help-dashboard-view__card-description">
                  사용자들이 자주 묻는 질문과 답변을 확인하세요
                </span>
              </div>
              <svg className="help-dashboard-view__card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
              </svg>
            </button>

            {/* 1:1 문의 카드 */}
            <button
              type="button"
              className="help-dashboard-view__card help-dashboard-view__card--inquiry"
              onClick={() => onNavigate?.('help-inquiry')}
            >
              <div className="help-dashboard-view__card-icon">
                <ChatIcon />
                {inquiryUnreadCount > 0 && (
                  <span className="help-dashboard-view__badge help-dashboard-view__badge--count">
                    {inquiryUnreadCount > 99 ? '99+' : inquiryUnreadCount}
                  </span>
                )}
              </div>
              <div className="help-dashboard-view__card-content">
                <span className="help-dashboard-view__card-title">1:1 문의</span>
                <span className="help-dashboard-view__card-description">
                  해결되지 않는 문제가 있으시면 직접 문의해 주세요
                </span>
              </div>
              <svg className="help-dashboard-view__card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
              </svg>
            </button>
          </div>
        </section>

        {/* 연락처 정보 섹션 */}
        <section className="help-dashboard-view__section help-dashboard-view__section--contact">
          <h2 className="help-dashboard-view__section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" opacity="0.85"/>
              <polyline points="22,6 12,13 2,6" fill="none" stroke="var(--color-bg-primary, white)" strokeWidth="2"/>
            </svg>
            문의 연락처
          </h2>
          <div className="help-dashboard-view__contact-info">
            <div className="help-dashboard-view__contact-item">
              <span className="help-dashboard-view__contact-label">이메일</span>
              <span className="help-dashboard-view__contact-value">support@aims.co.kr</span>
            </div>
          </div>
        </section>
      </div>
    </CenterPaneView>
  )
}

export default HelpDashboardView
