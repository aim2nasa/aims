/**
 * Phase 1.3 테스트: logger.ts
 *
 * 테스트 대상:
 * - logger.debug (개발 환경에서만 출력)
 * - logger.info
 * - logger.warn
 * - logger.error
 * - logger.configure
 * - logger.reset
 */

import { logger } from '../logger'

describe('logger', () => {
  // console 메서드 모킹
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    group: console.group,
    groupEnd: console.groupEnd,
    table: console.table
  }

  let mockLog: ReturnType<typeof vi.fn>
  let mockInfo: ReturnType<typeof vi.fn>
  let mockWarn: ReturnType<typeof vi.fn>
  let mockError: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockLog = vi.fn()
    mockInfo = vi.fn()
    mockWarn = vi.fn()
    mockError = vi.fn()

    console.log = mockLog
    console.info = mockInfo
    console.warn = mockWarn
    console.error = mockError

    // 테스트 전 logger 설정 초기화
    logger.reset()
  })

  afterEach(() => {
    // 원본 console 복원
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.warn = originalConsole.warn
    console.error = originalConsole.error
  })

  describe('logger.debug', () => {
    test('개발 환경에서 console.log 호출', () => {
      // 개발 환경 활성화
      logger.configure({ enabled: { debug: true, info: true, warn: true, error: true } })

      logger.debug('TestContext', 'debug message')

      expect(mockLog).toHaveBeenCalled()
      // 첫 번째 인자에 컨텍스트 포함 확인
      const firstArg = mockLog.mock.calls[0][0]
      expect(firstArg).toContain('TestContext')
    })

    test('비활성화 시 호출되지 않음', () => {
      logger.configure({ enabled: { debug: false, info: true, warn: true, error: true } })

      logger.debug('TestContext', 'should not appear')

      expect(mockLog).not.toHaveBeenCalled()
    })

    test('데이터와 함께 호출', () => {
      logger.configure({ enabled: { debug: true, info: true, warn: true, error: true } })

      logger.debug('TestContext', 'message', { key: 'value' })

      expect(mockLog).toHaveBeenCalled()
    })
  })

  describe('logger.info', () => {
    test('console.info 호출', () => {
      logger.info('InfoContext', 'info message')

      expect(mockInfo).toHaveBeenCalled()
      const firstArg = mockInfo.mock.calls[0][0]
      expect(firstArg).toContain('InfoContext')
    })

    test('비활성화 시 호출되지 않음', () => {
      logger.configure({ enabled: { debug: true, info: false, warn: true, error: true } })

      logger.info('InfoContext', 'should not appear')

      expect(mockInfo).not.toHaveBeenCalled()
    })
  })

  describe('logger.warn', () => {
    test('console.warn 호출', () => {
      logger.warn('WarnContext', 'warning message')

      expect(mockWarn).toHaveBeenCalled()
      const firstArg = mockWarn.mock.calls[0][0]
      expect(firstArg).toContain('WarnContext')
    })

    test('비활성화 시 호출되지 않음', () => {
      logger.configure({ enabled: { debug: true, info: true, warn: false, error: true } })

      logger.warn('WarnContext', 'should not appear')

      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  describe('logger.error', () => {
    test('console.error 호출', () => {
      logger.error('ErrorContext', new Error('test error'))

      expect(mockError).toHaveBeenCalled()
      const firstArg = mockError.mock.calls[0][0]
      expect(firstArg).toContain('ErrorContext')
    })

    test('문자열 에러도 처리', () => {
      logger.error('ErrorContext', 'string error message')

      expect(mockError).toHaveBeenCalled()
    })

    test('추가 데이터와 함께 호출', () => {
      logger.error('ErrorContext', 'error', { extra: 'data' })

      expect(mockError).toHaveBeenCalled()
      // 3개 인자 전달 확인 (prefix, error, data)
      expect(mockError.mock.calls[0].length).toBeGreaterThanOrEqual(2)
    })

    test('비활성화 시 호출되지 않음', () => {
      logger.configure({ enabled: { debug: true, info: true, warn: true, error: false } })

      logger.error('ErrorContext', 'should not appear')

      expect(mockError).not.toHaveBeenCalled()
    })
  })

  describe('logger.configure', () => {
    test('설정 변경 적용', () => {
      // info 비활성화
      logger.configure({ enabled: { debug: true, info: false, warn: true, error: true } })

      logger.info('Test', 'should not appear')
      expect(mockInfo).not.toHaveBeenCalled()

      logger.warn('Test', 'should appear')
      expect(mockWarn).toHaveBeenCalled()
    })

    test('부분 설정 변경', () => {
      logger.configure({ showTimestamp: true })

      logger.info('Test', 'with timestamp')

      expect(mockInfo).toHaveBeenCalled()
      // 타임스탬프 형식 확인 (ISO 형식의 시간 부분)
      const firstArg = mockInfo.mock.calls[0][0]
      expect(firstArg).toMatch(/\[.*\]/) // 대괄호로 둘러싸인 컨텍스트
    })
  })

  describe('logger.reset', () => {
    test('기본 설정으로 복원', () => {
      // 설정 변경
      logger.configure({ enabled: { debug: true, info: false, warn: false, error: false } })

      // info가 비활성화됨
      logger.info('Test', 'before reset')
      expect(mockInfo).not.toHaveBeenCalled()

      // 리셋
      logger.reset()

      // info가 다시 활성화됨
      logger.info('Test', 'after reset')
      expect(mockInfo).toHaveBeenCalled()
    })
  })

  describe('메시지 포맷', () => {
    test('컨텍스트가 대괄호로 둘러싸임', () => {
      logger.info('MyComponent', 'test')

      const firstArg = mockInfo.mock.calls[0][0]
      expect(firstArg).toContain('[MyComponent]')
    })

    test('메시지만 전달 시 정상 동작', () => {
      logger.info('Context', 'just message')

      expect(mockInfo).toHaveBeenCalledTimes(1)
    })

    test('메시지 없이 컨텍스트만 전달 시 정상 동작', () => {
      logger.debug('OnlyContext')

      // debug는 기본 비활성화일 수 있으므로 활성화
      logger.configure({ enabled: { debug: true, info: true, warn: true, error: true } })
      logger.debug('OnlyContext')

      expect(mockLog).toHaveBeenCalled()
    })
  })

  describe('다양한 데이터 타입', () => {
    beforeEach(() => {
      logger.configure({ enabled: { debug: true, info: true, warn: true, error: true } })
    })

    test('객체 데이터', () => {
      const data = { key: 'value', nested: { a: 1 } }
      logger.debug('Test', 'with object', data)

      expect(mockLog).toHaveBeenCalled()
    })

    test('배열 데이터', () => {
      const data = [1, 2, 3, 'test']
      logger.debug('Test', 'with array', data)

      expect(mockLog).toHaveBeenCalled()
    })

    test('null/undefined 데이터', () => {
      logger.debug('Test', 'with null', null)
      logger.debug('Test', 'with undefined', undefined)

      expect(mockLog).toHaveBeenCalledTimes(2)
    })
  })
})
