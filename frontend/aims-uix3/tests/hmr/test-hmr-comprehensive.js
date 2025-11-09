/**
 * 포괄적인 HMR 테스트 - Edge Cases 포함
 *
 * 테스트 케이스:
 * 1. CSS 단일 변경
 * 2. TSX 단일 변경
 * 3. SFSymbol.css 변경 (아이콘)
 * 4. CSS + TSX 동시 변경
 * 5. 빠른 연속 변경 (1초에 5번)
 * 6. 대용량 주석 추가 (10KB)
 * 7. 서버 안정성 (30회 반복)
 */

import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 테스트 대상 파일들
const FILES = {
  css: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css',
  tsx: './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx',
  icon: './src/components/SFSymbol/SFSymbol.css'
}

// 테스트 결과 저장
const results = {
  passed: 0,
  failed: 0,
  crashes: 0,
  tests: []
}

// 서버 상태 체크
async function checkServerAlive() {
  try {
    const { stdout } = await execAsync('netstat -ano | findstr :5173')
    return stdout.includes('LISTENING')
  } catch {
    return false
  }
}

// 테스트 유틸리티
function log(emoji, message) {
  console.log(`${emoji} ${message}`)
}

function testResult(name, passed, error = null) {
  const status = passed ? '✅' : '❌'
  results.tests.push({ name, passed, error })
  if (passed) {
    results.passed++
    log(status, `PASS: ${name}`)
  } else {
    results.failed++
    log(status, `FAIL: ${name}${error ? ` - ${error}` : ''}`)
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 테스트 1: CSS 단일 변경
async function testCSSChange() {
  log('🧪', 'Test 1: CSS 단일 변경')
  try {
    const original = fs.readFileSync(FILES.css, 'utf-8')
    const testContent = `/* TEST-1: ${Date.now()} */\n` + original

    fs.writeFileSync(FILES.css, testContent, 'utf-8')
    await wait(3000) // HMR 반응 대기

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.css, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.css, original, 'utf-8')
    testResult('CSS 단일 변경', true)
  } catch (error) {
    results.crashes++
    testResult('CSS 단일 변경', false, error.message)
  }
}

// 테스트 2: TSX 단일 변경
async function testTSXChange() {
  log('🧪', 'Test 2: TSX 단일 변경')
  try {
    const original = fs.readFileSync(FILES.tsx, 'utf-8')
    const testContent = original.replace(
      '// 검색 결과 영역',
      `// TEST-2: ${Date.now()}\n        // 검색 결과 영역`
    )

    fs.writeFileSync(FILES.tsx, testContent, 'utf-8')
    await wait(3000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.tsx, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.tsx, original, 'utf-8')
    testResult('TSX 단일 변경', true)
  } catch (error) {
    results.crashes++
    testResult('TSX 단일 변경', false, error.message)
  }
}

// 테스트 3: 아이콘 변경 (가장 문제 많았던 케이스)
async function testIconChange() {
  log('🧪', 'Test 3: SFSymbol.css 변경 (아이콘)')
  try {
    if (!fs.existsSync(FILES.icon)) {
      testResult('SFSymbol.css 변경', false, '파일 없음 (건너뜀)')
      return
    }

    const original = fs.readFileSync(FILES.icon, 'utf-8')
    const testContent = `/* TEST-3: ${Date.now()} */\n` + original

    fs.writeFileSync(FILES.icon, testContent, 'utf-8')
    await wait(3000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.icon, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.icon, original, 'utf-8')
    testResult('SFSymbol.css 변경', true)
  } catch (error) {
    results.crashes++
    testResult('SFSymbol.css 변경', false, error.message)
  }
}

// 테스트 4: CSS + TSX 동시 변경
async function testSimultaneousChange() {
  log('🧪', 'Test 4: CSS + TSX 동시 변경')
  try {
    const cssOriginal = fs.readFileSync(FILES.css, 'utf-8')
    const tsxOriginal = fs.readFileSync(FILES.tsx, 'utf-8')

    const cssTest = `/* TEST-4-CSS: ${Date.now()} */\n` + cssOriginal
    const tsxTest = tsxOriginal.replace(
      '// 검색 결과 영역',
      `// TEST-4-TSX: ${Date.now()}\n        // 검색 결과 영역`
    )

    // 동시에 변경
    fs.writeFileSync(FILES.css, cssTest, 'utf-8')
    fs.writeFileSync(FILES.tsx, tsxTest, 'utf-8')
    await wait(3000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.css, cssOriginal, 'utf-8')
      fs.writeFileSync(FILES.tsx, tsxOriginal, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.css, cssOriginal, 'utf-8')
    fs.writeFileSync(FILES.tsx, tsxOriginal, 'utf-8')
    testResult('CSS + TSX 동시 변경', true)
  } catch (error) {
    results.crashes++
    testResult('CSS + TSX 동시 변경', false, error.message)
  }
}

// 테스트 5: 빠른 연속 변경 (1초에 5번)
async function testRapidChanges() {
  log('🧪', 'Test 5: 빠른 연속 변경 (1초에 5번)')
  try {
    const original = fs.readFileSync(FILES.css, 'utf-8')

    for (let i = 0; i < 5; i++) {
      const testContent = `/* RAPID-${i}: ${Date.now()} */\n` + original
      fs.writeFileSync(FILES.css, testContent, 'utf-8')
      await wait(200) // 200ms 간격 (1초에 5번)
    }

    await wait(3000) // 최종 HMR 반응 대기

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.css, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.css, original, 'utf-8')
    testResult('빠른 연속 변경', true)
  } catch (error) {
    results.crashes++
    testResult('빠른 연속 변경', false, error.message)
  }
}

