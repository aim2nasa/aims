/**
 * Vitest Test Setup
 * @description 테스트 환경 설정 파일
 */

import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 각 테스트 후 자동 cleanup
afterEach(() => {
  cleanup()
})
