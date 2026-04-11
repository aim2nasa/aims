/**
 * MappingPreview Component
 * @since 2025-12-05
 * @version 4.0.0 (2026-04-11 재설계 — 명시적 인식 기반 3상태 매핑)
 *
 * 폴더-고객 매핑 미리보기 (3상태 배타: direct / inherited / unmapped)
 * - 드롭 직후 모든 폴더는 unmapped
 * - [고객 지정] 버튼 → 드롭다운 → 명시적 매핑 확정 → direct
 * - direct 폴더의 자손은 자동으로 inherited
 * - 부모·자식 direct 공존 금지 (R3)
 * - [해제] → 즉시 unmapped 전환, 확인 모달 없음
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../components/SFSymbol'
import Button from '@/shared/ui/Button'
import { Tooltip } from '@/shared/ui/Tooltip'
import { formatFileSize } from '../utils/fileValidation'
import type { CustomerForMatching } from '../utils/customerMatcher'
import { canDirectMap, type DirectMapConflict } from '../utils/customerMatcher'
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

/* ========== 인라인 아이콘 (SF Symbol 스타일, 렌더 안정성을 위해 SVG로 직접 구현) ========== */

/** chevron.right — 접힘 상태 */
function IconChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M3.5 1.5L7 5L3.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** chevron.down — 펼침 상태 */
function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** folder — unmapped 폴더 아이콘 */
function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H5.5L6.75 4H11.5C12.0523 4 12.5 4.44772 12.5 5V10.5C12.5 11.0523 12.0523 11.5 11.5 11.5H2.5C1.94772 11.5 1.5 11.0523 1.5 10.5V3.5Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  )
}

/** link — inherited 체인 아이콘 */
function IconLink() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M5 8L8 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 7.5L3 9C2.17 9.83 2.17 11.17 3 12C3.83 12.83 5.17 12.83 6 12L7.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.5 5.5L10 4C10.83 3.17 10.83 1.83 10 1C9.17 0.17 7.83 0.17 7 1L5.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

/** arrow.turn.down.right — inherited 고객명 접두 */
function IconTurnDownRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 1.5V5.5C1.5 6.33 2.17 7 3 7H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5L8 7L6 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** plus.circle — 지정 버튼 아이콘 */
function IconPlusCircle() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 3.5V7.5M3.5 5.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** lock — disabled 지정 버튼 아이콘 */
function IconLock() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="7" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 5V3.5C3.5 2.4 4.4 1.5 5.5 1.5C6.6 1.5 7.5 2.4 7.5 3.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** exclamationmark.triangle — 경고 아이콘 */
function IconWarningTriangle() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1.5L11 10.5H1L6 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 5V7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.6" fill="currentColor" />
    </svg>
  )
}

interface MappingPreviewProps {
  mappings: FolderMapping[]
  customers?: CustomerForMatching[]
  /** 고객 지정/해제 콜백. customer=null이면 해제 */
  onMappingChange?: (folderPath: string, customer: CustomerForMatching | null) => void
  onBack: () => void
  onStartUpload: (selectedMappings: FolderMapping[]) => void
  expandedPaths?: Set<string>
  onExpandedPathsChange?: (paths: Set<string>) => void
}

