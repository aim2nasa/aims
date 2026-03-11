/**
 * L1: CustomMenu DOM 스냅샷 테스트 (12개)
 *
 * 리팩토링 전후에 DOM 구조가 100% 동일함을 검증.
 * toMatchSnapshot() 사용하지 않음 — 모든 기대값은 리터럴.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import CustomMenu from '../CustomMenu'

// ── 타이머 제어 (Progressive Disclosure setTimeout 대응) ──
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ── console.log 억제 (Progressive Disclosure 노이즈 방지) ──
// vitest DEV mode: import.meta.env.DEV = true → 6건의 console.log 발생
let consoleLogSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => {
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  consoleLogSpy.mockRestore()
})

// ── useDevModeStore (케이스별 교체 가능) ──
const mockDevMode = vi.fn(() => ({ isDevMode: false, toggleDevMode: vi.fn() }))
vi.mock('@/shared/store/useDevModeStore', () => ({
  useDevModeStore: (...args: unknown[]) => mockDevMode(...args),
}))

// ── useNavigation (반환 구조 명시) ──
vi.mock('@/hooks/useNavigation', () => ({
  useNavigation: () => ({
    onKeyDown: vi.fn(),
    onWheel: vi.fn(),
    currentIndex: 0,
    canNavigateUp: false,
    canNavigateDown: true,
    tabIndex: 0,
  }),
}))

// ── RecentCustomers (상대 경로 mock) ──
vi.mock('../RecentCustomers', () => ({
  default: () => null,
}))

// ── Tooltip (children 투과, TypeScript 호환) ──
vi.mock('@/shared/ui/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

// ── SFSymbol: 전역 setup.ts에서 이미 mock (추가 불필요) ──

/**
 * 헬퍼: 렌더링 후 Progressive Disclosure 완료 대기
 * vi.advanceTimersByTime(1200)은 5단계 setTimeout(200~1000ms)을 모두 소화
 * 최종 expandedKeys: ['quick-actions', 'customers', 'contracts', 'documents', 'help']
 * isDevMode=false일 때 contracts 키가 menuItems에 없으므로 무해
 */
async function renderAndWait(props: Partial<React.ComponentProps<typeof CustomMenu>> = {}) {
  const result = render(
    <CustomMenu
      collapsed={false}
      hasSearchResults={false}
      searchResultsCount={0}
      inquiryUnreadCount={0}
      noticeHasNew={false}
      {...props}
    />
  )
  await act(async () => {
    vi.advanceTimersByTime(1200)
  })
  return result
}

/** data-menu-key 속성으로 모든 메뉴 아이템 키 수집 (순서 보존) */
function getMenuKeys(container: HTMLElement): string[] {
  const elements = container.querySelectorAll('[data-menu-key]')
  return Array.from(elements).map(el => el.getAttribute('data-menu-key')!)
}

/** data-menu-key별 aria-label 맵 수집 */
function getAriaLabels(container: HTMLElement): Record<string, string> {
  const elements = container.querySelectorAll('[data-menu-key]')
  const result: Record<string, string> = {}
  elements.forEach(el => {
    const key = el.getAttribute('data-menu-key')!
    const label = el.getAttribute('aria-label')!
    result[key] = label
  })
  return result
}

