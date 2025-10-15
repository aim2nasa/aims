/**
 * appleConfirm.ts Unit Tests
 * @since 2025-10-15
 *
 * DOM 직접 조작 유틸리티 테스트
 * showAppleConfirm() 및 showOversizedFilesModal() 함수 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { showAppleConfirm, showOversizedFilesModal } from '../appleConfirm'

// Mock CSS import
vi.mock('../appleConfirm.css', () => ({}))

describe('showAppleConfirm', () => {
  beforeEach(() => {
    // DOM 초기화
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    vi.clearAllMocks()
    // 모든 interval 정리
    vi.clearAllTimers()
  })

  afterEach(async () => {
    // 남아있는 모든 모달 닫기 (ESC 키 이벤트로)
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)

    // 모달이 닫힐 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 100))

    // 남아있는 모든 모달 제거
    const overlays = document.querySelectorAll('.apple-confirm-direct-overlay')
    overlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }
    })
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    vi.clearAllTimers()
  })

  // ========================================
  // 기본 렌더링
  // ========================================
  describe('기본 렌더링', () => {
    it('모달이 DOM에 추가되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })
    })

    it('메시지가 표시되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        expect(document.body.textContent).toContain('테스트 메시지')
      })
    })

    it('제목이 있을 때 제목이 표시되어야 함', async () => {
      showAppleConfirm('테스트 메시지', '경고')

      await waitFor(() => {
        expect(document.body.textContent).toContain('경고')
      })
    })

    it('제목이 없을 때 제목이 표시되지 않아야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const modal = document.querySelector('.apple-confirm-direct-modal')
        expect(modal?.innerHTML).not.toContain('<h2')
      })
    })

    it('body overflow가 hidden으로 설정되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden')
      })
    })
  })

  // ========================================
  // 버튼 표시
  // ========================================
  describe('버튼 표시', () => {
    it('기본적으로 취소/확인 버튼이 모두 표시되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        const okBtn = document.querySelector('.apple-confirm-ok-btn')

        expect(cancelBtn).toBeInTheDocument()
        expect(okBtn).toBeInTheDocument()
      })
    })

    it('showConfirmButton: false일 때 확인 버튼만 표시되어야 함', async () => {
      showAppleConfirm('테스트 메시지', undefined, { showConfirmButton: false })

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        const okBtn = document.querySelector('.apple-confirm-ok-btn')

        expect(cancelBtn).toBeInTheDocument()
        expect(cancelBtn?.textContent).toContain('확인')
        expect(okBtn).not.toBeInTheDocument()
      })
    })

    it('showConfirmButton: true일 때 취소/확인 버튼이 모두 표시되어야 함', async () => {
      showAppleConfirm('테스트 메시지', undefined, { showConfirmButton: true })

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        const okBtn = document.querySelector('.apple-confirm-ok-btn')

        expect(cancelBtn).toBeInTheDocument()
        expect(cancelBtn?.textContent).toContain('취소')
        expect(okBtn).toBeInTheDocument()
        expect(okBtn?.textContent).toContain('확인')
      })
    })
  })

  // ========================================
  // 링크 기능
  // ========================================
  describe('링크 기능', () => {
    it('linkText가 있을 때 링크가 생성되어야 함', async () => {
      showAppleConfirm('여기를 클릭하세요', undefined, {
        linkText: '여기',
      })

      await waitFor(() => {
        const link = document.querySelector('.apple-confirm-link')
        expect(link).toBeInTheDocument()
        expect(link?.textContent).toBe('여기')
      })
    })

    it('linkText가 없을 때 링크가 생성되지 않아야 함', async () => {
      showAppleConfirm('일반 메시지')

      await waitFor(() => {
        const link = document.querySelector('.apple-confirm-link')
        expect(link).not.toBeInTheDocument()
      })
    })

    it('링크 클릭 시 onLinkClick 콜백이 호출되어야 함', async () => {
      const onLinkClick = vi.fn()

      showAppleConfirm('여기를 클릭하세요', undefined, {
        linkText: '여기',
        onLinkClick,
      })

      await waitFor(() => {
        const link = document.querySelector('.apple-confirm-link') as HTMLElement
        expect(link).toBeInTheDocument()
      })

      const link = document.querySelector('.apple-confirm-link') as HTMLElement
      link.click()

      // 비동기 처리 대기
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(onLinkClick).toHaveBeenCalled()
    })

    it('링크 클릭 후에도 모달이 유지되어야 함', async () => {
      const onLinkClick = vi.fn()

      showAppleConfirm('여기를 클릭하세요', undefined, {
        linkText: '여기',
        onLinkClick,
      })

      await waitFor(() => {
        const link = document.querySelector('.apple-confirm-link') as HTMLElement
        expect(link).toBeInTheDocument()
      })

      const link = document.querySelector('.apple-confirm-link') as HTMLElement
      link.click()

      await new Promise((resolve) => setTimeout(resolve, 10))

      const overlay = document.querySelector('.apple-confirm-direct-overlay')
      expect(overlay).toBeInTheDocument()
    })
  })

  // ========================================
  // 버튼 클릭 동작
  // ========================================
  describe('버튼 클릭 동작', () => {
    it('취소 버튼 클릭 시 false를 반환해야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.click()

      const result = await promise
      expect(result).toBe(false)
    })

    it('확인 버튼 클릭 시 true를 반환해야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const okBtn = document.querySelector('.apple-confirm-ok-btn') as HTMLElement
        expect(okBtn).toBeInTheDocument()
      })

      const okBtn = document.querySelector('.apple-confirm-ok-btn') as HTMLElement
      okBtn.click()

      const result = await promise
      expect(result).toBe(true)
    })

    it('버튼 클릭 후 모달이 제거되어야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.click()

      await promise

      const overlay = document.querySelector('.apple-confirm-direct-overlay')
      expect(overlay).not.toBeInTheDocument()
    })

    it('버튼 클릭 후 body overflow가 복원되어야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.click()

      await promise

      expect(document.body.style.overflow).toBe('')
    })
  })

  // ========================================
  // ESC 키 동작
  // ========================================
  describe('ESC 키 동작', () => {
    it('ESC 키 누르면 false를 반환해야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })

      const event = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      const result = await promise
      expect(result).toBe(false)
    })

    it('ESC 키 누른 후 모달이 제거되어야 함', async () => {
      const promise = showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })

      const event = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      await promise

      const overlay = document.querySelector('.apple-confirm-direct-overlay')
      expect(overlay).not.toBeInTheDocument()
    })
  })

  // ========================================
  // 오버레이 클릭 (흔들기)
  // ========================================
  describe('오버레이 클릭', () => {
    it('오버레이 클릭 시 모달이 닫히지 않아야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })

      const overlay = document.querySelector('.apple-confirm-direct-overlay') as HTMLElement
      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: overlay, enumerable: true })
      overlay.dispatchEvent(clickEvent)

      const modal = document.querySelector('.apple-confirm-direct-modal')
      expect(modal).toBeInTheDocument()
    })

    it('오버레이 클릭 시 흔들기 애니메이션이 적용되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })

      const overlay = document.querySelector('.apple-confirm-direct-overlay') as HTMLElement
      const modal = document.querySelector('.apple-confirm-direct-modal') as HTMLElement

      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', { value: overlay, enumerable: true })
      overlay.dispatchEvent(clickEvent)

      expect(modal.style.animation).toContain('apple-confirm-shake')
    })
  })

  // ========================================
  // 다중 모달
  // ========================================
  describe('다중 모달', () => {
    it('기존 모달이 있으면 제거되어야 함', async () => {
      showAppleConfirm('첫 번째 모달')

      await waitFor(() => {
        expect(document.body.textContent).toContain('첫 번째 모달')
      })

      const firstOverlay = document.querySelector('.apple-confirm-direct-overlay')

      showAppleConfirm('두 번째 모달')

      await waitFor(() => {
        const overlays = document.querySelectorAll('.apple-confirm-direct-overlay')
        expect(overlays.length).toBe(1)
        expect(document.body.textContent).toContain('두 번째 모달')
        expect(document.body.textContent).not.toContain('첫 번째 모달')
      })
    })
  })

  // ========================================
  // 호버 효과
  // ========================================
  describe('호버 효과', () => {
    it('취소 버튼에 호버 시 배경색이 변경되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.dispatchEvent(new MouseEvent('mouseenter'))

      expect(cancelBtn.style.backgroundColor).toBe('rgba(0, 122, 255, 0.04)')
    })

    it('취소 버튼에서 마우스가 떠나면 배경색이 복원되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.dispatchEvent(new MouseEvent('mouseenter'))
      cancelBtn.dispatchEvent(new MouseEvent('mouseleave'))

      expect(cancelBtn.style.backgroundColor).toBe('')
    })

    it('확인 버튼에 호버 시 배경색이 변경되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const okBtn = document.querySelector('.apple-confirm-ok-btn')
        expect(okBtn).toBeInTheDocument()
      })

      const okBtn = document.querySelector('.apple-confirm-ok-btn') as HTMLElement
      okBtn.dispatchEvent(new MouseEvent('mouseenter'))

      expect(okBtn.style.backgroundColor).toBe('rgba(0, 122, 255, 0.04)')
    })

    it('확인 버튼에서 마우스가 떠나면 배경색이 복원되어야 함', async () => {
      showAppleConfirm('테스트 메시지')

      await waitFor(() => {
        const okBtn = document.querySelector('.apple-confirm-ok-btn')
        expect(okBtn).toBeInTheDocument()
      })

      const okBtn = document.querySelector('.apple-confirm-ok-btn') as HTMLElement
      okBtn.dispatchEvent(new MouseEvent('mouseenter'))
      okBtn.dispatchEvent(new MouseEvent('mouseleave'))

      expect(okBtn.style.backgroundColor).toBe('')
    })
  })
})

// ========================================
// showOversizedFilesModal 테스트
// ========================================
describe('showOversizedFilesModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  afterEach(async () => {
    // 남아있는 모든 모달 닫기 (ESC 키 이벤트로)
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(event)

    // 모달이 닫힐 때까지 대기
    await new Promise(resolve => setTimeout(resolve, 100))

    // 남아있는 모든 모달 제거
    const overlays = document.querySelectorAll('.apple-confirm-direct-overlay')
    overlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }
    })
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    vi.clearAllTimers()
  })

  describe('기본 렌더링', () => {
    it('모달이 DOM에 추가되어야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })
    })

    it('파일 목록이 표시되어야 함', async () => {
      const files = [
        { name: 'file1.pdf', size: 20 * 1024 * 1024 },
        { name: 'file2.pdf', size: 15 * 1024 * 1024 },
      ]
      showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        expect(document.body.textContent).toContain('file1.pdf')
        expect(document.body.textContent).toContain('file2.pdf')
      })
    })

    it('파일 크기가 MB 단위로 표시되어야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        expect(document.body.textContent).toContain('20.0MB')
      })
    })

    it('크기 제한이 표시되어야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        expect(document.body.textContent).toContain('10.0MB')
      })
    })
  })

  describe('확인 버튼', () => {
    it('확인 버튼 클릭 시 true를 반환해야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      const promise = showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.click()

      const result = await promise
      expect(result).toBe(true)
    })

    it('확인 버튼 클릭 후 모달이 제거되어야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      const promise = showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        const cancelBtn = document.querySelector('.apple-confirm-cancel-btn')
        expect(cancelBtn).toBeInTheDocument()
      })

      const cancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      cancelBtn.click()

      await promise

      const overlay = document.querySelector('.apple-confirm-direct-overlay')
      expect(overlay).not.toBeInTheDocument()
    })
  })

  describe('ESC 키', () => {
    it('ESC 키 누르면 true를 반환해야 함', async () => {
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      const promise = showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
      })

      const event = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      const result = await promise
      expect(result).toBe(true)
    })
  })

  describe('이전 모달과의 상호작용', () => {
    it('기존 모달을 숨기고 새 모달을 표시해야 함', async () => {
      // 첫 번째 모달
      showAppleConfirm('첫 번째 모달')

      await waitFor(() => {
        expect(document.body.textContent).toContain('첫 번째 모달')
      })

      const firstOverlay = document.querySelector('.apple-confirm-direct-overlay') as HTMLElement

      // 두 번째 모달 (파일 목록)
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        // 첫 번째 모달이 숨겨져야 함
        expect(firstOverlay.style.display).toBe('none')

        // 두 번째 모달이 표시되어야 함
        const overlays = document.querySelectorAll('.apple-confirm-direct-overlay')
        expect(overlays.length).toBe(2)
      })
    })

    it.skip('파일 모달 닫은 후 이전 모달이 복원되어야 함', async () => {
      // 첫 번째 모달 (promise 저장하지 않음, 모달만 열어둠)
      const promise1 = showAppleConfirm('첫 번째 모달')

      await waitFor(() => {
        const overlay = document.querySelector('.apple-confirm-direct-overlay')
        expect(overlay).toBeInTheDocument()
        expect(document.body.textContent).toContain('첫 번째 모달')
      })

      const firstOverlay = document.querySelector('.apple-confirm-direct-overlay') as HTMLElement
      expect(firstOverlay).toBeTruthy()

      // 두 번째 모달 (파일 목록)
      const files = [{ name: 'test.pdf', size: 20 * 1024 * 1024 }]
      const promise2 = showOversizedFilesModal(files, 10 * 1024 * 1024)

      await waitFor(() => {
        const overlays = document.querySelectorAll('.apple-confirm-direct-overlay')
        expect(overlays.length).toBe(2)
        expect(document.body.textContent).toContain('test.pdf')
      })

      // 첫 번째 모달이 숨겨져야 함
      expect(firstOverlay.style.display).toBe('none')

      // 두 번째 모달 닫기
      await waitFor(() => {
        const cancelBtns = document.querySelectorAll('.apple-confirm-cancel-btn')
        expect(cancelBtns.length).toBeGreaterThan(1)
      })

      const cancelBtns = document.querySelectorAll('.apple-confirm-cancel-btn')
      const secondModalBtn = cancelBtns[cancelBtns.length - 1] as HTMLElement
      secondModalBtn.click()

      await promise2

      // 첫 번째 모달이 다시 표시되어야 함
      await waitFor(() => {
        expect(firstOverlay.style.display).toBe('flex')
      })

      // 정리: 첫 번째 모달도 닫기
      const firstCancelBtn = document.querySelector('.apple-confirm-cancel-btn') as HTMLElement
      firstCancelBtn.click()
      await promise1
    })
  })
})
