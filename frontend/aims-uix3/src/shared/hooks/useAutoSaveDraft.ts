/**
 * useAutoSaveDraft - 폼 데이터 자동 임시저장 훅
 * 입력 중인 데이터를 localStorage에 자동 저장하여 데이터 손실 방지
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export interface DraftData<T> {
  data: T
  savedAt: number
  version: number
}

export interface UseAutoSaveDraftOptions<T> {
  /** localStorage 저장 키 */
  key: string
  /** 초기 데이터 (draft가 없을 때 사용) */
  initialData: T
  /** 자동 저장 딜레이 (ms) - 기본값 1000ms */
  debounceMs?: number
  /** 드래프트 만료 시간 (ms) - 기본값 24시간 */
  expirationMs?: number
  /** 저장 시 콜백 */
  onSave?: (data: T) => void
  /** 복원 시 콜백 */
  onRestore?: (data: T) => void
  /** 버전 (호환성 체크용) */
  version?: number
}

export interface UseAutoSaveDraftReturn<T> {
  /** 현재 데이터 */
  data: T
  /** 데이터 업데이트 */
  setData: (data: T | ((prev: T) => T)) => void
  /** 드래프트가 존재하는지 여부 */
  hasDraft: boolean
  /** 마지막 저장 시간 */
  lastSavedAt: number | null
  /** 저장 중인지 여부 */
  isSaving: boolean
  /** 드래프트 복원 */
  restoreDraft: () => T | null
  /** 드래프트 삭제 */
  clearDraft: () => void
  /** 즉시 저장 */
  saveNow: () => void
  /** 수동으로 dirty 상태 설정 */
  setIsDirty: (dirty: boolean) => void
  /** 변경 사항이 있는지 여부 */
  isDirty: boolean
}

const DEFAULT_DEBOUNCE_MS = 1000
const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000 // 24시간
const CURRENT_VERSION = 1

/**
 * useAutoSaveDraft - 폼 데이터 자동 임시저장
 *
 * @example
 * ```tsx
 * const { data, setData, hasDraft, restoreDraft, clearDraft } = useAutoSaveDraft({
 *   key: 'customer-registration-draft',
 *   initialData: { name: '', email: '', phone: '' },
 *   debounceMs: 1000,
 *   onSave: (data) => console.log('저장됨:', data)
 * })
 *
 * // 드래프트가 있으면 복원 확인
 * useEffect(() => {
 *   if (hasDraft) {
 *     if (confirm('작성 중인 내용이 있습니다. 복원하시겠습니까?')) {
 *       restoreDraft()
 *     } else {
 *       clearDraft()
 *     }
 *   }
 * }, [])
 *
 * // 폼 제출 후 드래프트 삭제
 * const handleSubmit = async () => {
 *   await submitForm(data)
 *   clearDraft()
 * }
 * ```
 */
export function useAutoSaveDraft<T>({
  key,
  initialData,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  expirationMs = DEFAULT_EXPIRATION_MS,
  onSave,
  onRestore,
  version = CURRENT_VERSION,
}: UseAutoSaveDraftOptions<T>): UseAutoSaveDraftReturn<T> {
  const [data, setDataInternal] = useState<T>(initialData)
  const [hasDraft, setHasDraft] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initializedRef = useRef(false)

  // localStorage 키 생성
  const storageKey = `aims-draft-${key}`

  // 드래프트 저장
  const saveDraft = useCallback((dataToSave: T) => {
    try {
      const draft: DraftData<T> = {
        data: dataToSave,
        savedAt: Date.now(),
        version,
      }
      localStorage.setItem(storageKey, JSON.stringify(draft))
      setLastSavedAt(draft.savedAt)
      setIsSaving(false)
      onSave?.(dataToSave)

      if (import.meta.env.DEV) {
        console.log(`[AutoSaveDraft] 저장됨: ${key}`)
      }
    } catch (error) {
      console.error('[AutoSaveDraft] 저장 실패:', error)
      setIsSaving(false)
    }
  }, [storageKey, version, onSave, key])

  // 드래프트 로드
  const loadDraft = useCallback((): DraftData<T> | null => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return null

      const draft = JSON.parse(stored) as DraftData<T>

      // 버전 체크
      if (draft.version !== version) {
        if (import.meta.env.DEV) {
          console.log(`[AutoSaveDraft] 버전 불일치로 드래프트 삭제: ${draft.version} !== ${version}`)
        }
        localStorage.removeItem(storageKey)
        return null
      }

      // 만료 체크
      if (Date.now() - draft.savedAt > expirationMs) {
        if (import.meta.env.DEV) {
          console.log('[AutoSaveDraft] 만료된 드래프트 삭제')
        }
        localStorage.removeItem(storageKey)
        return null
      }

      return draft
    } catch (error) {
      console.error('[AutoSaveDraft] 로드 실패:', error)
      localStorage.removeItem(storageKey)
      return null
    }
  }, [storageKey, version, expirationMs])

  // 초기화 - 드래프트 존재 여부 확인
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const draft = loadDraft()
    if (draft) {
      setHasDraft(true)
      setLastSavedAt(draft.savedAt)
    }
  }, [loadDraft])

  // 데이터 변경 시 자동 저장 (디바운스)
  useEffect(() => {
    if (!isDirty) return

    // 기존 타이머 취소
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setIsSaving(true)

    // 새 타이머 설정
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(data)
    }, debounceMs)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [data, isDirty, debounceMs, saveDraft])

  // 데이터 업데이트
  const setData = useCallback((newData: T | ((prev: T) => T)) => {
    setDataInternal(prev => {
      const updated = typeof newData === 'function'
        ? (newData as (prev: T) => T)(prev)
        : newData
      return updated
    })
    setIsDirty(true)
    setHasDraft(true)
  }, [])

  // 드래프트 복원
  const restoreDraft = useCallback((): T | null => {
    const draft = loadDraft()
    if (draft) {
      setDataInternal(draft.data)
      setLastSavedAt(draft.savedAt)
      setIsDirty(false)
      onRestore?.(draft.data)

      if (import.meta.env.DEV) {
        console.log(`[AutoSaveDraft] 복원됨: ${key}`)
      }

      return draft.data
    }
    return null
  }, [loadDraft, onRestore, key])

  // 드래프트 삭제
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      setHasDraft(false)
      setLastSavedAt(null)
      setIsDirty(false)
      setDataInternal(initialData)

      if (import.meta.env.DEV) {
        console.log(`[AutoSaveDraft] 삭제됨: ${key}`)
      }
    } catch (error) {
      console.error('[AutoSaveDraft] 삭제 실패:', error)
    }
  }, [storageKey, initialData, key])

  // 즉시 저장
  const saveNow = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveDraft(data)
  }, [saveDraft, data])

  // 컴포넌트 언마운트 시 저장
  useEffect(() => {
    return () => {
      if (isDirty && saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        // 동기적으로 저장 시도
        try {
          const draft: DraftData<T> = {
            data,
            savedAt: Date.now(),
            version,
          }
          localStorage.setItem(storageKey, JSON.stringify(draft))
        } catch {
          // 무시
        }
      }
    }
  }, [data, isDirty, storageKey, version])

  return {
    data,
    setData,
    hasDraft,
    lastSavedAt,
    isSaving,
    restoreDraft,
    clearDraft,
    saveNow,
    setIsDirty,
    isDirty,
  }
}

export default useAutoSaveDraft