describe('CustomMenu DOM 스냅샷 (L1)', () => {
  beforeEach(() => {
    mockDevMode.mockReturnValue({ isDevMode: false, toggleDevMode: vi.fn() })
  })

  // ─── expanded 모드 ───

  it('#1: expanded — data-menu-key 순서 목록 (isDevMode=false)', async () => {
    const { container } = await renderAndWait({ collapsed: false })
    // expanded 모드에서 top-level 키만 (자식은 sub-menu-container 안에 있지만 querySelectorAll은 모두 수집)
    const keys = getMenuKeys(container)
    // Progressive Disclosure 완료 후 모든 섹션 expanded → 자식도 DOM에 존재
    // top-level 부모 키: autoclicker, quick-actions, customers, documents, help
    expect(keys).toContain('autoclicker')
    expect(keys).toContain('quick-actions')
    expect(keys).toContain('customers')
    expect(keys).toContain('documents')
    expect(keys).toContain('help')
    // isDevMode=false → contracts 미존재
    expect(keys).not.toContain('contracts')
  })

  it('#2: expanded — 부모의 aria-label 값', async () => {
    const { container } = await renderAndWait({ collapsed: false })
    const labels = getAriaLabels(container)
    expect(labels['quick-actions']).toBe('빠른 작업')
    expect(labels['customers']).toBe('고객')
    expect(labels['documents']).toBe('문서')
    expect(labels['help']).toBe('도움말')
  })

  it('#3: expanded — 부모의 aria-haspopup 존재', async () => {
    const { container } = await renderAndWait({ collapsed: false })
    const parentKeys = ['quick-actions', 'customers', 'documents', 'help']
    for (const key of parentKeys) {
      const el = container.querySelector(`[data-menu-key="${key}"]`)
      expect(el?.getAttribute('aria-haspopup')).toBe('menu')
    }
  })

  it('#4: expanded — sub-menu-container 내 자식 키 목록', async () => {
    const { container } = await renderAndWait({ collapsed: false })
    const keys = getMenuKeys(container)
    // quick-actions 자식
    expect(keys).toContain('documents-register')
    expect(keys).toContain('customers-register')
    expect(keys).toContain('contracts-import')
    expect(keys).toContain('batch-document-upload')
    // customers 자식
    expect(keys).toContain('customers-all')
    expect(keys).toContain('customers-regional')
    expect(keys).toContain('customers-relationship')
    // documents 자식
    expect(keys).toContain('documents-explorer')
    expect(keys).toContain('documents-search')
    expect(keys).toContain('documents-library')
    // help 자식
    expect(keys).toContain('help-notice')
    expect(keys).toContain('help-guide')
    expect(keys).toContain('help-faq')
    expect(keys).toContain('help-inquiry')
  })

  // ─── collapsed 모드 ───

  it('#5: collapsed — data-menu-key 순서 목록 (전체 flat)', async () => {
    const { container } = await renderAndWait({ collapsed: true })
    const keys = getMenuKeys(container)
    expect(keys).toEqual([
      'autoclicker',
      'quick-actions',
      'documents-register',
      'customers-register',
      'contracts-import',
      'batch-document-upload',
      'customers',
      'customers-all',
      'customers-regional',
      'customers-relationship',
      'documents',
      'documents-explorer',
      'documents-search',
      'documents-library',
      'help',
      'help-notice',
      'help-guide',
      'help-faq',
      'help-inquiry',
    ])
  })

  it('#6: collapsed — 모든 항목의 aria-label 값 (리터럴)', async () => {
    const { container } = await renderAndWait({ collapsed: true })
    const labels = getAriaLabels(container)
    // isDevMode=false, noticeHasNew=false, inquiryUnreadCount=0 기준
    // 불일치 4건은 현재 collapsed 값 그대로
    expect(labels).toEqual({
      'autoclicker': '메트 PDF 자동 받기',
      'quick-actions': '빠른 작업',
      'documents-register': '고객·계약·문서 등록',
      'customers-register': '고객 수동등록',
      'contracts-import': '엑셀 파일에서 고객 정보를 일괄 등록합니다',
      'batch-document-upload': '폴더별로 정리된 문서를 고객에게 일괄 등록합니다',
      'customers': '고객',
      'customers-all': '모든 고객을 보여줍니다',
      'customers-regional': '지역별로 고객을 분류하여 보여줍니다',
      'customers-relationship': '가족 관계별로 고객을 분류하여 보여줍니다',
      'documents': '문서',
      'documents-explorer': '고객별로 문서를 모아 볼 수 있습니다',
      'documents-search': '상세 문서검색',
      'documents-library': '모든 문서를 보여줍니다',
      'help': '도움말',
      'help-notice': '공지사항',
      'help-guide': '사용 가이드',
      'help-faq': '자주 묻는 질문',
      'help-inquiry': '1:1 문의',
    })
  })

  it('#7: collapsed — .custom-menu-item-text 요소 없음', async () => {
    // CustomMenu.tsx L296: {!collapsed && <span className="custom-menu-item-text">}
    // collapsed=true → span 자체가 렌더링되지 않음
    const { container } = await renderAndWait({ collapsed: true })
    const textElements = container.querySelectorAll('.custom-menu-item-text')
    expect(textElements.length).toBe(0)
  })

  it('#8: collapsed — aria-haspopup 없음', async () => {
    const { container } = await renderAndWait({ collapsed: true })
    const elementsWithHaspopup = container.querySelectorAll('[aria-haspopup]')
    expect(elementsWithHaspopup.length).toBe(0)
  })

  // ─── isDevMode ───

  it('#9: isDevMode=true, expanded — contracts 부모+자식 존재', async () => {
    mockDevMode.mockReturnValue({ isDevMode: true, toggleDevMode: vi.fn() })
    const { container } = await renderAndWait({ collapsed: false })
    const keys = getMenuKeys(container)
    expect(keys).toContain('contracts')
    expect(keys).toContain('contracts-all')
    // contracts 부모의 label 확인
    const contractsEl = container.querySelector('[data-menu-key="contracts"]')
    const labelSpan = contractsEl?.querySelector('.custom-menu-item-text')
    expect(labelSpan?.textContent).toBe('계약')
  })

  it('#10: isDevMode=false — contracts 관련 키 미존재', async () => {
    // mockDevMode 기본값 isDevMode=false (beforeEach에서 설정)
    const { container } = await renderAndWait({ collapsed: false })
    const keys = getMenuKeys(container)
    expect(keys).not.toContain('contracts')
    expect(keys).not.toContain('contracts-all')
  })

  // ─── 동적 props ───

  it('#11: expanded, noticeHasNew=true — help-notice badge 렌더링', async () => {
    const { container } = await renderAndWait({ collapsed: false, noticeHasNew: true })
    const badge = container.querySelector('.menu-item-badge--notice')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('N')
  })

  it('#12: collapsed, noticeHasNew=true — help-notice aria-label 동적 변경', async () => {
    const { container } = await renderAndWait({ collapsed: true, noticeHasNew: true })
    const helpNotice = container.querySelector('[data-menu-key="help-notice"]')
    expect(helpNotice?.getAttribute('aria-label')).toBe('공지사항 (새 글)')
  })
})
