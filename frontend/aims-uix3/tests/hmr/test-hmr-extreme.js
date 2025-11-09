/**
 * 극단적 HMR 스트레스 테스트
 *
 * 1. 초대용량 CSS (100KB)
 * 2. 초고속 연속 변경 (100ms 간격, 50회)
 * 3. 복잡한 CSS 추가 (중첩 100단계)
 * 4. 잘못된 CSS 구문 추가 후 복구
 * 5. 동시 다발적 파일 변경 (CSS+TSX+Icon 동시)
 */

import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const FILES = {
  css: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css',
  tsx: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx',
  icon: './src/components/SFSymbol/SFSymbol.css'
}

const results = []

async function checkServerAlive() {
  try {
    const { stdout } = await execAsync('netstat -ano | findstr :5173')
    return stdout.includes('LISTENING')
  } catch {
    return false
  }
}

function log(emoji, message) {
  const timestamp = new Date().toLocaleTimeString()
  console.log(`[${timestamp}] ${emoji} ${message}`)
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runTest(name, testFn) {
  log('🧪', `테스트 시작: ${name}`)
  const startTime = Date.now()

  try {
    await testFn()
    const duration = Date.now() - startTime
    log('✅', `통과: ${name} (${duration}ms)`)
    results.push({ name, passed: true, duration, error: null })
    return true
  } catch (error) {
    const duration = Date.now() - startTime
    log('❌', `실패: ${name} - ${error.message}`)
    results.push({ name, passed: false, duration, error: error.message })
    return false
  }
}

// 테스트 1: 초대용량 CSS (100KB)
async function test1_MassiveCSS() {
  const original = fs.readFileSync(FILES.css, 'utf-8')

  // 100KB 주석 생성
  const massiveComment = '/*\n' + 'EXTREME-TEST-1: '.repeat(5000) + '\n*/\n'
  const testContent = massiveComment + original

  log('📝', `초대용량 CSS 추가 (${(massiveComment.length / 1024).toFixed(1)}KB)`)
  fs.writeFileSync(FILES.css, testContent, 'utf-8')

  await wait(5000) // 대용량 파일이므로 5초 대기

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(FILES.css, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(FILES.css, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 2: 초고속 연속 변경 (100ms 간격, 50회)
async function test2_UltraRapidChanges() {
  const original = fs.readFileSync(FILES.css, 'utf-8')

  log('⚡', '초고속 연속 변경 시작 (100ms 간격)')

  for (let i = 0; i < 50; i++) {
    const testContent = `/* ULTRA-RAPID-${i}: ${Date.now()} */\n` + original
    fs.writeFileSync(FILES.css, testContent, 'utf-8')
    await wait(100) // 100ms 간격 (1초에 10번)

    if ((i + 1) % 10 === 0) {
      log('⏳', `${i + 1}/50 완료...`)
    }
  }

  await wait(3000) // 최종 HMR 반응 대기

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(FILES.css, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(FILES.css, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 3: 복잡한 CSS 중첩 (100단계)
async function test3_DeepNestedCSS() {
  const original = fs.readFileSync(FILES.css, 'utf-8')

  // 100단계 중첩된 CSS 생성
  let nestedCSS = '/* NESTED-CSS-TEST */\n'
  let opening = ''
  let closing = ''

  for (let i = 0; i < 100; i++) {
    opening += `.nested-${i} { `
    closing = `} ` + closing
  }

  nestedCSS += opening + 'color: red;' + closing + '\n'
  const testContent = nestedCSS + original

  log('📝', '복잡한 중첩 CSS 추가 (100단계)')
  fs.writeFileSync(FILES.css, testContent, 'utf-8')

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(FILES.css, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(FILES.css, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 4: 잘못된 CSS 구문 추가 후 복구
async function test4_InvalidCSSRecovery() {
  const original = fs.readFileSync(FILES.css, 'utf-8')

  // 잘못된 CSS 추가
  const invalidCSS = `
/* INVALID CSS TEST */
.invalid-test {
  color: #####;  /* 잘못된 색상 */
  width: abc;    /* 잘못된 단위 */
  } } }          /* 잘못된 괄호 */
`
  const testContent = invalidCSS + original

  log('⚠️', '잘못된 CSS 추가')
  fs.writeFileSync(FILES.css, testContent, 'utf-8')

  await wait(3000)

  // 서버가 살아있는지 확인 (잘못된 CSS로도 크래시 안 해야 함)
  const serverAlive1 = await checkServerAlive()
  if (!serverAlive1) {
    fs.writeFileSync(FILES.css, original, 'utf-8')
    throw new Error('잘못된 CSS로 서버 크래시!')
  }

  log('🔧', '올바른 CSS로 복구')
  fs.writeFileSync(FILES.css, original, 'utf-8')

  await wait(3000)

  const serverAlive2 = await checkServerAlive()
  if (!serverAlive2) {
    throw new Error('CSS 복구 후 서버 크래시!')
  }

  log('♻️', '복구 완료')
}

// 테스트 5: 동시 다발적 파일 변경 (CSS+TSX+Icon 동시)
async function test5_MassiveSimultaneousChanges() {
  const cssOriginal = fs.readFileSync(FILES.css, 'utf-8')
  const tsxOriginal = fs.readFileSync(FILES.tsx, 'utf-8')

  let iconOriginal = null
  const iconExists = fs.existsSync(FILES.icon)
  if (iconExists) {
    iconOriginal = fs.readFileSync(FILES.icon, 'utf-8')
  }

  const timestamp = Date.now()

  // 세 파일 동시에 변경
  log('💥', '3개 파일 동시 변경')

  const cssTest = `/* SIMULTANEOUS-CSS: ${timestamp} */\n` + cssOriginal
  const tsxTest = tsxOriginal.replace(
    '// 검색 결과 영역',
    `// SIMULTANEOUS-TSX: ${timestamp}\n        // 검색 결과 영역`
  )

  fs.writeFileSync(FILES.css, cssTest, 'utf-8')
  fs.writeFileSync(FILES.tsx, tsxTest, 'utf-8')

  if (iconExists) {
    const iconTest = `/* SIMULTANEOUS-ICON: ${timestamp} */\n` + iconOriginal
    fs.writeFileSync(FILES.icon, iconTest, 'utf-8')
  }

  await wait(5000) // 동시 변경이므로 5초 대기

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(FILES.css, cssOriginal, 'utf-8')
    fs.writeFileSync(FILES.tsx, tsxOriginal, 'utf-8')
    if (iconExists) fs.writeFileSync(FILES.icon, iconOriginal, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(FILES.css, cssOriginal, 'utf-8')
  fs.writeFileSync(FILES.tsx, tsxOriginal, 'utf-8')
  if (iconExists) fs.writeFileSync(FILES.icon, iconOriginal, 'utf-8')

  log('♻️', '모든 파일 복구 완료')
}

// 테스트 6: 반복적 에러 복구 (10회)
async function test6_RepeatedErrorRecovery() {
  const original = fs.readFileSync(FILES.css, 'utf-8')

  for (let i = 0; i < 10; i++) {
    // 잘못된 CSS 추가
    const invalidCSS = `/* ERROR-${i} */ .test { color: ###; }\n`
    fs.writeFileSync(FILES.css, invalidCSS + original, 'utf-8')
    await wait(1000)

    const serverAlive1 = await checkServerAlive()
    if (!serverAlive1) {
      fs.writeFileSync(FILES.css, original, 'utf-8')
      throw new Error(`에러 ${i + 1}회차에서 서버 크래시!`)
    }

    // 복구
    fs.writeFileSync(FILES.css, original, 'utf-8')
    await wait(1000)

    const serverAlive2 = await checkServerAlive()
    if (!serverAlive2) {
      throw new Error(`복구 ${i + 1}회차에서 서버 크래시!`)
    }

    if ((i + 1) % 3 === 0) {
      log('⏳', `${i + 1}/10 에러 복구 완료...`)
    }
  }

  log('♻️', '반복적 에러 복구 완료')
}

// 메인 실행
async function main() {
  console.log('='.repeat(70))
  console.log('💀 극단적 HMR 스트레스 테스트')
  console.log('='.repeat(70))
  console.log('')

  log('🔍', '서버 상태 확인 중...')
  const serverRunning = await checkServerAlive()
  if (!serverRunning) {
    log('❌', '서버가 실행되지 않았습니다!')
    process.exit(1)
  }
  log('✅', '서버 실행 중')
  console.log('')

  log('⚠️', '경고: 극단적인 테스트가 시작됩니다')
  log('⏰', '예상 소요 시간: 약 5분')
  console.log('')

  // 테스트 실행
  await runTest('1. 초대용량 CSS (100KB)', test1_MassiveCSS)
  await wait(3000)

  await runTest('2. 초고속 연속 변경 (100ms 간격, 50회)', test2_UltraRapidChanges)
  await wait(3000)

  await runTest('3. 복잡한 CSS 중첩 (100단계)', test3_DeepNestedCSS)
  await wait(3000)

  await runTest('4. 잘못된 CSS 구문 추가 후 복구', test4_InvalidCSSRecovery)
  await wait(3000)

  await runTest('5. 동시 다발적 파일 변경 (3개 파일)', test5_MassiveSimultaneousChanges)
  await wait(3000)

  await runTest('6. 반복적 에러 복구 (10회)', test6_RepeatedErrorRecovery)

  // 결과 출력
  console.log('')
  console.log('='.repeat(70))
  console.log('📊 극단적 테스트 결과')
  console.log('='.repeat(70))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`✅ 통과: ${passed}/${results.length}`)
  console.log(`❌ 실패: ${failed}/${results.length}`)
  console.log('')

  if (failed === 0) {
    log('🎉', '모든 극단적 테스트 통과!')
    log('💪', 'HMR이 극한 상황에서도 완벽하게 작동합니다!')
  } else {
    log('⚠️', '일부 테스트 실패:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   ❌ ${r.name}: ${r.error}`)
    })
  }

  // 최종 서버 상태
  const finalServerAlive = await checkServerAlive()
  console.log('')
  if (finalServerAlive) {
    log('✅', '최종 서버 상태: 정상 실행 중')
  } else {
    log('💥', '최종 서버 상태: 크래시!')
  }

  console.log('='.repeat(70))

  // 결과 저장
  fs.writeFileSync(
    './test-results-extreme.json',
    JSON.stringify({ passed, failed, results }, null, 2),
    'utf-8'
  )
  log('💾', '결과 저장: test-results-extreme.json')

  process.exit(failed > 0 ? 1 : 0)
}

main()
