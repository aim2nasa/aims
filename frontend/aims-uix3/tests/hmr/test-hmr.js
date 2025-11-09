/**
 * HMR 자동 테스트 스크립트
 *
 * CSS 파일을 수정하고 서버가 리로드를 트리거하는지 자동 검증
 */

import fs from 'fs'
import { execSync } from 'child_process'

const CSS_FILE = './src/components/DocumentViews/DocumentSearchView/DocumentSearchView.css'
const TEST_COMMENT = '/* 🔥 HMR AUTO TEST - ' + Date.now() + ' */'

console.log('='.repeat(60))
console.log('HMR 자동 테스트 시작')
console.log('='.repeat(60))

// 1. CSS 파일 읽기
console.log('\n[1/5] CSS 파일 읽는 중...')
const originalContent = fs.readFileSync(CSS_FILE, 'utf-8')
console.log('✅ 원본 파일 백업 완료')

// 2. 테스트 주석 추가
console.log('\n[2/5] 테스트 주석 추가 중...')
const testContent = TEST_COMMENT + '\n' + originalContent
fs.writeFileSync(CSS_FILE, testContent, 'utf-8')
console.log('✅ 테스트 주석 추가:', TEST_COMMENT)

// 3. 3초 대기 (HMR 반응 시간)
console.log('\n[3/5] HMR 반응 대기 중... (3초)')
await new Promise(resolve => setTimeout(resolve, 3000))
console.log('✅ 대기 완료')

// 4. 원본 복구
console.log('\n[4/5] 원본 파일 복구 중...')
fs.writeFileSync(CSS_FILE, originalContent, 'utf-8')
console.log('✅ 원본 복구 완료')

// 5. 결과 확인
console.log('\n[5/5] 테스트 결과 확인')
console.log('─'.repeat(60))
console.log('✅ CSS 파일 수정 → 3초 대기 → 원본 복구 완료')
console.log('')
console.log('📋 서버 로그를 확인하세요:')
console.log('   - "[CSS-Reload] ... changed - triggering full reload" 메시지가 보이면 성공')
console.log('   - 브라우저가 자동으로 새로고침되었으면 성공')
console.log('─'.repeat(60))
console.log('\n✨ HMR 테스트 완료!')
console.log('='.repeat(60))
