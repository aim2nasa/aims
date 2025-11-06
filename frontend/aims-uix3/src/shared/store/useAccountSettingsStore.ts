/**
 * Account Settings Store
 * @since 2025-11-07
 *
 * 계정 설정 View 상태 관리 (Zustand)
 * App.tsx의 activeDocumentView 시스템과 통합
 */

import { create } from 'zustand'

interface AccountSettingsState {
  /** activeDocumentView setter */
  setActiveDocumentView: ((view: string | null) => void) | null
  /** RightPane visible setter */
  setRightPaneVisible: ((visible: boolean) => void) | null
  /** selectedDocument setter */
  setSelectedDocument: ((doc: any) => void) | null
  /** selectedCustomer setter */
  setSelectedCustomer: ((customer: any) => void) | null
  /** rightPaneContentType setter */
  setRightPaneContentType: ((type: 'document' | 'customer' | null) => void) | null
  /** updateURLParams function */
  updateURLParams: ((params: any) => void) | null
  /** setter 등록 */
  registerSetters: (setters: {
    setActiveDocumentView: (view: string | null) => void
    setRightPaneVisible: (visible: boolean) => void
    setSelectedDocument: (doc: any) => void
    setSelectedCustomer: (customer: any) => void
    setRightPaneContentType: (type: 'document' | 'customer' | null) => void
    updateURLParams: (params: any) => void
  }) => void
  /** 계정 설정 View 열기 */
  openAccountSettingsView: () => void
}

export const useAccountSettingsStore = create<AccountSettingsState>((set, get) => ({
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
    if (state.setActiveDocumentView && state.setRightPaneVisible &&
        state.setSelectedDocument && state.setSelectedCustomer &&
        state.setRightPaneContentType && state.updateURLParams) {
      // RightPane 강제로 숨기기
      state.setRightPaneVisible(false)

      // 선택 해제
      state.setSelectedDocument(null)
      state.setSelectedCustomer(null)
      state.setRightPaneContentType(null)

      // View 변경
      state.setActiveDocumentView('account-settings')

      // URL 파라미터 제거
      state.updateURLParams({ customerId: null, documentId: null })
    }
  }
}))
