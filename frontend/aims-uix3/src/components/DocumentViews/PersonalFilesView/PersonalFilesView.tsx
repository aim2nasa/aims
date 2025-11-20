/**
 * PersonalFilesView Component
 * @since 2.0.0
 *
 * Google Drive 스타일의 개인 파일 관리 View
 * 좌측: 폴더 트리 네비게이션
 * 우측: 파일/폴더 목록
 *
 * 3단계: 파일 업로드/다운로드 기능 추가
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import AppleConfirmModal from '../DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal'
import { useAppleConfirmController } from '@/controllers/useAppleConfirmController'
import MoveFolderModal from './MoveFolderModal'
import CenterPaneView from '../../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../SFSymbol'
import { Tooltip, Modal, Button } from '@/shared/ui'
import { api } from '@/shared/lib/api'
import personalFilesService, { type PersonalFileItem } from '@/services/personalFilesService'
import { DocumentStatusService } from '@/services/DocumentStatusService'
import { DocumentUtils } from '@/entities/document'
import type { Document } from '../../../types/documentStatus'
import { uploadService } from '../DocumentRegistrationView/services/uploadService'
import type { UploadFile } from '../DocumentRegistrationView/types/uploadTypes'
import {
  EyeIcon,
  SummaryIcon,
  DocumentIcon,
  LinkIcon
} from '../components/DocumentActionIcons'
import DocumentDetailModal from '../DocumentStatusView/components/DocumentDetailModal'
import DocumentSummaryModal from '../DocumentStatusView/components/DocumentSummaryModal'
import DocumentFullTextModal from '../DocumentStatusView/components/DocumentFullTextModal'
import DocumentLinkModal from '../DocumentStatusView/components/DocumentLinkModal'
import './PersonalFilesView.css'

interface PersonalFilesViewProps {
  visible: boolean
  onClose: () => void
  onDocumentClick?: (documentId: string) => void
}

// 파일 크기 포맷팅
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

// 날짜 포맷팅
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

// Document를 PersonalFileItem으로 변환
const convertDocumentToFileItem = (doc: Document): PersonalFileItem => {
  const fileSize = doc.fileSize || doc.file_size || doc.size || 0
  const item: PersonalFileItem = {
    _id: doc._id || doc.id || '',
    name: doc.filename || doc.file_name || doc.originalName || doc.name || '알 수 없는 파일',
    type: 'file',
    size: typeof fileSize === 'string' ? parseInt(fileSize, 10) : fileSize,
    parentId: null, // 기본값, folderId가 있으면 나중에 덮어씀
    createdAt: doc.uploaded_at || doc.created_at || doc.timestamp || new Date().toISOString(),
    updatedAt: doc.uploaded_at || doc.created_at || doc.timestamp || new Date().toISOString(),
    isDeleted: false,
    isLibraryDocument: true, // 문서 라이브러리 파일임을 표시
    document: doc // 🍎 원본 Document 저장 (뱃지 표시용)
  }

  // mimeType이 있을 때만 추가 (exactOptionalPropertyTypes 대응)
  if (doc.mimeType) {
    item.mimeType = doc.mimeType
  }

  return item
}

/**
 * OCR 신뢰도를 5단계로 분류
 * 0.0 ~ 1.0 범위의 신뢰도를 색상 레벨로 변환
 */
const getOcrConfidenceLevel = (confidence: number): {
  color: string
  label: string
} => {
  if (confidence >= 0.95) {
    return { color: 'excellent', label: '매우 높음' }
  } else if (confidence >= 0.85) {
    return { color: 'high', label: '높음' }
  } else if (confidence >= 0.70) {
    return { color: 'medium', label: '보통' }
  } else if (confidence >= 0.50) {
    return { color: 'low', label: '낮음' }
  } else {
    return { color: 'very-low', label: '매우 낮음' }
  }
}

/**
 * Document에서 OCR confidence 추출
 */
const getOcrConfidence = (document: Document): number | null => {
  // 1. document.ocr?.confidence 먼저 시도
  if (document.ocr && typeof document.ocr !== 'string') {
    const directConfidence = document.ocr.confidence
    if (directConfidence) {
      const parsed = parseFloat(directConfidence)
      if (!isNaN(parsed)) return parsed
    }
  }

  // 2. stages.ocr.message에서 파싱 시도
  const stageOcr = document.stages?.ocr
  if (stageOcr && typeof stageOcr !== 'string') {
    const ocrMessage = stageOcr.message
    if (ocrMessage && typeof ocrMessage === 'string') {
      const match = ocrMessage.match(/신뢰도:\s*([\d.]+)/)
      if (match && match[1]) {
        const parsed = parseFloat(match[1])
        if (!isNaN(parsed)) return parsed
      }
    }
  }

  return null
}

