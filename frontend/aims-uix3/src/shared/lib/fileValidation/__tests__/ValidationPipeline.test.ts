/**
 * ValidationPipeline 플러그인 아키텍처 테스트
 * @since 2025-12-13
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ValidationPipeline } from '../ValidationPipeline'
import type { FileValidator, FileValidationResult } from '../types'

describe('ValidationPipeline', () => {
  let pipeline: ValidationPipeline

  // 테스트용 File 객체 생성 헬퍼
  const createMockFile = (name: string, size: number = 1000): File => {
    const file = new File([''], name, { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: size, writable: false })
    return file
  }

  // 테스트용 검증기 생성 헬퍼
  const createValidator = (
    name: string,
    priority: number,
    validateFn: (file: File) => FileValidationResult
  ): FileValidator => ({
    name,
    priority,
    enabled: true,
    validate: validateFn,
  })

  beforeEach(() => {
    pipeline = new ValidationPipeline()
  })

  describe('register / unregister', () => {
    it('검증기 등록', () => {
      const validator = createValidator('test', 10, (file) => ({ valid: true, file }))
      pipeline.register(validator)

      expect(pipeline.has('test')).toBe(true)
      expect(pipeline.size).toBe(1)
    })

    it('중복 등록 시 에러', () => {
      const validator = createValidator('test', 10, (file) => ({ valid: true, file }))
      pipeline.register(validator)

      expect(() => pipeline.register(validator)).toThrow('already registered')
    })

    it('overwrite 옵션으로 중복 등록 허용', () => {
      const validator1 = createValidator('test', 10, (file) => ({ valid: true, file }))
      const validator2 = createValidator('test', 20, (file) => ({ valid: false, file, reason: 'unknown' }))

      pipeline.register(validator1)
      pipeline.register(validator2, { overwrite: true })

      expect(pipeline.get('test')?.priority).toBe(20)
    })

    it('검증기 해제', () => {
      const validator = createValidator('test', 10, (file) => ({ valid: true, file }))
      pipeline.register(validator)

      const result = pipeline.unregister('test')

      expect(result).toBe(true)
      expect(pipeline.has('test')).toBe(false)
    })

    it('존재하지 않는 검증기 해제', () => {
      const result = pipeline.unregister('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('setEnabled', () => {
    it('검증기 비활성화', () => {
      const validator = createValidator('test', 10, (file) => ({ valid: false, file, reason: 'unknown' }))
      pipeline.register(validator)

      pipeline.setEnabled('test', false)

      // 비활성화된 검증기는 실행되지 않음
      const result = pipeline.validate(createMockFile('test.pdf'))
      expect(result.valid).toBe(true)
    })

    it('검증기 다시 활성화', () => {
      const validator = createValidator('test', 10, (file) => ({ valid: false, file, reason: 'unknown' }))
      pipeline.register(validator)

      pipeline.setEnabled('test', false)
      pipeline.setEnabled('test', true)

      const result = pipeline.validate(createMockFile('test.pdf'))
      expect(result.valid).toBe(false)
    })

    it('존재하지 않는 검증기 설정', () => {
      const result = pipeline.setEnabled('nonexistent', true)
      expect(result).toBe(false)
    })
  })

  describe('validate', () => {
    it('모든 검증 통과', () => {
      pipeline.register(createValidator('v1', 10, (file) => ({ valid: true, file })))
      pipeline.register(createValidator('v2', 20, (file) => ({ valid: true, file })))

      const result = pipeline.validate(createMockFile('test.pdf'))
      expect(result.valid).toBe(true)
    })

    it('첫 번째 실패 시 중단', () => {
      let v2Called = false
      pipeline.register(createValidator('v1', 10, (file) => ({ valid: false, file, reason: 'unknown', message: 'v1 failed' })))
      pipeline.register(createValidator('v2', 20, (file) => {
        v2Called = true
        return { valid: true, file }
      }))

      const result = pipeline.validate(createMockFile('test.pdf'))

      expect(result.valid).toBe(false)
      expect(result.message).toBe('v1 failed')
      expect(v2Called).toBe(false) // v2는 호출되지 않음
    })

    it('우선순위 순서대로 실행', () => {
      const order: string[] = []

      pipeline.register(createValidator('v3', 30, (file) => {
        order.push('v3')
        return { valid: true, file }
      }))
      pipeline.register(createValidator('v1', 10, (file) => {
        order.push('v1')
        return { valid: true, file }
      }))
      pipeline.register(createValidator('v2', 20, (file) => {
        order.push('v2')
        return { valid: true, file }
      }))

      pipeline.validate(createMockFile('test.pdf'))

      expect(order).toEqual(['v1', 'v2', 'v3'])
    })

    it('only 옵션 - 특정 검증기만 실행', () => {
      let v1Called = false
      let v2Called = false

      pipeline.register(createValidator('v1', 10, (file) => {
        v1Called = true
        return { valid: true, file }
      }))
      pipeline.register(createValidator('v2', 20, (file) => {
        v2Called = true
        return { valid: true, file }
      }))

      pipeline.validate(createMockFile('test.pdf'), { only: ['v2'] })

      expect(v1Called).toBe(false)
      expect(v2Called).toBe(true)
    })

    it('exclude 옵션 - 특정 검증기 제외', () => {
      let v1Called = false
      let v2Called = false

      pipeline.register(createValidator('v1', 10, (file) => {
        v1Called = true
        return { valid: true, file }
      }))
      pipeline.register(createValidator('v2', 20, (file) => {
        v2Called = true
        return { valid: true, file }
      }))

      pipeline.validate(createMockFile('test.pdf'), { exclude: ['v1'] })

      expect(v1Called).toBe(false)
      expect(v2Called).toBe(true)
    })
  })

  describe('validateFiles', () => {
    it('여러 파일 검증', () => {
      pipeline.register(createValidator('nameCheck', 10, (file) => {
        if (file.name.includes('bad')) {
          return { valid: false, file, reason: 'unknown', message: 'bad file' }
        }
        return { valid: true, file }
      }))

      const files = [
        createMockFile('good1.pdf'),
        createMockFile('bad.pdf'),
        createMockFile('good2.pdf'),
      ]

      const { validFiles, invalidFiles } = pipeline.validateFiles(files)

      expect(validFiles).toHaveLength(2)
      expect(invalidFiles).toHaveLength(1)
      expect(invalidFiles[0].file.name).toBe('bad.pdf')
    })
  })

  describe('clone', () => {
    it('파이프라인 복제', () => {
      pipeline.register(createValidator('v1', 10, (file) => ({ valid: true, file })))

      const cloned = pipeline.clone()

      expect(cloned.has('v1')).toBe(true)
      expect(cloned.size).toBe(1)

      // 원본과 독립적
      cloned.unregister('v1')
      expect(pipeline.has('v1')).toBe(true)
      expect(cloned.has('v1')).toBe(false)
    })
  })

  describe('clear', () => {
    it('모든 검증기 제거', () => {
      pipeline.register(createValidator('v1', 10, (file) => ({ valid: true, file })))
      pipeline.register(createValidator('v2', 20, (file) => ({ valid: true, file })))

      pipeline.clear()

      expect(pipeline.size).toBe(0)
    })
  })

  describe('getValidatorNames', () => {
    it('등록된 검증기 이름 목록', () => {
      pipeline.register(createValidator('alpha', 10, (file) => ({ valid: true, file })))
      pipeline.register(createValidator('beta', 20, (file) => ({ valid: true, file })))

      const names = pipeline.getValidatorNames()

      expect(names).toContain('alpha')
      expect(names).toContain('beta')
    })
  })
})
