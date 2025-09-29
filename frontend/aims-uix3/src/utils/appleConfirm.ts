/**
 * 🔒 절대 신뢰성 Apple Confirm 유틸리티
 * @since 1.0.0
 *
 * React 상태 관리에 의존하지 않고 DOM을 직접 조작하여
 * 브라우저 리사이즈나 기타 이벤트에 영향받지 않는 모달
 */

// CSS 파일 import로 !important 없이 높은 특이성 확보
import './appleConfirm.css'

let currentModal: HTMLElement | null = null
let currentResolver: ((value: boolean) => void) | null = null

/**
 * 🔒 절대 신뢰성 Apple 스타일 확인 모달
 * DOM을 직접 조작하여 React 상태 관리 문제 회피
 */
export function showAppleConfirm(message: string, title?: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 기존 모달이 있으면 제거
    if (currentModal) {
      document.body.removeChild(currentModal)
      currentModal = null
    }

    currentResolver = resolve

    // 🔒 DOM 직접 생성으로 절대 신뢰성 확보 (CSS 파일의 높은 특이성 활용)
    const overlay = document.createElement('div')
    overlay.className = 'apple-confirm-direct-overlay'

    const modal = document.createElement('div')
    modal.className = 'apple-confirm-direct-modal'

    // 🍎 흔들기 애니메이션은 CSS 파일에서 정의됨 (apple-confirm-shake)

    modal.innerHTML = `
      <div style="padding: 18px 20px 10px 20px; text-align: center;">
        <div style="margin-bottom: 6px; display: flex; justify-content: center; align-items: center;">
          <div style="font-size: var(--font-size-2xl, 28px); opacity: 0.95; transform: scale(0.9);">⚠️</div>
        </div>
        <h2 style="font-size: var(--font-size-callout, 16px); font-weight: 590; line-height: 1.25; color: var(--color-text-primary, #000000); margin: 0; letter-spacing: -0.35px; font-family: var(--font-family-display, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);">
          ${title || '확인'}
        </h2>
      </div>
      <div style="padding: 0 20px 18px 20px; text-align: center;">
        <p style="font-size: var(--font-size-caption-1, 12px); font-weight: 400; line-height: 1.33; color: var(--color-text-primary, #000000); margin: 0; white-space: pre-wrap; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.06px; opacity: 0.85;">
          ${message}
        </p>
      </div>
      <div style="display: flex; border-top: 0.33px solid rgba(60, 60, 67, 0.18); min-height: 43px; position: relative;">
        <button
          class="apple-confirm-cancel-btn"
          style="flex: 1; background: none; border: none; padding: 11px 16px; font-size: var(--font-size-callout, 16px); font-weight: 400; line-height: 1.24; cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 43px; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.32px; color: var(--color-primary, #007AFF); transition: background-color 0.12s ease;">
          취소
        </button>
        <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 0.33px; background-color: var(--color-border, rgba(60, 60, 67, 0.18)); transform: translateX(-50%);"></div>
        <button
          class="apple-confirm-ok-btn"
          style="flex: 1; background: none; border: none; padding: 11px 16px; font-size: var(--font-size-callout, 16px); font-weight: 590; line-height: 1.24; cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 43px; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.32px; color: var(--color-primary, #007AFF); transition: background-color 0.12s ease;">
          확인
        </button>
      </div>
    `

    // 🔒 이벤트 핸들러 설정
    const cancelBtn = modal.querySelector('.apple-confirm-cancel-btn') as HTMLButtonElement
    const okBtn = modal.querySelector('.apple-confirm-ok-btn') as HTMLButtonElement

    const handleCancel = () => {
      closeModal()
      if (currentResolver) {
        currentResolver(false)
        currentResolver = null
      }
    }

    const handleConfirm = () => {
      closeModal()
      if (currentResolver) {
        currentResolver(true)
        currentResolver = null
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }

    // 🍎 진짜 애플 스타일: 오버레이 클릭으로는 절대 닫히지 않음
    // 오직 버튼 클릭이나 ESC 키로만 닫기 가능
    const handleOverlayClick = (e: MouseEvent) => {
      if (e.target === overlay) {
        // 🍎 애플 스타일: 클릭해도 닫히지 않고 살짝 흔들기만
        modal.style.transform = 'scale(0.98)'
        setTimeout(() => {
          modal.style.transform = 'scale(1)'
        }, 100)

        // 시각적 피드백: "이 방법으론 닫을 수 없어요" (CSS 파일의 키프레임 사용)
        modal.style.animation = 'apple-confirm-shake 0.3s ease-in-out'
        setTimeout(() => {
          modal.style.animation = ''
        }, 300)
      }
    }

    // 🔒 브라우저 리사이즈 방어
    const handleResize = () => {
      if (currentModal && currentModal.parentNode) {
        // 모달이 여전히 DOM에 있는지 확인하고 스타일 강제 적용
        overlay.style.cssText = overlay.style.cssText
        modal.style.cssText = modal.style.cssText
      }
    }

    cancelBtn.addEventListener('click', handleCancel)
    okBtn.addEventListener('click', handleConfirm)
    overlay.addEventListener('click', handleOverlayClick)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    // 🔒 호버 효과
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.04)'
    })
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.backgroundColor = ''
    })
    okBtn.addEventListener('mouseenter', () => {
      okBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.04)'
    })
    okBtn.addEventListener('mouseleave', () => {
      okBtn.style.backgroundColor = ''
    })

    let closeModal = () => {
      if (currentModal && currentModal.parentNode) {
        document.body.removeChild(currentModal)
        currentModal = null
      }
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
      document.body.style.overflow = ''
    }

    overlay.appendChild(modal)
    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'

    currentModal = overlay

    // 🔒 주기적으로 모달 존재 확인 및 복원
    const stateChecker = setInterval(() => {
      if (currentResolver && (!currentModal || !currentModal.parentNode)) {
        console.warn('🔒 Modal was removed from DOM, restoring...')
        if (currentModal && !currentModal.parentNode) {
          document.body.appendChild(currentModal)
        }
      }
    }, 100)

    // 모달이 닫힐 때 interval 정리
    const originalClose = closeModal
    closeModal = () => {
      clearInterval(stateChecker)
      originalClose()
    }
  })
}