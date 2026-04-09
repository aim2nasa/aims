/**
 * MappingPreview Component
 * @since 2025-12-05
 * @version 3.0.0
 *
 * 폴더-고객 매핑 미리보기 (윈도우 탐색기 스타일 트리)
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import { formatFileSize } from '../utils/fileValidation'
import type { CustomerForMatching } from '../utils/customerMatcher'
import type { FolderMapping } from '../types'
import './MappingPreview.css'

/** 개인 고객 아이콘 (파란색) */
function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-primary-500)' }}>
      <circle cx="10" cy="10" r="10" opacity="0.2" />
      <circle cx="10" cy="7" r="3" />
      <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
    </svg>
  )
}

/** 법인 고객 아이콘 (주황) */
function CorporateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: 'var(--color-ios-orange)' }}>
      <circle cx="10" cy="10" r="10" opacity="0.2" />
      <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
    </svg>
  )
}

/** 고객 타입 아이콘 */
function CustomerTypeIcon({ customerType }: { customerType?: string }) {
  if (customerType === '법인') return <CorporateIcon />
  return <PersonIcon />
}

interface MappingPreviewProps {
  mappings: FolderMapping[]
  parentFolderName?: string | null  // 재그룹화 시 원본 부모 폴더명
  parentRootFiles?: File[]          // 부모 폴더 직하 파일들
  customers?: CustomerForMatching[]  // 전체 고객 목록 (수동 매핑 검색용)
  onMappingChange?: (folderName: string, customer: CustomerForMatching | null) => void  // 매핑 변경 콜백
  onBack: () => void
  onStartUpload: (selectedMappings: FolderMapping[]) => void  // 선택된 매핑만 업로드
  expandedPaths?: Set<string>  // 외부에서 제어하는 펼침 상태
  onExpandedPathsChange?: (paths: Set<string>) => void  // 펼침 상태 변경 콜백
}

// 트리 노드 타입
interface TreeNode {
  name: string
  type: 'folder' | 'file'
  size?: number
  children?: TreeNode[]
  path: string
}

// 파일 목록을 트리 구조로 변환
function buildTree(files: File[], rootFolder: string): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const pathParts = relativePath.split('/')
    const startIndex = pathParts.indexOf(rootFolder) + 1
    const parts = pathParts.slice(startIndex)

    let current = root
    let currentPath = rootFolder

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      currentPath = `${currentPath}/${part}`

      if (isLast) {
        current.push({
          name: part,
          type: 'file',
          size: file.size,
          path: currentPath
        })
      } else {
        let folder = current.find(n => n.type === 'folder' && n.name === part)
        if (!folder) {
          folder = { name: part, type: 'folder', children: [], path: currentPath }
          current.push(folder)
        }
        current = folder.children!
      }
    }
  }

  // 정렬: 폴더 먼저, 그 다음 파일 (알파벳순)
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, 'ko')
    }).map(node => {
      if (node.children) {
        node.children = sortNodes(node.children)
      }
      return node
    })
  }

  return sortNodes(root)
}

// 폴더 내 파일 수 계산
function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((count, node) => {
    if (node.type === 'file') return count + 1
    if (node.children) return count + countFiles(node.children)
    return count
  }, 0)
}

// 폴더 크기 계산
function calculateSize(nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.type === 'file') return sum + (node.size || 0)
    if (node.children) return sum + calculateSize(node.children)
    return sum
  }, 0)
}

