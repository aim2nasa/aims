/**
 * useDocumentActions Hook
 * 문서 삭제/이름변경 공통 로직
 */

import { useState, useCallback } from 'react'
import { api, ApiError } from '@/shared/lib/api'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { errorReporter } from '@/shared/lib/errorReporter'

interface UseDocumentActionsOptions {
  /** 삭제 성공 후 데이터 갱신 콜백 (필수 — window.location.reload() 사용 금지) */
  onDeleteSuccess: () => void
  /** 이름변경 성공 후 데이터 갱신 콜백 (필수 — window.location.reload() 사용 금지) */
  onRenameSuccess: () => void
}

export function useDocumentActions(options: UseDocumentActionsOptions) {
  const { showConfirm, showAlert } = useAppleConfirm()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)

  const { onDeleteSuccess, onRenameSuccess } = options

  const deleteDocument = useCallback(async (documentId: string, documentName: string) => {
    const confirmed = await showConfirm({
      title: '문서 삭제',
      message: `"${documentName}"을(를) 삭제하시겠습니까?\n\n삭제된 문서는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
      iconType: 'warning',
    })
    if (!confirmed) return

    try {
      setIsDeleting(true)
      await api.delete(`/api/documents/${documentId}`)
      setIsDeleting(false)
      onDeleteSuccess()
    } catch (error) {
      console.error('Error deleting document:', error)
      errorReporter.reportApiError(error as Error, { component: 'useDocumentActions.deleteDocument', payload: { documentId } })
      setIsDeleting(false)
      await showAlert({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [showConfirm, showAlert, onDeleteSuccess])

  const deleteDocuments = useCallback(async (documentIds: Set<string>) => {
    if (documentIds.size === 0) {
      await showAlert({
        title: '선택 항목 없음',
        message: '삭제할 문서를 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
      })
      return
    }

    const confirmed = await showConfirm({
      title: '문서 삭제',
      message: `선택한 ${documentIds.size}개의 문서를 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
    })
    if (!confirmed) return

    try {
      setIsDeleting(true)
      const results = await Promise.all(
        Array.from(documentIds).map(async (docId) => {
          try {
            await api.delete(`/api/documents/${docId}`)
            return { success: true, docId }
          } catch (error) {
            const message = error instanceof ApiError ? error.message : `Failed to delete document ${docId}`
            console.error(`Error deleting document ${docId}:`, message)
            errorReporter.reportApiError(error as Error, { component: 'useDocumentActions.deleteDocuments', payload: { docId } })
            return { success: false, docId }
          }
        })
      )

      const successCount = results.filter((r) => r.success).length
      const failedCount = results.length - successCount

      if (failedCount > 0) {
        setIsDeleting(false)
        await showAlert({
          title: '삭제 실패',
          message: `${failedCount}개의 문서 삭제에 실패했습니다.`,
          confirmText: '확인',
          showCancel: false,
        })
      }

      setIsDeleting(false)
      if (successCount > 0) {
        onDeleteSuccess()
      }
    } catch (error) {
      console.error('Error in deleteDocuments:', error)
      errorReporter.reportApiError(error as Error, { component: 'useDocumentActions.deleteDocuments' })
      setIsDeleting(false)
      await showAlert({
        title: '삭제 실패',
        message: '문서 삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
    }
  }, [showConfirm, showAlert, onDeleteSuccess])

  const renameDocument = useCallback(async (
    documentId: string,
    newName: string,
    field: 'displayName' | 'originalName' = 'displayName'
  ): Promise<boolean> => {
    try {
      setIsRenaming(true)
      if (field === 'originalName') {
        await api.patch(`/api/documents/${documentId}/original-name`, { originalName: newName })
      } else {
        await api.patch(`/api/documents/${documentId}/display-name`, { displayName: newName })
      }
      setIsRenaming(false)
      onRenameSuccess()
      // RP 갱신용 CustomEvent (useRightPaneContent가 수신)
      window.dispatchEvent(new CustomEvent('document-renamed', { detail: { documentId } }))
      return true
    } catch (error) {
      console.error('Error renaming document:', error)
      errorReporter.reportApiError(error as Error, { component: 'useDocumentActions.renameDocument', payload: { documentId, field } })
      setIsRenaming(false)
      await showAlert({
        title: '이름 변경 실패',
        message: '문서 이름 변경 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
      })
      return false
    }
  }, [showAlert, onRenameSuccess])

  return {
    deleteDocument,
    deleteDocuments,
    renameDocument,
    isDeleting,
    isRenaming,
  }
}
