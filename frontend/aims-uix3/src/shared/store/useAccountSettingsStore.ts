/**
 * Account Settings Store
 * @since 2025-11-07
 * @updated 2025-12-05
 *
 * 계정 설정 View 상태 관리 (Zustand)
 * 상태 기반 접근으로 리팩토링 (setter 저장 안티패턴 제거)
 */

import { create } from 'zustand'
import type { Customer } from '@/entities/customer'
import type { SelectedDocument } from '../../utils/documentTransformers'

/** URL 파라미터 타입 */
interface URLParams {
  view?: string | null
  customerId?: string | null
  documentId?: string | null
  tab?: string | null
}

interface AccountSettingsState {
  /** 계정 설정 화면 열기 요청 (App.tsx가 구독) */
  openRequested: boolean

  /** 계정 설정 화면 열기 요청 */
  requestOpenAccountSettings: () => void

  /** 요청 처리 완료 후 초기화 */
  clearOpenRequest: () => void

  // === Legacy API (하위 호환성) ===
  /** @deprecated registerSetters 대신 openRequested 상태를 구독하세요 */
  setActiveDocumentView: ((view: string | null) => void) | null
  /** @deprecated */
  setRightPaneVisible: ((visible: boolean) => void) | null
  /** @deprecated */
  setSelectedDocument: ((doc: SelectedDocument | null) => void) | null
  /** @deprecated */
  setSelectedCustomer: ((customer: Customer | null) => void) | null
  /** @deprecated */
  setRightPaneContentType: ((type: 'document' | 'customer' | null) => void) | null
  /** @deprecated */
  updateURLParams: ((params: URLParams) => void) | null
  /** @deprecated requestOpenAccountSettings를 사용하세요 */
  registerSetters: (setters: {
    setActiveDocumentView: (view: string | null) => void
    setRightPaneVisible: (visible: boolean) => void
    setSelectedDocument: (doc: SelectedDocument | null) => void
    setSelectedCustomer: (customer: Customer | null) => void
    setRightPaneContentType: (type: 'document' | 'customer' | null) => void
    updateURLParams: (params: URLParams) => void
  }) => void
  /** @deprecated requestOpenAccountSettings를 사용하세요 */
  openAccountSettingsView: () => void
}

export const useAccountSettingsStore = create<AccountSettingsState>((set, get) => ({
  // 새로운 상태 기반 API
  openRequested: false,

  requestOpenAccountSettings: () => {
    set({ openRequested: true })
  },

  clearOpenRequest: () => {
    set({ openRequested: false })
  },

  // Legacy API (하위 호환성 유지)
  setActiveDocumentView: null,
  setRightPaneVisible: null,
  setSelectedDocument: null,
  setSelectedCustomer: null,
  setRightPaneContentType: null,
  updateURLParams: null,

  registerSetters: (setters) => {
    set(setters)
  },

  openAccountSettingsView: () => {
    const state = get()

    // 새로운 API 사용 시도
    if (state.openRequested === false) {
      set({ openRequested: true })
    }

    // Legacy fallback
    if (state.setActiveDocumentView && state.setRightPaneVisible &&
        state.setSelectedDocument && state.setSelectedCustomer &&
        state.setRightPaneContentType && state.updateURLParams) {
      state.setRightPaneVisible(false)
      state.setSelectedDocument(null)
      state.setSelectedCustomer(null)
      state.setRightPaneContentType(null)
      state.setActiveDocumentView('account-settings')
      state.updateURLParams({ customerId: null, documentId: null })
    }
  }
}))
