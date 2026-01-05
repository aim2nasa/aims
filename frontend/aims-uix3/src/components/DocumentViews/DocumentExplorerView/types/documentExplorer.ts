/**
 * 문서 탐색기 타입 정의
 * @description 윈도우 탐색기 스타일의 트리 뷰를 위한 타입들
 */

import type { Document } from '@/types/documentStatus'

/**
 * 문서 분류 기준
 */
export type DocumentGroupBy = 'customer' | 'badgeType' | 'tag' | 'date' | 'customerTag'

/**
 * 빠른 필터 타입
 */
export type QuickFilterType = 'none' | 'today' | 'thisWeek'

/**
 * 초성 필터 타입 (한글/영문/숫자)
 */
export type InitialType = 'korean' | 'alphabet' | 'number'

/**
 * 한글 초성 목록
 */
export const KOREAN_INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const

/**
 * 영문 알파벳 목록
 */
export const ALPHABET_INITIALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'] as const

/**
 * 숫자 초성 목록
 */
export const NUMBER_INITIALS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * 빠른 필터 라벨
 */
export const QUICK_FILTER_LABELS: Record<QuickFilterType, string> = {
  none: '전체',
  today: '오늘',
  thisWeek: '이번주',
}

/**
 * 문서 정렬 기준
 */
export type DocumentSortBy = 'name' | 'date' | 'badgeType' | 'customer'

/**
 * 정렬 방향
 */
export type SortDirection = 'asc' | 'desc'

/**
 * 정렬 기준별 라벨
 */
export const SORT_BY_LABELS: Record<DocumentSortBy, string> = {
  name: '제목',
  date: '날짜',
  badgeType: '유형',
  customer: '고객명',
}

/**
 * 분류 기준별 라벨
 */
export const GROUP_BY_LABELS: Record<DocumentGroupBy, string> = {
  customer: '고객',
  badgeType: '문서유형별',
  tag: '태그별',
  date: '날짜별',
  customerTag: '고객>태그별',
}

/**
 * 트리 노드 타입
 */
export type TreeNodeType = 'group' | 'subgroup' | 'document'

/**
 * 문서 트리 노드
 */
export interface DocumentTreeNode {
  /** 고유 키 (확장 상태 추적용) */
  key: string
  /** 표시 라벨 */
  label: string
  /** 노드 타입 */
  type: TreeNodeType
  /** SF Symbol 아이콘 이름 */
  icon?: string
  /** 하위 문서 수 (그룹 노드만) */
  count?: number
  /** 자식 노드 */
  children?: DocumentTreeNode[]
  /** 실제 문서 데이터 (리프 노드만) */
  document?: Document
  /** 추가 메타데이터 */
  metadata?: {
    customerId?: string
    customerType?: 'personal' | 'corporate'
    badgeType?: 'TXT' | 'OCR' | 'BIN'
    tag?: string
    year?: number
    month?: number
    /** 특수 폴더 여부 (태그 없음, 기타 등) */
    isSpecial?: boolean
    /** 업로드 날짜 (날짜별 분류 시) */
    uploadedAt?: string
  }
}

/**
 * 트리 데이터 빌드 결과
 */
export interface DocumentTreeData {
  /** 루트 노드들 */
  nodes: DocumentTreeNode[]
  /** 전체 문서 수 */
  totalDocuments: number
  /** 그룹 통계 */
  groupStats: {
    groupCount: number
    subgroupCount?: number
  }
}

/**
 * 문서 탐색기 상태
 */
export interface DocumentExplorerState {
  /** 현재 분류 기준 */
  groupBy: DocumentGroupBy
  /** 확장된 노드 키 집합 */
  expandedKeys: Set<string>
  /** 검색어 */
  searchTerm: string
  /** 선택된 문서 ID */
  selectedDocumentId: string | null
  /** 모두 펼침 상태 */
  isAllExpanded: boolean
}
