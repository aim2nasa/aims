/**
 * 프로필 설정 모달
 * 최초 소셜 로그인 시 이름 입력을 요청하는 모달
 */

import { useState } from 'react'
import { Modal } from '@/shared/ui/Modal'
import Button from '@/shared/ui/Button'
import { updateProfile } from '@/entities/auth/api'
import { useAuthStore } from '@/shared/stores/authStore'
import './ProfileSetupModal.css'

interface ProfileSetupModalProps {
  isOpen: boolean
  onComplete: () => void
}

export default function ProfileSetupModal({ isOpen, onComplete }: ProfileSetupModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { token, setUser } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 20) {
      setError('이름은 1-20자로 입력해주세요')
      return
    }

    setIsLoading(true)
    try {
      if (!token) {
        throw new Error('로그인이 필요합니다')
      }

      // /api/auth/profile 호출
      const updatedUser = await updateProfile(token, trimmedName)

      // authStore 업데이트
      setUser(updatedUser)

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : '프로필 설정에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal visible={isOpen} onClose={() => {}} size="sm">
      <div className="profile-setup-modal">
        <h2 className="profile-setup-title">프로필을 설정해주세요</h2>
        <p className="profile-setup-description">
          AIMS에서 사용할 이름을 입력해주세요
        </p>

        <form onSubmit={handleSubmit} className="profile-setup-form">
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

          {error && <p className="profile-setup-error">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading || name.trim().length < 1}
            className="profile-setup-button"
          >
            {isLoading ? '저장 중...' : '시작하기'}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