export default function MappingPreview({
  mappings,
  parentFolderName,
  parentRootFiles,
  customers,
  onMappingChange,
  onBack,
  onStartUpload,
  expandedPaths: controlledExpandedPaths,
  onExpandedPathsChange
}: MappingPreviewProps) {
  // 수동 매핑 드롭다운 상태
  const [assigningFolder, setAssigningFolder] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!assigningFolder) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAssigningFolder(null)
        setSearchQuery('')
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAssigningFolder(null)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [assigningFolder])

  // 드롭다운 열릴 때 검색 input에 포커스
  useEffect(() => {
    if (assigningFolder && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [assigningFolder])

  // 폴더명에서 이름 후보 토큰 추출 (구분자로 분리 + 최소 2글자)
  const extractTokens = useCallback((folderName: string): string[] => {
    return folderName.toLowerCase()
      .split(/[.\-_,\s()\[\]]+/)
      .map(t => t.replace(/[0-9a-z]+$/i, '').trim())  // 후행 숫자/영문 제거 (OK, 20240926 등)
      .filter(t => t.length >= 2)
  }, [])

  // 고객명의 폴더명 관련도 점수 (높을수록 관련성 높음, 0=무관)
  // 100+ = 정확 매칭 (substring), 1~50 = 근사 매칭 (글자 유사도)
  const getRelevanceScore = useCallback((customerName: string, folder: string, tokens: string[]): number => {
    const name = customerName.toLowerCase()
    if (name.length < 2) return 0
    let bestScore = 0
    for (const token of tokens) {
      // 1. 고객명 === 토큰 (완전 일치, 최고 점수)
      if (name === token) { bestScore = Math.max(bestScore, 300 + name.length); continue }
      // 2. 폴더명에 고객명 전체 포함 (김태호 ⊂ 김태호.김지현OK)
      if (folder.includes(name)) bestScore = Math.max(bestScore, 200 + name.length)
      // 3. 고객명에 토큰 전체 포함 (주식회사마리치 ← 마리치)
      if (name.includes(token)) bestScore = Math.max(bestScore, 100 + token.length)
      // 4. 토큰에 고객명 전체 포함
      if (token.includes(name)) bestScore = Math.max(bestScore, 200 + name.length)
      // 4. 근사 매칭: 고유 글자 교집합 비율 (마리치 vs 마라치 → {마,치} = 67%)
      const tokenChars = new Set(token)
      const nameChars = new Set(name)
      let shared = 0
      for (const ch of tokenChars) {
        if (nameChars.has(ch)) shared++
      }
      const shorter = Math.min(tokenChars.size, nameChars.size)
      if (shared >= 2 && shorter >= 2) {
        const ratio = shared / shorter
        if (ratio >= 0.5) {
          bestScore = Math.max(bestScore, Math.round(ratio * 50))
        }
      }
    }
    return bestScore
  }, [])

  // 검색 필터링된 고객 목록 (폴더명과 유사한 고객을 상단에 표시)
  const filteredCustomers = useMemo(() => {
    if (!customers) return []
    const query = searchQuery.toLowerCase().trim()

    // 검색어가 있으면 필터링
    const base = query
      ? customers.filter(c => (c.personal_info?.name?.toLowerCase() || '').includes(query))
      : [...customers]

    // 현재 지정 중인 폴더명으로 유사 고객을 상단 정렬 (점수 높은 순)
    if (assigningFolder) {
      const folder = assigningFolder.toLowerCase()
      const tokens = extractTokens(assigningFolder)
      base.sort((a, b) => {
        const scoreA = getRelevanceScore(a.personal_info?.name || '', folder, tokens)
        const scoreB = getRelevanceScore(b.personal_info?.name || '', folder, tokens)
        return scoreB - scoreA
      })
    }

    return base
  }, [customers, searchQuery, assigningFolder, extractTokens, getRelevanceScore])

  // 고객 선택 핸들러
  const handleCustomerSelect = useCallback((folderName: string, customer: CustomerForMatching) => {
    onMappingChange?.(folderName, customer)
    setAssigningFolder(null)
    setSearchQuery('')
  }, [onMappingChange])

  // 매핑 해제 핸들러
  const handleUnassign = useCallback((folderName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onMappingChange?.(folderName, null)
  }, [onMappingChange])

  // 수동 매핑 여부 판별 (matched이지만 folderName !== customerName인 경우)
  const isManuallyMapped = useCallback((mapping: FolderMapping) => {
    return mapping.matched && mapping.customerName !== null && mapping.folderName !== mapping.customerName
  }, [])

  // 내부 상태 (controlled prop이 없을 때 사용)
  const [internalExpandedPaths, setInternalExpandedPaths] = useState<Set<string>>(() => {
    // 기본적으로 루트 폴더들만 펼침
    return new Set(mappings.map(m => m.folderName))
  })

  // controlled 또는 uncontrolled 모드 지원
  const expandedPaths = controlledExpandedPaths ?? internalExpandedPaths
  const setExpandedPaths = (onExpandedPathsChange ?? setInternalExpandedPaths) as React.Dispatch<React.SetStateAction<Set<string>>>

  // 선택된 폴더 상태 (기본값: 모든 매칭된 폴더 선택)
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(() => {
    return new Set(mappings.filter(m => m.matched).map(m => m.folderName))
  })

  // mappings가 변경될 때 선택 상태 동기화 (모든 매칭된 폴더 자동 선택)
  useEffect(() => {
    setSelectedFolders(new Set(mappings.filter(m => m.matched).map(m => m.folderName)))
  }, [mappings])

  const stats = useMemo(() => {
    const matched = mappings.filter(m => m.matched).length
    const unmatched = mappings.length - matched
    const hasPlaceholder = mappings.some(m => m.isPlaceholder)

    // 선택된 폴더만의 파일 수와 크기 (실시간 업데이트)
    const selectedMappings = mappings.filter(m => m.matched && selectedFolders.has(m.folderName))
    const selectedFiles = selectedMappings.reduce((sum, m) => sum + m.fileCount, 0)
    const selectedSize = selectedMappings.reduce((sum, m) => sum + m.totalSize, 0)

    return { matched, unmatched, selectedFiles, selectedSize, hasPlaceholder }
  }, [mappings, selectedFolders])

  // 선택된 매칭 폴더 수
  const selectedCount = useMemo(() => {
    return mappings.filter(m => m.matched && selectedFolders.has(m.folderName)).length
  }, [mappings, selectedFolders])

  // 선택된 폴더가 있고, placeholder가 아니어야 업로드 가능
  const canUpload = selectedCount > 0 && !stats.hasPlaceholder

  // 폴더 선택 토글
  const toggleSelection = useCallback((folderName: string, e: React.MouseEvent) => {
    e.stopPropagation() // 트리 펼침/접힘 방지
    setSelectedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) {
        next.delete(folderName)
      } else {
        next.add(folderName)
      }
      return next
    })
  }, [])

  // 전체 선택/해제
  const toggleAllSelection = useCallback(() => {
    const matchedFolders = mappings.filter(m => m.matched).map(m => m.folderName)
    if (selectedCount === stats.matched) {
      // 모두 선택됨 -> 모두 해제
      setSelectedFolders(new Set())
    } else {
      // 일부 또는 없음 -> 모두 선택
      setSelectedFolders(new Set(matchedFolders))
    }
  }, [mappings, selectedCount, stats.matched])

  // 업로드 시작 핸들러
  const handleStartUpload = useCallback(() => {
    const selectedMappings = mappings.filter(m => m.matched && selectedFolders.has(m.folderName))
    onStartUpload(selectedMappings)
  }, [mappings, selectedFolders, onStartUpload])

  // 모든 폴더 경로 수집
  const allFolderPaths = useMemo(() => {
    const paths: string[] = []

    // 부모 폴더가 있으면 포함
    if (parentFolderName) {
      paths.push(parentFolderName)
    }

    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          paths.push(node.path)
          if (node.children) collectPaths(node.children)
        }
      }
    }

    for (const mapping of mappings) {
      paths.push(mapping.folderName)
      const tree = buildTree(mapping.files, mapping.folderName)
      collectPaths(tree)
    }

    return paths
  }, [mappings, parentFolderName])

  const allExpanded = expandedPaths.size === allFolderPaths.length

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [setExpandedPaths])

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedPaths(new Set())
    } else {
      setExpandedPaths(new Set(allFolderPaths))
    }
  }, [allExpanded, allFolderPaths, setExpandedPaths])

  // 트리 노드 렌더링 (FolderDropZone과 동일한 CSS 라인 구조)
  const renderNode = (node: TreeNode, isLast: boolean): React.ReactNode => {
    const isFolder = node.type === 'folder'
    const isExpanded = expandedPaths.has(node.path)
    const hasChildren = isFolder && node.children && node.children.length > 0

    return (
      <div key={node.path} className={`guide-node ${isLast ? 'last' : ''}`}>
        <div
          className={`guide-node-content ${isFolder ? 'clickable' : ''}`}
          onClick={isFolder ? () => togglePath(node.path) : undefined}
        >
          {isFolder && (
            <span className="guide-toggle">
              {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
            </span>
          )}
          <span className={`guide-icon ${isFolder ? 'folder' : 'file'}`}>
            {isFolder ? '📁' : '📄'}
          </span>
          <span className={`guide-name ${isFolder ? 'subfolder' : 'file'}`}>{node.name}</span>
          {isFolder && hasChildren && (
            <span className="guide-info">{countFiles(node.children!)}개 · {formatFileSize(calculateSize(node.children || []))}</span>
          )}
          {!isFolder && (
            <span className="guide-info">{formatFileSize(node.size || 0)}</span>
          )}
        </div>
        {isFolder && isExpanded && hasChildren &&
          node.children!.map((child, idx) =>
            renderNode(child, idx === node.children!.length - 1)
          )
        }
      </div>
    )
  }

  // 매핑 노드 렌더링 (parentFolderName 유무와 관계없이 공통 사용)
  const renderMappingNode = (mapping: FolderMapping, isLast: boolean) => {
    const isExpanded = expandedPaths.has(mapping.folderName)
    const tree = buildTree(mapping.files, mapping.folderName)
    const isSelected = selectedFolders.has(mapping.folderName)
    const manuallyMapped = isManuallyMapped(mapping)
    const showAssignDropdown = assigningFolder === mapping.folderName

    // 수동 매핑된 고객의 customer_type 찾기
    const mappedCustomer = manuallyMapped && customers
      ? customers.find(c => c._id === mapping.customerId)
      : null

    return (
      <div key={mapping.folderName} className={`guide-node ${isLast ? 'last' : ''} has-children`}>
        <div
          className={`guide-node-content customer-root ${mapping.matched ? 'matched' : 'unmatched'} ${isSelected ? 'selected' : ''}`}
          onClick={() => togglePath(mapping.folderName)}
        >
          {mapping.matched && (
            <span
              className={`guide-checkbox ${isSelected ? 'checked' : ''}`}
              onClick={(e) => toggleSelection(mapping.folderName, e)}
            >
              {isSelected ? '☑' : '☐'}
            </span>
          )}
          <span className="guide-toggle">
            {isExpanded ? '▼' : '▶'}
          </span>
          {mapping.matched ? (
            <span className="guide-icon customer-icon">
              {manuallyMapped ? (
                <CustomerTypeIcon customerType={mappedCustomer?.insurance_info?.customer_type} />
              ) : (
                <SFSymbol name="person" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
              )}
            </span>
          ) : (
            <span className="guide-icon folder">📁</span>
          )}
          <span className={`guide-name customer ${mapping.matched ? '' : 'unmatched'}`}>
            {manuallyMapped ? `${mapping.customerName} (${mapping.folderName})` : mapping.folderName}
          </span>
          {manuallyMapped && (
            <>
              <span className="guide-manual-badge">수동 지정</span>
              <button
                type="button"
                className="guide-unassign-btn"
                onClick={(e) => handleUnassign(mapping.folderName, e)}
                title="매핑 해제"
              >
                ✕
              </button>
            </>
          )}
          {!mapping.matched && (
            <>
              <span className="guide-note">미매칭</span>
              {customers && customers.length > 0 && onMappingChange && (
                <button
                  type="button"
                  className="guide-assign-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAssigningFolder(prev => prev === mapping.folderName ? null : mapping.folderName)
                    setSearchQuery('')
                  }}
                >
                  고객 지정
                </button>
              )}
            </>
          )}
          <span className="guide-info">{mapping.fileCount}개 · {formatFileSize(mapping.totalSize)}</span>
        </div>
        {/* 고객 검색 드롭다운 */}
        {showAssignDropdown && (
          <div className="customer-search-dropdown" ref={dropdownRef}>
            <input
              ref={searchInputRef}
              type="text"
              className="customer-search-input"
              placeholder="고객명 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="customer-search-list">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => (
                  <div
                    key={customer._id}
                    className="customer-search-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCustomerSelect(mapping.folderName, customer)
                    }}
                  >
                    <span className="customer-type-icon">
                      <CustomerTypeIcon customerType={customer.insurance_info?.customer_type} />
                    </span>
                    <span>{customer.personal_info?.name || '(이름 없음)'}</span>
                  </div>
                ))
              ) : (
                <div className="customer-search-empty">검색 결과가 없습니다</div>
              )}
            </div>
          </div>
        )}
        {isExpanded && tree.length > 0 &&
          tree.map((node, nodeIdx) =>
            renderNode(node, nodeIdx === tree.length - 1)
          )
        }
      </div>
    )
  }

  return (
    <div className="mapping-preview">
      {/* 요약 통계 */}
      <div className="preview-stats">
        <div className="stat-item">
          <span className="stat-value matched">{selectedCount}/{stats.matched}</span>
          <span className="stat-label">선택됨</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value unmatched">{stats.unmatched}</span>
          <span className="stat-label">미매칭</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{stats.selectedFiles}</span>
          <span className="stat-label">파일</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{formatFileSize(stats.selectedSize)}</span>
          <span className="stat-label">총 크기</span>
        </div>
      </div>

      {/* 매칭 설명 */}
      <div className="preview-legend">
        <span className="legend-item matched">매칭: 고객명과 일치</span>
        <span className="legend-divider">|</span>
        <span className="legend-item unmatched">미매칭: 일치하는 고객명 없음</span>
      </div>

      {/* 트리 헤더 */}
      <div className="tree-header">
        <div className="tree-header-left">
          <span>폴더 구조</span>
          {stats.matched > 0 && (
            <button type="button" className="select-all-btn" onClick={toggleAllSelection}>
              {selectedCount === stats.matched ? '전체 해제' : '전체 선택'}
            </button>
          )}
        </div>
        <button type="button" className="toggle-all-btn" onClick={toggleAll}>
          {allExpanded ? '▲ 모두 접기' : '▼ 모두 펼치기'}
        </button>
      </div>

      {/* 트리 뷰 - FolderDropZone과 동일한 CSS 라인 구조 */}
      <div className="tree-container">
        <div className="guide-node root">
          {parentFolderName ? (
            // 부모 폴더 wrapper (재그룹화된 경우)
            <div className="guide-node has-children">
              <div
                className="guide-node-content customer-root unmatched"
                onClick={() => togglePath(parentFolderName)}
              >
                <span className="guide-toggle">
                  {expandedPaths.has(parentFolderName) ? '▼' : '▶'}
                </span>
                <span className="guide-icon folder">📁</span>
                <span className="guide-name customer unmatched">{parentFolderName}</span>
                <span className="guide-note">미매칭</span>
                <span className="guide-info">
                  {mappings.reduce((sum, m) => sum + m.fileCount, 0) + (parentRootFiles?.length ?? 0)}개 · {formatFileSize(
                    mappings.reduce((sum, m) => sum + m.totalSize, 0) + (parentRootFiles?.reduce((sum, f) => sum + f.size, 0) ?? 0)
                  )}
                </span>
              </div>
              {expandedPaths.has(parentFolderName) && (
                <>
                  {/* 부모 폴더 직하 루트 파일들 */}
                  {parentRootFiles?.map((file, fileIdx) => {
                    const isLastRootFile = fileIdx === (parentRootFiles.length - 1)
                    const isLast = isLastRootFile && mappings.length === 0
                    return (
                      <div key={`root-${file.name}`} className={`guide-node ${isLast ? 'last' : ''}`}>
                        <div className="guide-node-content">
                          <span className="guide-icon file">📄</span>
                          <span className="guide-name file">{file.name}</span>
                          <span className="guide-info">{formatFileSize(file.size)}</span>
                        </div>
                      </div>
                    )
                  })}
                  {/* 하위 폴더(매핑) 목록 */}
                  {mappings.map((mapping, idx) =>
                    renderMappingNode(mapping, idx === mappings.length - 1)
                  )}
                </>
              )}
            </div>
          ) : (
            // 기존 동작: 부모 없이 매핑 목록 직접 표시
            mappings.map((mapping, idx) =>
              renderMappingNode(mapping, idx === mappings.length - 1)
            )
          )}
        </div>
      </div>

      {/* 경고 - placeholder 상태 */}
      {stats.hasPlaceholder && (
        <div className="preview-warning placeholder">
          <SFSymbol name="arrow-counterclockwise" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
          <span>새로고침으로 파일 내용이 사라졌습니다. 뒤로 가서 폴더를 다시 선택해주세요.</span>
        </div>
      )}

      {/* 경고 - 미매칭 */}
      {stats.unmatched > 0 && !stats.hasPlaceholder && (
        <div className="preview-warning">
          <SFSymbol name="exclamationmark-triangle-fill" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
          <span>미매칭된 {stats.unmatched}개 폴더는 업로드되지 않습니다. "고객 지정" 버튼으로 고객을 수동 연결할 수 있습니다.</span>
        </div>
      )}

      {/* 버튼 */}
      <div className="preview-actions">
        <Button variant="secondary" onClick={onBack}>뒤로</Button>
        <Button variant="primary" onClick={handleStartUpload} disabled={!canUpload}>
          {stats.hasPlaceholder
            ? '폴더 다시 선택 필요'
            : canUpload
              ? `${selectedCount}개 폴더 업로드 시작`
              : '업로드할 폴더를 선택하세요'}
        </Button>
      </div>
    </div>
  )
}
