/**
 * 파일 검증 파이프라인
 * 플러그인 아키텍처로 검증기를 동적으로 관리
 *
 * @since 2025-12-13
 * @version 2.0.0
 *
 * @example
 * ```typescript
 * // 기본 파이프라인 사용
 * import { defaultPipeline } from '@/shared/lib/fileValidation'
 * const result = defaultPipeline.validate(file)
 *
 * // 커스텀 파이프라인 생성
 * const pipeline = new ValidationPipeline()
 * pipeline.register(myValidator)
 * pipeline.unregister('mime')
 * ```
 */

import type {
  FileValidator,
  FileValidationResult,
  ValidatorRegistrationOptions,
  PipelineExecutionOptions,
} from './types'

/**
 * 파일 검증 파이프라인 클래스
 *
 * 검증기를 플러그인처럼 동적으로 등록/해제할 수 있습니다.
 * 검증기는 priority 순서대로 실행되며, 첫 번째 실패 시 중단됩니다.
 */
export class ValidationPipeline {
  private validators: Map<string, FileValidator> = new Map()

  /**
   * 검증기 등록
   * @param validator 등록할 검증기
   * @param options 등록 옵션
   * @throws 동일 이름의 검증기가 이미 있고 overwrite가 false인 경우
   */
  register(validator: FileValidator, options: ValidatorRegistrationOptions = {}): void {
    const { overwrite = false } = options

    if (this.validators.has(validator.name) && !overwrite) {
      throw new Error(`Validator "${validator.name}" is already registered. Use { overwrite: true } to replace.`)
    }

    this.validators.set(validator.name, validator)
  }

  /**
   * 검증기 해제
   * @param name 해제할 검증기 이름
   * @returns 해제 성공 여부
   */
  unregister(name: string): boolean {
    return this.validators.delete(name)
  }

  /**
   * 검증기 활성화/비활성화
   * @param name 검증기 이름
   * @param enabled 활성화 여부
   * @returns 설정 성공 여부
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const validator = this.validators.get(name)
    if (!validator) return false

    validator.enabled = enabled
    return true
  }

  /**
   * 검증기 존재 여부 확인
   * @param name 검증기 이름
   */
  has(name: string): boolean {
    return this.validators.has(name)
  }

  /**
   * 검증기 조회
   * @param name 검증기 이름
   */
  get(name: string): FileValidator | undefined {
    return this.validators.get(name)
  }

  /**
   * 등록된 모든 검증기 이름 목록
   */
  getValidatorNames(): string[] {
    return Array.from(this.validators.keys())
  }

  /**
   * 등록된 검증기 수
   */
  get size(): number {
    return this.validators.size
  }

  /**
   * 우선순위 순으로 정렬된 활성 검증기 목록
   */
  private getSortedActiveValidators(options: PipelineExecutionOptions = {}): FileValidator[] {
    const { only, exclude } = options

    let validators = Array.from(this.validators.values())
      .filter(v => v.enabled)

    // only 필터
    if (only && only.length > 0) {
      validators = validators.filter(v => only.includes(v.name))
    }

    // exclude 필터
    if (exclude && exclude.length > 0) {
      validators = validators.filter(v => !exclude.includes(v.name))
    }

    // 우선순위 순 정렬 (낮을수록 먼저)
    return validators.sort((a, b) => a.priority - b.priority)
  }

  /**
   * 단일 파일 검증
   * @param file 검증할 파일
   * @param options 실행 옵션
   * @returns 검증 결과
   */
  validate(file: File, options: PipelineExecutionOptions = {}): FileValidationResult {
    const { stopOnFirstFailure = true } = options
    const validators = this.getSortedActiveValidators(options)

    for (const validator of validators) {
      const result = validator.validate(file)

      if (!result.valid && stopOnFirstFailure) {
        return result
      }

      // stopOnFirstFailure가 false인 경우에도 첫 번째 실패 결과 저장
      if (!result.valid) {
        return result
      }
    }

    return { valid: true, file }
  }

  /**
   * 여러 파일 검증
   * @param files 검증할 파일 배열
   * @param options 실행 옵션
   * @returns 유효한 파일과 무효한 파일 분리 결과
   */
  validateFiles(
    files: File[],
    options: PipelineExecutionOptions = {}
  ): { validFiles: File[]; invalidFiles: FileValidationResult[] } {
    const validFiles: File[] = []
    const invalidFiles: FileValidationResult[] = []

    for (const file of files) {
      const result = this.validate(file, options)
      if (result.valid) {
        validFiles.push(file)
      } else {
        invalidFiles.push(result)
      }
    }

    return { validFiles, invalidFiles }
  }

  /**
   * 모든 검증기 제거
   */
  clear(): void {
    this.validators.clear()
  }

  /**
   * 파이프라인 복제 (새 인스턴스 생성)
   */
  clone(): ValidationPipeline {
    const newPipeline = new ValidationPipeline()
    for (const validator of this.validators.values()) {
      newPipeline.register({ ...validator })
    }
    return newPipeline
  }

  /**
   * 디버그용: 등록된 검증기 정보 출력
   */
  debug(): void {
    console.log('=== ValidationPipeline Debug ===')
    console.log(`Total validators: ${this.size}`)

    const sorted = this.getSortedActiveValidators()
    for (const v of sorted) {
      console.log(`  [${v.priority}] ${v.name} (${v.enabled ? 'enabled' : 'disabled'})`)
    }
  }
}
