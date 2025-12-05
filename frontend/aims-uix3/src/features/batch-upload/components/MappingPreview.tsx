/**
 * MappingPreview Component
 * @since 2025-12-05
 * @version 3.0.0
 *
 * 폴더-고객 매핑 미리보기 (윈도우 탐색기 스타일 트리)
 */

import { useState, useMemo, useCallback } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import { formatFileSize } from '../utils/fileValidation'
import type { FolderMapping } from '../types'
import './MappingPreview.css'

interface MappingPreviewProps {
  mappings: FolderMapping[]
  onBack: () => void
  onStartUpload: (selectedMappings: FolderMapping[]) => void  // 선택된 매핑만 업로드
  isRestored?: boolean  // sessionStorage에서 복원됨 (파일 없음)
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
  isRestored = false,
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
  const setExpandedPaths = onExpandedPathsChange ?? setInternalExpandedPaths

  // 선택된 폴더 상태 (기본값: 모든 매칭된 폴더 선택)
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(() => {
    return new Set(mappings.filter(m => m.matched).map(m => m.folderName))
  })

  const stats = useMemo(() => {
    const matched = mappings.filter(m => m.matched).length
    const unmatched = mappings.length - matched
    const totalFiles = mappings.reduce((sum, m) => sum + m.fileCount, 0)
    const totalSize = mappings.reduce((sum, m) => sum + m.totalSize, 0)
    return { matched, unmatched, totalFiles, totalSize }
  }, [mappings])

  // 선택된 매칭 폴더 수
  const selectedCount = useMemo(() => {
    return mappings.filter(m => m.matched && selectedFolders.has(m.folderName)).length
  }, [mappings, selectedFolders])

  // 복원된 상태면 파일이 없으므로 업로드 불가, 선택된 폴더가 있어야 업로드 가능
  const canUpload = selectedCount > 0 && !isRestored

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
    setExpandedPaths(prev => {
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

  // 트리 노드 렌더링
  const renderNode = (node: TreeNode, isLast: boolean, prefix: string) => {
    const isFolder = node.type === 'folder'
    const isExpanded = expandedPaths.has(node.path)
    const hasChildren = isFolder && node.children && node.children.length > 0

    return (
      <div key={node.path} className="tree-item">
        <div
          className={`tree-line ${isFolder ? 'folder' : 'file'}`}
          onClick={isFolder ? () => togglePath(node.path) : undefined}
        >
          <span className="tree-prefix">{prefix}{isLast ? '└── ' : '├── '}</span>
          {isFolder && (
            <span className={`tree-toggle ${isExpanded ? 'expanded' : ''}`}>
              {hasChildren ? (isExpanded ? '▼' : '▶') : '  '}
            </span>
          )}
          <span className={`tree-icon ${isFolder ? 'folder' : 'file'}`}>
            {isFolder ? '📁' : '📄'}
          </span>
          <span className="tree-name">{node.name}</span>
          <span className="tree-info">
            {isFolder && hasChildren && (
              <span className="tree-count">{countFiles(node.children!)}개</span>
            )}
            <span className="tree-size">
              {isFolder ? formatFileSize(calculateSize(node.children || [])) : formatFileSize(node.size || 0)}
            </span>
          </span>
        </div>
        {isFolder && isExpanded && hasChildren && (
          <div className="tree-children">
            {node.children!.map((child, idx) =>
              renderNode(child, idx === node.children!.length - 1, prefix + (isLast ? '    ' : '│   '))
            )}
          </div>
        )}
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
          <span className="stat-value">{stats.totalFiles}</span>
          <span className="stat-label">파일</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{formatFileSize(stats.totalSize)}</span>
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

      {/* 트리 뷰 */}
      <div className="tree-container">
        {mappings.map((mapping, idx) => {
          const isExpanded = expandedPaths.has(mapping.folderName)
          const tree = buildTree(mapping.files, mapping.folderName)
          const isLast = idx === mappings.length - 1
          const isSelected = selectedFolders.has(mapping.folderName)

          return (
            <div key={mapping.folderName} className="tree-root">
              <div
                className={`tree-line root ${mapping.matched ? 'matched' : 'unmatched'} ${isSelected ? 'selected' : ''}`}
                onClick={() => togglePath(mapping.folderName)}
              >
                {/* 매칭된 폴더에만 체크박스 표시 */}
                {mapping.matched && (
                  <span
                    className={`tree-checkbox ${isSelected ? 'checked' : ''}`}
                    onClick={(e) => toggleSelection(mapping.folderName, e)}
                  >
                    {isSelected ? '☑' : '☐'}
                  </span>
                )}
                <span className="tree-prefix">{isLast ? '└── ' : '├── '}</span>
                <span className={`tree-toggle ${isExpanded ? 'expanded' : ''}`}>
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span className="tree-icon folder">📁</span>
                <span className="tree-name">{mapping.folderName}</span>
                {!mapping.matched && (
                  <span className="tree-badge unmatched">미매칭</span>
                )}
                <span className="tree-info">
                  <span className="tree-count">{mapping.fileCount}개</span>
                  <span className="tree-size">{formatFileSize(mapping.totalSize)}</span>
                </span>
              </div>
              {isExpanded && tree.length > 0 && (
                <div className="tree-children">
                  {tree.map((node, nodeIdx) =>
                    renderNode(node, nodeIdx === tree.length - 1, isLast ? '    ' : '│   ')
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 복원 상태 경고 */}
      {isRestored && (
        <div className="preview-warning restored">
          <SFSymbol name="arrow-clockwise" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
          <span>페이지가 새로고침되어 파일을 다시 선택해야 합니다. 뒤로 버튼을 눌러 폴더를 다시 드래그하세요.</span>
        </div>
      )}

      {/* 경고 */}
      {stats.unmatched > 0 && !isRestored && (
        <div className="preview-warning">
          <SFSymbol name="exclamationmark-triangle-fill" size={SFSymbolSize.FOOTNOTE} weight={SFSymbolWeight.MEDIUM} />
          <span>미매칭된 {stats.unmatched}개 폴더는 업로드되지 않습니다.</span>
        </div>
      )}

      {/* 버튼 */}
      <div className="preview-actions">
        <Button variant="secondary" onClick={onBack}>뒤로</Button>
        <Button variant="primary" onClick={handleStartUpload} disabled={!canUpload}>
          {isRestored
            ? '파일을 다시 선택하세요'
            : canUpload
              ? `${selectedCount}개 폴더 업로드 시작`
              : '업로드할 폴더를 선택하세요'}
        </Button>
      </div>
    </div>
  )
}
