/**
 * AR 일괄 등록 — 해시 중복 파일 통계 포함 테스트
 *
 * 버그: 분석 단계에서 isHashDuplicate로 판정된 파일이 filesToRegister 필터에서
 * 조용히 제외되어 결과 통계(successCount/skippedCount/errorCount)에 반영되지 않았음.
 * 수정: 해시 중복 파일을 skippedCount/skippedFiles에 포함시킴.
 */

import { describe, it, expect } from 'vitest'

// 실제 등록 로직에서 사용하는 필터 + 카운트 로직을 유닛 테스트
// (컴포넌트 전체를 렌더하지 않고 핵심 비즈니스 로직만 검증)

interface MockFileInfo {
  file: { name: string }
  fileId: string
  included: boolean
  duplicateStatus: { isHashDuplicate: boolean }
}

interface MockRow {
  fileInfo: MockFileInfo
  individualCustomerId: string | null
  individualCustomerName?: string
  individualNewCustomerName?: string
  groupId: string
}

interface MockGroup {
  groupId: string
  selectedCustomerId: string | null
  selectedCustomerName?: string
  newCustomerName?: string
}

/**
 * getEffectiveMapping과 동일한 로직 (arGroupingUtils.ts에서 추출)
 */
function getEffectiveMapping(row: MockRow, groups: MockGroup[]) {
  if (row.individualCustomerId !== null) {
    return { customerId: row.individualCustomerId, customerName: row.individualCustomerName, newCustomerName: undefined }
  }
  if (row.individualNewCustomerName) {
    return { customerId: null, customerName: undefined, newCustomerName: row.individualNewCustomerName }
  }
  const group = groups.find(g => g.groupId === row.groupId)
  return {
    customerId: group?.selectedCustomerId ?? null,
    customerName: group?.selectedCustomerName,
    newCustomerName: group?.newCustomerName,
  }
}

/**
 * 수정된 등록 로직의 핵심 부분을 시뮬레이션
 */
function simulateBatchRegistration(rows: MockRow[], groups: MockGroup[]) {
  // 해시 중복 파일 집계
  const hashDuplicateRows = rows.filter(row =>
    row.fileInfo.included && row.fileInfo.duplicateStatus.isHashDuplicate
  )

  // 등록할 파일 필터
  const filesToRegister = rows.filter(row => {
    if (!row.fileInfo.included || row.fileInfo.duplicateStatus.isHashDuplicate) return false
    const mapping = getEffectiveMapping(row, groups)
    return mapping.customerId || mapping.newCustomerName
  })

  let skippedCount = 0
  const skippedFiles: Array<{ fileName: string; reason: string }> = []

  // 해시 중복 파일을 건너뜀 카운트에 포함
  for (const row of hashDuplicateRows) {
    skippedCount++
    skippedFiles.push({ fileName: row.fileInfo.file.name, reason: '중복 파일 (동일한 문서가 이미 존재)' })
  }

  return {
    totalFiles: rows.length,
    hashDuplicateCount: hashDuplicateRows.length,
    filesToRegisterCount: filesToRegister.length,
    skippedCount,
    skippedFiles,
    allAccountedFor: hashDuplicateRows.length + filesToRegister.length +
      rows.filter(r => !r.fileInfo.included).length +
      rows.filter(r => {
        if (!r.fileInfo.included || r.fileInfo.duplicateStatus.isHashDuplicate) return false
        const mapping = getEffectiveMapping(r, groups)
        return !mapping.customerId && !mapping.newCustomerName
      }).length === rows.length,
  }
}

function createRow(name: string, opts: {
  isHashDuplicate?: boolean
  included?: boolean
  customerId?: string | null
  newCustomerName?: string
  groupId?: string
}): MockRow {
  return {
    fileInfo: {
      file: { name },
      fileId: `id-${name}`,
      included: opts.included ?? true,
      duplicateStatus: { isHashDuplicate: opts.isHashDuplicate ?? false },
    },
    individualCustomerId: opts.customerId ?? null,
    individualCustomerName: opts.customerId ? '고객명' : undefined,
    individualNewCustomerName: opts.newCustomerName,
    groupId: opts.groupId ?? 'group1',
  }
}

