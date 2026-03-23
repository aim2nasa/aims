/**
 * AI 답변 텍스트에서 문서 참조 링크를 파싱하여 세그먼트로 분할
 *
 * 1차: [[DOC:doc_id|파일명]] 구조화된 마커 파싱 (100% 정확)
 * 2차: 마커가 없으면 기존 파일명 indexOf 매칭으로 fallback (하위 호환)
 */

export type AnswerSegment<T> =
  | { type: 'text'; value: string }
  | { type: 'file'; name: string; result: T }

export interface FileEntry<T> {
  name: string
  docId?: string
  result: T
}

/** [[DOC:doc_id|파일명]] 마커 정규식 */
const DOC_MARKER_RE = /\[\[DOC:([^|]+)\|([^\]]+)\]\]/g

/**
 * AI 답변 텍스트를 문서 참조 기준으로 분할
 *
 * 마커([[DOC:...]]) 방식 우선, 마커 없으면 파일명 매칭 fallback
 *
 * @param answer - AI 답변 텍스트
 * @param fileEntries - 파일명/docId와 결과 객체 배열
 * @returns 텍스트/파일 세그먼트 배열
 */
export function parseAnswerLinks<T>(
  answer: string,
  fileEntries: FileEntry<T>[]
): AnswerSegment<T>[] {
  if (!answer || fileEntries.length === 0) {
    return answer ? [{ type: 'text', value: answer }] : []
  }

  // [[DOC:...]] 마커가 있으면 마커 기반 파싱
  if (answer.includes('[[DOC:')) {
    return _parseWithMarkers(answer, fileEntries)
  }

  // 마커 없음 → 기존 파일명 매칭 fallback (하위 호환)
  return _parseWithFilenames(answer, fileEntries)
}

/**
 * [[DOC:doc_id|파일명]] 마커 기반 파싱
 * doc_id로 결과를 정확히 매칭하므로 파일명 변형에 강건
 */
function _parseWithMarkers<T>(
  answer: string,
  fileEntries: FileEntry<T>[]
): AnswerSegment<T>[] {
  // doc_id → FileEntry 매핑 구축
  const byDocId = new Map<string, FileEntry<T>>()
  for (const entry of fileEntries) {
    if (entry.docId) {
      byDocId.set(entry.docId, entry)
    }
  }

  const segments: AnswerSegment<T>[] = []
  let lastIndex = 0

  // 매칭마다 새 RegExp 인스턴스 필요 (lastIndex 상태 공유 방지)
  const re = new RegExp(DOC_MARKER_RE.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(answer)) !== null) {
    const docId = match[1].trim()
    const markerFilename = match[2].trim()

    // 마커 앞 텍스트
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: answer.slice(lastIndex, match.index) })
    }

    // doc_id로 결과 찾기
    const entry = byDocId.get(docId)
    if (entry) {
      segments.push({ type: 'file', name: entry.name, result: entry.result })
    } else {
      // doc_id가 결과에 없으면 파일명만 텍스트로 표시
      segments.push({ type: 'text', value: markerFilename })
    }

    lastIndex = match.index + match[0].length
  }

  // 나머지 텍스트
  if (lastIndex < answer.length) {
    segments.push({ type: 'text', value: answer.slice(lastIndex) })
  }

  return segments
}

/**
 * 파일명 기반 fallback 파싱 (하위 호환)
 * 기존 방식: results의 실제 파일명을 String.indexOf로 매칭
 */
function _parseWithFilenames<T>(
  answer: string,
  fileEntries: FileEntry<T>[]
): AnswerSegment<T>[] {
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