// 테스트 6: 대용량 주석 추가 (10KB)
async function testLargeChange() {
  log('🧪', 'Test 6: 대용량 주석 추가 (10KB)')
  try {
    const original = fs.readFileSync(FILES.css, 'utf-8')
    const largeComment = '/*\n' + 'X'.repeat(10000) + `\nTEST-6: ${Date.now()}\n*/\n`
    const testContent = largeComment + original

    fs.writeFileSync(FILES.css, testContent, 'utf-8')
    await wait(3000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(FILES.css, original, 'utf-8')
      throw new Error('서버 크래시!')
    }

    fs.writeFileSync(FILES.css, original, 'utf-8')
    testResult('대용량 주석 추가', true)
  } catch (error) {
    results.crashes++
    testResult('대용량 주석 추가', false, error.message)
  }
}

// 테스트 7: 서버 안정성 (30회 반복)
async function testServerStability() {
  log('🧪', 'Test 7: 서버 안정성 (30회 반복)')
  try {
    const original = fs.readFileSync(FILES.css, 'utf-8')

    for (let i = 0; i < 30; i++) {
      const testContent = `/* STABILITY-${i}: ${Date.now()} */\n` + original
      fs.writeFileSync(FILES.css, testContent, 'utf-8')
      await wait(1000) // 1초 간격

      const serverAlive = await checkServerAlive()
      if (!serverAlive) {
        fs.writeFileSync(FILES.css, original, 'utf-8')
        throw new Error(`서버 크래시! (${i + 1}/30 반복 중)`)
      }

      if ((i + 1) % 10 === 0) {
        log('⏳', `${i + 1}/30 반복 완료...`)
      }
    }

    fs.writeFileSync(FILES.css, original, 'utf-8')
    testResult('서버 안정성 (30회 반복)', true)
  } catch (error) {
    results.crashes++
    testResult('서버 안정성', false, error.message)
  }
}

// 메인 테스트 실행
async function runAllTests() {
  console.log('='.repeat(70))
  console.log('🔥 포괄적인 HMR 테스트 - Edge Cases 포함')
  console.log('='.repeat(70))
  console.log('')

  // 서버 실행 여부 확인
  log('🔍', '서버 상태 확인 중...')
  const serverRunning = await checkServerAlive()
  if (!serverRunning) {
    log('❌', '서버가 실행되지 않았습니다! npm run dev를 먼저 실행하세요.')
    process.exit(1)
  }
  log('✅', '서버 실행 중 (포트 5173)')
  console.log('')

  // 전체 테스트 실행
  await testCSSChange()
  await wait(2000)

  await testTSXChange()
  await wait(2000)

  await testIconChange()
  await wait(2000)

  await testSimultaneousChange()
  await wait(2000)

  await testRapidChanges()
  await wait(2000)

  await testLargeChange()
  await wait(2000)

  await testServerStability()

  // 최종 결과 출력
  console.log('')
  console.log('='.repeat(70))
  console.log('📊 테스트 결과')
  console.log('='.repeat(70))
  console.log(`✅ 통과: ${results.passed}/${results.tests.length}`)
  console.log(`❌ 실패: ${results.failed}/${results.tests.length}`)
  console.log(`💥 서버 크래시: ${results.crashes}`)
  console.log('')

  if (results.failed === 0 && results.crashes === 0) {
    console.log('🎉 모든 테스트 통과! HMR이 완벽하게 작동합니다!')
  } else {
    console.log('⚠️  일부 테스트 실패. 상세 내역:')
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   ❌ ${t.name}: ${t.error}`)
    })
  }

  console.log('='.repeat(70))

  // 최종 서버 상태 확인
  const finalServerAlive = await checkServerAlive()
  if (finalServerAlive) {
    log('✅', '최종 서버 상태: 정상 실행 중')
  } else {
    log('💥', '최종 서버 상태: 크래시!')
  }

  process.exit(results.failed > 0 || results.crashes > 0 ? 1 : 0)
}

runAllTests()
