/**
 * AR 배치 등록 성능 시뮬레이션 테스트
 *
 * 수정 전(O(n²)) vs 수정 후(O(n)) 배열 복사 비용 비교
 * - 745개 파일 등록 시나리오 시뮬레이션
 * - setUploadState, addLog, handleProgress 패턴 비교
 */

import { describe, it, expect } from 'vitest'

interface MockFile {
  id: string
  name: string
  size: number
  status: string
}

describe('AR 배치 등록 성능 시뮬레이션', () => {
  const FILE_COUNT = 745
  const BATCH_FLUSH_SIZE = 50
  const PROGRESS_THROTTLE_MS = 300
  const LOG_FLUSH_SIZE = 20

  /**
   * 수정 전: 매 파일마다 [...prev, newItem] 패턴
   */
  it('수정 전 (O(n²)): 매 파일마다 배열 전체 복사', () => {
    let files: MockFile[] = []
    let totalCopies = 0

    const startTime = performance.now()

    for (let i = 0; i < FILE_COUNT; i++) {
      const newFile: MockFile = { id: `file-${i}`, name: `file_${i}.pdf`, size: 100000, status: 'pending' }
      // 수정 전 패턴: [...prev.files, newItem]
      files = [...files, newFile]
      totalCopies += files.length // 복사된 요소 수 누적
    }

    const elapsed = performance.now() - startTime

    console.log(`[수정 전] ${FILE_COUNT}개 파일:`)
    console.log(`  소요 시간: ${elapsed.toFixed(1)}ms`)
    console.log(`  총 배열 복사 횟수: ${totalCopies.toLocaleString()}회`)
    console.log(`  최종 배열 크기: ${files.length}`)

    // O(n²) = n(n+1)/2 = 745*746/2 = 277,885
    expect(totalCopies).toBe((FILE_COUNT * (FILE_COUNT + 1)) / 2)
    expect(files.length).toBe(FILE_COUNT)
  })

  /**
   * 수정 후: 버퍼에 모아서 50개마다 플러시
   */
  it('수정 후 (O(n)): 50개 단위 배치 플러시', () => {
    let files: MockFile[] = []
    const buffer: MockFile[] = []
    let totalCopies = 0
    let flushCount = 0

    const flush = () => {
      if (buffer.length === 0) return
      const batch = buffer.splice(0)
      files = [...files, ...batch]
      totalCopies += files.length // 복사된 요소 수
      flushCount++
    }

    const startTime = performance.now()

    for (let i = 0; i < FILE_COUNT; i++) {
      const newFile: MockFile = { id: `file-${i}`, name: `file_${i}.pdf`, size: 100000, status: 'pending' }
      buffer.push(newFile)
      if (buffer.length >= BATCH_FLUSH_SIZE) {
        flush()
      }
    }
    flush() // 잔여 플러시

    const elapsed = performance.now() - startTime

    console.log(`\n[수정 후] ${FILE_COUNT}개 파일 (배치 크기: ${BATCH_FLUSH_SIZE}):`)
    console.log(`  소요 시간: ${elapsed.toFixed(1)}ms`)
    console.log(`  총 배열 복사 횟수: ${totalCopies.toLocaleString()}회`)
    console.log(`  플러시 횟수: ${flushCount}회`)
    console.log(`  최종 배열 크기: ${files.length}`)

    expect(files.length).toBe(FILE_COUNT)
    expect(flushCount).toBe(Math.ceil(FILE_COUNT / BATCH_FLUSH_SIZE))
    // O(n) 총 복사: 50 + 100 + 150 + ... + 745 = 훨씬 적음
    expect(totalCopies).toBeLessThan((FILE_COUNT * (FILE_COUNT + 1)) / 2)
  })

  /**
   * 개선 비율 정량 비교
   */
  it('개선 비율: 수정 전 대비 수정 후 복사 횟수 비교', () => {
    // 수정 전: 1 + 2 + 3 + ... + 745 = 277,885
    const oldCopies = (FILE_COUNT * (FILE_COUNT + 1)) / 2

    // 수정 후: 50 + 100 + 150 + ... + 750 (마지막은 745)
    let newCopies = 0
    let accumulated = 0
    for (let i = 0; i < FILE_COUNT; i++) {
      accumulated++
      if (accumulated >= BATCH_FLUSH_SIZE || i === FILE_COUNT - 1) {
        const currentSize = (i + 1)
        newCopies += currentSize
        accumulated = 0
      }
    }

    const ratio = oldCopies / newCopies
    console.log(`\n[비교]`)
    console.log(`  수정 전 총 복사: ${oldCopies.toLocaleString()}회`)
    console.log(`  수정 후 총 복사: ${newCopies.toLocaleString()}회`)
    console.log(`  개선 비율: ${ratio.toFixed(1)}배 감소`)

    expect(ratio).toBeGreaterThan(10) // 최소 10배 이상 개선
  })

  /**
   * addLog 배치 버퍼링 시뮬레이션
   * 수정 전: 매 호출마다 [newLog, ...prev]
   * 수정 후: 버퍼에 모아서 20개마다 플러시
   */
  it('addLog 배치: 매 호출 복사 vs 20개 단위 플러시', () => {
    const LOG_COUNT = FILE_COUNT * 2 // 파일당 약 2개 로그

    // 수정 전
    let oldLogs: string[] = []
    let oldCopies = 0
    const oldStart = performance.now()
    for (let i = 0; i < LOG_COUNT; i++) {
      oldLogs = [`log_${i}`, ...oldLogs]
      oldCopies += oldLogs.length
    }
    const oldElapsed = performance.now() - oldStart

    // 수정 후
    let newLogs: string[] = []
    const logBuffer: string[] = []
    let newCopies = 0
    const newStart = performance.now()
    for (let i = 0; i < LOG_COUNT; i++) {
      logBuffer.push(`log_${i}`)
      if (logBuffer.length >= LOG_FLUSH_SIZE) {
        const batch = logBuffer.splice(0).reverse()
        newLogs = [...batch, ...newLogs]
        newCopies += newLogs.length
      }
    }
    if (logBuffer.length > 0) {
      const batch = logBuffer.splice(0).reverse()
      newLogs = [...batch, ...newLogs]
      newCopies += newLogs.length
    }
    const newElapsed = performance.now() - newStart

    const ratio = oldCopies / newCopies

    console.log(`\n[addLog 비교] ${LOG_COUNT}개 로그:`)
    console.log(`  수정 전: ${oldElapsed.toFixed(1)}ms, ${oldCopies.toLocaleString()} 복사`)
    console.log(`  수정 후: ${newElapsed.toFixed(1)}ms, ${newCopies.toLocaleString()} 복사`)
    console.log(`  개선 비율: ${ratio.toFixed(1)}배 감소`)

    expect(ratio).toBeGreaterThan(5)
    expect(newLogs.length).toBe(LOG_COUNT)
  })

  /**
   * handleProgress 스로틀 시뮬레이션
   * 수정 전: 모든 progress event → files.map() 전체 순회
   * 수정 후: 파일당 300ms 간격 스로틀
   */
  it('handleProgress 스로틀: 초당 map 호출 횟수 비교', () => {
    const CONCURRENT_UPLOADS = 3
    const PROGRESS_INTERVAL_MS = 50 // 50ms마다 progress event
    const DURATION_MS = 5000 // 5초간 시뮬레이션
    const TOTAL_FILES_IN_STATE = 500 // 상태에 500개 파일

    // 수정 전: 모든 progress event 처리
    let oldMapCalls = 0
    for (let t = 0; t < DURATION_MS; t += PROGRESS_INTERVAL_MS) {
      for (let c = 0; c < CONCURRENT_UPLOADS; c++) {
        oldMapCalls++ // 매번 files.map() 호출
      }
    }
    const oldTotalIterations = oldMapCalls * TOTAL_FILES_IN_STATE

    // 수정 후: 파일당 300ms 간격 스로틀
    let newMapCalls = 0
    const lastUpdate = new Map<number, number>()
    for (let t = 0; t < DURATION_MS; t += PROGRESS_INTERVAL_MS) {
      for (let c = 0; c < CONCURRENT_UPLOADS; c++) {
        const last = lastUpdate.get(c) || 0
        if (t - last >= PROGRESS_THROTTLE_MS) {
          newMapCalls++
          lastUpdate.set(c, t)
        }
      }
    }
    const newTotalIterations = newMapCalls * TOTAL_FILES_IN_STATE

    const ratio = oldMapCalls / newMapCalls

    console.log(`\n[handleProgress 스로틀] ${DURATION_MS}ms, ${CONCURRENT_UPLOADS} 동시 업로드:`)
    console.log(`  수정 전: ${oldMapCalls}회 map (${oldTotalIterations.toLocaleString()} 배열 순회)`)
    console.log(`  수정 후: ${newMapCalls}회 map (${newTotalIterations.toLocaleString()} 배열 순회)`)
    console.log(`  개선 비율: ${ratio.toFixed(1)}배 감소`)

    expect(ratio).toBeGreaterThan(3) // 최소 3배 이상 감소
  })

  /**
   * 전체 복합 시뮬레이션: 등록 루프 + 업로드 progress + addLog 동시 발생
   */
  it('복합 시뮬레이션: 745파일 등록 전체 비용 비교', () => {
    // 파일 상태 배열 복사 비용
    const oldFileCopies = (FILE_COUNT * (FILE_COUNT + 1)) / 2 // 277,885

    let newFileCopies = 0
    let acc = 0
    for (let i = 1; i <= FILE_COUNT; i++) {
      acc++
      if (acc >= BATCH_FLUSH_SIZE || i === FILE_COUNT) {
        newFileCopies += i
        acc = 0
      }
    }

    // 로그 배열 복사 비용 (파일당 2개 로그)
    const LOG_COUNT = FILE_COUNT * 2
    const oldLogCopies = (LOG_COUNT * (LOG_COUNT + 1)) / 2

    let newLogCopies = 0
    acc = 0
    for (let i = 1; i <= LOG_COUNT; i++) {
      acc++
      if (acc >= LOG_FLUSH_SIZE || i === LOG_COUNT) {
        newLogCopies += i
        acc = 0
      }
    }

    // handleProgress 비용 (등록 중 백그라운드 업로드)
    // 평균 500개 파일 상태에서 초당 60회 map vs 스로틀 후 10회
    const UPLOAD_DURATION_SEC = 300 // 5분 업로드
    const AVG_FILES = 400
    const oldProgressMaps = 60 * UPLOAD_DURATION_SEC * AVG_FILES // 7,200,000
    const newProgressMaps = 10 * UPLOAD_DURATION_SEC * AVG_FILES // 1,200,000

    const oldTotal = oldFileCopies + oldLogCopies + oldProgressMaps
    const newTotal = newFileCopies + newLogCopies + newProgressMaps

    console.log(`\n[전체 복합 시뮬레이션] 745 파일 등록:`)
    console.log(`  ┌─────────────────────┬──────────────────┬──────────────────┐`)
    console.log(`  │ 항목                │ 수정 전          │ 수정 후          │`)
    console.log(`  ├─────────────────────┼──────────────────┼──────────────────┤`)
    console.log(`  │ 파일 상태 복사      │ ${oldFileCopies.toLocaleString().padStart(16)} │ ${newFileCopies.toLocaleString().padStart(16)} │`)
    console.log(`  │ 로그 복사           │ ${oldLogCopies.toLocaleString().padStart(16)} │ ${newLogCopies.toLocaleString().padStart(16)} │`)
    console.log(`  │ Progress 순회       │ ${oldProgressMaps.toLocaleString().padStart(16)} │ ${newProgressMaps.toLocaleString().padStart(16)} │`)
    console.log(`  ├─────────────────────┼──────────────────┼──────────────────┤`)
    console.log(`  │ 합계                │ ${oldTotal.toLocaleString().padStart(16)} │ ${newTotal.toLocaleString().padStart(16)} │`)
    console.log(`  └─────────────────────┴──────────────────┴──────────────────┘`)
    console.log(`  전체 개선 비율: ${(oldTotal / newTotal).toFixed(1)}배 감소`)

    expect(oldTotal / newTotal).toBeGreaterThan(3)
    expect(newTotal).toBeLessThan(oldTotal)
  })
})
