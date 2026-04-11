/**
 * 폴더 트리 + 3상태 매핑 계산 테스트
 * @since 2026-04-11
 * @version 4.0.0 (재설계 — 명시적 인식 기반 / 3상태 / 공존 금지 불변식)
 */

import { describe, test, expect } from 'vitest'
import {
  buildFolderTree,
  computeFolderMappings,
  canDirectMap,
  releaseDirectMapping,
  flattenTree,
  type CustomerForMatching,
} from '../customerMatcher'

/** 테스트용 고객 데이터 */
const mockCustomers: CustomerForMatching[] = [
  { _id: 'c1', personal_info: { name: '홍길동' } },
  { _id: 'c2', personal_info: { name: '김철수' } },
  { _id: 'c3', personal_info: { name: '한울컨설팅' } },
]

/** webkitRelativePath를 가진 File 헬퍼 */
function mkFile(relativePath: string, size = 1024): File {
  const name = relativePath.split('/').pop() || 'file'
  const file = new File(['x'.repeat(size)], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, writable: false })
  return file
}

describe('buildFolderTree', () => {
  test('파일 배열을 계층 트리로 변환한다', () => {
    const files = [
      mkFile('한울/재무제표.pdf'),
      mkFile('한울/하위A/파일1.pdf'),
      mkFile('한울/하위A/파일2.pdf'),
      mkFile('한울/하위B/파일3.pdf'),
    ]

    const roots = buildFolderTree(files)

    expect(roots).toHaveLength(1)
    expect(roots[0].folderPath).toBe('한울')
    expect(roots[0].folderName).toBe('한울')
    expect(roots[0].parentFolderPath).toBeNull()
    expect(roots[0].directFiles).toHaveLength(1) // 재무제표.pdf
    expect(roots[0].children).toHaveLength(2)

    const 하위A = roots[0].children.find(c => c.folderName === '하위A')
    expect(하위A).toBeDefined()
    expect(하위A?.directFiles).toHaveLength(2)
    expect(하위A?.parentFolderPath).toBe('한울')
  })

  test('복수 루트 폴더를 처리한다', () => {
    const files = [
      mkFile('홍길동/보험증권.pdf'),
      mkFile('김철수/계약서.docx'),
    ]
    const roots = buildFolderTree(files)
    expect(roots).toHaveLength(2)
    const names = roots.map(r => r.folderName).sort()
    expect(names).toEqual(['김철수', '홍길동'])
  })

  test('webkitRelativePath 없는 파일은 스킵한다', () => {
    const orphan = new File(['test'], 'orphan.pdf')
    const files = [orphan, mkFile('한울/파일.pdf')]
    const roots = buildFolderTree(files)
    expect(roots).toHaveLength(1)
    expect(roots[0].folderName).toBe('한울')
  })

  test('빈 파일 배열은 빈 루트를 반환한다', () => {
    expect(buildFolderTree([])).toEqual([])
  })

  test('3레벨 이상의 깊은 계층도 처리한다', () => {
    const files = [
      mkFile('루트/레벨1/레벨2/파일.pdf'),
    ]
    const roots = buildFolderTree(files)
    expect(roots).toHaveLength(1)
    expect(roots[0].folderName).toBe('루트')
    expect(roots[0].children[0].folderName).toBe('레벨1')
    expect(roots[0].children[0].children[0].folderName).toBe('레벨2')
    expect(roots[0].children[0].children[0].directFiles).toHaveLength(1)
  })
})

