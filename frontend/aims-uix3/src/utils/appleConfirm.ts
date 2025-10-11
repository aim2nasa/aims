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
export function showAppleConfirm(
  message: string,
  title?: string,
  options?: {
    linkText?: string;
    onLinkClick?: () => void;
    showConfirmButton?: boolean;
  }
): Promise<boolean> {
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

    // 메시지에서 링크 텍스트를 찾아서 클릭 가능하게 만들기
    const processedMessage = options?.linkText
      ? message.replace(
          options.linkText,
          `<span class="apple-confirm-link">${options.linkText}</span>`
        )
      : message;

    // 🍎 Apple 스타일: 확인 버튼 표시 여부 (기본값 true)
    const showConfirmButton = options?.showConfirmButton !== false;

    const buttonsHTML = showConfirmButton
      ? `
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
      : `
        <div style="display: flex; border-top: 0.33px solid rgba(60, 60, 67, 0.18); min-height: 43px;">
          <button
            class="apple-confirm-cancel-btn"
            style="flex: 1; background: none; border: none; padding: 11px 16px; font-size: var(--font-size-callout, 16px); font-weight: 590; line-height: 1.24; cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 43px; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.32px; color: var(--color-primary, #007AFF); transition: background-color 0.12s ease;">
            확인
          </button>
        </div>
      `;

    modal.innerHTML = `
      ${title ? `
        <div style="padding: 18px 20px 10px 20px; text-align: center;">
          <div style="margin-bottom: 6px; display: flex; justify-content: center; align-items: center;">
            <div style="font-size: var(--font-size-2xl, 28px); opacity: 0.95; transform: scale(0.9);">⚠️</div>
          </div>
          <h2 style="font-size: var(--font-size-callout, 16px); font-weight: 590; line-height: 1.25; color: var(--color-text-primary, #000000); margin: 0; letter-spacing: -0.35px; font-family: var(--font-family-display, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);">
            ${title}
          </h2>
        </div>
      ` : `
        <div style="padding: 18px 20px 10px 20px; text-align: center;">
          <div style="margin-bottom: 6px; display: flex; justify-content: center; align-items: center;">
            <div style="font-size: var(--font-size-2xl, 28px); opacity: 0.95; transform: scale(0.9);">⚠️</div>
          </div>
        </div>
      `}
      <div style="padding: 0 20px 18px 20px; text-align: center;">
        <p style="font-size: var(--font-size-caption-1, 12px); font-weight: 400; line-height: 1.33; color: var(--color-text-primary, #000000); margin: 0; white-space: pre-wrap; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.06px; opacity: 0.85;">
          ${processedMessage}
        </p>
      </div>
      ${buttonsHTML}
    `

    // 🔒 이벤트 핸들러 설정
    const cancelBtn = modal.querySelector('.apple-confirm-cancel-btn') as HTMLButtonElement
    const okBtn = modal.querySelector('.apple-confirm-ok-btn') as HTMLButtonElement
    const linkElement = modal.querySelector('.apple-confirm-link') as HTMLSpanElement

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

    // 🍎 링크 클릭 핸들러 - 모달을 닫지 않고 링크 함수만 실행
    const handleLinkClick = async () => {
      if (options?.onLinkClick) {
        await options.onLinkClick()
        // 링크 클릭 후에는 모달을 닫지 않음 - 사용자가 취소/확인 선택해야 함
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
        overlay.style.cssText = String(overlay.style.cssText)
        modal.style.cssText = String(modal.style.cssText)
      }
    }

    cancelBtn.addEventListener('click', handleCancel)
    if (okBtn) {
      okBtn.addEventListener('click', handleConfirm)
    }
    if (linkElement) {
      linkElement.addEventListener('click', handleLinkClick)
    }
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
    if (okBtn) {
      okBtn.addEventListener('mouseenter', () => {
        okBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.04)'
      })
      okBtn.addEventListener('mouseleave', () => {
        okBtn.style.backgroundColor = ''
      })
    }

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

/**
 * 🍎 파일 크기 초과 목록을 보여주는 Apple 스타일 모달
 * 스크롤 가능한 파일 목록과 함께 상세 정보 표시
 */
export function showOversizedFilesModal(
  oversizedFiles: Array<{ name: string; size: number }>,
  sizeLimit: number
): Promise<boolean> {
  return new Promise((resolve) => {
    // 기존 모달을 임시로 숨기기 (제거하지 않음)
    const previousModal = currentModal
    // mod1의 resolver는 currentResolver에 그대로 유지됨

    if (previousModal) {
      previousModal.style.display = 'none'
    }

    // currentResolver는 변경하지 않음 - mod1의 resolver 보호

    // 🔒 DOM 직접 생성으로 절대 신뢰성 확보
    const overlay = document.createElement('div')
    overlay.className = 'apple-confirm-direct-overlay'

    const modal = document.createElement('div')
    modal.className = 'apple-confirm-direct-modal apple-confirm-file-list-modal'

    // 파일 크기를 MB 단위로 변환하는 헬퍼 함수
    const formatFileSize = (bytes: number): string => {
      const mb = bytes / (1024 * 1024)
      return mb.toFixed(1) + 'MB'
    }

    // 파일 목록 HTML 생성 - 모든 파일을 표시
    const fileListHTML = oversizedFiles
      .map((file, index) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; ${index < oversizedFiles.length - 1 ? 'border-bottom: 0.33px solid rgba(60, 60, 67, 0.18);' : ''}">
          <span style="font-size: var(--font-size-footnote, 13px); font-weight: 400; color: var(--color-text-primary, #000000); opacity: 0.85; flex: 1; word-break: break-word; margin-right: 16px; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); line-height: 1.3;">
            ${file.name}
          </span>
          <span style="font-size: var(--font-size-footnote, 13px); font-weight: 590; color: var(--color-primary, #007AFF); font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); white-space: nowrap;">
            ${formatFileSize(file.size)}
          </span>
        </div>
      `)
      .join('')

    modal.innerHTML = `
      <div style="padding: 18px 20px 10px 20px; text-align: center;">
        <div style="margin-bottom: 6px; display: flex; justify-content: center; align-items: center;">
          <div style="font-size: var(--font-size-2xl, 28px); opacity: 0.95; transform: scale(0.9);">⚠️</div>
        </div>
      </div>
      <div style="padding: 0 20px 16px 20px; text-align: center;">
        <p style="font-size: var(--font-size-caption-1, 12px); font-weight: 400; line-height: 1.33; color: var(--color-text-primary, #000000); margin: 0 0 16px 0; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.06px; opacity: 0.85;">
          다음 파일들은 ${formatFileSize(sizeLimit)} 제한을 초과하여 업로드에서 제외됩니다.
        </p>
        <div style="max-height: 320px; overflow-y: auto; border-radius: 10px; background-color: var(--color-bg-secondary, rgba(248, 248, 248, 0.9)); padding: 16px; margin-bottom: 12px; border: 0.33px solid rgba(60, 60, 67, 0.12);">
          ${fileListHTML}
        </div>
      </div>
      <div style="display: flex; border-top: 0.33px solid rgba(60, 60, 67, 0.18); min-height: 43px;">
        <button
          class="apple-confirm-cancel-btn"
          style="flex: 1; background: none; border: none; padding: 11px 16px; font-size: var(--font-size-callout, 16px); font-weight: 590; line-height: 1.24; cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: 43px; font-family: var(--font-family-text, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); letter-spacing: -0.32px; color: var(--color-primary, #007AFF); transition: background-color 0.12s ease;">
          확인
        </button>
      </div>
    `

    // 🔒 이벤트 핸들러 설정
    const cancelBtn = modal.querySelector('.apple-confirm-cancel-btn') as HTMLButtonElement

    const handleClose = () => {
      closeModal()
      // mod2에서는 자체 resolver만 처리, mod1의 resolver는 건드리지 않음
      if (resolve) {
        resolve(true)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    // 🍎 진짜 애플 스타일: 오버레이 클릭으로는 절대 닫히지 않음
    const handleOverlayClick = (e: MouseEvent) => {
      if (e.target === overlay) {
        // 🍎 애플 스타일: 클릭해도 닫히지 않고 살짝 흔들기만
        modal.style.transform = 'scale(0.98)'
        setTimeout(() => {
          modal.style.transform = 'scale(1)'
        }, 100)

        // 시각적 피드백
        modal.style.animation = 'apple-confirm-shake 0.3s ease-in-out'
        setTimeout(() => {
          modal.style.animation = ''
        }, 300)
      }
    }

    const handleResize = () => {
      if (currentModal && currentModal.parentNode) {
        overlay.style.cssText = String(overlay.style.cssText)
        modal.style.cssText = String(modal.style.cssText)
      }
    }

    cancelBtn.addEventListener('click', handleClose)
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

    let closeModal = () => {
      if (currentModal && currentModal.parentNode) {
        document.body.removeChild(currentModal)
        currentModal = null
      }
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
      document.body.style.overflow = ''

      // 🔄 mod2.png 닫힌 후 mod1.png로 복귀 (resolver는 원래 그대로 유지됨)
      if (previousModal) {
        previousModal.style.display = 'flex'
        currentModal = previousModal
        // currentResolver는 이미 previousResolver와 같으므로 복원 불필요
      }
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
