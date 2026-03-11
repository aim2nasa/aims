import type { MenuItem } from './CustomMenu'

/**
 * collapsed=true: 부모는 children:undefined + label:''로 변환,
 *                 자식은 부모 바로 뒤에 flat으로 추가 + label:''
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
