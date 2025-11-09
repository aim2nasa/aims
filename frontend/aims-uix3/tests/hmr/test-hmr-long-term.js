/**
 * 장시간 HMR 안정성 테스트 (1시간)
 *
 * - 메모리 누수 감지
 * - 서버 크래시 감지
 * - HMR 안정성 장기 검증
 */

import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'

const execAsync = promisify(exec)

const FILES = {
  css: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css',
  tsx: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx',
  icon: './src/components/SFSymbol/SFSymbol.css'
}

const stats = {
  startTime: Date.now(),
  iterations: 0,
  cssChanges: 0,
  tsxChanges: 0,
  iconChanges: 0,
  crashes: 0,
  errors: [],
  memorySnapshots: []
}

async function checkServerAlive() {
  try {
    const { stdout } = await execAsync('netstat -ano | findstr :5173')
    return stdout.includes('LISTENING')
  } catch {
    return false
  }
}

async function getMemoryUsage() {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV')
    const lines = stdout.split('\n').filter(l => l.includes('node.exe'))

    let totalMemory = 0
    lines.forEach(line => {
      const match = line.match(/\"([0-9,]+) K\"/)
      if (match) {
        const memKB = parseInt(match[1].replace(/,/g, ''))
        totalMemory += memKB
      }
    })

    return totalMemory // KB
  } catch {
    return 0
  }
}

