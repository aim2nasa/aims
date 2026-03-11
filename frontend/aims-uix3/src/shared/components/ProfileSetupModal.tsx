/**
 * 프로필 설정 모달
 * 최초 소셜 로그인 시 프로필 정보(이름, 이메일, 프로필 사진) 확인 및 설정
 * 소셜 로그인에서 받아온 값을 초기값으로 표시하고, 사용자가 수정 가능
 */

import { useState, useRef, useEffect } from 'react'
import { Modal } from '@/shared/ui/Modal'
import Button from '@/shared/ui/Button'
import { updateProfile } from '@/entities/auth/api'
import { useAuthStore } from '@/shared/stores/authStore'
import './ProfileSetupModal.css'

interface ProfileSetupModalProps {
  isOpen: boolean
  onComplete: () => void
  onCancel: () => void  // 취소 시 로그인 화면으로 돌아가기
}

export default function ProfileSetupModal({ isOpen, onComplete, onCancel }: ProfileSetupModalProps) {
  const { token, user, setUser } = useAuthStore()

  // 소셜 로그인에서 받아온 초기값
  const oauthProfile = user?.oauthProfile

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 초기값 설정 (oauthProfile에서 가져오기)
  useEffect(() => {
    if (oauthProfile) {
      setName(oauthProfile.name || '')
      setEmail(oauthProfile.email || '')
      setAvatarUrl(oauthProfile.avatarUrl || null)
    }
  }, [oauthProfile])

  // 프로필 사진 선택 핸들러
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  // 파일 선택 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 크기 체크 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      setError('사진 용량이 너무 큽니다. 스마트폰 기본 카메라로 찍은 사진을 사용해보세요.')
      return
    }

    // 이미지 타입 체크
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 선택 가능합니다')
      return
    }

    // Base64로 변환
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarUrl(reader.result as string)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 20) {
      setError('이름은 1-20자로 입력해주세요')
      return
    }

    const trimmedEmail = email.trim()
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('올바른 이메일 형식이 아닙니다')
      return
    }

    setIsLoading(true)
    try {
      if (!token) {
        throw new Error('로그인이 필요합니다')
      }

      // /api/auth/profile 호출 (이름, 이메일, 프로필 사진 모두 전송)
      const updatedUser = await updateProfile(token, {
        name: trimmedName,
        email: trimmedEmail || undefined,
        avatarUrl: avatarUrl
      })

      // authStore 업데이트
      setUser(updatedUser)

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로필 설정에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 이름 이니셜 (프로필 사진 없을 때 표시)
  const getInitial = () => {
    if (name.trim()) {
      return name.trim().charAt(0).toUpperCase()
    }
    return '?'
  }

  return (
    <Modal visible={isOpen} onClose={onCancel} size="sm">
      <div className="profile-setup-modal">
        {/* 닫기 버튼 */}
        <button
          type="button"
          className="profile-setup-close"
          onClick={onCancel}
          aria-label="닫기"
        >
          ×
        </button>

        <h2 className="profile-setup-title">프로필을 설정해주세요</h2>
        <p className="profile-setup-description">
          소셜 로그인 정보를 확인하고 필요시 수정하세요
        </p>

        <form onSubmit={handleSubmit} className="profile-setup-form">
          {/* 프로필 사진 */}
          <div className="profile-setup-avatar-section">
            <div
              className={`profile-setup-avatar ${!avatarUrl ? 'profile-setup-avatar--empty' : ''}`}
              onClick={handleAvatarClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleAvatarClick()}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="프로필 사진"
                  className="profile-setup-avatar-image"
                />
              ) : (
                <div className="profile-setup-avatar-empty">
                  <span className="profile-setup-avatar-empty-icon">📷</span>
                  <span className="profile-setup-avatar-empty-text">사진 추가</span>
                </div>
              )}
              {avatarUrl && (
                <div className="profile-setup-avatar-overlay">
                  <span className="profile-setup-avatar-edit-icon">📷</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="profile-setup-file-input"
              disabled={isLoading}
              title="프로필 사진 선택"
              aria-label="프로필 사진 선택"
            />
          </div>

          {/* 이름 */}
          <div className="profile-setup-field">
            <label htmlFor="profile-name" className="profile-setup-label">
              이름
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="profile-setup-input"
              maxLength={20}
              autoFocus
              disabled={isLoading}
            />
          </div>

          {/* 이메일 */}
          <div className="profile-setup-field">
            <label htmlFor="profile-email" className="profile-setup-label">
              이메일
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일을 입력하세요"
              className="profile-setup-input"
              disabled={isLoading}
            />
          </div>

          {error && <p className="profile-setup-error">{error}</p>}

          <div className="profile-setup-actions">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isLoading || name.trim().length < 1}
            >
              {isLoading ? '저장 중...' : '시작하기'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
