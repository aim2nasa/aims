import type { MenuItem } from './CustomMenu'

// 커밋 A 전용: 현재 불일치를 보존하기 위한 override map
// 커밋 B에서 이 상수와 관련 로직을 삭제하여 통일 완료
const COLLAPSED_TOOLTIP_OVERRIDES: Record<string, string> = {
  'documents-register': '고객·계약·문서 등록',
  'customers-register': '고객 수동등록',
  'documents-search': '상세 문서검색',
  'help-guide': '사용 가이드',
}

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
          tooltipTitle: COLLAPSED_TOOLTIP_OVERRIDES[child.key] ?? child.tooltipTitle,
        })
      }
    }
  }
  return result
}

export { COLLAPSED_TOOLTIP_OVERRIDES }