describe('computeFolderMappings', () => {
  test('드롭 직후 모든 폴더는 unmapped 상태다 (자동 매칭 없음)', () => {
    const files = [
      mkFile('홍길동/a.pdf'),
      mkFile('김철수/b.pdf'),
    ]
    const tree = buildFolderTree(files)
    const mappings = computeFolderMappings(tree, new Map(), mockCustomers)

    expect(mappings).toHaveLength(2)
    for (const m of mappings) {
      expect(m.state).toBe('unmapped')
      expect(m.customerId).toBeNull()
      expect(m.customerName).toBeNull()
      expect(m.inheritedFromPath).toBeNull()
    }
  })

  test('direct 매핑 → 해당 폴더 state=direct + 자손 state=inherited', () => {
    const files = [
      mkFile('한울/재무.pdf'),
      mkFile('한울/하위/파일1.pdf'),
      mkFile('한울/하위/파일2.pdf'),
    ]
    const tree = buildFolderTree(files)
    const directMap = new Map([['한울', 'c3']])
    const mappings = computeFolderMappings(tree, directMap, mockCustomers)

    const 한울 = mappings.find(m => m.folderPath === '한울')
    const 하위 = mappings.find(m => m.folderPath === '한울/하위')

    expect(한울?.state).toBe('direct')
    expect(한울?.customerId).toBe('c3')
    expect(한울?.customerName).toBe('한울컨설팅')
    expect(한울?.inheritedFromPath).toBeNull()

    expect(하위?.state).toBe('inherited')
    expect(하위?.customerId).toBe('c3')
    expect(하위?.customerName).toBe('한울컨설팅')
    expect(하위?.inheritedFromPath).toBe('한울')
  })

  test('subtreeFiles는 direct 폴더 기준으로 자기 + 전체 하위를 포함한다', () => {
    const files = [
      mkFile('한울/재무.pdf', 100),
      mkFile('한울/하위A/파일1.pdf', 200),
      mkFile('한울/하위A/파일2.pdf', 300),
      mkFile('한울/하위B/파일3.pdf', 400),
    ]
    const tree = buildFolderTree(files)
    const mappings = computeFolderMappings(tree, new Map([['한울', 'c3']]), mockCustomers)

    const 한울 = mappings.find(m => m.folderPath === '한울')
    expect(한울?.subtreeFileCount).toBe(4)
    expect(한울?.subtreeTotalSize).toBe(1000)
    expect(한울?.directFileCount).toBe(1) // 자기 직하만
    expect(한울?.directTotalSize).toBe(100)
  })

  test('상속 체인은 가장 가까운 direct 조상을 찾는다', () => {
    const files = [
      mkFile('A/B/C/D/파일.pdf'),
    ]
    const tree = buildFolderTree(files)
    // B를 direct로 지정
    const mappings = computeFolderMappings(tree, new Map([['A/B', 'c1']]), mockCustomers)

    const A = mappings.find(m => m.folderPath === 'A')
    const AB = mappings.find(m => m.folderPath === 'A/B')
    const ABC = mappings.find(m => m.folderPath === 'A/B/C')
    const ABCD = mappings.find(m => m.folderPath === 'A/B/C/D')

    expect(A?.state).toBe('unmapped')
    expect(AB?.state).toBe('direct')
    expect(ABC?.state).toBe('inherited')
    expect(ABC?.inheritedFromPath).toBe('A/B')
    expect(ABCD?.state).toBe('inherited')
    expect(ABCD?.inheritedFromPath).toBe('A/B')
  })

  test('direct 해제 시 하위 inherited도 unmapped로 돌아간다', () => {
    const files = [
      mkFile('한울/재무.pdf'),
      mkFile('한울/하위/파일.pdf'),
    ]
    const tree = buildFolderTree(files)

    // 1차: direct 매핑
    const mapped = computeFolderMappings(tree, new Map([['한울', 'c3']]), mockCustomers)
    expect(mapped.find(m => m.folderPath === '한울/하위')?.state).toBe('inherited')

    // 2차: 해제
    const released = computeFolderMappings(tree, new Map(), mockCustomers)
    expect(released.find(m => m.folderPath === '한울')?.state).toBe('unmapped')
    expect(released.find(m => m.folderPath === '한울/하위')?.state).toBe('unmapped')
  })

  test('알 수 없는 customerId는 customerName=null로 처리한다', () => {
    const files = [mkFile('폴더/a.pdf')]
    const tree = buildFolderTree(files)
    const mappings = computeFolderMappings(tree, new Map([['폴더', 'unknown']]), mockCustomers)

    const m = mappings[0]
    expect(m.state).toBe('direct')
    expect(m.customerId).toBe('unknown')
    expect(m.customerName).toBeNull()
  })
})

