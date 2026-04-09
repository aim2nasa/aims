/**
 * useDocumentActions Hook
 * 문서 삭제/이름변경 공통 로직
 */

import { useState, useCallback, useRef } from 'react'
import { api } from '@/shared/lib/api'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import { errorReporter } from '@/shared/lib/errorReporter'
import { DocumentService } from '@/services/DocumentService'

/** 배치 삭제 진행 상태 (52-3 UI 보호용) */
export interface DeleteProgress {
  /** 삭제 완료된 문서 수 */
  completed: number
  /** 전체 문서 수 */
  total: number
}

interface UseDocumentActionsOptions {
  /** 삭제 성공 후 데이터 갱신 콜백 (필수 — window.location.reload() 사용 금지) */
  onDeleteSuccess: () => void
  /** 이름변경 성공 후 데이터 갱신 콜백 (필수 — window.location.reload() 사용 금지) */
  onRenameSuccess: () => void
}

/** 배치 삭제 청크 크기 (서버 과부하 방지) */
const DELETE_CHUNK_SIZE = 50

export function useDocumentActions(options: UseDocumentActionsOptions) {
  const { showConfirm, showAlert } = useAppleConfirm()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgress | null>(null)
  const deleteAbortRef = useRef(false)

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
      deleteAbortRef.current = false

      const allIds = Array.from(documentIds)
      const total = allIds.length
      let totalDeleted = 0
      let totalFailed = 0

      setDeleteProgress({ completed: 0, total })

      // 청크 단위 배치 삭제 (서버 과부하 방지)
      for (let i = 0; i < total; i += DELETE_CHUNK_SIZE) {
        if (deleteAbortRef.current) break

        const chunk = allIds.slice(i, i + DELETE_CHUNK_SIZE)
        try {
          const result = await DocumentService.deleteDocuments(chunk)
          totalDeleted += result.deletedCount
          totalFailed += result.failedCount
        } catch (error) {
          // 청크 전체 실패 시 개별 건은 실패로 계산
          totalFailed += chunk.length
          console.error(`Batch delete chunk failed (${i}~${i + chunk.length}):`, error)
          errorReporter.reportApiError(error as Error, {
            component: 'useDocumentActions.deleteDocuments',
            payload: { chunkStart: i, chunkSize: chunk.length }
          })
        }
        setDeleteProgress({ completed: Math.min(i + chunk.length, total), total })
      }

      setDeleteProgress(null)
      setIsDeleting(false)

      if (totalFailed > 0) {
        await showAlert({
          title: '삭제 결과',
          message: `${totalDeleted}개 삭제 완료, ${totalFailed}개 실패`,
          confirmText: '확인',
          showCancel: false,
        })
      }

      if (totalDeleted > 0) {
        onDeleteSuccess()
      }
    } catch (error) {
      console.error('Error in deleteDocuments:', error)
      errorReporter.reportApiError(error as Error, { component: 'useDocumentActions.deleteDocuments' })
      setDeleteProgress(null)
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
    deleteProgress,
  }
}