export default function MappingPreview({
  mappings,
  customers,
  onMappingChange,
  onBack,
  onStartUpload,
  expandedPaths: controlledExpandedPaths,
  onExpandedPathsChange,
}: MappingPreviewProps) {
  // 수동 매핑 드롭다운 상태 (folderPath)
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
      // 드롭다운은 folderPath 기준으로 열려 있으므로 leaf name 추출
      const assigningMapping = mappings.find(m => m.folderPath === assigningFolder)
      const leafName = assigningMapping?.folderName ?? assigningFolder
      const folder = leafName.toLowerCase()
      const tokens = extractTokens(leafName)
      base.sort((a, b) => {
        const scoreA = getRelevanceScore(a.personal_info?.name || '', folder, tokens)
        const scoreB = getRelevanceScore(b.personal_info?.name || '', folder, tokens)
        return scoreB - scoreA
      })
    }

    return base
  }, [customers, searchQuery, assigningFolder, extractTokens, getRelevanceScore, mappings])

  // 현재 direct 매핑 Map (공존 금지 검증용)
  const directMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of mappings) {
      if (m.state === 'direct' && m.customerId) {
        map.set(m.folderPath, m.customerId)
      }
    }
    return map
  }, [mappings])

  // 고객 선택 핸들러
  const handleCustomerSelect = useCallback((folderPath: string, customer: CustomerForMatching) => {
    onMappingChange?.(folderPath, customer)
    setAssigningFolder(null)
    setSearchQuery('')
  }, [onMappingChange])

  // 매핑 해제 핸들러
  const handleUnassign = useCallback((folderPath: string) => {
    onMappingChange?.(folderPath, null)
  }, [onMappingChange])

  // 내부 펼침 상태 (controlled prop 없을 때 사용) — 루트들만 기본 펼침
  const [internalExpandedPaths, setInternalExpandedPaths] = useState<Set<string>>(() => {
    return new Set(mappings.filter(m => m.parentFolderPath === null).map(m => m.folderPath))
  })

  const expandedPaths = controlledExpandedPaths ?? internalExpandedPaths
  const setExpandedPaths = (onExpandedPathsChange ?? setInternalExpandedPaths) as React.Dispatch<React.SetStateAction<Set<string>>>

  // 모든 폴더 경로 수집 (전체 펼침/접기용)
  const allFolderPaths = useMemo(() => mappings.map(m => m.folderPath), [mappings])
  const allExpanded = expandedPaths.size === allFolderPaths.length && allFolderPaths.length > 0

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

  // ==================== 통계 ====================

  const stats = useMemo(() => {
    const directMappings = mappings.filter(m => m.state === 'direct')
    const unmapped = mappings.filter(m => m.state === 'unmapped')
    const uniqueCustomers = new Set(directMappings.map(m => m.customerId).filter(Boolean)).size
    const totalFiles = directMappings.reduce((sum, m) => sum + m.subtreeFileCount, 0)
    const totalSize = directMappings.reduce((sum, m) => sum + m.subtreeTotalSize, 0)
    const hasPlaceholder = mappings.some(m => m.isPlaceholder)

    return {
      directCount: directMappings.length,
      uniqueCustomers,
      unmappedCount: unmapped.length,
      totalFiles,
      totalSize,
      hasPlaceholder,
    }
  }, [mappings])

  const canUpload = stats.directCount > 0 && !stats.hasPlaceholder

  const handleStartUpload = useCallback(() => {
    // 업로드 단위 = direct 상태 매핑만
    const directMappings = mappings.filter(m => m.state === 'direct')
    onStartUpload(directMappings)
  }, [mappings, onStartUpload])

  // ==================== 트리 구축 (parent 기준 children 맵) ====================

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FolderMapping[]>()
    for (const m of mappings) {
      const key = m.parentFolderPath
      const list = map.get(key) || []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [mappings])

  // ==================== 노드 렌더링 ====================

  const renderMappingNode = useCallback((mapping: FolderMapping, depth: number, isLast: boolean): React.ReactNode => {
    const children = childrenByParent.get(mapping.folderPath) || []
    const hasChildren = children.length > 0 || mapping.directFiles.length > 0
    const isExpanded = expandedPaths.has(mapping.folderPath)
    const showAssignDropdown = assigningFolder === mapping.folderPath

    // 공존 금지 검증 (unmapped 행의 [고객 지정] 버튼용)
    // 참고: inherited 행은 [고객 지정] 버튼을 렌더하지 않으므로 조상 충돌은 주로 descendant 케이스에서 발생.
    //       다만 비정상 상태 방어를 위해 ancestor 메시지도 함께 제공한다.
    const guardResult: { ok: true } | { ok: false; conflicts: DirectMapConflict[] } =
      mapping.state === 'unmapped' ? canDirectMap(mapping.folderPath, directMap) : { ok: true }
    const isGuarded = guardResult.ok === false
    let guardMessage = ''
    if (guardResult.ok === false) {
      const descendants = guardResult.conflicts.filter(c => c.type === 'descendant')
      const ancestors = guardResult.conflicts.filter(c => c.type === 'ancestor')

      if (ancestors.length > 0) {
        // 조상 방향 충돌 우선 안내 (상위 폴더가 이미 direct인 경우)
        const ancestorLeaf = ancestors[0].path.split('/').pop() || ancestors[0].path
        guardMessage = `상위 '${ancestorLeaf}' 폴더가 이미 지정되어 있습니다. 해제 후 지정할 수 있습니다`
      } else if (descendants.length > 0) {
        const leaves = descendants.map(c => c.path.split('/').pop() || c.path)
        if (leaves.length <= 3) {
          guardMessage = `하위 '${leaves.join("', '")}' 폴더에 매핑이 있습니다. 해제 후 지정할 수 있습니다`
        } else {
          guardMessage = `하위 '${leaves[0]}', '${leaves[1]}' 외 ${leaves.length - 2}개 폴더에 매핑이 있습니다. 해제 후 지정할 수 있습니다`
        }
      }
    }

    // 매핑된 고객의 customer_type 찾기
    const mappedCustomer = mapping.customerId && customers
      ? customers.find(c => c._id === mapping.customerId)
      : null

    const stateClass = `state-${mapping.state}`

    // inherited 행: 상속 출처(부모 중 customerId가 일치하는 direct 조상) 찾기
    let inheritedSourceLeaf = ''
    if (mapping.state === 'inherited' && mapping.customerId) {
      let cursor: string | null = mapping.parentFolderPath
      while (cursor) {
        const parent = mappings.find(m => m.folderPath === cursor)
        if (!parent) break
        if (parent.state === 'direct' && parent.customerId === mapping.customerId) {
          inheritedSourceLeaf = parent.folderName
          break
        }
        cursor = parent.parentFolderPath
      }
    }

    return (
      <div key={mapping.folderPath} className={`guide-node ${isLast ? 'last' : ''} has-children`} style={{ marginLeft: depth === 0 ? 0 : undefined }}>
        <div
          className={`guide-node-content customer-root ${stateClass}`}
          onClick={() => togglePath(mapping.folderPath)}
        >
          <span className="guide-toggle" aria-hidden="true">
            {hasChildren ? (isExpanded ? <IconChevronDown /> : <IconChevronRight />) : null}
          </span>

          {/* 아이콘 */}
          {mapping.state === 'direct' && mappedCustomer ? (
            <span className="guide-icon customer-icon">
              <CustomerTypeIcon customerType={mappedCustomer.insurance_info?.customer_type} />
            </span>
          ) : mapping.state === 'inherited' ? (
            <span className="guide-icon folder-inherited"><IconLink /></span>
          ) : (
            <span className="guide-icon folder"><IconFolder /></span>
          )}

          {/* 폴더명 */}
          <span className={`guide-name folder-label ${stateClass}`}>{mapping.folderName}</span>

          {/* 상태별 UI */}
          {mapping.state === 'direct' && (
            <>
              <span className="state-separator" aria-hidden="true">·</span>
              <span className="state-customer-type-icon" aria-hidden="true">
                {mappedCustomer && <CustomerTypeIcon customerType={mappedCustomer.insurance_info?.customer_type} />}
              </span>
              <span
                className="state-customer-name"
                onClick={(e) => {
                  e.stopPropagation()
                  // D3: direct 행의 고객명 재클릭 → 드롭다운 재오픈
                  setAssigningFolder(mapping.folderPath)
                  setSearchQuery('')
                }}
                role="button"
                tabIndex={0}
              >
                {mapping.customerName}
              </span>
              <span className="state-unassign-wrapper" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => handleUnassign(mapping.folderPath)}
                >
                  해제
                </Button>
              </span>
            </>
          )}

          {mapping.state === 'inherited' && (
            <>
              <span className="state-inherited-prefix" aria-hidden="true"><IconTurnDownRight /></span>
              <Tooltip content={inheritedSourceLeaf ? `상위 '${inheritedSourceLeaf}'에서 상속됨` : '상위 폴더에서 상속됨'} placement="top">
                <span className="state-inherited-customer">{mapping.customerName}</span>
              </Tooltip>
              {/* 접근성/테스트 호환: 상속 표식은 시각적으로 숨기고 DOM에 유지 */}
              <span className="state-inherited-note visually-hidden">(상속)</span>
            </>
          )}

          {mapping.state === 'unmapped' && customers && customers.length > 0 && onMappingChange && (
            <span className="state-assign-wrapper" onClick={(e) => e.stopPropagation()}>
              {isGuarded ? (
                <Tooltip content={guardMessage} placement="top" delay={300}>
                  <span className="state-assign-disabled-wrapper">
                    <Button
                      variant="link"
                      size="sm"
                      disabled
                      aria-label="고객 지정"
                      className="assign-link-btn assign-link-btn--disabled"
                      leftIcon={<IconLock />}
                    >
                      지정 불가
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  aria-label="고객 지정"
                  className="assign-link-btn"
                  leftIcon={<IconPlusCircle />}
                  onClick={() => {
                    setAssigningFolder(prev => prev === mapping.folderPath ? null : mapping.folderPath)
                    setSearchQuery('')
                  }}
                >
                  지정
                </Button>
              )}
            </span>
          )}

          {/* 통계 (D6: direct는 subtree, 나머지는 direct 파일만) */}
          <span className="guide-info">
            {mapping.state === 'direct'
              ? `${mapping.subtreeFileCount}개 · ${formatFileSize(mapping.subtreeTotalSize)}`
              : `${mapping.directFileCount}개 · ${formatFileSize(mapping.directTotalSize)}`
            }
          </span>
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
                filteredCustomers.map(customer => {
                  // D2: 동명이인 구분 (생년월일 → 전화번호 마스킹)
                  const sameName = filteredCustomers.filter(c => c.personal_info?.name === customer.personal_info?.name)
                  const distinguisher = sameName.length > 1
                    ? (customer.personal_info?.birth_date
                        ? ` (${customer.personal_info.birth_date})`
                        : customer.personal_info?.phone
                          ? ` (${customer.personal_info.phone.slice(0, 3)}-****-${customer.personal_info.phone.slice(-4)})`
                          : '')
                    : ''
                  return (
                    <div
                      key={customer._id}
                      className="customer-search-item"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCustomerSelect(mapping.folderPath, customer)
                      }}
                    >
                      <span className="customer-type-icon">
                        <CustomerTypeIcon customerType={customer.insurance_info?.customer_type} />
                      </span>
                      <span>{customer.personal_info?.name || '(이름 없음)'}{distinguisher}</span>
                    </div>
                  )
                })
              ) : (
                <div className="customer-search-empty">검색 결과가 없습니다</div>
              )}
            </div>
          </div>
        )}

        {/* 자식 노드 재귀 렌더 */}
        {isExpanded && children.length > 0 && children.map((child, idx) =>
          renderMappingNode(child, depth + 1, idx === children.length - 1)
        )}

        {/* 자기 직하 파일 (펼침 상태에서만) */}
        {isExpanded && mapping.directFiles.length > 0 && mapping.directFiles.map((file, idx) => {
          const isLastFile = idx === mapping.directFiles.length - 1 && children.length === 0
          return (
            <div key={`${mapping.folderPath}/__file__/${file.name}`} className={`guide-node ${isLastFile ? 'last' : ''}`}>
              <div className="guide-node-content">
                <span className="guide-icon file">📄</span>
                <span className="guide-name file">{file.name}</span>
                <span className="guide-info">{formatFileSize(file.size)}</span>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [childrenByParent, expandedPaths, assigningFolder, searchQuery, customers, onMappingChange, directMap, filteredCustomers, togglePath, handleCustomerSelect, handleUnassign])

  // 루트 노드들
  const rootMappings = useMemo(() => childrenByParent.get(null) || [], [childrenByParent])

  return (
    <div className="mapping-preview">
      {/* 상단 요약 (v5: 중립 톤 + 미매핑 경고 보조 라인) */}
      <div
        className="preview-summary"
        data-ready={stats.unmappedCount === 0 && stats.directCount > 0 ? 'true' : undefined}
      >
        업로드 대상: <strong>{stats.directCount}개 폴더</strong> · <strong>{stats.uniqueCustomers}명 고객</strong> · <strong>{stats.totalFiles}개 파일</strong> · <strong>{formatFileSize(stats.totalSize)}</strong>
        {stats.unmappedCount > 0 && (
          <span className="preview-summary-warn">
            <IconWarningTriangle />
            <span>미매핑 {stats.unmappedCount}개는 업로드되지 않습니다</span>
          </span>
        )}
      </div>

      {/* 트리 헤더 */}
      <div className="tree-header">
        <div className="tree-header-left">
          <span>폴더 구조</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
          {allExpanded ? '모두 접기' : '모두 펼치기'}
        </Button>
      </div>

      {/* 트리 뷰 */}
      <div className="tree-container">
        <div className="guide-node root">
          {rootMappings.map((mapping, idx) =>
            renderMappingNode(mapping, 0, idx === rootMappings.length - 1)
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

      {/* 버튼 */}
      <div className="preview-actions">
        <Button variant="secondary" onClick={onBack}>뒤로</Button>
        <Button variant="primary" onClick={handleStartUpload} disabled={!canUpload}>
          {stats.hasPlaceholder
            ? '폴더 다시 선택 필요'
            : canUpload
              ? `${stats.directCount}개 폴더 업로드 시작`
              : '고객을 지정해주세요'}
        </Button>
      </div>
    </div>
  )
}
