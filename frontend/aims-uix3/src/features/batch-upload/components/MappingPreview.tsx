/**
 * MappingPreview Component
 * @since 2025-12-05
 * @version 3.0.0
 *
 * 폴더-고객 매핑 미리보기 (윈도우 탐색기 스타일 트리)
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import { formatFileSize } from '../utils/fileValidation'
import type { FolderMapping } from '../types'
import './MappingPreview.css'

interface MappingPreviewProps {
  mappings: FolderMapping[]
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
  onBack,
  onStartUpload,
  expandedPaths: controlledExpandedPaths,
  onExpandedPathsChange
}: MappingPreviewProps) {
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
  }, [mappings])

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
  }, [])

  const toggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedPaths(new Set())
    } else {
      setExpandedPaths(new Set(allFolderPaths))
    }
  }, [allExpanded, allFolderPaths])

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
          {mappings.map((mapping, idx) => {
            const isExpanded = expandedPaths.has(mapping.folderName)
            const tree = buildTree(mapping.files, mapping.folderName)
            const isLast = idx === mappings.length - 1
            const isSelected = selectedFolders.has(mapping.folderName)

            return (
              <div key={mapping.folderName} className={`guide-node ${isLast ? 'last' : ''} has-children`}>
                <div
                  className={`guide-node-content customer-root ${mapping.matched ? 'matched' : 'unmatched'} ${isSelected ? 'selected' : ''}`}
                  onClick={() => togglePath(mapping.folderName)}
                >
                  {/* 매칭된 폴더에만 체크박스 표시 */}
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
                      <SFSymbol name="person" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
                    </span>
                  ) : (
                    <span className="guide-icon folder">📁</span>
                  )}
                  <span className={`guide-name customer ${mapping.matched ? '' : 'unmatched'}`}>{mapping.folderName}</span>
                  {!mapping.matched && (
                    <span className="guide-note">미매칭</span>
                  )}
                  <span className="guide-info">{mapping.fileCount}개 · {formatFileSize(mapping.totalSize)}</span>
                </div>
                {isExpanded && tree.length > 0 &&
                  tree.map((node, nodeIdx) =>
                    renderNode(node, nodeIdx === tree.length - 1)
                  )
                }
              </div>
            )
          })}
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
          <span>미매칭된 {stats.unmatched}개 폴더는 업로드되지 않습니다.</span>
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
