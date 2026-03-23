/**
 * AI 답변 텍스트에서 검색 결과의 실제 파일명을 찾아 링크 세그먼트로 분할
 *
 * 정규식 기반 파싱은 공백/특수문자 포함 파일명에서 깨지므로,
 * results의 실제 파일명을 String.indexOf로 정확히 매칭하는 방식 사용.
 */

export type AnswerSegment<T> =
  | { type: 'text'; value: string }
  | { type: 'file'; name: string; result: T }

export interface FileEntry<T> {
  name: string
  result: T
}

/**
 * AI 답변 텍스트를 파일명 기준으로 분할
 *
 * @param answer - AI 답변 텍스트
 * @param fileEntries - 파일명과 결과 객체 배열 (긴 이름부터 정렬됨)
 * @returns 텍스트/파일 세그먼트 배열
 */
export function parseAnswerLinks<T>(
  answer: string,
  fileEntries: FileEntry<T>[]
): AnswerSegment<T>[] {
  if (!answer || fileEntries.length === 0) {
    return answer ? [{ type: 'text', value: answer }] : []
  }

  // 긴 파일명부터 매칭 (부분 매칭 방지)
  const sorted = [...fileEntries].sort((a, b) => b.name.length - a.name.length)

  let segments: AnswerSegment<T>[] = [{ type: 'text', value: answer }]

  for (const entry of sorted) {
    const next: AnswerSegment<T>[] = []
    for (const seg of segments) {
      if (seg.type !== 'text') { next.push(seg); continue }
      const text = seg.value
      let cursor = 0
      let idx = text.indexOf(entry.name, cursor)
      while (idx !== -1) {
        if (idx > cursor) next.push({ type: 'text', value: text.slice(cursor, idx) })
        next.push({ type: 'file', name: entry.name, result: entry.result })
        cursor = idx + entry.name.length
        idx = text.indexOf(entry.name, cursor)
      }
      if (cursor < text.length) next.push({ type: 'text', value: text.slice(cursor) })
    }
    segments = next
  }

  return segments
}
