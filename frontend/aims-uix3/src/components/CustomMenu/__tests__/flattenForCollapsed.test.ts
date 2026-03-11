/**
 * L2: flattenForCollapsed 순수 함수 단위 테스트 (13개)
 *
 * Phase 1: 테스트만 작성 (함수는 Phase 2에서 구현)
 * Phase 2 이후 실행하여 변환 함수의 정확성을 검증
 */
import { describe, it, expect } from 'vitest'

// Phase 2에서 구현 후 import 활성화
// import { flattenForCollapsed } from '../menuUtils'

// MenuItem 타입과 동일 구조의 mock (ReactNode icon은 문자열로 대체)
interface MockMenuItem {
  key: string
  icon: string
  label: string | object
  tooltipTitle: string
  children?: MockMenuItem[]
}

// ─── 테스트 데이터 ───
const standaloneItem: MockMenuItem = {
  key: 'autoclicker',
  icon: 'icon-auto',
  label: '메트 PDF 자동 받기',
  tooltipTitle: '메트 PDF 자동 받기',
}

const searchResultItem: MockMenuItem = {
  key: 'search-results',
  icon: 'icon-search',
  label: '검색 결과 (5개)',
  tooltipTitle: '검색 결과 (5개)',
}

const parentWithChildren: MockMenuItem = {
  key: 'quick-actions',
  icon: 'icon-bolt',
  label: '빠른 작업',
  tooltipTitle: '빠른 작업',
  children: [
    {
      key: 'documents-register',
      icon: 'icon-doc',
      label: '고객·계약·문서 등록',
      tooltipTitle: 'AR 업로드 시 고객 자동 추출/연결',
    },
    {
      key: 'customers-register',
      icon: 'icon-person',
      label: '고객 수동등록',
      tooltipTitle: '고객 정보를 직접 입력합니다',
    },
  ],
}

const parentWithNoOverrideChildren: MockMenuItem = {
  key: 'customers',
  icon: 'icon-user',
  label: '고객',
  tooltipTitle: '고객',
  children: [
    {
      key: 'customers-all',
      icon: 'icon-list',
      label: '전체 고객 보기',
      tooltipTitle: '모든 고객을 보여줍니다',
    },
  ],
}

const emptyChildrenParent: MockMenuItem = {
  key: 'empty-parent',
  icon: 'icon-empty',
  label: '빈 부모',
  tooltipTitle: '빈 부모',
  children: [],
}

// ─── 테스트 (Phase 2 구현 후 활성화) ───
describe('flattenForCollapsed', () => {
  // Phase 2에서 import 후 skip 제거
  // 현재는 테스트 구조만 확인

  it.todo('#1: collapsed=false → 원본 그대로 반환 (참조 동일)')
  // const items = [standaloneItem, parentWithChildren]
  // const result = flattenForCollapsed(items, false)
  // expect(result).toBe(items) // 참조 동일 (=== 비교)

  it.todo('#2: collapsed=true, 단독 항목 — label:\'\', tooltipTitle 원본 유지')
  // const result = flattenForCollapsed([standaloneItem], true)
  // expect(result).toEqual([{
  //   ...standaloneItem,
  //   children: undefined,
  //   label: '',
  // }])
  // expect(result[0].tooltipTitle).toBe('메트 PDF 자동 받기')

  it.todo('#3: collapsed=true, 부모+자식 → 부모(children:undefined, label:\'\') + 자식(label:\'\')')
  // const result = flattenForCollapsed([parentWithChildren], true)
  // expect(result).toHaveLength(3) // 부모1 + 자식2
  // expect(result[0]).toEqual({ ...parentWithChildren, children: undefined, label: '' })
  // expect(result[1].key).toBe('documents-register')
  // expect(result[1].label).toBe('')
  // expect(result[2].key).toBe('customers-register')
  // expect(result[2].label).toBe('')

  it.todo('#4: collapsed=true, 결과 순서 — 부모→자식1→자식2→다음부모→...')
  // const items = [standaloneItem, parentWithChildren, parentWithNoOverrideChildren]
  // const result = flattenForCollapsed(items, true)
  // const keys = result.map(r => r.key)
  // expect(keys).toEqual([
  //   'autoclicker',
  //   'quick-actions', 'documents-register', 'customers-register',
  //   'customers', 'customers-all',
  // ])

  it.todo('#5: collapsed=true, COLLAPSED_TOOLTIP_OVERRIDES 적용')
  // const result = flattenForCollapsed([parentWithChildren], true)
  // expect(result[1].tooltipTitle).toBe('고객·계약·문서 등록') // override 적용
  // expect(result[2].tooltipTitle).toBe('고객 수동등록')        // override 적용

  it.todo('#6: collapsed=true, override 없는 자식 — tooltipTitle 원본 유지')
  // const result = flattenForCollapsed([parentWithNoOverrideChildren], true)
  // expect(result[1].tooltipTitle).toBe('모든 고객을 보여줍니다') // override 없으므로 원본

  it.todo('#7: collapsed=true, 부모의 tooltipTitle — override 미적용')
  // const result = flattenForCollapsed([parentWithChildren], true)
  // expect(result[0].tooltipTitle).toBe('빠른 작업') // 부모는 map에 없으므로 원본

  it.todo('#8: collapsed=true, 단독 항목의 동적 tooltipTitle 보존')
  // const result = flattenForCollapsed([searchResultItem], true)
  // expect(result[0].tooltipTitle).toBe('검색 결과 (5개)') // 동적 원본 유지

  it.todo('#9: 빈 배열 입력 → [] 반환')
  // const result = flattenForCollapsed([], true)
  // expect(result).toEqual([])

  it.todo('#10: children이 빈 배열인 부모 → 부모만 포함, 자식 없음')
  // const result = flattenForCollapsed([emptyChildrenParent], true)
  // expect(result).toHaveLength(1)
  // expect(result[0].key).toBe('empty-parent')
  // expect(result[0].children).toBeUndefined()

  it.todo('#11: 혼합 — 전체 순서와 값 정확')
  // const items = [standaloneItem, parentWithChildren, parentWithNoOverrideChildren]
  // const result = flattenForCollapsed(items, true)
  // expect(result.map(r => r.key)).toEqual([
  //   'autoclicker',
  //   'quick-actions', 'documents-register', 'customers-register',
  //   'customers', 'customers-all',
  // ])

  it.todo('#12: 결과 배열 길이 = 단독 수 + 부모 수 + 자식 수')
  // const items = [standaloneItem, parentWithChildren, parentWithNoOverrideChildren]
  // const result = flattenForCollapsed(items, true)
  // // 단독1 + 부모2 + 자식(2+1) = 6
  // expect(result).toHaveLength(6)

  it.todo('#13: spread가 원본 객체를 변경하지 않음')
  // const original = { ...parentWithChildren, children: [...parentWithChildren.children!] }
  // flattenForCollapsed([parentWithChildren], true)
  // expect(parentWithChildren.children).toHaveLength(2) // 원본 children 유지
  // expect(parentWithChildren.label).toBe('빠른 작업')  // 원본 label 유지
})
