/**
 * InlineRenameInput
 * Finder 스타일 인라인 파일명 편집 컴포넌트
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'

interface InlineRenameInputProps {
  currentName: string
  onConfirm: (newName: string) => void
  onCancel: () => void
}

export const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  currentName,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    // 확장자 앞까지만 선택 (Finder 스타일)
    const dotIndex = currentName.lastIndexOf('.')
    if (dotIndex > 0) {
      input.setSelectionRange(0, dotIndex)
    } else {
      input.select()
    }
  }, [currentName])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed === currentName) {
      onCancel()
      return
    }
    onConfirm(trimmed)
  }, [value, currentName, onConfirm, onCancel])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }, [handleSubmit, onCancel])

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      maxLength={200}
    />
  )
}
