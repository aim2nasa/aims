/**
 * Account Settings View Component (Full Page Version)
 * @since 2025-11-06
 * @version 2.0.1
 *
 * 사용자 계정 정보 관리 전용 페이지 (하이브리드 2단계)
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 * CLAUDE.md 준수: CenterPaneView 상속, CSS 변수 사용
 */

import React, { useState, useEffect } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import CenterPaneView from '../../components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import Modal from '@/shared/ui/Modal/Modal'
import { Tooltip } from '@/shared/ui/Tooltip'
import { getCurrentUser, updateUser, type User } from '@/entities/user/api'
import { deleteAccount } from '@/entities/auth/api'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/shared/stores/authStore'
import './AccountSettingsView.css'

export interface AccountSettingsViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
  onClose: () => void
}

type TabId = 'profile' | 'security' | 'notifications' | 'data'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'profile', label: '개인정보', icon: 'person.circle' },
  { id: 'security', label: '보안', icon: 'lock.shield' },
  { id: 'notifications', label: '알림', icon: 'bell' },
  { id: 'data', label: '데이터', icon: 'cylinder' }
]

/**
 * AccountSettingsView 컴포넌트
 *
 * 계정 설정 전용 페이지 (탭 구조)
 * - 개인정보: 프로필, 기본 정보, 소속 정보
 * - 보안: 비밀번호 변경, 2단계 인증
 * - 알림: 세부 알림 규칙 설정
 * - 데이터: 데이터 내보내기, 계정 삭제
 */