describe('canDirectMap (공존 금지 불변식 R3)', () => {
  test('자식/자손에 direct가 없으면 허용', () => {
    const result = canDirectMap('한울', new Map())
    expect(result.ok).toBe(true)
  })

  test('자식에 direct가 있으면 거부 + 충돌 경로 반환', () => {
    const directMap = new Map([['한울/하위A', 'c1']])
    const result = canDirectMap('한울', directMap)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const descendants = result.conflicts.filter(c => c.type === 'descendant')
      expect(descendants.map(c => c.path)).toContain('한울/하위A')
    }
  })

  test('손자 (3단계 아래)에 direct가 있어도 거부', () => {
    const directMap = new Map([['A/B/C', 'c1']])
    const result = canDirectMap('A', directMap)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const descendants = result.conflicts.filter(c => c.type === 'descendant')
      expect(descendants.map(c => c.path)).toContain('A/B/C')
    }
  })

  test('형제 폴더(같은 레벨)는 충돌이 아니다', () => {
    const directMap = new Map([['한울/하위A', 'c1']])
    const result = canDirectMap('한울/하위B', directMap)
    expect(result.ok).toBe(true)
  })

  test('prefix가 같지만 실제 자식이 아닌 폴더는 충돌이 아니다', () => {
    // "한울"과 "한울테크"는 prefix만 비슷할 뿐 무관
    const directMap = new Map([['한울테크/파일', 'c1']])
    const result = canDirectMap('한울', directMap)
    expect(result.ok).toBe(true)
  })

  test('자기 자신은 충돌로 간주하지 않는다', () => {
    const directMap = new Map([['한울', 'c1']])
    const result = canDirectMap('한울', directMap)
    expect(result.ok).toBe(true)
  })

  // ==================== 조상 방향 검사 (신규) ====================

  test('조상 direct 감지 — 부모가 이미 direct면 거부', () => {
    const directMap = new Map([['한울', 'c3']])
    const result = canDirectMap('한울/하위A', directMap)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const ancestors = result.conflicts.filter(c => c.type === 'ancestor')
      expect(ancestors).toHaveLength(1)
      expect(ancestors[0].path).toBe('한울')
      expect(ancestors[0].customerId).toBe('c3')
    }
  })

  test('조상 direct 감지 — 3단계 위 조상이 direct면 거부', () => {
    const directMap = new Map([['A', 'c1']])
    const result = canDirectMap('A/B/C/D', directMap)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const ancestors = result.conflicts.filter(c => c.type === 'ancestor')
      expect(ancestors.map(a => a.path)).toContain('A')
      expect(ancestors.find(a => a.path === 'A')?.customerId).toBe('c1')
    }
  })

  test('조상 + 자손 동시 충돌 — 두 방향 모두 반환', () => {
    // 비정상 상태지만 방어적으로 두 방향 다 탐지
    const directMap = new Map([
      ['A', 'c1'],           // 조상
      ['A/B/C', 'c2'],       // 자손
    ])
    const result = canDirectMap('A/B', directMap)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const ancestors = result.conflicts.filter(c => c.type === 'ancestor')
      const descendants = result.conflicts.filter(c => c.type === 'descendant')
      expect(ancestors.map(a => a.path)).toContain('A')
      expect(descendants.map(d => d.path)).toContain('A/B/C')
    }
  })

  test('루트 폴더는 조상 검사 대상이 없다', () => {
    // 루트 폴더("한울")는 parts.length=1이라 조상 루프 스킵
    const directMap = new Map([['다른폴더', 'c1']])
    const result = canDirectMap('한울', directMap)
    expect(result.ok).toBe(true)
  })
})

describe('releaseDirectMapping', () => {
  test('대상 폴더의 direct 매핑을 제거한다', () => {
    const directMap = new Map([
      ['한울', 'c3'],
      ['홍길동', 'c1'],
    ])
    const next = releaseDirectMapping('한울', directMap)

    expect(next.has('한울')).toBe(false)
    expect(next.has('홍길동')).toBe(true)
    // 원본 불변
    expect(directMap.has('한울')).toBe(true)
  })

  test('존재하지 않는 경로는 변화 없음', () => {
    const directMap = new Map([['한울', 'c3']])
    const next = releaseDirectMapping('존재안함', directMap)
    expect(next.size).toBe(1)
    expect(next.get('한울')).toBe('c3')
  })
})