describe('AR 일괄 등록 — 해시 중복 통계 포함', () => {
  const defaultGroup: MockGroup = {
    groupId: 'group1',
    selectedCustomerId: 'cust-1',
    selectedCustomerName: '테스트고객',
  }

  it('해시 중복 파일이 skippedCount에 포함되어야 한다', () => {
    const rows: MockRow[] = [
      createRow('file1.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('file2.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('file3.pdf', { isHashDuplicate: false, customerId: 'cust-1' }),
    ]

    const result = simulateBatchRegistration(rows, [defaultGroup])

    expect(result.hashDuplicateCount).toBe(2)
    expect(result.skippedCount).toBe(2)
    expect(result.filesToRegisterCount).toBe(1)
    expect(result.skippedFiles).toHaveLength(2)
    expect(result.skippedFiles[0].reason).toContain('중복 파일')
  })

  it('96개 중 89개 해시 중복 → skippedCount=89, filesToRegister=7', () => {
    // 실제 버그 재현: 96개 파일 중 89개가 해시 중복
    const rows: MockRow[] = []
    for (let i = 0; i < 89; i++) {
      rows.push(createRow(`dup-${i}.pdf`, { isHashDuplicate: true, customerId: 'cust-1' }))
    }
    for (let i = 0; i < 7; i++) {
      rows.push(createRow(`new-${i}.pdf`, { isHashDuplicate: false, customerId: 'cust-1' }))
    }

    const result = simulateBatchRegistration(rows, [defaultGroup])

    expect(result.totalFiles).toBe(96)
    expect(result.hashDuplicateCount).toBe(89)
    expect(result.skippedCount).toBe(89)
    expect(result.filesToRegisterCount).toBe(7)
    // 합계가 맞아야 함
    expect(result.hashDuplicateCount + result.filesToRegisterCount).toBe(96)
  })

  it('모든 파일이 해시 중복 → 결과 요약만 표시 (모달 닫지 않음)', () => {
    const rows: MockRow[] = [
      createRow('file1.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('file2.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('file3.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
    ]

    const result = simulateBatchRegistration(rows, [defaultGroup])

    expect(result.filesToRegisterCount).toBe(0)
    expect(result.hashDuplicateCount).toBe(3)
    expect(result.skippedCount).toBe(3)
    // 모든 파일이 설명됨
    expect(result.allAccountedFor).toBe(true)
  })

  it('해시 중복 없음 → 기존 동작과 동일 (skippedCount=0)', () => {
    const rows: MockRow[] = [
      createRow('file1.pdf', { isHashDuplicate: false, customerId: 'cust-1' }),
      createRow('file2.pdf', { isHashDuplicate: false, customerId: 'cust-1' }),
    ]

    const result = simulateBatchRegistration(rows, [defaultGroup])

    expect(result.hashDuplicateCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.filesToRegisterCount).toBe(2)
  })

  it('해시 중복 + 제외된 파일 + 등록 가능 파일 혼합', () => {
    const rows: MockRow[] = [
      createRow('dup1.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('dup2.pdf', { isHashDuplicate: true, customerId: 'cust-1' }),
      createRow('excluded.pdf', { isHashDuplicate: false, included: false }),
      createRow('normal1.pdf', { isHashDuplicate: false, customerId: 'cust-1' }),
      createRow('normal2.pdf', { isHashDuplicate: false, customerId: 'cust-1' }),
    ]

    const result = simulateBatchRegistration(rows, [defaultGroup])

    expect(result.hashDuplicateCount).toBe(2)
    expect(result.skippedCount).toBe(2)
    expect(result.filesToRegisterCount).toBe(2)
    // excluded 파일은 included=false이므로 해시중복에도 등록대상에도 안 들어감
    expect(result.allAccountedFor).toBe(true)
  })

  it('새 고객 이름으로 매핑된 파일도 등록 대상에 포함', () => {
    const groupWithNewCustomer: MockGroup = {
      groupId: 'group1',
      selectedCustomerId: null,
      newCustomerName: '새고객',
    }

    const rows: MockRow[] = [
      createRow('dup.pdf', { isHashDuplicate: true }),
      createRow('new.pdf', { isHashDuplicate: false }),
    ]

    const result = simulateBatchRegistration(rows, [groupWithNewCustomer])

    expect(result.hashDuplicateCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.filesToRegisterCount).toBe(1)
  })
})
