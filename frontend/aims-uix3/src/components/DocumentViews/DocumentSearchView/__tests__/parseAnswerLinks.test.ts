/**
 * parseAnswerLinks — AI 답변 내 문서 링크 파싱 regression 테스트
 *
 * 정규식 기반 파싱에서 발생했던 문제를 방지:
 * - 공백 포함 파일명 매칭 실패
 * - 부분 매칭으로 잘못된 링크 생성
 */

import { describe, it, expect } from 'vitest'
import { parseAnswerLinks, type FileEntry } from '../utils/parseAnswerLinks'

// 테스트용 결과 객체
const makeResult = (id: string) => ({ id })

describe('parseAnswerLinks', () => {
  it('공백 포함 파일명을 정확히 매칭한다', () => {
    const answer = '관련 문서는 운전자보험설계서 및 증권_곽승철님.pdf를 참고하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '운전자보험설계서 및 증권_곽승철님.pdf', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '관련 문서는 ' },
      { type: 'file', name: '운전자보험설계서 및 증권_곽승철님.pdf', result: { id: 'doc1' } },
      { type: 'text', value: '를 참고하세요.' }
    ])
  })

  it('긴 파일명이 짧은 파일명보다 우선 매칭된다 (부분 매칭 방지)', () => {
    const answer = '곽승철님-운전자보험설계서-20220307.pdf에서 확인됩니다.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '20220307.pdf', result: makeResult('short') },
      { name: '곽승철님-운전자보험설계서-20220307.pdf', result: makeResult('long') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    // 긴 파일명이 전체 매칭되어야 함 (짧은 파일명으로 쪼개지면 안 됨)
    expect(segments).toEqual([
      { type: 'file', name: '곽승철님-운전자보험설계서-20220307.pdf', result: { id: 'long' } },
      { type: 'text', value: '에서 확인됩니다.' }
    ])
  })

  it('동일 파일명이 여러 번 등장하면 모두 링크된다', () => {
    const answer = '보고서.pdf 참고. 다시 보고서.pdf 확인.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '보고서.pdf', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)
    const fileSegments = segments.filter(s => s.type === 'file')

    expect(fileSegments).toHaveLength(2)
  })

  it('results에 없는 파일명은 링크되지 않는다 (거짓 양성 없음)', () => {
    const answer = '존재하지않는문서.pdf를 참고하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '다른문서.pdf', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    // 전체가 텍스트여야 함
    expect(segments).toEqual([
      { type: 'text', value: '존재하지않는문서.pdf를 참고하세요.' }
    ])
  })

  it('괄호 안의 파일명도 정확히 매칭한다', () => {
    const answer = '기록이 있습니다(곽승철자동차.jpg).'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '곽승철자동차.jpg', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '기록이 있습니다(' },
      { type: 'file', name: '곽승철자동차.jpg', result: { id: 'doc1' } },
      { type: 'text', value: ').' }
    ])
  })

  it('여러 파일이 한 문장에 있어도 모두 매칭된다', () => {
    const answer = '곽승철님-설계서.pdf와 보험증권-곽승철님.pdf를 확인하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '곽승철님-설계서.pdf', result: makeResult('doc1') },
      { name: '보험증권-곽승철님.pdf', result: makeResult('doc2') }
    ]

    const segments = parseAnswerLinks(answer, entries)
    const fileSegments = segments.filter(s => s.type === 'file')

    expect(fileSegments).toHaveLength(2)
    expect(fileSegments[0]).toMatchObject({ name: '곽승철님-설계서.pdf' })
    expect(fileSegments[1]).toMatchObject({ name: '보험증권-곽승철님.pdf' })
  })

  it('빈 answer는 빈 배열을 반환한다', () => {
    expect(parseAnswerLinks('', [{ name: 'test.pdf', result: makeResult('1') }])).toEqual([])
  })

  it('빈 fileEntries는 전체를 텍스트로 반환한다', () => {
    const segments = parseAnswerLinks('답변 텍스트', [])

    expect(segments).toEqual([{ type: 'text', value: '답변 텍스트' }])
  })
})
