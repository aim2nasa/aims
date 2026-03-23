/**
 * parseAnswerLinks — AI 답변 내 문서 링크 파싱 regression 테스트
 *
 * 2가지 모드 테스트:
 * 1. [[DOC:doc_id|파일명]] 마커 기반 파싱 (신규)
 * 2. 파일명 매칭 fallback (하위 호환)
 */

import { describe, it, expect } from 'vitest'
import { parseAnswerLinks, type FileEntry } from '../utils/parseAnswerLinks'

// 테스트용 결과 객체
const makeResult = (id: string) => ({ id })

describe('parseAnswerLinks — 마커 기반 파싱', () => {
  it('[[DOC:doc_id|파일명]] 마커를 정확히 파싱한다', () => {
    const answer = '보험료는 73,230원입니다 [[DOC:abc123|계약서_홍길동.pdf]]'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '계약서_홍길동.pdf', docId: 'abc123', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '보험료는 73,230원입니다 ' },
      { type: 'file', name: '계약서_홍길동.pdf', result: { id: 'doc1' } }
    ])
  })

  it('여러 마커가 있으면 모두 파싱한다', () => {
    const answer = '보험료 [[DOC:id1|설계서.pdf]]와 보장 내용 [[DOC:id2|증권.pdf]]을 확인하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '설계서.pdf', docId: 'id1', result: makeResult('doc1') },
      { name: '증권.pdf', docId: 'id2', result: makeResult('doc2') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '보험료 ' },
      { type: 'file', name: '설계서.pdf', result: { id: 'doc1' } },
      { type: 'text', value: '와 보장 내용 ' },
      { type: 'file', name: '증권.pdf', result: { id: 'doc2' } },
      { type: 'text', value: '을 확인하세요.' }
    ])
  })

  it('doc_id가 결과에 없으면 파일명만 텍스트로 표시한다', () => {
    const answer = '참고: [[DOC:unknown_id|알수없는문서.pdf]]'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '다른문서.pdf', docId: 'other_id', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '참고: ' },
      { type: 'text', value: '알수없는문서.pdf' }
    ])
  })

  it('AI가 파일명을 변형해도 doc_id로 정확히 매칭한다', () => {
    // AI가 마커 안의 파일명을 축약했지만 doc_id가 정확하면 원본 파일명으로 매칭
    const answer = '확인 결과 [[DOC:abc123|계약서_축약.pdf]]입니다.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '운전자보험설계서 및 증권_홍길동님.pdf', docId: 'abc123', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    // doc_id가 일치하므로 entry의 원본 name으로 링크 생성
    expect(segments).toEqual([
      { type: 'text', value: '확인 결과 ' },
      { type: 'file', name: '운전자보험설계서 및 증권_홍길동님.pdf', result: { id: 'doc1' } },
      { type: 'text', value: '입니다.' }
    ])
  })

  it('동일 doc_id 마커가 여러 번 등장하면 모두 링크된다', () => {
    const answer = '[[DOC:id1|보고서.pdf]] 참고. 다시 [[DOC:id1|보고서.pdf]] 확인.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '보고서.pdf', docId: 'id1', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)
    const fileSegments = segments.filter(s => s.type === 'file')

    expect(fileSegments).toHaveLength(2)
  })
})

describe('parseAnswerLinks — 파일명 fallback (하위 호환)', () => {
  it('공백 포함 파일명을 정확히 매칭한다', () => {
    const answer = '관련 문서는 운전자보험설계서 및 증권_홍길동님.pdf를 참고하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '운전자보험설계서 및 증권_홍길동님.pdf', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '관련 문서는 ' },
      { type: 'file', name: '운전자보험설계서 및 증권_홍길동님.pdf', result: { id: 'doc1' } },
      { type: 'text', value: '를 참고하세요.' }
    ])
  })

  it('긴 파일명이 짧은 파일명보다 우선 매칭된다 (부분 매칭 방지)', () => {
    const answer = '홍길동님-운전자보험설계서-20220307.pdf에서 확인됩니다.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '20220307.pdf', result: makeResult('short') },
      { name: '홍길동님-운전자보험설계서-20220307.pdf', result: makeResult('long') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    // 긴 파일명이 전체 매칭되어야 함 (짧은 파일명으로 쪼개지면 안 됨)
    expect(segments).toEqual([
      { type: 'file', name: '홍길동님-운전자보험설계서-20220307.pdf', result: { id: 'long' } },
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
    const answer = '기록이 있습니다(홍길동자동차.jpg).'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '홍길동자동차.jpg', result: makeResult('doc1') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    expect(segments).toEqual([
      { type: 'text', value: '기록이 있습니다(' },
      { type: 'file', name: '홍길동자동차.jpg', result: { id: 'doc1' } },
      { type: 'text', value: ').' }
    ])
  })

  it('여러 파일이 한 문장에 있어도 모두 매칭된다', () => {
    const answer = '홍길동님-설계서.pdf와 보험증권-홍길동님.pdf를 확인하세요.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '홍길동님-설계서.pdf', result: makeResult('doc1') },
      { name: '보험증권-홍길동님.pdf', result: makeResult('doc2') }
    ]

    const segments = parseAnswerLinks(answer, entries)
    const fileSegments = segments.filter(s => s.type === 'file')

    expect(fileSegments).toHaveLength(2)
    expect(fileSegments[0]).toMatchObject({ name: '홍길동님-설계서.pdf' })
    expect(fileSegments[1]).toMatchObject({ name: '보험증권-홍길동님.pdf' })
  })
})

describe('parseAnswerLinks — 엣지 케이스', () => {
  it('빈 answer는 빈 배열을 반환한다', () => {
    expect(parseAnswerLinks('', [{ name: 'test.pdf', result: makeResult('1') }])).toEqual([])
  })

  it('빈 fileEntries는 전체를 텍스트로 반환한다', () => {
    const segments = parseAnswerLinks('답변 텍스트', [])

    expect(segments).toEqual([{ type: 'text', value: '답변 텍스트' }])
  })

  it('마커와 일반 텍스트 파일명이 혼재하면 마커 방식을 사용한다', () => {
    // [[DOC:...]]가 있으면 마커 모드 진입 → 일반 텍스트 파일명은 링크 안 됨
    const answer = '보험료 [[DOC:id1|설계서.pdf]] 참고. 증권.pdf도 확인.'
    const entries: FileEntry<{ id: string }>[] = [
      { name: '설계서.pdf', docId: 'id1', result: makeResult('doc1') },
      { name: '증권.pdf', docId: 'id2', result: makeResult('doc2') }
    ]

    const segments = parseAnswerLinks(answer, entries)

    // 마커 모드이므로 '증권.pdf'는 마커 없이 등장 → 텍스트로 처리
    expect(segments).toEqual([
      { type: 'text', value: '보험료 ' },
      { type: 'file', name: '설계서.pdf', result: { id: 'doc1' } },
      { type: 'text', value: ' 참고. 증권.pdf도 확인.' }
    ])
  })
})