describe('불변식: 루트→리프 경로상 direct는 최대 1개', () => {
  test('부모가 direct일 때 자식의 direct 지정은 조상 가드로 차단된다', () => {
    // 한울(direct=c3) 상태에서 "한울/하위"를 direct로 지정하려 하면
    // canDirectMap은 조상 방향 검사로 '한울'을 ancestor 충돌로 보고해야 함
    const directMap = new Map([['한울', 'c3']])
    const canMapChild = canDirectMap('한울/하위', directMap)

    expect(canMapChild.ok).toBe(false)
    if (!canMapChild.ok) {
      const ancestors = canMapChild.conflicts.filter(c => c.type === 'ancestor')
      expect(ancestors).toHaveLength(1)
      expect(ancestors[0].path).toBe('한울')
      expect(ancestors[0].customerId).toBe('c3')
    }
  })

  test('부모와 자식 동시 direct 비정상 상태는 양방향 가드로 예방된다', () => {
    // 부모=한울(direct), 자식=하위A(direct 시도)는 조상 가드로 차단됨
    const files = [mkFile('한울/하위A/파일.pdf')]
    const tree = buildFolderTree(files)

    // 부모+자식 동시 direct를 강제로 주입한 비정상 상태
    const abnormal = new Map([
      ['한울', 'c3'],
      ['한울/하위A', 'c1'],
    ])
    const mappings = computeFolderMappings(tree, abnormal, mockCustomers)

    const 한울 = mappings.find(m => m.folderPath === '한울')
    const 하위A = mappings.find(m => m.folderPath === '한울/하위A')

    expect(한울?.state).toBe('direct')
    expect(하위A?.state).toBe('direct') // 자기 direct가 이김 (상속보다 우선)

    // 이 비정상 상태는 양방향 가드로 예방:
    // - '한울'을 direct로 만들 때는 자손('한울/하위A')이 충돌
    // - '한울/하위A'를 direct로 만들 때는 조상('한울')이 충돌
    const guardParent = canDirectMap('한울', abnormal)
    expect(guardParent.ok).toBe(false)

    const guardChild = canDirectMap('한울/하위A', abnormal)
    expect(guardChild.ok).toBe(false)
    if (!guardChild.ok) {
      const ancestors = guardChild.conflicts.filter(c => c.type === 'ancestor')
      expect(ancestors.map(a => a.path)).toContain('한울')
    }
  })
})

// ==================== handleMappingChange 가드 동작 (BatchDocumentUploadView 연계) ====================

describe('handleMappingChange 가드 — canDirectMap 위반 시 상태 변경 거부', () => {
  /**
   * BatchDocumentUploadView.handleMappingChange 내부 로직 재현:
   * - customer !== null일 때 canDirectMap 통과해야만 directMap 갱신
   * - 위반 시 prev를 그대로 반환 (상태 불변)
   */
  function simulateHandleMappingChange(
    folderPath: string,
    customerId: string | null,
    prev: Map<string, string>
  ): Map<string, string> {
    const next = new Map(prev)
    if (customerId) {
      const guard = canDirectMap(folderPath, prev)
      if (!guard.ok) return prev
      next.set(folderPath, customerId)
    } else {
      next.delete(folderPath)
    }
    return next
  }

  test('조상이 direct인 경로에 프로그래매틱 direct 지정 시 무시됨', () => {
    const prev = new Map([['한울', 'c3']])
    const after = simulateHandleMappingChange('한울/하위', 'c1', prev)

    // prev 그대로 반환 (상태 불변)
    expect(after).toBe(prev)
    expect(after.has('한울/하위')).toBe(false)
    expect(after.get('한울')).toBe('c3')
  })

  test('자손이 direct인 경로에 프로그래매틱 direct 지정 시 무시됨', () => {
    const prev = new Map([['한울/하위A', 'c1']])
    const after = simulateHandleMappingChange('한울', 'c3', prev)

    expect(after).toBe(prev)
    expect(after.has('한울')).toBe(false)
  })

  test('정상 경로 지정은 통과', () => {
    const prev = new Map<string, string>()
    const after = simulateHandleMappingChange('홍길동', 'c1', prev)

    expect(after).not.toBe(prev)
    expect(after.get('홍길동')).toBe('c1')
  })

  test('해제(customer=null)는 가드와 무관하게 통과', () => {
    const prev = new Map([['한울', 'c3']])
    const after = simulateHandleMappingChange('한울', null, prev)

    expect(after.has('한울')).toBe(false)
  })
})

describe('flattenTree', () => {
  test('DFS pre-order로 평탄화한다', () => {
    const files = [
      mkFile('A/a.pdf'),
      mkFile('A/B/b.pdf'),
      mkFile('A/C/c.pdf'),
    ]
    const roots = buildFolderTree(files)
    const flat = flattenTree(roots)
    const paths = flat.map(n => n.folderPath)
    expect(paths).toEqual(['A', 'A/B', 'A/C'])
  })
})
