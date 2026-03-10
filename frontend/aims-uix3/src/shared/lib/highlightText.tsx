import React from 'react'

/**
 * 검색어 매칭 부분을 <mark>로 감싸는 공통 유틸리티
 * 대소문자 무시, 복수 매칭 지원
 *
 * @example
 * highlightText("보험금 청구서.pdf", "보험")
 * // → <><mark className="search-match">보험</mark>금 청구서.pdf</>
 */
export function highlightText(
  text: string,
  query: string,
  className = 'search-match'
): React.ReactNode {
  if (!query || !text) return text

  const trimmed = query.trim()
  if (!trimmed) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()

  if (!lowerText.includes(lowerQuery)) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let matchIndex = lowerText.indexOf(lowerQuery)
  let keyIndex = 0

  while (matchIndex !== -1) {
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex))
    }
    parts.push(
      <mark key={keyIndex++} className={className}>
        {text.slice(matchIndex, matchIndex + lowerQuery.length)}
      </mark>
    )
    lastIndex = matchIndex + lowerQuery.length
    matchIndex = lowerText.indexOf(lowerQuery, lastIndex)
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}
