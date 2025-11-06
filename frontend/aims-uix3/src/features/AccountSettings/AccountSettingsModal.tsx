/**
 * Account Settings Modal Component
 * @since 2025-11-06
 * @version 1.1.0
 *
 * 사용자 계정 정보 조회 및 편집 모달
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 * CLAUDE.md 준수: 공통 Modal 컴포넌트 사용
 */

import React, { useState } from 'react'
import Modal from '@/shared/ui/Modal/Modal'
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

  const modalFooter = isEditing ? (
    <>
      <button
        className="account-settings-button account-settings-button--secondary"
        onClick={handleCancel}
      >
        취소
      </button>
      <button
        className="account-settings-button account-settings-button--primary"
        onClick={handleSave}
      >
        저장
      </button>
    </>
  ) : (
    <button
      className="account-settings-button account-settings-button--secondary"
      onClick={onClose}
    >
      닫기
    </button>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="계정 설정"
      size="md"
      backdropClosable={!isEditing}
      escapeToClose={!isEditing}
      footer={modalFooter}
      ariaLabel="계정 설정 모달"
    >
      <div className="account-settings">
        {/* 프로필 섹션 */}
        <section className="account-settings__section">
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
            {!isEditing && (
              <button
                className="account-settings__edit-button"
                onClick={() => setIsEditing(true)}
                aria-label="프로필 편집"
              >
                <SFSymbol
                  name="pencil"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
              </button>
            )}
          </div>
        </section>

        {/* 기본 정보 섹션 */}
        <section className="account-settings__section">
          <h3 className="account-settings__section-title">기본 정보</h3>

          <div className="account-settings__field">
            <label className="account-settings__label">이름</label>
            <input
              type="text"
              className="account-settings__input"
              value={formData.name}
              onChange={handleInputChange('name')}
              disabled={!isEditing}
            />
          </div>

          <div className="account-settings__field">
            <label className="account-settings__label">이메일</label>
            <input
              type="email"
              className="account-settings__input"
              value={formData.email}
              onChange={handleInputChange('email')}
              disabled={!isEditing}
            />
          </div>

          <div className="account-settings__field">
            <label className="account-settings__label">전화번호</label>
            <input
              type="tel"
              className="account-settings__input"
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
            <label className="account-settings__label">지점</label>
            <input
              type="text"
              className="account-settings__input"
              value={formData.department}
              onChange={handleInputChange('department')}
              placeholder="예: 강남지점"
              disabled={!isEditing}
            />
          </div>

          <div className="account-settings__field">
            <label className="account-settings__label">직급</label>
            <input
              type="text"
              className="account-settings__input"
              value={formData.position}
              onChange={handleInputChange('position')}
              placeholder="예: 팀장"
              disabled={!isEditing}
            />
          </div>
        </section>

        {/* 알림 설정 섹션 */}
        <section className="account-settings__section">
          <h3 className="account-settings__section-title">알림 설정</h3>

          <div className="account-settings__toggle-group">
            <div className="account-settings__toggle-item">
              <div className="account-settings__toggle-label">
                <SFSymbol
                  name="envelope"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
                <span>이메일 알림</span>
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
                <SFSymbol
                  name="bell"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
                <span>푸시 알림</span>
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
                <SFSymbol
                  name="message"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                />
                <span>SMS 알림</span>
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
          <button
            className="account-settings__link"
            onClick={handleAdvancedSettings}
            disabled={!onAdvancedSettingsClick}
          >
            <SFSymbol
              name="gearshape.2"
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>고급 설정</span>
          </button>
        </section>
      </div>
    </Modal>
  )
}

export default AccountSettingsModal
