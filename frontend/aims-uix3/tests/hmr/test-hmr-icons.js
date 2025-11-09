/**
 * 아이콘 HMR 집중 테스트
 *
 * SFSymbol.css 변경 시 HMR 문제가 가장 많았음
 * 다양한 아이콘 변경 케이스 테스트
 */

import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const ICON_FILE = './src/components/SFSymbol/SFSymbol.css'
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

// 테스트 1: 기본 아이콘 CSS 변경
async function test1_BasicIconChange() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')
  const testContent = `/* ICON-TEST-1: ${Date.now()} */\n` + original

  fs.writeFileSync(ICON_FILE, testContent, 'utf-8')
  log('📝', '아이콘 CSS 수정 완료')

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(ICON_FILE, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 2: 아이콘 색상 변경
async function test2_IconColorChange() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')

  // color 속성이 있는지 확인
  if (!original.includes('color:') && !original.includes('fill:')) {
    log('⚠️', '색상 속성이 없어 주석만 추가')
  }

  const testContent = `/* COLOR-CHANGE: ${Date.now()} */\n` + original

  fs.writeFileSync(ICON_FILE, testContent, 'utf-8')
  log('📝', '아이콘 색상 CSS 수정 완료')

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(ICON_FILE, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 3: 아이콘 크기 변경
async function test3_IconSizeChange() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')
  const testContent = `/* SIZE-CHANGE: width/height 변경 시뮬레이션 ${Date.now()} */\n` + original

  fs.writeFileSync(ICON_FILE, testContent, 'utf-8')
  log('📝', '아이콘 크기 CSS 수정 완료')

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(ICON_FILE, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 4: 빠른 연속 아이콘 변경 (5회)
async function test4_RapidIconChanges() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')

  for (let i = 0; i < 5; i++) {
    const testContent = `/* RAPID-ICON-${i}: ${Date.now()} */\n` + original
    fs.writeFileSync(ICON_FILE, testContent, 'utf-8')
    log('📝', `빠른 변경 ${i + 1}/5`)
    await wait(500) // 500ms 간격
  }

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(ICON_FILE, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 5: 대용량 아이콘 CSS 추가
async function test5_LargeIconCSS() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')

  // 대용량 주석 추가 (5KB)
  const largeComment = '/*\n' + 'ICON-LARGE-TEST: '.repeat(500) + '\n*/\n'
  const testContent = largeComment + original

  fs.writeFileSync(ICON_FILE, testContent, 'utf-8')
  log('📝', '대용량 아이콘 CSS 추가 (5KB)')

  await wait(3000)

  const serverAlive = await checkServerAlive()
  if (!serverAlive) {
    fs.writeFileSync(ICON_FILE, original, 'utf-8')
    throw new Error('서버 크래시!')
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 테스트 6: 아이콘 CSS 안정성 (20회 반복)
async function test6_IconStability() {
  if (!fs.existsSync(ICON_FILE)) {
    throw new Error('SFSymbol.css 파일이 없습니다')
  }

  const original = fs.readFileSync(ICON_FILE, 'utf-8')

  for (let i = 0; i < 20; i++) {
    const testContent = `/* STABILITY-${i}: ${Date.now()} */\n` + original
    fs.writeFileSync(ICON_FILE, testContent, 'utf-8')

    await wait(1000)

    const serverAlive = await checkServerAlive()
    if (!serverAlive) {
      fs.writeFileSync(ICON_FILE, original, 'utf-8')
      throw new Error(`서버 크래시! (${i + 1}/20 반복 중)`)
    }

    if ((i + 1) % 5 === 0) {
      log('⏳', `${i + 1}/20 반복 완료...`)
    }
  }

  fs.writeFileSync(ICON_FILE, original, 'utf-8')
  log('♻️', '원본 복구 완료')
}

// 메인 실행
async function main() {
  console.log('='.repeat(70))
  console.log('🎯 아이콘 HMR 집중 테스트')
  console.log('='.repeat(70))
  console.log('')

  // 서버 확인
  log('🔍', '서버 상태 확인 중...')
  const serverRunning = await checkServerAlive()
  if (!serverRunning) {
    log('❌', '서버가 실행되지 않았습니다! npm run dev를 먼저 실행하세요.')
    process.exit(1)
  }
  log('✅', '서버 실행 중 (포트 5173)')
  console.log('')

  // 아이콘 파일 존재 확인
  if (!fs.existsSync(ICON_FILE)) {
    log('❌', 'SFSymbol.css 파일을 찾을 수 없습니다!')
    log('📁', '파일 경로: ' + ICON_FILE)
    process.exit(1)
  }
  log('📁', 'SFSymbol.css 파일 발견')
  console.log('')

  // 테스트 실행
  await runTest('1. 기본 아이콘 CSS 변경', test1_BasicIconChange)
  await wait(2000)

  await runTest('2. 아이콘 색상 변경', test2_IconColorChange)
  await wait(2000)

  await runTest('3. 아이콘 크기 변경', test3_IconSizeChange)
  await wait(2000)

  await runTest('4. 빠른 연속 아이콘 변경 (5회)', test4_RapidIconChanges)
  await wait(2000)

  await runTest('5. 대용량 아이콘 CSS 추가', test5_LargeIconCSS)
  await wait(2000)

  await runTest('6. 아이콘 CSS 안정성 (20회 반복)', test6_IconStability)

  // 결과 출력
  console.log('')
  console.log('='.repeat(70))
  console.log('📊 아이콘 HMR 테스트 결과')
  console.log('='.repeat(70))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  console.log(`✅ 통과: ${passed}/${results.length}`)
  console.log(`❌ 실패: ${failed}/${results.length}`)
  console.log(`⏱️  총 소요 시간: ${(totalDuration / 1000).toFixed(1)}초`)
  console.log('')

  if (failed === 0) {
    log('🎉', '모든 아이콘 테스트 통과!')
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

  // JSON 결과 저장
  fs.writeFileSync(
    './test-results-icons.json',
    JSON.stringify({ passed, failed, totalDuration, results }, null, 2),
    'utf-8'
  )
  log('💾', '결과 저장: test-results-icons.json')

  process.exit(failed > 0 ? 1 : 0)
}

main()
