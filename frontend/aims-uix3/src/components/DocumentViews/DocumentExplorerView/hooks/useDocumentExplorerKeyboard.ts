/**
 * useDocumentExplorerKeyboard Hook
 * @description 문서 탐색기 키보드 네비게이션
 *
 * 키 동작:
 * - ↑↓: 이전/다음 노드로 이동
 * - Enter: 프리뷰 열기 (싱글클릭)
 * - Space: 모달 프리뷰 (더블클릭)
 * - ←: 폴더 접기 / 부모 폴더로 이동
 * - →: 폴더 펼치기 / 첫 자식으로 이동
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { DocumentTreeNode } from '../types/documentExplorer'
import type { Document } from '@/types/documentStatus'

export interface FlattenedNode {
  node: DocumentTreeNode
  parentKey: string | null
  level: number
}

export interface UseDocumentExplorerKeyboardOptions {
  nodes: DocumentTreeNode[]
  expandedKeys: Set<string>
  selectedDocumentId: string | null
  onToggleNode: (key: string) => void
  onDocumentClick: (doc: Document) => void
  onDocumentDoubleClick: (doc: Document) => void
}

export interface UseDocumentExplorerKeyboardResult {
  focusedKey: string | null
  setFocusedKey: (key: string | null) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  flattenedNodes: FlattenedNode[]
}

/**
 * 트리 노드를 평탄화하여 순차적 탐색 가능하게 변환
 */
function flattenTree(
  nodes: DocumentTreeNode[],
  expandedKeys: Set<string>,
  parentKey: string | null = null,
  level: number = 0
): FlattenedNode[] {
  const result: FlattenedNode[] = []

  for (const node of nodes) {
    result.push({ node, parentKey, level })

    // 그룹 노드가 펼쳐져 있으면 자식도 포함
    if (node.type !== 'document' && expandedKeys.has(node.key) && node.children) {
      result.push(...flattenTree(node.children, expandedKeys, node.key, level + 1))
    }
  }

  return result
}

