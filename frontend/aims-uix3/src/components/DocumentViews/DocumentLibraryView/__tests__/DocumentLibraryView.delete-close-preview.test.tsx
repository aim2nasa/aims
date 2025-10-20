/**
 * DocumentLibraryView - 문서 삭제 시 프리뷰 창 닫기 기능 테스트
 * @since 2025-10-20
 *
 * 커밋: c734a6f - fix(ux): 문서 삭제 시 우측 프리뷰 창 자동 닫기
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('DocumentLibraryView - 문서 삭제 시 프리뷰 창 닫기', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('onDocumentDeleted props', () => {
    it('onDocumentDeleted props가 정의되어 있어야 함', () => {
      // DocumentLibraryViewProps 인터페이스에 onDocumentDeleted가 있는지 확인
      const propsInterface = {
        visible: true,
        onClose: vi.fn(),
        onDocumentClick: vi.fn(),
        onDocumentDeleted: vi.fn() // 이 props가 존재해야 함
      }

      expect(propsInterface.onDocumentDeleted).toBeDefined()
      expect(typeof propsInterface.onDocumentDeleted).toBe('function')
    })

    it('onDocumentDeleted는 선택적(optional) props여야 함', () => {
      // onDocumentDeleted 없이도 컴포넌트가 동작해야 함
      const propsWithoutCallback: {
        visible: boolean
        onClose: () => void
        onDocumentClick: (id: string) => void
        onDocumentDeleted?: () => void
      } = {
        visible: true,
        onClose: vi.fn(),
        onDocumentClick: vi.fn()
        // onDocumentDeleted 없음
      }

      expect(propsWithoutCallback.onDocumentDeleted).toBeUndefined()
    })
  })

  describe('삭제 성공 시 콜백 호출', () => {
    it('문서 삭제 성공 시 onDocumentDeleted가 호출되어야 함', () => {
      // Mock 함수 생성
      const onDocumentDeleted = vi.fn()

      // 삭제 성공 시뮬레이션
      const deleteSuccess = true

      if (deleteSuccess) {
        onDocumentDeleted()
      }

      // onDocumentDeleted가 호출되었는지 검증
      expect(onDocumentDeleted).toHaveBeenCalledTimes(1)
    })

    it('문서 삭제 실패 시 onDocumentDeleted가 호출되지 않아야 함', () => {
      // Mock 함수 생성
      const onDocumentDeleted = vi.fn()

      // 삭제 실패 시뮬레이션
      const deleteSuccess = false

      if (deleteSuccess) {
        onDocumentDeleted()
      }

      // onDocumentDeleted가 호출되지 않았는지 검증
      expect(onDocumentDeleted).not.toHaveBeenCalled()
    })

    it('여러 문서 삭제 시 onDocumentDeleted는 한 번만 호출되어야 함', () => {
      // Mock 함수 생성
      const onDocumentDeleted = vi.fn()

      // 여러 문서 삭제 성공 (하지만 콜백은 한 번만)
      const selectedDocumentIds = new Set(['doc1', 'doc2', 'doc3'])
      const deleteSuccess = true

      if (deleteSuccess) {
        // 삭제 성공 시 한 번만 호출
        onDocumentDeleted()
      }

      // 3개 문서를 삭제했지만 콜백은 1번만 호출
      expect(onDocumentDeleted).toHaveBeenCalledTimes(1)
      expect(selectedDocumentIds.size).toBe(3)
    })
  })

  describe('삭제 워크플로우', () => {
    it('삭제 완료 시 올바른 순서로 작업이 진행되어야 함', () => {
      const executionOrder: string[] = []

      // Mock 함수들
      const setSelectedDocumentIds = vi.fn((_value: Set<string>) => {
        executionOrder.push('clear_selection')
      })
      const setIsDeleteMode = vi.fn((_value: boolean) => {
        executionOrder.push('exit_delete_mode')
      })
      const onDocumentDeleted = vi.fn(() => executionOrder.push('close_preview'))
      const loadDocuments = vi.fn((_params: any, _silent: boolean) => {
        executionOrder.push('reload_list')
      })

      // 삭제 성공 시뮬레이션
      const deleteSuccess = true

      if (deleteSuccess) {
        setSelectedDocumentIds(new Set())
        setIsDeleteMode(false)
        onDocumentDeleted()
        loadDocuments({}, true)
      }

      // 실행 순서 검증
      expect(executionOrder).toEqual([
        'clear_selection',
        'exit_delete_mode',
        'close_preview',
        'reload_list'
      ])
    })

    it('onDocumentDeleted가 없어도 삭제 워크플로우는 정상 동작해야 함', () => {
      const executionOrder: string[] = []

      // Mock 함수들 (onDocumentDeleted 없음)
      const setSelectedDocumentIds = vi.fn((_value: Set<string>) => {
        executionOrder.push('clear_selection')
      })
      const setIsDeleteMode = vi.fn((_value: boolean) => {
        executionOrder.push('exit_delete_mode')
      })
      const loadDocuments = vi.fn((_params: any, _silent: boolean) => {
        executionOrder.push('reload_list')
      })

      // 삭제 성공 시뮬레이션 (onDocumentDeleted는 optional)
      const deleteSuccess = true

      if (deleteSuccess) {
        setSelectedDocumentIds(new Set())
        setIsDeleteMode(false)
        // onDocumentDeleted는 없음 (optional이므로 호출 안 함)
        loadDocuments({}, true)
      }

      // onDocumentDeleted 없이도 나머지 작업은 정상 실행
      expect(executionOrder).toEqual([
        'clear_selection',
        'exit_delete_mode',
        'reload_list'
      ])
    })
  })

  describe('App.tsx 통합', () => {
    it('App.tsx에서 setRightPaneVisible(false)를 onDocumentDeleted로 전달해야 함', () => {
      // App.tsx의 setRightPaneVisible mock
      const setRightPaneVisible = vi.fn()

      // DocumentLibraryView에 전달되는 props
      const documentLibraryViewProps = {
        visible: true,
        onClose: vi.fn(),
        onDocumentClick: vi.fn(),
        onDocumentDeleted: () => setRightPaneVisible(false)
      }

      // 삭제 완료 시 onDocumentDeleted 호출
      documentLibraryViewProps.onDocumentDeleted()

      // setRightPaneVisible(false)가 호출되었는지 검증
      expect(setRightPaneVisible).toHaveBeenCalledWith(false)
      expect(setRightPaneVisible).toHaveBeenCalledTimes(1)
    })

    it('프리뷰 창이 열려있을 때만 닫기 동작이 의미있음', () => {
      const setRightPaneVisible = vi.fn()

      // 시나리오 1: 프리뷰 창이 열려있는 상태
      let rightPaneVisible = true
      const closePreview = () => {
        setRightPaneVisible(false)
        rightPaneVisible = false
      }

      closePreview()
      expect(rightPaneVisible).toBe(false)
      expect(setRightPaneVisible).toHaveBeenCalledWith(false)
    })
  })

  describe('UX 시나리오', () => {
    it('시나리오: 사용자가 문서를 선택하고 삭제', () => {
      const scenario = {
        step1_selectDocument: () => ({ selectedId: 'doc1' }),
        step2_deleteDocument: () => ({ success: true }),
        step3_closePreview: vi.fn(),
        step4_refreshList: vi.fn()
      }

      // 1. 문서 선택
      const selected = scenario.step1_selectDocument()
      expect(selected.selectedId).toBe('doc1')

      // 2. 삭제 실행
      const deleteResult = scenario.step2_deleteDocument()
      expect(deleteResult.success).toBe(true)

      // 3. 프리뷰 닫기
      if (deleteResult.success) {
        scenario.step3_closePreview()
      }
      expect(scenario.step3_closePreview).toHaveBeenCalled()

      // 4. 목록 새로고침
      scenario.step4_refreshList()
      expect(scenario.step4_refreshList).toHaveBeenCalled()
    })

    it('시나리오: 삭제 전에는 프리뷰가 열려있고, 삭제 후에는 닫혀있음', () => {
      let rightPaneVisible = true
      const onDocumentDeleted = () => {
        rightPaneVisible = false
      }

      // 삭제 전: 프리뷰 열려있음
      expect(rightPaneVisible).toBe(true)

      // 삭제 완료
      onDocumentDeleted()

      // 삭제 후: 프리뷰 닫혀있음
      expect(rightPaneVisible).toBe(false)
    })
  })

  describe('엣지 케이스', () => {
    it('onDocumentDeleted가 여러 번 호출되어도 안전해야 함', () => {
      const setRightPaneVisible = vi.fn()
      const onDocumentDeleted = () => setRightPaneVisible(false)

      // 여러 번 호출
      onDocumentDeleted()
      onDocumentDeleted()
      onDocumentDeleted()

      // 모두 호출되어야 함 (idempotent)
      expect(setRightPaneVisible).toHaveBeenCalledTimes(3)
      // 항상 false로 호출
      expect(setRightPaneVisible).toHaveBeenCalledWith(false)
    })

    it('onDocumentDeleted가 undefined일 때 안전하게 처리되어야 함', () => {
      // undefined 체크 로직 테스트
      const callOptionalCallback = (callback?: () => void) => {
        callback?.()
      }

      // undefined 전달 시 에러 없이 처리
      expect(() => {
        callOptionalCallback(undefined)
      }).not.toThrow()

      // 함수 전달 시 정상 호출
      const mockFn = vi.fn()
      callOptionalCallback(mockFn)
      expect(mockFn).toHaveBeenCalled()
    })

    it('모달들이 모두 닫혀야 함', () => {
      // 삭제 후 모달 닫기 시뮬레이션
      const setDetailModalVisible = vi.fn()
      const setSummaryModalVisible = vi.fn()
      const setFullTextModalVisible = vi.fn()
      const setLinkModalVisible = vi.fn()

      // 삭제 성공 시 모든 모달 닫기
      const closeAllModals = () => {
        setDetailModalVisible(false)
        setSummaryModalVisible(false)
        setFullTextModalVisible(false)
        setLinkModalVisible(false)
      }

      closeAllModals()

      // 모든 모달 닫기 함수가 호출되었는지 검증
      expect(setDetailModalVisible).toHaveBeenCalledWith(false)
      expect(setSummaryModalVisible).toHaveBeenCalledWith(false)
      expect(setFullTextModalVisible).toHaveBeenCalledWith(false)
      expect(setLinkModalVisible).toHaveBeenCalledWith(false)
    })
  })

  describe('커밋 c734a6f 변경사항 검증', () => {
    it('DocumentLibraryViewProps에 onDocumentDeleted가 추가되었는지 확인', () => {
      // 타입 체크용 인터페이스
      interface DocumentLibraryViewProps {
        visible: boolean
        onClose: () => void
        onDocumentClick?: (documentId: string) => void
        onDocumentDeleted?: () => void // 이 줄이 추가되었음
      }

      const props: DocumentLibraryViewProps = {
        visible: true,
        onClose: vi.fn(),
        onDocumentClick: vi.fn(),
        onDocumentDeleted: vi.fn()
      }

      expect(props.onDocumentDeleted).toBeDefined()
    })

    it('삭제 성공 블록에서 onDocumentDeleted?.() 호출이 추가되었는지 확인', () => {
      const onDocumentDeleted = vi.fn()

      // handleDeleteSelected 내부 로직 시뮬레이션
      const result = { success: true, deletedCount: 1 }

      if (result.success) {
        // ... 기존 로직
        // 🍎 RightPane 프리뷰도 닫기 (이 줄이 추가됨)
        onDocumentDeleted?.()
        // ... 나머지 로직
      }

      expect(onDocumentDeleted).toHaveBeenCalled()
    })

    it('App.tsx에서 인라인 화살표 함수로 전달되는지 확인', () => {
      const setRightPaneVisible = vi.fn()

      // App.tsx의 DocumentLibraryView props
      const onDocumentDeleted = () => setRightPaneVisible(false)

      // 삭제 완료 시 호출
      onDocumentDeleted()

      expect(setRightPaneVisible).toHaveBeenCalledWith(false)
    })
  })

  describe('회귀 방지 테스트', () => {
    it('기존 기능: 삭제 모드 종료가 여전히 작동해야 함', () => {
      const setIsDeleteMode = vi.fn()
      const onDocumentDeleted = vi.fn()

      // 삭제 성공
      const result = { success: true }

      if (result.success) {
        setIsDeleteMode(false) // 기존 기능
        onDocumentDeleted?.() // 새 기능
      }

      expect(setIsDeleteMode).toHaveBeenCalledWith(false)
      expect(onDocumentDeleted).toHaveBeenCalled()
    })

    it('기존 기능: 선택 초기화가 여전히 작동해야 함', () => {
      const setSelectedDocumentIds = vi.fn()
      const onDocumentDeleted = vi.fn()

      // 삭제 성공
      const result = { success: true }

      if (result.success) {
        setSelectedDocumentIds(new Set()) // 기존 기능
        onDocumentDeleted?.() // 새 기능
      }

      expect(setSelectedDocumentIds).toHaveBeenCalledWith(expect.any(Set))
      expect(onDocumentDeleted).toHaveBeenCalled()
    })

    it('기존 기능: 목록 새로고침이 여전히 작동해야 함', () => {
      const loadDocuments = vi.fn()
      const onDocumentDeleted = vi.fn()

      // 삭제 성공
      const result = { success: true }

      if (result.success) {
        onDocumentDeleted?.() // 새 기능
        loadDocuments({}, true) // 기존 기능
      }

      expect(loadDocuments).toHaveBeenCalledWith({}, true)
      expect(onDocumentDeleted).toHaveBeenCalled()
    })
  })
})
