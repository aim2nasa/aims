/**
 * Account Settings Modal Component
 * @since 2025-11-06
 * @version 2.0.0
 *
 * 사용자 계정 정보 조회 및 편집 모달
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 * CLAUDE.md 준수: 공통 Modal 및 Button 컴포넌트 사용
 */

import React, { useState } from 'react'
import Modal from '@/shared/ui/Modal/Modal'
import Button from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import './AccountSettingsModal.css'

export interface AccountSettingsModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 사용자 정보 */
  user: {
    id: string
    name: string
    email: string
    phone?: string
    department?: string
    position?: string
    avatarUrl?: string
  }
  /** 저장 핸들러 */
  onSave?: (updatedUser: Partial<AccountSettingsModalProps['user']>) => void
  /** 고급 설정 클릭 핸들러 */
  onAdvancedSettingsClick?: () => void
}

/**
 * AccountSettingsModal 컴포넌트
 *
 * 사용자 계정 정보를 조회하고 편집할 수 있는 모달
 * - 프로필 사진
 * - 이름/이메일/전화번호 편집
 * - 소속 지점/직급
 * - 간단한 알림 설정
 */
export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  visible,
  onClose,
  user,
  onSave,
  onAdvancedSettingsClick
}) => {
  // 편집 가능한 필드 상태
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    department: user.department || '',
    position: user.position || ''
  })

  // 알림 설정 상태
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false
  })

  // 편집 모드 상태
  const [isEditing, setIsEditing] = useState(false)

  // 입력 핸들러
  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }))
  }

  // 알림 토글 핸들러
  const handleNotificationToggle = (type: keyof typeof notifications) => () => {
    setNotifications(prev => ({
      ...prev,
      [type]: !prev[type]
    }))
  }

  // 저장 핸들러
  const handleSave = () => {
    if (onSave) {
      onSave(formData)
    }
    setIsEditing(false)
    onClose()
  }

  // 취소 핸들러
  const handleCancel = () => {
    // 원래 값으로 복원
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      department: user.department || '',
      position: user.position || ''
    })
    setIsEditing(false)
  }

  // 고급 설정 핸들러
  const handleAdvancedSettings = () => {
    if (onAdvancedSettingsClick) {
      onAdvancedSettingsClick()
      onClose()
    }
  }

  // 편집 시작 핸들러
  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const modalFooter = isEditing ? (
    <div className="account-settings__footer-actions">
      <Button
        variant="secondary"
        size="md"
        onClick={handleCancel}
      >
        취소
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
      >
        저장
      </Button>
    </div>
  ) : (
    <div className="account-settings__footer-actions">
      <Button
        variant="secondary"
        size="md"
        onClick={onClose}
      >
        닫기
      </Button>
    </div>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="계정 설정"
      size="lg"
      backdropClosable={!isEditing}
      escapeToClose={!isEditing}
      footer={modalFooter}
      ariaLabel="계정 설정 모달"
    >
      <div className="account-settings">
        {/* 프로필 헤더 */}
        <section className="account-settings__section account-settings__section--profile">
          <div className="account-settings__profile">
            <div className="account-settings__avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} />
              ) : (
                <div className="account-settings__avatar-placeholder">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="account-settings__profile-info">
              <h3 className="account-settings__profile-name">{user.name}</h3>
              <p className="account-settings__profile-email">{user.email}</p>
            </div>
          </div>

          {!isEditing && (
            <Tooltip content="편집">
              <button
                className="account-settings__edit-button"
                onClick={handleStartEdit}
                aria-label="편집"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1 1-3.667 9-9z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Tooltip>
          )}
        </section>

        {/* 2단 그리드 레이아웃 */}
        <div className="account-settings__grid">
          {/* 기본 정보 섹션 */}
          <section className="account-settings__section">
            <h3 className="account-settings__section-title">기본 정보</h3>

            <div className="account-settings__field">
              <label className="account-settings__label">
                <svg className="account-settings__label-icon" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                이름
              </label>
              <input
                type="text"
                className={`account-settings__input ${isEditing ? 'account-settings__input--editing' : ''}`}
                value={formData.name}
                onChange={handleInputChange('name')}
                disabled={!isEditing}
              />
            </div>

            <div className="account-settings__field">
              <label className="account-settings__label">
                <svg className="account-settings__label-icon" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                이메일
              </label>
              <input
                type="email"
                className={`account-settings__input ${isEditing ? 'account-settings__input--editing' : ''}`}
                value={formData.email}
                onChange={handleInputChange('email')}
                disabled={!isEditing}
              />
            </div>

            <div className="account-settings__field">
              <label className="account-settings__label">
                <svg className="account-settings__label-icon" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                </svg>
                전화번호
              </label>
              <input
                type="tel"
                className={`account-settings__input ${isEditing ? 'account-settings__input--editing' : ''}`}
                value={formData.phone}
                onChange={handleInputChange('phone')}
                placeholder="010-0000-0000"
                disabled={!isEditing}
              />
            </div>
          </section>

          {/* 소속 정보 섹션 */}
          <section className="account-settings__section">
            <h3 className="account-settings__section-title">소속 정보</h3>

            <div className="account-settings__field">
              <label className="account-settings__label">
                <svg className="account-settings__label-icon" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                </svg>
                지점
              </label>
              <input
                type="text"
                className={`account-settings__input ${isEditing ? 'account-settings__input--editing' : ''}`}
                value={formData.department}
                onChange={handleInputChange('department')}
                placeholder="예: 강남지점"
                disabled={!isEditing}
              />
            </div>

            <div className="account-settings__field">
              <label className="account-settings__label">
                <svg className="account-settings__label-icon" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="6" width="12" height="7" rx="1" fill="currentColor"/>
                  <path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="7" y="8" width="2" height="2" rx="0.5" fill="var(--color-bg-primary)"/>
                </svg>
                직급
              </label>
              <input
                type="text"
                className={`account-settings__input ${isEditing ? 'account-settings__input--editing' : ''}`}
                value={formData.position}
                onChange={handleInputChange('position')}
                placeholder="예: 팀장"
                disabled={!isEditing}
              />
            </div>
          </section>
        </div>

        {/* 알림 설정 섹션 */}
        <section className="account-settings__section">
          <h3 className="account-settings__section-title">알림 설정</h3>

          <div className="account-settings__toggle-group">
            <div className="account-settings__toggle-item">
              <div className="account-settings__toggle-label">
                <span>📧 이메일</span>
              </div>
              <button
                className={`account-settings__toggle ${
                  notifications.email ? 'account-settings__toggle--active' : ''
                }`}
                onClick={handleNotificationToggle('email')}
                role="switch"
                aria-checked={notifications.email}
                aria-label="이메일 알림 토글"
              >
                <span className="account-settings__toggle-slider" />
              </button>
            </div>

            <div className="account-settings__toggle-item">
              <div className="account-settings__toggle-label">
                <span>🔔 푸시</span>
              </div>
              <button
                className={`account-settings__toggle ${
                  notifications.push ? 'account-settings__toggle--active' : ''
                }`}
                onClick={handleNotificationToggle('push')}
                role="switch"
                aria-checked={notifications.push}
                aria-label="푸시 알림 토글"
              >
                <span className="account-settings__toggle-slider" />
              </button>
            </div>

            <div className="account-settings__toggle-item">
              <div className="account-settings__toggle-label">
                <span>💬 SMS</span>
              </div>
              <button
                className={`account-settings__toggle ${
                  notifications.sms ? 'account-settings__toggle--active' : ''
                }`}
                onClick={handleNotificationToggle('sms')}
                role="switch"
                aria-checked={notifications.sms}
                aria-label="SMS 알림 토글"
              >
                <span className="account-settings__toggle-slider" />
              </button>
            </div>
          </div>
        </section>

        {/* 고급 설정 링크 */}
        <section className="account-settings__section account-settings__section--footer">
          <Button
            variant="link"
            size="md"
            onClick={handleAdvancedSettings}
            disabled={!onAdvancedSettingsClick}
            leftIcon={
              <SFSymbol
                name="gearshape.2"
                size={SFSymbolSize.CAPTION_1}
                weight={SFSymbolWeight.MEDIUM}
              />
            }
            fullWidth
          >
            고급 설정
          </Button>
        </section>
      </div>
    </Modal>
  )
}

export default AccountSettingsModal
