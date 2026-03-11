import type { MenuItem } from './CustomMenu'

// S-2: collapsed 모드에서 그룹 구분선을 표시할 부모 키 목록
const GROUP_SEPARATOR_KEYS = new Set(['quick-actions', 'customers', 'contracts', 'documents', 'help'])

/**
 * collapsed=true: 부모는 children:undefined + label:''로 변환,
 *                 자식은 부모 바로 뒤에 flat으로 추가 + label:''
 *                 그룹 시작 부모에 isGroupStart 플래그 추가 (S-2)
 * collapsed=false: 원본 그대로 반환
 */
export function flattenForCollapsed(
  items: MenuItem[],
  collapsed: boolean
): MenuItem[] {
  if (!collapsed) return items

  const result: MenuItem[] = []
  for (const item of items) {
    // 부모 항목: children 제거, label 빈 문자열
    result.push({
      ...item,
      children: undefined,
      label: '',
      isGroupStart: GROUP_SEPARATOR_KEYS.has(item.key),
    })
    // 자식 항목: 부모 바로 뒤에 flat으로 추가
    if (item.children) {
      for (const child of item.children) {
        result.push({
          ...child,
          label: '',
        })
      }
    }
  }
  return result
}