function log(emoji, message) {
  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  console.log(`[${minutes}:${seconds.toString().padStart(2, '0')}] ${emoji} ${message}`)
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function changeCSS() {
  try {
    const original = fs.readFileSync(FILES.css, 'utf-8')
    const testContent = `/* LONG-TEST-CSS-${stats.iterations}: ${Date.now()} */\n` + original
    fs.writeFileSync(FILES.css, testContent, 'utf-8')

    await wait(2000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.css, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.css, original, 'utf-8')
    stats.cssChanges++
  } catch (error) {
    stats.crashes++
    stats.errors.push({ type: 'CSS', iteration: stats.iterations, error: error.message })
    throw error
  }
}

async function changeTSX() {
  try {
    const original = fs.readFileSync(FILES.tsx, 'utf-8')
    const testContent = original.replace(
      '// 검색 결과 영역',
      `// LONG-TEST-TSX-${stats.iterations}: ${Date.now()}\n        // 검색 결과 영역`
    )
    fs.writeFileSync(FILES.tsx, testContent, 'utf-8')

    await wait(2000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.tsx, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.tsx, original, 'utf-8')
    stats.tsxChanges++
  } catch (error) {
    stats.crashes++
    stats.errors.push({ type: 'TSX', iteration: stats.iterations, error: error.message })
    throw error
  }
}

async function changeIcon() {
  try {
    if (!fs.existsSync(FILES.icon)) {
      return
    }

    const original = fs.readFileSync(FILES.icon, 'utf-8')
    const testContent = `/* LONG-TEST-ICON-${stats.iterations}: ${Date.now()} */\n` + original
    fs.writeFileSync(FILES.icon, testContent, 'utf-8')

    await wait(2000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.icon, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.icon, original, 'utf-8')
    stats.iconChanges++
  } catch (error) {
    stats.crashes++
    stats.errors.push({ type: 'Icon', iteration: stats.iterations, error: error.message })
    throw error
  }
}

async function runIteration() {
  stats.iterations++

  // 메모리 스냅샷 (10회마다)
  if (stats.iterations % 10 === 0) {
    const memory = await getMemoryUsage()
    stats.memorySnapshots.push({ iteration: stats.iterations, memoryKB: memory })
    log('📊', `메모리 사용량: ${(memory / 1024).toFixed(1)} MB`)
  }

  // 랜덤하게 파일 변경 (CSS, TSX, Icon 순환)
  const changeType = stats.iterations % 3

  if (changeType === 0) {
    await changeCSS()
  } else if (changeType === 1) {
    await changeTSX()
  } else {
    await changeIcon()
  }
}

async function main() {
  console.log('='.repeat(70))
  console.log('⏰ 장시간 HMR 안정성 테스트 (1시간)')
  console.log('='.repeat(70))
  console.log('')

  // 서버 확인
  log('🔍', '서버 상태 확인 중...')
  const serverRunning = await checkServerAlive()
  if (!serverRunning) {
    log('❌', '서버가 실행되지 않았습니다!')
    process.exit(1)
  }
  log('✅', '서버 실행 중')
  console.log('')

  log('🚀', '테스트 시작 - 1시간 동안 실행됩니다')
  log('⏰', '예상 종료 시간: ' + new Date(Date.now() + 3600000).toLocaleTimeString())
  console.log('')

  const endTime = Date.now() + (60 * 60 * 1000) // 1시간

  try {
    while (Date.now() < endTime) {
      await runIteration()

      // 진행 상황 보고 (50회마다)
      if (stats.iterations % 50 === 0) {
        const elapsed = Date.now() - stats.startTime
        const remaining = endTime - Date.now()
        const progress = ((elapsed / 3600000) * 100).toFixed(1)

        log('📈', `진행률: ${progress}% (${stats.iterations}회 반복)`)
        log('⏱️', `남은 시간: ${Math.floor(remaining / 60000)}분`)
        console.log('')
      }

      // 서버 크래시 감지
      if (stats.crashes > 0) {
        log('💥', `서버 크래시 감지! (${stats.crashes}회)`)
        break
      }

      await wait(2000) // 반복 간 대기
    }
  } catch (error) {
    log('❌', `테스트 중단: ${error.message}`)
  }

  // 최종 결과
  console.log('')
  console.log('='.repeat(70))
  console.log('📊 장시간 테스트 결과')
  console.log('='.repeat(70))

  const elapsed = Date.now() - stats.startTime
  const elapsedMinutes = Math.floor(elapsed / 60000)

  console.log(`⏱️  총 실행 시간: ${elapsedMinutes}분`)
  console.log(`🔄 총 반복 횟수: ${stats.iterations}`)
  console.log(`📝 CSS 변경: ${stats.cssChanges}`)
  console.log(`📝 TSX 변경: ${stats.tsxChanges}`)
  console.log(`🎨 아이콘 변경: ${stats.iconChanges}`)
  console.log(`💥 서버 크래시: ${stats.crashes}`)
  console.log('')

  // 메모리 분석
  if (stats.memorySnapshots.length > 1) {
    const firstMem = stats.memorySnapshots[0].memoryKB
    const lastMem = stats.memorySnapshots[stats.memorySnapshots.length - 1].memoryKB
    const memDiff = lastMem - firstMem
    const memGrowth = ((memDiff / firstMem) * 100).toFixed(1)

    console.log('💾 메모리 분석:')
    console.log(`   시작: ${(firstMem / 1024).toFixed(1)} MB`)
    console.log(`   종료: ${(lastMem / 1024).toFixed(1)} MB`)
    console.log(`   증가: ${(memDiff / 1024).toFixed(1)} MB (${memGrowth}%)`)

    if (Math.abs(parseFloat(memGrowth)) > 50) {
      log('⚠️', '메모리 누수 가능성 감지!')
    } else {
      log('✅', '메모리 사용량 정상')
    }
  }
  console.log('')

  // 에러 상세
  if (stats.errors.length > 0) {
    console.log('❌ 발생한 에러:')
    stats.errors.forEach(e => {
      console.log(`   [${e.iteration}회] ${e.type}: ${e.error}`)
    })
  }

  // 최종 서버 상태
  const finalServerAlive = await checkServerAlive()
  if (finalServerAlive) {
    log('✅', '최종 서버 상태: 정상 실행 중')
  } else {
    log('💥', '최종 서버 상태: 크래시!')
  }

  console.log('='.repeat(70))

  // 결과 저장
  fs.writeFileSync(
    './test-results-long-term.json',
    JSON.stringify(stats, null, 2),
    'utf-8'
  )
  log('💾', '결과 저장: test-results-long-term.json')

  process.exit(stats.crashes > 0 ? 1 : 0)
}

main()