export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  visible,
  onClose
}) => {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()

  // 전역 상태
  const { currentUser, updateCurrentUser } = useUserStore()

  // 소셜 로그인 사용자 정보 (authStore)
  const { user: authUser, isAuthenticated, setUser: setAuthUser, token, logout } = useAuthStore()

  // 현재 탭
  const [activeTab, setActiveTab] = useState<TabId>('profile')

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

  // 알림 설정 상태
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
    documentUpload: true,
    documentProcessed: true,
    weeklyReport: false
  })

  // 편집 모드 상태
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // 계정 삭제 모달 상태
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 아바타 이미지 상태
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(undefined)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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
          setAvatarPreview(authUserData.avatarUrl)
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
          setAvatarPreview(currentUser.avatarUrl)
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
        setAvatarPreview(userData.avatarUrl)
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
    setAvatarPreview(currentUser.avatarUrl)
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

  // 아바타 클릭 핸들러
  const handleAvatarClick = () => {
    if (isEditing && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // 이미지를 200x200으로 리사이즈하는 함수
  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }

        // 정사각형 크롭 (중앙 기준)
        const size = Math.min(img.width, img.height)
        const offsetX = (img.width - size) / 2
        const offsetY = (img.height - size) / 2

        canvas.width = 200
        canvas.height = 200
        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 200, 200)

        // JPEG로 압축 (품질 0.8)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }

      img.onerror = () => reject(new Error('이미지 로드 실패'))
      reader.onerror = () => reject(new Error('파일 읽기 실패'))
      reader.readAsDataURL(file)
    })
  }

  // 아바타 파일 선택 핸들러
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 이미지 파일 검증
      if (!file.type.startsWith('image/')) {
        showAlert({
          title: '파일 형식 오류',
          message: '이미지 파일만 업로드할 수 있습니다.',
          iconType: 'warning'
        })
        return
      }

      // 파일 크기 검증 (10MB 제한)
      if (file.size > 10 * 1024 * 1024) {
        showAlert({
          title: '파일 크기 초과',
          message: '파일 크기는 10MB 이하여야 합니다.',
          iconType: 'warning'
        })
        return
      }

      try {
        // 200x200으로 리사이즈
        const resizedImage = await resizeImage(file)
        setAvatarPreview(resizedImage)
      } catch (error) {
        console.error('이미지 리사이즈 실패:', error)
        showAlert({
          title: '이미지 처리 오류',
          message: '이미지 처리 중 오류가 발생했습니다.',
          iconType: 'error'
        })
      }
    }
  }

  // 알림 토글 핸들러
  const handleNotificationToggle = (type: keyof typeof notifications) => () => {
    setNotifications(prev => ({
      ...prev,
      [type]: !prev[type]
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

      // 아바타가 변경되었고 유효한 경우에만 포함
      if (avatarPreview && avatarPreview !== user.avatarUrl) {
        updates.avatarUrl = avatarPreview
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
      setAvatarPreview(updatedUser.avatarUrl)
      setIsEditing(false)

      // 전역 상태 업데이트 (모든 컴포넌트에 즉시 반영)
      updateCurrentUser(updatedUser)

      // authStore도 업데이트 (프로필 메뉴 등에 즉시 반영)
      if (authUser) {
        setAuthUser({
          ...authUser,
          name: updatedUser.name,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl || null
        })
      }

      // 성공 메시지 (선택적)
      console.log('✅ 사용자 정보가 저장되었습니다')
    } catch (error) {
      console.error('❌ 사용자 정보 저장 실패:', error)
      showAlert({
        title: '저장 실패',
        message: error instanceof Error ? error.message : '저장에 실패했습니다',
        iconType: 'error'
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 취소 핸들러
  const handleCancel = () => {
    if (!user) return

    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      department: user.department || '',
      position: user.position || ''
    })
    setAvatarPreview(user.avatarUrl)
    setIsEditing(false)
  }

  // 계정 삭제 핸들러
  const handleDeleteAccount = async () => {
    if (!token) {
      showAlert({
        title: '로그인 필요',
        message: '로그인이 필요합니다.',
        iconType: 'warning'
      })
      return
    }

    try {
      setIsDeleting(true)
      await deleteAccount(token)

      // 로그아웃 처리
      logout()
      localStorage.removeItem('auth-storage')

      // 삭제 완료 후 로그인 페이지로 이동
      setShowDeleteModal(false)
      onClose()
      window.location.href = '/login'
    } catch (error) {
      console.error('계정 삭제 실패:', error)
      showAlert({
        title: '삭제 실패',
        message: error instanceof Error ? error.message : '계정 삭제에 실패했습니다.',
        iconType: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // 탭별 콘텐츠 렌더링
  const renderTabContent = () => {
    // 로딩 중
    if (isLoading) {
      return (
        <div className="account-settings-view__content">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>사용자 정보를 불러오는 중...</p>
          </div>
        </div>
      )
    }

    // 에러 발생
    if (loadError || !user) {
      return (
        <div className="account-settings-view__content">
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-error)' }}>
            <p>{loadError || '사용자 정보를 불러올 수 없습니다'}</p>
          </div>
        </div>
      )
    }

    switch (activeTab) {
      case 'profile':
        return (
          <div className="account-settings-view__content">
            {/* 프로필 헤더 */}
            <div className="account-settings-view__profile-header">
              <div className="account-settings-view__profile">
                <div className="account-settings-view__avatar-wrapper">
                  <div
                    className="account-settings-view__avatar"
                    onClick={handleAvatarClick}
                    role={isEditing ? 'button' : undefined}
                    aria-label={isEditing ? '아바타 이미지 변경' : undefined}
                    tabIndex={isEditing ? 0 : undefined}
                    style={
                      isEditing
                        ? {
                            boxShadow:
                              'inset 0 0 0 5px var(--color-accent-blue), 0 0 30px var(--color-accent-blue-alpha-80)',
                            cursor: 'pointer'
                          }
                        : undefined
                    }
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={user.name} />
                    ) : (
                      <div className="account-settings-view__avatar-placeholder">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {isEditing && (
                      <div className="account-settings-view__avatar-overlay">
                        <SFSymbol
                          name="camera"
                          size={SFSymbolSize.BODY}
                          weight={SFSymbolWeight.MEDIUM}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
                <div className="account-settings-view__profile-info">
                  <div className="account-settings-view__name-row">
                    <h2 className="account-settings-view__profile-name">{user.name}</h2>
                    {!isEditing && (
                      <Tooltip content="편집">
                        <button
                          className="edit-mode-icon-button"
                          onClick={() => setIsEditing(true)}
                          aria-label="편집"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1 1-3.667 9-9z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <p className="account-settings-view__profile-email">{user.email}</p>
                </div>
              </div>
            </div>

            {/* 2단 그리드 레이아웃 */}
            <div className="account-settings-view__grid">
              {/* 기본 정보 섹션 */}
              <section className="account-settings-view__section">
                <h3 className="account-settings-view__section-title">기본 정보</h3>

                <div className="account-settings-view__field">
                  <label className="account-settings-view__label">
                    <svg className="account-settings-view__label-icon" width="13" height="13" viewBox="0 0 16 16">
                      <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                      <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                    </svg>
                    이름
                  </label>
                  <input
                    type="text"
                    className="account-settings-view__input"
                    value={formData.name}
                    onChange={handleInputChange('name')}
                    disabled={!isEditing}
                  />
                </div>

                <div className="account-settings-view__field">
                  <label className="account-settings-view__label">
                    <svg className="account-settings-view__label-icon" width="13" height="13" viewBox="0 0 16 16">
                      <rect x="1" y="4" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      <path d="M1 5l7 5 7-5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    </svg>
                    이메일
                  </label>
                  <input
                    type="email"
                    className="account-settings-view__input"
                    value={formData.email}
                    onChange={handleInputChange('email')}
                    disabled={!isEditing}
                  />
                </div>

                <div className="account-settings-view__field">
                  <label className="account-settings-view__label">
                    <svg className="account-settings-view__label-icon" width="13" height="13" viewBox="0 0 16 16">
                      <path d="M3 1h3l1 3-2 2c1 2 3 4 5 5l2-2 3 1v3c0 1-1 2-2 2C6 15 1 10 1 3c0-1 1-2 2-2z" fill="currentColor"/>
                    </svg>
                    전화번호
                  </label>
                  <input
                    type="tel"
                    className="account-settings-view__input"
                    value={formData.phone}
                    onChange={handleInputChange('phone')}
                    placeholder="010-0000-0000"
                    disabled={!isEditing}
                  />
                </div>
              </section>

              {/* 소속 정보 섹션 */}
              <section className="account-settings-view__section">
                <h3 className="account-settings-view__section-title">소속 정보</h3>

                <div className="account-settings-view__field">
                  <label className="account-settings-view__label">
                    <svg className="account-settings-view__label-icon" width="13" height="13" viewBox="0 0 16 16">
                      <path d="M8 1l-7 6h2v7h4V9h2v5h4V7h2L8 1z" fill="currentColor"/>
                    </svg>
                    지점
                  </label>
                  <input
                    type="text"
                    className="account-settings-view__input"
                    value={formData.department}
                    onChange={handleInputChange('department')}
                    placeholder="예: 강남지점"
                    disabled={!isEditing}
                  />
                </div>

                <div className="account-settings-view__field">
                  <label className="account-settings-view__label">
                    <svg className="account-settings-view__label-icon" width="13" height="13" viewBox="0 0 16 16">
                      <rect x="2" y="6" width="12" height="7" rx="1" fill="currentColor"/>
                      <path d="M5 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <rect x="7" y="8" width="2" height="2" rx="0.5" fill="var(--color-bg-primary)"/>
                    </svg>
                    직급
                  </label>
                  <input
                    type="text"
                    className="account-settings-view__input"
                    value={formData.position}
                    onChange={handleInputChange('position')}
                    placeholder="예: 팀장"
                    disabled={!isEditing}
                  />
                </div>
              </section>
            </div>

            {/* 편집 모드 버튼 */}
            {isEditing && (
              <div className="account-settings-view__actions">
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
            )}
          </div>
        )

      case 'security':
        return (
          <div className="account-settings-view__content">
            <section className="account-settings-view__section">
              <h3 className="account-settings-view__section-title">비밀번호</h3>
              <button className="account-settings-view__link">
                <SFSymbol name="key" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                <span>비밀번호 변경</span>
                <span className="account-settings-view__badge">준비중</span>
              </button>
            </section>

            <section className="account-settings-view__section">
              <h3 className="account-settings-view__section-title">2단계 인증</h3>
              <button className="account-settings-view__link">
                <SFSymbol name="lock.shield" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                <span>2단계 인증 설정</span>
                <span className="account-settings-view__badge">준비중</span>
              </button>
            </section>
          </div>
        )

      case 'notifications':
        return (
          <div className="account-settings-view__content">
            <section className="account-settings-view__section">
              <h3 className="account-settings-view__section-title">기본 알림</h3>

              <div className="account-settings-view__toggle-group">
                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="envelope" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>이메일 알림</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.email ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('email')}
                    role="switch"
                    aria-checked={notifications.email}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>

                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="bell" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>푸시 알림</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.push ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('push')}
                    role="switch"
                    aria-checked={notifications.push}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>

                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="message" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>SMS 알림</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.sms ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('sms')}
                    role="switch"
                    aria-checked={notifications.sms}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>
              </div>
            </section>

            <section className="account-settings-view__section">
              <h3 className="account-settings-view__section-title">이벤트 알림</h3>

              <div className="account-settings-view__toggle-group">
                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="doc.badge.plus" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>문서 업로드 알림</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.documentUpload ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('documentUpload')}
                    role="switch"
                    aria-checked={notifications.documentUpload}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>

                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="doc.badge.clock" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>문서 처리 완료 알림</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.documentProcessed ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('documentProcessed')}
                    role="switch"
                    aria-checked={notifications.documentProcessed}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>

                <div className="account-settings-view__toggle-item">
                  <div className="account-settings-view__toggle-label">
                    <SFSymbol name="chart.bar" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                    <span>주간 리포트</span>
                  </div>
                  <button
                    className={`account-settings-view__toggle ${
                      notifications.weeklyReport ? 'account-settings-view__toggle--active' : ''
                    }`}
                    onClick={handleNotificationToggle('weeklyReport')}
                    role="switch"
                    aria-checked={notifications.weeklyReport}
                  >
                    <span className="account-settings-view__toggle-slider" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        )

      case 'data':
        return (
          <div className="account-settings-view__content">
            <section className="account-settings-view__section">
              <h3 className="account-settings-view__section-title">데이터 관리</h3>
              <button className="account-settings-view__link">
                <SFSymbol name="square.and.arrow.down" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                <span>내 데이터 내보내기</span>
                <span className="account-settings-view__badge">준비중</span>
              </button>
            </section>

            <section className="account-settings-view__section account-settings-view__section--danger">
              <h3 className="account-settings-view__section-title">위험 영역</h3>
              <Tooltip content="계정과 모든 데이터가 영구적으로 삭제됩니다" placement="top">
                <button
                  type="button"
                  className="account-settings-view__link account-settings-view__link--danger"
                  onClick={() => setShowDeleteModal(true)}
                  aria-label="계정 삭제"
                >
                  <SFSymbol name="trash" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                  <span>계정 삭제</span>
                </button>
              </Tooltip>
            </section>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <CenterPaneView
      visible={visible}
      title="고급 계정 설정"
      titleIcon={
        <SFSymbol
          name="gearshape"
          size={SFSymbolSize.FOOTNOTE}
          weight={SFSymbolWeight.MEDIUM}
        />
      }
      onClose={onClose}
      marginTop={4}
      marginBottom={4}
      marginLeft={4}
      marginRight={4}
      className="account-settings-view"
    >
      {/* 탭 네비게이션 */}
      <nav className="account-settings-view__tabs">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              className={`account-settings-view__tab ${
                isActive ? 'account-settings-view__tab--active' : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
              aria-selected={isActive}
              style={isActive ? { color: 'var(--color-neutral-0)', background: 'var(--color-accent-blue)', borderColor: 'var(--color-accent-blue)' } : undefined}
            >
              {/* SVG 아이콘 직접 추가 */}
              {tab.id === 'profile' && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5.5 6c0-2.5 2-4.5 4.5-4.5h2c2.5 0 4.5 2 4.5 4.5v.5H2.5v-.5z" fill={isActive ? 'var(--color-neutral-0)' : 'var(--color-icon-blue)'}/>
                </svg>
              )}
              {tab.id === 'security' && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M8 1l-6 2.5v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5v-4L8 1zm0 6.5v5c-2.5-.8-4.5-3.2-4.5-5.5V5L8 3.2V7.5z" fill={isActive ? 'var(--color-neutral-0)' : 'var(--color-icon-purple)'}/>
                </svg>
              )}
              {tab.id === 'notifications' && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M8 2a4 4 0 0 0-4 4v3.5l-1 1.5h10l-1-1.5V6a4 4 0 0 0-4-4zm2 11h-4c0 1.1.9 2 2 2s2-.9 2-2z" fill={isActive ? 'var(--color-neutral-0)' : 'var(--color-icon-orange)'}/>
                </svg>
              )}
              {tab.id === 'data' && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <ellipse cx="8" cy="4" rx="5" ry="2" fill={isActive ? 'var(--color-neutral-0)' : 'var(--color-icon-green)'}/>
                  <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4c0 1.1-2.2 2-5 2s-5-.9-5-2z" fill={isActive ? 'var(--color-neutral-0)' : 'var(--color-icon-green)'}/>
                </svg>
              )}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* 탭 콘텐츠 */}
      {renderTabContent()}

      {/* 계정 삭제 확인 모달 */}
      <Modal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="계정 삭제"
        size="sm"
        backdropClosable={!isDeleting}
        escapeToClose={!isDeleting}
        footer={
          <div className="account-settings-view__delete-modal-footer">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              size="md"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        }
        ariaLabel="계정 삭제 확인"
      >
        <div className="account-settings-view__delete-modal-content">
          <div className="account-settings-view__delete-modal-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--color-text-error, #FF3B30)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="account-settings-view__delete-modal-title">
            정말 계정을 삭제하시겠습니까?
          </p>
          <p className="account-settings-view__delete-modal-desc">
            이 작업은 되돌릴 수 없으며, 모든 데이터가 영구적으로 삭제됩니다.
          </p>
        </div>
      </Modal>
    </CenterPaneView>
  )
}

export default AccountSettingsView