export const PersonalFilesView: React.FC<PersonalFilesViewProps> = ({
  visible,
  onClose,
  onDocumentClick,
}) => {
  const [items, setItems] = useState<PersonalFileItem[]>([]) // 좌측 트리용
  const [currentFolderItems, setCurrentFolderItems] = useState<PersonalFileItem[]>([]) // 우측 목록용
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ _id: string | null; name: string }[]>([])
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set())
  const [myDriveExpanded, setMyDriveExpanded] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [_uploadingFiles, setUploadingFiles] = useState<UploadFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const breadcrumbRef = useRef<HTMLDivElement>(null)
  const [breadcrumbWidth, setBreadcrumbWidth] = useState(0)

  // 폴링 관련 상태
  const [isPollingEnabled, setIsPollingEnabled] = useState(true)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // 현재 사용자 ID
  const userId = typeof window !== 'undefined'
    ? localStorage.getItem('aims-current-user-id') || 'tester'
    : 'tester'

  // 리사이저 상태
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(0)

  // 필터 및 정렬 상태
  const [typeFilter, setTypeFilter] = useState<'all' | 'file' | 'folder'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'size' | 'status'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // 폴더 생성 모달 상태
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // 컨텍스트 메뉴 상태
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const [selectedItem, setSelectedItem] = useState<PersonalFileItem | null>(null)

  // 이름 변경 모달 상태
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renamingItem, setRenamingItem] = useState(false)
  const [itemToRename, setItemToRename] = useState<PersonalFileItem | null>(null)

  // 폴더 이동 모달 상태
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [allFoldersForMove, setAllFoldersForMove] = useState<PersonalFileItem[]>([])

  // 디버그: showMoveModal 상태 변경 감지
  useEffect(() => {
    console.log("🟡 showMoveModal 변경:", showMoveModal)
  }, [showMoveModal])


  // AppleConfirmModal 컨트롤러
  const confirmModal = useAppleConfirmController()
  // 드래그 앤 드롭 상태
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // 액션 모달 상태
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false)
  const [isSummaryModalVisible, setIsSummaryModalVisible] = useState(false)
  const [isFullTextModalVisible, setIsFullTextModalVisible] = useState(false)
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

  // 🍎 문서 → 파일 아이템 변환 캐시 (깜빡임 방지)
  const docToFileItemCache = useRef<Map<string, PersonalFileItem>>(new Map())

  // 🍎 폴더 시스템 아이템 캐시 (깜빡임 방지)
  const folderItemCache = useRef<Map<string, PersonalFileItem>>(new Map())

  // 폴더 내용 로드
  const loadFolderContents = useCallback(async (folderId: string | null, options?: { silentRefresh?: boolean }) => {
    // 🍎 폴링 중에는 로딩 상태 변경하지 않음 (깜빡임 방지)
    if (!options?.silentRefresh) {
      setLoading(true)
    }
    setError(null)

    try {
      // 1. 폴더/파일 시스템 데이터 조회
      const data = await personalFilesService.getFolderContents(folderId)
      if (import.meta.env.DEV) console.log(`📁 loadFolderContents(${folderId}):`, data)

      // 🍎 폴더 시스템 아이템 캐싱 (참조 유지)
      const cachedFolderItems = data.items.map(item => {
        const cached = folderItemCache.current.get(item._id)

        // 캐시에 없거나 내용이 변경되었으면 새로 저장
        if (!cached ||
            cached.name !== item.name ||
            cached.size !== item.size ||
            cached.updatedAt !== item.updatedAt) {
          folderItemCache.current.set(item._id, item)
          return item
        }

        // 캐시된 객체 재사용 (참조 유지!)
        return cached
      })

      let finalItems = cachedFolderItems

      // 2. customerId === userId인 문서들 조회 (folderId 기반 필터링)
      try {
        if (import.meta.env.DEV) console.log(`📄 내 파일 조회 시작 (customerId === userId, folderId === ${folderId})...`)
        const docsResponse = await DocumentStatusService.getRecentDocuments(1, 1000)
        const allDocs = docsResponse.documents || []

        // customerId === userId이고, folderId가 현재 폴더와 일치하는 문서만 필터링
        const myDocs = allDocs.filter(doc => {
          // customerId 체크
          if (!doc.customerId || doc.customerId !== userId) return false

          // folderId 체크 (undefined는 null로 간주)
          const docFolderId = (doc as any).folderId || null
          const targetFolderId = folderId

          // 둘 다 null이거나, 둘 다 같은 값일 때만 표시
          if (docFolderId === null && targetFolderId === null) return true
          if (docFolderId && targetFolderId && docFolderId.toString() === targetFolderId.toString()) return true

          return false
        })
        if (import.meta.env.DEV) console.log(`✅ 내 파일 ${myDocs.length}개 발견 (folderId=${folderId}):`, myDocs.map(d => d.filename))

        // Document → PersonalFileItem 변환 (캐시 사용으로 깜빡임 방지)
        const myFileItems = myDocs.map(doc => {
          const docId = doc._id || doc.id || ''

          // 캐시에서 기존 아이템 찾기
          let item = docToFileItemCache.current.get(docId)

          // 비교할 값들을 미리 계산 (타입 정규화 필수!)
          const docName = doc.filename || doc.file_name || doc.originalName || doc.name || '알 수 없는 파일'
          const rawSize = doc.fileSize || doc.file_size || doc.size || 0
          const docSize = typeof rawSize === 'string' ? parseInt(rawSize, 10) : rawSize

          // 🍎 문서 상태 변경 감지 (폴링 업데이트용)
          const docStatus = doc.status || doc.overallStatus
          const docProgress = doc.progress

          // 캐시에 없으면 무조건 새로 생성
          if (!item) {
            item = convertDocumentToFileItem(doc)
            const docFolderId = (doc as any).folderId
            if (docFolderId) {
              item.parentId = docFolderId.toString()
            }
            docToFileItemCache.current.set(docId, item)
            return item
          }

          // 캐시가 있으면 변경사항 체크
          const hasChanged =
            item.name !== docName ||
            item.size !== docSize ||
            item.document?.status !== docStatus ||
            item.document?.overallStatus !== docStatus ||
            item.document?.progress !== docProgress

          if (hasChanged) {
            item = convertDocumentToFileItem(doc)
            const docFolderId = (doc as any).folderId
            if (docFolderId) {
              item.parentId = docFolderId.toString()
            }
            docToFileItemCache.current.set(docId, item)
          }

          return item
        })

        // 폴더 시스템 파일과 합치기
        finalItems = [...data.items, ...myFileItems]
        if (import.meta.env.DEV) console.log(`📋 최종 목록: ${finalItems.length}개 (폴더: ${data.items.length}, 내 파일: ${myFileItems.length})`)
      } catch (docErr) {
        console.error('⚠️ 내 파일 조회 실패:', docErr)
        // 실패해도 폴더 시스템은 정상 표시
      }

      // 🍎 깜빡임 방지: 객체 참조 유지 전략 (문서 라이브러리와 동일)
      setCurrentFolderItems(prev => {
        // 1. ID 맵 생성 (빠른 조회)
        const prevMap = new Map(prev.map(item => [item._id, item]))

        // 2. ID가 같은 항목은 기존 객체 재사용, 새 항목만 추가
        const mergedItems = finalItems.map(newItem => {
          const existingItem = prevMap.get(newItem._id)

          // 기존 항목이 없으면 새 객체 사용
          if (!existingItem) {
            return newItem
          }

          // 기존 항목이 있으면 변경 감지
          // 파일명이나 크기가 바뀌었으면 새 객체 사용
          if (
            existingItem.name !== newItem.name ||
            existingItem.size !== newItem.size ||
            existingItem.updatedAt !== newItem.updatedAt
          ) {
            return newItem
          }

          // 변경 없으면 기존 객체 재사용 (참조 유지 → React 리렌더링 스킵)
          return existingItem
        })

        // 3. 삭제된 항목 확인
        if (prev.length !== mergedItems.length) {
          return mergedItems
        }

        // 4. 새로운 항목 추가 확인
        const prevIds = new Set(prev.map(item => item._id))
        const newIds = new Set(mergedItems.map(item => item._id))
        for (const id of newIds) {
          if (!prevIds.has(id)) {
            return mergedItems
          }
        }

        // 5. 모든 항목이 기존 객체를 재사용했는지 확인 (순서 무관, 참조만 확인)
        const allReused = mergedItems.every(item => prevMap.get(item._id) === item)

        // 모든 항목이 재사용되었으면 기존 배열 유지
        return allReused ? prev : mergedItems
      })

      // 🍎 Breadcrumbs 변경 감지
      setBreadcrumbs(prev => {
        // 길이가 다르면 변경됨
        if (prev.length !== data.breadcrumbs.length) {
          return data.breadcrumbs
        }

        // 내용이 같으면 기존 배열 유지
        const isSame = prev.every((item, index) =>
          item._id === data.breadcrumbs[index]?._id &&
          item.name === data.breadcrumbs[index]?.name
        )

        return isSame ? prev : data.breadcrumbs
      })

      // 🍎 마지막 업데이트 시간 기록 (문서 라이브러리와 동일)
      setLastUpdated(new Date())

      // 🍎 좌측 트리 업데이트 (변경 감지 추가)
      setItems(prev => {
        let newItems: PersonalFileItem[]

        if (folderId) {
          // 기존에 해당 폴더의 하위 항목들을 제거
          const filtered = prev.filter(item => item.parentId !== folderId)
          // 새로 가져온 하위 폴더들만 추가
          const newFolders = data.items.filter(item => item.type === 'folder')
          newItems = [...filtered, ...newFolders]
        } else {
          // 루트인 경우 폴더만 초기화
          newItems = data.items.filter(item => item.type === 'folder')
        }

        // 변경 감지: ID 목록이 같으면 기존 배열 유지
        if (prev.length === newItems.length) {
          const prevIds = new Set(prev.map(item => item._id))
          const newIds = new Set(newItems.map(item => item._id))

          // 모든 ID가 같으면 변경 없음
          if (prevIds.size === newIds.size) {
            let allSame = true
            for (const id of newIds) {
              if (!prevIds.has(id)) {
                allSame = false
                break
              }
            }
            if (allSame) {
              return prev // 변경 없음
            }
          }
        }

        return newItems // 변경 있음
      })
    } catch (err) {
      console.error('폴더 로드 오류:', err)
      setError(err instanceof Error ? err.message : '폴더를 불러오는데 실패했습니다')
    } finally {
      // 🍎 폴링 중에는 로딩 상태 변경하지 않음 (깜빡임 방지)
      if (!options?.silentRefresh) {
        setLoading(false)
      }
    }
  }, [userId])

  // 검색 실행 (검색어만 API 호출)
  const performSearch = useCallback(async () => {
    // 검색어가 없으면 API 호출하지 않음 (타입 필터/정렬은 클라이언트에서 처리)
    if (!searchTerm.trim()) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await personalFilesService.searchFiles({ q: searchTerm.trim() })
      setCurrentFolderItems(result.items)
      // 검색 결과에서는 breadcrumb을 "검색 결과"로 표시
      setBreadcrumbs([{ _id: null, name: '검색 결과' }])
    } catch (err) {
      console.error('검색 오류:', err)
      setError(err instanceof Error ? err.message : '검색에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  // 초기 로드
  useEffect(() => {
    if (visible) {
      loadFolderContents(null)
    }
  }, [visible, loadFolderContents])

  /**
   * Page Visibility API: 브라우저 탭이 백그라운드일 때 폴링 중지
   */
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible'
      setIsPageVisible(isVisible)

      // 탭이 다시 보이면 즉시 데이터 새로고침
      if (isVisible) {
        loadFolderContents(currentFolderId)
      }
    }

    // 초기 상태 설정
    setIsPageVisible(document.visibilityState === 'visible')

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadFolderContents, currentFolderId])

  /**
   * 실시간 폴링 (5초마다)
   * 페이지가 보이고(isPageVisible) 폴링이 활성화(isPollingEnabled)되어 있을 때만 실행
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!visible) return
    if (!isPollingEnabled) return
    if (!isPageVisible) return

    const interval = setInterval(() => {
      loadFolderContents(currentFolderId, { silentRefresh: true })
    }, 5000)

    return () => clearInterval(interval)
  }, [isPollingEnabled, isPageVisible, visible, loadFolderContents, currentFolderId])

  // 검색 debounce (500ms) - 필터/정렬은 클라이언트에서 처리
  useEffect(() => {
    if (!visible) return

    const timer = setTimeout(() => {
      performSearch()
    }, 500)

    return () => clearTimeout(timer)
  }, [searchTerm, visible, performSearch])

  // 업로드 상태 콜백 설정
  useEffect(() => {
    uploadService.setStatusCallback((fileId, status, error) => {
      setUploadingFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, status, error } : f)
      )

      // 업로드 완료 시 목록 새로고침
      if (status === 'completed') {
        setTimeout(() => {
          loadFolderContents(currentFolderId, { silentRefresh: true })
          // 업로드 목록에서 제거
          setUploadingFiles(prev => prev.filter(f => f.id !== fileId))
          // UI 상태 초기화
          setUploading(false)
          setUploadProgress(0)
        }, 1000)
      } else if (status === 'error') {
        setUploading(false)
        setUploadProgress(0)
      }
    })

    uploadService.setProgressCallback(({ fileId, progress }) => {
      setUploadingFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, progress } : f)
      )
      setUploadProgress(progress)
    })

    return () => {
      uploadService.cleanup()
    }
  }, [loadFolderContents, currentFolderId])

  // 텍스트 너비 측정 헬퍼 (Canvas 사용)
  const measureTextWidth = useCallback((text: string): number => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return text.length * 8 // fallback: 대략 8px per char

    // breadcrumb CSS 폰트와 동일하게 설정
    context.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const metrics = context.measureText(text)
    return metrics.width
  }, [])

  // Breadcrumb 너비 측정 (공간 크기 파악)
  useEffect(() => {
    if (!breadcrumbRef.current) return

    const updateWidth = () => {
      if (!breadcrumbRef.current) return
      setBreadcrumbWidth(breadcrumbRef.current.clientWidth)
    }

    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })

    observer.observe(breadcrumbRef.current)

    return () => {
      observer.disconnect()
    }
  }, [breadcrumbs])

  // 폴링 토글
  const togglePolling = useCallback(() => {
    setIsPollingEnabled((prev) => !prev)
  }, [])

  // 마지막 업데이트 시간 포맷팅 (시분초만 표시)
  const formatLastUpdated = useCallback((date: Date | null): string => {
    if (!date) return ''
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }, [])

  // 폴더 확장/축소
  const toggleFolder = useCallback(async (folderId: string) => {
    const isCurrentlyExpanded = expandedFolderIds.has(folderId)

    if (isCurrentlyExpanded) {
      // 축소
      setExpandedFolderIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(folderId)
        return newSet
      })
    } else {
      // 확장 - 먼저 하위 폴더 로드
      await loadFolderContents(folderId)
      setExpandedFolderIds(prev => {
        const newSet = new Set(prev)
        newSet.add(folderId)
        return newSet
      })
    }
  }, [expandedFolderIds, loadFolderContents])

  // 폴더 클릭 - 우측 목록 업데이트
  const handleFolderClick = useCallback((folderId: string | null) => {
    // 구글 드라이브처럼 폴더 클릭 시 검색/필터 초기화
    setSearchTerm('')
    setTypeFilter('all')
    setSortBy('name')
    setSortDirection('asc')
    setCurrentFolderId(folderId)
    loadFolderContents(folderId)
  }, [loadFolderContents])

  // 상위 폴더로 이동
  const handleGoUpFolder = useCallback(() => {
    if (!currentFolderId || breadcrumbs.length < 2) return

    // breadcrumbs에서 현재 폴더의 부모 찾기
    const parentCrumb = breadcrumbs[breadcrumbs.length - 2]
    if (parentCrumb) {
      handleFolderClick(parentCrumb._id)
    }
  }, [currentFolderId, breadcrumbs, handleFolderClick])

  // 파일 업로드 버튼 클릭
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // 파일 선택 후 업로드
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    const newUploadFiles: UploadFile[] = selectedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      fileSize: file.size,
      status: 'pending' as const,
      progress: 0,
      customerId: userId  // 🆕 내 파일: customerId = userId (규약)
    }))

    setUploadingFiles(prev => [...prev, ...newUploadFiles])

    // uploadService에 큐잉 (docprep-main webhook 호출)
    uploadService.queueFiles(newUploadFiles)

    // 파일 input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [userId])

  // 파일 다운로드
  const handleFileDownload = useCallback(async (fileId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      await personalFilesService.downloadFile(fileId, fileName)
    } catch (err) {
      console.error('파일 다운로드 오류:', err)
      setError(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다')
    }
  }, [])

  // 새 폴더 모달 열기
  const handleNewFolderClick = useCallback(() => {
    setShowContextMenu(false)
    setSelectedItem(null)
    setShowNewFolderModal(true)
    setNewFolderName('')
  }, [])

  // 새 폴더 모달 닫기
  const handleCloseFolderModal = useCallback(() => {
    setShowNewFolderModal(false)
    setNewFolderName('')
  }, [])

  // 폴더 생성
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setError('폴더 이름을 입력해주세요')
      return
    }

    setCreatingFolder(true)
    setError(null)

    try {
      await personalFilesService.createFolder(newFolderName.trim(), currentFolderId)
      await loadFolderContents(currentFolderId)
      handleCloseFolderModal()
    } catch (err) {
      console.error('폴더 생성 오류:', err)
      setError(err instanceof Error ? err.message : '폴더 생성에 실패했습니다')
    } finally {
      setCreatingFolder(false)
    }
  }, [newFolderName, currentFolderId, loadFolderContents, handleCloseFolderModal])

  // 우클릭 컨텍스트 메뉴
  const handleContextMenu = useCallback((e: React.MouseEvent, item?: PersonalFileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedItem(item || null)
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }, [])

  // 컨텍스트 메뉴 닫기
  const handleCloseContextMenu = useCallback(() => {
    setShowContextMenu(false)
    setSelectedItem(null)
  }, [])

  // 이름 변경 모달 열기
  const handleRenameClick = useCallback(() => {
    if (!selectedItem) return
    // 이름 변경할 항목을 별도로 저장 (컨텍스트 메뉴 닫을 때 selectedItem이 null이 되므로)
    setItemToRename(selectedItem)
    setRenameValue(selectedItem.name)
    setShowRenameModal(true)
    handleCloseContextMenu()
  }, [selectedItem, handleCloseContextMenu])

  // 이름 변경 모달 닫기
  const handleCloseRenameModal = useCallback(() => {
    setShowRenameModal(false)
    setRenameValue('')
    setItemToRename(null)
  }, [])

  // 테이블 헤더 정렬 핸들러
  const handleSort = useCallback((field: typeof sortBy) => {
    if (sortBy === field) {
      // 같은 필드 클릭 시 정렬 순서 토글
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // 다른 필드 클릭 시 필드 변경 + 기본 정렬 순서
      setSortBy(field)
      setSortDirection(field === 'name' ? 'asc' : 'desc')
    }
  }, [sortBy, sortDirection])

  // 이름 변경 실행
  const handleRenameItem = useCallback(async () => {
    console.log('🔧 [Rename] 시작:', { itemToRename, renameValue })

    if (!itemToRename || !renameValue.trim()) {
      console.log('❌ [Rename] 검증 실패: 이름 없음')
      setError('이름을 입력해주세요')
      return
    }

    setRenamingItem(true)
    setError(null)
    console.log('🚀 [Rename] API 호출 시작:', itemToRename._id, '→', renameValue.trim())

    try {
      await personalFilesService.renameItem(itemToRename._id, renameValue.trim())
      console.log('✅ [Rename] API 호출 성공')

      // 🍎 캐시 무효화 (이름이 변경된 아이템)
      folderItemCache.current.delete(itemToRename._id)
      console.log('✅ [Rename] 캐시 무효화 완료')

      // 🍎 좌측 트리에서도 이름 업데이트 (삭제 로직과 동일한 패턴)
      if (itemToRename.type === 'folder') {
        setItems(prev => prev.map(item =>
          item._id === itemToRename._id
            ? { ...item, name: renameValue.trim() }
            : item
        ))
        console.log('✅ [Rename] 트리 업데이트 완료')
      }

      await loadFolderContents(currentFolderId)
      console.log('✅ [Rename] 폴더 새로고침 완료')

      handleCloseRenameModal()
      console.log('✅ [Rename] 모달 닫기 완료')
    } catch (err) {
      console.error('❌ [Rename] 오류:', err)
      setError(err instanceof Error ? err.message : '이름 변경에 실패했습니다')
    } finally {
      setRenamingItem(false)
      console.log('🏁 [Rename] 완료')
    }
  }, [itemToRename, renameValue, currentFolderId, loadFolderContents, handleCloseRenameModal])

  // 삭제
  const handleDeleteClick = useCallback(async () => {
    if (!selectedItem) {
      console.warn('⚠️ selectedItem이 null입니다')
      return
    }

    // selectedItem을 로컬 변수로 저장 (모달 열리는 동안 값이 변경되어도 안전)
    const itemToDelete = selectedItem
    console.log('🗑️ 삭제 시작:', itemToDelete.name, itemToDelete._id, 'isLibraryDocument:', itemToDelete.isLibraryDocument)

    const confirmed = await confirmModal.actions.openModal({
      title: itemToDelete.type === 'folder' ? '폴더 삭제' : '파일 삭제',
      message: itemToDelete.type === 'folder'
        ? `"${itemToDelete.name}" 폴더와 모든 하위 항목을 삭제하시겠습니까?\n\n삭제된 항목은 복구할 수 있습니다.`
        : `"${itemToDelete.name}" 파일을 삭제하시겠습니까?\n\n삭제된 항목은 복구할 수 있습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      showCancel: true,
      confirmStyle: 'destructive',
      iconType: 'warning'
    })

    if (!confirmed) {
      console.log('❌ 삭제 취소됨')
      handleCloseContextMenu()
      return
    }

    console.log('✅ 삭제 확인됨, API 호출 시작...')

    try {
      // 문서 라이브러리 파일과 폴더 시스템 항목을 구분하여 삭제
      if (itemToDelete.isLibraryDocument) {
        // 문서 라이브러리 파일 삭제 (files 컬렉션)
        console.log('📄 문서 라이브러리 파일 삭제:', itemToDelete._id)
        await api.delete(`/api/documents/${itemToDelete._id}`)
      } else {
        // 폴더 시스템 항목 삭제 (personal_files 컬렉션)
        console.log('📁 폴더 시스템 항목 삭제:', itemToDelete._id)
        await personalFilesService.deleteItem(itemToDelete._id)
      }
      console.log('✅ API 삭제 성공')

      // 좌측 트리에서도 삭제된 폴더 제거
      setItems(prev => prev.filter(item => item._id !== itemToDelete._id))

      console.log('🔄 폴더 내용 새로고침 시작...')
      await loadFolderContents(currentFolderId)
      console.log('✅ 폴더 내용 새로고침 완료')

      handleCloseContextMenu()
    } catch (err) {
      console.error('❌ 삭제 오류:', err)
      const errorMessage = err instanceof Error ? err.message : '삭제에 실패했습니다'
      setError(errorMessage)

      // 에러를 사용자에게 명확하게 알림
      await confirmModal.actions.openModal({
        title: '삭제 실패',
        message: `파일/폴더 삭제 중 오류가 발생했습니다.\n\n오류: ${errorMessage}`,
        confirmText: '확인',
        showCancel: false,
        iconType: 'warning'
      })
    }
  }, [currentFolderId, loadFolderContents, handleCloseContextMenu, confirmModal])

  // 전체 폴더 목록 로드 (이동 모달용) - 재귀적으로 모든 폴더 수집
  const loadAllFolders = useCallback(async () => {
    try {
      const allFolders: PersonalFileItem[] = []

      // 재귀적으로 폴더 수집
      const collectFolders = async (parentId: string | null) => {
        const response = await personalFilesService.getFolderContents(parentId)
        const folders = response.items.filter(item => item.type === 'folder')

        for (const folder of folders) {
          allFolders.push(folder)
          // 하위 폴더도 재귀적으로 수집
          await collectFolders(folder._id)
        }
      }

      await collectFolders(null) // 루트부터 시작
      console.log('📂 전체 폴더 로드:', allFolders.length, '개')
      setAllFoldersForMove(allFolders)
      return allFolders
    } catch (err) {
      console.error('전체 폴더 로드 오류:', err)
      return []
    }
  }, [])

  // 이동 모달 열기
  const handleMoveClick = useCallback(async () => {
    console.log('🔵 handleMoveClick 호출됨', { selectedItem })
    if (!selectedItem) {
      console.log('❌ selectedItem이 없음')
      return
    }
    console.log('✅ 모달 열기:', selectedItem.name)
    // 컨텍스트 메뉴만 닫고 selectedItem은 유지 (모달에서 사용)
    setShowContextMenu(false)

    // 전체 폴더 목록 로드
    await loadAllFolders()

    setShowMoveModal(true)
  }, [selectedItem, loadAllFolders])

  // 폴더/파일 이동 실행
  const handleMove = useCallback(async (targetFolderId: string | null) => {
    if (!selectedItem) return

    console.log('🚚 [Move] 시작:', {
      item: selectedItem.name,
      itemId: selectedItem._id,
      from: currentFolderId,
      to: targetFolderId
    })

    try {
      // 문서 라이브러리 파일인지 폴더 시스템 항목인지 확인
      if (selectedItem.isLibraryDocument) {
        // 문서 라이브러리 파일 이동
        await personalFilesService.moveDocument(selectedItem._id, targetFolderId)
        console.log('✅ [Move] 문서 라이브러리 파일 이동 완료')
      } else {
        // 폴더 시스템 항목 이동
        await personalFilesService.moveItem(selectedItem._id, targetFolderId)
        console.log('✅ [Move] 폴더 시스템 항목 이동 완료')
      }

      // 🍎 캐시 무효화 (이동 관련 모든 폴더)
      folderItemCache.current.delete(selectedItem._id) // 이동한 항목 자체
      if (currentFolderId) {
        folderItemCache.current.delete(currentFolderId) // 원본 폴더 (항목이 사라짐)
      }
      if (targetFolderId) {
        folderItemCache.current.delete(targetFolderId) // 목적지 폴더 (항목이 추가됨)
      }
      console.log('✅ [Move] 캐시 무효화 완료')

      // 즉시 UI 업데이트 (Optimistic Update)
      // 1. 우측 목록(currentFolderItems)에서 제거
      setCurrentFolderItems(prev => prev.filter(item => item._id !== selectedItem._id))

      // 2. 좌측 트리 전체 다시 로드 + 목적지 폴더 자동 확장
      if (selectedItem.type === 'folder') {
        // 🍎 핵심: 전체 폴더 구조를 재귀적으로 로드하여 좌측 트리 즉시 업데이트
        const allFolders = await loadAllFolders() // 모든 폴더 재귀 로드
        setItems(allFolders) // 좌측 트리에 즉시 반영

        // 목적지 폴더를 자동으로 확장 (이동한 폴더를 즉시 볼 수 있도록)
        if (targetFolderId) {
          setExpandedFolderIds(prev => new Set([...prev, targetFolderId]))
          console.log('✅ [Move] 목적지 폴더 자동 확장:', targetFolderId)
        }

        console.log('✅ [Move] 좌측 트리 전체 새로고침 완료')
      }

      // 3. 백엔드와 동기화 (정확한 상태 보장)
      await loadFolderContents(currentFolderId)
      console.log('✅ [Move] 원본 폴더 새로고침 완료')

      // 4. 목적지 폴더의 내용도 새로고침 (확장 여부와 무관하게 항상)
      if (targetFolderId) {
        await loadFolderContents(targetFolderId)
        console.log('✅ [Move] 목적지 폴더 새로고침 완료')
      }

      setShowMoveModal(false)
      setSelectedItem(null)
      console.log('🏁 [Move] 완료')
    } catch (err) {
      console.error('❌ [Move] 오류:', err)
      setError(err instanceof Error ? err.message : '이동에 실패했습니다')
    }
  }, [selectedItem, currentFolderId, loadFolderContents, expandedFolderIds, loadAllFolders])


  // 컨텍스트 메뉴에서 새 폴더 생성
  const handleNewFolderFromContext = useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'folder') return
    setCurrentFolderId(selectedItem._id)
    loadFolderContents(selectedItem._id)
    handleCloseContextMenu()
    setTimeout(() => setShowNewFolderModal(true), 100)
  }, [selectedItem, loadFolderContents, handleCloseContextMenu])

  // 컨텍스트 메뉴 외부 클릭 감지
  useEffect(() => {
    if (!showContextMenu) return

    const handleClickOutside = () => {
      setShowContextMenu(false)
      setSelectedItem(null)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showContextMenu])

  // 드래그 시작
  const handleDragStart = useCallback((e: React.DragEvent, item: PersonalFileItem) => {
    e.stopPropagation()
    setDraggingItemId(item._id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item._id)
  }, [])

  // 드래그 오버 (드롭 허용)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // 폴더에 드래그 진입
  const handleDragEnter = useCallback((e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolderId(folderId)
  }, [])

  // 폴더에서 드래그 벗어남
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // relatedTarget이 자식 요소가 아닐 때만 제거 (이벤트 버블링 방지)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverFolderId(null)
    }
  }, [])

  // 드롭
  const handleDrop = useCallback(async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault()
    e.stopPropagation()

    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId || itemId === targetFolderId) {
      setDraggingItemId(null)
      setDragOverFolderId(null)
      return
    }

    try {
      // 드래그된 항목 찾기 (좌측 트리 + 우측 목록에서 검색)
      const draggedItem = items.find(item => item._id === itemId)
                        || currentFolderItems.find(item => item._id === itemId)

      if (!draggedItem) {
        throw new Error('이동할 항목을 찾을 수 없습니다')
      }

      // 폴더를 자신의 하위 폴더로 이동하는 것 방지 (순환 참조)
      if (draggedItem.type === 'folder' && targetFolderId) {
        let currentParent: string | null = targetFolderId
        while (currentParent) {
          if (currentParent === draggedItem._id) {
            throw new Error('폴더를 자신의 하위 폴더로 이동할 수 없습니다')
          }
          const parentFolder = items.find(item => item._id === currentParent)
          currentParent = parentFolder?.parentId || null
        }
      }

      // 문서 라이브러리 파일인지 폴더 시스템 항목인지 확인
      if (draggedItem.isLibraryDocument) {
        // 문서 라이브러리 파일 이동 (files 컬렉션)
        console.log(`📄 문서 이동: ${itemId} → 폴더 ${targetFolderId}`)
        await personalFilesService.moveDocument(itemId, targetFolderId)
      } else {
        // 폴더 시스템 항목 이동 (personal_files 컬렉션)
        console.log(`📁 폴더/파일 이동: ${itemId} → 폴더 ${targetFolderId}`)
        await personalFilesService.moveItem(itemId, targetFolderId)
      }

      // 폴더 이동이면 전체 트리 업데이트, 파일 이동이면 현재 폴더만 새로고침
      if (draggedItem.type === 'folder') {
        // 🍎 핵심: 전체 폴더 구조를 재귀적으로 로드하여 좌측 트리 즉시 업데이트
        const allFolders = await loadAllFolders()
        setItems(allFolders)

        // 목적지 폴더를 자동으로 확장 (이동한 폴더를 즉시 볼 수 있도록)
        if (targetFolderId) {
          setExpandedFolderIds(prev => new Set(prev).add(targetFolderId))
        }
      }

      // 현재 폴더 새로고침
      await loadFolderContents(currentFolderId)
    } catch (err) {
      console.error('항목 이동 오류:', err)
      setError(err instanceof Error ? err.message : '항목 이동에 실패했습니다')
    } finally {
      setDraggingItemId(null)
      setDragOverFolderId(null)
    }
  }, [currentFolderId, loadFolderContents, items, currentFolderItems, loadAllFolders])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    setDraggingItemId(null)
    setDragOverFolderId(null)
  }, [])

  // 액션 버튼 핸들러
  const handleDetailClick = useCallback((document: Document, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(document)
    setIsDetailModalVisible(true)
  }, [])

  const handleSummaryClick = useCallback((document: Document, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(document)
    setIsSummaryModalVisible(true)
  }, [])

  const handleFullTextClick = useCallback((document: Document, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(document)
    setIsFullTextModalVisible(true)
  }, [])

  const handleLinkClick = useCallback((document: Document, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedDocument(document)
    setIsLinkModalVisible(true)
  }, [])

  // 모달 닫기 핸들러
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalVisible(false)
    setSelectedDocument(null)
  }, [])

  const handleCloseSummaryModal = useCallback(() => {
    setIsSummaryModalVisible(false)
    setSelectedDocument(null)
  }, [])

  const handleCloseFullTextModal = useCallback(() => {
    setIsFullTextModalVisible(false)
    setSelectedDocument(null)
  }, [])

  const handleCloseLinkModal = useCallback(() => {
    setIsLinkModalVisible(false)
    setSelectedDocument(null)
  }, [])

  // 리사이저 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartXRef.current = e.clientX
    resizeStartWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return

    const deltaX = e.clientX - resizeStartXRef.current
    const newWidth = resizeStartWidthRef.current + deltaX

    // 브라우저 너비 기준 비율 제한 (15% ~ 40%)
    const viewportWidth = window.innerWidth
    const minWidth = Math.max(180, viewportWidth * 0.15)  // 최소 15% (절대 최소값 180px)
    const maxWidth = Math.min(600, viewportWidth * 0.4)   // 최대 40% (절대 최대값 600px)

    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
    setSidebarWidth(clampedWidth)
  }, [isResizing])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
  }, [])

  // 리사이저 이벤트 리스너
  useEffect(() => {
    if (!isResizing) return

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  // 🍎 깜빡임 방지: useMemo는 의존성이 변하지 않으면 이전 결과를 재사용
  // currentFolderItems 참조가 유지되면 sort도 재실행되지 않음
  const filteredAndSortedItems = useMemo(() => {
    let result = currentFolderItems

    // 1. 타입 필터링 (필터 없으면 원본 유지)
    if (typeFilter === 'file') {
      result = currentFolderItems.filter(item => item.type === 'file')
    } else if (typeFilter === 'folder') {
      result = currentFolderItems.filter(item => item.type === 'folder')
    }

    // 2. 정렬 (useMemo가 캐싱하므로 의존성 불변시 재실행 안 됨)
    const sorted = result.slice().sort((a, b) => {
      // 🍎 업계 표준: 폴더 먼저, 파일 나중 (Windows, macOS, Google Drive)
      if (a.type === 'folder' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'folder') return 1

      // 같은 타입끼리는 sortBy 기준으로 정렬
      let comparison = 0

      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name, 'ko-KR')
      } else if (sortBy === 'createdAt') {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortBy === 'size') {
        const aSize = a.size || 0
        const bSize = b.size || 0
        comparison = aSize - bSize
      } else if (sortBy === 'status') {
        // 둘 다 파일인 경우 상태 비교
        if (a.type === 'file' && b.type === 'file') {
          const aStatus = a.document?.status || a.document?.overallStatus || ''
          const bStatus = b.document?.status || b.document?.overallStatus || ''
          comparison = aStatus.localeCompare(bStatus, 'ko-KR')
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [currentFolderItems, typeFilter, sortBy, sortDirection])

  // 폴더 트리 렌더링 (재귀)
  const renderFolderTree = (parentId: string | null, level: number = 0) => {
    const folders = items
      .filter(item => item.type === 'folder' && item.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name)) // 이름순 오름차순 고정

    return folders.map(folder => {
      const isExpanded = expandedFolderIds.has(folder._id)
      const isActive = currentFolderId === folder._id
      const isDragOver = dragOverFolderId === folder._id

      return (
        <div key={folder._id} className="folder-tree-item">
          <div
            className={`folder-tree-row ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            draggable
            onDragStart={(e) => handleDragStart(e, folder)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, folder._id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder._id)}
            onContextMenu={(e) => handleContextMenu(e, folder)}
          >
            <button
              className="folder-expand-button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation()
                console.log(`▶️ chevron 클릭: ${folder.name} (expanded=${isExpanded})`)
                toggleFolder(folder._id)
              }}
              aria-label={isExpanded ? '폴더 닫기' : '폴더 열기'}
            >
              {isExpanded ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <button
              className="folder-name-button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation()
                console.log(`📁 폴더 클릭: ${folder.name}`)
                handleFolderClick(folder._id)
              }}
            >
              <span className="folder-icon">
                {isActive ? '📂' : '📁'}
              </span>
              <span className="folder-name">{folder.name}</span>
            </button>
          </div>
          {isExpanded && (
            <div className="folder-tree-children">
              {renderFolderTree(folder._id, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <>
    <CenterPaneView
      visible={visible}
      onClose={onClose}
      title="내 파일"
      marginTop={0}
      marginBottom={0}
      marginLeft={0}
      marginRight={0}
      className="personal-files-view-wrapper"
    >
      <div className="personal-files-view" style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        {/* 좌측: 폴더 트리 */}
        <div className="files-sidebar" onContextMenu={(e) => e.preventDefault()}>
          <div className="sidebar-section">
            <div className="sidebar-title">빠른 액세스</div>

            {/* 즐겨찾기 */}
            <button className="sidebar-item">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l1.854 3.757 4.146.603-3 2.924.708 4.128L8 11.019l-3.708 1.893.708-4.128-3-2.924 4.146-.603L8 1.5z" fill="currentColor"/>
              </svg>
              <span>즐겨찾기</span>
            </button>
          </div>

          {/* 폴더 트리 - Google Drive 스타일 */}
          <div className="sidebar-section">
            <div className="folder-tree">
              {/* 내 파일 (루트) */}
              <div className="folder-tree-item">
                <div
                  className={`folder-tree-row ${currentFolderId === null ? 'active' : ''} ${dragOverFolderId === null && draggingItemId ? 'drag-over' : ''}`}
                  style={{ paddingLeft: '8px' }}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, null)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, null)}
                  onContextMenu={(e) => handleContextMenu(e)}
                >
                  <button
                    className="folder-expand-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMyDriveExpanded(!myDriveExpanded)
                    }}
                    aria-label={myDriveExpanded ? '내 파일 닫기' : '내 파일 열기'}
                  >
                    {myDriveExpanded ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <button
                    className="folder-name-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleFolderClick(null)
                    }}
                  >
                    <span className="folder-icon">
                      {currentFolderId === null ? '📂' : '📁'}
                    </span>
                    <span className="folder-name">내 파일</span>
                  </button>
                </div>

                {/* 하위 폴더들 */}
                {myDriveExpanded && renderFolderTree(null, 1)}
              </div>
            </div>
          </div>
        </div>

        {/* 리사이저 핸들 */}
        <div
          className={`files-resizer ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="사이드바 크기 조절"
        >
          <div className="files-resizer-line" />
        </div>

        {/* 우측: 파일 목록 */}
        <div className="files-main" onContextMenu={(e) => e.preventDefault()}>
          {/* 툴바 */}
          <div className="files-toolbar">
            {/* 상위 폴더 버튼 */}
            <Tooltip content="상위 폴더">
              <button
                className="up-folder-button"
                onClick={handleGoUpFolder}
                disabled={!currentFolderId}
                aria-label="상위 폴더"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 12V4M8 4L4 8M8 4L12 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </Tooltip>

            {/* 브레드크럼 */}
            <div className="breadcrumb" ref={breadcrumbRef}>
              {(() => {
                // 빈 배열이면 아무것도 표시하지 않음
                if (breadcrumbs.length === 0) {
                  return null
                }

                const lastCrumb = breadcrumbs[breadcrumbs.length - 1]
                if (!lastCrumb) return null

                // 🍎 핵심: 주어진 공간과 예상 문자열 길이를 미리 비교!

                // 1. 공간 극소 (100px 미만): 마지막만
                if (breadcrumbWidth > 0 && breadcrumbWidth < 100) {
                  return (
                    <button
                      className="breadcrumb-item"
                      onClick={() => handleFolderClick(lastCrumb._id)}
                    >
                      {lastCrumb.name}
                    </button>
                  )
                }

                // 2. 단일 항목: 그대로 표시
                if (breadcrumbs.length === 1) {
                  const singleCrumb = breadcrumbs[0]
                  if (!singleCrumb) return null
                  return (
                    <button
                      className="breadcrumb-item"
                      onClick={() => handleFolderClick(singleCrumb._id)}
                    >
                      {singleCrumb.name}
                    </button>
                  )
                }

                // 3. 여유 공간 계산 (버튼 패딩, 간격 등 고려)
                const availableWidth = breadcrumbWidth - 40
                const separatorWidth = measureTextWidth(' > ')
                const ellipsisWidth = measureTextWidth('..')

                // 4. 전체 경로 문자열 길이 계산
                const fullPathWidth = breadcrumbs.reduce((total, crumb, index) => {
                  const nameWidth = measureTextWidth(crumb.name)
                  const sepWidth = index > 0 ? separatorWidth : 0
                  return total + nameWidth + sepWidth
                }, 0)

                // 5. 전체 경로가 공간에 맞으면 → 전체 표시
                if (availableWidth > 0 && fullPathWidth <= availableWidth) {
                  return breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb._id || 'root'}>
                      {index > 0 && <span className="breadcrumb-separator"> &gt; </span>}
                      <button
                        className="breadcrumb-item"
                        onClick={() => handleFolderClick(crumb._id)}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))
                }

                // 6. 점진적 축약 (Progressive Truncation)
                // 경로가 3개 이상일 때만 시도
                if (breadcrumbs.length >= 3) {
                  const firstCrumb = breadcrumbs[0]
                  if (!firstCrumb) return null

                  // 마지막 N개를 점점 줄여가며 시도 (N: length-2부터 1까지)
                  for (let lastCount = breadcrumbs.length - 2; lastCount >= 1; lastCount--) {
                    const lastCrumbs = breadcrumbs.slice(-lastCount)

                    // 패턴: "첫 > .. > 마지막 N개" 너비 계산
                    const firstWidth = measureTextWidth(firstCrumb.name)
                    const lastWidth = lastCrumbs.reduce((total, crumb) => {
                      const nameWidth = measureTextWidth(crumb.name)
                      const sepWidth = separatorWidth // 각 마지막 항목 앞에 구분자
                      return total + nameWidth + sepWidth
                    }, 0)

                    const patternWidth = firstWidth + separatorWidth + ellipsisWidth + lastWidth

                    // 공간에 맞으면 이 패턴 사용
                    if (patternWidth <= availableWidth) {
                      return (
                        <>
                          {/* 첫 번째 */}
                          <button
                            className="breadcrumb-item"
                            onClick={() => handleFolderClick(firstCrumb._id)}
                          >
                            {firstCrumb.name}
                          </button>
                          <span className="breadcrumb-separator"> &gt; </span>

                          {/* 생략 표시 */}
                          <span className="breadcrumb-ellipsis">..</span>

                          {/* 마지막 N개 */}
                          {lastCrumbs.map((crumb) => (
                            <React.Fragment key={crumb._id}>
                              <span className="breadcrumb-separator"> &gt; </span>
                              <button
                                className="breadcrumb-item"
                                onClick={() => handleFolderClick(crumb._id)}
                              >
                                {crumb.name}
                              </button>
                            </React.Fragment>
                          ))}
                        </>
                      )
                    }
                  }
                }

                // 7. 최종 fallback: ".. > 마지막" (가장 축약된 형태)
                return (
                  <>
                    <span className="breadcrumb-ellipsis">..</span>
                    <span className="breadcrumb-separator"> &gt; </span>
                    <button
                      className="breadcrumb-item"
                      onClick={() => handleFolderClick(lastCrumb._id)}
                    >
                      {lastCrumb.name}
                    </button>
                  </>
                )
              })()}
            </div>

            {/* 검색 및 뷰 모드 */}
            <div className="toolbar-actions">
              {/* 파일 업로드 */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                aria-label="파일 선택"
              />
              <Tooltip content="파일 업로드">
                <button
                  className="upload-button upload-file-button"
                  onClick={handleUploadClick}
                  disabled={uploading}
                  aria-label="파일 업로드"
                  style={{ color: 'var(--color-primary-400)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 14h10c.55 0 1-.45 1-1V6h-3c-.55 0-1-.45-1-1V2H3c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1z" fill="currentColor"/>
                    <path d="M11 2l3 3h-3V2z" fill="currentColor"/>
                    <path d="M8 11V6M8 6L6 8M8 6l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Tooltip>

              {/* 새 폴더 */}
              <Tooltip content="새 폴더">
                <button
                  className="upload-button new-folder-button"
                  onClick={handleNewFolderClick}
                  aria-label="새 폴더"
                  style={{ color: 'var(--color-success)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4c0-.55.45-1 1-1h3.586c.265 0 .52.105.707.293L8.414 4.414c.187.188.442.293.707.293H13c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V4z" fill="currentColor"/>
                    <path d="M11 8h-2m0 0H7m2 0V6m0 2v2" stroke="var(--color-bg-primary)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </Tooltip>

              <div className="toolbar-divider" />

              {/* 타입 필터 */}
              <div className="type-filter-group">
                <Tooltip content="전체">
                  <button
                    className={`type-filter-button ${typeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setTypeFilter('all')}
                    aria-label="전체"
                  >
                    전체
                  </button>
                </Tooltip>
                <Tooltip content="파일만">
                  <button
                    className={`type-filter-button ${typeFilter === 'file' ? 'active' : ''}`}
                    onClick={() => setTypeFilter('file')}
                    aria-label="파일만"
                  >
                    파일
                  </button>
                </Tooltip>
                <Tooltip content="폴더만">
                  <button
                    className={`type-filter-button ${typeFilter === 'folder' ? 'active' : ''}`}
                    onClick={() => setTypeFilter('folder')}
                    aria-label="폴더만"
                  >
                    폴더
                  </button>
                </Tooltip>
              </div>

              {/* 검색 */}
              <div className="search-box">
                <SFSymbol
                  name="magnifyingglass"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  className="search-icon"
                  decorative={true}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="파일 검색"
                  className="search-input"
                />
              </div>

              {/* 뷰 모드 전환 */}
              <div className="view-mode-toggle">
                <Tooltip content="리스트 뷰">
                  <button
                    className={`view-mode-button ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    aria-label="리스트 뷰"
                  >
                    {viewMode === 'list' ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="3" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                        <rect x="6" y="3" width="8" height="2.5" rx="0.5" fill="currentColor"/>
                        <rect x="2" y="7" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                        <rect x="6" y="7" width="8" height="2.5" rx="0.5" fill="currentColor"/>
                        <rect x="2" y="11" width="2.5" height="2.5" rx="0.5" fill="currentColor"/>
                        <rect x="6" y="11" width="8" height="2.5" rx="0.5" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="3" width="2.5" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="6" y="3" width="8" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="2" y="7" width="2.5" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="6" y="7" width="8" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="2" y="11" width="2.5" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="6" y="11" width="8" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="그리드 뷰">
                  <button
                    className={`view-mode-button ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    aria-label="그리드 뷰"
                  >
                    {viewMode === 'grid' ? (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor"/>
                        <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor"/>
                        <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor"/>
                        <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </div>

              {/* 폴링 컨트롤 영역 */}
              <div className="toolbar-divider" />

              {/* 최근 업데이트 시간 */}
              {lastUpdated && (
                <span className="last-updated">
                  {formatLastUpdated(lastUpdated)}
                </span>
              )}

              {/* 폴링 토글 버튼 */}
              <Tooltip content={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}>
                <button
                  className={`polling-toggle ${isPollingEnabled ? 'polling-active' : 'polling-inactive'}`}
                  onClick={togglePolling}
                  aria-label={isPollingEnabled ? '실시간 업데이트 끄기' : '실시간 업데이트 켜기'}
                >
                  <span className={`polling-dot ${isPollingEnabled ? 'dot-active' : 'dot-inactive'}`}>●</span>
                </button>
              </Tooltip>

              {/* 새로고침 버튼 */}
              <Tooltip content="새로고침">
                <button
                  className="refresh-button"
                  onClick={() => loadFolderContents(currentFolderId)}
                  disabled={loading}
                  aria-label="새로고침"
                >
                  <SFSymbol
                    name="arrow.clockwise"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 업로드 진행률 표시 */}
          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="progress-text">업로드 중... {uploadProgress}%</span>
            </div>
          )}

          {/* 파일 목록 */}
          <div
            className={`files-content ${viewMode === 'grid' ? 'grid-view' : 'list-view'}`}
            onContextMenu={(e) => handleContextMenu(e)}
          >
            {loading ? (
              <div className="empty-state">
                <p>로딩 중...</p>
              </div>
            ) : error ? (
              <div className="empty-state">
                <p style={{ color: 'var(--color-destructive)' }}>{error}</p>
              </div>
            ) : filteredAndSortedItems.length === 0 ? (
              <div className="empty-state">
                <p>파일이 없습니다</p>
              </div>
            ) : viewMode === 'list' ? (
              // 리스트 뷰
              <div className="files-list" onContextMenu={(e) => handleContextMenu(e)}>
                <div className="files-list-header" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  <div
                    className={`header-name sortable ${sortBy === 'name' ? 'sorted' : ''}`}
                    onClick={() => handleSort('name')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('name')
                      }
                    }}
                    aria-label={`이름으로 정렬 ${sortBy === 'name' ? (sortDirection === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <path d="M4 1h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="currentColor"/>
                      <path className="pdf-icon-fold" d="M9 1v3h3" strokeWidth="0.8" fill="none"/>
                    </svg>
                    <span>이름</span>
                    {sortBy === 'name' ? (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    ) : (
                      <span className="sort-indicator sort-indicator--both" aria-hidden="true">
                        <span className="sort-arrow">▲</span>
                        <span className="sort-arrow">▼</span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`header-size sortable ${sortBy === 'size' ? 'sorted' : ''}`}
                    onClick={() => handleSort('size')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('size')
                      }
                    }}
                    aria-label={`크기로 정렬 ${sortBy === 'size' ? (sortDirection === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <rect x="2" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      <rect x="6" y="7" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    </svg>
                    <span>크기</span>
                    {sortBy === 'size' ? (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    ) : (
                      <span className="sort-indicator sort-indicator--both" aria-hidden="true">
                        <span className="sort-arrow">▲</span>
                        <span className="sort-arrow">▼</span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`header-modified sortable ${sortBy === 'createdAt' ? 'sorted' : ''}`}
                    onClick={() => handleSort('createdAt')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('createdAt')
                      }
                    }}
                    aria-label={`수정한 날짜로 정렬 ${sortBy === 'createdAt' ? (sortDirection === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      <path d="M2 6h12" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    <span>수정한 날짜</span>
                    {sortBy === 'createdAt' ? (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    ) : (
                      <span className="sort-indicator sort-indicator--both" aria-hidden="true">
                        <span className="sort-arrow">▲</span>
                        <span className="sort-arrow">▼</span>
                      </span>
                    )}
                  </div>
                  <div
                    className={`header-status sortable ${sortBy === 'status' ? 'sorted' : ''}`}
                    onClick={() => handleSort('status')}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSort('status')
                      }
                    }}
                    aria-label={`상태로 정렬 ${sortBy === 'status' ? (sortDirection === 'asc' ? '(오름차순)' : '(내림차순)') : ''}`}
                  >
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                      <path d="M5 7l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>상태</span>
                    {sortBy === 'status' ? (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    ) : (
                      <span className="sort-indicator sort-indicator--both" aria-hidden="true">
                        <span className="sort-arrow">▲</span>
                        <span className="sort-arrow">▼</span>
                      </span>
                    )}
                  </div>
                  <div className="header-actions">
                    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                      <circle cx="5" cy="8" r="1.5" fill="currentColor"/>
                      <circle cx="11" cy="8" r="1.5" fill="currentColor"/>
                    </svg>
                    <span>작업</span>
                  </div>
                </div>
                {filteredAndSortedItems.map(item => (
                  <div
                    key={item._id}
                    className={`file-list-row ${draggingItemId === item._id ? 'dragging' : ''} ${item.type === 'folder' && dragOverFolderId === item._id ? 'drag-over' : ''}`}
                    onClick={() => {
                      if (item.type === 'folder') {
                        handleFolderClick(item._id)
                      } else if (item.type === 'file' && item.document && onDocumentClick) {
                        onDocumentClick(item.document._id)
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onDragOver={item.type === 'folder' ? handleDragOver : undefined}
                    onDragEnter={item.type === 'folder' ? (e) => handleDragEnter(e, item._id) : undefined}
                    onDragLeave={item.type === 'folder' ? handleDragLeave : undefined}
                    onDrop={item.type === 'folder' ? (e) => handleDrop(e, item._id) : undefined}
                  >
                    <div className="row-name">
                      {item.type === 'folder' ? (
                        <>
                          <span className="folder-icon">📁</span>
                          <span>{item.name}</span>
                        </>
                      ) : (
                        <>
                          <div className="document-icon-wrapper">
                            <div className={`document-icon ${DocumentUtils.getFileTypeClass(item.mimeType, item.name)}`}>
                              <SFSymbol
                                name={DocumentUtils.getFileIcon(item.mimeType, item.name)}
                                size={SFSymbolSize.CAPTION_1}
                                weight={SFSymbolWeight.REGULAR}
                                decorative={true}
                              />
                            </div>
                            {/* 🍎 AR BADGE */}
                            {item.document?.is_annual_report && (
                              <Tooltip content="Annual Report">
                                <div className="document-ar-badge">
                                  AR
                                </div>
                              </Tooltip>
                            )}
                            {/* 🍎 TXT/OCR/BIN BADGE */}
                            {item.document && (() => {
                              const backendBadgeType = (item.document as any).badgeType
                              if (backendBadgeType) {
                                if (backendBadgeType === 'OCR') {
                                  const confidence = getOcrConfidence(item.document)
                                  if (confidence !== null) {
                                    const level = getOcrConfidenceLevel(confidence)
                                    return (
                                      <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
                                        <div className={`document-ocr-badge ocr-${level.color}`}>
                                          OCR
                                        </div>
                                      </Tooltip>
                                    )
                                  }
                                  return (
                                    <Tooltip content="OCR 처리 완료">
                                      <div className="document-ocr-badge ocr-medium">
                                        OCR
                                      </div>
                                    </Tooltip>
                                  )
                                }
                                if (backendBadgeType === 'TXT') {
                                  return (
                                    <Tooltip content="TXT 기반 문서">
                                      <div className="document-txt-badge">
                                        TXT
                                      </div>
                                    </Tooltip>
                                  )
                                }
                                if (backendBadgeType === 'BIN') {
                                  return (
                                    <Tooltip content="바이너리 파일 (텍스트 추출 불가)">
                                      <div className="document-bin-badge">
                                        BIN
                                      </div>
                                    </Tooltip>
                                  )
                                }
                              }

                              // 하위 호환성
                              const confidence = getOcrConfidence(item.document)
                              if (confidence === null) {
                                const typeLabel = DocumentUtils.getDocumentTypeLabel(item.document)
                                if (typeLabel === 'TXT') {
                                  return (
                                    <Tooltip content="TXT 기반 문서">
                                      <div className="document-txt-badge">
                                        TXT
                                      </div>
                                    </Tooltip>
                                  )
                                }
                                if (typeLabel === 'BIN') {
                                  return (
                                    <Tooltip content="바이너리 파일 (텍스트 추출 불가)">
                                      <div className="document-bin-badge">
                                        BIN
                                      </div>
                                    </Tooltip>
                                  )
                                }
                                return null
                              }
                              const level = getOcrConfidenceLevel(confidence)
                              return (
                                <Tooltip content={`OCR 신뢰도: ${(confidence * 100).toFixed(1)}% (${level.label})`}>
                                  <div className={`document-ocr-badge ocr-${level.color}`}>
                                    OCR
                                  </div>
                                </Tooltip>
                              )
                            })()}
                          </div>
                          <span>{item.name}</span>
                        </>
                      )}
                    </div>
                    <div className="row-size">
                      {item.type === 'file' && item.size ? formatFileSize(item.size) : null}
                    </div>
                    <div className="row-modified">
                      {formatDate(item.updatedAt)}
                    </div>
                    <div className="row-status">
                      {item.type === 'file' && item.document ? (() => {
                        const status = DocumentStatusService.extractStatus(item.document)
                        const progress = DocumentStatusService.extractProgress(item.document)
                        const statusLabel = DocumentStatusService.getStatusLabel(status)
                        const statusIcon = DocumentStatusService.getStatusIcon(status)

                        return (
                          <>
                            <Tooltip content={statusLabel}>
                              <div className={`status-icon status-${status}`}>
                                {statusIcon}
                              </div>
                            </Tooltip>
                            <div className="status-text">
                              {status === 'processing' && progress ? (
                                <span className="progress-text">{progress}%</span>
                              ) : (
                                <span className="status-label">{statusLabel}</span>
                              )}
                            </div>
                          </>
                        )
                      })() : null}
                    </div>
                    <div className="row-actions">
                      {item.type === 'file' && item.document && (
                        <>
                          <Tooltip content="상세 보기">
                            <button
                              type="button"
                              className="action-btn action-btn--detail"
                              onClick={(e) => handleDetailClick(item.document!, e)}
                              aria-label="상세 보기"
                            >
                              <EyeIcon />
                            </button>
                          </Tooltip>
                          <Tooltip content="요약 보기">
                            <button
                              type="button"
                              className="action-btn action-btn--summary"
                              onClick={(e) => handleSummaryClick(item.document!, e)}
                              aria-label="요약 보기"
                            >
                              <SummaryIcon />
                            </button>
                          </Tooltip>
                          <Tooltip content="전체 텍스트 보기">
                            <button
                              type="button"
                              className="action-btn action-btn--full"
                              onClick={(e) => handleFullTextClick(item.document!, e)}
                              aria-label="전체 텍스트 보기"
                            >
                              <DocumentIcon />
                            </button>
                          </Tooltip>
                          {/* 내 파일(ownerId === customerId)이 아닐 때만 "고객에게 연결" 버튼 표시 */}
                          {!(item.document.ownerId && item.document.customerId && item.document.ownerId === item.document.customerId) && (
                            <Tooltip content="고객에게 연결">
                              <button
                                type="button"
                                className="action-btn action-btn--link"
                                onClick={(e) => handleLinkClick(item.document!, e)}
                                aria-label="고객에게 연결"
                              >
                                <LinkIcon />
                              </button>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // 그리드 뷰
              <div className="files-grid" onContextMenu={(e) => handleContextMenu(e)}>
                {filteredAndSortedItems.map(item => (
                  <div
                    key={item._id}
                    className={`file-grid-item ${draggingItemId === item._id ? 'dragging' : ''} ${item.type === 'folder' && dragOverFolderId === item._id ? 'drag-over' : ''}`}
                    onClick={() => {
                      if (item.type === 'folder') {
                        handleFolderClick(item._id)
                      } else if (item.type === 'file' && item.document && onDocumentClick) {
                        onDocumentClick(item.document._id)
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onDragOver={item.type === 'folder' ? handleDragOver : undefined}
                    onDragEnter={item.type === 'folder' ? (e) => handleDragEnter(e, item._id) : undefined}
                    onDragLeave={item.type === 'folder' ? handleDragLeave : undefined}
                    onDrop={item.type === 'folder' ? (e) => handleDrop(e, item._id) : undefined}
                  >
                    <div className="grid-item-icon">
                      {item.type === 'folder' ? (
                        <span className="folder-icon folder-icon-large">📁</span>
                      ) : (
                        <div className={`document-icon ${DocumentUtils.getFileTypeClass(item.mimeType, item.name)}`}>
                          <SFSymbol
                            name={DocumentUtils.getFileIcon(item.mimeType, item.name)}
                            size={SFSymbolSize.CALLOUT}
                            weight={SFSymbolWeight.REGULAR}
                            decorative={true}
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid-item-name">
                      {item.name}
                    </div>
                    <div className="grid-item-info">
                      {item.type === 'file' && item.size ? formatFileSize(item.size) : ''}
                    </div>
                    {item.type === 'file' && (
                      <Tooltip content="다운로드">
                        <button
                          className="grid-download-button"
                          onClick={(e) => handleFileDownload(item._id, item.name, e)}
                          aria-label="다운로드"
                        >
                          <SFSymbol
                            name="arrow.down.circle"
                            size={SFSymbolSize.FOOTNOTE}
                            weight={SFSymbolWeight.REGULAR}
                            decorative={true}
                          />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 폴더 생성 모달 */}
      <Modal
        visible={showNewFolderModal}
        onClose={handleCloseFolderModal}
        title="새 폴더"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleCloseFolderModal}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFolder}
              loading={creatingFolder}
              disabled={!newFolderName.trim()}
            >
              만들기
            </Button>
          </div>
        }
      >
        <div style={{ padding: 'var(--spacing-3)' }}>
          <div style={{ marginBottom: 'var(--spacing-2)' }}>
            <label
              htmlFor="folder-name-input"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-footnote)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-1)'
              }}
            >
              폴더 이름
            </label>
            <input
              id="folder-name-input"
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleCreateFolder()
                }
              }}
              placeholder="폴더 이름을 입력하세요"
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--spacing-2)',
                fontSize: 'var(--font-size-body)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                transition: 'border-color var(--duration-fast) var(--easing-ease-out)'
              }}
            />
          </div>
        </div>
      </Modal>

      {/* 컨텍스트 메뉴 - Portal로 body에 렌더링하여 부모 transform 영향 회피 */}
      {showContextMenu && createPortal(
        <div
          className="context-menu"
          data-theme={document.documentElement.getAttribute('data-theme') || 'light'}
          style={{
            position: 'fixed',
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedItem ? (
            // 항목이 선택된 경우: 기존 메뉴들
            <>
              <button className="context-menu-item" onClick={handleRenameClick}>
                <span className="context-menu-icon context-menu-icon--rename">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 1.5l3 3-8 8H3.5v-3l8-8z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9.5 3.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </span>
                <span>이름 변경</span>
              </button>
              <button className="context-menu-item" onClick={handleMoveClick}>
                <span className="context-menu-icon context-menu-icon--move">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4h4l1.5-1.5h6.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </span>
                <span>이동...</span>
              </button>

              {selectedItem.type === 'folder' && (
                <button className="context-menu-item" onClick={handleNewFolderFromContext}>
                  <span className="context-menu-icon context-menu-icon--new">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h4l1.5-1.5h6.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <span>새 폴더</span>
                </button>
              )}

              <button className="context-menu-item context-menu-item--danger" onClick={handleDeleteClick}>
                <SFSymbol
                  name="trash"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.MEDIUM}
                  decorative={true}
                />
                <span>삭제</span>
              </button>
            </>
          ) : (
            // 빈 공간 우클릭: "새 폴더"만 표시
            <button className="context-menu-item" onClick={handleNewFolderClick}>
              <span className="context-menu-icon context-menu-icon--new">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h4l1.5-1.5h6.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span>새 폴더</span>
            </button>
          )}
        </div>,
        document.body
      )}

      {/* 이름 변경 모달 */}
      <Modal
        visible={showRenameModal}
        onClose={handleCloseRenameModal}
        title="이름 변경"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={handleCloseRenameModal}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleRenameItem}
              loading={renamingItem}
              disabled={!renameValue.trim()}
            >
              변경
            </Button>
          </div>
        }
      >
        <div style={{ padding: 'var(--spacing-3)' }}>
          <div style={{ marginBottom: 'var(--spacing-2)' }}>
            <label
              htmlFor="rename-input"
              style={{
                display: 'block',
                fontSize: 'var(--font-size-footnote)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-1)'
              }}
            >
              {itemToRename?.type === 'folder' ? '폴더 이름' : '파일 이름'}
            </label>
            <input
              id="rename-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) {
                  handleRenameItem()
                }
              }}
              placeholder="새 이름을 입력하세요"
              autoFocus
              style={{
                width: '100%',
                padding: 'var(--spacing-2)',
                fontSize: 'var(--font-size-body)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                transition: 'border-color var(--duration-fast) var(--easing-ease-out)'
              }}
            />
          </div>
        </div>
      </Modal>

      {/* 액션 모달들 */}
      <DocumentDetailModal
        visible={isDetailModalVisible}
        onClose={handleCloseDetailModal}
        document={selectedDocument}
      />
      <DocumentSummaryModal
        visible={isSummaryModalVisible}
        onClose={handleCloseSummaryModal}
        document={selectedDocument}
      />
      <DocumentFullTextModal
        visible={isFullTextModalVisible}
        onClose={handleCloseFullTextModal}
        document={selectedDocument}
      />
      <DocumentLinkModal
        visible={isLinkModalVisible}
        onClose={handleCloseLinkModal}
        document={selectedDocument}
        onFetchCustomerDocuments={async (customerId: string) => ({
          customer_id: customerId,
          documents: [],
          total: 0
        })}
        onLink={async () => undefined}
      />
    </CenterPaneView>

    {/* Apple Confirm Modal */}
    <AppleConfirmModal
      state={confirmModal.state}
      actions={confirmModal.actions}
    />

    {/* Move Folder Modal */}
    <MoveFolderModal
      visible={showMoveModal}
      onClose={() => { setShowMoveModal(false); setSelectedItem(null); }}
      onMove={handleMove}
      currentItem={selectedItem}
      allItems={allFoldersForMove}
    />
    </>
  )
}

export default PersonalFilesView
