/**
 * Account Settings Modal Component
 * @since 2025-11-06
 * @version 2.0.0
 *
 * 사용자 계정 정보 조회 및 편집 모달
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 * CLAUDE.md 준수: 공통 Modal 및 Button 컴포넌트 사용
 */

import React, { useState, useEffect } from 'react'
import Modal from '@/shared/ui/Modal/Modal'
import Button from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { getCurrentUser, updateUser, type User } from '@/entities/user/api'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/shared/stores/authStore'
import './AccountSettingsModal.css'

export interface AccountSettingsModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
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
  onAdvancedSettingsClick
}) => {
  // 전역 상태
  const { currentUser, updateCurrentUser } = useUserStore()

  // 소셜 로그인 사용자 정보 (authStore)
  const { user: authUser, isAuthenticated } = useAuthStore()

  // 사용자 정보 상태
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 편집 가능한 필드 상태
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    position: ''
  })

  // 편집 모드 상태
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 사용자 정보 로드 (authStore 우선, 없으면 레거시 currentUser, 없으면 API 호출)
  useEffect(() => {
    if (!visible) return

    const loadUserData = async () => {
      try {
        setIsLoading(true)
        setLoadError(null)

        // 1. authStore 사용자 정보 우선 사용 (소셜 로그인)
        if (isAuthenticated && authUser) {
          const authUserData: User = {
            id: authUser._id,
            name: authUser.name || '',
            email: authUser.email || '',
            role: authUser.role,
            ...(authUser.avatarUrl && { avatarUrl: authUser.avatarUrl })
          }
          setUser(authUserData)
          setFormData({
            name: authUserData.name,
            email: authUserData.email,
            phone: '',
            department: '',
            position: ''
          })
          setIsLoading(false)
          return
        }

        // 2. 레거시 전역 상태에 이미 있으면 API 호출 불필요
        if (currentUser) {
          setUser(currentUser)
          setFormData({
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.phone || '',
            department: currentUser.department || '',
            position: currentUser.position || ''
          })
          setIsLoading(false)
          return
        }

        // 3. 전역 상태에 없으면 API 호출
        const userData = await getCurrentUser()
        setUser(userData)
        setFormData({
          name: userData.name,
          email: userData.email,
          phone: userData.phone || '',
          department: userData.department || '',
          position: userData.position || ''
        })
      } catch (error) {
        console.error('사용자 정보 로드 실패:', error)
        setLoadError(error instanceof Error ? error.message : '사용자 정보를 불러올 수 없습니다')
      } finally {
        setIsLoading(false)
      }
    }

    loadUserData()
  }, [visible, currentUser, isAuthenticated, authUser])

  // 전역 currentUser 변경 감지 (다른 곳에서 저장한 경우)
  // 편집 중일 때는 사용자 입력을 보존하기 위해 동기화 스킵
  useEffect(() => {
    if (!visible || !currentUser || isEditing) return

    setUser(currentUser)
    setFormData({
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone || '',
      department: currentUser.department || '',
      position: currentUser.position || ''
    })
  }, [currentUser, visible, isEditing])

  // 입력 핸들러
  const handleInputChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }))
  }

  // 저장 핸들러
  const handleSave = async () => {
    if (!user) return

    try {
      setIsSaving(true)

      const updates: Partial<User> = {
        ...formData
      }

      // API 호출하여 DB에 저장
      const updatedUser = await updateUser(user.id, updates)
      setUser(updatedUser)
      setFormData({
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        department: updatedUser.department || '',
        position: updatedUser.position || ''
      })
      setIsEditing(false)

      // 전역 상태 업데이트 (모든 컴포넌트에 즉시 반영)
      updateCurrentUser(updatedUser)

      onClose()

      // 성공 메시지 (선택적)
      console.log('✅ 사용자 정보가 저장되었습니다')
    } catch (error) {
      console.error('❌ 사용자 정보 저장 실패:', error)
      alert(error instanceof Error ? error.message : '저장에 실패했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  // 취소 핸들러
  const handleCancel = () => {
    if (!user) return

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
        disabled={isSaving}
      >
        취소
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? '저장 중...' : '저장'}
      </Button>
    </div>
  ) : (
    <div className="account-settings__footer-actions">
      <Button
        variant="secondary"
        size="md"
        onClick={onClose}
        disabled={isLoading}
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
      size="xl"
      backdropClosable={!isEditing}
      escapeToClose={!isEditing}
      footer={modalFooter}
      ariaLabel="계정 설정 모달"
    >
      <div className="account-settings">
        {/* 로딩 상태 */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>사용자 정보를 불러오는 중...</p>
          </div>
        )}

        {/* 에러 상태 */}
        {loadError && !isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-error)' }}>
            <p>{loadError}</p>
          </div>
        )}

        {/* 정상 상태 */}
        {!isLoading && !loadError && user && (
          <>
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
            <div className="account-settings__header-actions">
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
              <Tooltip content="고급 설정">
                <button
                  className="account-settings__settings-button"
                  onClick={handleAdvancedSettings}
                  disabled={!onAdvancedSettingsClick}
                  aria-label="고급 설정"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M6.7 2h2.6l.4 1.2c.3.1.5.2.8.4l1.1-.6 1.8 1.8-.6 1.1c.2.3.3.5.4.8l1.2.4v2.6l-1.2.4c-.1.3-.2.5-.4.8l.6 1.1-1.8 1.8-1.1-.6c-.3.2-.5.3-.8.4l-.4 1.2H6.7l-.4-1.2c-.3-.1-.5-.2-.8-.4l-1.1.6-1.8-1.8.6-1.1c-.2-.3-.3-.5-.4-.8L2 9.3V6.7l1.2-.4c.1-.3.2-.5.4-.8l-.6-1.1 1.8-1.8 1.1.6c.3-.2.5-.3.8-.4L6.7 2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  </svg>
                </button>
              </Tooltip>
            </div>
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
          </>
        )}
      </div>
    </Modal>
  )
}

export default AccountSettingsModal