export function useDocumentExplorerKeyboard({
  nodes,
  expandedKeys,
  selectedDocumentId,
  onToggleNode,
  onDocumentClick,
  onDocumentDoubleClick,
}: UseDocumentExplorerKeyboardOptions): UseDocumentExplorerKeyboardResult {
  // 포커스된 노드 키 (항상 유효한 값 유지)
  const [focusedKeyState, setFocusedKeyState] = useState<string | null>(null)
  const focusedKeyRef = useRef<string | null>(null)

  // 트리를 평탄화
  const flattenedNodes = useMemo(
    () => flattenTree(nodes, expandedKeys),
    [nodes, expandedKeys]
  )

  // flattenedNodes를 ref로 추적 (useEffect에서 의존성 없이 최신 값 참조)
  const flattenedNodesRef = useRef(flattenedNodes)
  flattenedNodesRef.current = flattenedNodes

  // 포커스 키 계산 (항상 유효한 값 반환)
  const focusedKey = useMemo(() => {
    if (flattenedNodes.length === 0) return null

    // 1. 현재 state가 유효하면 사용
    if (focusedKeyState && flattenedNodes.some(fn => fn.node.key === focusedKeyState)) {
      return focusedKeyState
    }

    // 2. ref가 유효하면 사용
    if (focusedKeyRef.current && flattenedNodes.some(fn => fn.node.key === focusedKeyRef.current)) {
      return focusedKeyRef.current
    }

    // 3. selectedDocumentId fallback 제거 — useEffect에서 단일 처리
    // (flattenedNodes 변경 시마다 이전 선택 문서로 포커스가 되돌아가는 버그 방지)

    // 4. 첫 번째 노드로 폴백
    return flattenedNodes[0].node.key
  }, [flattenedNodes, focusedKeyState])

  // focusedKey가 변경되면 ref와 state 동기화
  useEffect(() => {
    if (focusedKey && focusedKey !== focusedKeyRef.current) {
      focusedKeyRef.current = focusedKey
    }
  }, [focusedKey])

  // selectedDocumentId 변경 시 해당 문서로 포커스 이동 (검색 시 자동 포커스)
  // 주의: flattenedNodes를 의존성에서 제거 — ref로 참조
  // flattenedNodes가 의존성에 있으면, 다른 폴더 토글 시에도 이전 선택 문서로
  // 포커스가 되돌아가는 버그 발생 (스크롤이 엉뚱한 문서로 점프)
  useEffect(() => {
    if (!selectedDocumentId) return

    const currentNodes = flattenedNodesRef.current
    const selectedNode = currentNodes.find(
      fn => fn.node.document?._id === selectedDocumentId || fn.node.document?.id === selectedDocumentId
    )
    if (selectedNode) {
      focusedKeyRef.current = selectedNode.node.key
      setFocusedKeyState(selectedNode.node.key)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocumentId])

  // 포커스 설정 함수
  const setFocusedKey = useCallback((key: string | null) => {
    focusedKeyRef.current = key
    setFocusedKeyState(key)
  }, [])

  // 특정 인덱스의 노드로 포커스 이동
  const focusNode = useCallback((index: number) => {
    if (index < 0 || index >= flattenedNodes.length) return

    const node = flattenedNodes[index].node
    setFocusedKey(node.key)
  }, [flattenedNodes, setFocusedKey])

  // 키보드 이벤트 핸들러
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 입력 필드에서는 무시
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      const currentIndex = flattenedNodes.findIndex(fn => fn.node.key === focusedKey)
      if (currentIndex === -1) return

      const currentNode = flattenedNodes[currentIndex]

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          if (currentIndex > 0) {
            focusNode(currentIndex - 1)
          }
          break
        }

        case 'ArrowDown': {
          e.preventDefault()
          if (currentIndex < flattenedNodes.length - 1) {
            focusNode(currentIndex + 1)
          }
          break
        }

        case 'ArrowLeft': {
          e.preventDefault()
          if (currentNode.node.type !== 'document') {
            // 그룹 노드: 펼쳐져 있으면 접기, 이미 접혀있으면 부모로 이동
            if (expandedKeys.has(currentNode.node.key)) {
              onToggleNode(currentNode.node.key)
            } else if (currentNode.parentKey) {
              // 부모 노드로 포커스 이동
              const parentIndex = flattenedNodes.findIndex(
                fn => fn.node.key === currentNode.parentKey
              )
              if (parentIndex !== -1) {
                focusNode(parentIndex)
              }
            }
          } else {
            // 문서 노드: 부모 그룹으로 이동
            if (currentNode.parentKey) {
              const parentIndex = flattenedNodes.findIndex(
                fn => fn.node.key === currentNode.parentKey
              )
              if (parentIndex !== -1) {
                focusNode(parentIndex)
              }
            }
          }
          break
        }

        case 'ArrowRight': {
          e.preventDefault()
          if (currentNode.node.type !== 'document') {
            // 그룹 노드: 접혀있으면 펼치기, 펼쳐져 있으면 첫 자식으로 이동
            if (!expandedKeys.has(currentNode.node.key)) {
              onToggleNode(currentNode.node.key)
            } else if (currentIndex < flattenedNodes.length - 1) {
              // 다음 노드가 자식이면 이동
              const nextNode = flattenedNodes[currentIndex + 1]
              if (nextNode.parentKey === currentNode.node.key) {
                focusNode(currentIndex + 1)
              }
            }
          }
          break
        }

        case 'Enter': {
          e.preventDefault()
          if (currentNode.node.type === 'document' && currentNode.node.document) {
            // 문서 노드: 싱글클릭 (RightPane 프리뷰)
            onDocumentClick(currentNode.node.document)
          } else {
            // 그룹 노드: 토글
            onToggleNode(currentNode.node.key)
          }
          break
        }

        case ' ': {
          e.preventDefault()
          if (currentNode.node.type === 'document' && currentNode.node.document) {
            // 문서 노드: 더블클릭 (모달 프리뷰)
            onDocumentDoubleClick(currentNode.node.document)
          } else {
            // 그룹 노드: 토글
            onToggleNode(currentNode.node.key)
          }
          break
        }

        case 'Home': {
          e.preventDefault()
          if (flattenedNodes.length > 0) {
            focusNode(0)
          }
          break
        }

        case 'End': {
          e.preventDefault()
          if (flattenedNodes.length > 0) {
            focusNode(flattenedNodes.length - 1)
          }
          break
        }
      }
    },
    [flattenedNodes, focusedKey, expandedKeys, focusNode, onToggleNode, onDocumentClick, onDocumentDoubleClick]
  )

  return {
    focusedKey,
    setFocusedKey,
    handleKeyDown,
    flattenedNodes,
  }
}
