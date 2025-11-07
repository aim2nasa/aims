/**
 * Account Settings View Component (Full Page Version)
 * @since 2025-11-06
 * @version 2.0.0
 *
 * 사용자 계정 정보 관리 전용 페이지 (하이브리드 2단계)
 * Apple HIG 준수: Progressive Disclosure, Clarity, Deference
 * CLAUDE.md 준수: CenterPaneView 상속, CSS 변수 사용
 */

import React, { useState } from 'react'
import CenterPaneView from '../../components/CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import './AccountSettingsView.css'

export interface AccountSettingsViewProps {
  /** View 표시 여부 */
  visible: boolean
  /** View 닫기 핸들러 */
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
  onSave?: (updatedUser: Partial<AccountSettingsViewProps['user']>) => void
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
  onClose,
  user,
  onSave
}) => {
  // 현재 탭
  const [activeTab, setActiveTab] = useState<TabId>('profile')

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
    sms: false,
    documentUpload: true,
    documentProcessed: true,
    weeklyReport: false
  })

  // 편집 모드 상태
  const [isEditing, setIsEditing] = useState(false)

  // 아바타 이미지 상태
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user.avatarUrl)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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

  // 아바타 파일 선택 핸들러
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 이미지 파일 검증
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.')
        return
      }

      // 파일 크기 검증 (5MB 제한)
      if (file.size > 5 * 1024 * 1024) {
        alert('파일 크기는 5MB 이하여야 합니다.')
        return
      }

      // FileReader로 미리보기 생성
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
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
  const handleSave = () => {
    if (onSave) {
      const updates: Partial<AccountSettingsViewProps['user']> = {
        ...formData
      }

      // 아바타가 변경되었고 유효한 경우에만 포함
      if (avatarPreview && avatarPreview !== user.avatarUrl) {
        updates.avatarUrl = avatarPreview
      }

      onSave(updates)
    }
    setIsEditing(false)
  }

  // 취소 핸들러
  const handleCancel = () => {
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

  // 탭별 콘텐츠 렌더링
  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="account-settings-view__content">
            {/* 프로필 헤더 */}
            <div className="account-settings-view__profile-header">
              <div
                className={`account-settings-view__avatar ${isEditing ? 'account-settings-view__avatar--editable' : ''}`}
                onClick={handleAvatarClick}
                role={isEditing ? 'button' : undefined}
                aria-label={isEditing ? '아바타 이미지 변경' : undefined}
                tabIndex={isEditing ? 0 : undefined}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
                aria-hidden="true"
              />
              <div className="account-settings-view__profile-info">
                <h2 className="account-settings-view__profile-name">{user.name}</h2>
                <p className="account-settings-view__profile-email">{user.email}</p>
              </div>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  leftIcon={
                    <SFSymbol
                      name="pencil"
                      size={SFSymbolSize.CAPTION_1}
                      weight={SFSymbolWeight.MEDIUM}
                    />
                  }
                >
                  편집
                </Button>
              )}
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
              <button className="account-settings-view__link account-settings-view__link--danger">
                <SFSymbol name="trash" size={SFSymbolSize.CAPTION_1} weight={SFSymbolWeight.MEDIUM} />
                <span>계정 삭제</span>
                <span className="account-settings-view__badge">준비중</span>
              </button>
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
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`account-settings-view__tab ${
              activeTab === tab.id ? 'account-settings-view__tab--active' : ''
            }`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            <SFSymbol
              name={tab.icon}
              size={SFSymbolSize.CAPTION_1}
              weight={SFSymbolWeight.MEDIUM}
            />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* 탭 콘텐츠 */}
      {renderTabContent()}
    </CenterPaneView>
  )
}

export default AccountSettingsView
