import type { MenuItem } from '../components/CustomMenu/CustomMenu'

/**
 * AIMS UIX3 네비게이션 유틸리티
 *
 * CustomMenu에서 사용하는 네비게이션 관련 유틸리티 함수들
 * Document-Controller-View 아키텍처 준수
 */

/**
 * 메뉴 아이템 배열에서 네비게이션 가능한 모든 키를 추출
 *
 * @param items 메뉴 아이템 배열
 * @param collapsed 축소 모드 여부
 * @param expandedKeys 현재 펼쳐진 메뉴 키 배열
 * @returns 네비게이션 가능한 키 배열 (순서대로)
 */
export const getAllNavigableKeys = (
  items: MenuItem[],
  collapsed: boolean = false,
  expandedKeys: string[] = []
): string[] => {
  const navigableKeys: string[] = []

  const extractKeys = (menuItems: MenuItem[], level: number = 0) => {
    menuItems.forEach(item => {
      // 메인 메뉴 항목은 항상 네비게이션 가능
      navigableKeys.push(item.key)

      // 서브메뉴 처리
      if (item.children && item.children.length > 0) {
        // collapsed 모드가 아니고, 현재 메뉴가 펼쳐져 있을 때만 서브메뉴 포함
        if (!collapsed && expandedKeys.includes(item.key)) {
          extractKeys(item.children, level + 1)
        }
      }
    })
  }

  extractKeys(items)
  return navigableKeys
}

/**
 * 특정 키가 네비게이션 가능한지 확인
 *
 * @param key 확인할 메뉴 키
 * @param navigableKeys 네비게이션 가능한 키 배열
 * @returns 네비게이션 가능 여부
 */
export const isNavigableKey = (key: string, navigableKeys: string[]): boolean => {
  return navigableKeys.includes(key)
}

/**
 * 메뉴 구조에서 특정 키의 깊이 계산
 *
 * @param items 메뉴 아이템 배열
 * @param targetKey 찾을 메뉴 키
 * @returns 메뉴 깊이 (0: 루트, 1: 1단계 서브메뉴, ...)
 */
export const getMenuDepth = (items: MenuItem[], targetKey: string): number => {
  const findDepth = (menuItems: MenuItem[], depth: number = 0): number => {
    for (const item of menuItems) {
      if (item.key === targetKey) {
        return depth
      }

      if (item.children && item.children.length > 0) {
        const childDepth = findDepth(item.children, depth + 1)
        if (childDepth !== -1) {
          return childDepth
        }
      }
    }
    return -1 // 찾지 못함
  }

  return findDepth(items)
}

/**
 * 메뉴 키에서 부모 메뉴 키 찾기
 *
 * @param items 메뉴 아이템 배열
 * @param targetKey 자식 메뉴 키
 * @returns 부모 메뉴 키 (없으면 null)
 */
export const getParentKey = (items: MenuItem[], targetKey: string): string | null => {
  const findParent = (menuItems: MenuItem[], parentKey: string | null = null): string | null => {
    for (const item of menuItems) {
      if (item.key === targetKey) {
        return parentKey
      }

      if (item.children && item.children.length > 0) {
        const result = findParent(item.children, item.key)
        if (result !== null) {
          return result
        }
      }
    }
    return null
  }

  return findParent(items)
}

/**
 * 특정 메뉴의 모든 자식 키 추출
 *
 * @param items 메뉴 아이템 배열
 * @param parentKey 부모 메뉴 키
 * @returns 자식 메뉴 키 배열
 */
export const getChildKeys = (items: MenuItem[], parentKey: string): string[] => {
  const findChildren = (menuItems: MenuItem[]): string[] => {
    for (const item of menuItems) {
      if (item.key === parentKey) {
        return item.children ? item.children.map(child => child.key) : []
      }

      if (item.children && item.children.length > 0) {
        const result = findChildren(item.children)
        if (result.length > 0) {
          return result
        }
      }
    }
    return []
  }

  return findChildren(items)
}