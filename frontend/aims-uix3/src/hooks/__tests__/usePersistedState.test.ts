/**
 * usePersistedState Hook Tests
 * @since 1.0.0
 * @version 1.1.0
 *
 * SessionStorage와 동기화되는 React state hook 테스트
 * - sessionStorage 읽기/쓰기
 * - 직렬화/역직렬화
 * - 에러 처리
 * - 상태 초기화
 * - 타입 안정성
 *
 * @changelog
 * - 1.1.0: sessionStorage → sessionStorage 변경
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedState, clearPersistedState, clearAllViewStates } from '../usePersistedState'

describe('usePersistedState', () => {
  beforeEach(() => {
    // sessionStorage 초기화
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  describe('초기화', () => {
    it('SessionStorage에 값이 없으면 initialValue를 사용해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-key', 'initial'))

      expect(result.current[0]).toBe('initial')
      expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('initial'))
    })

    it('SessionStorage에 저장된 값이 있으면 그 값을 복원해야 함', () => {
      sessionStorage.setItem('test-key', JSON.stringify('saved-value'))

      const { result } = renderHook(() => usePersistedState('test-key', 'initial'))

      expect(result.current[0]).toBe('saved-value')
    })

    it('복잡한 객체를 initialValue로 사용할 수 있어야 함', () => {
      const initialValue = { name: 'John', age: 30, tags: ['a', 'b'] }

      const { result } = renderHook(() => usePersistedState('test-obj', initialValue))

      expect(result.current[0]).toEqual(initialValue)
      expect(sessionStorage.getItem('test-obj')).toBe(JSON.stringify(initialValue))
    })

    it('배열을 initialValue로 사용할 수 있어야 함', () => {
      const initialValue = ['item1', 'item2', 'item3']

      const { result } = renderHook(() => usePersistedState('test-array', initialValue))

      expect(result.current[0]).toEqual(initialValue)
      expect(sessionStorage.getItem('test-array')).toBe(JSON.stringify(initialValue))
    })

    it('null을 initialValue로 사용할 수 있어야 함', () => {
      const { result } = renderHook(() => usePersistedState<string | null>('test-null', null))

      expect(result.current[0]).toBe(null)
      expect(sessionStorage.getItem('test-null')).toBe('null')
    })

    it('숫자를 initialValue로 사용할 수 있어야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-number', 42))

      expect(result.current[0]).toBe(42)
      expect(sessionStorage.getItem('test-number')).toBe('42')
    })

    it('boolean을 initialValue로 사용할 수 있어야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-bool', true))

      expect(result.current[0]).toBe(true)
      expect(sessionStorage.getItem('test-bool')).toBe('true')
    })
  })

  describe('상태 업데이트', () => {
    it('setState를 호출하면 상태가 업데이트되어야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-key', 'initial'))

      act(() => {
        result.current[1]('updated')
      })

      expect(result.current[0]).toBe('updated')
    })

    it('setState를 호출하면 sessionStorage에 저장되어야 함', async () => {
      const { result } = renderHook(() => usePersistedState('test-key', 'initial'))

      act(() => {
        result.current[1]('updated')
      })

      // useEffect가 실행될 때까지 대기
      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('updated'))
      })
    })

    it('함수형 업데이트를 지원해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-counter', 0))

      act(() => {
        result.current[1](prev => prev + 1)
      })

      expect(result.current[0]).toBe(1)

      act(() => {
        result.current[1](prev => prev + 10)
      })

      expect(result.current[0]).toBe(11)
    })

    it('객체 상태를 업데이트할 수 있어야 함', async () => {
      const { result } = renderHook(() =>
        usePersistedState('test-obj', { name: 'John', age: 30 })
      )

      act(() => {
        result.current[1]({ name: 'Jane', age: 25 })
      })

      expect(result.current[0]).toEqual({ name: 'Jane', age: 25 })

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-obj')).toBe(
          JSON.stringify({ name: 'Jane', age: 25 })
        )
      })
    })

    it('배열 상태를 업데이트할 수 있어야 함', async () => {
      const { result } = renderHook(() => usePersistedState('test-array', ['a', 'b']))

      act(() => {
        result.current[1](prev => [...prev, 'c'])
      })

      expect(result.current[0]).toEqual(['a', 'b', 'c'])

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-array')).toBe(JSON.stringify(['a', 'b', 'c']))
      })
    })

    it('여러 번 연속으로 업데이트할 수 있어야 함', async () => {
      const { result } = renderHook(() => usePersistedState('test-key', 0))

      act(() => {
        result.current[1](1)
        result.current[1](2)
        result.current[1](3)
      })

      expect(result.current[0]).toBe(3)

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-key')).toBe('3')
      })
    })
  })

  describe('직렬화/역직렬화', () => {
    it('중첩된 객체를 올바르게 직렬화/역직렬화해야 함', () => {
      const complexObject = {
        user: { name: 'John', address: { city: 'Seoul', zip: '12345' } },
        tags: ['a', 'b'],
        count: 42
      }

      sessionStorage.setItem('test-complex', JSON.stringify(complexObject))

      const { result } = renderHook(() => usePersistedState('test-complex', {}))

      expect(result.current[0]).toEqual(complexObject)
    })

    it('빈 객체를 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-empty-obj', {}))

      expect(result.current[0]).toEqual({})
      expect(sessionStorage.getItem('test-empty-obj')).toBe('{}')
    })

    it('빈 배열을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-empty-array', []))

      expect(result.current[0]).toEqual([])
      expect(sessionStorage.getItem('test-empty-array')).toBe('[]')
    })

    it('빈 문자열을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-empty-string', ''))

      expect(result.current[0]).toBe('')
      expect(sessionStorage.getItem('test-empty-string')).toBe('""')
    })

    it('0을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-zero', 0))

      expect(result.current[0]).toBe(0)
      expect(sessionStorage.getItem('test-zero')).toBe('0')
    })

    it('false를 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState('test-false', false))

      expect(result.current[0]).toBe(false)
      expect(sessionStorage.getItem('test-false')).toBe('false')
    })
  })

  describe('에러 처리', () => {
    it('sessionStorage 읽기 실패 시 initialValue를 사용해야 함', () => {
      // 잘못된 JSON 저장
      sessionStorage.setItem('test-invalid', '{invalid json}')

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => usePersistedState('test-invalid', 'fallback'))

      expect(result.current[0]).toBe('fallback')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[usePersistedState] "test-invalid" 복원 실패:'),
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })

    it('sessionStorage.setItem 실패 시 에러를 로그하고 계속 실행해야 함', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // sessionStorage.setItem을 실패하도록 모킹
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      const { result } = renderHook(() => usePersistedState('test-key', 'initial'))

      act(() => {
        result.current[1]('updated')
      })

      expect(result.current[0]).toBe('updated')

      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[usePersistedState] "test-key" 저장 실패:'),
          expect.any(Error)
        )
      })

      setItemSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('sessionStorage가 비활성화된 환경에서도 동작해야 함', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('sessionStorage is not available')
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => usePersistedState('test-key', 'fallback'))

      expect(result.current[0]).toBe('fallback')

      getItemSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('동시성 및 키 관리', () => {
    it('같은 키를 사용하는 여러 hook이 독립적으로 동작해야 함', () => {
      const { result: result1 } = renderHook(() => usePersistedState('shared-key', 'initial'))
      const { result: result2 } = renderHook(() => usePersistedState('shared-key', 'initial'))

      expect(result1.current[0]).toBe('initial')
      expect(result2.current[0]).toBe('initial')
    })

    it('다른 키를 사용하는 hook들이 서로 영향을 주지 않아야 함', async () => {
      const { result: result1 } = renderHook(() => usePersistedState('key1', 'value1'))
      const { result: result2 } = renderHook(() => usePersistedState('key2', 'value2'))

      act(() => {
        result1.current[1]('updated1')
      })

      expect(result1.current[0]).toBe('updated1')
      expect(result2.current[0]).toBe('value2')

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('key1')).toBe(JSON.stringify('updated1'))
        expect(sessionStorage.getItem('key2')).toBe(JSON.stringify('value2'))
      })
    })

    it('hook이 unmount되어도 sessionStorage 값은 유지되어야 함', async () => {
      const { result, unmount } = renderHook(() => usePersistedState('test-key', 'initial'))

      act(() => {
        result.current[1]('persisted')
      })

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('persisted'))
      })

      unmount()

      // unmount 후에도 sessionStorage에 값이 남아있어야 함
      expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('persisted'))
    })

    it('hook을 재마운트하면 sessionStorage의 값을 복원해야 함', async () => {
      const { result: result1, unmount } = renderHook(() =>
        usePersistedState('test-key', 'initial')
      )

      act(() => {
        result1.current[1]('persisted')
      })

      await vi.waitFor(() => {
        expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('persisted'))
      })

      unmount()

      // 새로운 hook 인스턴스 생성
      const { result: result2 } = renderHook(() => usePersistedState('test-key', 'initial'))

      expect(result2.current[0]).toBe('persisted')
    })
  })

  describe('타입 안정성', () => {
    it('string 타입을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState<string>('test-string', 'text'))

      expect(typeof result.current[0]).toBe('string')
    })

    it('number 타입을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState<number>('test-number', 123))

      expect(typeof result.current[0]).toBe('number')
    })

    it('boolean 타입을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => usePersistedState<boolean>('test-bool', true))

      expect(typeof result.current[0]).toBe('boolean')
    })

    it('interface 타입을 올바르게 처리해야 함', () => {
      interface TestInterface {
        id: number
        name: string
        active: boolean
      }

      const initialValue: TestInterface = { id: 1, name: 'Test', active: true }

      const { result } = renderHook(() => usePersistedState<TestInterface>('test-interface', initialValue))

      expect(result.current[0]).toEqual(initialValue)
      expect(result.current[0].id).toBe(1)
      expect(result.current[0].name).toBe('Test')
      expect(result.current[0].active).toBe(true)
    })

    it('union 타입을 올바르게 처리해야 함', () => {
      type SortBy = 'name' | 'date' | 'size'

      const { result } = renderHook(() => usePersistedState<SortBy>('test-union', 'name'))

      expect(result.current[0]).toBe('name')

      act(() => {
        result.current[1]('date')
      })

      expect(result.current[0]).toBe('date')
    })
  })
})

describe('clearPersistedState', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('지정한 키를 sessionStorage에서 삭제해야 함', () => {
    sessionStorage.setItem('test-key', 'value')

    clearPersistedState('test-key')

    expect(sessionStorage.getItem('test-key')).toBeNull()
  })

  it('존재하지 않는 키를 삭제해도 에러가 발생하지 않아야 함', () => {
    expect(() => {
      clearPersistedState('non-existent-key')
    }).not.toThrow()
  })

  it('sessionStorage.removeItem 실패 시 에러를 로그해야 함', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('removeItem failed')
    })

    clearPersistedState('test-key')

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[usePersistedState] "test-key" 삭제 실패:'),
      expect.any(Error)
    )

    removeItemSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('다른 키에는 영향을 주지 않아야 함', () => {
    sessionStorage.setItem('key1', 'value1')
    sessionStorage.setItem('key2', 'value2')

    clearPersistedState('key1')

    expect(sessionStorage.getItem('key1')).toBeNull()
    expect(sessionStorage.getItem('key2')).toBe('value2')
  })
})

describe('clearAllViewStates', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('모든 View 상태 키를 삭제해야 함', () => {
    const keys = [
      'customer-all-search',
      'customer-all-sort',
      'customer-regional-search',
      'document-library-search',
      'document-status-filter'
    ]

    // 키들을 sessionStorage에 저장
    keys.forEach(key => {
      sessionStorage.setItem(key, 'test-value')
    })

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    clearAllViewStates()

    // 모든 키가 삭제되었는지 확인
    keys.forEach(key => {
      expect(sessionStorage.getItem(key)).toBeNull()
    })

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[usePersistedState] 모든 View 상태 초기화 완료'
    )

    consoleLogSpy.mockRestore()
  })

  it('일부 키만 존재해도 에러 없이 실행되어야 함', () => {
    sessionStorage.setItem('customer-all-search', 'value')
    sessionStorage.setItem('document-library-filter', 'value')

    expect(() => {
      clearAllViewStates()
    }).not.toThrow()
  })

  it('sessionStorage가 비어있어도 에러 없이 실행되어야 함', () => {
    expect(() => {
      clearAllViewStates()
    }).not.toThrow()
  })

  it('View 상태가 아닌 다른 키에는 영향을 주지 않아야 함', () => {
    sessionStorage.setItem('user-token', 'abc123')
    sessionStorage.setItem('theme-preference', 'dark')

    clearAllViewStates()

    expect(sessionStorage.getItem('user-token')).toBe('abc123')
    expect(sessionStorage.getItem('theme-preference')).toBe('dark')
  })
})
